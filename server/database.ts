import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";
import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, types } from "pg";
import type { PoolClient } from "pg";

const tables: Record<string, string[]> = {
  runs: ["id", "token_hash", "snapshot"],
  cache: ["key", "expires", "value"],
  integrations: ["name", "secret"],
  server_lease: ["id", "pid", "owner"],
  users: ["id", "google_sub", "email", "name", "created_at"],
  sessions: ["token_hash", "user_id", "expires"],
  saved_prospects: ["user_id", "value", "updated_at"],
  outreach: ["id", "run_id", "candidate_id", "state", "record"],
  outreach_owners: ["action_id", "user_id"],
  run_owners: ["run_id", "user_id"],
  charge_times: ["charge_id", "at"],
};

export function postgresSql(sql: string, namespace = "quil") {
  let s = sql
    .replace(/PRAGMA[^;]+;/g, "")
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, "BIGSERIAL PRIMARY KEY")
    .replace(/\bINTEGER\b/g, "BIGINT");
  s = s.replace(
    /json_extract\((\w+(?:\.\w+)?),'\$\.([^']+)'\)/g,
    (_, column: string, path: string) =>
      `(${column}::jsonb #>> '{${path.split(".").join(",")}}')`,
  );
  s = s.replace(/a\.rowid DESC/g, "(a.record::jsonb ->> 'createdAt') DESC");
  const upsert = s.match(/^\s*INSERT OR (REPLACE|IGNORE) INTO (\w+)\s*/i);
  if (upsert) {
    s = s.replace(/INSERT OR (?:REPLACE|IGNORE) INTO/i, "INSERT INTO");
    if (/\bSELECT\b/i.test(s) && !/\bWHERE\b/i.test(s)) s += " WHERE TRUE";
    if (upsert[1].toUpperCase() === "IGNORE") s += " ON CONFLICT DO NOTHING";
    else {
      const columns = tables[upsert[2]];
      if (!columns) throw Error("Unknown upsert table");
      s += ` ON CONFLICT (${columns[0]}) DO UPDATE SET ${columns
        .slice(1)
        .map((c) => `${c}=EXCLUDED.${c}`)
        .join(",")}`;
    }
  }
  s = s.replace(/AS nanoUsd/gi, 'AS "nanoUsd"');
  const names = [...Object.keys(tables), "events", "charges", "run_controls"].join("|");
  s = s.replace(
    new RegExp(
      `\\b(FROM|JOIN|INTO|UPDATE|ON|TABLE IF NOT EXISTS)\\s+(${names})\\b`,
      "gi",
    ),
    (_, keyword: string, table: string) => `${keyword} ${namespace}.${table}`,
  );
  let index = 0;
  return s.replace(/'(?:''|[^'])*'|\?/g, (token) =>
    token === "?" ? `$${++index}` : token,
  );
}

// Query methods and transactions share one interface for local SQLite and Neon.
// The lock context prevents awaited local transactions from mixing requests.
export class Database {
  readonly kind: "sqlite" | "postgres";
  private local?: DatabaseSync;
  private pool?: Pool;
  private context = new AsyncLocalStorage<{ client?: PoolClient }>();
  private tail: Promise<unknown> = Promise.resolve();
  readonly ready: Promise<void>;
  constructor(
    path: string,
    schema: string,
    connectionString?: string,
    private namespace = "quil",
  ) {
    if (!/^quil(?:_test_[a-f0-9]{12})?$/.test(namespace))
      throw Error("Invalid database namespace");
    this.kind = connectionString ? "postgres" : "sqlite";
    if (connectionString) {
      let url:URL;
      try { url=new URL(connectionString); } catch { throw Error("Invalid DATABASE_URL. Use the private PostgreSQL connection string."); }
      if (!["postgres:", "postgresql:"].includes(url.protocol))
        throw Error("DATABASE_URL must be PostgreSQL");
      url.searchParams.set("sslmode", "verify-full");
      types.setTypeParser(20, (value) => {
        const n = Number(value);
        if (!Number.isSafeInteger(n)) throw Error("Database integer exceeds safe range");
        return n;
      });
      types.setTypeParser(1700, (value) => {
        const n = Number(value);
        if (!Number.isFinite(n)) throw Error("Invalid database number");
        return n;
      });
      this.pool = new Pool({
        connectionString: url.href,
        max: 4,
        connectionTimeoutMillis: 10_000,
        idleTimeoutMillis: 10_000,
        query_timeout: 15_000,
      });
      this.pool.on("error", () => console.warn("A database connection was interrupted."));
      this.ready = (async () => {
        const client = await this.pool!.connect();
        try {
          await client.query("BEGIN");
          await client.query("SELECT pg_advisory_xact_lock(1364543820)");
          await client.query(`CREATE SCHEMA IF NOT EXISTS ${namespace}`);
          await client.query(postgresSql(schema, namespace));
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK").catch(() => {});
          throw error;
        } finally {
          client.release();
        }
      })();
    } else {
      this.local = new DatabaseSync(path);
      this.local.exec(schema);
      this.ready = Promise.resolve();
    }
  }
  private async locked<T>(work: () => Promise<T> | T): Promise<T> {
    if (this.kind === "postgres" || this.context.getStore()) return work();
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((r) => (release = r));
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }
  async transaction<T>(work: () => Promise<T>): Promise<T> {
    await this.ready;
    if (this.context.getStore()) return work();
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(1364543820)");
        const result = await this.context.run({ client }, work);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }
    return this.locked(async () => {
      this.local!.exec("BEGIN IMMEDIATE");
      try {
        const result = await this.context.run({}, work);
        this.local!.exec("COMMIT");
        return result;
      } catch (error) {
        this.local!.exec("ROLLBACK");
        throw error;
      }
    });
  }
  prepare(sql: string) {
    const query = async (mode: "get" | "all" | "run", values: unknown[]) => {
      await this.ready;
      return this.locked(async () => {
        if (this.local) {
          const statement = this.local.prepare(sql),
            args = values as SQLInputValue[];
          return mode === "get"
            ? statement.get(...args)
            : mode === "all"
              ? statement.all(...args)
              : statement.run(...args);
        }
        let statement = postgresSql(sql, this.namespace);
        if (
          mode === "run" &&
          new RegExp(`^\\s*INSERT INTO ${this.namespace}\\.events\\b`, "i").test(
            statement,
          )
        )
          statement += " RETURNING id";
        const result = await (this.context.getStore()?.client ?? this.pool!).query(
          statement,
          values,
        );
        return mode === "get"
          ? result.rows[0]
          : mode === "all"
            ? result.rows
            : { changes: result.rowCount ?? 0, lastInsertRowid: result.rows[0]?.id ?? 0 };
      });
    };
    return {
      get: (...args: unknown[]) =>
        query("get", args) as Promise<Record<string, unknown> | undefined>,
      all: (...args: unknown[]) =>
        query("all", args) as Promise<Record<string, unknown>[]>,
      run: (...args: unknown[]) =>
        query("run", args) as Promise<{
          changes: number | bigint;
          lastInsertRowid: number | bigint;
        }>,
    };
  }
  async exec(sql: string) {
    await this.ready;
    await this.locked(async () => {
      if (this.local) this.local.exec(sql);
      else
        await (this.context.getStore()?.client ?? this.pool!).query(
          postgresSql(sql, this.namespace),
        );
    });
  }
  async close() {
    await this.ready;
    await this.tail;
    if (this.pool) await this.pool.end();
    else this.local!.close();
  }
}
