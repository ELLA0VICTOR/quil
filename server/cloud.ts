import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { RunEvent } from "../shared/mission.ts";

export type TraceClient = {
  enabled: boolean;
  join: (agent: { id: string; name: string; role: string }) => void;
  send: (event: {
    type: string;
    producerId?: string;
    occurredAt?: string;
    payload: Record<string, unknown>;
  }) => void;
  end: () => Promise<void>;
};
type Settings = { cloudEnabled: boolean; cloudKey: string };

// This pinned core beta does not automatically export its loops. Use the
// bundled official runtime-free SDK and forward actual recorded execution.
// Only execution metadata is selected; prompts, results, recipients and tokens
// never enter this exporter, even before the SDK's content redaction.
export class CloudTrace {
  private client?: TraceClient;
  private loops = new Map<string, string>();
  constructor(
    private runId: string,
    private settings?: Settings,
    private factory?: (options: Record<string, unknown>) => TraceClient,
  ) {}
  async start() {
    if (!this.settings?.cloudEnabled) return;
    try {
      let makeClient = this.factory;
      if (!makeClient) {
        const require = createRequire(import.meta.resolve("@mozaik-ai/core"));
        const sdk = await import(
          pathToFileURL(require.resolve("@mozaik-ai/cloud-sdk")).href
        );
        makeClient = sdk.createCloudClient;
      }
      this.client = makeClient!({
        projectKey: this.settings.cloudKey || undefined,
        envFile: false,
        sessionId: `quil_${this.runId.replaceAll("-", "")}`,
        redaction: "content",
        fetch: (url: string, init: RequestInit) =>
          fetch(url, { ...init, signal: AbortSignal.timeout(8_000) }),
        onError: () =>
          console.warn(
            "Mozaik Cloud could not accept some trace events; research continues.",
          ),
        onSessionUrl: (url: string) => console.log(`Mozaik Cloud trace: ${url}`),
      });
      if (this.client?.enabled)
        for (const id of ["quil", "pip", "milo", "iris", "wren"])
          this.client.join({
            id,
            name: id[0].toUpperCase() + id.slice(1),
            role: "agent",
          });
    } catch {
      console.warn(
        "Mozaik Cloud is unavailable; research continues with its local trace.",
      );
    }
  }
  record(event: RunEvent) {
    if (!this.client?.enabled) return;
    const data = event.data,
      key = `${event.agent}:${data.revision}`;
    if (event.type === "agent.started" && typeof data.loopId === "string")
      this.loops.set(key, data.loopId);
    const payload: Record<string, unknown> = {
      runId: this.runId,
      sourceEvent: event.type,
    };
    for (const key of ["loopId", "revision", "elapsedMs", "phase"])
      if (["string", "number"].includes(typeof data[key])) payload[key] = data[key];
    if (!payload.loopId && this.loops.has(key)) payload.loopId = this.loops.get(key);
    const type =
      event.type === "operation.started"
        ? "inference.started"
        : event.type === "operation.completed"
          ? "inference.completed"
          : event.type === "agent.completed"
            ? "model.answer"
            : event.type;
    this.client.send({
      type,
      producerId: event.agent || "quil",
      occurredAt: event.at,
      payload,
    });
    if (event.type === "agent.completed" && Array.isArray(data.transitions))
      for (const transition of data.transitions) {
        const t = transition as Record<string, unknown>;
        if (
          typeof t.from === "string" &&
          typeof t.to === "string" &&
          typeof t.at === "string"
        )
          this.client.send({
            type: "loop.transition",
            producerId: event.agent,
            occurredAt: t.at,
            payload: { loopId: payload.loopId, from: t.from, to: t.to },
          });
      }
  }
  async end() {
    try {
      await this.client?.end();
    } catch {
      console.warn("Mozaik Cloud trace could not finish uploading.");
    }
  }
}
