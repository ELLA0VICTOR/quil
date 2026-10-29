import test from "node:test";
import assert from "node:assert/strict";
import {
  applyRunEvent,
  fromCreated,
  fromSnapshot,
  phaseFor,
  prospectsFor,
  safeSourceUrl,
} from "../../src/lib/run-view.ts";
import { prepareBrief } from "../brief.ts";
import type { CreatedRun, RunEvent } from "../../shared/mission.ts";

const created: CreatedRun = {
  run: {
    id: "run",
    mode: "live",
    status: "queued",
    createdAt: "2026-10-29T00:00:00Z",
    updatedAt: "2026-10-29T00:00:00Z",
    brief: {
      request: "Find a useful booking-flow opportunity",
      category: "repair shops",
      location: "Lagos",
      service: "website design",
      limit: 3,
    },
  },
  accessToken: "unused-test-token",
  eventsUrl: "/unused",
};
const event = (
  id: number,
  type: string,
  agent?: RunEvent["agent"],
  data: RunEvent["data"] = {},
): RunEvent => ({
  id,
  type,
  agent,
  data,
  runId: "run",
  at: "2026-10-29T00:00:00Z",
});
test("the view follows concurrent agent events, handles replay once, and does not invent progress", () => {
  const idle = fromCreated(created);
  assert.equal(idle.notes.pip, undefined);
  assert.equal(idle.activity.pip, undefined);
  let view = applyRunEvent(idle, event(1, "run.started"));
  view = applyRunEvent(view, event(2, "agent.started", "milo"));
  view = applyRunEvent(view, event(3, "agent.started", "iris"));
  assert.equal(view.activity.milo, "working");
  assert.equal(view.activity.iris, "working");
  assert.equal(phaseFor(view), "investigating");
  view = applyRunEvent(
    view,
    event(4, "agent.update", "iris", {
      text: "A source changed the decision.",
    }),
  );
  assert.equal(view.notes.iris, "A source changed the decision.");
  assert.equal(
    applyRunEvent(
      view,
      event(4, "agent.update", "iris", { text: "duplicate" }),
    ),
    view,
  );
  assert.equal(
    applyRunEvent(view, { ...event(5, "run.failed"), runId: "another-run" }),
    view,
  );
  view = applyRunEvent(view, event(5, "run.paused"));
  assert.equal(phaseFor(view), "paused");
  view = applyRunEvent(view, event(6, "run.cancelled"));
  assert.equal(view.outcome, undefined);
  assert.deepEqual(view.activity, {});
});
test("the final view uses returned businesses, sources and approved drafts instead of frontend fixtures", () => {
  const snapshot = {
    ...created.run,
    status: "completed" as const,
    outcome: {
      text: "Review Copper Repairs before reaching out.",
      candidates: [
        {
          id: "copper",
          name: "Copper Repairs",
          website: null,
          sourceIds: ["listing"],
        },
      ],
      findings: [
        {
          candidateId: "copper",
          summary: "A booking-flow record.",
          sourceIds: ["listing"],
        },
      ],
      decisions: [
        {
          candidateId: "copper",
          verdict: "opportunity" as const,
          reason: "A source supports a conversation.",
          sourceIds: ["check"],
        },
      ],
      drafts: [
        {
          candidateId: "copper",
          text: "Hi Copper Repairs team.",
          sourceIds: ["check"],
        },
      ],
      sources: [
        {
          id: "listing",
          url: "https://example.org/listing",
          title: "Listing",
          observation: "Public listing",
          observedAt: "2026-10-29",
          fictional: false,
        },
        {
          id: "check",
          url: "https://example.org/check",
          title: "Check",
          observation: "Independent check",
          observedAt: "2026-10-29",
          fictional: false,
        },
      ],
    },
  };
  const view = fromSnapshot(fromCreated(created), snapshot),
    prospects = prospectsFor(view);
  assert.equal(view.outcome?.text, snapshot.outcome.text);
  assert.equal(prospects[0].name, "Copper Repairs");
  assert.equal(prospects[0].location, "Lagos");
  assert.equal(prospects[0].draft, "Hi Copper Repairs team.");
  assert.equal(prospects[0].sources.length, 2);
  assert.equal(prospects[0].fictional, false);
  assert.equal(view.activity.iris, "ready");
  assert.equal(safeSourceUrl("javascript:alert(1)"), undefined);
  assert.equal(safeSourceUrl("https://user:secret@example.org"), undefined);
  assert.equal(
    safeSourceUrl("https://example.org/check"),
    "https://example.org/check",
  );
});
test("live briefs clarify missing details without model calls and retain previous answers", () => {
  const initial = prepareBrief({ request: "I build websites" }, "live");
  assert.deepEqual(initial.missing, ["category", "location"]);
  const complete = prepareBrief(
    {
      request: "Dentists in Lagos",
      context: initial.context,
      answering: initial.missing,
    },
    "live",
  );
  assert.deepEqual(complete.missing, []);
  assert.equal(complete.brief?.category, "Dentists");
  assert.equal(complete.brief?.location, "Lagos");
  assert.equal(complete.brief?.service, "website design and booking flows");
  const area = prepareBrief(
    { request: "Find cleaners in Manchester that need a website" },
    "live",
  );
  assert.equal(area.brief?.location, "Manchester");
  assert.equal(area.brief?.category, "cleaners");
  const unsupported = prepareBrief(
    {
      request: "Photography",
      context: { category: "dentists", location: "Lagos" },
      answering: ["service"],
    },
    "live",
  );
  assert.equal(unsupported.brief, undefined);
  assert.deepEqual(unsupported.missing, ["service"]);
});
