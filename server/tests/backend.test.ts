import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { AddressInfo } from "node:net";
import { request as httpRequest } from "node:http";
import { readConfig } from "../config.ts";
import { Store } from "../store.ts";
import { createApi } from "../http.ts";
import { OpenAIJson, SerperSearch, LiveProvider } from "../providers.ts";
import { MissionEngine } from "../engine.ts";
import type {
  CreatedRun,
  RunEvent,
  RunSnapshot,
} from "../../shared/mission.ts";

const fixturesRoot = resolve(".quil-data/tests");
mkdirSync(fixturesRoot, { recursive: true });
const temporary = () => mkdtempSync(join(fixturesRoot, "case-"));
function remove(directory: string) {
  const target = resolve(directory);
  assert.ok(target.startsWith(fixturesRoot + sep));
  rmSync(target, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  });
}
const liveEnv = {
  QUIL_MODE: "live",
  QUIL_ENABLE_LIVE: "true",
  OPENAI_API_KEY: "test-placeholder",
  SERPER_API_KEY: "test-placeholder",
};
const headers = { "Content-Type": "application/json" };
async function start() {
  const directory = temporary();
  const api = createApi(readConfig({ QUIL_DATA_DIR: directory }));
  await new Promise<void>((resolve) =>
    api.server.listen(0, "127.0.0.1", resolve),
  );
  const base = `http://127.0.0.1:${(api.server.address() as AddressInfo).port}`;
  return {
    ...api,
    base,
    directory,
    async cleanup() {
      await api.close();
      remove(directory);
    },
  };
}
async function create(base: string): Promise<CreatedRun> {
  const response = await fetch(base + "/api/runs", {
    method: "POST",
    headers,
    body: JSON.stringify({
      request:
        "Find cleaning businesses in Manchester that might need a booking website.",
    }),
  });
  assert.equal(response.status, 201);
  return response.json() as Promise<CreatedRun>;
}
const authorization = (run: CreatedRun) => ({
  Authorization: `Bearer ${run.accessToken}`,
});
async function snapshot(
  base: string,
  created: CreatedRun,
): Promise<RunSnapshot> {
  const response = await fetch(base + `/api/runs/${created.run.id}`, {
    headers: authorization(created),
  });
  assert.equal(response.status, 200);
  return (await response.json()).run;
}
async function complete(base: string, created: CreatedRun) {
  for (let i = 0; i < 150; i++) {
    const value = await snapshot(base, created);
    if (value.status === "completed") return value;
    if (value.status === "failed") throw Error(value.error);
    await delay(20);
  }
  throw Error("Fixture mission timed out");
}
function parseEvents(body: string): RunEvent[] {
  return body.split("\n\n").flatMap((block) => {
    const line = block.split("\n").find((line) => line.startsWith("data: "));
    return line ? [JSON.parse(line.slice(6))] : [];
  });
}

test("Mozaik agents overlap, invalidate a provisional pitch and produce one reviewed outcome", async () => {
  const api = await start();
  try {
    const created = await create(api.base);
    const stream = fetch(api.base + created.eventsUrl).then((r) => r.text());
    const result = await complete(api.base, created);
    const events = parseEvents(await stream);
    const intervals = (agent: string) => {
      const start = events.find(
        (e) => e.type === "operation.started" && e.agent === agent,
      )!;
      const end = events.find(
        (e) => e.type === "operation.completed" && e.agent === agent,
      )!;
      return [Date.parse(start.at), Date.parse(end.at)];
    };
    const [miloStart, miloEnd] = intervals("milo"),
      [irisStart, irisEnd] = intervals("iris");
    assert.ok(
      Math.min(miloEnd, irisEnd) - Math.max(miloStart, irisStart) > 0,
      "research and review actually overlap",
    );
    assert.ok(
      intervals("wren")[0] < irisEnd,
      "provisional writing can overlap independent review",
    );
    assert.equal(
      new Set(
        events.filter((e) => e.type === "agent.completed").map((e) => e.agent),
      ).size,
      5,
    );
    assert.ok(
      events
        .filter((e) => e.type === "agent.completed")
        .every(
          (e) =>
            Array.isArray(e.data.transitions) && e.data.transitions.length >= 3,
        ),
    );
    assert.ok(events.some((e) => e.type === "draft.invalidated"));
    assert.equal(
      events.filter((e) => e.type === "agent.started" && e.agent === "wren")
        .length,
      2,
    );
    assert.deepEqual(
      result.outcome?.drafts.map((d) => d.candidateId),
      ["fern"],
    );
    assert.equal(
      result.outcome?.decisions.find((d) => d.candidateId === "sunday")
        ?.verdict,
      "ruled_out",
    );
    assert.equal(
      result.outcome?.decisions.find((d) => d.candidateId === "clearwell")
        ?.verdict,
      "uncertain",
    );
    assert.ok(result.outcome?.sources.every((s) => s.fictional));
    assert.deepEqual(
      api.store.usage(created.run.id),
      [],
      "fixture work never reserves model/search spending",
    );
    assert.equal(events.filter((e) => e.type === "run.completed").length, 1);
    const cursor = events[Math.floor(events.length / 2)].id;
    const replay = await fetch(
      api.base + created.eventsUrl + `&after=${cursor}`,
    );
    const replayed = parseEvents(await replay.text());
    assert.ok(replayed.length > 0);
    assert.ok(replayed.every((e) => e.id > cursor));
    assert.equal(replayed.at(-1)?.type, "run.completed");
  } finally {
    await api.cleanup();
  }
});

