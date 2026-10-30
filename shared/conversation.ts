import type { Brief, PreparedBrief } from "./mission.ts";

export type ConversationMessage = { role: "user" | "assistant"; text: string };
export type ChatRequest = {
  id: string;
  request: string;
  history: ConversationMessage[];
  context?: Partial<Brief>;
  runId?: string;
  memory?: string;
};
export type ChatResponse = PreparedBrief & { message: string; memory?: string };
