# Replies and offer terms

Quil continues a conversation after an approved introduction has been delivered. Open **Contact & next steps → The conversation → Read conversation** to view the latest messages from that thread.

## Prepare a response

1. Read the business's latest reply.
2. Expand **Set your offer terms** and enter the scope, currency, quote, minimum price and working-day delivery time. Supported currencies are USD, GBP, EUR and NGN. An empty minimum uses the quoted price.
3. Choose **Prepare a response**. Wren identifies the reply's intent and prepares a draft. Iris reviews the source quote and price boundaries.
4. Select **Edit this reply** to move it into the composer. Complete any answer to a specific project question, check the contact and prepare the approval preview.
5. Review the exact sender, recipient and message, then approve delivery.

For a price discussion, a single clearly stated counteroffer can influence the proposed fee within your minimum and quoted price. Scope and delivery come from the terms you entered. Without completed terms, the draft asks about scope, budget and timing. The minimum is used inside Quil; it is not sent to the intent-analysis model or included as a private-limit field in the email.

Explicit declines and requests to stop contact halt further outreach. Incoming text is displayed as text, with quoted history removed where possible. Attachments and remote images are excluded. Oversized or incomplete replies require review in Gmail.

## Meeting handoff

A future date/time expressed with an explicit timezone, such as `2026-11-02T14:00:00+01:00`, can prefill the meeting form. Relative dates such as “next Tuesday afternoon” require confirmation. You review the time, timezone, attendee and agenda; the existing availability check runs before invitation creation. The attendee's Calendar response determines acceptance.

## Coordination and usage

Reading a conversation makes no model request. Preparing a response can use one bounded GPT-6 Luna intent-analysis request through the existing account-scoped cache and persistent usage ledger. The model returns an intent and a literal evidence quote. Offer text is assembled from user-supplied terms, and a local draft remains available when model analysis is unavailable. Existing cumulative, per-account and per-run allowances apply.

Conversation reads and reply preparation execute recorded Mozaik loops. Wren prepares the response and Iris checks it. Only threads linked to a confirmed introduction in the current account are accessible. Before an approved reply is sent, Quil retrieves the thread again and verifies that it still addresses the latest incoming message. Reply previews share a deterministic identity across server instances, so concurrent approvals cannot send the same prepared reply twice.

## API

These endpoints use the same account cookie, allowed Origin, `X-Quil-Workspace` and `X-Quil-Action: review` header as other outreach operations.

| Method | Endpoint | Result |
| --- | --- | --- |
| POST | `/api/outreach/:introductionId/thread` | Bounded messages, latest incoming reply and contact status. |
| POST | `/api/outreach/:introductionId/draft-reply` | Intent, source quote, editable draft and optional meeting timestamp. |
| POST | `/api/outreach/prepare` | Persist the exact reply approval preview. |
| POST | `/api/outreach/:previewId/approve` | Claim and execute the approved send. |

Example terms for `draft-reply`:

```json
{
  "terms": {
    "currency": "USD",
    "price": "500.00",
    "minimum": "400.00",
    "scope": "One booking page and handover.",
    "deliveryDays": 10
  }
}
```

Use the returned `rootId` as `parentId` and preserve `replyToMessageId` when preparing a `kind: "reply"` action. Supply the edited message, checked recipient and the offer terms. The server checks ownership, the latest incoming message, reply headers and explicit prices before creating the preview.

Gmail thread retrieval follows Google's [full-message format](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/get); outgoing replies use the thread identifier and the incoming message's RFC Message-ID as described in [Manage threads](https://developers.google.com/workspace/gmail/api/guides/threads).

## Verification

Offline tests cover MIME extraction, quoted-history removal, price boundaries, malicious reply instructions, model-failure fallback, explicit versus ambiguous meeting dates, contact stops, stale previews, account ownership and duplicate delivery. A real-Neon test exercises competing preview creation and approval across two independent API instances using injected Google responses. Desktop/mobile component checks exercise thread reading, terms entry, editable-reply handoff and meeting-time handoff.

These development checks use synthetic mail and injected transports. No real email, calendar invitation, model request or search request was issued while implementing this extension. The operator confirmed that the existing deployed Google connection works; the new reply flow awaits the owner's next deployment and a reviewed real conversation.
