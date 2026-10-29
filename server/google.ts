import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "./config.ts";
import type { Store } from "./store.ts";
import type { GoogleStatus } from "../shared/outreach.ts";

export class ActionError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly upstreamStatus?: number,
  ) {
    super(message);
  }
}
type Tokens = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  email: string;
};
const scopes = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];
type Json = Record<string, unknown>;
export class GoogleConnection {
  private pending = new Map<
    string,
    { verifier: string; expires: number; returnTo: string }
  >();
  private refreshing?: Promise<Tokens>;
  constructor(
    private config: Config,
    private store: Store,
    private fetcher: typeof fetch = fetch,
  ) {}
  private key() {
    const path = join(this.config.dataDir, "google-token.key");
    if (!existsSync(path))
      writeFileSync(path, randomBytes(32), { flag: "wx", mode: 0o600 });
    const key = readFileSync(path);
    if (key.length !== 32)
      throw new ActionError(503, "Google credential storage needs attention.");
    return key;
  }
  private load(): Tokens | undefined {
    const row = this.store.db
      .prepare("SELECT secret FROM integrations WHERE name='google'")
      .get() as { secret: string } | undefined;
    if (!row) return;
    try {
      const [iv, tag, encrypted] = row.secret
        .split(".")
        .map((part) => Buffer.from(part, "base64"));
      const decipher = createDecipheriv("aes-256-gcm", this.key(), iv);
      decipher.setAuthTag(tag);
      return JSON.parse(
        Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
          "utf8",
        ),
      );
    } catch {
      throw new ActionError(
        503,
        "Reconnect Google: the stored credentials could not be opened.",
      );
    }
  }
  private save(tokens: Tokens) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(tokens)),
      cipher.final(),
    ]);
    this.store.db
      .prepare("INSERT OR REPLACE INTO integrations VALUES('google',?)")
      .run(
        [iv, cipher.getAuthTag(), encrypted]
          .map((part) => part.toString("base64"))
          .join("."),
      );
  }
  status(): GoogleStatus {
    const tokens = this.load();
    return {
      configured:
        !!this.config.googleClientId && !!this.config.googleClientSecret,
      connected: !!tokens,
      email: tokens?.email,
      redirectUri: this.config.googleRedirectUri,
    };
  }
  authorize(returnTo: string) {
    if (!this.status().configured)
      throw new ActionError(
        503,
        "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the server environment first. See docs/GOOGLE-SETUP.md.",
      );
    for (const [key, value] of this.pending)
      if (value.expires < Date.now()) this.pending.delete(key);
    if (this.pending.size > 5)
      throw new ActionError(429, "Finish an existing Google connection first.");
    const state = randomBytes(32).toString("hex"),
      verifier = randomBytes(32).toString("base64url");
    this.pending.set(state, {
      verifier,
      expires: Date.now() + 600_000,
      returnTo,
    });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: this.config.googleClientId,
      redirect_uri: this.config.googleRedirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    }).toString();
    return url.href;
  }
  private async json(url: string, init: RequestInit): Promise<Json> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ActionError(
        502,
        "Google did not confirm the request. No automatic retry was made.",
      );
    }
    const reader = response.body?.getReader();
    if (!reader)
      throw new ActionError(502, "Google returned an empty response.");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 300_000)
          throw new ActionError(
            502,
            "Google response exceeded the local limit.",
          );
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    if (!response.ok)
      throw new ActionError(
        response.status === 401 ? 401 : 502,
        response.status === 401
          ? "Google access expired or was revoked. Reconnect the account."
          : `Google rejected the request (${response.status}). Check API access and account permissions; no automatic retry was made.`,
        response.status,
      );
    try {
      const value: unknown = JSON.parse(
        Buffer.concat(chunks).toString("utf8") || "{}",
      );
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw Error();
      return value as Json;
    } catch {
      throw new ActionError(502, "Google returned an unreadable response.");
    }
  }
  private async token(fields: Record<string, string>) {
    return this.json("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.googleClientId,
        client_secret: this.config.googleClientSecret,
        ...fields,
      }),
    });
  }
  async callback(state: string, code: string) {
    const pending = this.pending.get(state);
    this.pending.delete(state);
    if (!pending || pending.expires < Date.now() || !code || code.length > 4000)
      throw new ActionError(
        400,
        "Google sign-in expired or could not be verified. Connect again from Quil.",
      );
    const raw = await this.token({
      code,
      redirect_uri: this.config.googleRedirectUri,
      grant_type: "authorization_code",
      code_verifier: pending.verifier,
    });
    const granted = typeof raw.scope === "string" ? raw.scope.split(" ") : [];
    if (
      scopes.some((scope) => !granted.includes(scope)) ||
      typeof raw.access_token !== "string" ||
      typeof raw.refresh_token !== "string"
    )
      throw new ActionError(
        400,
        "Google did not grant all requested permissions. Reconnect and select Gmail and Calendar access.",
      );
    const profile = await this.json(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      { headers: { Authorization: `Bearer ${raw.access_token}` } },
    );
    if (
      typeof profile.emailAddress !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.emailAddress)
    )
      throw new ActionError(502, "Google did not confirm the account address.");
    this.save({
      access_token: raw.access_token,
      refresh_token: raw.refresh_token,
      expires_at: Date.now() + Number(raw.expires_in || 3600) * 1000,
      email: profile.emailAddress,
    });
    return pending.returnTo;
  }
  private async credentials() {
    const tokens = this.load();
    if (!tokens)
      throw new ActionError(409, "Connect Gmail and Google Calendar first.");
    if (tokens.expires_at > Date.now() + 60_000) return tokens;
    if (!this.refreshing)
      this.refreshing = (async () => {
        const fresh = await this.token({
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
        });
        if (typeof fresh.access_token !== "string")
          throw new ActionError(401, "Reconnect Google to refresh access.");
        const next = {
          ...tokens,
          access_token: fresh.access_token,
          expires_at: Date.now() + Number(fresh.expires_in || 3600) * 1000,
        };
        this.save(next);
        return next;
      })().finally(() => {
        this.refreshing = undefined;
      });
    return this.refreshing;
  }
  async request(path: string, method = "GET", body?: unknown) {
    const credentials = await this.credentials();
    // Callers supply internal API paths, never URLs from model or source data.
    if (!/^\/(?:gmail\/v1\/users\/me\/|calendar\/v3\/)/.test(path))
      throw new ActionError(400, "Unsupported Google operation.");
    return this.json(`https://www.googleapis.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${credentials.access_token}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  async disconnect() {
    const tokens = this.load();
    this.store.db.prepare("DELETE FROM integrations WHERE name='google'").run();
    if (tokens)
      await this.fetcher("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: tokens.refresh_token }),
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      }).catch(() => {});
  }
}
