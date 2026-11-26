import {
  CredentialStore,
  CriId,
  Engine,
  EngineRequest,
  EngineResult,
  LevelOfConfidence,
  TargetProfiles,
  UserCapabilities,
  VerifiableCredential
} from '../shared/types';
import { decide } from './decision/decide';
import { buildCriStates, CriState } from './state/cri-state';
import * as identityState from './state/identity-state';
import { buildJourneyState } from './state/journey-state';

// The engine answers one question — "what next?" — and keeps nothing between calls. It
// gathers everything it knows into a journey state, then decides from that state alone.
const processRequest = (evcs: CredentialStore, request: EngineRequest): EngineResult => {
  const credentials = evcs.fetch(request.userId);
  const state = buildJourneyState(request, credentials);

  return decide(state);
};

export const createEngine = (evcs: CredentialStore): Engine => ({
  processRequest: request => processRequest(evcs, request)
});

// Views onto the engine's state, for showing how a decision was reached.

export { findCri } from './config/cri-config';
export { CriAvailability } from './state/cri-state';
export type CriAvailabilityResult = CriState;

export const describeAvailability = (
  capabilities: UserCapabilities,
  attempted: CriId[] = []
): CriAvailabilityResult[] => buildCriStates(capabilities, attempted);

export const targetProfilesFor = (
  levelOfConfidence: LevelOfConfidence,
  credentials: VerifiableCredential[] = []
): TargetProfiles => identityState.targetProfilesFor(levelOfConfidence, credentials);
