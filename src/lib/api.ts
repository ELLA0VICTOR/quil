import type {
  Brief,
  CreatedRun,
  RunEvent,
  RunSnapshot,
} from "../../shared/mission";

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, options);
  const value = await response.json();
  if (!response.ok)
    throw Error(
      typeof value.error === "string"
        ? value.error
        : "Quil could not complete the request",
    );
  return value as T;
}
export const createRun = (brief: Pick<Brief, "request"> & Partial<Brief>) =>
  request<CreatedRun>("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(brief),
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
  return () => stream.close();
}
