# Accounts and capability checks — 30 October 2026

Quil now uses separate Google Sign-In and agent-workflow OAuth clients. The developer configured both locally. A real Google sign-in succeeded, and the existing Gmail/Calendar connection was adopted only by its verified owner. A read-only Calendar free/busy request succeeded using the resulting private connection. Account addresses, calendar times and credentials are omitted.

## Isolation checks

The automated account tests use synthetic identities and isolated temporary databases. They cover concurrent research by two accounts, run-token leaks, cross-account event replay/control attempts, saved records, a second session for the same account, stale workspace headers, separate encrypted Google credentials, cross-account outreach approval attempts, disconnect isolation, logout, rolling allowances and legacy-owner migration. Ciphertexts are authenticated against their owning user ID. Public configuration rejects missing sign-in clients and mismatched callbacks; production cookies require Secure.

The browser suite uses synthetic sessions seeded only into its isolated fixture database. Production authentication has no test endpoint or bypass. Browser checks cover saving, switching between accounts, returning to the original account and clearing private browser caches on sign-out. The original landing page, crew conversation, editing, recovery and responsive checks remain part of the suite.

## Real research checks

These requests used the actual Mozaik engine, OpenAI adapter, Serper adapter, persistent budget ledger and signed-in account ownership. The table records the final behavior after fixes, not success on every initial attempt.

| Request | Observed result |
| --- | --- |
| Mobile hairdressers, Manchester | Charlotte's Mobile Hairdressing had a location-matched “message to book” record. Quil produced a cautious introduction, editable offer, day-3/day-7 drafts and meeting agenda. It did not claim a missing website or established business pain. |
| Cleaning services, Manchester | Initial discovery was empty. Broader discovery found Fabulossa Cleaning and its website. Review rejected a missing-website pitch; no offer or introduction was manufactured. |
| Barbers, Lagos | Initial discovery was empty. Broader discovery found Kayzplace Barbershop and its website. Review rejected a missing-website pitch; no offer or introduction was manufactured. |

Two failures led to changes: an exhausted new per-account allowance stopped a request before spending; an overly long research summary failed validation. The daily allowance is now 20 search requests beneath the unchanged 50-request global ceiling. Discovery widens once after an empty extraction, retaining enough per-run allowance for review. An oversized research summary falls back to a bounded source excerpt with an uncertainty statement. Regression tests cover the discovery and summary changes.

Across these checks and rechecks, the ledger recorded **8 new Serper requests** and **12 model requests, estimated at $0.002938875**. These figures include failed/rechecked runs; cached requests add no new provider charge. Serper usage is separate from the model estimate. The existing global $0.50 model ceiling, $0.02 per-run ceiling and 50-request search ceiling were preserved. No further paid runs were started after these checks.

The developer then explicitly chose a **local override of 30 search requests per account per day**, leaving room for further manual testing. The shareable default stays 20, and the global ceilings remain unchanged.

Final validation: **43 automated tests passed**, production build passed, and the browser suite passed across 11 viewports with all five account-isolation checks true and no browser runtime errors. Lint completed with one existing particle-scene effect warning. The build retains the existing size warning for the lazy-loaded Three.js scene.

## Remaining limits

- Google Cloud's Testing audience still limits who can authorize. Application-level isolation does not remove Google's test-user and verification requirements. Ordinary users do not configure OAuth clients; the developer configures the project and audience once.
- Real Gmail delivery, expired-token refresh and meeting invitation/acceptance remain unverified. No real email or invitation was sent during these checks. Sending needs an explicitly reviewed recipient and preview.
- Three research cases do not establish broad prospecting accuracy. Public search snippets may be stale; a returned website page is not a full functionality or ownership test. The current product supports website/booking-flow prospecting.
- Development remains local. Public hosting, Google verification and production operations have not been completed or claimed.
