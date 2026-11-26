import { CriId, CriOption } from '../../shared/types';
import { isConfirmedRoute, Route } from '../planning/route';

// The CRI to send the user to, followed by the fallback from each lesser route. Core front
// walks the list: a CRI carrying a question is only taken if the user accepts it, otherwise
// the next one is tried — and one with no question is taken straight away.
export const redirectOptions = (routes: Route[]): CriOption[] => {
  const options: CriOption[] = [];
  const offered = new Set<CriId>();

  for (const route of routes) {
    const [step] = route.steps;
    if (!step || !isConfirmedRoute(route) || offered.has(step.cri.id)) continue;

    offered.add(step.cri.id);
    options.push({
      criId: step.cri.id,
      document: step.bestCheck.document,
      question: step.additionalQuestion
    });

    // Everything after a CRI with nothing to ask is unreachable, so stop there.
    if (step.additionalQuestion === undefined) break;
  }

  return options;
};
