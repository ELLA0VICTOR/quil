import { mkdir, writeFile } from "node:fs/promises";
import type { CreatedRun, RunEvent } from "../shared/mission.ts";

const base = "http://127.0.0.1:8787";
const health = await (await fetch(base + "/api/health")).json();
if (health.mode !== "fixture")
  throw Error("This demonstration only runs in free fixture mode");
const response = await fetch(base + "/api/runs", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    request:
      "Find cleaning businesses in Manchester that could use a simpler booking website.",
  }),
});
if (!response.ok)
  throw Error(`Could not start demonstration (${response.status})`);
const created = (await response.json()) as CreatedRun;
const stream = await fetch(base + created.eventsUrl);
if (!stream.ok) throw Error(`Could not open event stream (${stream.status})`);
const events = (await stream.text()).split("\n\n").flatMap((block) => {
  const line = block.split("\n").find((line) => line.startsWith("data: "));
  return line ? [JSON.parse(line.slice(6)) as RunEvent] : [];
});
const finished = events.at(-1);
if (finished?.type !== "run.completed")
  throw Error("Demonstration did not complete");
const intervals = (agent: string) => {
  const start = events.find(
    (e) => e.type === "operation.started" && e.agent === agent,
  )!;
  const end = events.find(
    (e) => e.type === "operation.completed" && e.agent === agent,
  )!;
  return [Date.parse(start.at), Date.parse(end.at)];
};
const milo = intervals("milo"),
  iris = intervals("iris");
const overlapMs = Math.max(
  0,
  Math.min(milo[1], iris[1]) - Math.max(milo[0], iris[0]),
);
const trace = {
  description:
    "Actual Mozaik execution using fictional records and deterministic fixture providers. No paid inference or search.",
  framework: "@mozaik-ai/core@4.2.0-beta.18",
  overlapMs,
  modelCostUsd: 0,
  searchRequests: 0,
  events,
};
console.log(
  JSON.stringify(
    {
      mode: "fixture",
      overlapMs,
      corrections: events.filter((e) => e.type === "draft.invalidated").length,
      outcome: finished.data.outcome,
    },
    null,
    2,
  ),
);
if (process.argv.includes("--save-trace")) {
  await mkdir("docs", { recursive: true });
  // Access tokens and request URLs are deliberately excluded from this artifact.
  await writeFile(
    "docs/fixture-trace.json",
    JSON.stringify(trace, null, 2) + "\n",
  );
  console.log("Saved docs/fixture-trace.json");
}
