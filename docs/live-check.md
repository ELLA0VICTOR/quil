# Bounded live integration check

Completed locally on 29 October 2026 using the owner's configured OpenAI and Serper accounts. No deployment or outreach was performed.

- One Manchester cleaning business was requested.
- GPT-6 Luna discovery and research calls completed through the guarded transport.
- Independent research and review overlapped by 1,622 ms in the recorded run.
- The result identified [Fabulossa Cleaning](https://www.fabulossa.co.uk/). Search records listed its existing website, so the missing-website pitch was excluded. No eligible draft was generated in this check.
- A browser reopened the completed run, displayed the same server answer and a clickable source, and created **zero additional runs**.
- The successful run's conservative model-cost estimate was **$0.00027525**. Across the integration checks, the ledger counted **$0.00244950**, including **$0.00217425 in retained reservations** for two rejected requests whose billable usage was unavailable. These are application estimates, not an account billing statement.
- Two uncached Serper requests were made in total; the initial discovery search was reused from cache on subsequent attempts.

The check exposed and corrected a JSON-mode compatibility issue: the input now explicitly requests JSON as well as the separate instructions. Provider errors expose bounded code/parameter labels without forwarding raw messages. A deterministic summary was also corrected to distinguish businesses ruled out by website references from inconclusive checks. The original run is kept as recorded; it is not rewritten to imply those later changes were executed in it.

## Product hardening pass

A subsequent pass on 29 October used **10 model requests**, with a conservative estimate of **$0.001462875**, and **10 uncached Serper requests**. The persistent ledger across both passes totals **$0.003912375** and **12 search requests**, including the earlier retained reservations. These remain application estimates, not account billing totals.

The samples covered nail technicians, mobile valeters, makeup artists and mobile hairdressers. They exposed real edge cases: a booking-platform link embedded in a result title, an excerpt running into a phone number, overly restrictive location quoting, and different observations from the same URL. These led to stricter conflict handling, bounded literal quotes, better query construction and immutable observation IDs. Earlier draft attempts are not used as evidence that the final stricter qualification policy has approved those businesses.

The [earlier live review trace](live-review-trace.json) records 2,394 ms of research/review overlap and an inconclusive hairdresser result. Inspecting its sources exposed a further identity bug: a different salon's Facebook thread mentioned the candidate in a snippet, causing its booking link to be attributed to the wrong business. Review now requires the business name in the result title or a matching known business website, rather than trusting snippet mentions alone. A regression test covers this case.

The [final live run metadata](live-run-trace.json) records the corrected positive path for [Charlotte's Mobile Hairdressing](https://www.facebook.com/charhairdresser/). The business's own titled profile described message-based bookings. Discovery, research and search records were reused from cache; one new GPT-6 Luna writing request cost an estimated **$0.00010550**, with **zero new search requests**. The introduction quotes the source and asks whether help would be useful; it does not claim the business lacks a website or needs a replacement.

A browser then restored this completed run and verified the exact server answer, exact editable introduction and original source link, with no additional run creation and no runtime errors. This validates a source-backed introduction, not buyer interest or a sales outcome. Injected-provider end-to-end tests additionally cover local correction of an ungrounded draft without an extra model request.

Keys, run access tokens, raw provider responses and private run-session files remain excluded from the repository. The default environment template remains in free fixture mode. No deployment, outreach or advertising spend was performed.
