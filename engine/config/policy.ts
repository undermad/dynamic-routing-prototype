import { CriId, IdentityData, LevelOfConfidence } from '../../shared/types';

// What an identity must have, whichever route got the user there.
export const POLICY: {
  PROFILES: Record<LevelOfConfidence, string[]>; // in order of preference
  MANDATORY_CHECKS: CriId[];
  REQUIRED_IDENTITY_DATA: IdentityData[];
} = {
  PROFILES: {
    // [LevelOfConfidence.LOW]: ['L1A'], to be added in future - require new front end triage
    [LevelOfConfidence.MEDIUM]: ['M1A', 'M1B', 'M2B', 'M1C']
    // [LevelOfConfidence.HIGH]: ['H1A'] to be added in future - require new front end triage
  },
  MANDATORY_CHECKS: [CriId.FRAUD],
  REQUIRED_IDENTITY_DATA: [IdentityData.NAME, IdentityData.DOB, IdentityData.ADDRESS]
};
