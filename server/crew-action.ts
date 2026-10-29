import { defineAgentModule } from "@mozaik-ai/core";
import type { InferenceRunner } from "@mozaik-ai/core";
import type { Store } from "./store.ts";

// Downstream work uses a real agent loop, bounded by the reviewed operation.
// These integration operations do not consume model inference credits.
export async function crewAction<T>(
  store: Store,
  runId: string,
  role: "wren" | "quil",
  task: string,
  work: () => Promise<T>,
): Promise<T> {
  let result: T | undefined,
    performed = false,
    failure: unknown;
  const runner: InferenceRunner = {
    run: async () => {
      if (performed)
        throw Error("The approved crew operation may only run once.");
      performed = true;
      try {
        result = await work();
      } catch (error) {
        failure = error;
        throw error;
      }
      return {
        items: [
          {
            type: "model_message",
            text: JSON.stringify({ task, completed: true }),
          },
        ],
        tokenUsage: undefined,
        rowResponse: { provider: "approved-google-action" },
      };
    },
    stream() {
      throw Error("Use the recorded crew action status.");
    },
  };
  const module = defineAgentModule({ inferenceRunnerConfig: { runner } });
  const agent = await module.createAgent({
    name: role,
    instruction:
      role === "wren"
        ? "Prepare the requested outreach preview from approved research. Do not send it."
        : "Carry out only the exact user-approved action. Do not retry an uncertain send.",
    tools: [],
  });
  const loop = await module.createLoop({
    agentId: agent.id,
    subject: `${runId}:${task}`,
    request: {
      model: "quil-approved-action",
      maxOutputTokens: 100,
      tools: [],
      context: { items: [{ type: "user_message", text: task }] },
    },
  });
  const started = Date.now();
  store.append(runId, "outreach.agent.started", role, {
    task,
    loopId: loop.id,
  });
  try {
    const finished = await module.runLoop(loop.id);
    if (finished.stateId !== "completed" || !performed)
      throw Error("The crew operation did not complete.");
    store.append(runId, "outreach.agent.completed", role, {
      task,
      loopId: loop.id,
      elapsedMs: Date.now() - started,
      transitions: finished.history.map((entry) => ({
        from: entry.previousState,
        to: entry.nextState,
        at: entry.occurredAt.toISOString(),
      })),
    });
    return result as T;
  } catch (error) {
    store.append(runId, "outreach.agent.failed", role, {
      task,
      loopId: loop.id,
    });
    throw failure ?? error;
  }
}
