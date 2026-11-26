// The CLI's side of a page: puts what the journey asks (shared with the website) to the
// user as terminal prompts, and reads their answer. The wording and the options come from
// the shared journey; only how they are laid out in a terminal is here.
import {
  Answer,
  Asked,
  AskedChoice,
  AskedDocuments,
  Choice,
  Submitted
} from '../shared/journey/journey';
import { askWhichDocuments, Prompter } from './selection';

// Prints lines that are there to be read, not answered.
export type Say = (lines: string[]) => void;

// An option on one line: its label, and what goes under it on a page after a dash.
const optionLine = ({ label, hint }: Choice): string => (hint ? `${label} — ${hint}` : label);

// Everything above the options, top to bottom as on a page.
const heading = (parts: (string | undefined)[]): string => parts.filter(Boolean).join('\n');

const askChoice = async (asked: AskedChoice, prompter: Prompter): Promise<Submitted> => {
  const options = [...asked.options, ...(asked.lastResort ? [asked.lastResort] : [])];
  const index = await prompter.one(
    heading([asked.caption, asked.reminder, asked.title, asked.hint]),
    options.map(optionLine)
  );

  return asked.yesNo ? { yes: index === 0 } : { index };
};

const askDocuments = async (asked: AskedDocuments, prompter: Prompter): Promise<Submitted> => ({
  documents: await askWhichDocuments(
    prompter.many,
    heading([asked.reminder, asked.title, asked.hint]),
    asked.documents
  )
});

const factLines = (facts: [string, string][]): string[] =>
  facts.map(([label, value]) => `${label}: ${value}`);

// Puts a page to the user and resolves to their answer, or to nothing when the page is the
// end of the journey and there is nothing to answer.
export const answerOn = async (
  asked: Asked,
  prompter: Prompter,
  say: Say
): Promise<Submitted | undefined> => {
  switch (asked.kind) {
    case 'choice':
      return askChoice(asked, prompter);

    case 'documents':
      return askDocuments(asked, prompter);

    // A terminal cannot show a form, so the questions are asked one after another.
    case 'together': {
      say([asked.title, asked.intro]);

      const answers: Answer[] = [];
      for (const question of asked.questions) {
        const answer =
          question.kind === 'documents'
            ? await askDocuments(question, prompter)
            : await askChoice(question, prompter);

        answers.push('documents' in answer ? answer.documents : 'yes' in answer && answer.yes);
      }

      return { answers };
    }

    case 'stub': {
      say([`[${asked.tag}] ${asked.banner}`, `${asked.caption}: ${asked.title}`, ...factLines(asked.facts)]);

      const index = await prompter.one(
        heading([asked.question, asked.hint]),
        asked.results.map(result => `${result.outcome} — ${result.label} (${result.detail})`)
      );

      return { index };
    }

    case 'failed':
      say([asked.title, asked.returned, asked.body, asked.nextHeading, ...factLines(asked.facts)]);
      await prompter.one(asked.nextHeading, [asked.button]);
      return { index: 0 };

    case 'complete':
      await prompter.one(heading([asked.title, asked.body]), [asked.button]);
      return { index: 0 };

    case 'stop':
      say([asked.title, asked.message]);
      return undefined;
  }
};
