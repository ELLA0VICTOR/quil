# Conversation with Quil

Live workspaces, including the limited guest preview use `POST /api/chat` for ordinary messages, before and after research. Quil receives the current message, a small recent conversation window, the working brief, and selected evidence loaded by the server from the user's own research. It can answer, ask one clarifying question, or return a complete brief for the existing Mozaik research crew.

For example, “website business, Abuja” describes a service and location, so Quil asks which customer businesses to target. “Restaurants” can complete that brief. “Actually salons in Lagos” can change the next search. Questions about an empty result are grounded in that empty result, rather than answered with an unrelated menu.

The conversation is run through a recorded Quil Mozaik loop. It does not send emails, create invitations, fabricate business records or silently execute a search. A returned complete brief starts research through the same account-scoped mission endpoint used elsewhere in the app. Questions remain available while research is running, and simultaneous research missions remain restricted.

Each turn uses at most one bounded OpenAI JSON request. Existing cumulative, per-account daily and request allowances apply to chat and research together. Input history and evidence are bounded; repeated identical requests can use the account-scoped model cache. Persistent turn claims prevent duplicate inference on retries and concurrent chat calls for an account. Provider or allowance failures produce an explicit error instead of a preset conversational answer.

The fictional example remains available without model charges. Its local explanatory responses are confined to fixture mode; live conversation does not use the frontend canned-response router.

Provider context is sent with OpenAI response storage disabled. Conversation responses and idempotency records are cached for one hour. Research ownership is checked before supplying any result to the model. Source text and chat history do not authorize Gmail or Calendar operations; reviewed previews remain required.

## Preview and Google connection

Visitors can use real AI chat and live research before signing in or connecting Gmail. Defaults allow ten chat turns and one live research mission without a Gmail connection. `QUIL_PREVIEW_CHAT_TURNS` and `QUIL_PREVIEW_RESEARCH_RUNS` configure those allowances. Preview counters are stored on the server for 24 hours and claimed transactionally. Model and search spending controls apply throughout.

At the allowance, the API returns `CONNECT_GOOGLE_REQUIRED` and the UI offers **Connect Gmail to continue**. A guest first signs into their Quil account, then sees the Gmail/Calendar connection panel. Research, chat usage and ownership follow the guest into an existing account; signing in alone does not reset preview usage. Gmail connection lifts the preview counter, while the deployment's daily and total budgets continue to apply.

Conversation messages, research views, working context, a bounded memory summary and unsent input are cached per workspace in this browser tab. They survive the Google redirect and ordinary page reloads. Guest conversation state follows account adoption; signing out clears that account's browser state. The transcript is not synchronized across devices. Explicitly starting a new conversation clears its current messages and context.

The conversational prompt supports explanations, brainstorming, writing and revisions, planning, topic changes and references to earlier preferences. Business search is one available action, rather than the required destination of every exchange. The actual tool capabilities remain source-backed website/booking prospect research and reviewed Gmail/Calendar operations.
