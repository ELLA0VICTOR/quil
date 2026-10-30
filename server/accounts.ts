import { randomBytes, randomUUID, createHash } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Config } from "./config.ts";
import { Store, hashToken } from "./store.ts";
import { adoptPreview } from "./preview.ts";
import { ActionError } from "./google.ts";
import type { SessionView } from "../shared/session.ts";

export type Principal = {
  id: string;
  authenticated: boolean;
  email?: string;
  name?: string;
  sessionHash: string;
};
export type GoogleIdentity = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  nonce?: string;
};
export type IdentityVerifier = (
  idToken: string,
  audience: string,
) => Promise<GoogleIdentity>;
export class Accounts {
  private pending = new Map<
    string,
    {
      sessionHash: string;
      verifier: string;
      nonce: string;
      expires: number;
      returnTo: string;
    }
  >();
  private limits = new Map<string, { count: number; until: number }>();
  private verifier: IdentityVerifier;
  constructor(
    private config: Config,
    private store: Store,
    private fetcher: typeof fetch = fetch,
    verify?: IdentityVerifier,
  ) {
    const client = new OAuth2Client({ clientId: config.signInClientId });
    this.verifier =
      verify ??
      (async (idToken, audience) => {
        const ticket = await client.verifyIdToken({ idToken, audience });
        return ticket.getPayload() as GoogleIdentity;
      });
  }
  private cookie(response: ServerResponse, token: string, age = 30 * 86400) {
    response.setHeader(
      "Set-Cookie",
      `quil_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${this.config.publicOrigin ? "; Secure" : ""}`,
    );
  }
  token(request: IncomingMessage) {
    return request.headers.cookie?.match(
      /(?:^|;\s*)quil_session=([a-f0-9]{64})(?:;|$)/,
    )?.[1];
  }
  async sessionByHash(hash: string): Promise<Principal | undefined> {
    const row = (await this.store.db
      .prepare(
        "SELECT u.id,u.google_sub,u.email,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?",
      )
      .get(hash, Date.now())) as
      | {
          id: string;
          google_sub: string | null;
          email: string | null;
          name: string | null;
        }
      | undefined;
    return row
      ? {
          id: row.id,
          authenticated: !!row.google_sub,
          ...(row.email ? { email: row.email } : {}),
          ...(row.name ? { name: row.name } : {}),
          sessionHash: hash,
        }
      : undefined;
  }
  async get(request: IncomingMessage): Promise<Principal | undefined> {
    const token = this.token(request);
    return token ? await this.sessionByHash(hashToken(token)) : undefined;
  }
  limit(key: string, count = 12, period = 600_000) {
    if (this.limits.size > 1000)
      for (const [key, value] of this.limits)
        if (value.until < Date.now()) this.limits.delete(key);
    const current = this.limits.get(key);
    if (current && current.until > Date.now()) {
      if (++current.count > count)
        throw new ActionError(
          429,
          "Too many account requests. Please wait before trying again.",
        );
    } else this.limits.set(key, { count: 1, until: Date.now() + period });
  }
  async ensure(request: IncomingMessage, response: ServerResponse): Promise<Principal> {
    const existing = await this.get(request);
    if (existing) return existing;
    this.limit(`guest:${request.socket.remoteAddress}`, 120, 3600_000);
    const id = randomUUID(),
      token = randomBytes(32).toString("hex"),
      hash = hashToken(token);
    await this.store.db
      .prepare("INSERT INTO users VALUES(?,NULL,NULL,NULL,?)")
      .run(id, new Date().toISOString());
    await this.store.db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(hash, id, Date.now() + 30 * 86400_000);
    this.cookie(response, token);
    return { id, authenticated: false, sessionHash: hash };
  }
  async view(user: Principal): Promise<SessionView> {
    const { sessionHash: _private, ...publicUser } = user;
    return {
      user: publicUser,
      signInConfigured: !!this.config.signInClientId && !!this.config.signInClientSecret,
      signInRedirectUri: this.config.signInRedirectUri,
      development: !this.config.publicOrigin,
      mode: this.config.mode,
      ...(await this.store.cached<{ legacyImported?: boolean; adoptedGuestId?: string }>(
        `signin-hint:${user.sessionHash}`,
      )),
    };
  }
  require(user: Principal) {
    if (!user.authenticated)
      throw new ActionError(
        401,
        "Sign in to your Quil account to use live research or connect Google.",
      );
  }
  async authorize(user: Principal, returnTo: string, ip: string) {
    if (user.authenticated)
      throw new ActionError(409, "Sign out before switching Quil accounts.");
    if (!(await this.view(user)).signInConfigured)
      throw new ActionError(
        503,
        "Account sign-in needs the developer's GOOGLE_SIGNIN_CLIENT_ID and GOOGLE_SIGNIN_CLIENT_SECRET. See docs/ACCOUNTS.md.",
      );
    if (new URL(this.config.signInRedirectUri).origin !== returnTo)
      throw new ActionError(
        400,
        `Open Quil at ${new URL(this.config.signInRedirectUri).origin} before signing in.`,
      );
    this.limit(`signin:${ip}`, 10);
    for (const [key, value] of this.pending)
      if (value.expires < Date.now()) this.pending.delete(key);
    if (this.pending.size >= 100)
      throw new ActionError(429, "Sign-in is busy. Please try again shortly.");
    const state = randomBytes(32).toString("hex"),
      verifier = randomBytes(32).toString("base64url"),
      nonce = randomBytes(32).toString("hex");
    const pending = {
      sessionHash: user.sessionHash,
      verifier,
      nonce,
      expires: Date.now() + 600_000,
      returnTo,
    };
    this.pending.set(state, pending);
    await this.store.cache(`auth-state:${hashToken(state)}`, pending, 600_000);
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: this.config.signInClientId,
      redirect_uri: this.config.signInRedirectUri,
      response_type: "code",
      scope: "openid email profile",
      prompt: "select_account",
      state,
      nonce,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    }).toString();
    return url.href;
  }
  async callback(
    request: IncomingMessage,
    response: ServerResponse,
    state: string,
    code: string,
  ) {
    const pending = await this.store.take<{
      sessionHash: string;
      verifier: string;
      nonce: string;
      expires: number;
      returnTo: string;
    }>(`auth-state:${hashToken(state)}`);
    this.pending.delete(state);
    const previous = await this.get(request);
    if (
      !pending ||
      pending.expires < Date.now() ||
      !previous ||
      previous.sessionHash !== pending.sessionHash ||
      !code ||
      code.length > 4000
    )
      throw new ActionError(
        400,
        "Sign-in could not be matched to this browser. Open Quil at its configured address and try again.",
      );
    let identity: GoogleIdentity;
    try {
      const result = await this.fetcher("https://oauth2.googleapis.com/token", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.config.signInClientId,
          client_secret: this.config.signInClientSecret,
          redirect_uri: this.config.signInRedirectUri,
          code,
          code_verifier: pending.verifier,
          grant_type: "authorization_code",
        }),
      });
      const reader = result.body?.getReader();
      if (!reader || !result.ok) throw Error();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.length;
          if (bytes > 64_000) throw Error();
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (typeof raw.id_token !== "string") throw Error();
      identity = await Promise.race([
        this.verifier(raw.id_token, this.config.signInClientId),
        new Promise<never>((_, reject) => {
          const timer = setTimeout(() => reject(Error()), 15_000);
          timer.unref();
        }),
      ]);
      if (
        !identity ||
        typeof identity.sub !== "string" ||
        !identity.sub ||
        identity.sub.length > 255 ||
        identity.email_verified !== true ||
        identity.nonce !== pending.nonce ||
        typeof identity.email !== "string" ||
        identity.email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email)
      )
        throw Error();
    } catch {
      throw new ActionError(
        401,
        "Google sign-in could not be verified. Please try again.",
      );
    }
    const current = await this.sessionByHash(pending.sessionHash);
    if (!current)
      throw new ActionError(401, "This sign-in session ended. Start again from Quil.");
    const token = randomBytes(32).toString("hex"),
      hash = hashToken(token);
    let id = previous.id;
    await this.store.db.transaction(async () => {
      const existing = (await this.store.db
        .prepare("SELECT id FROM users WHERE google_sub=?")
        .get(identity.sub)) as { id: string } | undefined;
      if (existing) {
        id = existing.id;
        if (!previous.authenticated && previous.id !== id) {
          await adoptPreview(this.store, previous.id, id);
          await this.store.db.prepare("UPDATE charge_owners SET user_id=? WHERE user_id=?").run(id, previous.id);
          await this.store.db
            .prepare("UPDATE run_owners SET user_id=? WHERE user_id=?")
            .run(id, previous.id);
          const old = (await this.store.db
            .prepare("SELECT value FROM saved_prospects WHERE user_id IN (?,?)")
            .all(previous.id, id)) as { value: string }[];
          const merged = [
            ...new Map(
              old
                .flatMap((row) => JSON.parse(row.value))
                .map((item: { id: string }) => [item.id, item]),
            ).values(),
          ].slice(-30);
          if (merged.length)
            await this.store.db
              .prepare("INSERT OR REPLACE INTO saved_prospects VALUES(?,?,?)")
              .run(id, JSON.stringify(merged), new Date().toISOString());
        }
        await this.store.db
          .prepare("UPDATE users SET email=?,name=? WHERE id=?")
          .run(identity.email.toLowerCase(), identity.name?.slice(0, 80) ?? null, id);
      } else {
        if (previous.authenticated) {
          id = randomUUID();
          await this.store.db
            .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
            .run(
              id,
              identity.sub,
              identity.email.toLowerCase(),
              identity.name?.slice(0, 80) ?? null,
              new Date().toISOString(),
            );
        } else
          await this.store.db
            .prepare("UPDATE users SET google_sub=?,email=?,name=? WHERE id=?")
            .run(
              identity.sub,
              identity.email.toLowerCase(),
              identity.name?.slice(0, 80) ?? null,
              id,
            );
      }
      await this.store.db
        .prepare("DELETE FROM sessions WHERE token_hash=?")
        .run(previous.sessionHash);
      await this.store.db
        .prepare("INSERT INTO sessions VALUES(?,?,?)")
        .run(hash, id, Date.now() + 30 * 86400_000);
    });
    this.cookie(response, token);
    if (id !== previous.id && !previous.authenticated)
      await this.store.cache(
        `signin-hint:${hash}`,
        { adoptedGuestId: previous.id },
        60_000,
      );
    return { user: (await this.sessionByHash(hash))!, returnTo: pending.returnTo };
  }
  async logout(user: Principal, response: ServerResponse) {
    await this.store.db
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .run(user.sessionHash);
    this.cookie(response, "", 0);
  }
}
