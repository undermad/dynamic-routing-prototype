import { isFinalDocument } from '../../shared/capabilities';
import {
  AdditionalQuestion,
  CapabilityQuestion,
  CapabilityQuestionKind,
  CriGroup,
  CriId,
  UserCapabilities
} from '../../shared/types';
import { CRI_CONFIG, CriConfig } from '../config/cri-config';
import { POLICY } from '../config/policy';
import { BestCheck, bestCheckFor } from './best-check';
import { assessRequirements, describeRequirements, Verdict } from './requirements';

export enum CriAvailability {
  // Every requirement is answered and met.
  AVAILABLE = 'AVAILABLE',
  // Available, and the only CRI in its group this user may use.
  FORCED = 'FORCED',
  // Available, but the CRI has a question of its own to put to the user first.
  NEEDS_ANSWER = 'NEEDS_ANSWER',
  // Nothing rules it out, but the user has not been asked everything it needs.
  UNKNOWN = 'UNKNOWN',
  // Ruled out by the user's own answer, which they can still be asked to reconsider.
  RECONSIDER = 'RECONSIDER',
  UNAVAILABLE = 'UNAVAILABLE'
}

// Everything the engine knows about one CRI for this user on this request: what the config
// says about it, where the user's answers leave it, and whether it has been attempted.
export interface CriState {
  cri: CriConfig;
  availability: CriAvailability;
  reason?: string;
  // What to ask the user to open this CRI up: unasked questions when UNKNOWN, the answers
  // to revisit when RECONSIDER. Empty otherwise.
  questions: CapabilityQuestion[];
  // The CRI's own question, when it is still waiting to be asked.
  additionalQuestion?: AdditionalQuestion;
  attempted: boolean;
  mandatory: boolean;
  bestCheck: BestCheck;
}

type CriStatus = Pick<CriState, 'availability' | 'reason' | 'questions' | 'additionalQuestion'>;

const unavailable = (reason: string): CriStatus => ({
  availability: CriAvailability.UNAVAILABLE,
  reason,
  questions: []
});

// The part of a "no" answer the user has not yet confirmed, as a question to put to them
// again — or undefined once they have confirmed all of it.
const askAgain = (
  question: CapabilityQuestion,
  capabilities: UserCapabilities
): CapabilityQuestion | undefined => {
  if (question.kind === CapabilityQuestionKind.DEVICE) {
    return capabilities.finalAnswers.device ? undefined : question;
  }

  const unconfirmed = question.documents.filter(
    document => !isFinalDocument(capabilities, document)
  );
  return unconfirmed.length > 0 ? { ...question, documents: unconfirmed } : undefined;
};

// Which of the answers that ruled a CRI out are worth asking again. None, once any one of
// them is confirmed in full, as the CRI then stays ruled out whatever the others become.
const worthAskingAgain = (
  answeredNo: CapabilityQuestion[],
  capabilities: UserCapabilities
): CapabilityQuestion[] => {
  const again = answeredNo.map(question => askAgain(question, capabilities));

  return again.every(question => question !== undefined) ? again : [];
};

// A CRI the user's answers rule out gets a second chance, unless they have confirmed them.
const ruledOutByAnswers = (
  reason: string,
  answeredNo: CapabilityQuestion[],
  capabilities: UserCapabilities
): CriStatus => {
  if (answeredNo.length === 0) return unavailable(reason);

  const questions = worthAskingAgain(answeredNo, capabilities);
  if (questions.length === 0) return unavailable(`${reason} — confirmed no`);

  return { availability: CriAvailability.RECONSIDER, reason, questions };
};

// A usable CRI with a question of its own waits on that question, and is ruled out by any
// answer other than the first.
const afterOwnQuestion = (
  cri: CriConfig,
  capabilities: UserCapabilities,
  status: CriStatus
): CriStatus => {
  const own = cri.askQuestions;
  if (!own) return status;

  const answer = capabilities.additionalAnswers[cri.id];

  if (answer === undefined) {
    return {
      availability: CriAvailability.NEEDS_ANSWER,
      reason: own.question,
      questions: [],
      additionalQuestion: own
    };
  }

  return answer === 0 ? status : unavailable(`answered "${own.answers[answer] ?? answer}"`);
};

const resolveStatus = (
  cri: CriConfig,
  capabilities: UserCapabilities,
  forcedInGroup: CriId | undefined
): CriStatus => {
  if (!cri.enabled) return unavailable('disabled in config');

  const forced = forcedInGroup === cri.id;
  if (forcedInGroup !== undefined && !forced) {
    return unavailable(`${forcedInGroup} is forced for this user`);
  }

  const { verdict, unanswered, answeredNo } = assessRequirements(cri.requirements, capabilities);
  const needs = describeRequirements(cri.requirements);

  switch (verdict) {
    case Verdict.NOT_MET:
      return ruledOutByAnswers(forced ? `forced, but needs ${needs}` : needs, answeredNo, capabilities);
    case Verdict.UNKNOWN:
      return {
        availability: CriAvailability.UNKNOWN,
        reason: forced ? `forced, but needs ${needs}` : 'not asked yet',
        questions: unanswered
      };
    case Verdict.MET:
      return afterOwnQuestion(
        cri,
        capabilities,
        forced
          ? {
              availability: CriAvailability.FORCED,
              reason: describeRequirements(cri.forcedWhen),
              questions: []
            }
          : { availability: CriAvailability.AVAILABLE, questions: [] }
      );
  }
};

// A CRI whose forcedWhen conditions the user meets closes the rest of its group, whether or
// not the user can actually use it and even after it has been attempted.
const forcedCriByGroup = (capabilities: UserCapabilities): Map<CriGroup, CriId> =>
  new Map(
    CRI_CONFIG.filter(
      cri =>
        cri.enabled &&
        cri.forcedWhen !== undefined &&
        assessRequirements(cri.forcedWhen, capabilities).verdict === Verdict.MET
    ).map(cri => [cri.group, cri.id])
  );

export const buildCriStates = (
  capabilities: UserCapabilities,
  attempted: CriId[]
): CriState[] => {
  const forced = forcedCriByGroup(capabilities);

  return CRI_CONFIG.map(cri => ({
    cri,
    ...resolveStatus(cri, capabilities, forced.get(cri.group)),
    attempted: attempted.includes(cri.id),
    mandatory: POLICY.MANDATORY_CHECKS.includes(cri.id),
    bestCheck: bestCheckFor(cri, capabilities)
  }));
};

// The user can be sent to this CRI as things stand, with nothing more to ask them about
// their capabilities.
export const isConfirmed = ({ availability }: CriState): boolean =>
  availability === CriAvailability.AVAILABLE ||
  availability === CriAvailability.FORCED ||
  availability === CriAvailability.NEEDS_ANSWER;

// The CRI can still be part of a route.
export const isPlannable = ({ attempted, availability }: CriState): boolean =>
  !attempted && availability !== CriAvailability.UNAVAILABLE;