test("pause freezes publication, resume continues, and cancellation cannot later complete", async () => {
  const api = await start();
  try {
    const created = await create(api.base);
    await delay(15);
    const command = (action: string) =>
      fetch(`${api.base}/api/runs/${created.run.id}/${action}`, {
        method: "POST",
        headers: authorization(created),
      });
    assert.equal((await command("pause")).status, 200);
    await delay(300);
    assert.equal((await snapshot(api.base, created)).status, "paused");
    assert.equal(
      api.store
        .events(created.run.id)
        .filter((e) => e.type === "agent.completed").length,
      0,
    );
    assert.equal((await command("resume")).status, 200);
    await complete(api.base, created);
    const second = await create(api.base);
    const cancel = await fetch(`${api.base}/api/runs/${second.run.id}/cancel`, {
      method: "POST",
      headers: authorization(second),
    });
    assert.equal(cancel.status, 200);
    await delay(350);
    assert.equal((await snapshot(api.base, second)).status, "cancelled");
    assert.equal(
      api.store.events(second.run.id).some((e) => e.type === "run.completed"),
      false,
    );
  } finally {
    await api.cleanup();
  }
});

test("HTTP rejects cross-origin requests, unknown tokens, oversized briefs and overlapping runs", async () => {
  const api = await start();
  try {
    assert.equal(
      (
        await fetch(api.base + "/api/health", {
          headers: { Origin: "https://untrusted.example" },
        })
      ).status,
      403,
    );
    const badHost = await new Promise<number | undefined>((resolve, reject) => {
      const req = httpRequest(
        api.base + "/api/health",
        { headers: { Host: "untrusted.example" } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on("error", reject);
      req.end();
    });
    assert.equal(badHost, 403);
    assert.equal(
      (
        await fetch(api.base + "/api/runs", {
          method: "POST",
          headers,
          body: JSON.stringify({ request: "x".repeat(2001) }),
        })
      ).status,
      400,
    );
    const created = await create(api.base);
    assert.equal(
      (await fetch(api.base + `/api/runs/${created.run.id}`)).status,
      404,
    );
    assert.equal(
      (
        await fetch(api.base + `/api/runs/${created.run.id}/cancel`, {
          method: "POST",
          headers: { Authorization: `Bearer ${"0".repeat(64)}` },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await fetch(api.base + "/api/runs", {
          method: "POST",
          headers,
          body: JSON.stringify({ request: "another run" }),
        })
      ).status,
      429,
    );
    assert.equal(
      (await fetch(api.base + created.eventsUrl + "&after=-1")).status,
      400,
    );
  } finally {
    await api.cleanup();
  }
});

test("reservations persist, serialize competing calls, retain unknown charges, and fail closed", async () => {
  const directory = temporary();
  let store = new Store(directory);
  const config = readConfig({
    ...liveEnv,
    QUIL_TOTAL_BUDGET_USD: "0.0001",
    QUIL_RUN_BUDGET_USD: "0.0001",
  });
  try {
    const competing = await Promise.allSettled(
      [1, 2].map(() =>
        Promise.resolve().then(() =>
          store.reserve("one", 60_000, "openai", config),
        ),
      ),
    );
    assert.equal(competing.filter((r) => r.status === "fulfilled").length, 1);
    store.close();
    store = new Store(directory);
    assert.throws(
      () => store.reserve("two", 60_000, "openai", config),
      /usage limit/,
    );
    assert.throws(
      () => store.reserve("two", -1, "openai", config),
      /Invalid reservation/,
    );
    const id = (
      competing.find(
        (r) => r.status === "fulfilled",
      ) as PromiseFulfilledResult<string>
    ).value;
    assert.throws(() => store.settle(id, 60_001), /exceeded/);
    store.settle(id, 20_000);
    assert.ok(store.reserve("two", 60_000, "openai", config));
  } finally {
    store.close();
    remove(directory);
  }
});

test("OpenAI transport caps output, disables storage, caches and never retries an ambiguous failure", async () => {
  const directory = temporary(),
    store = new Store(directory),
    config = readConfig(liveEnv);
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, "https://api.openai.com/v1/responses");
    const body = JSON.parse(init!.body as string);
    assert.equal(body.max_output_tokens, 800);
    assert.equal(body.store, false);
    assert.equal(body.reasoning.effort, "none");
    assert.equal(body.tools, undefined);
    return Response.json({
      status: "completed",
      usage: { input_tokens: 20, output_tokens: 10 },
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: '{"ok":true}' }],
        },
      ],
    });
  };
  try {
    const ai = new OpenAIJson(config, store, "run", fetcher);
    assert.deepEqual(
      await ai.call("Test", { data: "test" }, new AbortController().signal),
      { ok: true },
    );
    await ai.call("Test", { data: "test" }, new AbortController().signal);
    assert.equal(calls, 1);
    await assert.rejects(
      ai.call(
        "Test",
        { data: "x".repeat(15000) },
        new AbortController().signal,
      ),
      /small-context/,
    );
    let failures = 0;
    const broken = new OpenAIJson(config, store, "bad", async () => {
      failures++;
      throw Error("network timeout");
    });
    await assert.rejects(
      broken.call("Test", { unique: true }, new AbortController().signal),
      /network timeout/,
    );
    assert.equal(failures, 1);
    const charge = store.usage("bad")[0] as { nanoUsd: number };
    assert.ok(charge.nanoUsd > 0);
    const gated = new OpenAIJson(readConfig({}), store, "off", fetcher);
    await assert.rejects(
      gated.call("Test", {}, new AbortController().signal),
      /Live mode needs/,
    );
    assert.equal(calls, 1);
  } finally {
    store.close();
    remove(directory);
  }
});

