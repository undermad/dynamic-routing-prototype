// Fills in what each page asks the user: its wording, hints and options. See asked.ts for
// the shapes.
import { CRI_CHECKS } from '../checks';
import { resolveScores } from '../gpg45';
import { CapabilityQuestionKind, CriId, DocumentType, IdentityResult, LevelOfConfidence } from '../types';
import {
  Asked,
  AskedChoice,
  AskedDocuments,
  AskedStub,
  Choice,
  IdentityShown
} from './asked';
import { hasSeveralDocuments } from './batch';
import { checkOptions } from './cri-stub';
import { CRI_LABELS, CRI_NAMES, titled } from './labels';
import { CANNOT_USE_ANY, HOW_TO_PROVE_IDENTITY, wayChecks, wayName, wayNeeds } from './wording';
import { NONE_OF_THE_ABOVE } from './questions';
import { FailedCheck } from './session';
import { Page } from './steps';

const SELECT_ALL = 'Select all that apply.';
const YES_NO: Choice[] = [{ label: 'Yes' }, { label: 'No' }];

const criTitle = (criId: CriId): string => titled(CRI_NAMES[criId]);

// "Strength 4, validity 2"
const scoreLine = (scores: Partial<Record<string, number>>): string =>
  titled(
    Object.entries(scores)
      .map(([score, value]) => `${score} ${value}`)
      .join(', ') || 'no scores'
  );

const yesNo = (title: string, rest: { hint?: string; reminder?: string } = {}): AskedChoice => ({
  kind: 'choice',
  title,
  ...rest,
  options: YES_NO,
  yesNo: true
});

const documents = (
  title: string,
  listed: DocumentType[],
  rest: { hint?: string; reminder?: string } = {}
): AskedDocuments => ({
  kind: 'documents',
  title,
  hint: [rest.hint, SELECT_ALL].filter(Boolean).join(' '),
  reminder: rest.reminder,
  documents: listed,
  noneLabel: NONE_OF_THE_ABOVE
});

// The first thing asked, before there is a journey: the level the service needs.
export const LEVELS = Object.values(LevelOfConfidence);

export const LEVEL_QUESTION: AskedChoice = {
  kind: 'choice',
  caption: 'Dynamic IPV prototype',
  title: 'Which level of confidence does the service need?',
  hint: 'The engine plans a route to this level from what you say you have.',
  options: LEVELS.map(level => ({ label: level }))
};

const stub = (criId: CriId): AskedStub => ({
  kind: 'stub',
  tag: 'CRI stub',
  banner: 'You have left IPV Core. This page stands in for a credential issuer.',
  caption: 'Credential issuer',
  title: criTitle(criId),
  criId,
  facts: [
    ['CRI', criId],
    ['What the user does there', CRI_LABELS[criId]],
    ['Identity data it collects', CRI_CHECKS[criId].collects.join(', ') || 'Nothing']
  ],
  question: 'Which result should this check return?',
  hint: 'The result you pick is stored as the credential, then the engine is asked what comes next.',
  results: checkOptions(criId).map(({ check, successful }) => ({
    label: check.label,
    passed: successful,
    outcome: successful ? 'Passed' : 'Failed',
    detail: [check.document, scoreLine(resolveScores(check))].filter(Boolean).join(' · ')
  })),
  button: 'Return this result'
});

// What a page puts to the user. The two kinds of page with nothing to put to them — the
// engine has yet to be asked, or the identity result has yet to be fetched — have none.
export const askedOn = (page: Page): Asked => {
  switch (page.kind) {
    case 'triage':
      return page.step.kind === 'documents'
        ? documents(page.step.prompt, page.step.documents, { hint: page.step.hint })
        : {
            kind: 'choice',
            title: page.step.prompt,
            hint: page.step.hint,
            options: page.step.options.map(option => ({ label: option.label }))
          };

    case 'choose-way':
      return {
        kind: 'choice',
        title: HOW_TO_PROVE_IDENTITY,
        options: page.ways.map(way => ({
          label: wayName(way),
          // "Online banking — you need: online banking" says nothing twice.
          hint:
            wayNeeds(way).toLowerCase() === wayName(way).toLowerCase()
              ? undefined
              : `You need: ${wayNeeds(way)}`
        })),
        lastResort: { label: CANNOT_USE_ANY }
      };

    case 'question': {
      const questions = page.fields.map(({ need, title, reminder }) =>
        hasSeveralDocuments(need) && need.question.kind === CapabilityQuestionKind.DOCUMENTS
          ? documents(title, need.question.documents, { reminder })
          : yesNo(title, { reminder })
      );

      // A way that needs one thing is that question; one that needs several asks for
      // them together.
      return questions.length === 1
        ? questions[0]
        : {
            kind: 'together',
            title: `To use ${wayChecks(page.entry)}, tell us what you have`,
            intro: 'You need all of these to prove your identity this way.',
            questions
          };
    }

    case 'cri-question':
      return {
        kind: 'choice',
        title: page.question.question,
        options: page.question.answers.map(label => ({ label }))
      };

    case 'cri':
      return stub(page.criId);

    case 'failed':
      return {
        kind: 'failed',
        title: `We could not confirm your identity with ${CRI_NAMES[page.failed.criId]}`,
        returned: `The check returned: ${page.failed.check}`,
        body: 'You can still prove your identity. We have worked out the best way for you to continue.',
        nextHeading: 'What happens next',
        facts: [
          ['Next step', criTitle(page.next)],
          ['What you will do', CRI_LABELS[page.next]]
        ],
        button: `Continue with ${CRI_NAMES[page.next]}`
      };

    case 'complete':
      return {
        kind: 'complete',
        title: 'You have proved your identity',
        body: 'You have done everything needed to prove your identity.',
        button: 'Continue'
      };

    case 'stop':
      return {
        kind: 'stop',
        title: 'Sorry, you cannot prove your identity this way',
        message: page.message
      };

    case 'result':
      throw new Error('The identity result has to be fetched before it can be shown.');

    case 'ask-engine':
      throw new Error('There is nothing to ask the user while the engine has yet to be asked.');
  }
};

const CHECK_NOT_COMPLETED = 'We could not complete a fraud check for you.';

// A line for the top of the page the user lands on after a failed check, when that page is
// not the one about the failure itself. Nothing to say once they have an identity anyway.
export const failureNotice = (page: Page, failed?: FailedCheck): string | undefined => {
  if (!failed || page.kind === 'failed' || page.kind === 'complete' || page.kind === 'result') {
    return undefined;
  }

  // A check that could not be completed is not the user's doing, and says nothing about
  // whether their identity was confirmed.
  if (failed.tolerated) {
    return page.kind === 'stop'
      ? CHECK_NOT_COMPLETED
      : `${CHECK_NOT_COMPLETED} You can still prove your identity, but fewer ways are open to you.`;
  }

  const happened = `We could not confirm your identity with ${CRI_NAMES[failed.criId]}.`;

  return page.kind === 'stop' ? happened : `${happened} You can still prove it another way.`;
};

export const identityShown = (identity: IdentityResult): IdentityShown => ({
  tag: 'Identity stub',
  banner:
    'This page stands in for wherever the finished identity is read from. It shows what ' +
    'the credentials held for this user amount to.',
  caption: `Identity at ${identity.levelOfConfidence}`,
  title: identity.profile ? `Profile ${identity.profile}` : 'No profile met',
  identity
});
