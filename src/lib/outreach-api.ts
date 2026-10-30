import type { GoogleStatus, OutreachAction } from "../../shared/outreach.ts";
import { workspaceHeaders } from "./session-api";

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: workspaceHeaders(),
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Quil-Action": "review",
              ...workspaceHeaders(),
          },
          body: JSON.stringify(body),
        }),
    signal: AbortSignal.timeout(30_000),
  });
  const value = await response.json();
  if (!response.ok)
    throw Error(
      value.error ||
        "The action could not be confirmed. Check its status before trying anything else.",
    );
  return value;
}
export const googleStatus = () => request<GoogleStatus>("/api/google/status");
export const connectGoogle = () =>
  request<{ url: string }>("/api/google/connect", {});
export const disconnectGoogle = () =>
  request<GoogleStatus>("/api/google/disconnect", {});
export const listOutreach = (runId: string, candidateId: string) =>
  request<{ actions: OutreachAction[] }>(
    `/api/outreach?${new URLSearchParams({ runId, candidateId })}`,
  );
export const prepareOutreach = (value: unknown) =>
  request<{ action: OutreachAction }>("/api/outreach/prepare", value);
export const meetingSlots = (value: unknown) =>
  request<{ slots: { start: string; end: string; timeZone: string }[] }>(
    "/api/outreach/slots",
    value,
  );
export const outreachAction = (
  id: string,
  operation: "approve" | "sync" | "cancel",
) =>
  request<{ action: OutreachAction }>(
    `/api/outreach/${id}/${operation}`,
    operation === "approve" ? { approved: true } : {},
  );
