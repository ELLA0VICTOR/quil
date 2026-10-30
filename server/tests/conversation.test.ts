import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { chat, conversationResponse } from "../conversation.ts";
import { Store, hashToken } from "../store.ts";
import { readConfig } from "../config.ts";
import { createApi } from "../http.ts";
import { consumePreview, adoptPreview, ConnectRequired } from "../preview.ts";
import type { RunSnapshot } from "../../shared/mission.ts";

const root = resolve(".quil-data/tests");
mkdirSync(root, { recursive: true });
const config = readConfig({ QUIL_MODE: "live", QUIL_ENABLE_LIVE: "true", OPENAI_API_KEY: "test", SERPER_API_KEY: "test" });
async function fixture() {
  const directory = mkdtempSync(join(root, "chat-"));
  const store = new Store(directory);
  await store.ready;
  return { store, directory, async close() { await store.close(); assert.ok(directory.startsWith(root)); rmSync(directory, { recursive: true, force: true }); } };
}
const emptyRun = (): RunSnapshot => ({
  id: randomUUID(), mode: "live", status: "completed", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  brief: { request: "Find salons in Abuja", service: "website design", category: "salons", location: "Abuja", limit: 3 },
  outcome: { text: "No supported businesses found.", candidates: [], decisions: [], sources: [], findings: [], drafts: [] },
});

test("chat uses owned research, preserves conversation context, and does not create research or send actions", async () => {
  const f = await fixture();
  try {
    const run = emptyRun();
    await f.store.createRun(run, "private-token", "alice");
    const turn = { id: randomUUID(), request: "website business, abuja", runId: run.id, history: [{ role: "assistant", text: "Who do you want to reach?" }], context: { service: "website design" } };
    let calls = 0;
    const model = async (_: string, input: unknown) => {
      calls++;
      const data = input as { recordedResearch: RunSnapshot; history: unknown[]; request: string };
      assert.equal(data.request, turn.request);
      assert.equal(data.recordedResearch.mode, "live");
      assert.equal(data.history.length, 1);
      return { intent: "clarify", fields: { service: "website design", location: "Abuja" }, questionField: "category", message: "Which businesses in Abuja would you like to build websites for?" };
    };
    const response = await chat(config, f.store, "alice", turn, model);
    assert.equal(response.questionField, "category");
    assert.equal(response.context.location, "Abuja");
    assert.equal(response.brief, undefined);
    assert.deepEqual(await chat(config, f.store, "alice", turn, model), response);
    assert.equal(calls, 1, "retrying the same turn reuses the recorded response");
    const next = await chat(config, f.store, "alice", { id: randomUUID(), request: "restaurants", context: response.context }, async () => ({
      intent: "search", message: "I'll look for restaurants in Abuja.", fields: { service: "website design", category: "restaurants", location: "Abuja" },
    }));
    assert.equal(next.brief?.category, "restaurants");
    assert.equal(next.brief?.location, "Abuja");
    assert.equal((await f.store.db.prepare("SELECT COUNT(*) n FROM runs").get() as { n: number }).n, 1);
    assert.equal((await f.store.db.prepare("SELECT COUNT(*) n FROM outreach").get() as { n: number }).n, 0);
    await assert.rejects(chat(config, f.store, "bob", { ...turn, id: randomUUID() }, model), /not found/);
    assert.equal(calls, 1);
  } finally { await f.close(); }
});

