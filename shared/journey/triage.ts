import { answerDocuments, NO_CAPABILITIES } from '../capabilities';
import { DeviceAccess, DocumentType, Residency, UserCapabilities } from '../types';
import {
  BIOMETRIC_PASSPORT,
  CANNOT_PROVE_IDENTITY,
  DocumentsQuestion,
  haveAccessToCompatiblePhone,
  haveBiometricPassport,
  liveInUk,
  needBiometricPassport,
  Question,
  whichAlternativePhotoId,
  whichBankAccess,
  whichPhotoId
} from './questions';

export interface TriageAnswers {
  livesInUk?: boolean;
  hasBiometricPassport?: boolean;
  useBiometricPassport?: boolean;
  photoIds?: DocumentType[];
  hasCompatiblePhone?: boolean;
  bankAccess?: DocumentType[];
  alternativePhotoIds?: DocumentType[];
}

type ChoiceKey = 'livesInUk' | 'hasBiometricPassport' | 'useBiometricPassport' | 'hasCompatiblePhone';
type DocumentsKey = 'photoIds' | 'bankAccess' | 'alternativePhotoIds';

// A step answered by picking one option.
export interface ChoiceStep {
  kind: 'choice';
  id: ChoiceKey;
  prompt: string;
  hint?: string;
  options: ReadonlyArray<{ label: string; value: boolean }>;
  askWhen: (answers: TriageAnswers) => boolean;
}

// A step answered by picking every one of these documents the user has, or none.
export interface DocumentsStep {
  kind: 'documents';
  id: DocumentsKey;
  prompt: string;
  hint?: string;
  documents: DocumentType[];
  askWhen: (answers: TriageAnswers) => boolean;
}

export type TriageStep = ChoiceStep | DocumentsStep;

const choice = (
  id: ChoiceKey,
  question: Question,
  askWhen: ChoiceStep['askWhen']
): ChoiceStep => ({
  kind: 'choice',
  id,
  prompt: question.question,
  hint: question.hint,
  options: [
    { label: question.answers[0], value: true },
    { label: question.answers[1], value: false }
  ],
  askWhen
});

const documents = (
  id: DocumentsKey,
  question: DocumentsQuestion,
  askWhen: DocumentsStep['askWhen']
): DocumentsStep => ({
  kind: 'documents',
  id,
  prompt: question.question,
  hint: question.hint,
  documents: question.documents,
  askWhen
});

const livesInUk = (a: TriageAnswers) => a.livesInUk === true;
const livesAbroad = (a: TriageAnswers) => a.livesInUk === false;
const hasPhotoId = (a: TriageAnswers) => a.photoIds !== undefined && a.photoIds.length > 0;
const hasNoPhotoId = (a: TriageAnswers) => a.photoIds !== undefined && a.photoIds.length === 0;


// The photo ID a web check accepts. Anything else on the photo ID page needs the app.
const WEB_CHECK_PHOTO_IDS = [DocumentType.UK_PASSPORT, DocumentType.UK_DRIVING_LICENCE];

const canUseWebCheck = (a: TriageAnswers) =>
  a.photoIds !== undefined && a.photoIds.some(document => WEB_CHECK_PHOTO_IDS.includes(document));

// The form walks the ways to prove an identity from the most preferred down: the app, a
// web check, the user's bank, then the Post Office. Each is only asked about once the
// ones before it are ruled out, so reaching a page means the earlier ways are closed.
const appAndWebRuledOut = (a: TriageAnswers) =>
  hasNoPhotoId(a) || (hasPhotoId(a) && a.hasCompatiblePhone === false && !canUseWebCheck(a));

const bankRuledOut = (a: TriageAnswers) => a.bankAccess !== undefined && a.bankAccess.length === 0;

