// The words for the engine's questions and for the ways to prove an identity it offers.
import { CapabilityQuestionKind, DocumentType, RouteNeed, RouteQuestion } from '../types';
import { CRI_NAMES, titled } from './labels';
import { haveAccessToCompatiblePhone } from './questions';

// How to ask about a single document, the first time and when offering a second chance.
interface DocumentCopy {
  ask: string;
  said: string;
  unless: string;
}

const DOCUMENT_COPY: Partial<Record<DocumentType, DocumentCopy>> = {
  [DocumentType.ONLINE_BANKING]: {
    ask: 'Can you sign in to your online banking?',
    said: 'you cannot sign in to your online banking',
    unless: 'If you can'
  },
  [DocumentType.BANK_ACCOUNT]: {
    ask: 'Do you have a UK bank account?',
    said: 'you do not have a UK bank account',
    unless: 'If you do have one'
  },
  [DocumentType.NATIONAL_INSURANCE_NUMBER]: {
    ask: 'Do you know your National Insurance number?',
    said: 'you do not know your National Insurance number',
    unless: 'If you do know it'
  }
};

const documentCopy = (document: DocumentType): DocumentCopy =>
  DOCUMENT_COPY[document] ?? {
    ask: `Do you have a ${document}?`,
    said: `you do not have a ${document}`,
    unless: 'If you do have one'
  };

// The one document a question is about, or undefined if it offers a choice of several.
const onlyDocument = ({ question }: RouteNeed): DocumentType | undefined =>
  question.kind === CapabilityQuestionKind.DOCUMENTS && question.documents.length === 1
    ? question.documents[0]
    : undefined;

export const firstTimePrompt = (entry: RouteNeed): string => {
  if (entry.question.kind === CapabilityQuestionKind.DEVICE) {
    return haveAccessToCompatiblePhone.question;
  }

  const document = onlyDocument(entry);

  return document
    ? documentCopy(document).ask
    : `Which of these documents can you use with ${CRI_NAMES[entry.criId]}?`;
};

// What the user told us before, for a question they are being given a second chance at.
// It goes ahead of the question, which is then asked as it was the first time.
export const secondChanceReminder = (entry: RouteNeed): string | undefined => {
  if (!entry.retry) return undefined;

  const cri = CRI_NAMES[entry.criId];

  if (entry.question.kind === CapabilityQuestionKind.DEVICE) {
    return `You told us you do not have a smartphone you can use. If you do have one, you can use ${cri}.`;
  }

  const document = onlyDocument(entry);

  if (!document) {
    return `You told us you do not have any of these documents. If you do have one, you can use ${cri}.`;
  }

  const { said, unless } = documentCopy(document);

  return `You told us ${said}. ${unless}, you can use ${cri}.`;
};

export const HOW_TO_PROVE_IDENTITY = 'How do you want to prove your identity?';
export const CANNOT_USE_ANY = 'I cannot use any of these';

// "a, b or c"
const anyOf = (items: readonly string[]): string =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;

// Everything a way needs from the user: its first question, then the rest of its route.
export const needsOf = (entry: RouteQuestion): RouteNeed[] => [
  { question: entry.question, criId: entry.criId, ...(entry.retry ? { retry: true } : {}) },
  ...(entry.alsoNeeds ?? [])
];

// "a, b and c"
const allOf = (items: readonly string[]): string =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

// The checks a way goes through that still need something from the user, by name and in
// order: "the driving licence check and online banking".
export const wayChecks = (entry: RouteQuestion): string =>
  allOf([...new Set(needsOf(entry).map(need => CRI_NAMES[need.criId]))]);

// The name of a way to prove an identity, as a heading or an option.
export const wayName = (entry: RouteQuestion): string => titled(wayChecks(entry));

const needed = ({ question }: RouteNeed): string =>
  question.kind === CapabilityQuestionKind.DEVICE ? 'a smartphone' : anyOf(question.documents);

// What the user needs for it. Each thing is needed; within one, any document will do.
export const wayNeeds = (entry: RouteQuestion): string =>
  needsOf(entry).map(needed).join(', and ');
