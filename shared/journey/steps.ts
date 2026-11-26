// The journey as steps: which page the user is on, and what each answer changes outside a
// batch of questions (see batch.ts for those). Nothing here waits for input, so the same
// steps drive the terminal and a web server.
import {
  Action,
  AdditionalQuestion,
  CheckOutcome,
  CriId,
  CriOption,
  DocumentType,
  EngineResult
} from '../types';
import { BatchPage, batchPage, BatchStep, startBatch } from './batch';
import {
  answerAdditionalQuestion,
  FailedCheck,
  recordAttempt,
  Session
} from './session';
import {
  applyAnswer,
  applyDocuments,
  nextTriageStep,
  toCapabilities,
  triageFailure,
  TriageStep
} from './triage';

export type Page =
  | { kind: 'triage'; step: TriageStep }
  // A batch of the engine's questions: choosing a way, or answering what it needs.
  | BatchPage
  // A question a CRI wants answered before the user is sent to it.
  | { kind: 'cri-question'; criId: CriId; question: AdditionalQuestion }
  | { kind: 'cri'; criId: CriId }
  // The last check failed and the engine has worked out where to send the user instead.
  // They are told before they go.
  | { kind: 'failed'; failed: FailedCheck; next: CriId }
  // The engine says the identity has been reached. It does not say what it is made of.
  | { kind: 'complete' }
  // What the identity is made of, which has to be fetched from the identity stub.
  | { kind: 'result' }
  | { kind: 'stop'; message: string }
  // Nothing is pending, so the engine has to be asked what comes next.
  | { kind: 'ask-engine' };

// ---- Triage ----

export const answerTriage = (session: Session, step: TriageStep, answer: number | DocumentType[]) => {
  const answers =
    step.kind === 'documents'
      ? applyDocuments(session.answers, step, answer as DocumentType[])
      : applyAnswer(session.answers, step, answer as number);

  return { ...session, answers, capabilities: toCapabilities(answers) };
};

// ---- CRIs the engine offered ----

// Walks the CRIs in the engine's order. One with no question of its own is taken straight
// away; one with a question waits for the user's answer. Running out means every option
// was declined, and the engine is asked again with those answers recorded.
export const offer = (session: Session, options: CriOption[]): Session => {
  const [first] = options;

  if (!first) return { ...session, pending: {} };

  return {
    ...session,
    pending: first.question ? { options } : { criId: first.criId }
  };
};

// Answers the question of the first CRI on offer. Its first answer takes the CRI; any
// other is recorded and the next CRI is offered.
export const answerCriQuestion = (session: Session, answer: number): Session => {
  const [first, ...rest] = session.pending?.options ?? [];

  if (!first) return session;

  const answered = {
    ...session,
    capabilities: answerAdditionalQuestion(session.capabilities, first.criId, answer)
  };

  return answer === 0 ? { ...answered, pending: { criId: first.criId } } : offer(answered, rest);
};

// The user has been to the CRI and come back. A failed check is kept on the session until
// they have been told about it.
export const completeCri = (
  session: Session,
  criId: CriId,
  check: string,
  outcome: CheckOutcome
): Session => {
  const { failed, ...attempted } = recordAttempt(session, criId);

  return {
    ...attempted,
    pending: {},
    ...(outcome === CheckOutcome.PASSED
      ? {}
      : { failed: { criId, check, tolerated: outcome === CheckOutcome.TOLERATED } })
  };
};

// The user has been told they have an identity, and goes on to see what it is made of.
export const showResult = (session: Session): Session => ({ ...session, pending: { result: true } });

// The user has been told about the failed check and has moved on.
export const clearFailure = ({ failed, ...session }: Session): Session => session;

// ---- Putting it together ----

// Where a finished batch leaves the user.
export const afterBatch = ({ session, result }: BatchStep): Session => {
  if (!result) return session;
  if (result.message !== undefined) return { ...session, pending: { stop: result.message } };

  return result.options ? offer(session, result.options) : { ...session, pending: {} };
};

// Takes the engine's answer on board as what the user has to do next.
export const takeEngineResult = (session: Session, result: EngineResult): Session => {
  switch (result.action) {
    case Action.COMPLETE:
      return { ...session, pending: { complete: true } };
    case Action.STOP:
      return { ...session, pending: { stop: result.message } };
    case Action.ASK:
      return startBatch(session, result.questions, result.otherwise);
    case Action.REDIRECT:
      return offer(session, result.options);
  }
};

export const currentPage = (session: Session): Page => {
  const { pending = {} } = session;

  if (pending.result) return { kind: 'result' };
  if (pending.complete) return { kind: 'complete' };
  if (pending.stop !== undefined) return { kind: 'stop', message: pending.stop };

  const failure = triageFailure(session.answers);
  if (failure) return { kind: 'stop', message: failure };

  const step = nextTriageStep(session.answers);
  if (step) return { kind: 'triage', step };

  if (pending.criId) {
    // A check that could not be completed is nothing against the user, so there is no
    // page about it: they go straight on.
    return session.failed && !session.failed.tolerated
      ? { kind: 'failed', failed: session.failed, next: pending.criId }
      : { kind: 'cri', criId: pending.criId };
  }

  const [option] = pending.options ?? [];
  if (option?.question) {
    return { kind: 'cri-question', criId: option.criId, question: option.question };
  }

  return pending.batch ? batchPage(pending.batch) : { kind: 'ask-engine' };
};
