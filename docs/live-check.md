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

Keys, run access tokens, raw provider responses and the private run-session files remain excluded from the repository. The default environment template remains in free fixture mode. A positive live outreach-draft case is still to be validated; mocked end-to-end tests cover the approval/revision path.
