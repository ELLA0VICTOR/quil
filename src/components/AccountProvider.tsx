import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { SessionView } from "../../shared/session";
import { currentSession, setWorkspace, signOut, startSignIn } from "../lib/session-api";
import { Sheet } from "./Shared";
import { AccountContext as Context } from "../hooks/useAccount";

const eventKey = "quil:account-changed";
function clearWorkspace(id: string) {
  for (const storage of [localStorage, sessionStorage]) for (const key of Object.keys(storage)) if (key.startsWith(`quil:${id}:`)) storage.removeItem(key);
}
function migrateBrowser(session: SessionView) {
  const id = session.user.id;
  if (session.legacyImported) {
    const saved = localStorage.getItem("quil:saved:v2"), active = sessionStorage.getItem("quil:active-run");
    if (saved && !localStorage.getItem(`quil:${id}:saved:v3`)) localStorage.setItem(`quil:${id}:saved:v3`, saved);
    if (active && !sessionStorage.getItem(`quil:${id}:active-run`)) sessionStorage.setItem(`quil:${id}:active-run`, active);
    localStorage.removeItem("quil:saved:v2"); sessionStorage.removeItem("quil:active-run");
  }
  if (session.adoptedGuestId && session.adoptedGuestId !== id) {
    const from = session.adoptedGuestId;
    for (const [storage, suffix] of [[localStorage,"saved:v3"], [sessionStorage,"active-run"], [sessionStorage,"pending-brief"], [sessionStorage,"conversation:v1"], [sessionStorage,"chat-memory"], [sessionStorage,"composer-draft"]] as const) { const value = storage.getItem(`quil:${from}:${suffix}`); if (value && (storage !== localStorage || !storage.getItem(`quil:${id}:${suffix}`))) storage.setItem(`quil:${id}:${suffix}`,value); }
    clearWorkspace(from);
  }
  const previous=sessionStorage.getItem("quil:cached-workspace");
  if(previous && previous!==id)clearWorkspace(previous);
  sessionStorage.setItem("quil:cached-workspace",id);
}
export default function AccountProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionView | null>(null), [error, setError] = useState(""), [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try { const result = await currentSession(); setWorkspace(result.user.id); try { migrateBrowser(result); } catch { /* Storage is optional in private browsing. */ } setSession(result); setError(""); }
    catch { setError("Quil could not open your workspace. Check that the API is running, then try again."); }
  }, []);
  useEffect(() => { let alive = true; void currentSession().then((result) => { if (!alive) return; setWorkspace(result.user.id); try { migrateBrowser(result); } catch {} setSession(result); }).catch(() => { if (alive) setError("Quil could not open your workspace. Check that the API is running, then try again."); }); return () => { alive = false; }; }, []);
  useEffect(() => {
    const synchronize = (event: StorageEvent) => { if (event.key === eventKey) { try { const next = JSON.parse(event.newValue || "{}"); if (next.id === session?.user.id && next.authenticated === session?.user.authenticated) return; } catch {} if (session) try { clearWorkspace(session.user.id); } catch {} setSession(null); void refresh(); } };
    window.addEventListener("storage", synchronize);
    const timer = setInterval(() => { void currentSession().then((next) => { if (session && (next.user.id !== session.user.id || next.user.authenticated !== session.user.authenticated)) { try { clearWorkspace(session.user.id); } catch {} setWorkspace(next.user.id); setSession(next); } }).catch(() => {}); }, 30_000);
    return () => { window.removeEventListener("storage", synchronize); clearInterval(timer); };
  }, [session, refresh]);
  useEffect(() => { if (session?.user.authenticated) try { const previous = sessionStorage.getItem("quil:tab-account"); if (previous !== session.user.id) { sessionStorage.setItem("quil:tab-account", session.user.id); localStorage.setItem(eventKey, JSON.stringify({ id: session.user.id, authenticated: true, at: Date.now() })); } } catch {} }, [session?.user.id, session?.user.authenticated]);
  const close = useCallback(() => setOpen(false), []);
  const login = async () => { setBusy(true); setError(""); try { const result = await startSignIn(); window.location.assign(result.url); } catch (error) { setError((error as Error).message); setBusy(false); } };
  const logout = async () => {
    setBusy(true); setError("");
    try { await signOut(); if (session) try { clearWorkspace(session.user.id); } catch {} setSession(null); setWorkspace(""); try { localStorage.setItem(eventKey, JSON.stringify({ id: "", authenticated: false, at: Date.now() })); } catch {} await refresh(); setOpen(false); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  };
  return <Context.Provider value={{ session, error, refresh, openAccount: () => { document.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach(dialog => dialog.close()); setOpen(true); } }}>{children}{open && <Sheet title={session?.user.authenticated ? "Your Quil account." : "A workspace of your own."} onClose={close}><div className="account-content">{session?.user.authenticated ? <><p>Signed in as {session.user.email}.</p><p>Your saved research and Google connection belong to this account.</p><button className="text-link" disabled={busy} onClick={() => void logout()}>Sign out</button></> : <><p>Sign in to keep your research private and use your own Gmail and Calendar connection.</p><button className="button button-blue" disabled={busy || !session?.signInConfigured} onClick={() => void login()}>{busy ? "Opening Google…" : "Continue with Google"}</button><p>You can try the fictional example without signing in.</p>{session?.development && !session.signInConfigured && <div className="google-setup"><p>The developer needs to configure the separate sign-in client once. See <code>docs/ACCOUNTS.md</code>.</p><p>Callback: <code>{session.signInRedirectUri}</code></p></div>}</>}{error && <p role="alert" className="outreach-error">{error}</p>}</div></Sheet>}</Context.Provider>;
}
