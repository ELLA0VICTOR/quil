import test from "node:test";
import assert from "node:assert/strict";
import { CloudTrace } from "../cloud.ts";
import { postgresSql } from "../database.ts";
import type { RunEvent } from "../../shared/mission.ts";
import { readConfig } from "../config.ts";

test("Vercel derives canonical callbacks from its production domain and rejects ephemeral SQLite storage", () => {
  const env = {
    VERCEL: "1",
    VERCEL_PROJECT_PRODUCTION_URL: "quil.example",
    DATABASE_URL: "postgres://fixture:fixture@localhost/fixture",
    QUIL_GOOGLE_TOKEN_KEY: Buffer.alloc(32).toString("base64"),
    GOOGLE_SIGNIN_CLIENT_ID: "signin",
    GOOGLE_SIGNIN_CLIENT_SECRET: "fixture-signin",
    GOOGLE_CLIENT_ID: "agent",
    GOOGLE_CLIENT_SECRET: "fixture-agent",
  };
  const config = readConfig(env);
  assert.equal(config.publicOrigin, "https://quil.example");
  assert.equal(config.storage, "postgres");
  assert.equal(config.signInRedirectUri, "https://quil.example/api/auth/google/callback");
  assert.equal(config.googleRedirectUri, "https://quil.example/api/google/callback");
  assert.throws(
    () => readConfig({ ...env, QUIL_STORAGE: "sqlite" }),
    /Vercel requires postgres/,
  );
  assert.throws(
    () =>
      readConfig({
        ...env,
        GOOGLE_REDIRECT_URI: "http://127.0.0.1:8787/api/google/callback",
      }),
    /agent callback/,
  );
});

test("PostgreSQL statements bind parameters, isolate the namespace and preserve question marks inside quoted literals", () => {
  assert.equal(
    postgresSql("SELECT value FROM cache WHERE key=? AND value='?'"),
    "SELECT value FROM quil.cache WHERE key=$1 AND value='?'",
  );
  assert.match(
    postgresSql("INSERT OR REPLACE INTO cache VALUES(?,?,?)"),
    /^INSERT INTO quil.cache VALUES\(\$1,\$2,\$3\) ON CONFLICT \(key\) DO UPDATE SET expires=EXCLUDED.expires,value=EXCLUDED.value$/,
  );
  assert.match(
    postgresSql("SELECT json_extract(r.snapshot,'$.brief.request') FROM runs r"),
    /r.snapshot::jsonb #>> '\{brief,request\}'/,
  );
});
test("Cloud traces are opt-in and export execution metadata without prompts, answers, contacts or credentials", async () => {
  const sent: unknown[] = [],
    roster: unknown[] = [];
  let enabled = 0,
    ended = 0;
  const factory = (options: Record<string, unknown>) => {
    enabled++;
    assert.equal(options.redaction, "content");
    return {
      enabled: true,
      join: (agent: unknown) => roster.push(agent),
      send: (event: unknown) => sent.push(event),
      end: async () => {
        ended++;
      },
    };
  };
  const off = new CloudTrace("disabled", { cloudEnabled: false, cloudKey: "" }, factory);
  await off.start();
  assert.equal(enabled, 0);
  const trace = new CloudTrace(
    "run-id",
    { cloudEnabled: true, cloudKey: "private-project-key" },
    factory,
  );
  await trace.start();
  const base = {
    id: 1,
    runId: "run-id",
    at: new Date().toISOString(),
    agent: "pip",
  } as const;
  trace.record({
    ...base,
    type: "agent.started",
    data: {
      loopId: "actual-loop",
      revision: 0,
      text: "private prompt",
      recipient: "private@example.test",
    },
  });
  trace.record({
    ...base,
    type: "operation.started",
    data: { revision: 0, answer: "private answer", token: "private-token" },
  });
  trace.record({
    ...base,
    type: "agent.completed",
    data: {
      loopId: "actual-loop",
      revision: 0,
      elapsedMs: 40,
      transitions: [{ from: "awaiting_inference", to: "completed", at: base.at }],
      text: "private answer",
    },
  } as RunEvent);
  await trace.end();
  assert.equal(roster.length, 5);
  assert.equal(ended, 1);
  const output = JSON.stringify(sent);
  assert.match(output, /inference.started/);
  assert.match(output, /actual-loop/);
  assert.match(output, /loop.transition/);
  assert.doesNotMatch(
    output,
    /private prompt|private answer|private@example|private-token|private-project-key/,
  );
});