test("incomplete searches, provider failures and duplicate in-flight requests do not produce canned successes", async () => {
  const f = await fixture();
  try {
    assert.throws(() => conversationResponse({ intent: "search", fields: { service: "websites", location: "Abuja" }, message: "Searching" }, "websites Abuja"), /clearer business type/);
    assert.equal(conversationResponse({ intent: "reply", message: "Hey!", fields: {} }, "hello", { service: "website design", location: "Abuja" }).context.location, "Abuja");
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const id = randomUUID();
    const first = chat(config, f.store, "alice", { id, request: "hello" }, async () => {
      await pending;
      return { intent: "reply", message: "Hey! What kind of work do you do?", fields: {} };
    });
    for (let i = 0; i < 50; i++) {
      if (await f.store.cached("chat-active:alice")) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await assert.rejects(chat(config, f.store, "alice", { id, request: "hello" }), /processing|interrupted/);
    await assert.rejects(chat(config, f.store, "alice", { id: randomUUID(), request: "another" }), /previous message/);
    release();
    await first;
    await assert.rejects(chat(config, f.store, "alice", { id: randomUUID(), request: "hello again" }, async () => { throw Error("provider unavailable"); }), /couldn't reach its AI/);
    assert.equal(await f.store.cached("chat-active:alice"), undefined);
  } finally { await f.close(); }
});

test("chat spending counts toward the same account allowance as research", async () => {
  const f = await fixture();
  try {
    const small = { ...config, userDailyBudget: 1000 };
    await f.store.reserve("chat-1", 700, "openai", small, "alice");
    await assert.rejects(f.store.reserve("chat-2", 400, "openai", small, "alice"), /daily allowance/);
    await f.store.reserve("chat-3", 400, "openai", small, "bob");
    const run = emptyRun();
    await f.store.createRun(run, "token", "alice");
    await assert.rejects(f.store.reserve(run.id, 400, "openai", small), /daily allowance/);
  } finally { await f.close(); }
});

test("chat endpoint permits a limited guest preview, enforces ownership and returns model-backed clarification", async () => {
  const f = await fixture();
  const token = randomBytes(32).toString("hex");
  await f.store.db.prepare("INSERT INTO users VALUES(?,?,?,?,?)").run("alice", "alice-sub", "alice@example.test", "Alice", new Date().toISOString());
  await f.store.db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(hashToken(token), "alice", Date.now() + 3600_000);
  let calls = 0;
  const api = await createApi({ ...config, dataDir: root, previewChatTurns: 1 }, { store: f.store, conversationModel: async () => {
    calls++;
    return { intent: "clarify", message: "Which kinds of businesses in Abuja would you like to reach?", fields: { service: "website design", location: "Abuja" }, questionField: "category" };
  } });
  await new Promise<void>((resolve) => api.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(api.server.address() as { port: number }).port}`;
  const send = (cookie = "", runId?: string) => fetch(base + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json", Origin: base, "X-Quil-Action": "review", Cookie: cookie }, body: JSON.stringify({ id: randomUUID(), request: "website business, abuja", runId }) });
  try {
    const guest = await send();
    assert.equal(guest.status, 200);
    const guestCookie = guest.headers.get("set-cookie")!.split(";")[0];
    const limited = await send(guestCookie);
    assert.equal(limited.status, 403);
    assert.equal((await limited.json()).code, "CONNECT_GOOGLE_REQUIRED");
    const response = await send(`quil_session=${token}`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).context.location, "Abuja");
    assert.equal((await send(`quil_session=${token}`, randomUUID())).status, 404);
    assert.equal(calls, 2);
  } finally {
    await api.close();
    assert.ok(f.directory.startsWith(root));
    rmSync(f.directory, { recursive: true, force: true });
  }
});

test("preview chat and research quotas are atomic, survive sign-in adoption and unlock with a connection", async () => {
  const f = await fixture();
  const small = { ...config, previewChatTurns: 2, previewResearchRuns: 1 };
  try {
    const simultaneous = await Promise.allSettled([
      consumePreview(f.store, small, "guest", "chat"),
      consumePreview(f.store, small, "guest", "chat"),
      consumePreview(f.store, small, "guest", "chat"),
    ]);
    assert.equal(simultaneous.filter(r => r.status === "fulfilled").length, 2);
    assert.equal(simultaneous.filter(r => r.status === "rejected" && r.reason instanceof ConnectRequired).length, 1);
    await adoptPreview(f.store, "guest", "alice");
    await assert.rejects(consumePreview(f.store, small, "alice", "chat"), { code: "CONNECT_GOOGLE_REQUIRED" });
    await f.store.createRun(emptyRun(), "one", "alice", small);
    await assert.rejects(f.store.createRun(emptyRun(), "two", "alice", small), { code: "CONNECT_GOOGLE_REQUIRED" });
    await f.store.db.prepare("INSERT INTO integrations VALUES(?,?)").run("google:alice", "fixture-only-connection");
    await consumePreview(f.store, small, "alice", "chat");
    await f.store.createRun(emptyRun(), "three", "alice", small);
    assert.equal((await f.store.db.prepare("SELECT COUNT(*) n FROM runs").get() as { n: number }).n, 2);
  } finally { await f.close(); }
});
