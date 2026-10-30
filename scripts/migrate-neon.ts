import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { readConfig } from "../server/config.ts";
import { Store } from "../server/store.ts";

if (existsSync(".env")) process.loadEnvFile(".env");
const config = readConfig();
if (!config.databaseUrl || !config.tokenKey)
  throw Error("Configure DATABASE_URL and QUIL_GOOGLE_TOKEN_KEY first.");
const localKey = join(config.dataDir, "google-token.key");
if (existsSync(localKey)) {
  const a = readFileSync(localKey),
    b = Buffer.from(config.tokenKey, "base64");
  if (a.length !== b.length || !timingSafeEqual(a, b))
    throw Error(
      "The encryption key does not match the local Google key. No data imported.",
    );
}
const source = new DatabaseSync(join(config.dataDir, "quil.sqlite"), { readOnly: true });
const tables = [
  "users",
  "sessions",
  "runs",
  "run_owners",
  "events",
  "charges",
  "charge_times",
  "integrations",
  "outreach",
  "outreach_owners",
  "saved_prospects",
  "cache",
  "run_controls",
];
const snapshots: Record<string, Record<string, unknown>[]> = {};
source.exec("BEGIN");
try {
  const active = source
    .prepare(
      "SELECT count(*) n FROM runs WHERE json_extract(snapshot,'$.status') IN ('queued','running','paused')",
    )
    .get() as { n: number };
  if (active.n) throw Error("Finish or cancel active local research before migration.");
  for (const table of tables) {
    const exists = source
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(table);
    snapshots[table] = exists ? source.prepare(`SELECT * FROM ${table}`).all() : [];
  }
  source.exec("COMMIT");
} catch (error) {
  source.exec("ROLLBACK");
  source.close();
  throw error;
}
source.close();
snapshots.cache = snapshots.cache.filter(
  (row) =>
    !/^auth-state:|^google-state:|^google-attempt:|^signin-hint:/.test(String(row.key)),
);
const target = new Store(config.dataDir, config.databaseUrl);
try {
  await target.ready;
  await target.db.transaction(async () => {
    for (const table of tables) {
      const row = await target.db.prepare(`SELECT count(*) n FROM ${table}`).get();
      if (Number(row?.n))
        throw Error(
          "The Quil database already contains records. No existing data was overwritten.",
        );
    }
    for (const table of tables) {
      const rows = snapshots[table];
      if (!rows.length) continue;
      const columns = Object.keys(rows[0]);
      for (let index = 0; index < rows.length; index += 100) {
        const batch = rows.slice(index, index + 100);
        const values = batch.flatMap((row) => columns.map((column) => row[column]));
        await target.db
          .prepare(
            `INSERT INTO ${table} (${columns.join(",")}) VALUES ${batch.map(() => `(${columns.map(() => "?").join(",")})`).join(",")}`,
          )
          .run(...values);
      }
    }
    await target.db.exec(
      "SELECT setval(pg_get_serial_sequence('quil.events','id'), COALESCE(MAX(id),1), MAX(id) IS NOT NULL) FROM events",
    );
  });
  console.log(
    JSON.stringify({
      imported: true,
      localDatabasePreserved: true,
      counts: Object.fromEntries(tables.map((table) => [table, snapshots[table].length])),
    }),
  );
} catch {
  console.error(
    "Neon migration did not complete. Existing local data was preserved. Check the database configuration and destination state.",
  );
  process.exitCode = 1;
} finally {
  await target.close();
}
