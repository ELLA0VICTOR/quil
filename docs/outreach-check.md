# Offer and outreach verification

Checked locally on 29 October 2026. No deployment, real email or calendar invitation was performed.

- **34 automated tests pass.** These include real Mozaik coordination, late website evidence, offer withdrawal, encrypted Google credentials, single-use OAuth state, preview approval, duplicate-send prevention, reply races, calendar conflicts, suggested working-hour slots and receipt reconciliation.
- The [current fixture trace](fixture-trace.json) records five distinct crew roles and two completed Iris loops. Research and review overlap, then final review reconciles the investigator's evidence before publication. This run uses fictional businesses and consumes no model/search credits.
- The production build passes. The complete browser suite passes across 11 viewport sizes, including editable/saved offers, blocked fictional outreach, honest Google setup status, reconnects and the previously approved layout.
- A separate browser check used **mocked Google responses** against a recorded live finding. It verified the exact message and attached edited offer in the preview, no send before approval, one approved email operation, one approved invitation operation, an awaiting-response state and subsequent acceptance. It created no new research run and reported no browser runtime errors. This is UI verification, not a real Google delivery test.
- A bounded real request to Fabulossa's listed website returned HTTP 200 HTML. Only the beginning of the large page was read. The result explicitly states that this is not a full functionality, ownership or booking test. No images or scripts were executed.

## Live Google connection, 30 October 2026

The owner completed Google OAuth authorization. Quil's running API reported the Google connection as configured and connected. A read-only Calendar free/busy request then returned HTTP 200 and three suggested meeting times through Quil's Mozaik action loop. The check did not send email, create an invitation, inspect email bodies or consume OpenAI/Serper credits. Account addresses, tokens and actual calendar times are omitted from this record.

Token refresh against the real account, Gmail delivery to an explicitly approved test recipient, and a real invitation/acceptance flow remain unverified. The corresponding adapters and approval safeguards are covered by injected-provider tests and mocked browser checks. [Google setup](GOOGLE-SETUP.md) remains the developer walkthrough.

The workflow intentionally requires a reviewed recipient, message and invitation. It does not guess an owner's email, negotiate commercial terms automatically, monitor the inbox continuously or run an unattended follow-up campaign. Those limits are visible in the app and setup guide.

Later on 30 October, separate account sign-in and per-user Google connection migration were verified. A read-only Calendar check also succeeded after migration. [Account and capability checks](accounts-check.md) record isolation tests, real research results and remaining Google audience restrictions.

## Subsequent Neon and Gmail check, 30 October

The migrated Google connection performed a real expired-token refresh and a Calendar read. After explicit approval of the exact self-recipient, subject and body, one Gmail test message was sent only to the connected account. Google's receipt and the message's Inbox label were confirmed. This was a connector self-test, not business outreach. Real attendee invitation/acceptance remains unverified. [Vercel/Neon preparation findings](vercel-neon-check.md) include the isolated cross-instance tests and deployment boundary.
