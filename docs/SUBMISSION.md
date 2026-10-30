# Quil · Freestyle

Quil helps freelancers find a sensible reason to start a business conversation. Describe your service, the business type and the city. A small crew discovers businesses, researches their records, checks the evidence and prepares an editable first hello. The result stays concise, with the sources available underneath it.

## Why a crew?

The first search result can be misleading. A missing website field is not proof that a business has no website; a profile asking for messages may also link to online booking. Quil gives research and independent review separate Mozaik agents, running concurrently. Shared state determines which introductions can survive review. Only Wren revises when the evidence changes; Quil waits for the reviewed draft before publishing one answer.

The five roles run through `@mozaik-ai/core@4.2.0-beta.18`: runtime participants, shared state, message-triggered coordination and actual agent loops. This is not a visual simulation wrapped around one chatbot. The browser follows server events and can reconnect to the same recorded run.

## Try it

1. Install Node.js 24+, then run `npm install` and `npm run dev:all`.
2. Open the local URL and select **Try now → Or try a little example**. No key or credits are required. The example clearly labels its fictional businesses; its Mozaik coordination is real.
3. Open **See the evidence** and **Introduction**, edit the draft, save it, then check **Saved**. Pause, resume or cancel another run. Refreshing reconnects rather than submitting another search.
4. For live research, copy `.env.example` to `.env`, add your own OpenAI and Serper keys, and enable both live switches. Configure the separate [account sign-in client](ACCOUNTS.md), restart the API and sign into Quil. Say: “I build booking websites. Find hairdressers in Manchester.” Live searches may correctly return no supported opportunity.

## What to inspect

| Freestyle criterion | Evidence in this repository                                                                                                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Useful and original | A conversational prospecting workflow that distinguishes an outreach hypothesis from a supported fact, with source-linked editable introductions. Original SVG crew and interactive particle scene.                               |
| Mozaik coordination | [Engine](../server/engine.ts), [architecture](../README.md#architecture), [actual fixture trace](fixture-trace.json), [live run metadata](live-run-trace.json). Research/review overlap and targeted corrections are recorded. |
| It works            | `npm test`, `npm run build`, `npm run test:browser`. Offline tests exercise the live adapters through injected provider responses. The isolated browser suite consumes no credits.                                                |
| Clear README        | [Setup, limits, API and verification](../README.md). [Live integration findings](live-check.md) separate actual checks from fixture evidence.                                                                                     |

## Limits and responsible use

Quil currently supports website and booking-flow prospecting, with up to three businesses per search. It uses public search records and bounded checks of listed website pages, rather than a complete website crawl or authenticated business systems. These records can be stale, and matching names and locations does not guarantee identity. Manual booking does not prove that the business wants a new system. The user reviews every introduction and offer. The optional Google connection can send an approved message, check for replies and create an approved meeting invitation. Fictional examples cannot send; there is no unattended campaign scheduler.

The approved-introduction path is covered end to end by injected-provider tests and a recorded live-provider run using real cached discovery/research records and a new writing request. A browser verified the final answer, editable introduction and source link. Fresh live research/review overlap, exclusions and conflicting booking evidence are recorded separately. This proves a source-backed introduction, not customer demand or a sales result; fictional examples are labeled explicitly.

Live requests have persistent, transactionally reserved cost limits. No automatic paid retries are performed. A free example remains available on a live-configured server. Keys and private run tokens stay outside the repository and browser bundle. User authentication, per-account data/credential isolation and daily quotas are implemented; [account setup](ACCOUNTS.md) explains the two OAuth clients. Public hosting remains unperformed and requires HTTPS callbacks plus the appropriate Google audience/verification status. The entry can run locally from the public source.

MIT licensed. Check the current submission form for demo/video fields before submitting; no recording has been prepared yet. No customer adoption, revenue or measured sales uplift is claimed.

Optional outreach has a [Google setup guide](GOOGLE-SETUP.md). Live Google authorization and read-only Calendar access were verified on 30 October: the API returned three suggested meeting times. A later approved self-email reached the connected Gmail Inbox, and expired-token refresh succeeded on Neon. Real business outreach and invitation/acceptance remain unverified; their safeguards have injected-provider coverage. The free example demonstrates the editable offer and follow-up plan without needing a Google account. See the [verification record](outreach-check.md).

The owner is preparing Vercel + Neon deployment. Source supports persistent accounts, controls, traces and budgets across function instances; the original local records were migrated. See [deployment setup](VERCEL-SETUP.md) and [verified findings](vercel-neon-check.md). The production URL and Google domain settings must be smoke-tested after deployment.