test("search caches records and enforces its independent request allowance", async () => {
  const directory = temporary(),
    store = new Store(directory),
    config = readConfig({ ...liveEnv, QUIL_MAX_SEARCH_REQUESTS: "1" });
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return Response.json({
      organic: [
        {
          title: "Business",
          link: "https://example.com/business",
          snippet: "A public snippet",
        },
      ],
    });
  };
  try {
    const search = new SerperSearch(config, store, "run", fetcher),
      signal = new AbortController().signal;
    assert.equal(
      (await search.search("same query", signal))[0].fictional,
      false,
    );
    await search.search("same query", signal);
    assert.equal(calls, 1);
    await assert.rejects(search.search("another query", signal), /usage limit/);
    assert.equal(calls, 1);
  } finally {
    store.close();
    remove(directory);
  }
});

test("restarting marks unfinished runs failed without releasing reservations or retrying", () => {
  const directory = temporary(),
    store = new Store(directory);
  try {
    const now = new Date().toISOString();
    store.createRun(
      {
        id: "restart",
        status: "paused",
        mode: "fixture",
        brief: {
          request: "test",
          category: "cleaning",
          location: "Manchester",
          service: "website design",
          limit: 3,
        },
        createdAt: now,
        updatedAt: now,
      },
      "token",
    );
    store.reserve("restart", 5000, "openai", readConfig({}));
    store.recover();
    assert.equal(store.run("restart", "token")?.status, "failed");
    assert.equal(
      (store.usage("restart")[0] as { nanoUsd: number }).nanoUsd,
      5000,
    );
  } finally {
    store.close();
    remove(directory);
  }
});

