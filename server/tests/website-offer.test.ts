import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join, sep } from "node:path";
import {
  investigateWebsite,
  publicAddress,
  loadPublicPage,
} from "../website.ts";
import { developOffer } from "../../shared/offers.ts";
import { LiveProvider, FixtureProvider } from "../providers.ts";
import { MissionEngine } from "../engine.ts";
import { readConfig } from "../config.ts";
import { Store } from "../store.ts";
import type {
  Brief,
  Candidate,
  Decision,
  RunSnapshot,
} from "../../shared/mission.ts";

const candidate: Candidate = {
  id: "one",
  name: "Copper Hair",
  website: "https://copper.example/",
  sourceIds: ["source"],
};
const brief: Brief = {
  request: "Find hairdressers in Manchester",
  category: "hairdressers",
  location: "Manchester",
  service: "booking-page design",
  limit: 1,
};
const decision: Decision = {
  candidateId: "one",
  verdict: "opportunity",
  reason: "The profile invites messages.",
  evidenceQuote: "DM to book",
  sourceIds: ["source"],
};
test("website checks read bounded HTML signals, find public contact links, and never equate HTTP success with a fully working site", async () => {
  const check = await investigateWebsite(
    candidate,
    new AbortController().signal,
    async () => ({
      status: 200,
      url: candidate.website!,
      html: '<a href="https://copper.booksy.com/">Book online</a><a href="mailto:hello@copper.example">Contact</a>',
    }),
  );
  assert.equal(check.status, "reachable");
  assert.equal(check.bookingLinks.length, 1);
  assert.deepEqual(check.contactEmails, ["hello@copper.example"]);
  assert.match(check.reason, /not a full functional/);
  const timeout = await investigateWebsite(
    candidate,
    new AbortController().signal,
    async () => {
      throw Error("timeout");
    },
  );
  assert.equal(timeout.status, "inconclusive");
  assert.match(timeout.reason, /Do not claim/);
  const unknown = await investigateWebsite(
    { ...candidate, website: null },
    new AbortController().signal,
    async () => {
      throw Error("Must not fetch a guessed URL");
    },
  );
  assert.equal(unknown.status, "not_listed");
});
test("website requests refuse loopback, private, mapped and metadata addresses", async () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "192.168.1.1",
    "172.16.0.1",
    "169.254.169.254",
    "::1",
    "fc00::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
  ])
    assert.equal(publicAddress(address), false, address);
  assert.equal(publicAddress("8.8.8.8"), true);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
  await assert.rejects(
    loadPublicPage("http://127.0.0.1/private", new AbortController().signal),
    /not public/,
  );
});
test("tailored offers retain evidence and open commercial terms instead of invented fees or guarantees", () => {
  const draft = developOffer(
    { candidateId: candidate.id, text: "A hello", sourceIds: ["source"] },
    candidate,
    brief,
    decision,
    [],
    {
      angle: "Keep messages while adding a clear request form.",
      scope: [
        "A service selector for hair appointments.",
        "A simple preferred-time request.",
      ],
    },
  );
  assert.match(draft.offer!, /Copper Hair/);
  assert.match(draft.offer!, /DM to book/);
  assert.match(draft.offer!, /hair appointments/);
  assert.match(draft.offer!, /To be agreed/);
  assert.deepEqual(
    draft.followUps?.map((item) => item.afterDays),
    [3, 7],
  );
  const unsafe = developOffer(draft, candidate, brief, decision, [], {
    angle: "Guaranteed £5000 sales",
    scope: ["Deliver in 2 days for £50"],
  });
  assert.doesNotMatch(unsafe.offer!, /£5000|£50|2 days/);
  const existing = developOffer(
    draft,
    candidate,
    brief,
    decision,
    [
      {
        candidateId: candidate.id,
        url: candidate.website,
        status: "reachable",
        checkedAt: new Date().toISOString(),
        bookingLinks: [],
        reason: "An HTML page responded.",
      },
    ],
    {
      angle: "Replace the existing website from scratch",
      scope: ["Replace the current website."],
    },
  );
  assert.doesNotMatch(existing.offer!, /from scratch|Replace the current/);
  assert.match(existing.offer!, /Keep the existing site/);
});
test("actual Mozaik agents overlap, revisit late website evidence and withdraw the provisional offer", async () => {
  const root = resolve(".quil-data/tests");
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "website-review-")),
    store = new Store(directory);
  const live = new LiveProvider(
    readConfig({
      QUIL_ENABLE_LIVE: "true",
      OPENAI_API_KEY: "test",
      SERPER_API_KEY: "test",
    }),
    store,
    "review-only",
    async () => {
      throw Error("Final review must not call a model or search");
    },
  );
  const fixture = new FixtureProvider();
  const now = new Date().toISOString();
  const run: RunSnapshot = {
    id: "late-website",
    mode: "fixture",
    status: "queued",
    brief,
    createdAt: now,
    updatedAt: now,
  };
  store.createRun(run, "test");
  const engine = new MissionEngine(run, store, {
    execute: async (agent, input, signal) => {
      if (agent === "pip")
        return {
          candidates: [candidate],
          sources: [
            {
              id: "source",
              title: "Copper Hair Manchester",
              observation: "DM to book",
              url: candidate.website!,
              observedAt: now,
              fictional: true,
            },
          ],
        };
      if (agent === "milo") {
        await delay(100);
        return {
          findings: [
            {
              candidateId: candidate.id,
              summary: "A website responded",
              sourceIds: ["source"],
            },
          ],
          websiteChecks: [
            {
              candidateId: candidate.id,
              url: candidate.website,
              status: "reachable",
              checkedAt: now,
              bookingLinks: ["https://copper.booksy.com/"],
              reason: "A booking link was present.",
            },
          ],
        };
      }
      if (agent === "iris" && input.revision === 0) {
        await delay(10);
        return { decisions: [decision] };
      }
      if (agent === "iris") {
        await delay(100);
        return live.execute(agent, input, signal);
      }
      if (agent === "quil")
        return {
          text: "The booking link changed the plan. Check the existing flow before proposing work.",
        };
      return fixture.execute(agent, input, signal);
    },
  });
  try {
    await engine.start();
    await engine.settled;
    assert.equal(run.status, "completed", run.error);
    assert.equal(run.outcome!.decisions[0].verdict, "uncertain");
    assert.equal(run.outcome!.drafts.length, 0);
    const events = store.events(run.id);
    assert.ok(events.some((event) => event.type === "draft.invalidated"));
    assert.equal(
      events.filter(
        (event) => event.agent === "iris" && event.type === "agent.completed",
      ).length,
      2,
    );
    assert.equal(
      new Set(
        events
          .filter((event) => event.type === "agent.started")
          .map((event) => event.agent),
      ).size,
      5,
    );
    const started = (agent: string) =>
      Date.parse(
        events.find(
          (event) =>
            event.type === "operation.started" && event.agent === agent,
        )!.at,
      );
    const completed = (agent: string) =>
      Date.parse(
        events.find(
          (event) =>
            event.type === "operation.completed" && event.agent === agent,
        )!.at,
      );
    assert.ok(
      Math.min(completed("milo"), completed("iris")) -
        Math.max(started("milo"), started("iris")) >=
        0,
    );
    assert.deepEqual(store.usage(run.id), []);
  } finally {
    store.close();
    assert.ok(resolve(directory).startsWith(root + sep));
    rmSync(directory, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
});
