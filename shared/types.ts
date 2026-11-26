export enum IdentityData {
  NAME = 'NAME',
  DOB = 'DOB',
  ADDRESS = 'ADDRESS'
}

export enum ScoreType {
  STRENGTH = 'strength',
  VALIDITY = 'validity',
  FRAUD = 'fraud',
  ACTIVITY = 'activity',
  VERIFICATION = 'verification'
}

export enum LevelOfConfidence {
  // LOW = 'P1', see policy.ts
  MEDIUM = 'P2'
  // HIGH = 'P3' see policy.ts
}

export enum DocumentType {
  UK_PASSPORT = "UK passport",
  NON_UK_PASSPORT_WITH_BIOMETRIC_CHIP = "Non UK passport with biometric chip",
  NON_UK_PASSPORT = "Non UK passport",
  UK_DRIVING_LICENCE = "UK driving licence",
  EU_DRIVING_LICENCE = "EU driving licence",
  UK_BRP = "UK Biometric residence permit",
  UK_BRC = "UK Biometric residence card",
  UK_FWP = "UK Frontier worker permit",
  NATIONAL_IDENTITY_CARD = "National Identity Card",
  BANK_ACCOUNT = "UK bank account",
  ONLINE_BANKING = "Online banking",
  NATIONAL_INSURANCE_NUMBER = "National Insurance number"
}

export enum Residency {
  UK = 'UK',
  INTERNATIONAL = 'INTERNATIONAL'
}

export enum DeviceAccess {
  COMPATIBLE_PHONE = 'COMPATIBLE_PHONE',
  NO_COMPATIBLE_PHONE = 'NO_COMPATIBLE_PHONE'
}

export interface UserCapabilities {
  residency?: Residency;
  device?: DeviceAccess;
  // The documents the user has told us they have.
  documents: DocumentType[];
  // The documents the user was asked about and said they do not have. A document in
  // neither list has not been asked about yet.
  documentsNotHeld: DocumentType[];
  // The answer index the user gave to a CRI's own additional question. 0 is the first
  // answer, which is the one that keeps the CRI in play.
  additionalAnswers: Partial<Record<CriId, number>>;
  // "No" answers the user has given a second time, which are not asked about again.
  finalAnswers: { documents: DocumentType[]; device: boolean };
}

export enum CapabilityQuestionKind {
  DOCUMENTS = 'DOCUMENTS',
  DEVICE = 'DEVICE'
}

export type CapabilityQuestion =
  // Which of these documents does the user have? Any one of them is enough. With a single
  // document this is a yes/no question.
  | { kind: CapabilityQuestionKind.DOCUMENTS; documents: DocumentType[] }
  | { kind: CapabilityQuestionKind.DEVICE };

// A question a CRI needs answered before it runs, which does not change whether the CRI
// is the best choice — only whether this user ends up taking it. Answering with the first
// option keeps the CRI; any other answer rules it out and the next option is tried.
export interface AdditionalQuestion {
  question: string;
  answers: string[];
}

export interface CriOption {
  criId: CriId;
  document?: DocumentType;
  question?: AdditionalQuestion;
}

// Something a route needs from the user that they have yet to tell us, and the CRI on the
// route that needs it.
export interface RouteNeed {
  question: CapabilityQuestion;
  criId: CriId;
  // The user has already said no to this once.
  retry?: boolean;
}

// One way to an identity, as the first thing it needs from the user. Where the route
// needs more than that — a second document for another check, or a phone as well as a
// document — the rest is in `alsoNeeds`, so it can all be asked together.
export interface RouteQuestion extends RouteNeed {
  document?: DocumentType;
  achieves: string;
  scores: Partial<Record<ScoreType, number>>;
  alsoNeeds?: RouteNeed[];
  // Where to send the user if they have everything the route needs. Absent when that
  // depends on which documents they have, and the engine has to be asked again.
  onYes?: CriOption[];
}

export type AskOutcome = { options: CriOption[] } | { message: string };

export enum CriGroup {
  IDENTITY = 'IDENTITY',
  DOCUMENT = 'DOCUMENT',
  ADDRESS = 'ADDRESS',
  FRAUD = 'FRAUD',
  VERIFICATION = 'VERIFICATION'
}

export enum CriId {
  CLAIMED_IDENTITY = 'claimed-identity',
  APP = "app",
  F2F = "F2F",
  WEB_PASSPORT = 'web-passport',
  WEB_DL = 'web-dl',
  ADDRESS = 'address',
  FRAUD = 'fraud',
  KBV = 'kbv',
  DWP_KBV = 'dwp-kbv',
  BAV = 'bav',
  NINO = 'nino',
  OPEN_BANKING = 'open-banking'
}

export interface Evidence {
  strength: number;
  validity: number;
}

export interface Gpg45Scores {
  evidences: Evidence[];
  activity: number;
  fraud: number;
  verification: number;
}

export type TargetProfiles = Record<string, Gpg45Scores>;

export interface CriCheck {
  label: string;
  document?: DocumentType;
  scores: Partial<Record<ScoreType, number>>;
  biometricVerificationProcessLevel?: number;
  nonFatalFraudFailure?: boolean;
}

export interface CriChecks {
  collects: IdentityData[];
  successful: CriCheck[];
  failed: CriCheck[];
}

export interface VerifiableCredential {
  cri: CriId;
  check: string;
  successful: boolean;
  document?: DocumentType;
  scores: Partial<Record<ScoreType, number>>;
  biometricVerificationProcessLevel?: number;
  nonFatalFraudFailure?: boolean;
  collected: IdentityData[];
  contraIndicators: string[];
}

// What the engine makes of a credential. A check can fail in a way the policy tolerates:
// it counts as done, though it scores nothing.
export enum CheckOutcome {
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  TOLERATED = 'TOLERATED'
}

export interface CredentialStore {
  store: (userId: string, credential: VerifiableCredential) => void;
  fetch: (userId: string) => VerifiableCredential[];
}

export interface EngineRequest {
  userId: string;
  capabilities: UserCapabilities;
  requiredLevelOfConfidence: LevelOfConfidence;
  attempted: CriId[];
}

// What a user's credentials amount to at a level of confidence. The engine does not send
// this with its answers; it comes from a stub endpoint that stands in for wherever a
// finished identity would be read from.
export interface IdentityResult {
  levelOfConfidence: LevelOfConfidence;
  // The profile met, or nothing if the credentials do not yet make an identity.
  profile?: string;
  scores: Gpg45Scores;
  credentials: VerifiableCredential[];
}

export enum Action {
  COMPLETE = 'COMPLETE',
  REDIRECT = 'REDIRECT',
  ASK = 'ASK',
  STOP = 'STOP'
}

export type EngineResult =
  | { action: Action.COMPLETE; message: string }
  | { action: Action.REDIRECT; options: CriOption[] }
  | { action: Action.ASK; questions: RouteQuestion[]; otherwise: AskOutcome }
  | { action: Action.STOP; message: string };

export interface Engine {
  processRequest: (request: EngineRequest) => EngineResult;
}
