// Core front as a website: an Express server that renders each step of the journey with
// Nunjucks and asks the engine, over HTTP, what comes next. A prototype, so the session is
// kept in memory and there is no CSRF or other protection.
//
// What each page asks and what an answer changes are shared with the CLI; this file and
// pages.ts are only about serving and drawing them.
//
//   npm run web          start on port 3001 (PORT overrides); needs `npm run engine`
//
//   GET  /               choose the level of confidence and start
//   GET  /journey        the page the user is on
//   POST /journey        their answer to it
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import express, { ErrorRequestHandler, Express } from 'express';
import session from 'express-session';
import nunjucks from 'nunjucks';
import {
  answerPage,
  askEngine,
  createEngineClient,
  currentPage,
  EngineClient,
  Exchange,
  failureNotice,
  LEVELS,
  Session as Journey,
  startSession,
  takeEngineResult
} from '../shared/journey/journey';
import { Action } from '../shared/types';
import { identityStubView, IdentityStubView, readForm, START, View, viewOf } from './pages';

const DEFAULT_PORT = 3001;
const NODE_MODULES = path.join(__dirname, '..', 'node_modules');
const GOVUK_FRONTEND = path.join(NODE_MODULES, 'govuk-frontend', 'dist');
const ONE_LOGIN = path.join(NODE_MODULES, '@govuk-one-login');

declare module 'express-session' {
  interface SessionData {
    journey?: Journey;
    // The last thing sent to the engine and what it said, shown on each page.
    exchange?: Exchange;
  }
}

export interface AppOptions {
  engine?: EngineClient;
}

export const createApp = ({ engine = createEngineClient() }: AppOptions = {}): Express => {
  const app = express();

  const views = nunjucks.configure([path.join(__dirname, 'views'), GOVUK_FRONTEND, ONE_LOGIN], {
    autoescape: true,
    // Templates are read afresh each time, so an edit shows up without a restart.
    noCache: true,
    express: app
  });
  views.addGlobal('MAY_2025_REBRAND_ENABLED', true);
  views.addFilter('json', (value: unknown) => JSON.stringify(value, null, 2));

  app.use('/assets', express.static(path.join(GOVUK_FRONTEND, 'govuk', 'assets')));
  app.use('/govuk', express.static(path.join(GOVUK_FRONTEND, 'govuk')));
  app.use('/frontend-ui', express.static(path.join(ONE_LOGIN, 'frontend-ui', 'build')));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: 'prototype', resave: false, saveUninitialized: false }));

  app.get('/', (_request, response) => {
    response.render('radios.njk', { view: START, action: '/' });
  });

  // Starts a journey as a new user, since the engine keeps a user's credentials for as
  // long as it is up. The engine is asked straight away: if the level cannot be reached by
  // anyone there is no point asking the triage questions.
  app.post('/', async (request, response) => {
    const level = LEVELS.find(value => value === request.body?.answer);

    if (!level) {
      response.status(400).render('radios.njk', { view: START, action: '/', error: 'Select a level' });
      return;
    }

    const journey = startSession(`user-${randomUUID().slice(0, 8)}`, level);
    const exchange = await askEngine(journey, engine);

    request.session.exchange = exchange;
    request.session.journey =
      exchange.result.action === Action.STOP ? takeEngineResult(journey, exchange.result) : journey;
    response.redirect(303, '/journey');
  });

  const render = (
    response: express.Response,
    view: View | IdentityStubView,
    context: {
      journey: Journey;
      exchange?: Exchange;
      error?: string;
      fieldErrors?: (string | undefined)[];
      notice?: string;
    }
  ) => response.render(`${view.template}.njk`, { view, action: '/journey', ...context });

  app.get('/journey', async (request, response) => {
    let { journey } = request.session;

    if (!journey) {
      response.redirect('/');
      return;
    }

    // With nothing pending the engine is asked what comes next. It can take a second go
    // when every CRI it offered has been declined.
    for (let asked = 0; currentPage(journey).kind === 'ask-engine'; asked++) {
      if (asked === 3) throw new Error('The engine keeps answering with nothing to do.');

      const exchange = await askEngine(journey, engine);
      journey = takeEngineResult(journey, exchange.result);
      request.session.exchange = exchange;
      request.session.journey = journey;
    }

    const page = currentPage(journey);
    const { exchange } = request.session;

    // The engine only said the identity was reached. What it is made of comes from the
    // identity stub, which core front asks once the user has been told.
    if (page.kind === 'result') {
      const identity = await engine.identity(journey.userId, journey.requiredLevelOfConfidence);
      render(response, identityStubView(identity), { journey, exchange });
      return;
    }

    render(response, viewOf(page), {
      journey,
      exchange,
      notice: failureNotice(page, journey.failed)
    });
  });

  app.post('/journey', async (request, response) => {
    const { journey, exchange } = request.session;

    if (!journey) {
      response.redirect('/');
      return;
    }

    const page = currentPage(journey);

    // Nothing to answer here, for example after going back in the browser.
    if (page.kind === 'ask-engine' || page.kind === 'result') {
      response.redirect(303, '/journey');
      return;
    }

    const view = viewOf(page);
    const parsed = readForm(view, request.body);

    if ('error' in parsed) {
      response.status(400);
      render(response, view, {
        journey,
        exchange,
        error: parsed.error,
        fieldErrors: parsed.fieldErrors,
        notice: failureNotice(page, journey.failed)
      });
      return;
    }

    request.session.journey = await answerPage(journey, page, parsed.submitted, engine);
    response.redirect(303, '/journey');
  });

  const onError: ErrorRequestHandler = (error, _request, response, _next) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(error);

    response.status(500).render('stop.njk', {
      view: { template: 'stop', title: 'Sorry, there is a problem with the prototype', message }
    });
  };
  app.use(onError);

  return app;
};

if (require.main === module) {
  const port = Number(process.env.PORT) || DEFAULT_PORT;

  createApp().listen(port, () => {
    console.log(`Core front listening on http://localhost:${port}`);
  });
}
