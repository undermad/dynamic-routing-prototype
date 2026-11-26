// The triage questions: what the user is asked before the engine plans anything.
import { DocumentType } from '../types';

export interface Question {
  question: string;
  // A line under the question that helps the user answer it.
  hint?: string;
  answers: readonly string[];
}

// A question about several documents, answered by picking every one the user has.
export interface DocumentsQuestion {
  question: string;
  hint?: string;
  documents: DocumentType[];
}

export const NONE_OF_THE_ABOVE = 'None of the above';

export const liveInUk: Question = {
  question: 'Where do you live?',
  hint: 'How you can prove your identity depends on where you live.',
  answers: ['In the UK', 'In another country']
};

export const BIOMETRIC_PASSPORT = DocumentType.NON_UK_PASSPORT_WITH_BIOMETRIC_CHIP;

export const haveBiometricPassport: Question = {
  question: 'Do you have a passport with a biometric chip?',
  hint: 'A biometric passport has a small gold camera symbol on the front cover.',
  answers: ['Yes', 'No']
};

export const whichPhotoId: DocumentsQuestion = {
  question: 'Which of these types of photo ID do you have?',
  hint: 'The photo ID must be in date.',
  documents: [
    DocumentType.UK_PASSPORT,
    DocumentType.NON_UK_PASSPORT_WITH_BIOMETRIC_CHIP,
    DocumentType.UK_DRIVING_LICENCE,
    DocumentType.UK_BRP
  ]
};

export const whichBankAccess: DocumentsQuestion = {
  question: 'Can you use your bank to prove your identity?',
  hint: 'You can prove your identity through online banking or a UK bank account.',
  documents: [DocumentType.ONLINE_BANKING, DocumentType.BANK_ACCOUNT]
};

export const whichAlternativePhotoId: DocumentsQuestion = {
  question: 'Which of these types of photo ID could you take to a Post Office?',
  hint: 'You can prove your identity in person at a Post Office.',
  documents: [
    DocumentType.EU_DRIVING_LICENCE,
    DocumentType.NON_UK_PASSPORT,
    DocumentType.NATIONAL_IDENTITY_CARD
  ]
};

export const haveAccessToCompatiblePhone: Question = {
  question: 'Do you have a smartphone you can use?',
  hint: 'An iPhone or Android phone that can run the GOV.UK One Login app.',
  answers: ['Yes', 'No']
};

export const needBiometricPassport: Question = {
  question: 'You need a passport with a biometric chip to prove your identity from outside the UK',
  hint: 'Without one, you cannot continue.',
  answers: ['I have one and will use it', 'I do not have one']
};

export const CANNOT_PROVE_IDENTITY =
  'You cannot prove your identity from outside the UK without a passport with a biometric chip.';
