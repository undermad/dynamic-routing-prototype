import { satisfies } from '../../shared/gpg45';
import { Evidence, Gpg45Scores, TargetProfiles } from '../../shared/types';

// How far a set of scores is from a profile it does not meet.
export interface Shortfall {
  profile: string;
  missing: { type: string; required: string; best: string }[];
}

const evidenceLabel = (evidence?: Evidence): string =>
  evidence === undefined ? 'none' : `${evidence.strength}/${evidence.validity}`;

// The target profile these scores come closest to, and what they are short of. Undefined
// when the scores already meet one of the profiles, as then nothing is missing.
export const nearestShortfall = (
  targetProfiles: TargetProfiles,
  scores: Gpg45Scores
): Shortfall | undefined => {
  let nearest: { shortfall: Shortfall; gap: number } | undefined;

  for (const [name, profile] of Object.entries(targetProfiles)) {
    const missing: Shortfall['missing'] = [];
    let gap = 0;

    const acquired = [...scores.evidences];

    for (const required of profile.evidences) {
      const [best] = acquired;

      if (best !== undefined && satisfies(best, required)) {
        acquired.shift();
        continue;
      }

      missing.push({
        type: 'strength/validity',
        required: evidenceLabel(required),
        best: evidenceLabel(best)
      });
      gap +=
        Math.max(0, required.strength - (best?.strength ?? 0)) +
        Math.max(0, required.validity - (best?.validity ?? 0));
    }

    for (const type of ['activity', 'fraud', 'verification'] as const) {
      if (scores[type] >= profile[type]) continue;

      missing.push({ type, required: String(profile[type]), best: String(scores[type]) });
      gap += profile[type] - scores[type];
    }

    if (missing.length === 0) return undefined;

    if (!nearest || gap < nearest.gap) {
      nearest = { shortfall: { profile: name, missing }, gap };
    }
  }

  return nearest?.shortfall;
};
