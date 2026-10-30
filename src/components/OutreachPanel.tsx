import { useEffect, useRef, useState } from "react";
import type { Prospect } from "../lib/run-view";
import type { OutreachAction, GoogleStatus, ReplyPlan } from "../../shared/outreach";
import {
  googleStatus,
  listOutreach,
  prepareOutreach,
  outreachAction,
  meetingSlots,
} from "../lib/outreach-api";
import GoogleSettings from "./GoogleSettings";
import ActionConfirmation from "./ActionConfirmation";
import ReplyAssistant from "./ReplyAssistant";
import { safeSourceUrl } from "../lib/run-view";

const actionLabel = (action: OutreachAction) =>
  action.state === "sent"
    ? action.kind === "meeting"
      ? action.attendance === "accepted"
        ? "Invitation accepted"
        : action.attendance === "declined"
          ? "Invitation declined"
          : "Invitation sent · awaiting response"
      : action.receivedReply
        ? "Reply received"
        : "Message sent"
    : action.state === "uncertain" || action.state === "sending"
      ? "Confirmation needed · check status"
      : action.state === "prepared"
        ? "Awaiting your approval"
        : action.state;
export default function OutreachPanel({
  prospect,
  draft,
}: {
  prospect: Prospect;
  draft: string;
}) {
  const [status, setStatus] = useState<GoogleStatus>(),
    [actions, setActions] = useState<OutreachAction[]>([]);
  const [kind, setKind] = useState<"email" | "follow_up" | "reply" | "meeting">("email"),
    [recipient, setRecipient] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const [subject, setSubject] = useState(`A booking-page idea for ${prospect.name}`),
    [message, setMessage] = useState(draft),
    [includeOffer, setIncludeOffer] = useState(false);
  const [replyPlan, setReplyPlan] = useState<ReplyPlan>();
  const [section, setSection] = useState<"conversation" | "compose" | "meeting" | "history">("compose");
  const [start, setStart] = useState(""),
    [duration, setDuration] = useState(20),
    [timeZone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [slots, setSlots] = useState<{ start: string; end: string; timeZone: string }[]>(
    [],
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<OutreachAction>();
  const [confirmation, setConfirmation] = useState<OutreachAction>();
  const [operation, setOperation] = useState<"approve" | "sync" | "cancel">();
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [feedback, setFeedback] = useState("");
  const acting = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const drafts = useRef<Partial<Record<typeof kind, { subject: string; message: string }>>>({});
  const writeKind = useRef<"email" | "follow_up" | "reply">("email");
  useEffect(() => {
    panel.current?.closest(".prospect-dialog-content")?.scrollTo({ top: 0, behavior: "instant" });
  }, [section, preview?.id]);
  useEffect(() => {
    if (prospect.fictional) return;
    let alive = true;
    void googleStatus()
      .then(async (value) => {
        if (!alive) return;
        setStatus(value);
        if (prospect.runId && prospect.candidateId) {
          const result = await listOutreach(prospect.runId, prospect.candidateId);
          if (alive) {
            setActions(result.actions);
            const pending = result.actions.find((action) => action.state === "prepared");
            setPreview(pending);
            if (pending) {
              setKind(pending.kind);
              setSubject(pending.subject);
              setMessage(pending.text);
              setSection(pending.kind === "meeting" ? "meeting" : "compose");
            } else if (result.actions.some((action) => action.kind === "email" && action.state === "sent")) {
              setSection("conversation");
            }
            setRecipient(result.actions[0]?.recipient ?? "");
          }
        }
      })
      .catch((error: Error) => {
        if (alive) setError(error.message);
      }).finally(() => { if (alive) setLoading(false); });
    return () => {
      alive = false;
    };
  }, [prospect.runId, prospect.candidateId, prospect.fictional, retry]);
  const update = (action: OutreachAction) =>
    setActions((current) => [action, ...current.filter((item) => item.id !== action.id)]);
  const dismissConfirmation = () => {
    setConfirmation(undefined);
    requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>(
      '.contact-sections button[aria-pressed="true"]',
    )?.focus());
  };
  const perform = async (id: string, operation: "approve" | "sync" | "cancel") => {
    if (busy || acting.current) return;
    acting.current = true;
    setBusy(true);
    setOperation(operation);
    setError("");
    setFeedback("");
    try {
      const result = await outreachAction(id, operation);
      update(result.action);
      if (result.action.state !== "prepared") setPreview(undefined);
      if (operation === "approve" && result.action.state === "sent") {
        setSection(result.action.kind === "meeting" ? "history" : "conversation");
        setConfirmation(result.action);
        setConfirmed(false);
      } else if (result.action.state === "uncertain" || result.action.state === "sending") {
        setSection("history");
        setFeedback("Delivery is not confirmed yet. Check its status before sending again.");
      } else if (operation === "cancel") {
        setFeedback("Preview cancelled. Nothing was sent.");
      } else if (operation === "sync") {
        setFeedback(actionLabel(result.action));
      } else if (result.action.state === "failed") {
        setError(result.action.error || "The action could not be completed.");
      }
    } catch (error) {
      setError((error as Error).message);
      if (prospect.runId && prospect.candidateId) {
        const result = await listOutreach(prospect.runId, prospect.candidateId).catch(
          () => undefined,
        );
        if (result) {
          setActions(result.actions);
          setPreview(result.actions.find((action) => action.state === "prepared"));
        }
      }
    } finally {
      acting.current = false;
      setBusy(false);
      setOperation(undefined);
    }
  };
  const choose = (value: typeof kind) => {
    drafts.current[kind] = { subject, message };
    if (kind !== "meeting") writeKind.current = kind;
    setKind(value);
    setSection(value === "meeting" ? "meeting" : "compose");
    setError("");
    setFeedback("");
    const previous = drafts.current[value];
    if (previous) {
      setSubject(previous.subject);
      setMessage(previous.message);
      return;
    }
    if (value === "email") {
      setSubject(`A booking-page idea for ${prospect.name}`);
      setMessage(draft);
    }
    if (value === "follow_up") {
      const number = actions.filter(
        (action) => action.kind === "follow_up" && action.state === "sent",
      ).length;
      setMessage(
        prospect.followUps?.[Math.min(number, 1)]?.text ??
          `Hi ${prospect.name}, would the idea in my previous note be useful to discuss?`,
      );
    }
    if (value === "meeting") {
      setSubject(`A conversation about ${prospect.name}'s booking process`);
      setMessage(
        (
          prospect.meetingAgenda ?? [
            "Understand your current booking process.",
            "Discuss whether help would be useful.",
          ]
        ).join("\n"),
      );
    }
  };
  const prepare = async () => {
    if (busy || acting.current) return;
    const emailField = panel.current?.querySelector<HTMLInputElement>('.outreach-compose input[type="email"]');
    if (emailField && !emailField.reportValidity()) return;
    acting.current = true;
    setBusy(true);
    setError("");
    try {
      const a = new Date(start),
        b = new Date(a.getTime() + duration * 60_000);
      const result = await prepareOutreach({
        runId: prospect.runId,
        candidateId: prospect.candidateId,
        kind,
        recipient,
        recipientConfirmed: confirmed,
        subject,
        text:
          message +
          (includeOffer && kind === "email" && prospect.offer
            ? `\n\n${prospect.offer}`
            : ""),
        ...(kind === "reply" && replyPlan
          ? {
              parentId: replyPlan.rootId,
              replyToMessageId: replyPlan.replyToMessageId,
              terms: replyPlan.terms
                ? {
                    ...replyPlan.terms,
                    price: (replyPlan.terms.priceMinor / 100).toFixed(2),
                    minimum: (replyPlan.terms.minimumMinor / 100).toFixed(2),
                  }
                : undefined,
            }
          : {}),
        ...(kind === "meeting"
          ? { start: a.toISOString(), end: b.toISOString(), timeZone }
          : {}),
      });
      update(result.action);
      setPreview(result.action);
    } catch (error) {
      setError((error as Error).message);
      if (prospect.runId && prospect.candidateId) {
        const history = await listOutreach(prospect.runId, prospect.candidateId).catch(
          () => undefined,
        );
        if (history) {
          setActions(history.actions);
          setPreview(history.actions.find((action) => action.state === "prepared"));
        }
      }
    } finally {
      acting.current = false;
      setBusy(false);
    }
  };
  if (prospect.fictional)
    return (
      <p className="outreach-note">
        This is a fictional business. Review the offer and follow-up drafts here; sending
        and calendar invitations are available only for approved live findings.
      </p>
    );
  if (!prospect.runId || !prospect.candidateId)
    return (
      <p className="outreach-note">
        This older saved record has no linked run. Open a new live result to prepare
        outreach.
      </p>
    );
  return (
    <div className="outreach-panel" ref={panel}>
      {!status || loading ? (
        <div className="contact-loading">
          <p role="status">{error ? "Your connection could not be loaded." : "Opening your connection…"}</p>
          {error && <button className="text-link" onClick={() => {
            setError(""); setLoading(true); setRetry((value) => value + 1);
          }}>Try again</button>}
        </div>
      ) : !status.connected ? (
        <GoogleSettings />
      ) : (
        <>
          <p className="outreach-note outreach-sender">From {status.email}</p>
          <nav className="contact-sections" aria-label="Contact sections">
            <button aria-pressed={section === "conversation"} disabled={busy || !!preview}
              onClick={() => setSection("conversation")}>Conversation</button>
            <button aria-pressed={section === "compose"} disabled={busy || !!preview}
              onClick={() => {
                if (kind === "meeting") choose(writeKind.current);
                else setSection("compose");
              }}>Write</button>
            <button aria-pressed={section === "meeting"} disabled={busy || !!preview}
              onClick={() => { if (kind !== "meeting") choose("meeting"); else setSection("meeting"); }}>Meeting</button>
            <button aria-pressed={section === "history"} disabled={busy || !!preview}
              onClick={() => setSection("history")}>Activity</button>
          </nav>
          {error && <p className="outreach-error outreach-feedback" role="alert">{error}</p>}
          {feedback && <p className="outreach-feedback" role="status">{feedback}</p>}
          {section === "conversation" && !actions.some((action) => action.kind === "email" && action.state === "sent") && (
            <div className="contact-empty"><p>Your conversation starts with an introduction.</p>
              <button className="text-link" onClick={() => choose("email")}>Write an introduction</button></div>
          )}
          {section === "history" && !actions.length && <p>No messages or invitations yet.</p>}
          {!!actions.length && section === "history" && !preview && (
            <div className="outreach-history">
              {actions.map((action) => (
                <div key={action.id}>
                  <strong>
                    {action.kind === "meeting"
                      ? "Meeting"
                      : action.kind === "follow_up"
                        ? `Follow-up ${action.followUpNumber}`
                        : action.kind === "reply"
                          ? "Reply"
                          : "Introduction"}
                  </strong>
                  <span>{actionLabel(action)}</span>
                  {action.threadId && (
                    <a
                      href={`https://mail.google.com/mail/u/${encodeURIComponent(action.sender ?? "")}/#all/${encodeURIComponent(action.threadId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open in Gmail
                    </a>
                  )}
                  {action.calendarUrl && safeSourceUrl(action.calendarUrl) && (
                    <a
                      href={safeSourceUrl(action.calendarUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open event
                    </a>
                  )}
                  {action.meetUrl && safeSourceUrl(action.meetUrl) && (
                    <a
                      href={safeSourceUrl(action.meetUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Meeting link
                    </a>
                  )}
                  {["sent", "uncertain", "sending"].includes(action.state) && (
                    <button
                      className="text-link"
                      disabled={busy}
                      onClick={() => void perform(action.id, "sync")}
                    >
                      Check status
                    </button>
                  )}
                  {action.error && <small>{action.error}</small>}
                  <details className="outreach-record">
                    <summary>{action.terms ? "View message & terms" : "View recorded message"}</summary>
                    <p>To: {action.recipient}<br />Subject: {action.subject}
                      {action.sentAt && <><br />Recorded sent: {new Date(action.sentAt).toLocaleString()}</>}
                    </p>
                    {action.terms && <section className="recorded-terms" aria-label="Saved offer terms">
                      <h4>Your offer terms</h4>
                      <dl>
                        <dt>Your quote</dt><dd>{new Intl.NumberFormat(undefined, { style: "currency", currency: action.terms.currency }).format(action.terms.priceMinor / 100)}</dd>
                        <dt>Private minimum</dt><dd>{new Intl.NumberFormat(undefined, { style: "currency", currency: action.terms.currency }).format(action.terms.minimumMinor / 100)}</dd>
                        <dt>Scope</dt><dd>{action.terms.scope}</dd>
                        <dt>Delivery</dt><dd>{action.terms.deliveryDays} working days</dd>
                      </dl>
                    </section>}
                    <p className="reply-body">{action.text}</p>
                  </details>
                </div>
              ))}
            </div>
          )}
          <div hidden={section !== "conversation" || !!preview}>
          {
            actions.find(
              (action) => action.kind === "email" && action.state === "sent",
            ) && (
              <ReplyAssistant
                key={actions.filter((action) => action.state === "sent").length}
                rootId={
                  actions.find(
                    (action) => action.kind === "email" && action.state === "sent",
                  )!.id
                }
                initialTerms={actions.find((action) => action.terms)?.terms}
                onReply={(plan) => {
                  drafts.current[kind] = { subject, message };
                  setReplyPlan(plan);
                  writeKind.current = "reply";
                  setKind("reply");
                  setMessage(plan.text);
                  setSubject(plan.subject);
                  setRecipient(plan.recipient);
                  setConfirmed(false);
                  setError("");
                  setSection("compose");
                }}
                onMeeting={(value) => {
                  choose("meeting");
                  const date = new Date(value);
                  setStart(
                    new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
                      .toISOString()
                      .slice(0, 16),
                  );
                }}
              />
            )}
          </div>
          {preview ? (
            <div className="outreach-preview">
              <h4>Review before {preview.kind === "meeting" ? "inviting" : "sending"}</h4>
              <p>
                From: {preview.sender}
                <br />
                To: {preview.recipient}
                <br />
                Subject: {preview.subject}
              </p>
              {preview.start && (
                <p>
                  {new Date(preview.start).toLocaleString(undefined, {
                    timeZone: preview.timeZone,
                  })}{" "}
                  –{" "}
                  {new Date(preview.end!).toLocaleTimeString(undefined, {
                    timeZone: preview.timeZone,
                  })}{" "}
                  ({preview.timeZone})
                </p>
              )}
              <pre>{preview.text}</pre>
              <p>
                {preview.kind === "meeting"
                  ? "This creates a Google Calendar invitation and sends it to the attendee. Their acceptance is still required."
                  : "This sends the exact message above through your Gmail account."}
              </p>
              <button
                className="button button-blue"
                disabled={busy}
                onClick={() => void perform(preview.id, "approve")}
              >
                {busy
                  ? operation === "approve" ? "Sending…" : operation === "cancel" ? "Cancelling…" : "Checking…"
                  : preview.kind === "meeting"
                    ? "Approve & send invitation"
                    : "Approve & send message"}
              </button>
              <button
                className="text-link"
                disabled={busy}
                onClick={() => void perform(preview.id, "cancel")}
              >
                Cancel preview and edit
              </button>
            </div>
          ) : (
            <div className="outreach-compose" hidden={section !== "compose" && section !== "meeting"}>
              <h4>{kind === "meeting" ? "Arrange a meeting" : kind === "reply" ? "Review your reply" : "Write a message"}</h4>
              <label hidden={kind === "meeting"}>
                Next step
                <select
                  value={kind}
                  onChange={(event) => choose(event.target.value as typeof kind)}
                >
                  <option value="email">Contact the business</option>
                  <option value="follow_up">Follow up on the introduction</option>
                  <option value="reply" disabled={!replyPlan}>
                    Reply to the conversation
                  </option>
                </select>
              </label>
              <label>
                Business email
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={recipient}
                  onChange={(event) => {
                    setRecipient(event.target.value);
                    setConfirmed(false);
                  }}
                  placeholder="Enter a verified business contact"
                  maxLength={254}
                />
              </label>
              {!!prospect.contactEmails?.length && (
                <p>
                  Public contact links from the website:{" "}
                  {prospect.contactEmails.map((address) => (
                    <button
                      key={address}
                      className="text-link"
                      onClick={() => {
                        setRecipient(address);
                        setConfirmed(false);
                      }}
                    >
                      {address}
                    </button>
                  ))}
                  . Confirm who receives it before sending.
                </p>
              )}
              <label className="outreach-check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                I have checked this is the correct business contact.
              </label>
              <label>
                Subject
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  maxLength={180}
                />
              </label>
              <label>
                {kind === "meeting" ? "Meeting agenda" : "Your message"}
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={9000}
                  rows={7}
                />
              </label>
              {kind === "email" && prospect.offer && (
                <label className="outreach-check">
                  <input
                    type="checkbox"
                    checked={includeOffer}
                    onChange={(event) => setIncludeOffer(event.target.checked)}
                  />
                  Include the offer you reviewed above.
                </label>
              )}
              {kind === "follow_up" && (
                <p>
                  Day 3, then day 7 after the introduction. Quil checks for replies before
                  sending. Nothing runs as an unattended campaign.
                </p>
              )}
              {kind === "meeting" && (
                <>
                  <button
                    className="text-link"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      setError("");
                      void meetingSlots({
                        runId: prospect.runId,
                        candidateId: prospect.candidateId,
                        duration,
                        timeZone,
                      })
                        .then(({ slots }) => {
                          setSlots(slots);
                          if (!slots.length)
                            setError(
                              "No free weekday time was found between 9am and 5pm in the next week. Choose a time manually.",
                            );
                        })
                        .catch((error: Error) => setError(error.message))
                        .finally(() => setBusy(false));
                    }}
                  >
                    Suggest free times from my calendar
                  </button>
                  {!!slots.length && (
                    <div className="meeting-slots">
                      {slots.map((slot) => (
                        <button
                          className="text-link"
                          key={slot.start}
                          onClick={() => {
                            const date = new Date(slot.start);
                            setStart(
                              new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
                                .toISOString()
                                .slice(0, 16),
                            );
                          }}
                        >
                          {new Date(slot.start).toLocaleString()}
                        </button>
                      ))}
                    </div>
                  )}
                  <label>
                    Proposed time ({timeZone})
                    <input
                      type="datetime-local"
                      value={start}
                      onChange={(event) => setStart(event.target.value)}
                    />
                  </label>
                  <label>
                    Duration
                    <select
                      value={duration}
                      onChange={(event) => setDuration(Number(event.target.value))}
                    >
                      <option value={15}>15 minutes</option>
                      <option value={20}>20 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={45}>45 minutes</option>
                      <option value={60}>60 minutes</option>
                    </select>
                  </label>
                  <p>
                    Choose a time discussed with the business. Quil checks your calendar;
                    it cannot see the attendee’s availability.
                  </p>
                </>
              )}
              <button
                className="button button-blue"
                disabled={
                  busy ||
                  !confirmed ||
                  !recipient ||
                  !subject.trim() ||
                  !message.trim() ||
                  (kind === "meeting" && !start)
                }
                onClick={() => void prepare()}
              >
                {busy ? "Preparing…" : "Prepare approval preview"}
              </button>
              {!busy && (!recipient.trim() || !confirmed || !subject.trim() || !message.trim() || (kind === "meeting" && !start)) && (
                <p className="compose-hint">{
                  !recipient.trim() ? "Add the recipient’s email to continue."
                    : !confirmed ? "Confirm the recipient’s address to continue."
                      : !subject.trim() ? "Add a subject to continue."
                        : !message.trim() ? "Add your message to continue."
                          : "Choose a meeting time to continue."
                }</p>
              )}
            </div>
          )}
        </>
      )}
      {error && !status?.connected && (
        <p className="outreach-error" role="alert">
          {error}
        </p>
      )}
      {confirmation && <ActionConfirmation
        title={confirmation.kind === "meeting" ? "Invitation sent successfully" : "Email sent successfully"}
        description={confirmation.kind === "meeting"
          ? "Your Google Calendar invitation is on its way. You can check the attendee’s response in Activity."
          : "Sent through your connected Gmail account. You can read replies in Conversation."}
        recipient={confirmation.recipient}
        subject={confirmation.subject}
        nextLabel={confirmation.kind === "meeting" ? "View invitation" : "View conversation"}
        onClose={dismissConfirmation}
        onNext={() => {
          setSection(confirmation.kind === "meeting" ? "history" : "conversation");
          dismissConfirmation();
        }} />}
    </div>
  );
}
