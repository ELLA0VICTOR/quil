import { useState } from "react";
import { Icon } from "./Icon";
import type { Prospect } from "../lib/run-view";
import { safeSourceUrl } from "../lib/run-view";
export default function ProspectEntry({
  prospect,
  saved,
  onSave,
  notify,
  answer = false,
  answerText,
  onDraftChange,
}: {
  prospect: Prospect;
  saved: boolean;
  onSave: (prospect: Prospect) => void;
  notify: (text: string) => void;
  answer?: boolean;
  answerText?: string;
  onDraftChange?: (draft: string) => void;
}) {
  const [view, setView] = useState<"none" | "evidence" | "draft">("none"),
    [draft, setDraft] = useState(prospect.draft);
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
              onClick={() => onSave({ ...prospect, draft })}
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
        {answer && (
          <button
            className={`lead-save${saved ? " is-saved" : ""}`}
            onClick={() => onSave({ ...prospect, draft })}
            aria-label={`${saved ? "Unsave" : "Save"} ${prospect.name}`}
            aria-pressed={saved}
          >
            <Icon name={saved ? "check" : "bookmark"} size={13} />
            {saved ? "Saved" : "Save"}
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
                {!source.fictional &&
                  Number.isFinite(Date.parse(source.observedAt)) && (
                    <small>
                      Search record retrieved{" "}
                      {new Date(source.observedAt).toLocaleString()}. This is
                      not the page's publication date.
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
    </article>
  );
}
