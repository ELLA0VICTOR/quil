import type { Outcome } from "../../shared/mission.ts";

// Questions about a completed result use the evidence already paid for. They
// never silently launch another discovery or call a model just to rephrase it.
export function followUp(
  request: string,
  outcome: Outcome,
): string | undefined {
  if (
    !/^(?:why|how|what|which|is|are|do|does|can|could)\b/i.test(request) &&
    /^[^?]{2,100}\s+(?:in|around|near)\s+[^?]{2,100}$/i.test(request)
  )
    return;
  if (
    /^(?:(?:please|can you|could you|now)\s+)*(?:find|search|look for|try|switch to|new search)\b/i.test(
      request,
    )
  )
    return;
  if (/\b(?:price|pricing|timeline|budget)\b/i.test(request))
    return "Price, delivery timing and ongoing costs are left open until you agree the scope. Edit Tailored offer below the result before committing to any terms.";
  if (/\b(?:offer|proposal|scope)\b/i.test(request)) {
    const offers = outcome.drafts.flatMap((draft) =>
      draft.offer ? [draft.offer] : [],
    );
    return offers.length
      ? offers.join("\n\n") +
          "\n\nUse Tailored offer below the result to edit and save it."
      : "Open Tailored offer below the result to review the proposal prepared from the saved research. We only prepare an offer for a supported opportunity.";
  }
  if (/\bfollow[ -]?ups?\b/i.test(request)) {
    const drafts = outcome.drafts.flatMap((draft) => draft.followUps ?? []);
    return drafts.length
      ? drafts
          .map(
            (draft) => `Day ${draft.afterDays}, if unanswered:\n${draft.text}`,
          )
          .join("\n\n") +
          "\n\nContact & next steps checks the Gmail thread before you approve a due follow-up."
      : "Follow-ups need an approved introduction first. Open Contact & next steps under a supported result.";
  }
  if (/\b(?:contact|send|meeting|calendar|invite|owner)\b/i.test(request))
    return "Open Contact & next steps below the supported result. Connect Gmail and Calendar using the envelope in the header, enter a checked business email address, and prepare a preview. You approve the message or invitation before it goes out. For a meeting, choose the time discussed with the business; Quil checks your calendar and tracks the invitation response.";
  if (
    /\b(?:draft|introduction|message|email|write|outreach)\b/i.test(request)
  ) {
    const drafts = outcome.drafts.map((draft) => {
      const name = outcome.candidates.find(
        (c) => c.id === draft.candidateId,
      )?.name;
      return `${name ?? "Introduction"}:\n${draft.text}`;
    });
    return drafts.length
      ? `${drafts.join("\n\n")}\n\nYou can edit and copy it through Introduction below the result.`
      : "There isn't an approved introduction yet. The evidence needs another check before we suggest a pitch.";
  }
  if (
    /\b(?:why|evidence|sources?|proof|sure|verify|checked|explain)\b/i.test(
      request,
    )
  ) {
    const named = outcome.candidates.filter((c) =>
      request.toLowerCase().includes(c.name.toLowerCase()),
    );
    const candidates = named.length ? named : outcome.candidates;
    return (
      candidates
        .map((candidate) => {
          const decision = outcome.decisions.find(
            (d) => d.candidateId === candidate.id,
          );
          return `${candidate.name}: ${decision?.reason ?? "The available records are inconclusive."}${decision?.evidenceQuote ? ` The record says: “${decision.evidenceQuote}”.` : ""}`;
        })
        .join("\n\n") +
      "\n\nOpen See the evidence beneath the result for the original source records. Search snippets can be incomplete or outdated."
    );
  }
  if (
    /\b(?:summary|summarise|summarize|result|recommend|next|what now)\b/i.test(
      request,
    )
  )
    return outcome.text;
  return "Would you like the evidence, an introduction, or a new search? For a new search, tell me the business type and city. I can explain this result without running another search.";
}
