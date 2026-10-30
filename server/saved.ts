import { ActionError } from "./google.ts";
import type { Store } from "./store.ts";
import type { Prospect } from "../src/lib/run-view.ts";

export async function savedRecords(
  input: unknown,
  store: Store,
  userId: string,
): Promise<Prospect[]> {
  if (!Array.isArray(input) || input.length > 30)
    throw new ActionError(400, "Save at most 30 businesses per account.");
  const string = (value: unknown, max: number) =>
    typeof value === "string" && value.length <= max;
  return Promise.all(
    input.map(async (raw: unknown) => {
      if (!raw || typeof raw !== "object")
        throw new ActionError(400, "Invalid saved business.");
      const row = raw as Record<string, unknown>;
      if (
        !string(row.id, 150) ||
        !string(row.name, 150) ||
        !string(row.category, 150) ||
        !string(row.location, 150) ||
        !string(row.note, 2000) ||
        !string(row.draft, 10000) ||
        typeof row.fictional !== "boolean" ||
        !["Opportunity", "Needs a closer look", "Website found"].includes(
          row.status as string,
        ) ||
        !Array.isArray(row.sources) ||
        row.sources.length > 30
      )
        throw new ActionError(400, "Invalid saved business fields.");
      if (typeof row.runId === "string" && !(await store.ownsRun(row.runId, userId)))
        throw new ActionError(
          404,
          "This result does not belong to the current workspace.",
        );
      const sources = row.sources.map((value: unknown) => {
        if (!value || typeof value !== "object")
          throw new ActionError(400, "Invalid saved source.");
        const source = value as Record<string, unknown>;
        if (
          !string(source.id, 100) ||
          !string(source.url, 2000) ||
          !string(source.title, 300) ||
          !string(source.observation, 1200) ||
          !string(source.observedAt, 60) ||
          typeof source.fictional !== "boolean"
        )
          throw new ActionError(400, "Invalid saved source fields.");
        try {
          const url = new URL(source.url as string);
          if (!/^https?:$/.test(url.protocol) || url.username || url.password)
            throw Error();
        } catch {
          throw new ActionError(400, "Invalid saved source URL.");
        }
        return {
          id: source.id,
          url: source.url,
          title: source.title,
          observation: source.observation,
          observedAt: source.observedAt,
          fictional: source.fictional,
          ...(typeof source.kind === "string" &&
          ["search_snippet", "website_reference", "website_page", "fixture"].includes(
            source.kind,
          )
            ? { kind: source.kind }
            : {}),
        };
      });
      const result: Record<string, unknown> = {
        id: row.id,
        name: row.name,
        category: row.category,
        location: row.location,
        status: row.status,
        note: row.note,
        draft: row.draft,
        fictional: row.fictional,
        sources,
      };
      for (const [key, max] of [
        ["runId", 80],
        ["candidateId", 100],
        ["offer", 12000],
      ] as const)
        if (string(row[key], max)) result[key] = row[key];
      if (
        Array.isArray(row.meetingAgenda) &&
        row.meetingAgenda.length <= 10 &&
        row.meetingAgenda.every((value) => string(value, 500))
      )
        result.meetingAgenda = row.meetingAgenda;
      if (
        Array.isArray(row.contactEmails) &&
        row.contactEmails.length <= 5 &&
        row.contactEmails.every((value) => string(value, 254))
      )
        result.contactEmails = row.contactEmails;
      if (
        Array.isArray(row.followUps) &&
        row.followUps.length <= 2 &&
        row.followUps.every(
          (value) =>
            value &&
            typeof value === "object" &&
            [3, 7].includes(value.afterDays) &&
            string(value.text, 2000),
        )
      )
        result.followUps = row.followUps.map((value) => ({
          afterDays: value.afterDays,
          text: value.text,
        }));
      return result as Prospect;
    }),
  );
}
