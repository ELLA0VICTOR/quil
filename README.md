# Quil

**Your next client. Already in sight.**

A conversational sales crew for freelancers and small agencies: discover relevant businesses, investigate their website situation, review evidence, and prepare a thoughtful introduction.

## Current implementation

The frontend is built with React, TypeScript, Vite and Three.js. A separate local TypeScript backend now runs the crew through Mozaik:

- Brisk automatic rotation and a repeating 5.2-second cube/tree cycle, cursor-directed rotation and particle distortion, a star field, an unobstructed rippling floor and a reflection. No manual shape controls or orbital rings.
- An open landing-page layout with fine dividers, an animated SVG crew, and working internal footer navigation.
- A conversational app led by Quil, with Pip (scouting), Milo (research), Iris (review) and Wren (writing).
- Tiny original SVG characters walk between positions, exchange observations and react to the current example phase. No emoji, sprite-sheet download or generated image is used.
- Plain-language input and teammate introductions. Server events update five colour-matched contributions in a connected layout, converging into one shared result rather than a long stream of status messages.
- Pause/resume, one primary opportunity, expandable reasons for the businesses set aside, inline evidence and editable drafts.
- Browser-local saved prospects, CSV export with editable introductions and source records, clipboard copying and keyboard-accessible saved/about panels.
- Editable tailored offers: source-based rationale, suggested scope, existing-site position, open commercial terms, follow-up drafts and a meeting agenda. Wren develops the angle/scope alongside the introduction within the same bounded model request.
- Optional Gmail and Google Calendar connection for reviewed sends, reply-aware follow-ups, availability suggestions and invitations. Account setup is separate: [Google connection guide](docs/GOOGLE-SETUP.md).

**The chat is connected to the backend.** `src/hooks/useCrewRuns.ts` consumes server events through `src/lib/api.ts`; agent activity, corrections, sources, introductions and the single final answer come from the run. There is no timed frontend mission script or local sample-data fallback. Default fixture mode still uses fictional records without paid inference.

**Development and review are local-only. Do not publish, push for hosting, or redeploy without the owner's explicit instruction.**

## Run

Use Node.js 24+ and npm:

```sh
npm install
npm run dev:all
```

This starts the local UI and API together. Open the URL Vite prints. Existing servers are detected instead of launching duplicates. For frontend and API hot reload in separate terminals, use `npm run dev` and `npm run dev:api`. Select **Try now** to meet the crew. **Or try a little example** explicitly requests a free backend fixture run, including when the server is configured for live use. Ordinary chat briefs follow the server's configured mode. Tap a character to hear their introduction. The pause button pauses server publication; **Continue the search** resumes it. **Cancel search** aborts it, and **New conversation** cancels unfinished work before clearing the view.

The current run reconnects after a refresh using a tab-scoped run token. This resumes/replays the same run rather than submitting a new one. Saved businesses include their actual returned sources and edited introductions, persist in this browser and can be exported as CSV. Server failures show an error; they never substitute a frontend demonstration.

```sh
npm run build
npm run preview
```

Production output is in `dist/`. Hash routing keeps `/#/workspace` compatible with static hosting.

## Backend package

Start the API in a second terminal. No key is needed for its default fixture mode:

```sh
npm run start:api
npm run demo:api
```

Run the second command in another terminal while the API is running. For automatic backend reloads, use `npm run dev:api`. The API binds to `127.0.0.1:8787`; Vite proxies `/api` locally. No deployment or external publication is performed.

- `server/engine.ts`: five Mozaik agents, shared runtime state, event-driven coordination and actual agent loops.
- `server/providers.ts`: deterministic fixture provider, bounded GPT-6 Luna Responses adapter and cached Serper search adapter.
- `server/store.ts`: SQLite run records, event replay, conservative spending reservations and cache.
- `server/http.ts`: run creation, authenticated run access, SSE, pause/resume and cancellation.
- `shared/mission.ts`: browser/server protocol. Run access tokens are returned only when creating a run; only their hashes are stored.

