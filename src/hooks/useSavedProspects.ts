import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { readSaved } from "../lib/run-view";
import type { Prospect } from "../lib/run-view";

function wasEdited(userId: string) { try { return localStorage.getItem(`quil:${userId}:saved-dirty`) === "1"; } catch { return false; } }

export function useSavedProspects(userId: string): [Prospect[], Dispatch<SetStateAction<Prospect[]>>, string] {
  const key = `quil:${userId}:saved:v3`;
  const [saved, changeSaved] = useState<Prospect[]>(() => readSaved(key)), [ready, setReady] = useState(false), [error, setError] = useState("");
  const dirty = useRef(wasEdited(userId)), serverValue = useRef<string | null>(null);
  const setSaved: Dispatch<SetStateAction<Prospect[]>> = (value) => { dirty.current = true; try { localStorage.setItem(`quil:${userId}:saved-dirty`, "1"); } catch {} changeSaved(value); };
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/me/saved", { headers: { "X-Quil-Workspace": userId }, signal: abort.signal }).then(async (response) => {
      if (!response.ok) throw Error(); const value = await response.json(); if (!Array.isArray(value.saved)) throw Error();
      serverValue.current = JSON.stringify(value.saved);
      if (!dirty.current && (value.initialized || value.saved.length)) changeSaved(value.saved);
      setReady(true); setError("");
    }).catch(() => { if (!abort.signal.aborted) setError("Saved items are cached on this device; account sync is temporarily unavailable."); });
    return () => abort.abort();
  }, [userId]);
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(saved)); } catch {} }, [key, saved]);
  useEffect(() => {
    const body = JSON.stringify(saved); if (!ready || body === serverValue.current) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      void fetch("/api/me/saved", { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Quil-Action": "review", "X-Quil-Workspace": userId }, body: JSON.stringify({ saved }), signal: abort.signal }).then((response) => { if (!response.ok) throw Error(); serverValue.current = body; try { localStorage.removeItem(`quil:${userId}:saved-dirty`); } catch {} setError(""); }).catch(() => { if (!abort.signal.aborted) setError("Saved items are cached on this device; account sync is temporarily unavailable."); });
    }, 450);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [ready, saved, userId]);
  return [saved, setSaved, error];
}
