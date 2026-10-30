import type { Conversation, OfferTerms, ReplyPlan } from "../shared/outreach.ts";
import { ActionError } from "./google.ts";

type Part = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number };
  parts?: Part[];
};
export function messageText(part: Part): { text: string; truncated: boolean } {
  const plain: string[] = [],
    html: string[] = [];
  let count = 0,
    truncated = false;
  const walk = (p: Part, depth: number) => {
    if (depth > 6 || ++count > 50 || p.filename) return;
    if (p.body?.data && ["text/plain", "text/html"].includes(p.mimeType ?? "")) {
      const encoded = p.body.data;
      if (!/^[A-Za-z0-9_\-=]*$/.test(encoded)) return;
      if (encoded.length > 24_000) truncated = true;
      const decoded = Buffer.from(encoded.slice(0, 24_000), "base64url").toString("utf8");
      (p.mimeType === "text/plain" ? plain : html).push(decoded);
    }
    for (const child of p.parts ?? []) walk(child, depth + 1);
  };
  walk(part, 0);
  let text = plain.length
    ? plain.join("\n")
    : html
        .join("\n")
        .replace(/<(script|style|blockquote)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
        .replace(/<(?:br|\/p|\/div|\/li)\b[^>]*>/gi, "\n")
        .replace(/<[^>]*>/g, " ")
        .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, raw: string) => {
          const n =
            raw[0].toLowerCase() === "x" ? parseInt(raw.slice(1), 16) : Number(raw);
          return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
        })
        .replace(
          /&(amp|lt|gt|quot|apos|nbsp);/g,
          (_, name: string) =>
            ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[name]!,
        );
  text = text
    .replace(/\r/g, "")
    .split(
      /\n(?:On [^\n]{1,200}wrote:|[- ]*Original Message[- ]*|[- ]*Forwarded message[- ]*)/i,
    )[0]
    .split("\n")
    .filter((line) => !/^\s*>/.test(line))
    .join("\n")
    // Control characters are intentionally stripped from untrusted email text.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
  if (text.length > 8000) truncated = true;
  return { text: text.slice(0, 8000), truncated };
}

export const declined = (text: string) =>
  /\b(?:unsubscribe|not interested|do not (?:email|contact|call)|don't (?:email|contact|call)|stop (?:emailing|contacting|calling)|remove me|no thanks|no thank you)\b/i.test(
    text,
  );

const minor = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{1,7}(?:\.\d{1,2})?$/.test(value.trim()))
    throw new ActionError(400, "Enter a price with up to two decimal places.");
  const [whole, fraction = ""] = value.trim().split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
};
export function offerTerms(value: unknown): OfferTerms | undefined {
  if (value === undefined || value === null) return;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ActionError(400, "Check the offer terms.");
  const v = value as Record<string, unknown>;
  if (
    !["USD", "GBP", "EUR", "NGN"].includes(String(v.currency)) ||
    typeof v.scope !== "string" ||
    !v.scope.trim() ||
    v.scope.length > 1000 ||
    !Number.isInteger(v.deliveryDays) ||
    Number(v.deliveryDays) < 1 ||
    Number(v.deliveryDays) > 365
  )
    throw new ActionError(
      400,
      "Enter the scope, currency and delivery time (1–365 working days).",
    );
  const priceMinor = minor(v.price),
    minimumMinor = minor(v.minimum || v.price);
  if (!priceMinor || !minimumMinor || minimumMinor > priceMinor)
    throw new ActionError(
      400,
      "Your minimum price must be positive and no higher than your quote.",
    );
  return {
    currency: v.currency as OfferTerms["currency"],
    priceMinor,
    minimumMinor,
    scope: v.scope.trim(),
    deliveryDays: Number(v.deliveryDays),
  };
}
export const publicTerms = (terms: OfferTerms) => ({
  currency: terms.currency,
  scope: terms.scope,
  deliveryDays: terms.deliveryDays,
  price: (terms.priceMinor / 100).toFixed(2),
  minimum: (terms.minimumMinor / 100).toFixed(2),
});
const amounts = (text: string, currency?: OfferTerms["currency"]) => {
  const symbols: Record<string, string> = {
    $: "USD",
    "£": "GBP",
    "€": "EUR",
    "₦": "NGN",
  };
  const found = [
    ...text.matchAll(
      /(?:\b(USD|GBP|EUR|NGN)\s*|([$£€₦])\s*)(\d{1,7}(?:,\d{3})*(?:\.\d{1,2})?)(?![\d,]|\.\d)/gi,
    ),
  ];
  const trailing = [
    ...text.matchAll(
      /\b(\d{1,7}(?:,\d{3})*(?:\.\d{1,2})?)\s+(USD|GBP|EUR|NGN|dollars?|pounds?|euros?|naira)\b/gi,
    ),
  ].map((m) => ({
    currency:
      (
        {
          dollar: "USD",
          dollars: "USD",
          pound: "GBP",
          pounds: "GBP",
          euro: "EUR",
          euros: "EUR",
          naira: "NGN",
        } as Record<string, string>
      )[m[2].toLowerCase()] || m[2].toUpperCase(),
    value: minor(m[1].replaceAll(",", "")),
  }));
  return [
    ...found.map((m) => ({
      currency: m[1]?.toUpperCase() || symbols[m[2]],
      value: minor(m[3].replaceAll(",", "")),
    })),
    ...trailing,
  ].filter((m) => !currency || m.currency === currency);
};
export function checkReplyPrice(text: string, terms?: OfferTerms) {
  if (
    terms &&
    amounts(text).some(
      (amount) =>
        amount.currency !== terms.currency ||
        amount.value < terms.minimumMinor ||
        amount.value > terms.priceMinor,
    )
  )
    throw new ActionError(
      409,
      "That price is outside your offer limits. Edit the message or update your terms.",
    );
}

