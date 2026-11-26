import { buildScores, isSatisfiedBy, satisfies } from '../../shared/gpg45';
import { CriGroup, Gpg45Scores, ScoreType, TargetProfiles } from '../../shared/types';
import { CriState, isPlannable } from '../state/cri-state';
import { IdentityState } from '../state/identity-state';
import { JourneyState } from '../state/journey-state';
import { identityDataAfter, orderSteps } from './ordering';
import { byBestRoute } from './ranking';
import { Route, RoutePlan } from './route';
import { nearestShortfall } from './shortfall';

// What the user would score with these checks added to the credentials they already hold,
// assuming each check returns its best result.
const scoresWith = (steps: CriState[], identity: IdentityState) =>
  buildScores([...identity.credentials, ...steps.map(step => step.bestCheck)]);

const isDocumentCheck = (step: CriState): boolean => step.cri.group === CriGroup.DOCUMENT;

// A document check only belongs on a route if its own document is good enough for the
// profile the route reaches. Scores are pooled across credentials, so without this a
// check could be added purely to lend its verification or activity score to a document
// from somewhere else — the Post Office check, say, alongside online banking.
const documentsAreGoodEnough = (steps: CriState[], profile: Gpg45Scores): boolean =>
  steps.filter(isDocumentCheck).every(({ bestCheck }) => {
    const strength = bestCheck.scores[ScoreType.STRENGTH];
    const validity = bestCheck.scores[ScoreType.VALIDITY];

    return (
      strength !== undefined &&
      validity !== undefined &&
      profile.evidences.some(required => satisfies({ strength, validity }, required))
    );
  });

// The first target profile these checks would reach, in the policy's order of preference.
const profileReached = (
  steps: CriState[],
  scores: Gpg45Scores,
  targetProfiles: TargetProfiles
): string | undefined =>
  Object.entries(targetProfiles).find(
    ([, profile]) => isSatisfiedBy(profile, scores) && documentsAreGoodEnough(steps, profile)
  )?.[0];

// Turns a set of checks into a route, or undefined if the set would not get the user an
// identity: it must cover the mandatory checks still outstanding, be runnable in some
// order, leave the user with all the identity data the policy requires, and reach a
// target profile with documents that are good enough for it.
const toRoute = (chosen: CriState[], identity: IdentityState): Route | undefined => {
  const coversMandatory = identity.outstandingMandatory.every(criId =>
    chosen.some(step => step.cri.id === criId)
  );
  if (!coversMandatory) return undefined;

  const steps = orderSteps(chosen, identity.identityData);
  if (!steps) return undefined;

  const collected = identityDataAfter(steps, identity.identityData);
  if (identity.missingIdentityData.some(data => !collected[data])) return undefined;

  const scores = scoresWith(steps, identity);
  const profile = profileReached(steps, scores, identity.targetProfiles);
  if (!profile) return undefined;

  return { steps, profile, scores };
};

// Enumerates every set of remaining checks that would reach a target profile. A set that
// contains a smaller set already known to work is skipped, so no route carries a check it
// does not need. The engine routes by the first step of the best one, which is what stops
// it starting a journey it cannot finish.
export const planRoutes = ({ cris, identity }: JourneyState): RoutePlan => {
  const candidates = cris.filter(isPlannable);
  const routes: Route[] = [];
  const working: number[] = []; // each a bitmask over candidates

  for (let set = 0; set < 1 << candidates.length; set++) {
    if (working.some(smaller => (smaller & set) === smaller)) continue;

    const chosen = candidates.filter((_, index) => (set & (1 << index)) !== 0);
    const route = toRoute(chosen, identity);
    if (!route) continue;

    working.push(set);
    routes.push(route);
  }

  if (routes.length > 0) {
    return { routes: routes.sort(byBestRoute(identity.targetProfiles)) };
  }

  // Nothing reaches a profile. Report the shortfall against the ceiling — every candidate
  // scoring its best at once — so the refusal can say what was missing and by how much.
  const ceiling = scoresWith(candidates, identity);

  return { routes: [], shortfall: nearestShortfall(identity.targetProfiles, ceiling) };
};
