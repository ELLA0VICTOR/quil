import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import type { Config } from "./config.ts";
import { assertLiveConfigured } from "./config.ts";
import { Store } from "./store.ts";
import { MissionEngine } from "./engine.ts";
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
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new HttpError(415, "Use application/json");
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 16_000) throw new HttpError(413, "Request too large");
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
  const streams = new Map<string, Set<ServerResponse>>();
  const publish = (event: RunEvent) => {
    for (const res of streams.get(event.runId) ?? []) {
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
      json(res, error instanceof HttpError ? error.status : 500, {
        error:
          error instanceof HttpError
            ? error.message
            : "The server could not process this request",
      });
    });
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  async function handle(req: IncomingMessage, res: ServerResponse) {
    const host = req.headers.host ?? "";
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host))
      throw new HttpError(403, "Loopback Host required");
    const origin = req.headers.origin;
    if (
      origin &&
      origin !== `http://${host}` &&
      !config.allowedOrigins.has(origin)
    )
      throw new HttpError(403, "Origin not allowed");
    const url = new URL(req.url ?? "/", `http://${host}`);
    if (req.method === "GET" && url.pathname === "/api/health") {
      json(res, 200, {
        status: "ok",
        mode: config.mode,
        framework: "@mozaik-ai/core",
        version: "4.2.0-beta.18",
        credentialsConfigured: {
          openai: !!config.openaiKey,
          search: !!config.searchKey,
        },
        liveEnabled: config.enableLive,
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/runs") {
      const input = brief(await body(req), config.mode);
      if (active.size >= 1)
        throw new HttpError(
          429,
          "One mission is already active. Finish or cancel it first.",
        );
      if (config.mode === "live") {
        try {
          assertLiveConfigured(config);
        } catch (error) {
          throw new HttpError(503, (error as Error).message);
        }
      }
      const id = randomUUID(),
        token = randomBytes(32).toString("hex"),
        now = new Date().toISOString();
      const run: RunSnapshot = {
        id,
        mode: config.mode,
        status: "queued",
        brief: input,
        createdAt: now,
        updatedAt: now,
      };
      const provider =
        options.providerFactory?.(id) ??
        (config.mode === "fixture"
          ? new FixtureProvider()
          : new LiveProvider(config, store, id));
      const engine = new MissionEngine(run, store, provider, publish);
      store.createRun(run, token);
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
    const run = store.run(id, token);
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
