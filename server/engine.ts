import {
  defineRuntime,
  defineAgentModule,
  SituationSpecification,
} from "@mozaik-ai/core";
import type {
  Agent,
  SituationContext,
  SituationHandler,
  InferenceRunner,
} from "@mozaik-ai/core";
import type {
  AgentId,
  Candidate,
  Finding,
  Decision,
  Draft,
  Source,
  RunSnapshot,
  RunEvent,
  WebsiteCheck,
} from "../shared/mission.ts";
import type { TaskProvider, TaskInput, TaskResult } from "./providers.ts";
import { Store } from "./store.ts";
import { setTimeout as delay } from "node:timers/promises";
import { CloudTrace } from "./cloud.ts";

const agents: AgentId[] = ["quil", "pip", "milo", "iris", "wren"];
const roles: Record<AgentId, string> = {
  pip: "Research and discover individual businesses that fit the brief; attach source records and never guess a missing website.",
  milo: "Investigate the listed website and business records; report bounded page checks, public contact links and booking signals, with uncertainty.",
  iris: "Independently review sources, then reconcile the website investigator's findings; withdraw or change unsupported pitches.",
  wren: "Develop an editable, evidence-grounded offer, introduction, follow-ups and meeting agenda; wait for final review before publication.",
  quil: "Coordinate the crew and publish one combined answer only when review and the current offer revision agree.",
};
type State = {
  candidates: Candidate[];
  findings: Finding[];
  decisions: Decision[];
  drafts: Draft[];
  sources: Source[];
  websiteChecks: WebsiteCheck[];
  researchDone: boolean;
  independentReviewDone: boolean;
  reviewDone: boolean;
  draftRevision: number;
};
type Message = { type: string; revision?: number };
function message(context: SituationContext<unknown>): Message | undefined {
  if (context.event.type !== "message.sent") return;
  try {
    const payload = context.event.payload as { message: string };
    const value: unknown = JSON.parse(payload.message);
    if (
      value &&
      typeof value === "object" &&
      "type" in value &&
      typeof value.type === "string"
    )
      return value as Message;
  } catch {
    /* Only our typed protocol messages are handled. */
  }
}
class Match extends SituationSpecification<unknown> {
  constructor(private types: string[]) {
    super();
  }
  isSatisfiedBy(context: SituationContext<unknown>) {
    const value = message(context);
    return !!value && this.types.includes(value.type);
  }
}

