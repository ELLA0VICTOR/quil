import type { SessionView } from "../../shared/session.ts";
let workspace = "";
export function setWorkspace(id: string) { workspace = id; }
export function workspaceHeaders(id = workspace): Record<string, string> { return id ? { "X-Quil-Workspace": id } : {}; }
export async function sessionRequest<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", ...(body === undefined ? {} : { method, headers: { "Content-Type": "application/json", "X-Quil-Action": "review", ...workspaceHeaders() }, body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000) });
  const result = await response.json(); if (!response.ok) throw Error(result.error || "Quil could not complete the account request."); return result;
}
let pendingSession: Promise<SessionView> | undefined;
export const currentSession = () => pendingSession ??= sessionRequest<SessionView>("/api/session").finally(() => { pendingSession = undefined; });
export const startSignIn = () => sessionRequest<{ url: string }>("/api/auth/signin", {});
export const signOut = () => sessionRequest<{ signedOut: boolean }>("/api/auth/logout", {});