Mozaik is pinned to **4.2.0-beta.18**. This published package uses `defineRuntime`, `createSpace`, runtime participants, and `defineAgentModule` / `createLoop` / `runLoop`. Its published API differs from examples on the development branch; implementation follows the installed package.

```mermaid
flowchart TD
  Brief[Your brief] --> Pip[Pip: discover]
  Pip --> Milo[Milo: business / website investigation]
  Pip --> Iris[Iris: independent review]
  Milo --> Recheck[Iris: reconcile website evidence]
  Iris --> Recheck
  Milo --> Wren[Wren: provisional draft]
  Recheck --> Review{Evidence changed?}
  Review -->|yes: discard unsupported draft| Wren
  Review -->|review ready| Join[Reviewed draft only]
  Wren --> Join
  Join --> Quil[Quil: one combined answer]
```

Milo and Iris start from the same Mozaik message and run independently. Milo checks the listed website while Iris checks independent search records. Iris runs another real agent loop when both results are available, so a late booking link can change the decision. In live mode Wren prepares locally while review runs, then spends a model call only on approved leads. Fixture mode deliberately creates a provisional draft so the correction is visible. Contrary evidence removes unsupported provisional drafts and only Wren revises. Quil cannot publish until review and the current offer revision agree. Provisional drafts never appear in the final result.

Fixture mode runs these **real Mozaik loops against fictional data**, without model or search calls. It does not claim live AI inference. [The recorded fixture trace](docs/fixture-trace.json) contains actual start/finish times, loop transitions, research/review overlap and the correction. Regenerate it using `npm run demo:api -- --save-trace`.

### API

| Method | Route                  | Purpose                                                                   |
| ------ | ---------------------- | ------------------------------------------------------------------------- |
| GET    | `/api/health`          | Mode and readiness; no secret values                                      |
| POST   | `/api/brief`           | Free brief extraction and clarification; never starts model/search work   |
| POST   | `/api/runs`            | Start one mission; returns snapshot, access token and event URL           |
| GET    | `/api/runs/:id`        | Snapshot and usage; Bearer run token required                             |
| GET    | `/api/runs/:id/events` | SSE; token query or Bearer token; supports Last-Event-ID / `after` replay |
| POST   | `/api/runs/:id/pause`  | Pause before the next step/result publication                             |
| POST   | `/api/runs/:id/resume` | Continue the same run                                                     |
| POST   | `/api/runs/:id/cancel` | Abort ongoing provider requests; no automatic retry                       |

Controls require the owning workspace session and the Bearer run token. A pause allows already-issued provider calls to finish, but holds their publication and subsequent work until resumed. Runs time out after two minutes, including paused time. One active mission per workspace, two active missions across the server, and up to three businesses per mission are allowed. Unknown tokens and runs return the same response. Disconnecting SSE does not restart or cancel the run; reconnect to replay events. An API restart marks unfinished runs failed instead of replaying paid work.

Fixture request:

```json
{
  "request": "Find cleaning businesses in Manchester that could use a simpler booking website."
}
```

Live research requires Google sign-in through the Quil account button; developers configure the separate sign-in client once using [the account guide](docs/ACCOUNTS.md). Live run requests must supply `category`, `location`, and `service`; optional `limit` is 1–3. The chat first calls `POST /api/brief`, a free deterministic parser that extracts supported phrases or returns a clarification question. Quil asks for one missing detail at a time and retains previous answers. Questions about an existing result use its saved evidence without another model/search call; a new search can reuse the service you already described. No model/search request starts until the required details are present. This first version targets evidence-supported website/booking-flow prospecting; unfamiliar phrasing asks for clarification rather than guessing.

### Live configuration and cost limits

Copy `.env.example` to the ignored `.env` file and edit it locally. Never put keys in `VITE_` variables or paste them into the chat.

Live execution requires **both** `QUIL_MODE=live` and `QUIL_ENABLE_LIVE=true`, plus `OPENAI_API_KEY` and `SERPER_API_KEY`. Bounded live checks on 29 October 2026 verified provider access, concurrent research/review, website exclusions, conflict handling and a source-backed editable introduction for a real business. The positive confirmation reused cached discovery/research records and made one new writing request; its answer, draft and source link were verified in the browser without another search. See [the live-check record](docs/live-check.md), [actual live run metadata](docs/live-run-trace.json), and [submission notes](docs/SUBMISSION.md).

