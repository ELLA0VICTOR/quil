# Vercel/Neon preparation checks — 30 October 2026

The developer chose to deploy the app themselves on Vercel and requested free hosting. The app was adapted from a persistent local SQLite server to Neon-backed Vercel Functions. No deployment, repository push or hosting purchase was performed by Codex.

## Verified

- The actual pooled Neon connection succeeded over verified TLS. Tables and queries use the `quil` namespace. The adapter avoids unsupported pooler startup options and does not depend on session-specific search paths.
- An isolated real-Neon test used two independent API instances. Sign-in and agent OAuth started on one instance and completed on another. Cross-account reads failed. Saved research was available only to its owner. Cross-instance pause/resume and event replay completed. Two simultaneous approvals produced exactly one **injected fake** Gmail send. Concurrent model reservations respected one shared ceiling.
- The developer's existing users, sessions, research, events, encrypted Google connection and usage ledger were migrated transactionally into the initially empty Quil namespace. The original SQLite file remains intact. Private records and keys were not added to source control.
- The local app now uses Neon. An actual one-business research mission completed using real Mozaik, Serper's cached sources and OpenAI: one supported opportunity and an editable draft/offer. This check added **3 model calls, estimated at $0.00056775**, and no new Serper requests. It did not send outreach.
- A real Calendar read succeeded using the migrated connection. Its expired access token was refreshed successfully without altering the expiration for the test.
- After the developer approved the exact recipient, subject and body, one test email was sent **only to that same connected Gmail account**. Google returned its receipt; a metadata read confirmed the Inbox label. This verified the Google transport, not a business owner's identity or external deliverability. No business was contacted.
- Offline tests cover the Cloud bridge's opt-in behavior and payload filtering. After the developer approved device pairing on 30 October, a real Cloud upload accepted 74 events from all five agents with zero rejected events. The test used a complete fixture mission with no model or search calls. Local tracing is enabled; Vercel's Cloud environment update and redeployment are the remaining hosted-export steps.

## Verification boundaries

The owner deployed to `https://quil-xx.vercel.app`. The landing page and privacy notice returned HTTP 200. `/api/health` confirmed live mode, PostgreSQL and configured model/search credentials. `/api/session` returned the correct production sign-in callback; a cookie-bearing request retained the guest account.

Two initial fictional smoke missions completed in Neon through the deployed worker, without provider calls or outreach. The browser could not retrieve their results: Vercel returned its own non-JSON 404 for nested `/api/runs/<id>` and event URLs. The function filename alone did not route multiple path segments. An explicit `/api/:path*` rewrite to `/api/[...path]` fixed the routing after the owner's next deployment.

The deployed Chrome smoke check now passes: particle landing and five-agent welcome render, one explicit fixture mission reaches its final answer through the event stream, its authenticated snapshot reports completed fixture mode with zero charges, and reloading restores the result without creating another mission. No browser runtime errors or desktop horizontal overflow were recorded. The Google callback URL now reaches the application and correctly rejects a request without a matching sign-in state. The owner reports adding both production callback URLs in Google Cloud; an actual production Google login remains to be completed in their browser. Private screenshots/report remain under ignored `.sites-runtime/deployed-smoke`. No deployment or push was performed by Codex.

A subsequent isolated-browser check clicked the deployed **Sign in → Continue with Google** buttons. Google opened its sign-in page for `quil-xx.vercel.app`, asking for an email/phone, without a redirect mismatch, invalid-client or access-blocked error. No account credentials were entered and no consent was granted. This verifies the initial Google handoff, not the completed callback/session or Gmail/Calendar authorization. Private evidence is under ignored `.sites-runtime/deployed-oauth-check`.

Real meeting invitation creation and another attendee's acceptance remain unverified. Their adapters, approval protections and connected screens have injected-provider coverage. Google Testing audience restrictions are separate from account isolation and hosting.

The standalone local data store remains available for tests and developer fixture use. A Vercel environment explicitly rejects SQLite storage. Shared budget reservations and active-run admission use database transactions; workers that outlive their deadline fail closed rather than replaying paid calls.

See [deployment instructions](VERCEL-SETUP.md). Source maps, private token receipts, migration backups and test output stay in ignored local directories.

Final checks passed: production build, 46 offline tests (the real-Neon test is skipped by default and was run separately), and the full browser suite across 11 viewports with no runtime errors. The test that switches synthetic HTTP-only cookies now leaves the old browser document first; the server's stale-workspace guard remains enforced. Source-control and browser-bundle scans found no configured credential values.
