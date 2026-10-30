# Quil user accounts

The developer configures two OAuth clients once. Users sign into their own Quil workspace and can then authorize their own Gmail/Calendar connection. They do not create Cloud projects or edit environment files.

## Developer: separate sign-in client

Keep the existing agent OAuth client and its `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` intact. In the same Google Cloud project:

1. Open **Google Auth Platform → Clients → Create client**.
2. Choose **Web application**; name it **Quil Sign-in**.
3. Leave **Use this client for an AI-powered agent** unchecked for this ordinary account-sign-in client. Google recommends separating [ordinary and agentic clients](https://support.google.com/cloud/answer/15549257?hl=en).
4. Add the authorized redirect URI `http://localhost:5173/api/auth/google/callback`. Authorized JavaScript origins are unnecessary for this server-side code flow.
5. Create it and put its ID/secret in the existing ignored `.env` fields:

   ```dotenv
   GOOGLE_SIGNIN_CLIENT_ID=your-ordinary-sign-in-client-id
   GOOGLE_SIGNIN_CLIENT_SECRET=your-ordinary-sign-in-client-secret
   GOOGLE_SIGNIN_REDIRECT_URI=http://localhost:5173/api/auth/google/callback
   ```

6. Restart the API, open Quil at **http://localhost:5173**, and use the account button to **Continue with Google**. The sign-in client requests only `openid email profile`. [Google's OpenID Connect guide](https://developers.google.com/identity/openid-connect/openid-connect) describes this flow.

Your existing developer Gmail connection is kept private during migration. It is adopted only after a verified sign-in matches that Gmail account. Other users cannot see or claim it. Google clients still follow the project's testing audience and verification requirements; new test accounts may need adding under Audience while the project is in Testing.

## User flow

Try the fictional example or a limited real AI chat/research preview without connecting Gmail. By default, the preview allows ten chat turns and one live search. At the limit, sign in and connect Gmail to continue; the browser conversation, research and unsent input survive the redirect. Use the envelope button to connect Gmail/Calendar for the signed-in workspace. Another user signs into their own account and authorizes their own connection. Sign-out clears private browser caches. Saved businesses are stored per account on the server as well as cached in that workspace.

Run tokens are scoped to both their owning user and session-authenticated account. Google connections and outreach records are isolated by user; one user's token refresh or disconnect must not touch another user's connection. Research has per-account allowances as well as the existing global spending ceiling. Approval is still required before messages or invitations are sent.

## Public hosting configuration

Local development remains on loopback and is not deployed by these changes. Before public hosting, set a canonical HTTPS `QUIL_PUBLIC_ORIGIN` and register that origin's sign-in callback with Google. Configure the agent client's callback separately. Production cookies must be Secure, and requests must go through the configured origin/reverse proxy. Google testing/verification requirements remain separate from application-level user isolation.

## Vercel/Neon update, 30 October

Accounts, sessions, handoff state, run ownership, saved items and encrypted Google connections can now persist in Neon across Vercel instances. The developer's local account/history and budget ledger were migrated without deleting the SQLite source. Use [the Vercel guide](VERCEL-SETUP.md) for deployment and canonical callbacks, and [the verification record](vercel-neon-check.md) for actual checks. Google Testing/verification remains separate.
