import {
  CriId,
  EngineRequest,
  UserCapabilities,
  VerifiableCredential
} from '../../shared/types';
import { buildCriStates, CriState } from './cri-state';
import { buildIdentityState, IdentityState } from './identity-state';

// The whole picture for one request, built from the three things the engine is driven by:
// the CRI config, what core front says about the user, and what EVCS holds for them.
// Everything after this point reads the state and nothing else.
export interface JourneyState {
  capabilities: UserCapabilities;
  attempted: CriId[];
  identity: IdentityState;
  cris: CriState[]; // one per configured CRI, in config order
}

export const buildJourneyState = (
  request: EngineRequest,
  credentials: VerifiableCredential[]
): JourneyState => ({
  capabilities: request.capabilities,
  attempted: request.attempted,
  identity: buildIdentityState(credentials, request.requiredLevelOfConfidence),
  cris: buildCriStates(request.capabilities, request.attempted)
});

// The same journey as it would stand if the user's capabilities were these instead. Used
// to play out answers the user has not given yet.
export const withCapabilities = (
  state: JourneyState,
  capabilities: UserCapabilities
): JourneyState => ({
  ...state,
  capabilities,
  cris: buildCriStates(capabilities, state.attempted)
});
