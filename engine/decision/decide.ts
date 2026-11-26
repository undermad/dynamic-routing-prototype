import { Action, EngineResult } from '../../shared/types';
import { IdentityState } from '../state/identity-state';
import { JourneyState } from '../state/journey-state';
import { blockedByContraIndicators, IDENTITY_ACHIEVED, noProfilesDefined } from './messages';
import { buildQuestionBatch } from './question-batch';

const stop = (message: string): EngineResult => ({ action: Action.STOP, message });

// Only that the identity has been reached. What it is made of stays with the engine.
const complete = (): EngineResult => ({ action: Action.COMPLETE, message: IDENTITY_ACHIEVED });

// The profile the user's credentials meet, once nothing the policy requires is missing.
export const profileAchieved = (identity: IdentityState): string | undefined => {
  const hasEverythingRequired =
    identity.outstandingMandatory.length === 0 && identity.missingIdentityData.length === 0;

  return hasEverythingRequired ? identity.matchedProfile : undefined;
};

// The user is not there yet: ask what we need to know, send them to the next CRI, or tell
// them there is no way left to get there.
const routeOnwards = (state: JourneyState): EngineResult => {
  const { questions, otherwise } = buildQuestionBatch(state);

  if (questions.length > 0) return { action: Action.ASK, questions, otherwise };
  if ('options' in otherwise) return { action: Action.REDIRECT, options: otherwise.options };
  return stop(otherwise.message);
};

// What next?
export const decide = (state: JourneyState): EngineResult => {
  const { identity } = state;

  if (Object.keys(identity.targetProfiles).length === 0) {
    return stop(noProfilesDefined(identity.levelOfConfidence));
  }

  if (identity.contraIndicators.length > 0) {
    return stop(blockedByContraIndicators(identity.contraIndicators));
  }

  return profileAchieved(identity) !== undefined ? complete() : routeOnwards(state);
};
