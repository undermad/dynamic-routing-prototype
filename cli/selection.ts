import { DocumentType } from '../shared/types';
import { NONE_OF_THE_ABOVE } from '../shared/journey/questions';

// Asks the user to pick one option, and resolves to its index.
export type AskQuestion = (prompt: string, options: readonly string[]) => Promise<number>;

// Asks the user to pick any number of options, and resolves to their indexes. The last
// option stands for "none of the others", so it only ever comes back on its own.
export type AskMany = (prompt: string, options: readonly string[]) => Promise<number[]>;

export interface Prompter {
  one: AskQuestion;
  many: AskMany;
}

export type Selection = { selected: number[] } | { error: string };

// Reads a multiple-choice answer typed as the numbers of the chosen options run together,
// eg. "13" for the first and third. The last option cannot be combined with any other.
// Options are numbered with single digits, so there can be at most nine of them.
export const parseSelection = (input: string, optionCount: number): Selection => {
  const typed = input.replace(/[\s,]/g, '');

  if (typed.length === 0) {
    return { error: 'Choose at least one option.' };
  }
  if (!/^\d+$/.test(typed)) {
    return { error: 'Type the numbers of the options that apply, for example 13.' };
  }

  const selected = [...typed].map(digit => Number(digit) - 1);

  if (selected.some(index => index < 0 || index >= optionCount)) {
    return { error: `Choose from options 1 to ${optionCount}.` };
  }
  if (new Set(selected).size !== selected.length) {
    return { error: 'Choose each option only once.' };
  }
  if (selected.length > 1 && selected.includes(optionCount - 1)) {
    return { error: `Option ${optionCount} cannot be chosen together with another option.` };
  }

  return { selected: [...selected].sort((a, b) => a - b) };
};

// Asks which of these documents the user has, with "none of the above" as the last option.
export const askWhichDocuments = async (
  askMany: AskMany,
  prompt: string,
  documents: DocumentType[]
): Promise<DocumentType[]> => {
  const selected = await askMany(prompt, [...documents, NONE_OF_THE_ABOVE]);

  return documents.filter((_, index) => selected.includes(index));
};
