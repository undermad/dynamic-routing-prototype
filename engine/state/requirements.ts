import { holdsDocument } from '../../shared/capabilities';
import {
  CapabilityQuestion,
  CapabilityQuestionKind,
  DocumentType,
  UserCapabilities
} from '../../shared/types';
import { CriRequirements } from '../config/cri-config';

export enum Verdict {
  MET = 'MET',
  UNKNOWN = 'UNKNOWN',
  NOT_MET = 'NOT_MET'
}

// How a CRI's requirements compare with what the user has told us.
export interface RequirementsAssessment {
  verdict: Verdict;
  // Questions the user has not been asked yet, whose answers would settle the verdict.
  unanswered: CapabilityQuestion[];
  // Questions the user answered in a way that rules the CRI out.
  answeredNo: CapabilityQuestion[];
}

// One kind of requirement a CRI can place on a user. Everything the engine knows about a
// kind lives in its rule, so supporting a new kind means adding one rule to RULES.
interface RequirementRule {
  verdict: (requirements: CriRequirements, capabilities: UserCapabilities) => Verdict;
  unanswered: (requirements: CriRequirements, capabilities: UserCapabilities) => CapabilityQuestion[];
  answeredNo: (requirements: CriRequirements, capabilities: UserCapabilities) => CapabilityQuestion[];
  describe: (requirements: CriRequirements) => string[];
}

const aboutDocuments = (documents: DocumentType[]): CapabilityQuestion => ({
  kind: CapabilityQuestionKind.DOCUMENTS,
  documents
});

const ABOUT_DEVICE: CapabilityQuestion = { kind: CapabilityQuestionKind.DEVICE };

// The user must have at least one of these documents. While that is undecided, the one
// question to ask is which of the documents not yet asked about they have.
const documents: RequirementRule = {
  verdict: ({ documents: accepted = [] }, capabilities) => {
    if (accepted.length === 0) return Verdict.MET;
    if (accepted.some(document => holdsDocument(capabilities, document) === true)) {
      return Verdict.MET;
    }
    if (accepted.every(document => holdsDocument(capabilities, document) === false)) {
      return Verdict.NOT_MET;
    }
    return Verdict.UNKNOWN;
  },
  unanswered: (requirements, capabilities) => {
    if (documents.verdict(requirements, capabilities) !== Verdict.UNKNOWN) return [];

    const notAsked = (requirements.documents ?? []).filter(
      document => holdsDocument(capabilities, document) === undefined
    );
    return [aboutDocuments(notAsked)];
  },
  answeredNo: (requirements, capabilities) =>
    documents.verdict(requirements, capabilities) === Verdict.NOT_MET
      ? [aboutDocuments(requirements.documents ?? [])]
      : [],
  describe: ({ documents: accepted = [] }) => (accepted.length > 0 ? [accepted.join(' or ')] : [])
};

// The user must live in one of these places. Triage always establishes residency, so there
// is no question the engine can ask about it.
const residency: RequirementRule = {
  verdict: ({ residency: accepted }, { residency: actual }) => {
    if (!accepted) return Verdict.MET;
    if (actual === undefined) return Verdict.UNKNOWN;
    return accepted.includes(actual) ? Verdict.MET : Verdict.NOT_MET;
  },
  unanswered: () => [],
  answeredNo: () => [],
  describe: ({ residency: accepted = [] }) => accepted
};

// The user must have one of these devices.
const device: RequirementRule = {
  verdict: ({ device: accepted }, { device: actual }) => {
    if (!accepted) return Verdict.MET;
    if (actual === undefined) return Verdict.UNKNOWN;
    return accepted.includes(actual) ? Verdict.MET : Verdict.NOT_MET;
  },
  unanswered: (requirements, capabilities) =>
    device.verdict(requirements, capabilities) === Verdict.UNKNOWN ? [ABOUT_DEVICE] : [],
  answeredNo: (requirements, capabilities) =>
    device.verdict(requirements, capabilities) === Verdict.NOT_MET ? [ABOUT_DEVICE] : [],
  describe: ({ device: accepted = [] }) => accepted
};

// The order here is the order questions are asked in and requirements are described in.
const RULES: RequirementRule[] = [documents, residency, device];

const NOTHING_REQUIRED: RequirementsAssessment = {
  verdict: Verdict.MET,
  unanswered: [],
  answeredNo: []
};

const worstOf = (verdicts: Verdict[]): Verdict => {
  if (verdicts.includes(Verdict.NOT_MET)) return Verdict.NOT_MET;
  if (verdicts.includes(Verdict.UNKNOWN)) return Verdict.UNKNOWN;
  return Verdict.MET;
};

export const assessRequirements = (
  requirements: CriRequirements | undefined,
  capabilities: UserCapabilities
): RequirementsAssessment => {
  if (!requirements) return NOTHING_REQUIRED;

  return {
    verdict: worstOf(RULES.map(rule => rule.verdict(requirements, capabilities))),
    unanswered: RULES.flatMap(rule => rule.unanswered(requirements, capabilities)),
    answeredNo: RULES.flatMap(rule => rule.answeredNo(requirements, capabilities))
  };
};

export const describeRequirements = (requirements?: CriRequirements): string =>
  requirements
    ? RULES.flatMap(rule => rule.describe(requirements)).join(' + ')
    : 'no requirements';
