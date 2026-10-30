import type {
  Brief,
  CreatedRun,
  RunEvent,
  RunSnapshot,
  PreparedBrief,
} from "../../shared/mission";
import { workspaceHeaders } from "./session-api";
import type { ChatRequest, ChatResponse } from "../../shared/conversation";

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...options, credentials: "same-origin", headers: { ...workspaceHeaders(), ...options.headers } });
  } catch {
    throw Error(
      "Quil couldn’t connect to the server. Please try again when the connection is back.",
    );
  }
  let value;
  try {
    value = await response.json();
  } catch {
    throw Error(
      "Quil couldn’t reach its server. Please try again when the connection is back.",
    );
  }
  if (!response.ok)
    throw Object.assign(Error(
      typeof value.error === "string"
        ? value.error
        : "Quil could not complete the request",
    ), { code: typeof value.code === "string" ? value.code : undefined });
  return value as T;
}
export const createRun = (
  brief: Pick<Brief, "request"> & Partial<Brief> & { mode?: "fixture" },
) =>
  request<CreatedRun>("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(brief),
  });
export const prepareRun = (input: {
  request: string;
  context?: Partial<Brief>;
  answering?: string[];
}) =>
  request<PreparedBrief>("/api/brief", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
export const converse = (input: ChatRequest) =>
  request<ChatResponse>("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Quil-Action": "review" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(32_000),
  });
export const getRun = (id: string, token: string) =>
  request<{ run: RunSnapshot }>(`/api/runs/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
export const controlRun = (
  id: string,
  token: string,
  action: "pause" | "resume" | "cancel",
) =>
  request<{ run: RunSnapshot }>(
    `/api/runs/${encodeURIComponent(id)}/${action}`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } },
  );
export function watchRun(
  created: CreatedRun,
  onEvent: (event: RunEvent) => void,
  onError?: (error: Event) => void,
  onOpen?: () => void,
) {
  const stream = new EventSource(created.eventsUrl);
  stream.addEventListener("mission", (message) => {
    const event = JSON.parse(
      (message as MessageEvent<string>).data,
    ) as RunEvent;
    if (["run.completed", "run.failed", "run.cancelled"].includes(event.type))
      stream.close();
    onEvent(event);
  });
  if (onError) stream.addEventListener("error", onError);
  if (onOpen) stream.addEventListener("open", onOpen);
  return () => stream.close();
}
