import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Brand, Sheet } from "../components/Shared";
import { Icon } from "../components/Icon";
import AgentSprite from "../components/AgentSprite";
import CrewScene from "../components/CrewScene";
import { crew, phaseMessages, phaseOrder } from "../data/crew";
import type { AgentId, MissionPhase } from "../data/crew";
import { exampleProspects } from "../data/example";
import type { Prospect } from "../data/example";

type Message = {
  id: number;
  speaker: AgentId | "you";
  text: string;
  results?: boolean;
};
type Panel = "saved" | "about" | null;

function ProspectEntry({
  prospect,
  saved,
  onSave,
  notify,
}: {
  prospect: Prospect;
  saved: boolean;
  onSave: () => void;
  notify: (text: string) => void;
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
      className={`lead-entry${view !== "none" ? " lead-entry-open" : ""}`}
    >
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
          onClick={onSave}
          aria-label={`${saved ? "Unsave" : "Save"} ${prospect.name}`}
          aria-pressed={saved}
        >
          <Icon name={saved ? "check" : "bookmark"} size={15} />
        </button>
      </div>
      <p className="lead-one-line">
        {prospect.status === "Opportunity"
          ? "Takes booking enquiries through a social profile."
          : prospect.status === "Website found"
            ? "A follow-up found a website. The original pitch was withdrawn."
            : "The example site check timed out. Needs another look."}
      </p>
      <div className="lead-entry-links">
        <button
          onClick={() => setView(view === "evidence" ? "none" : "evidence")}
          aria-expanded={view === "evidence"}
        >
          See the evidence <Icon name="chevron" size={11} />
        </button>
        {prospect.status !== "Website found" && (
          <button
            onClick={() => setView(view === "draft" ? "none" : "draft")}
            aria-expanded={view === "draft"}
          >
            <Icon name="feather" size={12} /> Read Wren’s introduction
          </button>
        )}
      </div>
      {view === "evidence" && (
        <div className="lead-evidence">
          <span className="small-label">THE EXAMPLE RECORDS</span>
          {prospect.sources.map((source, i) => (
            <div key={source.title}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <section>
                <h4>{source.title}</h4>
                <p>{source.observation}</p>
              </section>
            </div>
          ))}
          <span className="evidence-footnote">
            Fictional source records, included to illustrate the workflow.
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
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
          />
          <p>Yours to edit. Nothing is sent from this preview.</p>
        </div>
      )}
    </article>
  );
}

