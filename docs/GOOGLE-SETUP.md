# Connect Gmail and Google Calendar locally

Quil implements reviewed messages, reply-aware follow-ups and calendar invitations. This project setup is for the application developer; eventual public users should only select **Connect Gmail & Calendar** and authorize their own account. OpenAI and Serper credentials cannot grant Google access; the developer needs a Google OAuth web client. This follows [Google's server-side OAuth flow](https://developers.google.com/identity/protocols/oauth2/web-server).

## One-time setup

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create or select a project, such as `Quil local`.
2. Under **APIs & Services → Library**, enable **Gmail API** and **Google Calendar API** in that project.
3. Open **Google Auth platform → Branding**. Set the app name to Quil and enter your support/contact email. Under **Audience**, choose the appropriate audience; for a personal Gmail test, use External and add your own email under **Test users**. Keep it in testing while developing locally. [Google's current consent-screen instructions](https://developers.google.com/workspace/guides/configure-oauth-consent) cover these screens.
4. Under **Data Access**, add these scopes:

   ```text
   https://www.googleapis.com/auth/gmail.send
   https://www.googleapis.com/auth/gmail.readonly
   https://www.googleapis.com/auth/calendar.events
   https://www.googleapis.com/auth/calendar.freebusy
   ```

5. Create an OAuth client under **Clients** (or **APIs & Services → Credentials → Create credentials → OAuth client ID**). Choose **Web application**. Add this exact **Authorized redirect URI**:

   ```text
   http://127.0.0.1:8787/api/google/callback
   ```

   Select **Use this client for an AI-powered agent** for this dedicated Quil agent-workflow client. This identifies the client as an agent acting for the user; it does not grant additional permissions. The ordinary Google sign-in flow uses a [separate client](ACCOUNTS.md), following [Google's agent-client isolation guidance](https://support.google.com/cloud/answer/15549257?hl=en).

6. Copy its client ID and client secret into the existing ignored `.env`:

   ```dotenv
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=http://127.0.0.1:8787/api/google/callback
   ```

   Leave your existing OpenAI/Serper entries and spending limits intact. These Google fields are already present as empty placeholders. Do not use `VITE_` variables or commit the credentials.

7. Restart the API (`npm run dev:api`, or stop/restart `npm run dev:all`). Open Quil locally, select the **envelope in the app header**, then **Connect Gmail & Calendar**. Sign into the test account you added and review all requested permissions.

If Google reports `redirect_uri_mismatch`, compare the entire URI, including `127.0.0.1`, port and path. If access is blocked, check the project, APIs, test-user list and granted scopes. A Workspace administrator may restrict access. Testing credentials can expire or be revoked; reconnect when needed. Public distribution has additional Google review requirements; this setup is for your local project.

## Use the workflow

Open an approved live result. **Tailored offer** contains the editable proposal, scope, unknowns, commercial terms to agree, two follow-up drafts and a meeting agenda. Existing approved results can derive an offer from saved evidence without another model call.

Under **Contact & next steps**:

- Enter a checked business email. Public `mailto:` links are offered when found on the listed website; Quil never guesses an owner's address.
- Edit the message, optionally include your edited offer, then **Prepare approval preview**. Inspect the exact sender, recipient and text before **Approve & send message**.
- Follow-ups become eligible on day 3 and day 7 after the introduction. Each requires review and approval. Quil checks the created Gmail thread before sending; a reply stops the unanswered-message sequence. Read replies in Gmail. There is no unattended sending scheduler.
- For a meeting, select a time discussed with the business or request suggestions from your calendar. Suggestions use free weekday times between 9am and 5pm in your timezone over the next week. Only your availability is known. Preview the agenda, attendee and exact time before approving an invitation. Calendar availability is checked again before creation. **Check status** distinguishes an invitation from the attendee's acceptance.

Fictional examples and withdrawn opportunities cannot send messages or invitations. Approved previews expire after 30 minutes. Interrupted sends stay uncertain and are reconciled rather than automatically resent. Calendar invitations request a Google Meet link; its availability depends on the account.

## Permissions and storage

The Gmail read scope is broad at Google's permission level. Quil's implementation fetches only metadata for threads it created, or searches for its own generated Message-ID to reconcile an uncertain send; it does not read email bodies or scan the inbox. [Gmail thread documentation](https://developers.google.com/workspace/gmail/api/guides/threads) and [message search parameters](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list) describe these operations. Sending uses [Gmail's message API](https://developers.google.com/workspace/gmail/api/guides/sending); calendar operations use [free/busy](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query) and [event insertion](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).

Tokens stay on the server, encrypted in the configured application database. Local SQLite can use `.quil-data/google-token.key`; Vercel/Neon requires the private `QUIL_GOOGLE_TOKEN_KEY` environment value. The developer's local instance now uses Neon. Protect the database and key together; filesystem access to both defeats that protection. The browser receives connection status and the account email, never Google tokens or the client secret. Disconnect removes the stored connection and attempts token revocation.

Google connections now belong to signed-in Quil accounts. Each account has its own encrypted credentials, saved research and outreach actions. See [account setup](ACCOUNTS.md). Development remains local; public access still needs HTTPS callbacks and Google audience/verification setup. Live OAuth authorization and read-only Calendar access were verified on 30 October 2026. An explicitly approved self-email subsequently reached the connected Gmail Inbox, and expired-token refresh succeeded after Neon migration. No business was contacted. Real invitation/acceptance remains unverified; its adapter and safeguards have injected-provider and mocked-browser tests. See [the updated verification record](vercel-neon-check.md).

For production Vercel domains, use [VERCEL-SETUP.md](VERCEL-SETUP.md). Import the prepared private production environment rather than local callback variables; then register the two final HTTPS callback URLs in Google Cloud.