export type AnalyzeReply = (input: { text: string }) => Promise<Record<string, unknown>>;
export async function planReply(
  conversation: Conversation,
  terms?: OfferTerms,
  analyze?: AnalyzeReply,
  now = Date.now(),
): Promise<ReplyPlan> {
  const incoming = conversation.latestIncoming;
  if (!incoming?.text || incoming.truncated)
    throw new ActionError(
      409,
      "Read the complete reply in Gmail before preparing a response.",
    );
  if (!conversation.canReply && !conversation.stopped)
    throw new ActionError(
      409,
      "Your latest message is awaiting a reply. Refresh the conversation first.",
    );
  const text = incoming.text;
  let intent: ReplyPlan["intent"] = declined(text)
    ? "declined"
    : /\b(?:meet|meeting|call|available|availability|schedule)\b/i.test(text)
      ? "meeting"
      : /[$£€₦]|\b(?:price|cost|budget|discount|dollars?|pounds?|euros?|naira|USD|GBP|EUR|NGN)\b/i.test(
            text,
          )
        ? "pricing"
        : /\?|\b(?:how|what|which|could you)\b/i.test(text)
          ? "question"
          : /\b(?:interested|sounds good|yes|let's|lets)\b/i.test(text)
            ? "interested"
            : "other";
  let evidence = text.slice(0, 240),
    analysis: ReplyPlan["analysis"] = "local";
  if (analyze && intent !== "declined") {
    try {
      const result = await analyze({ text: text.slice(0, 5000) });
      const quote = typeof result.evidence === "string" ? result.evidence.trim() : "";
      if (
        ["interested", "pricing", "question", "meeting", "other"].includes(
          String(result.intent),
        ) &&
        quote.length >= 3 &&
        quote.length <= 240 &&
        text.includes(quote)
      ) {
        // Explicit amounts and meeting language retain their deterministic handling.
        if (!["pricing", "meeting"].includes(intent))
          intent = result.intent as ReplyPlan["intent"];
        evidence = quote;
        analysis = "model";
      }
    } catch {
      /* The prepared local reply remains available within the same terms. */
    }
  }
  let response = "",
    note = "Review the reply and finish the message in your own words.";
  if (intent === "declined" || conversation.stopped) {
    intent = "declined";
    note = "They have declined further contact. Follow-ups and new outreach are stopped.";
  } else if (intent === "meeting") {
    response =
      "Thanks for getting back to me. I'd be happy to discuss the project. Could you confirm the date, time and timezone that work for you? I'll check my calendar before sending an invitation.";
    note = "Confirm the meeting details, then review an invitation using your calendar.";
  } else if (terms) {
    const proposed = [...new Set(amounts(text, terms.currency).map((a) => a.value))];
    const counter =
      intent === "pricing" && proposed.length === 1 ? proposed[0] : undefined;
    const quote =
      counter === undefined
        ? terms.priceMinor
        : Math.max(terms.minimumMinor, Math.min(terms.priceMinor, counter));
    const price = new Intl.NumberFormat("en", {
      style: "currency",
      currency: terms.currency,
    }).format(quote / 100);
    response = `Thanks for getting back to me.\n\nFor the following scope:\n${terms.scope}\n\nMy proposed fee is ${price}. Delivery would be ${terms.deliveryDays} working days after we confirm the requirements and receive the access and materials needed.\n\nWould that scope and budget work for you? We can confirm the details before starting.`;
    note =
      counter !== undefined && counter < terms.minimumMinor
        ? "Their counteroffer is below your minimum. The draft stays at your minimum for the agreed scope."
        : intent === "question"
          ? "The draft uses your terms. Add an answer to their specific question before sending."
          : "The proposed fee and delivery stay within the terms you supplied.";
  } else {
    response =
      "Thanks for getting back to me. I'd be happy to explore this with you. Could you share the scope you have in mind, your budget and your preferred timing? I can then prepare a specific proposal.";
    note = "Add your scope, quote and delivery terms for a specific commercial response.";
  }
  checkReplyPrice(response, terms);
  const date = text.match(
    /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})\b/,
  )?.[0];
  const calendarDate = date?.slice(0, 10);
  const day = calendarDate ? new Date(`${calendarDate}T00:00:00Z`) : undefined;
  const validDay =
    day &&
    Number.isFinite(day.getTime()) &&
    day.toISOString().slice(0, 10) === calendarDate;
  const time = date && validDay ? Date.parse(date) : NaN;
  const meetingStart =
    intent === "meeting" &&
    Number.isFinite(time) &&
    time > now &&
    time < now + 90 * 86400_000
      ? new Date(time).toISOString()
      : undefined;
  if (meetingStart && response)
    response = `Thanks for suggesting ${date}. I'll check my calendar before confirming the time and sending an invitation.`;
  return {
    rootId: conversation.rootId,
    replyToMessageId: incoming.id,
    recipient: conversation.recipient,
    subject: conversation.subject,
    intent,
    evidence,
    text: response,
    note,
    terms,
    meetingStart,
    analysis,
  };
}
