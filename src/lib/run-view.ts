import type {
  AgentId,
  CreatedRun,
  Outcome,
  RunEvent,
  RunMode,
  RunSnapshot,
  RunStatus,
  Source,
} from "../../shared/mission.ts";
import type { MissionPhase } from "../data/crew.ts";

export type Activity = "waiting" | "working" | "ready" | "error";
export type MissionView = {
  kind: "mission";
  id: string;
  request: string;
  mode?: RunMode;
  location: string;
  brief?: Partial<RunSnapshot["brief"]>;
  status: RunStatus | "connecting";
  connection: "connected" | "reconnecting";
  notes: Partial<Record<AgentId, string>>;
  activity: Partial<Record<AgentId, Activity>>;
  lastEventId: number;
  outcome?: Outcome;
  error?: string;
  onlyOpportunities?: boolean;
};
export type ChatItem =
  | MissionView
  | { kind: "message"; id: string; speaker: AgentId | "you"; text: string };
export type Prospect = {
  id: string;
  name: string;
  category: string;
  location: string;
  status: "Opportunity" | "Needs a closer look" | "Website found";
  note: string;
  sources: Source[];
  draft: string;
  fictional: boolean;
};
export const ended = (status: MissionView["status"]) =>
  ["completed", "failed", "cancelled"].includes(status);
export function newMission(id: string, request: string): MissionView {
  return {
    kind: "mission",
    id,
    request,
    location: "",
    status: "connecting",
    connection: "connected",
    notes: {},
    activity: {},
    lastEventId: 0,
  };
}
export function fromCreated(created: CreatedRun): MissionView {
  return fromSnapshot(
    newMission(created.run.id, created.run.brief.request),
    created.run,
  );
}
export function fromSnapshot(view: MissionView, run: RunSnapshot): MissionView {
  const result: MissionView = {
    ...view,
    id: run.id,
    request: run.brief.request,
    mode: run.mode,
    brief: run.brief,
    location: run.mode === "fixture" ? "Manchester" : run.brief.location,
    status: run.status,
    outcome: run.outcome,
    error: run.error,
  };
  if (run.status === "completed")
    result.activity = {
      quil: "ready",
      pip: "ready",
      milo: "ready",
      iris: "ready",
      wren: "ready",
    };
  if (run.outcome)
    result.notes = {
      pip: `Found ${run.outcome.candidates.length} businesses to investigate.`,
      milo: `Compared the records for ${run.outcome.findings.length} businesses.`,
      iris: `${run.outcome.decisions.filter((d) => d.verdict === "opportunity").length} supported; ${run.outcome.decisions.filter((d) => d.verdict === "uncertain").length} inconclusive; ${run.outcome.decisions.filter((d) => d.verdict === "ruled_out").length} set aside.`,
      wren: run.outcome.drafts.length
        ? `${run.outcome.drafts.length} reviewed introduction${run.outcome.drafts.length === 1 ? "" : "s"} ready.`
        : "No supported pitch to draft.",
      quil: "The reviewed answer is ready.",
      ...view.notes,
    };
  return result;
}
export function applyRunEvent(view: MissionView, event: RunEvent): MissionView {
  if (event.runId !== view.id || event.id <= view.lastEventId) return view;
  const next = {
    ...view,
    lastEventId: event.id,
    connection: "connected" as const,
    notes: { ...view.notes },
    activity: { ...view.activity },
  };
  const agent = event.agent;
  if (event.type === "run.started") next.status = "running";
  if (event.type === "agent.started" && agent) next.activity[agent] = "working";
  if (event.type === "agent.completed" && agent) next.activity[agent] = "ready";
  if (
    event.type === "agent.update" &&
    agent &&
    typeof event.data.text === "string"
  )
    next.notes[agent] = event.data.text;
  if (event.type === "operation.failed" && agent)
    next.activity[agent] = "error";
  if (event.type === "draft.invalidated")
    next.notes.wren = "A new check changed the pitch. Revising it.";
  if (event.type === "run.paused") next.status = "paused";
  if (event.type === "run.resumed") next.status = "running";
  if (event.type === "run.cancelled") {
    next.status = "cancelled";
    next.activity = {};
  }
  if (event.type === "run.failed") {
    next.status = "failed";
    next.error =
      typeof event.data.message === "string"
        ? event.data.message
        : "The search could not finish.";
    next.activity = {};
  }
  if (event.type === "run.completed") {
    next.status = "completed";
    next.outcome = event.data.outcome as Outcome;
    next.activity = {
      quil: "ready",
      pip: "ready",
      milo: "ready",
      iris: "ready",
      wren: "ready",
    };
  }
  return next;
}
export function phaseFor(view?: MissionView): MissionPhase {
  if (!view) return "idle";
  if (view.status === "paused") return "paused";
  if (view.status === "completed") return "complete";
  if (ended(view.status)) return "idle";
  if (view.activity.wren === "working") return "writing";
  if (view.activity.milo === "working") return "investigating";
  if (view.activity.iris === "working") return "reviewing";
  if (view.activity.pip === "working") return "discovering";
  return "planning";
}
export function prospectsFor(view: MissionView): Prospect[] {
  const outcome = view.outcome;
  if (!outcome) return [];
  return outcome.candidates.map((candidate) => {
    const decision = outcome.decisions.find(
      (d) => d.candidateId === candidate.id,
    );
    const draft = outcome.drafts.find((d) => d.candidateId === candidate.id);
    const ids = new Set([
      ...candidate.sourceIds,
      ...(decision?.sourceIds ?? []),
      ...(draft?.sourceIds ?? []),
      ...outcome.findings
        .filter((f) => f.candidateId === candidate.id)
        .flatMap((f) => f.sourceIds),
    ]);
    return {
      id: `${view.mode}:${candidate.id}`,
      name: candidate.name,
      category: "Business",
      location: view.location,
      status:
        decision?.verdict === "opportunity"
          ? ("Opportunity" as const)
          : decision?.verdict === "ruled_out"
            ? ("Website found" as const)
            : ("Needs a closer look" as const),
      note: decision?.reason ?? "The evidence is not conclusive.",
      sources: outcome.sources.filter((s) => ids.has(s.id)),
      draft: draft?.text ?? "",
      fictional: view.mode === "fixture",
    };
  });
}
export function safeSourceUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return;
    return url.href;
  } catch {
    return;
  }
}
export function readSaved(): Prospect[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem("quil:saved:v2") ?? "[]",
    );
    if (!Array.isArray(value)) return [];
    return value.slice(0, 30).filter((p): p is Prospect => {
      if (
        !p ||
        typeof p !== "object" ||
        typeof p.id !== "string" ||
        typeof p.name !== "string" ||
        typeof p.location !== "string" ||
        typeof p.category !== "string" ||
        typeof p.note !== "string" ||
        typeof p.draft !== "string" ||
        typeof p.fictional !== "boolean" ||
        !["Opportunity", "Needs a closer look", "Website found"].includes(
          p.status,
        ) ||
        !Array.isArray(p.sources)
      )
        return false;
      return p.sources.every(
        (s: unknown) =>
          !!s &&
          typeof s === "object" &&
          "id" in s &&
          typeof s.id === "string" &&
          "title" in s &&
          typeof s.title === "string" &&
          "observation" in s &&
          typeof s.observation === "string" &&
          "url" in s &&
          typeof s.url === "string" &&
          "fictional" in s &&
          typeof s.fictional === "boolean" &&
          "observedAt" in s &&
          typeof s.observedAt === "string",
      );
    });
  } catch {
    return [];
  }
}
