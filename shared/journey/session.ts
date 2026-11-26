import {
  AskOutcome,
  CriId,
  CriOption,
  LevelOfConfidence,
  RouteQuestion,
  UserCapabilities
} from '../types';
import { toCapabilities, TriageAnswers } from './triage';

// A batch of the engine's questions the user is part way through.
export interface Batch {
  // The questions not yet answered, in the engine's order.
  remaining: RouteQuestion[];
  // What to do once every one of them has been answered "no".
  otherwise: AskOutcome;
  // The user has taken the questions in the engine's order so far. The redirect sent with
  // a question assumed "no" to every question before it, so it only holds while this does.
  inEngineOrder: boolean;
  // The index in `remaining` of the way the user picked from the list, while they are
  // being asked about it.
  chosen?: number;
}

// Where the user is between two calls to the engine. Nothing pending means the engine has
// to be asked what comes next.
export interface Pending {
  batch?: Batch;
  // CRIs the engine offered, each with a question of its own to put to the user first.
  options?: CriOption[];
  // The CRI the user is being sent to.
  criId?: CriId;
  // The engine says the identity has been reached.
  complete?: boolean;
  // The user has been told so, and has gone on to see what the identity is made of.
  result?: boolean;
  stop?: string;
}

// A check that came back failed, which the user has yet to be told about.
export interface FailedCheck {
  criId: CriId;
  check: string;
  // It failed in a way the policy tolerates: the check counts as done, and the user is
  // told it could not be completed rather than that it went against them.
  tolerated: boolean;
}

export interface Session {
  userId: string;
  requiredLevelOfConfidence: LevelOfConfidence;
  answers: TriageAnswers;
  capabilities: UserCapabilities;
  attempted: CriId[];
  pending?: Pending;
  failed?: FailedCheck;
}

export const startSession = (
  userId: string,
  requiredLevelOfConfidence: LevelOfConfidence
): Session => ({
  userId,
  requiredLevelOfConfidence,
  answers: {},
  capabilities: toCapabilities({}),
  attempted: []
});

export const recordAttempt = (session: Session, criId: CriId): Session => ({
  ...session,
  attempted: session.attempted.includes(criId)
    ? [...session.attempted]
    : [...session.attempted, criId]
});

export const answerAdditionalQuestion = (
  capabilities: UserCapabilities,
  criId: CriId,
  answer: number
): UserCapabilities => ({
  ...capabilities,
  additionalAnswers: { ...capabilities.additionalAnswers, [criId]: answer }
});