The [official GPT-6 Luna model page](https://developers.openai.com/api/docs/models/gpt-6-luna) lists the selected model and pricing. The adapter uses the Responses API, `store: false`, standard service tier, reasoning `none`, at most 800 output tokens, no built-in paid tools, bounded inputs, timeouts and no automatic retries. It does not use Mozaik's unrestricted default model transport.

Default safeguards:

- **$0.50 total / $0.02 per run** in conservative model-cost estimates, reserved transactionally in SQLite **before** each request; up to seven model requests per run.
- Input cost counted at the standard cache-write ceiling, without assuming discounts. Prices are pinned to the published GPT-6 Luna standard rates checked on 29 October 2026. These are application estimates, not an account-wide billing limit; review pricing before later reuse.
- Incomplete or failed calls with known usage are charged to the ledger. Ambiguous network failures and interrupted calls retain the full reservation. Restarting the server does not reset spending.
- **50 total / four per run** Serper requests. Search credits/costs are separate from the OpenAI dollar ceiling. Failed searches still count against the allowance.
- Per-account rolling 24-hour allowances of $0.02 in model estimates and 20 search requests, beneath the global limits. One active mission per workspace and two across the server.
- Discovery widens once after a successful empty extraction, keeping enough search allowance for independent review. It never retries ambiguous provider failures.
- Cached public search records for six hours and account-scoped model responses for one hour. Only relevant evidence is sent to the writing agent.

`.quil-data/` holds the ignored ledger and traces. Deleting it also deletes application spending history, so do not delete it to resolve a request failure. Signed-in users have separate saved research, run ownership, encrypted Google connections and outreach records. Each run requires both its owning workspace session and its private run token. Anonymous guests can try only the fictional example. See [account setup, migration and public-hosting prerequisites](docs/ACCOUNTS.md).

Search snippets are not website uptime checks. Missing website fields remain unknown. A matching website reference prevents a missing-website pitch. An existing website can still have a manual-booking opportunity, but only an explicit, location-matched instruction supports that suggestion. Online-booking links or contrary records keep the result inconclusive. Social profiles alone never prove a missing website. Sources and retrieval times accompany decisions. Source IDs include the observation, so another search cannot overwrite an earlier snippet. Milo also reads a bounded HTML page from a listed standalone website: public DNS/IP checks, address pinning, redirect validation, no scripts/images, and partial-page reporting. A returned page is not proof of full functionality or ownership. Introductions quote the supporting record; an ungrounded model draft is replaced locally without a paid retry, with the correction recorded in the trace. Nothing is sent without an approved outreach preview. The optional Gmail/Calendar integration is described below; payments are not implemented.

### Backend verification

```sh
npm run check:api
npm run test:api
```

Tests cover account isolation (including leaked run tokens), separate encrypted Google credentials, logout/session rotation, daily allowances, legacy-owner migration, real Mozaik concurrency and correction, pause/resume/cancel, SSE replay and access checks, persistent competing spending reservations, no automatic model retries, caching, search quotas, restart recovery, and a complete live-adapter workflow using mocked external transports. Tests consume no provider credits.

The hackathon requires Mozaik and concurrent agents. The execution trace records the actual coordination, and the connected interface follows those events.

On 30 October, real Google Sign-In and private-connection migration succeeded. The updated suite passed 43 tests and browser checks across 11 viewports, including account switching and sign-out. Three real research cases exercised both an editable offer and rejection of unsupported pitches. See [account and capability findings](docs/accounts-check.md) for costs, fixes and remaining Google audience/delivery limits.

## Visual implementation

`src/components/ParticleScene.tsx` generates the scene in code, lazy-loads Three.js, limits pixel ratio and mobile particles, and pauses offscreen or when the document is hidden. It uses no video, image sequence, external 3D model or generated image. The feather SVG is original.

## Browser checks

After `npm run build`, run:

```sh
npm run test:browser
```

This starts an isolated fixture API on 8788 and preview on 4174, runs the checks, then shuts both down. It leaves the live API, environment and ledger untouched. The script uses an installed Chrome browser through the DevTools Protocol; no browser is downloaded. Set `QUIL_QA_BROWSER` for another Chromium executable. It checks WebGL and automatic morphing, the removal of the old controls/cards, desktop/mobile overflow, crew introductions, typed prompts, mission pause/resume, example results, inline evidence/drafts, saving, opportunity filtering, saved state after a new conversation, composer visibility and mobile navigation. Runtime errors and compact JPEG screenshots go into ignored `.sites-runtime/qa/`.

Connected-flow checks also compare the displayed answer with the server snapshot, verify that refresh preserves the run without a second POST, retain saved draft edits, cancel real server work, and confirm an outage shows an error instead of sample results. Follow-up questions are also checked for zero additional run creation. Synthetic signed-in browser sessions also verify private saved items, switching accounts, restoration and sign-out cache clearing. They exist only in the isolated test database, with no production authentication bypass. To use existing fixture servers instead, run `node scripts/browser-qa.mjs`; it refuses a live backend.

The full browser suite refuses to run against a live-mode backend to prevent accidental provider spending. Use fixture mode for that suite. Completed live results can be reopened by their existing run token without creating another paid run.

## Credits

- [Three.js](https://threejs.org/) — MIT.
- [Departure Mono](https://departuremono.com/) by Helena Zhang — SIL Open Font License 1.1, included in `public/fonts/LICENSE.txt`.
- [SUSE Mono](https://github.com/SUSE/suse-font) — locally hosted variable font for navigation and supporting text; SIL Open Font License 1.1, included in `public/fonts/SUSE-Mono-OFL.txt`.
- React and Vite are retained from the supplied starter.

Quil's original code is MIT licensed; third-party assets retain their licenses.

## Offers, contact, follow-up and meetings

Use **Tailored offer** below an approved finding to edit the rationale, scope and terms. Commercial fees, deadlines and outcomes are not invented. The proposal, source records and edited introduction can be saved/exported. Older approved results can derive a proposal from saved facts without paying for another run.

**Contact & next steps** prepares a message or calendar invitation for explicit approval. [Connect your Google account](docs/GOOGLE-SETUP.md) through the envelope in the header. You enter a checked recipient; public website mail links can help, but Quil does not infer the owner's identity. Follow-ups are prepared for day 3 and day 7, checked against the created Gmail thread, and stopped if a reply arrives. There is no unattended campaign scheduler. Calendar suggestions use your free weekday times; the business's availability still needs agreement. An invitation is not labelled accepted until Google reports the attendee's response.

Google credentials stay server-side and tokens are encrypted in the ignored local store. Approval previews are persisted, expire after 30 minutes, claim execution atomically and never automatically resend an uncertain request. Wren's preparation and Quil's execution/status checks run through actual Mozaik agent loops in `server/crew-action.ts`, without additional model inference. Fictional examples and withdrawn leads cannot send. `server/tests/outreach.test.ts` tests Google operations using injected transports, including reply races, duplicate clicks, calendar conflicts and receipt recovery. A separate browser check exercised the connected preview/send/invitation screens with mocked Google responses. Actual Google authorization and read-only Calendar access were verified on 30 October 2026; the app returned three suggested times. Gmail delivery, token refresh and real invitations still need live verification. See [the verification record](docs/outreach-check.md).

Integration routes: `GET /api/google/status`, `POST /api/google/connect`, `GET /api/google/callback`, `POST /api/google/disconnect`, `GET /api/outreach`, `POST /api/outreach/prepare`, `POST /api/outreach/slots`, and `POST /api/outreach/:id/approve|sync|cancel`. Writes require the signed-in workspace cookie, an allowed Origin and the review header. Runs, saved prospects, Google credentials and outreach actions are isolated by user. Public hosting also requires canonical HTTPS callbacks and Google audience/verification setup; the local app has not been deployed.
