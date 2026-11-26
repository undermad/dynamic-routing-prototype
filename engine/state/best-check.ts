import { resolveScores } from '../../shared/gpg45';
import { CriCheck, DocumentType, ScoreType, UserCapabilities } from '../../shared/types';
import { CriConfig } from '../config/cri-config';

// The most a CRI could award this user, and the document it would be awarded for.
export interface BestCheck {
  scores: Partial<Record<ScoreType, number>>;
  document?: DocumentType;
}

// Strength first, then validity, then everything the check awards added together.
const rank = (check: CriCheck): number[] => {
  const scores = resolveScores(check);
  const total = Object.values(scores).reduce((sum, score) => sum + (score ?? 0), 0);

  return [scores[ScoreType.STRENGTH] ?? -1, scores[ScoreType.VALIDITY] ?? -1, total];
};

const strongestFirst = (a: CriCheck, b: CriCheck): number => {
  const [left, right] = [rank(a), rank(b)];
  return right[0] - left[0] || right[1] - left[1] || right[2] - left[2];
};

// A document the user has confirmed holding wins over a higher-scoring one they may not
// have, so the app is planned on its driving licence check if that is all the user said
// they had.
export const bestCheckFor = (cri: CriConfig, capabilities: UserCapabilities): BestCheck => {
  const held = (check: CriCheck) =>
    check.document !== undefined && capabilities.documents.includes(check.document);

  const forHeldDocuments = cri.provides.filter(held);
  const checks = forHeldDocuments.length > 0 ? forHeldDocuments : cri.provides;
  const [best] = [...checks].sort(strongestFirst);

  return { scores: best ? resolveScores(best) : {}, document: best?.document };
};
