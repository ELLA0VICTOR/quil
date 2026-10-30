import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import type { Config } from "./config.ts";
import { assertLiveConfigured } from "./config.ts";
import { Store } from "./store.ts";
import { Accounts } from "./accounts.ts";
import type { IdentityVerifier } from "./accounts.ts";
import { savedRecords } from "./saved.ts";
import { MissionEngine } from "./engine.ts";
import { prepareBrief } from "./brief.ts";
import { GoogleConnection, ActionError } from "./google.ts";
import { OutreachService } from "./outreach.ts";
import { crewAction } from "./crew-action.ts";
import { FixtureProvider, LiveProvider } from "./providers.ts";
import type { TaskProvider } from "./providers.ts";
import type { Brief, RunSnapshot, RunEvent } from "../shared/mission.ts";

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage, max = 16_000): Promise<Record<string, unknown>> {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new HttpError(415, "Use application/json");
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > max) throw new HttpError(413, "Request too large");
    chunks.push(Buffer.from(chunk));
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HttpError(400, "Expected a JSON object");
  return value as Record<string, unknown>;
}
function brief(value: Record<string, unknown>, mode: Config["mode"]): Brief {
  const field = (key: string, max: number, fallback?: string) => {
    const v = value[key] ?? fallback;
    if (typeof v !== "string" || !v.trim() || v.length > max)
      throw new HttpError(
        400,
        `${key} is required and must be at most ${max} characters`,
      );
    return v.trim();
  };
  const limit = value.limit ?? 3;
  if (
    !Number.isInteger(limit) ||
    (limit as number) < 1 ||
    (limit as number) > 3
  )
    throw new HttpError(400, "limit must be 1, 2 or 3");
  return {
    request: field("request", 2000),
    category: field(
      "category",
      100,
      mode === "fixture" ? "cleaning services" : undefined,
    ),
    location: field(
      "location",
      100,
      mode === "fixture" ? "Manchester, UK" : undefined,
    ),
    service: field(
      "service",
      150,
      mode === "fixture" ? "website design" : undefined,
    ),
    limit: limit as number,
  };
}
export function createApi(
  config: Config,
  options: {
    store?: Store;
    providerFactory?: (id: string) => TaskProvider;
    googleFactory?: (userId: string) => GoogleConnection;
    identityVerifier?: IdentityVerifier;
    identityFetcher?: typeof fetch;
  } = {},
) {
  const store = options.store ?? new Store(config.dataDir);
  try {
    store.claimServer();
    store.recover();
  } catch (error) {
    store.close();
    throw error;
  }
  const active = new Map<string, MissionEngine>();
  const accounts = new Accounts(config, store, options.identityFetcher, options.identityVerifier);
  const connections = new Map<string, GoogleConnection>();
  const outreachServices = new Map<string, OutreachService>();
  const googleAttempts = new Map<string, { userId: string; sessionHash: string; expires: number }>();
  const googleFor = (userId: string) => {
    let connection = connections.get(userId);
    if (!connection) { connection = options.googleFactory?.(userId) ?? new GoogleConnection(config, store, fetch, userId); if (connection.userId !== userId) throw Error("Connection owner mismatch"); connections.set(userId, connection); }
    return connection;
  };
  const outreachFor = (userId: string) => {
    let service = outreachServices.get(userId);
    if (!service) { service = new OutreachService(store, googleFor(userId), () => Date.now(), userId); service.recover(); outreachServices.set(userId, service); }
    return service;
  };
  const streamSessions = new WeakMap<ServerResponse, string>();
  const streams = new Map<string, Set<ServerResponse>>();
  const publish = (event: RunEvent) => {
    for (const res of streams.get(event.runId) ?? []) {
      if (!accounts.sessionByHash(streamSessions.get(res) ?? "")) { res.end(); continue; }
      res.write(
        `id: ${event.id}\nevent: mission\ndata: ${JSON.stringify(event)}\n\n`,
      );
      if (res.writableLength > 1_000_000) res.destroy();
      else if (
        ["run.completed", "run.failed", "run.cancelled"].includes(event.type)
      )
        res.end();
    }
  };
  const server = createServer((req, res) => {
    void handle(req, res).catch((error) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      json(
        res,
        error instanceof HttpError || error instanceof ActionError
          ? error.status
          : 500,
        {
          error:
            error instanceof HttpError || error instanceof ActionError
              ? error.message
              : "The server could not process this request",
        },
      );
    });
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  async function handle(req: IncomingMessage, res: ServerResponse) {
    const host = req.headers.host ?? "";
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) && (!config.publicOrigin || host !== new URL(config.publicOrigin).host))
      throw new HttpError(403, "Loopback Host required");
    const origin = req.headers.origin;
    if (
      origin &&
      (config.publicOrigin || origin !== `http://${host}`) &&
      !config.allowedOrigins.has(origin)
    )
      throw new HttpError(403, "Origin not allowed");
    const url = new URL(req.url ?? "/", `http://${host}`);
    if (req.method === "GET" && url.pathname === "/api/health") {
      json(res, 200, { status: "ok", mode: config.mode, framework: "@mozaik-ai/core", version: "4.2.0-beta.18", credentialsConfigured: { openai: !!config.openaiKey, search: !!config.searchKey }, liveEnabled: config.enableLive }); return;
    }
    if (req.method === "GET" && url.pathname === "/api/auth/google/callback") {
      const signedIn = await accounts.callback(req, res, url.searchParams.get("state") ?? "", url.searchParams.get("code") ?? "");
      const legacyImported = googleFor(signedIn.user.id).adoptLegacy(signedIn.user.email!);
      if (legacyImported) store.cache(`signin-hint:${signedIn.user.sessionHash}`, { ...store.cached<object>(`signin-hint:${signedIn.user.sessionHash}`), legacyImported: true }, 60_000);
      res.writeHead(303, { Location: `${signedIn.returnTo}/#/workspace`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }); res.end(); return;
    }
    if (req.method === "GET" && url.pathname === "/api/google/callback") {
      const state = url.searchParams.get("state") ?? "", attempt = googleAttempts.get(state); googleAttempts.delete(state);
      const current = accounts.get(req);
      if (!attempt || attempt.expires < Date.now() || !accounts.sessionByHash(attempt.sessionHash) || current && current.id !== attempt.userId || config.publicOrigin && !current) throw new ActionError(400, "The connection session ended or changed. Connect again from your Quil account.");
      const returnTo = await googleFor(attempt.userId).callback(state, url.searchParams.get("code") ?? "");
      res.writeHead(303, { Location: `${returnTo}/#/workspace`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }); res.end(); return;
    }
    const user = accounts.ensure(req, res);
    if (req.headers["x-quil-workspace"] && req.headers["x-quil-workspace"] !== user.id) throw new ActionError(409, "Your workspace changed. Reload before continuing.");
    if (req.method === "GET" && url.pathname === "/api/session") { json(res, 200, accounts.view(user)); return; }
    const reviewed = () => { if (!origin || req.headers["x-quil-action"] !== "review") throw new HttpError(403, "Open Quil and review this action first."); };
    if (req.method === "POST" && url.pathname === "/api/auth/signin") { reviewed(); json(res, 200, { url: accounts.authorize(user, origin!, req.socket.remoteAddress ?? "local") }); return; }
    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      reviewed(); accounts.logout(user, res);
      for (const subscribers of streams.values()) for (const subscriber of subscribers) if (streamSessions.get(subscriber) === user.sessionHash) subscriber.end();
      json(res, 200, { signedOut: true }); return;
    }
    if (url.pathname === "/api/me/saved") {
      if (req.method === "GET") { const row = store.db.prepare("SELECT value FROM saved_prospects WHERE user_id=?").get(user.id) as { value: string } | undefined; json(res, 200, { saved: row ? JSON.parse(row.value) : [], initialized: !!row }); return; }
      if (req.method === "PUT") { reviewed(); const value = await body(req, 200_000), saved = savedRecords(value.saved, store, user.id); store.db.prepare("INSERT OR REPLACE INTO saved_prospects VALUES(?,?,?)").run(user.id, JSON.stringify(saved), new Date().toISOString()); json(res, 200, { saved }); return; }
    }
    if (url.pathname.startsWith("/api/google") || url.pathname.startsWith("/api/outreach")) {
      if (req.method === "GET" && url.pathname === "/api/google/status") {
        json(res, 200, user.authenticated ? googleFor(user.id).status() : { configured: !!config.googleClientId && !!config.googleClientSecret, connected: false, redirectUri: config.googleRedirectUri }); return;
      }
      accounts.require(user); if (req.method === "POST") reviewed();
      const google = googleFor(user.id), outreach = outreachFor(user.id);
      if (req.method === "POST" && url.pathname === "/api/google/connect") {
        const authorization = google.authorize(origin!), state = new URL(authorization).searchParams.get("state")!;
        for (const [key, value] of googleAttempts) if (value.expires < Date.now()) googleAttempts.delete(key);
        googleAttempts.set(state, { userId: user.id, sessionHash: user.sessionHash, expires: Date.now() + 600_000 });
        json(res, 200, { url: authorization }); return;
      }
      if (req.method === "POST" && url.pathname === "/api/google/disconnect") { await google.disconnect(); json(res, 200, google.status()); return; }
      if (req.method === "GET" && url.pathname === "/api/outreach") { json(res, 200, { actions: outreach.list(url.searchParams.get("runId") ?? "", url.searchParams.get("candidateId") ?? "") }); return; }
      if (req.method === "POST" && ["/api/outreach/prepare", "/api/outreach/slots"].includes(url.pathname)) {
        const value = await body(req); if (typeof value.runId !== "string" || !store.ownsRun(value.runId, user.id)) throw new HttpError(404, "Opportunity not found in this account.");
        if (url.pathname.endsWith("/slots")) json(res, 200, { slots: await crewAction(store, value.runId, "quil", "find-calendar-availability", () => outreach.availableSlots(value)) });
        else json(res, 201, { action: await crewAction(store, value.runId, "wren", "prepare-outreach-preview", () => outreach.prepare(value)) });
        return;
      }
      const actionMatch = url.pathname.match(/^\/api\/outreach\/([a-f0-9]{32})\/(approve|sync|cancel)$/);
      if (actionMatch && req.method === "POST") {
        const value = await body(req), [, actionId, operation] = actionMatch, recorded = outreach.get(actionId);
        const action = operation === "cancel" ? outreach.cancel(actionId) : await crewAction(store, recorded.runId, "quil", operation === "approve" ? "carry-out-approved-outreach" : "check-outreach-status", () => operation === "approve" ? outreach.approve(actionId, value.approved) : outreach.sync(actionId));
        json(res, 200, { action }); return;
      }
      throw new HttpError(404, "Integration endpoint not found");
    }
    if (req.method === "POST" && url.pathname === "/api/brief") {
      const value = await body(req);
      try {
        json(res, 200, prepareBrief(value, config.mode));
      } catch (error) {
        throw new HttpError(400, (error as Error).message);
      }
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/runs") {
      const payload = await body(req);
      if (payload.mode !== undefined && payload.mode !== "fixture")
        throw new HttpError(
          400,
          "Only explicit fixture mode can be requested by a client",
        );
      const runMode = payload.mode === "fixture" ? "fixture" : config.mode;
      const input = brief(payload, runMode);
      const ownedActive = [...active.keys()].filter((id) => store.ownsRun(id, user.id));
      if (ownedActive.length >= 1)
        throw new HttpError(
          429,
          "One mission is already active. Finish or cancel it first.",
        );
      if (active.size >= config.maxActiveRuns) throw new HttpError(429, "The research team is busy. Please try again shortly.");
      if (runMode === "live") {
        try {
          assertLiveConfigured(config);
          accounts.require(user);
        } catch (error) {
          if (error instanceof ActionError) throw error;
          throw new HttpError(503, (error as Error).message);
        }
      }
      const id = randomUUID(),
        token = randomBytes(32).toString("hex"),
        now = new Date().toISOString();
      const run: RunSnapshot = {
        id,
        mode: runMode,
        status: "queued",
        brief: input,
        createdAt: now,
        updatedAt: now,
      };
      const provider =
        options.providerFactory?.(id) ??
        (runMode === "fixture"
          ? new FixtureProvider()
          : new LiveProvider(config, store, id));
      const engine = new MissionEngine(run, store, provider, publish);
      store.createRun(run, token, user.id);
      active.set(id, engine);
      const timer = setTimeout(() => engine.cancel(), 120_000);
      timer.unref();
      void engine.settled.then(() => {
        clearTimeout(timer);
        active.delete(id);
      });
      json(res, 201, {
        run,
        accessToken: token,
        eventsUrl: `/api/runs/${id}/events?token=${token}`,
      });
      setImmediate(() => {
        void engine.start();
      });
      return;
    }
    const match = url.pathname.match(
      /^\/api\/runs\/([a-f0-9-]{36})(?:\/(events|cancel|pause|resume))?$/,
    );
    if (!match) throw new HttpError(404, "Endpoint not found");
    const [, id, action] = match;
    const bearer = req.headers.authorization?.match(
      /^Bearer ([a-f0-9]{64})$/,
    )?.[1];
    const token =
      bearer ??
      (action === "events" ? url.searchParams.get("token") : null) ??
      "";
    const run = store.run(id, token, user.id);
    if (!run) throw new HttpError(404, "Mission not found");
    if (!action && req.method === "GET") {
      json(res, 200, { run, usage: store.usage(id) });
      return;
    }
    if (action === "events" && req.method === "GET") {
      const after = Number(
        req.headers["last-event-id"] ?? url.searchParams.get("after") ?? 0,
      );
      if (!Number.isSafeInteger(after) || after < 0)
        throw new HttpError(400, "Invalid event cursor");
      const subscribers = streams.get(id) ?? new Set<ServerResponse>();
      if (subscribers.size >= 4)
        throw new HttpError(429, "Too many event connections");
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
      });
      res.write(": connected\n\n");
      for (const event of store.events(id, after))
        res.write(
          `id: ${event.id}\nevent: mission\ndata: ${JSON.stringify(event)}\n\n`,
        );
      if (["completed", "failed", "cancelled"].includes(run.status)) {
        res.end();
        return;
      }
      streams.set(id, subscribers);
      subscribers.add(res);
      streamSessions.set(res, user.sessionHash);
      const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15_000);
      heartbeat.unref();
      res.on("close", () => {
        clearInterval(heartbeat);
        subscribers.delete(res);
        if (!subscribers.size) streams.delete(id);
      });
      return;
    }
    if (
      req.method === "POST" &&
      action &&
      ["cancel", "pause", "resume"].includes(action)
    ) {
      const engine = active.get(id);
      if (!engine) throw new HttpError(409, "This mission has already ended");
      try {
        if (action === "cancel") engine.cancel();
        else if (action === "pause") engine.pause();
        else engine.resume();
      } catch (error) {
        throw new HttpError(409, (error as Error).message);
      }
      json(res, 200, { run: engine.run });
      return;
    }
    throw new HttpError(405, "Method not allowed");
  }
  return {
    server,
    store,
    active,
    async close() {
      for (const engine of active.values()) engine.cancel();
      for (const set of streams.values()) for (const res of set) res.end();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      store.close();
    },
  };
}
