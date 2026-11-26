import { answerNo, answerYes, markFinalAnswer } from '../../shared/capabilities';
import {
  AskOutcome,
  CapabilityQuestion,
  CapabilityQuestionKind,
  CriOption,
  RouteNeed,
  RouteQuestion
} from '../../shared/types';
import { planRoutes } from '../planning/plan-routes';
import { firstOpenStep, isConfirmedRoute, Route } from '../planning/route';
import { Shortfall } from '../planning/shortfall';
import { CriAvailability, CriState, isConfirmed } from '../state/cri-state';
import { JourneyState, withCapabilities } from '../state/journey-state';
import { unachievable } from './messages';
import { redirectOptions } from './redirect';

// The questions to put to the user in one go, and what to do if every answer is "no".
// An empty list of questions means there is nothing to ask and `otherwise` is the answer.
export interface QuestionBatch {
  questions: RouteQuestion[];
  otherwise: AskOutcome;
}

const whyUnachievable = ({ identity, attempted }: JourneyState, shortfall?: Shortfall): string =>
  unachievable(
    identity.levelOfConfidence,
    identity.outstandingMandatory.filter(criId => attempted.includes(criId)),
    shortfall
  );

const isSecondChance = (step: CriState): boolean =>
  step.availability === CriAvailability.RECONSIDER;

// With several documents to choose from, what comes next depends on which ones the user
// picks — a driving licence scores less than a passport — so "yes" is not one answer.
const hasOneYes = (question: CapabilityQuestion): boolean =>
  question.kind !== CapabilityQuestionKind.DOCUMENTS || question.documents.length === 1;

// Everything the route needs from the user that they have yet to tell us, in the order
// the route runs. A step can need more than one thing: the app needs a document and a phone.
const openNeeds = (route: Route): RouteNeed[] =>
  route.steps
    .filter(step => !isConfirmed(step))
    .flatMap(step =>
      step.questions.map(question => ({
        question,
        criId: step.cri.id,
        ...(isSecondChance(step) ? { retry: true } : {})
      }))
    );

// Where the user goes if they have everything the route needs — known only when "yes" to
// all of it settles the whole route. Otherwise core front comes back to the engine once it
// has the answers.
const redirectOnYes = (state: JourneyState, needs: RouteNeed[]): CriOption[] | undefined => {
  if (!needs.every(need => hasOneYes(need.question))) return undefined;

  const answeredYes = needs.reduce(
    (capabilities, need) => answerYes(capabilities, need.question),
    state.capabilities
  );
  const { routes } = planRoutes(withCapabilities(state, answeredYes));
  const [best] = routes;
  const settled = best !== undefined && best.steps.length > 0 && isConfirmedRoute(best);

  return settled ? redirectOptions(routes) : undefined;
};

const toRouteQuestion = (state: JourneyState, route: Route, step: CriState): RouteQuestion => {
  const [first, ...alsoNeeds] = openNeeds(route);
  const onYes = redirectOnYes(state, [first, ...alsoNeeds]);

  return {
    question: first.question,
    criId: first.criId,
    document: step.bestCheck.document,
    achieves: route.profile,
    scores: step.bestCheck.scores,
    ...(first.retry ? { retry: true } : {}),
    ...(alsoNeeds.length > 0 ? { alsoNeeds } : {}),
    ...(onYes ? { onYes } : {})
  };
};

// The journey as it stands once the user has said "no". A second "no" to a second chance
// is final, so that CRI is not offered again.
const afterNo = (
  state: JourneyState,
  step: CriState,
  question: CapabilityQuestion
): JourneyState =>
  withCapabilities(
    state,
    isSecondChance(step)
      ? markFinalAnswer(state.capabilities, question)
      : answerNo(state.capabilities, question)
  );

// Builds the batch by playing out the "no" answers: plan, take the first question the best
// route depends on, assume the user says no, and plan again. So a question is only
// included if it can still lead to an identity after "no" to all the ones before it, and
// the batch ends at whatever is left when there is nothing more to ask.
export const buildQuestionBatch = (state: JourneyState): QuestionBatch => {
  const questions: RouteQuestion[] = [];
  const asked = new Set<string>();
  let current = state;

  // Kiro did it and I like it (ancient and risky infinite loop)
  for (;;) {
    const { routes, shortfall } = planRoutes(current);
    const [best] = routes;

    if (!best || best.steps.length === 0) {
      return { questions, otherwise: { message: whyUnachievable(state, shortfall) } };
    }

    const step = firstOpenStep(best);

    if (!step) {
      const options = redirectOptions(routes);
      return {
        questions,
        otherwise: options.length > 0 ? { options } : { message: whyUnachievable(state) }
      };
    }

    const [question] = step.questions;
    const key = JSON.stringify(question);

    if (!asked.has(key)) {
      asked.add(key);
      questions.push(toRouteQuestion(current, best, step));
    }

    current = afterNo(current, step, question);
  }
};
