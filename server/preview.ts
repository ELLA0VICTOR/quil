import { ActionError } from "./google.ts";
import type { Config } from "./config.ts";
import type { Store } from "./store.ts";

export class ConnectRequired extends ActionError {
  readonly code = "CONNECT_GOOGLE_REQUIRED";
  constructor() { super(403, "You've reached the preview allowance. Connect Gmail to continue—your conversation and research will stay here."); }
}
export type PreviewUsage = { chat: number; research: number };
export async function consumePreview(store: Store, config: Config, userId: string, kind: keyof PreviewUsage) {
  return store.db.transaction(async () => {
    if (await store.db.prepare("SELECT 1 FROM integrations WHERE name=?").get(`google:${userId}`)) return;
    const key = `preview-usage:${userId}`;
    const usage = await store.cached<PreviewUsage>(key) ?? { chat: 0, research: 0 };
    if (usage[kind] >= (kind === "chat" ? config.previewChatTurns : config.previewResearchRuns)) throw new ConnectRequired();
    usage[kind]++;
    await store.cache(key, usage, 86400_000);
  });
}

export async function adoptPreview(store: Store, from: string, to: string) {
  const previous = await store.cached<PreviewUsage>(`preview-usage:${from}`);
  if (previous) {
    const current = await store.cached<PreviewUsage>(`preview-usage:${to}`) ?? { chat: 0, research: 0 };
    await store.cache(`preview-usage:${to}`, { chat: current.chat + previous.chat, research: current.research + previous.research }, 86400_000);
    await store.take(`preview-usage:${from}`);
  }
}
