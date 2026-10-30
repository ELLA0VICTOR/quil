import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { Config } from "./config.ts";
import type { RunSnapshot, RunEvent } from "../shared/mission.ts";

export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export class Store {
  readonly db: DatabaseSync;
  private serverLease: string | undefined;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(join(directory, "quil.sqlite"));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, snapshot TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, at TEXT NOT NULL, type TEXT NOT NULL, agent TEXT, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS event_runs ON events(run_id,id);
      CREATE TABLE IF NOT EXISTS charges (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, provider TEXT NOT NULL, reserved INTEGER NOT NULL, charged INTEGER NOT NULL, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, expires INTEGER NOT NULL, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS server_lease (id INTEGER PRIMARY KEY CHECK(id=1), pid INTEGER NOT NULL, owner TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS integrations (name TEXT PRIMARY KEY, secret TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outreach (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, candidate_id TEXT NOT NULL, state TEXT NOT NULL, record TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, google_sub TEXT UNIQUE, email TEXT, name TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
      CREATE TABLE IF NOT EXISTS run_owners (run_id TEXT PRIMARY KEY, user_id TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS run_owner_user ON run_owners(user_id);
      CREATE TABLE IF NOT EXISTS outreach_owners (action_id TEXT PRIMARY KEY, user_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS saved_prospects (user_id TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS charge_times (charge_id TEXT PRIMARY KEY, at TEXT NOT NULL);
    `);
  }
  claimServer() {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const lease = this.db
        .prepare("SELECT pid FROM server_lease WHERE id=1")
        .get() as { pid: number } | undefined;
      if (lease) {
        let alive = true;
        try {
          process.kill(lease.pid, 0);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ESRCH") alive = false;
        }
        if (alive)
          throw Error("A Quil API process already owns this data directory");
      }
      const owner = randomUUID();
      this.db
        .prepare("INSERT OR REPLACE INTO server_lease VALUES(1,?,?)")
        .run(process.pid, owner);
      this.db.exec("COMMIT");
      this.serverLease = owner;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  createRun(run: RunSnapshot, token: string, userId?: string) {
    this.db
      .prepare("INSERT INTO runs VALUES (?,?,?)")
      .run(run.id, hashToken(token), JSON.stringify(run));
    if (userId) this.db.prepare("INSERT INTO run_owners VALUES(?,?)").run(run.id, userId);
  }
  saveRun(run: RunSnapshot) {
    this.db
      .prepare("UPDATE runs SET snapshot=? WHERE id=?")
      .run(JSON.stringify(run), run.id);
  }
  run(id: string, token: string, userId?: string): RunSnapshot | undefined {
    if (userId && !this.ownsRun(id, userId)) return;
    const row = this.db
      .prepare("SELECT snapshot FROM runs WHERE id=? AND token_hash=?")
      .get(id, hashToken(token)) as { snapshot: string } | undefined;
    return row ? JSON.parse(row.snapshot) : undefined;
  }
  ownsRun(id: string, userId: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM run_owners WHERE run_id=? AND user_id=?").get(id, userId);
  }
  append(
    runId: string,
    type: string,
    agent: string | undefined,
    data: Record<string, unknown>,
  ): RunEvent {
    const at = new Date().toISOString();
    const result = this.db
      .prepare(
        "INSERT INTO events(run_id,at,type,agent,data) VALUES(?,?,?,?,?)",
      )
      .run(runId, at, type, agent ?? null, JSON.stringify(data));
    return {
      id: Number(result.lastInsertRowid),
      runId,
      at,
      type,
      ...(agent ? { agent } : {}),
      data,
    } as RunEvent;
  }
  events(runId: string, after = 0): RunEvent[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM events WHERE run_id=? AND id>? ORDER BY id LIMIT 300",
      )
      .all(runId, after) as {
      id: number;
      run_id: string;
      at: string;
      type: string;
      agent: string | null;
      data: string;
    }[];
    return rows.map((r) => ({
      id: r.id,
      runId: r.run_id,
      at: r.at,
      type: r.type,
      ...(r.agent ? { agent: r.agent as RunEvent["agent"] } : {}),
      data: JSON.parse(r.data),
    }));
  }
  reserve(
    runId: string,
    amount: number,
    provider: "openai" | "search",
    config: Config,
  ): string {
    if (!Number.isSafeInteger(amount) || amount < 0)
      throw Error("Invalid reservation amount");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const total = this.db
        .prepare(
          "SELECT COALESCE(SUM(charged),0) AS cost, COUNT(*) AS calls FROM charges WHERE provider=?",
        )
        .get(provider) as { cost: number; calls: number };
      const run = this.db
        .prepare(
          "SELECT COALESCE(SUM(charged),0) AS cost, COUNT(*) AS calls FROM charges WHERE provider=? AND run_id=?",
        )
        .get(provider, runId) as { cost: number; calls: number };
      const blocked =
        provider === "openai"
          ? total.cost + amount > config.totalBudget ||
            run.cost + amount > config.runBudget ||
            run.calls >= config.maxCalls
          : total.calls >= config.searchTotal ||
            run.calls >= config.searchPerRun;
      if (blocked) throw Error(`${provider} usage limit reached`);
      const owner = this.db.prepare("SELECT user_id FROM run_owners WHERE run_id=?").get(runId) as { user_id: string } | undefined;
      if (owner) {
        const daily = this.db.prepare("SELECT COALESCE(SUM(c.charged),0) cost,COUNT(*) calls FROM charges c JOIN run_owners o ON o.run_id=c.run_id JOIN charge_times t ON t.charge_id=c.id WHERE o.user_id=? AND c.provider=? AND t.at>=?").get(owner.user_id, provider, new Date(Date.now() - 86400_000).toISOString()) as { cost: number; calls: number };
        if (provider === "openai" ? daily.cost + amount > config.userDailyBudget : daily.calls >= config.userDailySearch) throw Error(`${provider} daily allowance reached for this account`);
      }
      const id = randomUUID();
      // A crash or ambiguous network failure retains the whole reservation.
      this.db
        .prepare("INSERT INTO charges VALUES(?,?,?,?,?,?)")
        .run(id, runId, provider, amount, amount, "reserved");
      this.db.prepare("INSERT INTO charge_times VALUES(?,?)").run(id, new Date().toISOString());
      this.db.exec("COMMIT");
      return id;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  settle(id: string, actual: number) {
    const row = this.db
      .prepare("SELECT reserved FROM charges WHERE id=?")
      .get(id) as { reserved: number } | undefined;
    if (
      !row ||
      !Number.isSafeInteger(actual) ||
      actual < 0 ||
      actual > row.reserved
    )
      throw Error("Provider usage exceeded its reservation");
    this.db
      .prepare("UPDATE charges SET charged=?,state='settled' WHERE id=?")
      .run(actual, id);
  }
  usage(runId: string) {
    return this.db
      .prepare(
        "SELECT provider,COUNT(*) AS calls,SUM(charged) AS nanoUsd FROM charges WHERE run_id=? GROUP BY provider",
      )
      .all(runId);
  }
  cached<T>(key: string): T | undefined {
    const row = this.db
      .prepare("SELECT value FROM cache WHERE key=? AND expires>?")
      .get(key, Date.now()) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : undefined;
  }
  cache(key: string, value: unknown, ttlMs: number) {
    this.db
      .prepare("INSERT OR REPLACE INTO cache VALUES(?,?,?)")
      .run(key, Date.now() + ttlMs, JSON.stringify(value));
  }
  recover() {
    const rows = this.db.prepare("SELECT snapshot FROM runs").all() as {
      snapshot: string;
    }[];
    for (const row of rows) {
      const run: RunSnapshot = JSON.parse(row.snapshot);
      if (
        run.status === "running" ||
        run.status === "queued" ||
        run.status === "paused"
      ) {
        run.status = "failed";
        run.error =
          "Server restarted. Start a new run; no automatic retry was made.";
        run.updatedAt = new Date().toISOString();
        this.saveRun(run);
        this.append(run.id, "run.failed", undefined, { message: run.error });
      }
    }
  }
  close() {
    if (this.serverLease)
      this.db
        .prepare("DELETE FROM server_lease WHERE owner=?")
        .run(this.serverLease);
    this.db.close();
  }
}
