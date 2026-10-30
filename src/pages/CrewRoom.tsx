import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent, KeyboardEvent } from "react";
import { Brand, Sheet } from "../components/Shared";
import { Icon } from "../components/Icon";
import AgentSprite from "../components/AgentSprite";
import CrewScene from "../components/CrewScene";
import CrewExchange from "../components/CrewExchange";
import ProspectEntry from "../components/ProspectEntry";
import { crew } from "../data/crew";
import type { AgentId } from "../data/crew";
import { phaseFor, prospectsFor } from "../lib/run-view";
import type { MissionView, Prospect } from "../lib/run-view";
import { useCrewRuns } from "../hooks/useCrewRuns";
import { prepareRun } from "../lib/api";
import type { PreparedBrief } from "../../shared/mission";
import { followUp } from "../lib/follow-up";
import GoogleSettings from "../components/GoogleSettings";
import { useAccount } from "../hooks/useAccount";
import { useSavedProspects } from "../hooks/useSavedProspects";

const exampleRequest =
  "Find cleaning businesses in Manchester that could use a simpler booking website.";
function pendingBrief(userId: string): PreparedBrief | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(`quil:${userId}:pending-brief`) || "null",
    );
    return typeof value?.brief?.request === "string" && value.brief.request.length <= 2000
      ? value
      : null;
  } catch {
    return null;
  }
}
export default function CrewRoom({ goHome }: { goHome: () => void }) {
  const account = useAccount();
  const userId = account.session!.user.id;
  const session = useCrewRuns(`quil:${userId}:active-run`);
  const [restoredBrief] = useState(() => pendingBrief(userId));
  const [input, setInput] = useState(restoredBrief?.brief?.request || ""),
    [panel, setPanel] = useState<"saved" | "about" | "google" | null>(null),
    [toast, setToast] = useState(""),
    [introducing, setIntroducing] = useState(false);
  const [saved, setSaved, savedError] = useSavedProspects(userId);
  const [pending, setPending] = useState<PreparedBrief | null>(restoredBrief),
    [preparing, setPreparing] = useState(false),
    [requestError, setRequestError] = useState("");
  const prepareVersion = useRef(0);
  const busy = session.busy || preparing;
  const feed = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    introTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const phase = session.lastMission
    ? phaseFor(session.lastMission)
    : introducing
      ? "introducing"
      : "idle";
  const running =
    session.lastMission?.status === "running" || session.lastMission?.status === "queued";
  const paused = session.lastMission?.status === "paused";
  const hasMission = session.items.some((item) => item.kind === "mission");
  useEffect(
    () => () => {
      clearTimeout(toastTimer.current);
      clearTimeout(introTimer.current);
      prepareVersion.current++;
    },
    [],
  );
  useEffect(() => {
    const element = feed.current;
    if (!element) return;
    const latest = session.items.at(-1);
    if (!latest) {
      element.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    if (latest.kind === "mission") {
      const exchange = element.querySelector(`[data-mission-id="${latest.id}"]`);
      if (
        latest.status !== "connecting" &&
        latest.status !== "completed" &&
        latest.status !== "failed"
      )
        return;
      const target = latest.outcome
        ? exchange?.querySelector(".shared-outcome")
        : exchange;
      if (target)
        element.scrollTo({
          top:
            element.scrollTop +
            target.getBoundingClientRect().top -
            element.getBoundingClientRect().top -
            (latest.outcome ? 70 : 18),
          behavior: "instant",
        });
    } else
      element.scrollTo({
        top: element.scrollHeight,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }, [session.items]);
  const notify = (text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  };
  const closePanel = useCallback(() => setPanel(null), []);
  const meet = (id: AgentId) => {
    session.say(id, crew.find((person) => person.id === id)!.introduction);
    setIntroducing(true);
    clearTimeout(introTimer.current);
    introTimer.current = setTimeout(() => setIntroducing(false), 4500);
  };
  const reset = async () => {
    prepareVersion.current++;
    setPending(null);
    setPreparing(false);
    setRequestError("");
    await session.reset();
    setInput("");
    if (composer.current) composer.current.style.height = "auto";
    composer.current?.focus();
  };
  const startExample = () => {
    setPending(null);
    setRequestError("");
    void session.start(exampleRequest, {}, true);
  };
  const begin = async (request: string) => {
    if (busy) return;
    const version = prepareVersion.current;
    setPreparing(true);
    setRequestError("");
    try {
      const prepared = await prepareRun({
        request,
        context:
          pending?.context ??
          (session.lastMission?.mode === "live"
            ? { service: session.lastMission.brief?.service }
            : undefined),
        answering: pending?.questionField ? [pending.questionField] : pending?.missing,
      });
      if (version !== prepareVersion.current) return;
      if (!prepared.brief) {
        session.say("you", request);
        session.say(
          "quil",
          prepared.question ?? "Tell me a little more about the search.",
        );
        setPending(prepared);
      } else {
        if (!account.session!.user.authenticated && account.session!.mode === "live") {
          setPending(prepared);
          setInput(request);
          try {
            sessionStorage.setItem(
              `quil:${userId}:pending-brief`,
              JSON.stringify(prepared),
            );
          } catch {}
          account.openAccount();
          return;
        }
        setPending(null);
        try {
          sessionStorage.removeItem(`quil:${userId}:pending-brief`);
        } catch {}
        await session.start(prepared.brief.request, prepared.brief);
      }
    } catch (error) {
      if (version === prepareVersion.current) {
        setRequestError((error as Error).message);
        setInput(request);
      }
    } finally {
      if (version === prepareVersion.current) setPreparing(false);
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const request = input.trim();
    if (!request) return;
    setInput("");
    if (composer.current) composer.current.style.height = "auto";
    if (/^(stop|cancel|never mind)\b/i.test(request) && session.hasActive) {
      void session.control("cancel");
      return;
    }
    if (/^(pause|hold on)\b/i.test(request) && running) {
      void session.control("pause");
      return;
    }
    if (/^(continue|resume|carry on)\b/i.test(request) && paused) {
      void session.control("resume");
      return;
    }
    if (/^(who (are|is)|introduce|meet (the|your)|your team)\b/i.test(request)) {
      session.say("you", request);
      session.say(
        "quil",
        "Pip finds businesses. Milo investigates their websites. Iris checks the evidence. Wren prepares the offer and messages. I keep everyone coordinated.",
      );
      return;
    }
    if (
      /\b(only|just)\b.*\b(opportunit|social|promising|good fit)/i.test(request) &&
      session.lastMission?.outcome
    ) {
      session.filterOpportunities();
      return;
    }
    if (/\b(saved|bookmarks)\b/i.test(request)) {
      setPanel("saved");
      return;
    }
    if (session.hasActive) {
      session.say("you", request);
      session.say(
        "quil",
        "This search is already underway. Pause it, or start a new conversation to change the brief.",
      );
      return;
    }
    if (!pending && session.lastMission?.outcome) {
      const reply = followUp(request, session.lastMission.outcome);
      if (reply) {
        session.say("you", request);
        session.say("quil", reply);
        return;
      }
    }
    void begin(request);
  };
  const composerKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (input.trim()) event.currentTarget.form?.requestSubmit();
    }
  };
  const toggleSave = (prospect: Prospect) =>
    setSaved((current) =>
      current.some((p) => p.id === prospect.id)
        ? current.filter((p) => p.id !== prospect.id)
        : [...current.slice(-29), prospect],
    );
  const updateDraft = (prospect: Prospect, draft: string) =>
    setSaved((current) =>
      current.map((p) => (p.id === prospect.id ? { ...p, draft } : p)),
    );
  const entry = (prospect: Prospect, answerText?: string) => (
    <ProspectEntry
      key={prospect.id}
      prospect={prospect}
      saved={saved.some((p) => p.id === prospect.id)}
      onSave={toggleSave}
      onDraftChange={(draft) => updateDraft(prospect, draft)}
      onOfferChange={(offer) =>
        setSaved((current) =>
          current.map((item) => (item.id === prospect.id ? { ...item, offer } : item)),
        )
      }
      notify={notify}
      answer={answerText !== undefined}
      answerText={answerText}
    />
  );
  const answer = (view: MissionView) => {
    const all = prospectsFor(view),
      primary = all.filter((p) => p.status === "Opportunity"),
      other = all.filter((p) => p.status !== "Opportunity");
    return (
      <div className="conversation-results">
        <span className="results-note sr-only">
          {view.mode === "fixture" ? "FICTIONAL BUSINESSES" : "SOURCE-BACKED FINDINGS"}
        </span>
        {primary.length ? (
          primary.map((p, index) =>
            entry(p, index === 0 ? view.outcome!.text : undefined),
          )
        ) : (
          <div className="answer-prose">
            <p>{view.outcome!.text}</p>
          </div>
        )}
        {!view.onlyOpportunities && other.length > 0 && (
          <details className="reviewed-others">
            <summary>Review the other business checks</summary>
            {other.map((p) => entry(p))}
          </details>
        )}
        {view.onlyOpportunities && !primary.length && (
          <p className="empty-opportunities">
            No supported opportunities in this search.
          </p>
        )}
      </div>
    );
  };
  const exportSaved = () => {
    const cell = (value: string) =>
      '"' +
      (/^\s*[=+\-@]|^[\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""') +
      '"';
    const rows = [
      [
        "Business",
        "Decision",
        "Location",
        "Introduction",
        "Offer",
        "Source URLs",
        "Evidence",
        "Retrieved at",
        "Data",
      ],
      ...saved.map((p) => [
        p.name,
        p.note,
        p.location,
        p.draft,
        p.offer ?? "",
        p.sources.map((source) => source.url).join("\n"),
        p.sources.map((source) => source.observation).join("\n"),
        p.sources.map((source) => source.observedAt).join("\n"),
        p.fictional ? "Fictional example" : "Search evidence",
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(["\ufeff", rows.map((row) => row.map(cell).join(",")).join("\r\n")], {
        type: "text/csv;charset=utf-8;",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "quil-saved-businesses.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Saved businesses exported.");
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
            className="room-account-button"
            onClick={account.openAccount}
            aria-label={
              account.session!.user.authenticated
                ? "Your Quil account"
                : "Sign in to Quil"
            }
            title={account.session!.user.email || "Sign in"}
          >
            {account.session!.user.authenticated ? (
              <Icon name="settings" size={18} />
            ) : (
              "Sign in"
            )}
          </button>
          <button
            className="room-connect-button"
            onClick={() =>
              account.session!.user.authenticated
                ? setPanel("google")
                : account.openAccount()
            }
            aria-label="Gmail and Calendar connection"
            title="Gmail & Calendar"
          >
            <Icon name="mail" size={18} />
          </button>
          <button
            className="icon-button"
            onClick={() => void reset()}
            disabled={busy}
            aria-label="New conversation"
            title="New conversation"
          >
            <Icon name="plus" size={19} />
          </button>
        </div>
      </header>
      <main
        className={`room-main${session.items.length ? " has-conversation" : ""}${hasMission ? " has-mission" : ""}`}
        id="room-content"
        tabIndex={-1}
      >
        {session.items.length > 0 && (
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
          {!session.items.length ? (
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
                    session.say(
                      "quil",
                      "Pip finds the possibilities. Milo looks closer. Iris checks our facts. Wren helps with the first hello.",
                    );
                    setIntroducing(true);
                  }}
                >
                  Meet the crew <Icon name="arrow" size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="conversation-messages">
              {session.items.map((item) => {
                if (item.kind === "mission")
                  return (
                    <div className="mission-thread" key={item.id}>
                      <CrewExchange
                        id={item.id}
                        request={item.request}
                        phase={phaseFor(item)}
                        notes={item.notes}
                        activity={item.activity}
                        mode={item.mode}
                        location={item.location}
                        status={item.status}
                        connection={item.connection}
                        complete={item.status === "completed"}
                      >
                        {item.outcome && answer(item)}
                      </CrewExchange>
                      {item.error && (
                        <div className="mission-error" role="alert">
                          <p>{item.error}</p>
                          {item.status === "failed" && (
                            <button
                              className="text-link retry-mission"
                              disabled={busy || session.hasActive}
                              onClick={() =>
                                void session.start(
                                  item.request,
                                  item.brief ?? {},
                                  item.mode === "fixture",
                                )
                              }
                            >
                              <Icon name="refresh" size={14} /> Try again
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                const person = crew.find((p) => p.id === item.speaker);
                return (
                  <div
                    className={`chat-message ${item.speaker === "you" ? "message-you" : "message-crew"}`}
                    key={item.id}
                    style={
                      person ? ({ "--voice": person.color } as CSSProperties) : undefined
                    }
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
                      <p>{item.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {requestError && (
            <div className="mission-error" role="alert">
              <p>{requestError}</p>
            </div>
          )}
        </div>
        <div className="room-composer-area">
          {session.hasActive && (
            <div className="mission-controls">
              {paused && (
                <button
                  className="resume-mission"
                  disabled={busy}
                  onClick={() => void session.control("resume")}
                >
                  Continue the search <Icon name="arrow" size={14} />
                </button>
              )}
              <button
                className="cancel-mission"
                disabled={busy}
                onClick={() => void session.control("cancel")}
              >
                Cancel search <Icon name="close" size={12} />
              </button>
            </div>
          )}
          {!session.items.length && (
            <button className="try-mission" disabled={busy} onClick={startExample}>
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
                disabled={busy}
                onClick={() => void session.control("pause")}
                aria-label="Pause search"
              >
                <Icon name="pause" size={15} />
              </button>
            ) : (
              <button
                type="submit"
                className="composer-send"
                disabled={!input.trim() || busy}
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
            panel === "google"
              ? "Your connections."
              : panel === "saved"
                ? "Worth keeping."
                : "A little crew. A shared purpose."
          }
          onClose={closePanel}
        >
          {panel === "google" ? (
            <GoogleSettings />
          ) : panel === "saved" ? (
            <>
              <p className="sheet-description">Your saved opportunities.</p>
              {saved.length ? (
                <>
                  <div className="saved-leads">{saved.map((p) => entry(p))}</div>
                  <button className="text-link export-saved" onClick={exportSaved}>
                    <Icon name="download" size={14} /> Export saved businesses
                  </button>
                </>
              ) : (
                <div className="saved-nothing">
                  <Icon name="bookmark" size={25} />
                  <p>Nothing tucked away yet.</p>
                  <span>Use the bookmark beside a business to keep it here.</span>
                  <button className="text-link" onClick={closePanel}>
                    Back to the crew <Icon name="arrow" size={14} />
                  </button>
                </div>
              )}
              <p className="sheet-footnote">
                {account.session!.user.authenticated
                  ? "Saved privately to your Quil account."
                  : "Sign in to keep these across devices."}
                {saved.some((prospect) => prospect.fictional) &&
                  " Example businesses are fictional."}
                {savedError && <span role="status"> {savedError}</span>}
              </p>
            </>
          ) : (
            <>
              <div className="about-crew">
                <AgentSprite agent="quil" mood="happy" />
              </div>
              <p className="sheet-description">
                Quil keeps the team moving. Pip scouts, Milo investigates, Iris checks,
                and Wren writes. You bring the direction and make the final call.
              </p>
              <p className="sheet-description">
                The crew runs through Mozaik on the server. Its events drive the
                contributions you see here, including review corrections and the final
                answer.
              </p>
              <p className="sheet-description">
                The example uses fictional businesses without API credits. Live search and
                model requests require server-side configuration. Evidence stays attached
                to the findings; nothing is sent automatically.
              </p>
              <button
                className="text-link"
                disabled={session.hasActive || session.busy}
                onClick={() => {
                  closePanel();
                  startExample();
                }}
              >
                Try the free example <Icon name="arrow" size={14} />
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
