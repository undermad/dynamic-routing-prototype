// Standing in for the CRIs: the results a CRI's stub can return, and the credential each
// one issues. Both front ends let the person running the journey pick the result.
import { CRI_CHECKS } from '../checks';
import { CriCheck, CriId, VerifiableCredential } from '../types';

export interface CheckOption {
  check: CriCheck;
  successful: boolean;
}

// Every result this CRI's stub can return, the successful ones first.
export const checkOptions = (criId: CriId): CheckOption[] => {
  const { successful, failed } = CRI_CHECKS[criId];

  return [
    ...successful.map(check => ({ check, successful: true })),
    ...failed.map(check => ({ check, successful: false }))
  ];
};

export const issueCredential = (criId: CriId, option: CheckOption): VerifiableCredential => {
  const { check, successful } = option;

  return {
    cri: criId,
    check: check.label,
    successful,
    document: check.document,
    scores: check.scores,
    biometricVerificationProcessLevel: check.biometricVerificationProcessLevel,
    nonFatalFraudFailure: check.nonFatalFraudFailure,
    collected: successful ? CRI_CHECKS[criId].collects : [],
    contraIndicators: []
  };
};
