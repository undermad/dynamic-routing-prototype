import {
  CapabilityQuestion,
  CapabilityQuestionKind,
  DeviceAccess,
  DocumentType,
  UserCapabilities
} from './types';

export const NO_CAPABILITIES: UserCapabilities = {
  documents: [],
  documentsNotHeld: [],
  additionalAnswers: {},
  finalAnswers: { documents: [], device: false }
};

// Whether the user has a document: yes, no, or undefined if they have not been asked.
export const holdsDocument = (
  capabilities: UserCapabilities,
  document: DocumentType
): boolean | undefined => {
  if (capabilities.documents.includes(document)) return true;
  if (capabilities.documentsNotHeld.includes(document)) return false;
  return undefined;
};

const without = (documents: DocumentType[], removed: DocumentType[]): DocumentType[] =>
  documents.filter(document => !removed.includes(document));

const withAll = (documents: DocumentType[], added: DocumentType[]): DocumentType[] => [
  ...documents,
  ...without(added, documents)
];

// Records the answer to "which of these documents do you have?": the ones the user picked
// are held, and the rest of the ones they were asked about are not.
export const answerDocuments = (
  capabilities: UserCapabilities,
  asked: DocumentType[],
  held: DocumentType[]
): UserCapabilities => {
  const notHeld = without(asked, held);

  return {
    ...capabilities,
    documents: withAll(without(capabilities.documents, notHeld), held),
    documentsNotHeld: withAll(without(capabilities.documentsNotHeld, held), notHeld)
  };
};

const answerDevice = (capabilities: UserCapabilities, compatible: boolean): UserCapabilities => ({
  ...capabilities,
  device: compatible ? DeviceAccess.COMPATIBLE_PHONE : DeviceAccess.NO_COMPATIBLE_PHONE
});

// The user has what the question asks about — every document in it, if it lists several.
export const answerYes = (
  capabilities: UserCapabilities,
  question: CapabilityQuestion
): UserCapabilities =>
  question.kind === CapabilityQuestionKind.DOCUMENTS
    ? answerDocuments(capabilities, question.documents, question.documents)
    : answerDevice(capabilities, true);

// The user has nothing the question asks about.
export const answerNo = (
  capabilities: UserCapabilities,
  question: CapabilityQuestion
): UserCapabilities =>
  question.kind === CapabilityQuestionKind.DOCUMENTS
    ? answerDocuments(capabilities, question.documents, [])
    : answerDevice(capabilities, false);

export const isFinalDocument = (capabilities: UserCapabilities, document: DocumentType): boolean =>
  capabilities.finalAnswers.documents.includes(document);

// The user has said "no" to this question a second time, so it is not asked again.
export const markFinalAnswer = (
  capabilities: UserCapabilities,
  question: CapabilityQuestion
): UserCapabilities => ({
  ...capabilities,
  finalAnswers:
    question.kind === CapabilityQuestionKind.DOCUMENTS
      ? {
          ...capabilities.finalAnswers,
          documents: withAll(capabilities.finalAnswers.documents, question.documents)
        }
      : { ...capabilities.finalAnswers, device: true }
});
