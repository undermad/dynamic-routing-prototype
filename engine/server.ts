// The engine as a process of its own: a plain HTTP server on localhost, with no encryption
// or authentication. It holds the credential store for now, so whoever stands in for the
// CRIs stores each credential here before asking for the next step.
//
//   npm run engine                 start on port 3000 (PORT overrides)
//
//   POST /credentials/:userId      store one credential           → 201, { stored, outcome }
//   GET  /credentials/:userId      the credentials held           → 200
//   POST /next-step                an EngineRequest               → 200, an EngineResult
//   GET  /health                                                  → 200
//
//   GET  /stub/identity/:userId?levelOfConfidence=P2   a stub, not the engine: what the
//                                                       user's credentials amount to
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { createEvcs } from './evcs/evcs';
import { EngineRequest, LevelOfConfidence, VerifiableCredential } from '../shared/types';
import { createEngine } from './engine';
import { outcomeOf } from './state/identity-state';
import { identityResult } from './stub/identity-result';

const DEFAULT_PORT = 3000;

// A request the caller got wrong, as opposed to something going wrong here.
class BadRequest extends Error {}

interface Reply {
  status: number;
  body: unknown;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readJson = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new BadRequest('The request body is not valid JSON.');
  }
};

const toEngineRequest = (body: unknown): EngineRequest => {
  if (!isObject(body)) throw new BadRequest('The request body must be a JSON object.');

  const missing = [
    typeof body.userId === 'string' ? undefined : 'userId',
    isObject(body.capabilities) ? undefined : 'capabilities',
    Object.values(LevelOfConfidence).includes(body.requiredLevelOfConfidence as LevelOfConfidence)
      ? undefined
      : 'requiredLevelOfConfidence',
    Array.isArray(body.attempted) ? undefined : 'attempted'
  ].filter(field => field !== undefined);

  if (missing.length > 0) {
    throw new BadRequest(`Missing or invalid: ${missing.join(', ')}.`);
  }

  return body as unknown as EngineRequest;
};

const toCredential = (body: unknown): VerifiableCredential => {
  if (!isObject(body) || typeof body.cri !== 'string' || typeof body.successful !== 'boolean') {
    throw new BadRequest('A credential needs at least "cri" and "successful".');
  }

  return body as unknown as VerifiableCredential;
};

export interface EngineServerOptions {
  log?: (line: string) => void;
}

export const createEngineServer = ({ log = console.log }: EngineServerOptions = {}): Server => {
  const evcs = createEvcs();
  const engine = createEngine(evcs);

  const route = async (request: IncomingMessage): Promise<Reply> => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    const [resource, id, ...rest] = pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const method = request.method ?? 'GET';

    if (method === 'GET' && resource === 'health' && id === undefined) {
      return { status: 200, body: { status: 'ok' } };
    }

    if (method === 'POST' && resource === 'next-step' && id === undefined) {
      return { status: 200, body: engine.processRequest(toEngineRequest(await readJson(request))) };
    }

    if (resource === 'credentials' && id !== undefined && rest.length === 0) {
      if (method === 'GET') return { status: 200, body: evcs.fetch(id) };

      if (method === 'POST') {
        // The caller is told what the engine makes of the check — passed, failed, or
        // failed in a way the policy tolerates — so it can tell the user before it asks
        // what comes next.
        const credential = toCredential(await readJson(request));
        evcs.store(id, credential);

        return {
          status: 201,
          body: { stored: evcs.fetch(id).length, outcome: outcomeOf(credential) }
        };
      }
    }

    // A stub, apart from the engine proper: what the user's credentials amount to.
    if (method === 'GET' && resource === 'stub' && id === 'identity' && rest.length === 1) {
      const level = new URL(request.url ?? '/', 'http://localhost').searchParams.get(
        'levelOfConfidence'
      );

      if (!Object.values(LevelOfConfidence).includes(level as LevelOfConfidence)) {
        throw new BadRequest('Missing or invalid: levelOfConfidence.');
      }

      return { status: 200, body: identityResult(evcs, rest[0], level as LevelOfConfidence) };
    }

    return { status: 404, body: { error: `Nothing at ${method} ${pathname}.` } };
  };

  const answer = async (request: IncomingMessage): Promise<Reply> => {
    try {
      return await route(request);
    } catch (error) {
      if (error instanceof BadRequest) return { status: 400, body: { error: error.message } };

      log(`  ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      return { status: 500, body: { error: 'The engine could not answer this request.' } };
    }
  };

  return createServer((request: IncomingMessage, response: ServerResponse) => {
    void answer(request).then(({ status, body }) => {
      log(`${request.method} ${request.url} → ${status}`);
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    });
  });
};

if (require.main === module) {
  const port = Number(process.env.PORT) || DEFAULT_PORT;

  createEngineServer().listen(port, () => {
    console.log(`Engine listening on http://localhost:${port}`);
  });
}