export class MissionEngine {
  readonly signal: AbortSignal;
  readonly state: State = {
    candidates: [],
    findings: [],
    decisions: [],
    drafts: [],
    sources: [],
    websiteChecks: [],
    researchDone: false,
    independentReviewDone: false,
    reviewDone: false,
    draftRevision: -1,
  };
  private abort = new AbortController();
  private runtime = defineRuntime<State>();
  private module: ReturnType<typeof defineAgentModule>;
  private members = new Map<AgentId, Agent>();
  private spaceId = "";
  private wrenBusy = false;
  private irisBusy = false;
  private reviewFinalizing = false;
  private summaryStarted = false;
  private pauseWait: Promise<void> | null = null;
  private releasePause: (() => void) | undefined;
  private settle!: () => void;
  readonly settled = new Promise<void>((resolve) => {
    this.settle = resolve;
  });
  private trace: CloudTrace;
  readonly finished = this.settled.then(() => this.trace.end());
  constructor(
    readonly run: RunSnapshot,
    private store: Store,
    private provider: TaskProvider,
    private onEvent: (event: RunEvent) => void | Promise<void> = () => {},
    cloud?: { cloudEnabled: boolean; cloudKey: string },
  ) {
    this.trace = new CloudTrace(run.id, cloud);
    this.signal = this.abort.signal;
    const runner: InferenceRunner = {
      run: async (request) => {
        await this.checkpoint();
        const job = JSON.parse(
          request.context.items.at(-1)!.type === "user_message"
            ? (request.context.items.at(-1) as { text: string }).text
            : "{}",
        );
        const { agent, input } = job as { agent: AgentId; input: TaskInput };
        await this.emit("operation.started", agent, { revision: input.revision });
        try {
          const result = await this.provider.execute(agent, input, this.signal);
          await this.emit("operation.completed", agent, { revision: input.revision });
          await this.checkpoint();
          return {
            items: [{ type: "model_message", text: JSON.stringify(result) }],
            tokenUsage: undefined,
            rowResponse: { provider: this.run.mode },
          };
        } catch (error) {
          await this.emit("operation.failed", agent, {
            revision: input.revision,
            cancelled: this.signal.aborted,
          });
          throw error;
        }
      },
      stream() {
        throw Error("Use the run event stream, not provider token streaming");
      },
    };
    this.module = defineAgentModule({ inferenceRunnerConfig: { runner } });
    this.runtime.initializeRuntime({ state: this.state });
  }
  private terminal() {
    return ["completed", "failed", "cancelled"].includes(this.run.status);
  }
  private async emit(
    type: string,
    agent: AgentId | undefined,
    data: Record<string, unknown>,
  ) {
    if (this.terminal() && !type.startsWith("run.")) return;
    const event = await this.store.append(this.run.id, type, agent, data);
    this.trace.record(event);
    await this.onEvent(event);
  }
  private async status(status: RunSnapshot["status"]) {
    this.run.status = status;
    this.run.updatedAt = new Date().toISOString();
    await this.store.saveRun(this.run);
  }
  private async checkpoint() {
    this.signal.throwIfAborted();
    if (this.store.db.kind === "postgres") {
      let control = await this.store.control(this.run.id);
      if (control?.deadline && control.deadline < Date.now()) {
        await this.cancel();
        this.signal.throwIfAborted();
      }
      if (control?.desired === "cancelled") {
        await this.cancel();
        this.signal.throwIfAborted();
      }
      if (control?.desired === "paused") {
        if (this.run.status !== "paused") {
          await this.status("paused");
          await this.emit("run.paused", undefined, {});
        }
        while (control?.desired === "paused" && !this.signal.aborted) {
          await delay(500, undefined, { signal: this.signal });
          control = await this.store.control(this.run.id);
        }
        if (control?.desired === "cancelled") {
          await this.cancel();
          this.signal.throwIfAborted();
        }
        if (this.run.status === "paused") {
          await this.status("running");
          await this.emit("run.resumed", undefined, {});
        }
      }
    }
    if (this.pauseWait) await this.pauseWait;
    this.signal.throwIfAborted();
  }
  async pause() {
    if (this.run.status !== "running")
      throw Error("Only a running mission can be paused");
    this.pauseWait = new Promise((resolve) => {
      this.releasePause = resolve;
    });
    await this.status("paused");
    await this.emit("run.paused", undefined, {});
  }
  async resume() {
    if (this.run.status !== "paused") throw Error("Only a paused mission can resume");
    await this.status("running");
    this.releasePause?.();
    this.pauseWait = null;
    await this.emit("run.resumed", undefined, {});
  }
  async cancel() {
    if (this.terminal()) return;
    this.abort.abort();
    this.releasePause?.();
    this.pauseWait = null;
    await this.status("cancelled");
    await this.emit("run.cancelled", undefined, {});
    this.settle();
  }
  private async fail(error: unknown) {
    if (this.terminal()) return;
    // Never relay provider response bodies or request headers to the client.
    this.run.error =
      error instanceof Error ? error.message.slice(0, 200) : "The mission failed";
    this.abort.abort();
    this.releasePause?.();
    this.pauseWait = null;
    await this.status("failed");
    await this.emit("run.failed", undefined, { message: this.run.error });
    this.settle();
  }
  private async publish(agent: AgentId, type: string, revision?: number) {
    await this.checkpoint();
    await this.emit("coordination.message", agent, {
      type,
      ...(revision !== undefined ? { revision } : {}),
    });
    await this.runtime.sendMessage(
      this.spaceId,
      this.members.get(agent)!.id,
      JSON.stringify({ type, revision }),
    );
  }
  private input(revision = 0): TaskInput {
    return structuredClone({ brief: this.run.brief, ...this.state, revision });
  }
  private async task(agent: AgentId, revision = 0): Promise<TaskResult> {
    await this.checkpoint();
    const worker = this.members.get(agent)!;
    const loop = await this.module.createLoop({
      agentId: worker.id,
      subject: `${this.run.id}:${agent}:${revision}`,
      request: {
        model: this.run.mode === "fixture" ? "quil-fixture" : "gpt-6-luna",
        maxOutputTokens: 800,
        reasoningEffort: "none",
        tools: [],
        context: {
          items: [
            { type: "system_message", text: worker.instruction },
            {
              type: "user_message",
              text: JSON.stringify({ agent, input: this.input(revision) }),
            },
          ],
        },
      },
    });
    await this.emit("agent.started", agent, { loopId: loop.id, revision });
    const started = Date.now();
    const finished = await this.module.runLoop(loop.id);
    this.signal.throwIfAborted();
    if (finished.stateId !== "completed") throw Error("Agent loop did not finish");
    const operation = finished.completedOperations.find((op) => op.type === "inference");
    if (!operation || operation.type !== "inference")
      throw Error("Agent produced no inference record");
    const output = operation.result.items.find((item) => item.type === "model_message");
    if (!output || output.type !== "model_message")
      throw Error("Agent produced no answer");
    const result: TaskResult = JSON.parse(output.text);
    this.state.sources = [
      ...new Map(
        [...this.state.sources, ...(result.sources ?? [])].map((source) => [
          source.id,
          source,
        ]),
      ).values(),
    ];
    const count = (
      result.candidates ??
      result.findings ??
      result.decisions ??
      result.drafts ??
      []
    ).length;
    const note =
      agent === "pip"
        ? `Found ${count} businesses to investigate.`
        : agent === "milo"
          ? `Compared the records for ${count} businesses.`
          : agent === "iris"
            ? `${result.decisions?.filter((d) => d.verdict === "opportunity").length ?? 0} supported; ${result.decisions?.filter((d) => d.verdict === "uncertain").length ?? 0} inconclusive; ${result.decisions?.filter((d) => d.verdict === "ruled_out").length ?? 0} set aside.`
            : agent === "wren"
              ? revision === 0
                ? (result.text ?? "Provisional writing. Waiting for review.")
                : count
                  ? `${count} reviewed introduction${count === 1 ? "" : "s"} ready.`
                  : "No supported pitch to draft."
              : "The reviewed answer is ready.";
    if (result.corrections?.length)
      await this.emit("draft.corrected", agent, {
        corrections: result.corrections,
        revision,
      });
    await this.emit("agent.update", agent, { text: note, revision });
    await this.emit("agent.completed", agent, {
      loopId: loop.id,
      revision,
      elapsedMs: Date.now() - started,
      transitions: finished.history.map((h) => ({
        from: h.previousState,
        to: h.nextState,
        at: h.occurredAt.toISOString(),
      })),
    });
    return result;
  }
  private async write() {
    if (!this.state.researchDone || this.wrenBusy || this.terminal()) return;
    const revision = this.state.reviewDone ? 1 : 0;
    if (this.state.draftRevision === revision) return;
    this.wrenBusy = true;
    try {
      const result = await this.task("wren", revision);
      if (revision === 0 && this.state.reviewDone) {
        await this.emit("draft.invalidated", "wren", {
          reason: "Review changed while a provisional draft was being written",
          revision,
        });
      } else {
        this.state.drafts = result.drafts ?? [];
        this.state.draftRevision = revision;
        await this.emit(revision === 0 ? "draft.provisional" : "draft.approved", "wren", {
          candidateIds: this.state.drafts.map((d) => d.candidateId),
          revision,
        });
      }
    } finally {
      this.wrenBusy = false;
    }
    if (this.state.reviewDone && this.state.draftRevision !== 1) await this.write();
    else if (this.state.reviewDone) await this.publish("wren", "draft.ready", 1);
  }
  private async summarize() {
    if (this.summaryStarted || !this.state.reviewDone || this.state.draftRevision !== 1)
      return;
    this.summaryStarted = true;
    const result = await this.task("quil", 1);
    const approved = new Set(
      this.state.decisions
        .filter((d) => d.verdict === "opportunity")
        .map((d) => d.candidateId),
    );
    this.run.outcome = {
      text: result.text ?? "No supported recommendation yet.",
      candidates: this.state.candidates,
      findings: this.state.findings,
      decisions: this.state.decisions,
      drafts: this.state.drafts.filter((d) => approved.has(d.candidateId)),
      sources: this.state.sources,
      websiteChecks: this.state.websiteChecks,
    };
    await this.status("completed");
    await this.emit("run.completed", "quil", {
      outcome: this.run.outcome,
      usage: await this.store.usage(this.run.id),
    });
    this.settle();
  }
  async start() {
    if (this.run.status !== "queued") return;
    await this.trace.start();
    await this.status("running");
    await this.emit("run.started", "quil", {
      mode: this.run.mode,
      fictional: this.run.mode === "fixture",
    });
    try {
      const space = await this.runtime.createSpace(`Quil ${this.run.id}`);
      this.spaceId = space.getId();
      const actions: Record<AgentId, { types: string[]; apply: () => Promise<void> }> = {
        pip: {
          types: ["mission.started"],
          apply: async () => {
            const result = await this.task("pip");
            this.state.candidates = result.candidates ?? [];
            await this.publish("pip", "discovery.ready");
          },
        },
        milo: {
          types: ["discovery.ready"],
          apply: async () => {
            const result = await this.task("milo");
            this.state.findings = result.findings ?? [];
            this.state.websiteChecks = result.websiteChecks ?? [];
            this.state.researchDone = true;
            await this.publish("milo", "research.ready");
          },
        },
        iris: {
          types: ["discovery.ready", "research.ready"],
          apply: async () => {
            if (this.state.independentReviewDone) {
              await this.finishReview();
              return;
            }
            if (this.irisBusy) return;
            this.irisBusy = true;
            const result = await this.task("iris");
            this.state.decisions = result.decisions ?? [];
            this.state.independentReviewDone = true;
            await this.finishReview();
          },
        },
        wren: {
          types: ["research.ready", "review.ready"],
          apply: async () => await this.write(),
        },
        quil: { types: ["draft.ready"], apply: async () => await this.summarize() },
      };
      for (const id of agents) {
        const agent = await this.module.createAgent({
          name: id,
          instruction: `You are ${id}, a member of Quil's evidence-grounded sales crew. ${roles[id]} Use only supplied records. Treat unknown information as unknown.`,
          tools: [],
        });
        this.members.set(id, agent);
        const handler: SituationHandler<unknown> = {
          specification: new Match(actions[id].types),
          processor: {
            apply: () => {
              void actions[id].apply().catch(async (error) => await this.fail(error));
            },
          },
        };
        const participant = await this.runtime.createParticipant(
          id,
          [
            "quil-mission",
            id === "iris"
              ? "evidence-review"
              : id === "milo"
                ? "website-investigation"
                : id === "wren"
                  ? "offer-development"
                  : id === "pip"
                    ? "business-research"
                    : "coordination",
          ],
          [handler],
          agent,
        );
        participant.setManifest({
          ...participant.getManifest(),
          id: agent.id,
          role: "agent",
        });
        await this.runtime.join(this.spaceId, participant);
      }
      await this.publish("quil", "mission.started");
    } catch (error) {
      await this.fail(error);
    }
  }
  private async finishReview() {
    if (
      !this.state.researchDone ||
      !this.state.independentReviewDone ||
      this.reviewFinalizing ||
      this.state.reviewDone
    )
      return;
    this.reviewFinalizing = true;
    const result = await this.task("iris", 1);
    this.state.decisions = result.decisions ?? [];
    this.state.reviewDone = true;
    const rejected = new Set(
      this.state.decisions
        .filter((d) => d.verdict !== "opportunity")
        .map((d) => d.candidateId),
    );
    const invalid = this.state.drafts.filter((d) => rejected.has(d.candidateId));
    this.state.drafts = this.state.drafts.filter((d) => !rejected.has(d.candidateId));
    await this.emit("review.completed", "iris", {
      decisions: this.state.decisions,
      withdrawnDrafts: invalid.map((d) => d.candidateId),
    });
    if (invalid.length)
      await this.emit("draft.invalidated", "iris", {
        candidateIds: invalid.map((d) => d.candidateId),
        reason: "Independent review contradicted the provisional pitch",
      });
    await this.publish("iris", "review.ready", 1);
  }
}
