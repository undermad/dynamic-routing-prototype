import { CriId, LevelOfConfidence } from '../../shared/types';
import { Shortfall } from '../planning/shortfall';

// Every message the engine sends back to the user.

export const IDENTITY_ACHIEVED = "You've successfully achieved an identity!";

export const noProfilesDefined = (levelOfConfidence: LevelOfConfidence): string =>
  `Sorry, no profiles are defined for ${levelOfConfidence}.`;

export const blockedByContraIndicators = (contraIndicators: string[]): string =>
  `Sorry, you are blocked by CIs: ${contraIndicators.join(', ')}.`;

// Why the level of confidence is out of reach, as specifically as we can say it: a
// mandatory check that has been used up, then the scores the nearest profile is short of.
export const unachievable = (
  levelOfConfidence: LevelOfConfidence,
  exhaustedMandatory: CriId[],
  shortfall?: Shortfall
): string => {
  if (exhaustedMandatory.length > 0) {
    return (
      `Sorry, ${levelOfConfidence} cannot be achieved. ` +
      `Every identity needs ${exhaustedMandatory.join(', ')}, which has already been attempted.`
    );
  }

  if (!shortfall) {
    return `Sorry, there is no way to reach ${levelOfConfidence} with the checks you can complete.`;
  }

  const missing = shortfall.missing
    .map(({ type, required, best }) => `${type} ${required} (best possible ${best})`)
    .join(', ');

  return (
    `Sorry, ${levelOfConfidence} cannot be achieved. ` +
    `The closest profile is ${shortfall.profile}, which needs ${missing}.`
  );
};
