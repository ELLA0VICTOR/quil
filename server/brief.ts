import type {
  Brief,
  BriefField,
  PreparedBrief,
  RunMode,
} from "../shared/mission.ts";

const clean = (value: string) => value.trim().replace(/\s+/g, " ");
export function prepareBrief(
  value: Record<string, unknown>,
  mode: RunMode,
): PreparedBrief {
  if (
    typeof value.request !== "string" ||
    !value.request.trim() ||
    value.request.length > 2000
  )
    throw Error("Describe the search in at most 2,000 characters.");
  const current = clean(value.request);
  const previous =
    value.context &&
    typeof value.context === "object" &&
    !Array.isArray(value.context)
      ? (value.context as Record<string, unknown>)
      : {};
  const context: Partial<Brief> = {
    request:
      typeof previous.request === "string" && previous.request.length <= 2000
        ? previous.request
        : current,
    limit: 3,
  };
  for (const key of ["category", "location", "service"] as const)
    if (
      typeof previous[key] === "string" &&
      (previous[key] as string).length <= (key === "service" ? 150 : 100)
    )
      context[key] = clean(previous[key] as string);
  if (mode === "fixture")
    return {
      context,
      missing: [],
      brief: {
        request: context.request!,
        category: "cleaning services",
        location: "Manchester, UK",
        service: "website design",
        limit: 3,
      },
    };
  if (
    /\b(websites?|web\s?(design|development|developer)|booking|appointments?)\b/i.test(
      current,
    )
  )
    context.service = "website design and booking flows";
  const match =
    current.match(
      /\b(?:find|look for|search for|target|want|work with|reach)\s+(?:(?:me|some|local|a few)\s+)*(.{2,100}?)\s+(?:in|around|near)\s+(.+)/i,
    ) ?? current.match(/^(.{2,100}?)\s+(?:in|around|near)\s+(.+)$/i);
  if (match) {
    const category = clean(match[1])
      .replace(/^\d+\s+/, "")
      .replace(/\s+(businesses|companies|providers)$/i, "");
    if (category && !/^(i|we|my|our)\b/i.test(category))
      context.category = category;
    const location = clean(
      match[2].split(/\s+(?:that|who|which|with|needing|to|for)\s+|[.!?;]/i)[0],
    );
    if (location && location.length <= 100) context.location = location;
  }
  const answering = Array.isArray(value.answering)
    ? value.answering.filter((key) =>
        ["category", "location", "service"].includes(key),
      )
    : [];
  if (answering.length === 1) {
    const key = answering[0] as BriefField;
    if (current.length <= (key === "service" ? 150 : 100) && !match)
      context[key] = current.replace(/^(?:in|around|near)\s+/i, "");
  }
  const missing = (["category", "location", "service"] as const).filter(
    (key) => !context[key],
  );
  if (missing.length) {
    const questionField = missing[0];
    const question = {
      category: "Which kind of business should we look for?",
      location: "Which city or area should we search?",
      service:
        "What service do you offer? Quil currently focuses on websites and booking flows.",
    }[questionField];
    return { context, missing, question, questionField };
  }
  if (!/\b(websites?|web|booking|appointments?)\b/i.test(context.service!))
    return {
      context: { ...context, service: undefined },
      missing: ["service"],
      questionField: "service",
      question:
        "Quil currently looks for website and booking-flow opportunities. Which of those services do you offer?",
    };
  return { context, missing: [], brief: context as Brief };
}
