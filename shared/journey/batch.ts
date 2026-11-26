// A batch of the engine's questions, as steps: the ways to prove an identity it offers,
// choosing one, and answering what that way needs. Nothing here waits for input.
import { answerDocuments, answerNo, answerYes, markFinalAnswer } from '../capabilities';
import {
  AskOutcome,
  CapabilityQuestionKind,
  CriOption,
  DocumentType,
  RouteNeed,
  RouteQuestion,
  UserCapabilities
} from '../types';
import { firstTimePrompt, needsOf, secondChanceReminder } from './wording';
import { Batch, Session } from './session';

export type BatchPage =
  // Several ways to prove an identity: the user picks one, or none of them.
  | { kind: 'choose-way'; ways: RouteQuestion[] }
  // What one way needs from the user, asked together: a field for each thing.
  | { kind: 'question'; entry: RouteQuestion; fields: QuestionField[] };

// One thing a way needs, as a question: yes or no, or which of several documents. `reminder`
// is what the user said before, when this is a second chance.
export interface QuestionField {
  need: RouteNeed;
  title: string;
  reminder?: string;
}

// "Yes" or "no", or the documents the user has out of the ones a question listed.
export type Answer = boolean | DocumentType[];

// How a batch of questions ended. Neither field means the engine has to be asked again.
export interface BatchResult {
  options?: CriOption[];
  message?: string;
}

// The session after a step in a batch, with the result once the batch is over.
export interface BatchStep {
  session: Session;
  result?: BatchResult;
}

export const hasSeveralDocuments = ({ question }: RouteNeed): boolean =>
  question.kind === CapabilityQuestionKind.DOCUMENTS && question.documents.length > 1;

// "No" to one of the engine's questions. Saying no to a second chance makes it final.
const sayNo = (capabilities: UserCapabilities, { question, retry }: RouteNeed) =>
  retry ? markFinalAnswer(capabilities, question) : answerNo(capabilities, question);

// Choosing a way further down the list passes over the ones above it. Those count as "no"
// for now, so the engine stops preferring them, but stay open as second chances: one that
// is already a second chance is left as it is rather than made final.
const passOver = (capabilities: UserCapabilities, passedOver: RouteQuestion[]) =>
  passedOver
    .filter(entry => !entry.retry)
    .reduce((current, entry) => answerNo(current, entry.question), capabilities);

const withBatch = (session: Session, batch: Batch | undefined): Session => ({
  ...session,
  pending: batch ? { batch } : {}
});

// The question the user is on: the way they picked, or the only one left.
const entryInHand = ({ remaining, chosen }: Batch): RouteQuestion => remaining[chosen ?? 0];

export const startBatch = (
  session: Session,
  questions: RouteQuestion[],
  otherwise: AskOutcome
): Session => withBatch(session, { remaining: questions, otherwise, inEngineOrder: true });

// The page for a batch: a choice of ways while there are several and none is picked,
// otherwise the question itself. A way the user has just picked is asked about plainly;
// one asked directly carries the reminder if it is a second chance.
export const batchPage = (batch: Batch): BatchPage => {
  if (batch.chosen === undefined && batch.remaining.length > 1) {
    return { kind: 'choose-way', ways: batch.remaining };
  }

  const entry = entryInHand(batch);
  const chosen = batch.chosen !== undefined;

  return {
    kind: 'question',
    entry,
    // A way the user has just picked is asked about plainly; one asked directly carries
    // the reminder if it is a second chance.
    fields: needsOf(entry).map(need => ({
      need,
      title: firstTimePrompt(need),
      ...(chosen ? {} : { reminder: secondChanceReminder(need) })
    }))
  };
};

const endBatch = (session: Session, capabilities: UserCapabilities, result: BatchResult) => ({
  session: { ...withBatch(session, undefined), capabilities },
  result
});

// Picks a way from the list. An index past the end is "I cannot use any of these": "no" to
// every question left, which ends the batch with what the engine sent for that case.
export const chooseWay = (session: Session, batch: Batch, index: number): BatchStep => {
  const { remaining } = batch;

  if (index < 0 || index >= remaining.length) {
    return endBatch(session, remaining.reduce(sayNo, session.capabilities), batch.otherwise);
  }

  return {
    session: {
      ...withBatch(session, {
        ...batch,
        chosen: index,
        inEngineOrder: batch.inEngineOrder && index === 0
      }),
      capabilities: passOver(session.capabilities, remaining.slice(0, index))
    }
  };
};

const isYes = (answer: Answer): boolean => (Array.isArray(answer) ? answer.length > 0 : answer);

// Records the answer to one thing a way needs.
const record = (capabilities: UserCapabilities, need: RouteNeed, answer: Answer) => {
  if (!isYes(answer)) return sayNo(capabilities, need);

  return Array.isArray(answer) && need.question.kind === CapabilityQuestionKind.DOCUMENTS
    ? answerDocuments(capabilities, need.question.documents, answer)
    : answerYes(capabilities, need.question);
};

// Answers what the way in hand needs, one answer for each of its fields. "Yes" to all of
// it ends the batch. "No" takes that way off the list, and ends the batch if it was the
// last.
//
// The rest of the batch was built on a plain "no" to the first thing each way needs. A way
// that needs several things can be answered in ways that does not cover — yes to one and
// no to another, or no to more than the first — so the engine is asked again with what
// the user actually said.
export const answerQuestion = (session: Session, batch: Batch, answers: Answer[]): BatchStep => {
  const entry = entryInHand(batch);
  const needs = needsOf(entry);
  const given = needs.map((_, index) => answers[index] ?? false);
  const capabilities = needs.reduce(
    (current, need, index) => record(current, need, given[index]),
    session.capabilities
  );

  if (given.every(isYes)) {
    return endBatch(session, capabilities, {
      options: batch.inEngineOrder ? entry.onYes : undefined
    });
  }

  if (needs.length > 1) return endBatch(session, capabilities, {});

  const remaining = batch.remaining.filter(other => other !== entry);

  if (remaining.length === 0) return endBatch(session, capabilities, batch.otherwise);

  return {
    session: {
      ...withBatch(session, { ...batch, remaining, chosen: undefined }),
      capabilities
    }
  };
};
