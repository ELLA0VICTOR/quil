import { useState } from "react";
import { Icon } from "./Icon";
import type { Prospect } from "../lib/run-view";
import { safeSourceUrl } from "../lib/run-view";
import OutreachPanel from "./OutreachPanel";
export default function ProspectEntry({
  prospect,
  saved,
  onSave,
  notify,
  answer = false,
  answerText,
  onDraftChange,
  onOfferChange,
}: {
  prospect: Prospect;
  saved: boolean;
  onSave: (prospect: Prospect) => void;
  notify: (text: string) => void;
  answer?: boolean;
  answerText?: string;
  onDraftChange?: (draft: string) => void;
  onOfferChange?: (offer: string) => void;
}) {
  const [view, setView] = useState<"none" | "evidence" | "draft" | "offer" | "outreach">(
      "none",
    ),
    [draft, setDraft] = useState(prospect.draft);
  const [offer, setOffer] = useState(prospect.offer ?? "");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      notify("Introduction copied. Make it your own before using it.");
    } catch {
      notify("Select the introduction text to copy it manually.");
    }
  };
  return (
    <article
      className={`lead-entry${answer ? " lead-answer" : ""}${view !== "none" ? " lead-entry-open" : ""}`}
    >
      {answer ? (
        <div className="answer-prose">
          <p>{answerText ?? prospect.note}</p>
        </div>
      ) : (
        <>
          <div className="lead-entry-top">
            <span
              className={`lead-signal ${prospect.status === "Opportunity" ? "signal-good" : prospect.status === "Website found" ? "signal-ruled-out" : "signal-uncertain"}`}
            />
            <button
              className="lead-name-button"
              onClick={() => setView(view === "evidence" ? "none" : "evidence")}
              aria-expanded={view === "evidence"}
            >
              {prospect.name}
              <Icon name="arrow-up" size={14} />
            </button>
            <span className="lead-decision">
              {prospect.status === "Opportunity"
                ? "Worth a hello"
                : prospect.status === "Website found"
                  ? "Ruled out"
                  : "Check again"}
            </span>
            <button
              className={`icon-button lead-save${saved ? " is-saved" : ""}`}
              onClick={() => onSave({ ...prospect, draft, offer })}
              aria-label={`${saved ? "Unsave" : "Save"} ${prospect.name}`}
              aria-pressed={saved}
            >
              <Icon name={saved ? "check" : "bookmark"} size={15} />
            </button>
          </div>
          <p className="lead-one-line">{prospect.note}</p>
        </>
      )}
      <div className="lead-entry-links">
        <button
          onClick={() => setView(view === "evidence" ? "none" : "evidence")}
          aria-expanded={view === "evidence"}
        >
          See the evidence <Icon name="chevron" size={11} />
        </button>
        {!!prospect.draft && (
          <button
            onClick={() => setView(view === "draft" ? "none" : "draft")}
            aria-expanded={view === "draft"}
          >
            <Icon name="feather" size={12} /> Introduction
          </button>
        )}
        {!!offer && (
          <button
            onClick={() => setView(view === "offer" ? "none" : "offer")}
            aria-expanded={view === "offer"}
          >
            Tailored offer
          </button>
        )}
        {!!prospect.draft && (
          <button
            onClick={() => setView(view === "outreach" ? "none" : "outreach")}
            aria-expanded={view === "outreach"}
          >
            Contact & next steps
          </button>
        )}
        {answer && (
          <button
            className={`lead-save${saved ? " is-saved" : ""}`}
            onClick={() => onSave({ ...prospect, draft, offer })}
            aria-label={`${saved ? "Unsave" : "Save"} ${prospect.name}`}
            aria-pressed={saved}
          >
            <Icon name={saved ? "check" : "bookmark"} size={13} />
            {saved ? "Saved" : "Save"}
          </button>
        )}
        {answer && (
          <button
            aria-label="Copy answer"
            onClick={() => {
              void navigator.clipboard
                .writeText(answerText ?? prospect.note)
                .then(() => notify("Answer copied."))
                .catch(() => notify("Select the answer text to copy it manually."));
            }}
          >
            <Icon name="copy" size={13} /> Copy
          </button>
        )}
      </div>
      {view === "evidence" && (
        <div className="lead-evidence">
          <span className="small-label">SOURCE RECORDS</span>
          {prospect.sources.map((source, i) => (
            <div key={source.id}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <section>
                <h4>
                  {!source.fictional && safeSourceUrl(source.url) ? (
                    <a
                      href={safeSourceUrl(source.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {source.title} <Icon name="external" size={11} />
                    </a>
                  ) : (
                    source.title
                  )}
                </h4>
                <p>{source.observation}</p>
                {!source.fictional && Number.isFinite(Date.parse(source.observedAt)) && (
                  <small>
                    {source.kind === "website_page"
                      ? "Website page checked "
                      : "Search record retrieved "}
                    {new Date(source.observedAt).toLocaleString()}. This is not the page's
                    publication date.
                  </small>
                )}
              </section>
            </div>
          ))}
          <span className="evidence-footnote">
            {prospect.fictional
              ? "Fictional source records from the server example."
              : "Search records are evidence, not a website availability test."}
          </span>
        </div>
      )}
      {view === "draft" && (
        <div className="lead-introduction">
          <div>
            <span className="small-label">A FIRST HELLO, FROM WREN</span>
            <button className="text-link" onClick={copy}>
              <Icon name="copy" size={13} /> Copy
            </button>
          </div>
          <textarea
            aria-label={`Edit introduction for ${prospect.name}`}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              onDraftChange?.(e.target.value);
            }}
            rows={10}
          />
          <p>Yours to edit. Nothing is sent automatically.</p>
        </div>
      )}
      {view === "offer" && (
        <div className="lead-introduction tailored-offer">
          <div>
            <span className="small-label">A PROPOSAL TO MAKE YOUR OWN</span>
            <button
              className="text-link"
              onClick={() => {
                void navigator.clipboard
                  .writeText(offer)
                  .then(() => notify("Offer copied."))
                  .catch(() => notify("Select the offer text to copy it manually."));
              }}
            >
              <Icon name="copy" size={13} /> Copy
            </button>
          </div>
          <textarea
            aria-label={`Edit offer for ${prospect.name}`}
            value={offer}
            rows={18}
            onChange={(event) => {
              setOffer(event.target.value);
              onOfferChange?.(event.target.value);
            }}
          />
          <p>Review scope, pricing and timing before making a commitment.</p>
          {!!prospect.followUps?.length && (
            <details className="follow-up-drafts">
              <summary>Follow-ups & meeting plan</summary>
              {prospect.followUps.map((followUp) => (
                <section key={followUp.afterDays}>
                  <h4>Day {followUp.afterDays}, if unanswered</h4>
                  <p>{followUp.text}</p>
                </section>
              ))}
              <h4>Suggested meeting agenda</h4>
              <ul>
                {prospect.meetingAgenda?.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {view === "outreach" && (
        <OutreachPanel prospect={{ ...prospect, offer }} draft={draft} />
      )}
    </article>
  );
}
