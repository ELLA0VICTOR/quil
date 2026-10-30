# Deploy Quil on Vercel with Neon

The frontend and API are prepared for one Vercel project. Neon provides durable PostgreSQL storage. No Render service is needed. This checkout has not been deployed or pushed by Codex.

## What is already prepared

- `vercel.json` selects Vite, builds `dist`, and gives the single API function a 180-second limit. Agent missions retain their 120-second deadline. Vercel keeps work alive using `waitUntil`; a stopped worker is marked failed after its deadline, without replaying paid calls.
- Accounts, OAuth handoffs, runs, event replay, controls, saved prospects, encrypted Google connections and approvals use Neon. Budget reservations and per-account run admission are transactionally serialized across instances.
- A private **`.env.vercel.local`** file contains the prepared server environment for this developer's deployment. It is ignored by Git. It must never be committed, pasted into chat, included in screenshots or prefixed with `VITE_`.
- The local app now uses the same Neon database. Its existing account, research, encrypted Google connection and spending ledger were migrated; the SQLite source remains intact. Local and deployed research will share the same ledger and caps.
- Vercel's `cle1` region is selected to match this database's `us-east-2` region. If you use a different database later, align their regions. [Vercel's region list](https://vercel.com/docs/regions) documents the mapping.

## 1. Commit and push the prepared source yourself

Include the new `api`, server, scripts, documentation, privacy page, dependency lockfile and `vercel.json` changes. Keep `.env`, `.env.vercel.local`, `.quil-data`, `.openai` and local test artifacts ignored. Never upload the SQLite database or encryption-key file to the public repository.

## 2. Import the repository into Vercel

1. Choose **Add New → Project**, then import the Quil repository.
2. Use the **Vite** framework preset. Keep build command `npm run build`, output `dist`, and Node.js **24.x**.
3. Under Environment Variables, import the private `.env.vercel.local` file. Scope these credentials to **Production**, not every preview branch. If the screen provides a text import, copy the file's contents there privately.
4. Ensure **Automatically expose System Environment Variables** is enabled. Quil derives its HTTPS origin and both callback URLs from `VERCEL_PROJECT_PRODUCTION_URL`; you do not need to guess the generated address. [Vercel documents that production-domain variable](https://vercel.com/docs/environment-variables/system-environment-variables).
5. Use Fluid Compute and retain the configured function duration. Deploy, then open the stable **production domain**, not a temporary preview domain.

The required server values are `DATABASE_URL`, `QUIL_GOOGLE_TOKEN_KEY`, both Google OAuth client ID/secret pairs, `OPENAI_API_KEY`, `SERPER_API_KEY`, `QUIL_STORAGE=postgres`, live-mode switches and budget settings. The private import file already contains them. Do not import the whole local `.env`: it contains localhost callback settings that do not belong in production.

The total model ceiling is $1.50, the per-run ceiling is $0.02, the local/deployment per-account daily search override is 30, and the global search ceiling remains 50. Existing charges count toward these ceilings.

## 3. Register the final Google callback URLs

Once Vercel shows the production address, use that exact origin in Google Cloud. Keep the existing localhost entries so local development still works.

| Google client | Add this authorized redirect URI |
| --- | --- |
| **Quil Sign-in**, ordinary sign-in client | `https://YOUR-PRODUCTION-DOMAIN/api/auth/google/callback` |
| **Quil agent**, Gmail/Calendar client | `https://YOUR-PRODUCTION-DOMAIN/api/google/callback` |

In Branding, use the production homepage and `https://YOUR-PRODUCTION-DOMAIN/privacy.html`. Add the required authorized domain if Google asks. An explicit `QUIL_PUBLIC_ORIGIN` and callback variables can override automatic detection later, for example when changing custom domains; all three must use the same canonical HTTPS origin.

Google will reject an unregistered callback even when Vercel/Neon are otherwise working. Google Testing audience also remains in effect: add the accounts you intend to test under **Audience → Test users**, or complete the appropriate public publishing/verification process. Normal Quil users only sign in and authorize; they never configure developer clients.

## 4. Check the deployed app

1. Open `/api/health`: expect `status: ok`, `storage: postgres` and the intended mode.
2. Try the free fictional example. It exercises real Mozaik coordination without model or search spend.
3. Sign in using the test account. Saved data and the migrated Google connection should belong to that account. Do not expect another user to inherit them.
4. Review one live research result, its evidence and editable offer. Keep a clear distinction between a booking hypothesis and a verified business problem.
5. Send only an explicitly reviewed message to a checked recipient. An owner-approved self-email was verified locally through the actual Google transport; real business outreach and invitation acceptance still need their own review.

Send the production URL back for the final deployed smoke check. No local build or Neon test can establish that Vercel's live routing and Google domain settings are correct before deployment.

## Free-plan expectations

Neon offers a [Free plan with usage limits](https://neon.com/docs/introduction/plans). Vercel's applicable free-plan limits still apply to the deployment. These are a practical hackathon setup, not a promise of unlimited free hosting. External model and Serper usage remains separate from hosting. Do not switch to a paid plan merely to follow this guide.

## Optional: Mozaik Cloud for the demo

Mozaik already runs Quil's agents. Cloud adds a hosted trace view. This pinned core beta does not automatically export events, so Quil includes an explicit bridge using the official SDK bundled with Mozaik. It forwards recorded execution metadata and native loop transitions, excluding research text, message contents, contacts and credentials.

Sign in at `https://app.jigjoy.ai`, then run **`npm run cloud:pair`** locally and approve the device. Set `QUIL_ENABLE_MOZAIK_CLOUD=true` and restart the API. Run the free example to obtain the trace link in the terminal. For the deployed server, use a private `MOZAIK_API_KEY` in Vercel and enable the flag there; locally paired machine credentials are not deployed automatically.

Cloud export remains **off and unpaired** until you enable it. It is optional under the track requirements supplied so far; check any new submission fields when they are available. The [official SDK documentation](https://www.npmjs.com/package/@mozaik-ai/cloud-sdk) describes pairing and redaction.
