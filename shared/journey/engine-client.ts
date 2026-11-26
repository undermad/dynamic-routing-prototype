import {
  CheckOutcome,
  EngineRequest,
  EngineResult,
  IdentityResult,
  LevelOfConfidence,
  VerifiableCredential
} from '../types';

const DEFAULT_ENGINE_URL = 'http://localhost:3000';

// What the engine says about a credential it has just stored.
export interface StoredCredential {
  // How many credentials it now holds for the user.
  stored: number;
  // What the engine makes of the check behind it.
  outcome: CheckOutcome;
}

// The engine as a front end sees it: a server to call. A credential has to be stored
// before the next step is asked for, or the engine will not know about it.
export interface EngineClient {
  url: string;
  storeCredential: (userId: string, credential: VerifiableCredential) => Promise<StoredCredential>;
  credentials: (userId: string) => Promise<VerifiableCredential[]>;
  nextStep: (request: EngineRequest) => Promise<EngineResult>;
  // From the stub endpoint, not the engine proper: what the user's credentials amount to.
  identity: (userId: string, levelOfConfidence: LevelOfConfidence) => Promise<IdentityResult>;
}

export const createEngineClient = (
  url: string = process.env.ENGINE_URL ?? DEFAULT_ENGINE_URL
): EngineClient => {
  const call = async <T>(path: string, body?: unknown): Promise<T> => {
    let response: Response;

    try {
      response = await fetch(`${url}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      throw new Error(`Cannot reach the engine at ${url}. Start it with "npm run engine".`);
    }

    const answer = (await response.json()) as { error?: string };

    if (!response.ok) {
      throw new Error(`The engine answered ${response.status}: ${answer.error ?? 'no reason given'}`);
    }

    return answer as T;
  };

  const forUser = (userId: string) => `/credentials/${encodeURIComponent(userId)}`;

  return {
    url,
    storeCredential: (userId, credential) => call<StoredCredential>(forUser(userId), credential),
    credentials: userId => call<VerifiableCredential[]>(forUser(userId)),
    nextStep: request => call<EngineResult>('/next-step', request),
    identity: (userId, levelOfConfidence) =>
      call<IdentityResult>(
        `/stub/identity/${encodeURIComponent(userId)}?levelOfConfidence=${levelOfConfidence}`
      )
  };
};
