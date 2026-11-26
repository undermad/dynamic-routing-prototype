import { TargetProfiles } from '../../shared/types';
import { CriAvailability } from '../state/cri-state';
import { Route } from './route';

const count = (route: Route, availability: CriAvailability): number =>
  route.steps.filter(step => step.availability === availability).length;

const lastResorts = (route: Route): number =>
  route.steps.filter(step => step.cri.lastResort === true).length;

const totalWeight = (route: Route): number =>
  route.steps.reduce((sum, step) => sum + step.cri.weight, 0);

// Best route first, judged on preference: avoid a last resort, be shorter, follow the
// configured weights, and reach the profile the policy lists first. How many questions a
// route still needs answered plays no part — the engine asks whatever its preferred route
// needs — and only separates routes that are otherwise equal.
//
// The one thing that outranks preference is an answer the user has already given: a route
// that asks them to reconsider a "no" comes after every route that does not.
export const byBestRoute = (targetProfiles: TargetProfiles) => (a: Route, b: Route): number => {
  const profiles = Object.keys(targetProfiles);

  return (
    count(a, CriAvailability.RECONSIDER) - count(b, CriAvailability.RECONSIDER) ||
    lastResorts(a) - lastResorts(b) ||
    a.steps.length - b.steps.length ||
    totalWeight(a) - totalWeight(b) ||
    profiles.indexOf(a.profile) - profiles.indexOf(b.profile) ||
    count(a, CriAvailability.UNKNOWN) - count(b, CriAvailability.UNKNOWN)
  );
};
