import type {
  Brief,
  Candidate,
  Decision,
  Draft,
  WebsiteCheck,
} from "./mission.ts";

// Scope is a proposal for the user to edit, not a claim about the business.
// Commercial terms remain open until the freelancer supplies them.
export function developOffer(
  draft: Draft,
  candidate: Candidate,
  brief: Brief,
  decision: Decision,
  checks: WebsiteCheck[] = [],
  proposal?: { angle?: unknown; scope?: unknown },
): Draft {
  const website = checks.find((check) => check.candidateId === candidate.id);
  const basis = decision.evidenceQuote
    ? `Their public record says “${decision.evidenceQuote}”.`
    : decision.reason;
  const fallbackScope = [
    "A clear mobile-friendly page describing the services you choose to promote.",
    "An enquiry or appointment-request form with only the details your team needs.",
    "A clear next step directing customers to your preferred booking/contact method.",
    "A handover so your team can update the page and manage enquiries.",
  ];
  const safeProposal = (value: unknown): value is string =>
    typeof value === "string" &&
    value.length > 5 &&
    value.length <= 180 &&
    !/\d|[$£€%]|guarantee|no website|broken website|missing website|losing (?:customers|money)/i.test(
      value,
    ) &&
    !(
      website?.status === "reachable" &&
      /\breplace|from scratch|new website\b/i.test(value)
    );
  const scope =
    Array.isArray(proposal?.scope) &&
    proposal.scope.length > 0 &&
    proposal.scope.length <= 3 &&
    proposal.scope.every(safeProposal)
      ? proposal.scope
      : fallbackScope;
  const angle = safeProposal(proposal?.angle)
    ? proposal.angle
    : `${brief.service}, shaped around how ${candidate.name} currently handles enquiries and bookings.`;
  return {
    ...draft,
    offer: `Proposal for ${candidate.name}\n\nWhy this may be relevant\n${basis} This is a conversation starter; it does not establish that the current process is a problem.\n\nProposed service\n${angle}\n\nSuggested scope\n${scope.map((line) => `• ${line}`).join("\n")}\n\nWebsite position\n${website?.status === "reachable" ? "An HTML page responded at the listed website. Keep the existing site and discuss a focused improvement; do not pitch a replacement without agreement." : "Website ownership, functionality and the full booking process still need confirmation. No missing or broken website is claimed."}\n\nBefore agreeing\nConfirm the current workflow, existing tools, access, accessibility needs and what success would mean.\n\nPrice, timing and ongoing costs\nTo be agreed after discovery. No price, delivery date, savings or sales increase is promised.\n\nSuggested next step\nA 20-minute conversation to understand the current process before committing to work.`,
    followUps: [
      {
        afterDays: 3,
        text: `Hi ${candidate.name}, just following up on my note about a possible booking/enquiry page. Is this something that would be useful to discuss, or does your current setup already cover it? No problem if it is not a priority.`,
      },
      {
        afterDays: 7,
        text: `Hi ${candidate.name}, one final note about the booking-page idea. If it would help, we could have a short conversation about your current process. Otherwise I will leave it here. Thanks for your time.`,
      },
    ],
    meetingAgenda: [
      "Understand the current enquiry and booking process.",
      "Check existing website/tools and what should stay.",
      "Agree whether help is useful, then discuss scope, budget and timing.",
    ],
  };
}
