# IPV Dynamic Prototype

A prototype of dynamic routing for identity proving journeys. An engine looks at two things:
the verifiable credentials already issued to a user by credential issuers (CRIs), and what
the user has told us about themselves, such as where they live, which documents they have
and whether they have a smartphone. From those it works out the next step towards a GPG45
identity profile. Two front ends talk to it over HTTP: a website (`core-front/`) and a CLI (`cli/`).

## How to run it

Node 22 or later.

```bash
npm install
```

Start the engine:

```bash
npm run engine
```

Then, in a second terminal, the website at http://localhost:3001:

```bash
npm run web
```

or the CLI:

```bash
npm run cli
```

## Engine

A stateless HTTP server (`engine/`). It is driven by data: the CRI config, the user's
answers, and the credentials it holds for them.

### CRI config

`engine/config/cri-config.ts` has one entry per credential issuer (CRI):

| Field | Meaning |
|---|---|
| `id` | Which CRI this is |
| `enabled` | Set to `false` to take the CRI out of every journey |
| `group` | The kind of CRI: identity, document, address, fraud or verification |
| `weight` | How much we like it; a smaller number is preferred |
| `lastResort` | Optional. Use it only when no other way works (the Post Office) |
| `provides` | The results it can return, and the scores each one awards |
| `requires` | Identity data (name, date of birth, address) it needs before it can run |
| `collects` | Identity data it gathers |
| `requirements` | Optional. What the user needs to use it: one of the listed documents, a device, a residency |
| `forcedWhen` | Optional. When this is met, it is the only CRI in its group the user may use (the app, for users abroad) |
| `askQuestions` | Optional. A question of its own to put to the user before they go there; any answer but the first rules it out |

Adding or changing a CRI is a change to this file.

### How a response is generated

On each `POST /next-step` the engine:

1. Scores the user's credentials and checks them against the profiles for the requested level.
2. Works out the state of every CRI from the user's capabilities (see below).
3. Finds every set of remaining CRIs that would reach a profile, and ranks them by
   preference.
4. Answers from the best route:

| Response | When |
|---|---|
| `COMPLETE` | The credentials already meet a profile |
| `REDIRECT` | The best route needs nothing more from the user: go to its first CRI |
| `ASK` | The best routes depend on things the user has not said yet: here are the questions |
| `STOP` | No route is left |

Credentials are stored with `POST /credentials/:userId` before asking for the next step.

### User capabilities and CRI states

User capabilities are what the person has told us about themselves. The front end collects
them and sends them with every request:

| Capability | Meaning |
|---|---|
| `residency` | Where they live: the UK or abroad |
| `device` | Whether they have a smartphone they can use |
| `documents` | The documents they said they have |
| `documentsNotHeld` | The documents they were asked about and said they do not have |
| `additionalAnswers` | Their answers to questions a CRI asks for itself |
| `finalAnswers` | The "no" answers they have confirmed a second time |

Anything missing has not been asked about yet, which is what lets the engine ask.

The engine compares these with each CRI's `requirements` and gives the CRI a state:

| State | Meaning | When |
|---|---|---|
| Available | The person can use it | They have everything it needs |
| Forced | They can use it, and it is the only one in its group they may use | Its `forcedWhen` is met |
| Ask first | They can use it, but it has a question of its own to ask first | It has `askQuestions`, not yet answered |
| Not asked | We do not know yet | Something it needs has not been asked about |
| Second chance | Their answer ruled it out, but it can be offered once more | They said "no" to what it needs |
| Ruled out | It cannot be used | It is disabled, they confirmed the "no", they declined its own question, or another CRI in its group is forced |
| Attempted | They have already been to it, so it is not offered again | The front end lists it in `attempted` |

Only CRIs that are not ruled out and not attempted go into the ways the engine considers.

### How the engine picks the next CRI

The engine does not choose one CRI at a time. It lists every way this person could finish
proving who they are, each way being the full list of CRIs still to visit. It then picks
the best way and sends the person to its first CRI.

To pick the best way it asks these questions, in order. As soon as one question separates
two ways, it stops and does not ask the rest.

1. **Does this way go back to something the person already said no to?**
   If they said "I don't have a smartphone", any way that needs a smartphone goes to the
   back of the queue. It is only offered again when nothing else is left.

2. **Does this way send them to the Post Office?**
   Going to a Post Office in person is the most effort, so any way that avoids it comes
   first. (In the config this is `lastResort`.)

3. **How many CRIs do they have to visit?**
   A way with three CRIs beats a way with four.

4. **Which way do we like more?**
   Each CRI has a number we chose, where smaller means "we would prefer people use this".
   The numbers for all the CRIs on a way are added up, and the smaller total wins. The app
   has the smallest number and the Post Office the largest. (In the config this is `weight`.)

5. **Which kind of identity does it lead to?**
   The policy lists the acceptable GPG45 profiles in the order we prefer them. If two ways
   are still level, the one that leads to the profile higher up that list wins.

Two things are deliberately not on that list:

- **How much a CRI scores.** Scores decide whether a way reaches an identity at all. Among
  the ways that do, a higher-scoring CRI is not preferred for it. It can still win at
  question 3, because a CRI that awards more can make the way shorter: the app gives
  verification as well as evidence, so it needs no separate security-questions CRI.
- **Whether the person has been asked yet.** If the best way needs a document or a phone
  they have not mentioned, the engine asks about it. It does not settle for a lesser way
  just because that one could start straight away.

For example, someone with a UK passport who has not been asked about a phone. The app and
the web passport check both lead to an identity. The app way has fewer CRIs, so it is the
best way, and the engine asks about the phone. "Yes" sends them to the app. "No" puts the
app at the back of the queue (question 1), and the web passport check is next.

### The order of CRIs within a way

A CRI can only run once the identity data it needs has been collected, so the address
check comes after a CRI that collects a name and date of birth, and the fraud check comes
after the address. When several CRIs are ready at once, the mandatory one (fraud) goes
first, then the one with the smaller number.

## Core-front

An Express server (`core-front/`) that keeps the user's answers in a session and shows one
page at a time. Each page is rendered with Nunjucks and GOV.UK components; each answer is
saved, and when nothing is left to ask, core-front calls the engine and shows whatever it
answers: a question, a CRI, or the end of the journey. A stub page stands in for each CRI
and lets you pick the result it returns.

The CLI is the same journey in a terminal, with tables showing what the engine sees.
