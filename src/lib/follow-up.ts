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
