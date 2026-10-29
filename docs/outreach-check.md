# Offer and outreach verification

Checked locally on 29 October 2026. No deployment, real email or calendar invitation was performed.

- **34 automated tests pass.** These include real Mozaik coordination, late website evidence, offer withdrawal, encrypted Google credentials, single-use OAuth state, preview approval, duplicate-send prevention, reply races, calendar conflicts, suggested working-hour slots and receipt reconciliation.
- The [current fixture trace](fixture-trace.json) records five distinct crew roles and two completed Iris loops. Research and review overlap, then final review reconciles the investigator's evidence before publication. This run uses fictional businesses and consumes no model/search credits.
- The production build passes. The complete browser suite passes across 11 viewport sizes, including editable/saved offers, blocked fictional outreach, honest Google setup status, reconnects and the previously approved layout.
- A separate browser check used **mocked Google responses** against a recorded live finding. It verified the exact message and attached edited offer in the preview, no send before approval, one approved email operation, one approved invitation operation, an awaiting-response state and subsequent acceptance. It created no new research run and reported no browser runtime errors. This is UI verification, not a real Google delivery test.
- A bounded real request to Fabulossa's listed website returned HTTP 200 HTML. Only the beginning of the large page was read. The result explicitly states that this is not a full functionality, ownership or booking test. No images or scripts were executed.

Google account authorization, token refresh against a real account and a send to an explicitly approved test recipient remain to be checked after the owner completes [Google setup](GOOGLE-SETUP.md). No OpenAI or Serper requests were made for this extension.

The workflow intentionally requires a reviewed recipient, message and invitation. It does not guess an owner's email, negotiate commercial terms automatically, monitor the inbox continuously or run an unattended follow-up campaign. Those limits are visible in the app and setup guide.
