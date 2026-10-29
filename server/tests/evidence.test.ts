import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptableDraft,
  reviewCandidate,
  standaloneWebsite,
} from "../evidence.ts";
import { prepareBrief } from "../brief.ts";
import { followUp } from "../../src/lib/follow-up.ts";
import type {
  Brief,
  Candidate,
  Outcome,
  Source,
} from "../../shared/mission.ts";

const brief: Brief = {
  request: "Find cleaning firms in Manchester for booking pages",
  category: "cleaners",
  location: "Manchester, UK",
  service: "website design",
  limit: 3,
};
const candidate: Candidate = {
  id: "fern",
  name: "Fern Cleaning",
  website: "https://fern.example/",
  sourceIds: ["initial"],
};
const record = (observation: string, id = "review"): Source => ({
  id,
  observation,
  url: "https://facebook.com/fern",
  title: candidate.name,
  observedAt: "2026-10-29T00:00:00Z",
  fictional: false,
  kind: "search_snippet",
});

test("review finds booking opportunities with existing websites, with a literal location-matched quote", () => {
  const source = record(
    "Fern Cleaning in Manchester. Message us to book a clean.",
  );
  const decision = reviewCandidate(candidate, brief, [source]);
  assert.equal(decision.verdict, "opportunity");
  assert.ok(source.observation.includes(decision.evidenceQuote!));
  assert.deepEqual(decision.sourceIds, [source.id]);
  assert.equal(standaloneWebsite("https://www.facebook.com/fern"), false);
  assert.equal(standaloneWebsite("https://fern.example/"), true);
});

test("review rejects platform mentions, negated booking instructions and wrong-city namesakes", () => {
  for (const snippet of [
    "Fern Cleaning in Manchester. Facebook and Instagram. Booking enquiries welcome.",
    "Fern Cleaning in Manchester. Do not message us to book. We are closed.",
    "Fern Cleaning in London. Message us to book a clean.",
  ])
    assert.notEqual(
      reviewCandidate({ ...candidate, website: null }, brief, [record(snippet)])
        .verdict,
      "opportunity",
      snippet,
    );
  assert.notEqual(
    reviewCandidate(
      { ...candidate, website: null },
      { ...brief, location: "Bath" },
      [record("Fern Cleaning Bathurst. DM to book.")],
    ).verdict,
    "opportunity",
  );
});

test("conflicting manual and online booking records remain inconclusive", () => {
  const decision = reviewCandidate(candidate, brief, [
    record("Fern Cleaning Manchester. DM to book.", "manual"),
    record("Fern Cleaning Manchester. Book online with Fresha.", "online"),
  ]);
  assert.equal(decision.verdict, "uncertain");
  assert.deepEqual(decision.sourceIds, ["manual", "online"]);
  const linkedPlatform = reviewCandidate(candidate, brief, [
    record(
      "Fern Cleaning Manchester. DM to book. https://fern.loviebooking.co.uk",
    ),
  ]);
  assert.equal(linkedPlatform.verdict, "uncertain");
  const linkedTitle = record("Fern Cleaning Manchester. DM to book.");
  linkedTitle.title = "Fern Cleaning https://fern.loviebooking.co.uk";
  assert.equal(
    reviewCandidate(candidate, brief, [linkedTitle]).verdict,
    "uncertain",
  );
  const unrelated = record(
    "A comment mentions Fern Cleaning Manchester. Book online at another salon.",
    "unrelated",
  );
  unrelated.title = "Sarah's Salon school holiday offers";
  const ownRecord = record(
    "Fern Cleaning Manchester. Message us to book.",
    "own",
  );
  assert.equal(
    reviewCandidate(candidate, brief, [ownRecord, unrelated]).verdict,
    "opportunity",
  );
  const phoneAfterQuote = reviewCandidate(candidate, brief, [
    record(
      "Fern Cleaning Manchester. DM to book your appointment +441234567890 Contact us.",
    ),
  ]);
  assert.equal(phoneAfterQuote.evidenceQuote, "DM to book your appointment");
  assert.equal(reviewCandidate(candidate, brief, [record("Fern Cleaning Manchester. DM to book your weekly service.")]).evidenceQuote, "DM to book");
  assert.equal(reviewCandidate(candidate, brief, [record("Fern Cleaning Manchester. Bookings via WhatsApp.")]).verdict, "opportunity");
});

test("draft validation requires the actual quote and rejects unsupported sales claims or contact details", () => {
  const quote = "Message us to book";
  assert.equal(
    acceptableDraft(
      `Your profile says "${quote}". Could a booking page help?`,
      quote,
    ),
    true,
  );
  for (const text of [
    "A generic intro",
    `${quote}. You have no website.`,
    `${quote}. Guaranteed leads.`,
    `${quote}. Contact fake@example.com.`,
  ])
    assert.equal(acceptableDraft(text, quote), false);
});

test("free clarification handles several missing fields one answer at a time", () => {
  let prepared = prepareBrief({ request: "I build websites" }, "live");
  assert.equal(prepared.questionField, "category");
  prepared = prepareBrief(
    {
      request: "cleaning services",
      context: prepared.context,
      answering: [prepared.questionField],
    },
    "live",
  );
  assert.equal(prepared.context.category, "cleaning services");
  assert.equal(prepared.questionField, "location");
  prepared = prepareBrief(
    {
      request: "Manchester, UK",
      context: prepared.context,
      answering: [prepared.questionField],
    },
    "live",
  );
  assert.equal(prepared.brief?.location, "Manchester, UK");
  assert.equal(prepared.brief?.service, "website design and booking flows");
});

test("questions about an existing result are answered from its records without starting a new search", () => {
  const outcome: Outcome = {
    text: "A supported result",
    candidates: [candidate],
    findings: [],
    decisions: [
      reviewCandidate(candidate, brief, [
        record("Fern Cleaning Manchester. DM to book."),
      ]),
    ],
    sources: [],
    drafts: [
      {
        candidateId: candidate.id,
        text: "A grounded introduction",
        sourceIds: ["review"],
      },
    ],
  };
  assert.match(
    followUp("Why did you choose Fern Cleaning?", outcome)!,
    /manual bookings/,
  );
  assert.match(
    followUp("Why did you search for this business?", outcome)!,
    /manual bookings/,
  );
  assert.match(
    followUp("Show the introduction", outcome)!,
    /A grounded introduction/,
  );
  assert.equal(followUp("Find salons in Lagos", outcome), undefined);
  assert.equal(followUp("salons in Lagos", outcome), undefined);
  assert.match(followUp("Can you do more?", outcome)!, /new search/);
});
