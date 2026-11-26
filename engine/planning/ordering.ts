import { IdentityData } from '../../shared/types';
import { CRI_CONFIG } from '../config/cri-config';
import { CriState } from '../state/cri-state';

type Collected = Record<IdentityData, boolean>;

// Which check should run first when several are ready: mandatory checks, then the order
// the CRI config's weights declare, then the order they are declared in.
const precedes = (a: CriState, b: CriState): boolean => {
  if (a.mandatory !== b.mandatory) return a.mandatory;
  if (a.cri.weight !== b.cri.weight) return a.cri.weight < b.cri.weight;
  return CRI_CONFIG.indexOf(a.cri) < CRI_CONFIG.indexOf(b.cri);
};

const canRun = (step: CriState, collected: Collected): boolean =>
  step.cri.requires.every(data => collected[data]);

// The identity data held once these checks have run on top of what was already collected.
export const identityDataAfter = (steps: CriState[], collected: Collected): Collected => {
  const after = { ...collected };

  for (const step of steps) {
    for (const data of step.cri.collects) after[data] = true;
  }

  return after;
};

// Sequences the chosen checks so each one runs only once the identity data it requires
// has been collected by an earlier step. Returns undefined when no such order exists —
// eg. a bank account check with nothing in the set to collect a name and date of birth.
export const orderSteps = (chosen: CriState[], collected: Collected): CriState[] | undefined => {
  const remaining = [...chosen];
  const ordered: CriState[] = [];
  let have = collected;

  while (remaining.length > 0) {
    const next = remaining
      .filter(step => canRun(step, have))
      .reduce<CriState | undefined>(
        (first, step) => (first === undefined || precedes(step, first) ? step : first),
        undefined
      );

    if (!next) return undefined;

    remaining.splice(remaining.indexOf(next), 1);
    ordered.push(next);
    have = identityDataAfter([next], have);
  }

  return ordered;
};