test("a second API cannot recover or overwrite a running owner's data directory", async () => {
  const api = await start();
  try {
    const created = await create(api.base);
    assert.throws(
      () => createApi(readConfig({ QUIL_DATA_DIR: api.directory })),
      /already owns/,
    );
    assert.notEqual((await snapshot(api.base, created)).status, "failed");
    await complete(api.base, created);
  } finally {
    await api.cleanup();
  }
});

test("live adapters use source records, and a late website reference removes its provisional draft", async () => {
  const directory = temporary(),
    store = new Store(directory),
    config = readConfig(liveEnv);
  const names = [
    "Fern & Co. Cleaning",
    "Clearwell Home Care",
    "Sunday Cleaning Studio",
  ];
  let modelCalls = 0,
    searchCalls = 0;
  const transport: typeof fetch = async (url, init) => {
    const payload = JSON.parse(init!.body as string);
    if (url === "https://google.serper.dev/search") {
      searchCalls++;
      if (payload.q.startsWith('"')) {
        await delay(25);
        const name = names.find((name) => payload.q.includes(name))!;
        if (name === names[2])
          return Response.json({
            knowledgeGraph: {
              title: name,
              website: "https://sunday.example.com",
              description: "Sunday Cleaning Studio in Manchester.",
            },
            organic: [],
          });
        return Response.json({
          organic: [
            {
              title: name,
              link:
                name === names[0]
                  ? "https://example.com/fern"
                  : "https://example.com/clearwell",
              snippet:
                name === names[0]
                  ? `${name} in Manchester: message us for booking availability.`
                  : `${name} in Manchester. Contact details only.`,
            },
          ],
        });
      }
      return Response.json({
        organic: names.map((name, i) => ({
          title: name,
          link: `https://example.com/listing-${i}`,
          snippet: `${name}, a cleaning business in Manchester.`,
        })),
      });
    }
    assert.equal(url, "https://api.openai.com/v1/responses");
    modelCalls++;
    const input = JSON.parse(payload.input);
    let answer: unknown;
    if (payload.instructions.startsWith("Extract"))
      answer = {
        candidates: names.map((name) => ({
          name,
          website: null,
          sourceIds: [
            input.sources.find((s: { title: string }) => s.title === name).id,
          ],
        })),
      };
    else if (payload.instructions.startsWith("Research"))
      answer = {
        findings: input.candidates.map(
          (c: { id: string; sourceIds: string[] }) => ({
            candidateId: c.id,
            summary: "The directory record needs an independent check.",
            sourceIds: c.sourceIds,
          }),
        ),
      };
    else
      answer = {
        drafts: input.candidates.map(
          (c: { id: string; name: string; sourceIds: string[] }) => ({
            candidateId: c.id,
            text: `Hi ${c.name}, would a simpler booking flow be useful?`,
            sourceIds: c.sourceIds,
          }),
        ),
      };
    return Response.json({
      status: "completed",
      usage: { input_tokens: 150, output_tokens: 100 },
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(answer) }],
        },
      ],
    });
  };
  try {
    const now = new Date().toISOString();
    const run: RunSnapshot = {
      id: "live-transport-test",
      mode: "live",
      status: "queued",
      brief: {
        request: "Find cleaning businesses needing a booking website",
        category: "cleaning",
        location: "Manchester",
        service: "website design",
        limit: 3,
      },
      createdAt: now,
      updatedAt: now,
    };
    store.createRun(run, "token");
    const engine = new MissionEngine(
      run,
      store,
      new LiveProvider(config, store, run.id, transport),
    );
    await engine.start();
    await engine.settled;
    assert.equal(run.status, "completed", run.error);
    assert.equal(searchCalls, 4);
    assert.equal(modelCalls, 4);
    const sunday = run.outcome!.candidates.find((c) => c.name === names[2])!;
    assert.equal(
      run.outcome!.decisions.find((d) => d.candidateId === sunday.id)?.verdict,
      "ruled_out",
    );
    assert.equal(run.outcome!.drafts.length, 1);
    assert.equal(
      run.outcome!.drafts.some((d) => d.candidateId === sunday.id),
      false,
    );
    assert.ok(store.events(run.id).some((e) => e.type === "draft.invalidated"));
    assert.ok(run.outcome!.sources.some((s) => s.kind === "website_reference"));
  } finally {
    store.close();
    remove(directory);
  }
});
