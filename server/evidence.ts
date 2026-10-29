import type { Brief, Candidate, Decision, Source } from "../shared/mission.ts";

export const normalized = (value: string) =>
  value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

// These are profiles, directories or booking platforms, not proof that the
// business has its own website. Their records can still provide useful evidence.
export function standaloneWebsite(value: string): boolean {
  const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  return ![
    "facebook.com",
    "fb.com",
    "instagram.com",
    "tiktok.com",
    "linkedin.com",
    "yell.com",
    "yelp.com",
    "yelp.co.uk",
    "tripadvisor.com",
    "google.com",
    "maps.google.com",
    "booksy.com",
    "fresha.com",
    "treatwell.co.uk",
    "linktr.ee",
    "wa.me",
    "whatsapp.com",
    "nextdoor.co.uk",
    "loviebooking.co.uk",
    "setmore.com",
    "simplybook.me",
    "acuityscheduling.com",
    "vagaro.com",
  ].some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function namesBusiness(source: Source, candidate: Candidate): boolean {
  // A social post may mention another business in comments or related results.
  // Its snippet alone must not establish that the post belongs to our candidate.
  return (
    normalized(source.title).includes(normalized(candidate.name)) ||
    (!!candidate.website &&
      new URL(source.url).hostname === new URL(candidate.website).hostname)
  );
}

export function mentionsArea(source: Source, location: string): boolean {
  const area = location.split(",")[0].trim();
  const words = (value: string) =>
    ` ${value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()} `;
  return (
    area.length >= 2 &&
    words(`${source.title} ${source.observation} ${source.url}`).includes(
      words(area),
    )
  );
}

// Preserve a short, literal quote, rather than turning a model's paraphrase into
// evidence. Match an explicit action, not a mere mention of Facebook or booking.
export function manualBookingQuote(source: Source): string | undefined {
  const observation = source.observation;
  if (
    /\b(?:do not|don't|no longer|never|not accepting)\b.{0,45}\b(?:dm|message|whatsapp|call|book)/i.test(
      observation,
    )
  )
    return;
  const match = observation.match(
    /\b(?:(?:dm|message|whatsapp|call|text|contact)\s+(?:(?:us|me|our team)\s+)?(?:directly\s+)?(?:to\s+(?:book|reserve|schedule)|for\s+(?:bookings?|appointments?|availability|a quote))|(?:book(?:ings?)?|appointments?|schedule|reserve)\s+(?:your\s+)?(?:appointments?\s+)?(?:via|by|on|through)\s+(?:whatsapp|dm|messages?|phone|calling))\b(?:\s+(?:(?:your|a|an|the)\s+)?(?:(?:nail|hair)\s+)?(?:appointments?|clean|session|treatment|visit|slot|availability)\b)?/i,
  );
  return match?.[0].trim();
}

export function reviewCandidate(
  candidate: Candidate,
  brief: Brief,
  records: Source[],
): Decision {
  const related = records.filter((source) => namesBusiness(source, candidate));
  const base = { candidateId: candidate.id };
  const manual = related.find(
    (source) =>
      mentionsArea(source, brief.location) && manualBookingQuote(source),
  );
  const automated = related.find((source) =>
    /\b(?:book online|online booking|instant booking|booksy|fresha|treatwell|loviebooking|square\.site|setmore|acuityscheduling|simplybook|gettimely|timely\.com|vagaro|reservio)\b/i.test(
      `${source.title} ${source.observation} ${source.url}`,
    ),
  );
  const website = related.find(
    (source) =>
      source.kind === "website_reference" && standaloneWebsite(source.url),
  );
  if (manual && !automated)
    return {
      ...base,
      verdict: "opportunity",
      sourceIds: [manual.id],
      evidenceQuote: manualBookingQuote(manual),
      reason:
        "A location-matched search record explicitly invites manual bookings. Ask whether a booking page would help; it does not prove that bookings are a problem or that a website is missing.",
    };
  if (manual && automated)
    return {
      ...base,
      verdict: "uncertain",
      sourceIds: [manual.id, automated.id],
      reason:
        "Records describe both manual and online bookings. Check which flow is current before suggesting an improvement.",
    };
  if (candidate.website || website)
    return {
      ...base,
      verdict: "ruled_out",
      sourceIds: website ? [website.id] : candidate.sourceIds,
      reason:
        "Search records list an existing website, with no supported manual-booking opportunity. This rules out the missing-website pitch, not every possible service.",
    };
  return {
    ...base,
    verdict: "uncertain",
    sourceIds: related.map((source) => source.id),
    reason:
      "No explicit, location-matched booking need was established. A social profile or missing website field alone is insufficient evidence for a pitch.",
  };
}

export function groundedDraft(
  candidate: Candidate,
  decision: Decision,
  service: string,
): string {
  const observation = decision.evidenceQuote
    ? `Your public profile says “${decision.evidenceQuote}”. `
    : "";
  return `Hi ${candidate.name}, ${observation}I help small businesses with ${service}. Would a simple page for enquiries or bookings be useful alongside your current setup? Happy to hear how you handle it today before suggesting anything.`;
}

export function acceptableDraft(
  value: string,
  quote: string | undefined,
): boolean {
  if (!quote || !value.toLowerCase().includes(quote.toLowerCase()))
    return false;
  return !/\b(?:no website|without a website|don't have a website|do not have a website|missing website|broken website|guarantee|guaranteed|losing (?:clients|customers|money))\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|\+?\d[\d ()-]{7,}\d/i.test(
    value,
  );
}
