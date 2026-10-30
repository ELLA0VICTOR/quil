import { useEffect, useState } from "react";
import { googleStatus, connectGoogle, disconnectGoogle } from "../lib/outreach-api";
import type { GoogleStatus } from "../../shared/outreach";
import { useAccount } from "../hooks/useAccount";

export default function GoogleSettings() {
  const { session, openAccount } = useAccount();
  const [status, setStatus] = useState<GoogleStatus>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void googleStatus()
      .then((value) => {
        if (alive) setStatus(value);
      })
      .catch(() => {
        if (alive)
          setError(
            "Could not read the Google connection. Check that the local API is running.",
          );
      });
    return () => {
      alive = false;
    };
  }, []);
  const connect = async () => {
    if (!session?.user.authenticated) {
      try { sessionStorage.setItem("quil:connect-after-signin", session!.user.id); } catch {}
      openAccount();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await connectGoogle();
      window.location.assign(result.url);
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="google-settings">
      <h3>Gmail & Google Calendar</h3>
      <p>
        {status?.connected
          ? `Connected as ${status.email}.`
          : "Connect your account to send reviewed messages and meeting invitations."}
      </p>
      <p>
        Quil checks its own email threads for replies. Open a conversation to read the
        messages and prepare a response within your offer terms. You approve each send and
        invitation. Follow-ups are prepared for day 3 and day 7, and stop when a reply
        appears.
      </p>
      {status && !status.configured && session?.development && (
        <div className="google-setup">
          <p>
            Google setup is needed once. Create a Google OAuth web client with Gmail API
            and Calendar API enabled. The walkthrough is in{" "}
            <code>docs/GOOGLE-SETUP.md</code>.
          </p>
          <p>
            Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to
            your local .env, then restart the API.
          </p>
          <p>Authorized redirect URI:</p>
          <code>{status.redirectUri}</code>
        </div>
      )}
      {status && !status.configured && !session?.development && (
        <p>Google connections are temporarily unavailable. Please try again later.</p>
      )}
      {status?.connected ? (
        <button
          className="text-link"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void disconnectGoogle()
              .then(setStatus)
              .catch((error: Error) => setError(error.message))
              .finally(() => setBusy(false));
          }}
        >
          Disconnect Google
        </button>
      ) : (
        <button
          className="button button-blue"
          disabled={busy || !status?.configured}
          onClick={() => void connect()}
        >
          {busy ? "Opening Google…" : "Connect Gmail & Calendar"}
        </button>
      )}
      {error && (
        <p className="outreach-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
