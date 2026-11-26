import { CredentialStore, IdentityResult, LevelOfConfidence } from '../../shared/types';
import { profileAchieved } from '../decision/decide';
import { buildIdentityState } from '../state/identity-state';

// A stub, not part of the engine. The engine only says that an identity has been reached;
// this stands in for wherever the finished identity would be read from, so a front end has
// something to show at the end of a journey. Nothing in the engine's decisions uses it.
export const identityResult = (
  evcs: CredentialStore,
  userId: string,
  levelOfConfidence: LevelOfConfidence
): IdentityResult => {
  const credentials = evcs.fetch(userId);
  const identity = buildIdentityState(credentials, levelOfConfidence);

  return {
    levelOfConfidence,
    profile: profileAchieved(identity),
    scores: identity.scores,
    credentials
  };
};
