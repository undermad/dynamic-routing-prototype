// What a front end does with the engine and with an answer, whichever front end it is:
// ask the engine what comes next, and apply what the user answered to their session.
import { CheckOutcome, EngineRequest, EngineResult } from '../types';
import { Submitted } from './asked';
import { answerQuestion, chooseWay } from './batch';
import { checkOptions, issueCredential } from './cri-stub';
import { EngineClient } from './engine-client';
import { Session } from './session';
import {
  afterBatch,
  answerCriQuestion,
  answerTriage,
  clearFailure,
  completeCri,
  Page,
  showResult
} from './steps';

// A request to the engine and what it answered.
export interface Exchange {
  request: EngineRequest;
  result: EngineResult;
}

const engineRequest = (session: Session): EngineRequest => ({
  userId: session.userId,
  capabilities: session.capabilities,
  requiredLevelOfConfidence: session.requiredLevelOfConfidence,
  attempted: session.attempted
});

export const askEngine = async (session: Session, engine: EngineClient): Promise<Exchange> => {
  const request = engineRequest(session);

  return { request, result: await engine.nextStep(request) };
};

const indexFrom = (submitted: Submitted): number => ('index' in submitted ? submitted.index : -1);

const apply = async (
  session: Session,
  page: Page,
  submitted: Submitted,
  engine: EngineClient
): Promise<Session> => {
  const batch = session.pending?.batch;

  switch (page.kind) {
    case 'triage':
      return answerTriage(
        session,
        page.step,
        'documents' in submitted ? submitted.documents : indexFrom(submitted)
      );

    case 'choose-way':
      return batch ? afterBatch(chooseWay(session, batch, indexFrom(submitted))) : session;

    case 'question': {
      if (!batch) return session;

      // One answer for each thing the way needs: several asked together, or the single one.
      const answers =
        'answers' in submitted
          ? submitted.answers
          : ['documents' in submitted ? submitted.documents : 'yes' in submitted && submitted.yes];

      return afterBatch(answerQuestion(session, batch, answers));
    }

    case 'cri-question':
      return answerCriQuestion(session, indexFrom(submitted));

    // Coming back from a CRI stores its credential with the engine first, so the engine
    // sees it when it is next asked. The engine says what it makes of the check.
    case 'cri': {
      const option = checkOptions(page.criId)[indexFrom(submitted)];
      const credential = issueCredential(page.criId, option);
      const { outcome } = await engine.storeCredential(session.userId, credential);

      // An engine that does not say is taken to mean the check passed.
      return completeCri(session, page.criId, credential.check, outcome ?? CheckOutcome.PASSED);
    }

    case 'complete':
      return showResult(session);

    default:
      return session;
  }
};

// Applies the user's answer to the page they were on. A failed check is told to the user
// on the page that follows it, so any answer after that means they have seen it.
export const answerPage = async (
  session: Session,
  page: Page,
  submitted: Submitted,
  engine: EngineClient
): Promise<Session> => {
  const answered = await apply(session, page, submitted, engine);

  return page.kind === 'cri' ? answered : clearFailure(answered);
};
