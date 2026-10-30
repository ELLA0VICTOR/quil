import type { ChatItem, MissionView } from "./run-view";
import { prospectsFor } from "./run-view";

export const conversationKey = (runKey: string) => runKey.replace(/active-run$/, "conversation:v1");
const speakers = new Set(["you", "quil", "pip", "milo", "iris", "wren"]);
export function readConversationCache(runKey: string): ChatItem[] {
  try {
    const raw = sessionStorage.getItem(conversationKey(runKey));
    if (!raw || raw.length > 1_000_000) return [];
    const items: unknown = JSON.parse(raw);
    if (!Array.isArray(items)) return [];
    return items.slice(-60).filter((item): item is ChatItem => {
      if (!item || typeof item.id !== "string") return false;
      if (item.kind === "message") return speakers.has(item.speaker) && typeof item.text === "string" && item.text.length <= 6000;
      if (item.kind !== "mission" || !/^[a-f0-9-]{36}$/.test(item.id) || typeof item.request !== "string" || typeof item.location !== "string" ||
        (!["fixture", "live"].includes(item.mode) && !(item.mode === undefined && item.status === "failed")) || !["connecting", "queued", "running", "paused", "completed", "failed", "cancelled"].includes(item.status) ||
        !item.activity || !item.notes) return false;
      if (item.outcome) {
        if (typeof item.outcome.text !== "string" || !["candidates", "decisions", "drafts", "sources", "findings"].every(key => Array.isArray(item.outcome[key]))) return false;
        try {
          const prospects = prospectsFor(item as MissionView);
          if (!prospects.every(p => typeof p.name === "string" && typeof p.draft === "string" &&
            p.sources.every(s => typeof s.id === "string" && typeof s.title === "string" && typeof s.observation === "string" && typeof s.url === "string"))) return false;
        } catch { return false; }
      }
      return true;
    });
  } catch { return []; }
}
export function saveConversationCache(runKey: string, items: ChatItem[]) {
  try {
    let recent = items.slice(-60);
    let value = JSON.stringify(recent);
    while (value.length > 900_000 && recent.length > 1) { recent = recent.slice(1); value = JSON.stringify(recent); }
    sessionStorage.setItem(conversationKey(runKey), value);
  } catch { /* A blocked/full browser store does not interrupt the conversation. */ }
}
