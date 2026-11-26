import { buildScores, matchProfile } from '../../shared/gpg45';
import {
  CheckOutcome,
  CriId,
  Gpg45Scores,
  IdentityData,
  LevelOfConfidence,
  TargetProfiles,
  VerifiableCredential
} from '../../shared/types';
import { GPG45_PROFILES } from '../config/gpg45-profiles';
import { POLICY } from '../config/policy';

// Everything the engine knows from the credentials the user holds in EVCS, measured
// against what the policy asks of an identity at the requested level of confidence.
export interface IdentityState {
  levelOfConfidence: LevelOfConfidence;
  credentials: VerifiableCredential[];
  scores: Gpg45Scores;
  contraIndicators: string[];
  identityData: Record<IdentityData, boolean>;
  missingIdentityData: IdentityData[];
  outstandingMandatory: CriId[];
  targetProfiles: TargetProfiles;
  // The first target profile the scores already meet, if any.
  matchedProfile?: string;
}

// A fraud check that failed in a way the policy tolerates lets the user through on a
// profile that needs no fraud score. Otherwise only profiles with a fraud score count.
const isFraudScoreRequired = (credentials: VerifiableCredential[]): boolean =>
  !credentials.some(
    credential => credential.cri === CriId.FRAUD && credential.nonFatalFraudFailure === true
  );

export const targetProfilesFor = (
  levelOfConfidence: LevelOfConfidence,
  credentials: VerifiableCredential[]
): TargetProfiles => {
  const fraudScoreRequired = isFraudScoreRequired(credentials);
  const profiles: TargetProfiles = {};

  for (const name of POLICY.PROFILES[levelOfConfidence] ?? []) {
    const profile = GPG45_PROFILES[name];
    if (fraudScoreRequired && profile.fraud <= 0) continue;
    profiles[name] = profile;
  }

  return profiles;
};

const collectedIdentityData = (
  credentials: VerifiableCredential[]
): Record<IdentityData, boolean> => {
  const collected = credentials.flatMap(credential => credential.collected);

  return {
    [IdentityData.NAME]: collected.includes(IdentityData.NAME),
    [IdentityData.DOB]: collected.includes(IdentityData.DOB),
    [IdentityData.ADDRESS]: collected.includes(IdentityData.ADDRESS)
  };
};

// A check that failed in a way the policy tolerates is not a pass, but it is not held
// against the user either: the check counts as done.
export const outcomeOf = (credential: VerifiableCredential): CheckOutcome => {
  if (credential.successful) return CheckOutcome.PASSED;

  return credential.nonFatalFraudFailure === true ? CheckOutcome.TOLERATED : CheckOutcome.FAILED;
};

const hasSucceeded = (credential: VerifiableCredential): boolean =>
  outcomeOf(credential) !== CheckOutcome.FAILED;

export const buildIdentityState = (
  credentials: VerifiableCredential[],
  levelOfConfidence: LevelOfConfidence
): IdentityState => {
  const scores = buildScores(credentials);
  const identityData = collectedIdentityData(credentials);
  const targetProfiles = targetProfilesFor(levelOfConfidence, credentials);
  const succeeded = credentials.filter(hasSucceeded).map(credential => credential.cri);

  return {
    levelOfConfidence,
    credentials,
    scores,
    contraIndicators: [...new Set(credentials.flatMap(credential => credential.contraIndicators))],
    identityData,
    missingIdentityData: POLICY.REQUIRED_IDENTITY_DATA.filter(data => !identityData[data]),
    outstandingMandatory: POLICY.MANDATORY_CHECKS.filter(criId => !succeeded.includes(criId)),
    targetProfiles,
    matchedProfile: matchProfile(targetProfiles, scores)
  };
};