export default function CrewRoom({ goHome }: { goHome: () => void }) {
  const [phase, setPhase] = useState<MissionPhase>("idle"),
    [messages, setMessages] = useState<Message[]>([]),
    [input, setInput] = useState(""),
    [running, setRunning] = useState(false),
    [panel, setPanel] = useState<Panel>(null),
    [toast, setToast] = useState(""),
    [onlyOpportunities, setOnlyOpportunities] = useState(false);
  const [saved, setSaved] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem("quil:saved") || "[]",
      );
      return Array.isArray(value)
        ? value.filter(
            (id): id is string =>
              typeof id === "string" &&
              exampleProspects.some((p) => p.id === id),
          )
        : [];
    } catch {
      return [];
    }
  });
  const messageId = useRef(0),
    timers = useRef<ReturnType<typeof setTimeout>[]>([]),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    step = useRef(0),
    feed = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    try {
      localStorage.setItem("quil:saved", JSON.stringify(saved));
    } catch {
      /* Private browsing may disable storage. */
    }
  }, [saved]);
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  useEffect(() => {
    const element = feed.current;
    if (element)
      element.scrollTo({
        top: messages.length ? element.scrollHeight : 0,
        behavior:
          !messages.length ||
          matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
      });
  }, [messages]);
  const push = (speaker: Message["speaker"], text: string, results = false) => {
    const next = { id: ++messageId.current, speaker, text, results };
    setMessages((current) => [...current.slice(-70), next]);
  };
  const notify = (text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  };
  const stopTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const advance = (index: number) => {
    step.current = index;
    setPhase(phaseOrder[index]);
    const message = phaseMessages[index];
    push(message.speaker, message.text, message.kind === "results");
    if (index === phaseOrder.length - 1) setRunning(false);
  };
  const schedule = (from = 0) => {
    stopTimers();
    setRunning(true);
    advance(from);
    for (let index = from + 1; index < phaseOrder.length; index++) {
      timers.current.push(
        setTimeout(() => advance(index), (index - from) * 2600),
      );
    }
  };
  const startExample = (
    request = "Find cleaning businesses in Manchester that could use a website.",
  ) => {
    stopTimers();
    setOnlyOpportunities(false);
    push("you", request);
    push(
      "quil",
      "For this local preview, we’ll use fictional cleaning businesses in Manchester. You can watch the crew work through an example together.",
    );
    schedule();
  };
  const pause = () => {
    stopTimers();
    setRunning(false);
    setPhase("paused");
    push(
      "quil",
      "Paused. We can pick up where we left off whenever you’re ready.",
    );
  };
  const reset = () => {
    stopTimers();
    setRunning(false);
    setPhase("idle");
    setMessages([]);
    setInput("");
    setOnlyOpportunities(false);
    composer.current?.focus();
  };
  const meet = (id: AgentId) => {
    const person = crew.find((p) => p.id === id)!;
    push(id, person.introduction);
    if (!running) {
      setPhase("introducing");
      stopTimers();
      timers.current.push(setTimeout(() => setPhase("idle"), 4500));
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const request = input.trim();
    if (!request) return;
    setInput("");
    if (composer.current) composer.current.style.height = "auto";
    if (/\b(stop|pause|hold on)\b/i.test(request) && running) {
      push("you", request);
      pause();
      return;
    }
    if (/\b(continue|resume|carry on)\b/i.test(request) && phase === "paused") {
      push("you", request);
      push("quil", "Picking it back up.");
      schedule(Math.min(step.current + 1, phaseOrder.length - 1));
      return;
    }
    if (/\b(who|introduce|meet the|colleagues|your team)\b/i.test(request)) {
      push("you", request);
      push(
        "quil",
        "Pip is our scout. Milo looks closer at each business. Iris checks the evidence, and Wren finds the words. Tap any of them if you’d like to say hello.",
      );
      if (!running) {
        setPhase("introducing");
        stopTimers();
        timers.current.push(setTimeout(() => setPhase("idle"), 4500));
      }
      return;
    }
    if (
      /\b(only|just)\b.*\b(opportunit|social|promising|good fit)/i.test(
        request,
      ) &&
      messages.some((message) => message.results)
    ) {
      push("you", request);
      setOnlyOpportunities(true);
      push(
        "quil",
        "I’ll keep the strongest example opportunity in view.",
        true,
      );
      return;
    }
    if (/\b(saved|bookmarks)\b/i.test(request)) {
      push("you", request);
      setPanel("saved");
      return;
    }
    if (running) {
      push("you", request);
      push(
        "quil",
        "I’ve kept your note in the conversation. This preview is following the example mission; you can pause it or start a fresh conversation.",
      );
      return;
    }
    startExample(request);
  };
  const composerKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      if (input.trim()) event.currentTarget.form?.requestSubmit();
    }
  };
  const closePanel = useCallback(() => setPanel(null), []);
  const toggleSave = (id: string) =>
    setSaved((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  const exportSaved = () => {
    const rows = [
        ["Business", "Signal", "Data"],
        ...exampleProspects
          .filter((p) => saved.includes(p.id))
          .map((p) => [p.name, p.signal, "Fictional example"]),
      ],
      csv = rows
        .map((row) =>
          row.map((cell) => '"' + cell.replaceAll('"', '""') + '"').join(","),
        )
        .join("\r\n"),
      url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8;" }),
      ),
      link = document.createElement("a");
    link.href = url;
    link.download = "quil-saved-examples.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Saved examples exported.");
  };
  return (
    <div className="crew-room">
      <header className="room-header">
        <Brand onClick={goHome} />
        <div>
          <button
            className="room-saved-button"
            onClick={() => setPanel("saved")}
            aria-label={`Saved prospects, ${saved.length}`}
          >
            <Icon name="bookmark" size={17} />
            <span>Saved{saved.length > 0 && <i>{saved.length}</i>}</span>
          </button>
          <button
            className="icon-button"
            onClick={reset}
            aria-label="New conversation"
            title="New conversation"
          >
            <Icon name="plus" size={19} />
          </button>
        </div>
      </header>
      <main
        className={`room-main${messages.length ? " has-conversation" : ""}`}
        id="room-content"
        tabIndex={-1}
      >
        {messages.length > 0 && (
          <h1 className="sr-only">Your conversation with the Quil crew</h1>
        )}
        <div className="room-crew-area">
          <CrewScene phase={phase} onMeet={meet} />
        </div>
        <div
          className="room-conversation"
          ref={feed}
          role="log"
          aria-label="Conversation with Quil and the crew"
          aria-live="polite"
          aria-relevant="additions"
        >
          {!messages.length ? (
            <div className="room-welcome">
              <h1>Hey. I’m Quil.</h1>
              <p>
                Tell me what you do, and who you’d like to work with.
                <br />
                We’ll put our heads together.
              </p>
              <div className="welcome-introduction">
                <span>That’s Pip, Milo, Iris and Wren up there.</span>
                <button
                  onClick={() => {
                    push(
                      "quil",
                      "Pip finds the possibilities. Milo looks closer. Iris checks our facts. Wren helps with the first hello. We’ll keep you in the conversation.",
                    );
                    setPhase("introducing");
                    stopTimers();
                    timers.current.push(
                      setTimeout(() => setPhase("idle"), 4500),
                    );
                  }}
                >
                  Meet the crew <Icon name="arrow" size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="conversation-messages">
              {messages.map((message) => {
                const person = crew.find((p) => p.id === message.speaker);
                return (
                  <div
                    className={`chat-message ${message.speaker === "you" ? "message-you" : "message-crew"}`}
                    key={message.id}
                  >
                    {person && (
                      <div className="message-sprite">
                        <AgentSprite agent={person.id} />
                      </div>
                    )}
                    <div className="message-content">
                      <span
                        className="message-author"
                        style={person ? { color: person.color } : undefined}
                      >
                        {person?.name ?? "You"}
                        {person && <i>{person.role.toLowerCase()}</i>}
                      </span>
                      <p>{message.text}</p>
                      {message.results && (
                        <div className="conversation-results">
                          <span className="results-note">
                            FICTIONAL BUSINESSES · MANCHESTER
                          </span>
                          {exampleProspects
                            .filter(
                              (p) =>
                                !onlyOpportunities ||
                                p.status === "Opportunity",
                            )
                            .map((prospect) => (
                              <ProspectEntry
                                key={prospect.id}
                                prospect={prospect}
                                saved={saved.includes(prospect.id)}
                                onSave={() => toggleSave(prospect.id)}
                                notify={notify}
                              />
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {running && (
                <div className="crew-typing" aria-label="The crew is working">
                  <span />
                  <span />
                  <span />
                  <span>
                    {phase === "discovering"
                      ? "Pip is looking around"
                      : phase === "investigating"
                        ? "Milo and Iris are comparing notes"
                        : phase === "reviewing"
                          ? "Iris is checking a detail"
                          : phase === "writing"
                            ? "Wren is finding the words"
                            : "Quil is getting everyone together"}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="room-composer-area">
          {phase === "paused" && (
            <button
              className="resume-mission"
              onClick={() => {
                push("quil", "Let’s pick it back up.");
                schedule(Math.min(step.current + 1, phaseOrder.length - 1));
              }}
            >
              Continue the example <Icon name="arrow" size={14} />
            </button>
          )}
          {!messages.length && (
            <button className="try-mission" onClick={() => startExample()}>
              <Icon name="spark" size={13} /> Or try a little example{" "}
              <Icon name="arrow" size={13} />
            </button>
          )}
          <form className="chat-composer" onSubmit={submit}>
            <Icon name="feather" size={21} />
            <label className="sr-only" htmlFor="crew-prompt">
              Tell Quil what you need
            </label>
            <textarea
              id="crew-prompt"
              ref={composer}
              rows={1}
              value={input}
              maxLength={2000}
              placeholder="Tell us what you have in mind…"
              onKeyDown={composerKey}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 110)}px`;
              }}
            />
            {running ? (
              <button
                type="button"
                className="composer-send composer-stop"
                onClick={pause}
                aria-label="Pause example mission"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="10" height="10" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                type="submit"
                className="composer-send"
                disabled={!input.trim()}
                aria-label="Send message"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 19V5m-6 6 6-6 6 6" />
                </svg>
              </button>
            )}
          </form>
          <div className="composer-footnote">
            <button onClick={() => setPanel("about")}>
              About this little crew <Icon name="arrow-up" size={10} />
            </button>
          </div>
        </div>
      </main>
      {panel && (
        <Sheet
          title={
            panel === "saved"
              ? "Worth keeping."
              : "A little crew. A shared purpose."
          }
          onClose={closePanel}
        >
          {panel === "saved" ? (
            <>
              <p className="sheet-description">
                The possibilities you’ve saved for another look.
              </p>
              {saved.length ? (
                <>
                  <div className="saved-leads">
                    {exampleProspects
                      .filter((p) => saved.includes(p.id))
                      .map((prospect) => (
                        <ProspectEntry
                          key={prospect.id}
                          prospect={prospect}
                          saved
                          onSave={() => toggleSave(prospect.id)}
                          notify={notify}
                        />
                      ))}
                  </div>
                  <button
                    className="text-link export-saved"
                    onClick={exportSaved}
                  >
                    <Icon name="download" size={14} /> Export saved examples
                  </button>
                </>
              ) : (
                <div className="saved-nothing">
                  <Icon name="bookmark" size={25} />
                  <p>Nothing tucked away yet.</p>
                  <span>
                    Use the bookmark beside a business to keep it here.
                  </span>
                  <button className="text-link" onClick={closePanel}>
                    Back to the crew <Icon name="arrow" size={14} />
                  </button>
                </div>
              )}
              <p className="sheet-footnote">
                Saved in this browser. These are fictional example businesses.
              </p>
            </>
          ) : (
            <>
              <div className="about-crew">
                <AgentSprite agent="quil" mood="happy" />
              </div>
              <p className="sheet-description">
                Quil keeps the team moving. Pip scouts, Milo investigates, Iris
                checks, and Wren writes. You bring the direction and make the
                final call.
              </p>
              <p className="sheet-description">
                You’re looking at a local frontend preview. The characters and
                conversation illustrate the planned workflow; live Mozaik
                agents, web search and GPT requests are not connected yet.
              </p>
              <p className="sheet-description">
                Example runs use fictional businesses and consume no API
                credits. You can pause a mission, meet a teammate, review the
                example evidence, edit introductions and save prospects.
              </p>
              <button
                className="text-link"
                onClick={() => {
                  closePanel();
                  startExample();
                }}
              >
                Take a little look <Icon name="arrow" size={14} />
              </button>
            </>
          )}
        </Sheet>
      )}
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={15} />
          {toast}
        </div>
      )}
    </div>
  );
}