// Someone abroad who says they have no biometric passport is shown a page telling them
// one is required, where they can either say they will use one after all or give up. So
// anyone abroad still in the journey has a biometric passport.
const hasBiometricPassport = (a: TriageAnswers) =>
  a.hasBiometricPassport === true || a.useBiometricPassport === true;

const TRIAGE_FLOW: TriageStep[] = [
  choice('livesInUk', liveInUk, () => true),
  choice('hasBiometricPassport', haveBiometricPassport, livesAbroad),
  choice(
    'useBiometricPassport',
    needBiometricPassport,
    a => livesAbroad(a) && a.hasBiometricPassport === false
  ),
  documents('photoIds', whichPhotoId, livesInUk),
  choice(
    'hasCompatiblePhone',
    haveAccessToCompatiblePhone,
    a => (livesInUk(a) && hasPhotoId(a)) || (livesAbroad(a) && hasBiometricPassport(a))
  ),
  documents('bankAccess', whichBankAccess, a => livesInUk(a) && appAndWebRuledOut(a)),
  documents(
    'alternativePhotoIds',
    whichAlternativePhotoId,
    a => livesInUk(a) && appAndWebRuledOut(a) && bankRuledOut(a)
  )
];

export const nextTriageStep = (answers: TriageAnswers): TriageStep | undefined =>
  TRIAGE_FLOW.find(step => step.askWhen(answers) && answers[step.id] === undefined);

export const triageFailure = (answers: TriageAnswers): string | undefined =>
  answers.useBiometricPassport === false ? CANNOT_PROVE_IDENTITY : undefined;

export const applyAnswer = (
  answers: TriageAnswers,
  step: ChoiceStep,
  optionIndex: number
): TriageAnswers => {
  const option = step.options[optionIndex];
  return option ? { ...answers, [step.id]: option.value } : answers;
};

export const applyDocuments = (
  answers: TriageAnswers,
  step: DocumentsStep,
  held: DocumentType[]
): TriageAnswers => ({ ...answers, [step.id]: held });

const residencyOf = (answers: TriageAnswers): Residency | undefined => {
  if (answers.livesInUk === undefined) return undefined;
  return answers.livesInUk ? Residency.UK : Residency.INTERNATIONAL;
};

const deviceOf = (answers: TriageAnswers): DeviceAccess | undefined => {
  if (answers.hasCompatiblePhone === undefined) return undefined;
  return answers.hasCompatiblePhone
    ? DeviceAccess.COMPATIBLE_PHONE
    : DeviceAccess.NO_COMPATIBLE_PHONE;
};

// Every document question the user has answered so far, as the documents it asked about
// and the ones the user said they have.
const documentAnswers = (
  answers: TriageAnswers
): { asked: DocumentType[]; held: DocumentType[] }[] => {
  const answered: { asked: DocumentType[]; held: DocumentType[] }[] = [];

  if (answers.photoIds !== undefined) {
    answered.push({ asked: whichPhotoId.documents, held: answers.photoIds });
  }
  if (answers.bankAccess !== undefined) {
    answered.push({ asked: whichBankAccess.documents, held: answers.bankAccess });
  }
  if (answers.alternativePhotoIds !== undefined) {
    answered.push({ asked: whichAlternativePhotoId.documents, held: answers.alternativePhotoIds });
  }
  if (answers.hasBiometricPassport !== undefined || answers.useBiometricPassport !== undefined) {
    answered.push({
      asked: [BIOMETRIC_PASSPORT],
      held: hasBiometricPassport(answers) ? [BIOMETRIC_PASSPORT] : []
    });
  }

  return answered;
};

// What the engine is told about the user: the specific documents they have and have not,
// whichever question they were asked about them in.
export const toCapabilities = (answers: TriageAnswers): UserCapabilities =>
  documentAnswers(answers).reduce<UserCapabilities>(
    (capabilities, { asked, held }) => answerDocuments(capabilities, asked, held),
    { ...NO_CAPABILITIES, residency: residencyOf(answers), device: deviceOf(answers) }
  );
