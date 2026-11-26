import { Gpg45Scores } from '../../shared/types';
import { CriState, isConfirmed } from '../state/cri-state';
import { Shortfall } from './shortfall';

// A set of remaining checks that would reach a target profile, in the order to run them.
export interface Route {
  steps: CriState[];
  profile: string;
  scores: Gpg45Scores; // what the user would hold at the end, every check scoring its best
}

export interface RoutePlan {
  // Every route to a target profile, best first. Empty means the level of confidence
  // cannot be reached from what the user has told us.
  routes: Route[];
  // When there are no routes, the profile that came closest and what it was short of.
  shortfall?: Shortfall;
}

// Nothing on the route depends on a question the user has yet to answer.
export const isConfirmedRoute = (route: Route): boolean => route.steps.every(isConfirmed);

// The first step that needs something asked of the user before it can be relied on.
export const firstOpenStep = (route: Route): CriState | undefined =>
  route.steps.find(step => !isConfirmed(step) && step.questions.length > 0);
