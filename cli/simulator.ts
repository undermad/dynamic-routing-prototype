// Core front in a terminal. It walks the same journey as the website, asks the same
// questions with the same answers (both come from the shared journey), and talks to the
// engine over HTTP in the same way. What it adds is a view of everything the engine will
// see before each decision, and of what the engine decided.
import { randomUUID } from 'node:crypto';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  answerPage,
  askedOn,
  askEngine,
  createEngineClient,
  currentPage,
  EngineClient,
  failureNotice,
  identityShown,
  IdentityShown,
  LEVEL_QUESTION,
  LEVELS,
  Page,
  Session,
  startSession,
  takeEngineResult
} from '../shared/journey/journey';
import { describeAvailability, targetProfilesFor } from '../engine/engine';
import { buildScores } from '../shared/gpg45';
import { Action, EngineResult } from '../shared/types';
import { answerOn, Say } from './prompts';
import * as render from './render';
import { parseSelection, Prompter } from './selection';
import * as terminal from './terminal';

const rl = readline.createInterface({ input, output });

const menu = (options: readonly string[]): string =>
  options
    .map((option, index) => `  ${terminal.dim(`${index + 1}`.padStart(2))}  ${option}`)
    .join('\n');

const ask = async (prompt: string, options: readonly string[]): Promise<number> => {
  while (true) {
    const answer = await rl.question(
      `${terminal.question(prompt)}\n${menu(options)}\n${terminal.cursor()}`
    );
    const index = parseInt(answer, 10) - 1;
    if (options[index] !== undefined) return index;
    console.log(terminal.warn('Invalid choice, try again.'));
  }
};

// A multiple-choice question: the user types the number of every option that applies, run
// together — 13 for the first and third. The last option is "none of the above", and the
// question is asked again if it is picked along with anything else.
const askMany = async (prompt: string, options: readonly string[]): Promise<number[]> => {
  const hint = terminal.dim('  Type the number of every one that applies, for example 13.');

  while (true) {
    const answer = await rl.question(
      `${terminal.question(prompt)}\n${menu(options)}\n${hint}\n${terminal.cursor()}`
    );
    const selection = parseSelection(answer, options.length);
    if ('selected' in selection) return selection.selected;
    console.log(terminal.warn(`${selection.error} Try again.`));
  }
};

const prompter: Prompter = { one: ask, many: askMany };

// Text on a page that is there to be read: the first line stands out, the rest follow it.
const say: Say = ([first, ...rest]) => {
  console.log(terminal.prompt(first));
  for (const line of rest) console.log(`  ${line}`);
};

// Everything the engine will see on the next call, laid out before it is asked. The point
// is that the decision which follows should be explainable from what is on screen.
const printState = async (session: Session, engine: EngineClient, step: number) => {
  const stored = await engine.credentials(session.userId);
  const scores = buildScores(stored);
  const targets = targetProfilesFor(session.requiredLevelOfConfidence, stored);

  console.log(
    terminal.banner(
      `STEP ${step}`,
      `${session.requiredLevelOfConfidence} · ${session.userId} · ${stored.length} VC(s)`
    )
  );

  console.log(terminal.rule('Scores held, against every target profile'));
  terminal.print(render.identityScores(scores, targets));

  console.log(terminal.rule(`EVCS — ${stored.length} credential(s)`));
  terminal.print(render.credentials(stored));

  console.log(terminal.rule('Capabilities core-front has collected'));
  terminal.print(render.capabilities(session.capabilities));

  console.log(terminal.rule('CRI availability by group — weight, state, and the most each could award'));
  terminal.print(render.availability(describeAvailability(session.capabilities, session.attempted), session.attempted));
};

