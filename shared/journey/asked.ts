// What is put to the user at each step of the journey, and the answers they can give: the
// wording and the options, with nothing about how a front end draws them. The website turns
// this into pages and the CLI into prompts, so both ask the same thing. These are the shapes;
// ask.ts fills them in.
import { CriId, DocumentType, IdentityResult } from '../types';
import { Answer } from './batch';

// One option the user can pick, with a line under it where that helps.
export interface Choice {
  label: string;
  hint?: string;
}

// Pick one option.
export interface AskedChoice {
  kind: 'choice';
  title: string;
  caption?: string;
  hint?: string;
  // What the user told us before, when they are being asked again.
  reminder?: string;
  options: Choice[];
  // An option set apart from the rest, after an "or".
  lastResort?: Choice;
  // The options are "yes" then "no".
  yesNo?: boolean;
}

// Pick every document that applies, or none of them.
export interface AskedDocuments {
  kind: 'documents';
  title: string;
  hint: string;
  reminder?: string;
  documents: DocumentType[];
  noneLabel: string;
}

// Several questions answered together: everything one way to prove an identity needs.
export interface AskedTogether {
  kind: 'together';
  title: string;
  intro: string;
  questions: (AskedChoice | AskedDocuments)[];
}

// One result a CRI's stub can return.
export interface StubResult {
  label: string;
  passed: boolean;
  outcome: string;
  detail: string;
}

// The page that stands in for a credential issuer.
export interface AskedStub {
  kind: 'stub';
  tag: string;
  banner: string;
  caption: string;
  title: string;
  criId: CriId;
  // Facts about the CRI, as label and value.
  facts: [string, string][];
  question: string;
  hint: string;
  results: StubResult[];
  button: string;
}

// The last check failed: what happened, and where the engine is sending the user next.
export interface AskedFailed {
  kind: 'failed';
  title: string;
  returned: string;
  body: string;
  nextHeading: string;
  facts: [string, string][];
  button: string;
}

// The engine says the identity has been reached. That is all a front end is told.
export interface AskedComplete {
  kind: 'complete';
  title: string;
  body: string;
  button: string;
}

export interface AskedStop {
  kind: 'stop';
  title: string;
  message: string;
}

export type Asked =
  | AskedChoice
  | AskedDocuments
  | AskedTogether
  | AskedStub
  | AskedFailed
  | AskedComplete
  | AskedStop;

// What the user answered: the index of the option they picked, yes or no, the documents
// they have, or one answer for each question that was asked together.
export type Submitted =
  | { index: number }
  | { yes: boolean }
  | { documents: DocumentType[] }
  | { answers: Answer[] };

// The end of the journey, as a stub: what the user's credentials amount to.
export interface IdentityShown {
  tag: string;
  banner: string;
  caption: string;
  title: string;
  identity: IdentityResult;
}