// What the engine answered, before the page it leads to.
const printDecision = (result: EngineResult) => {
  switch (result.action) {
    case Action.COMPLETE:
      console.log(terminal.decision(`complete — ${result.message}`));
      return;

    case Action.STOP:
      console.log(terminal.decision('stop'));
      return;

    case Action.ASK:
      console.log(
        terminal.decision(`ask the user — ${result.questions.length} question(s) in one batch`)
      );
      console.log(terminal.rule('Questions in this batch, in the order they are asked'));
      terminal.print(render.routeQuestions(result.questions, result.otherwise));
      return;

    case Action.REDIRECT:
      console.log(terminal.decision(`redirect — ${result.options.length} option(s) offered`));
      terminal.print(render.options(result.options));
  }
};

// What the identity is made of. The engine's answer does not carry it, so it is read from
// the identity stub, as the website does for its last page.
const printIdentity = ({ tag, banner, caption, title, identity }: IdentityShown) => {
  console.log(terminal.banner(title.toUpperCase(), caption));
  console.log(terminal.dim(`  [${tag}] ${banner}\n`));

  console.log(terminal.rule('Scores'));
  terminal.print(
    render.identityScores(
      identity.scores,
      targetProfilesFor(identity.levelOfConfidence, identity.credentials)
    )
  );

  console.log(terminal.rule('Credentials held in EVCS'));
  terminal.print(render.credentials(identity.credentials));
  console.log();
};

const isBatchPage = (page: Page): boolean => page.kind === 'choose-way' || page.kind === 'question';

const simulateJourney = async () => {
  console.log(terminal.banner('DYNAMIC IPV'));
  console.log(
    terminal.dim(
      '  A CLI simulation of a dynamic identity journey. The engine plans a route to a\n' +
        '  target profile from what is in EVCS and what the user says they have.\n'
    )
  );

  // The engine runs as its own process and holds EVCS. Each run is a new user, because the
  // engine keeps a user's credentials for as long as it is up.
  const engine = createEngineClient();
  console.log(terminal.dim(`  Engine: ${engine.url}\n`));

  const level = await answerOn(LEVEL_QUESTION, prompter, say);
  const requiredLevelOfConfidence = LEVELS[level && 'index' in level ? level.index : 0];

  let session = startSession(`user-${randomUUID().slice(0, 8)}`, requiredLevelOfConfidence);

  // Ask the engine before collecting anything. The feasibility check does not depend on
  // the user's capabilities, so if the requested level of confidence is out of reach for
  // everyone there is no point putting them through triage first.
  const feasibility = await askEngine(session, engine);
  if (feasibility.result.action === Action.STOP) {
    printDecision(feasibility.result);
    session = takeEngineResult(session, feasibility.result);
  } else {
    console.log(terminal.rule(`Triage — targeting ${requiredLevelOfConfidence}`));
  }

  let step = 0;
  let asked = 0;
  let cameFromBatch = false;

  // Kiro did it and I like it (ancient and risky infinite loop)
  for (;;) {
    const page = currentPage(session);

    // With nothing pending the engine is asked what comes next.
    if (page.kind === 'ask-engine') {
      if (++asked > 3) throw new Error('The engine keeps answering with nothing to do.');

      await printState(session, engine, ++step);

      const { result } = await askEngine(session, engine);
      printDecision(result);
      session = takeEngineResult(session, result);
      cameFromBatch = false;
      continue;
    }

    asked = 0;

    if (page.kind === 'result') {
      const identity = await engine.identity(session.userId, session.requiredLevelOfConfidence);
      printIdentity(identityShown(identity));
      break;
    }

    // Where the user goes after a batch can come with the batch, saving a call.
    if (cameFromBatch && !isBatchPage(page)) {
      console.log(terminal.dim('\n  Carried in the batch — the engine was not asked again.'));
    }

    const notice = failureNotice(page, session.failed);
    if (notice) console.log(`\n  ${terminal.warn(notice)}`);

    const submitted = await answerOn(askedOn(page), prompter, say);
    if (!submitted) break;

    cameFromBatch = isBatchPage(page);
    session = await answerPage(session, page, submitted, engine);
  }

  console.log();
  rl.close();
};

simulateJourney().catch(error => {
  console.error(`\n${terminal.warn(error instanceof Error ? error.message : String(error))}\n`);
  rl.close();
  process.exitCode = 1;
});
