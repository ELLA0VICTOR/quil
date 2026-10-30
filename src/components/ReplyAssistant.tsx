import { useState } from "react";
import type { Conversation, ReplyPlan } from "../../shared/outreach";
import { draftReply, readConversation } from "../lib/outreach-api";

export default function ReplyAssistant({
  rootId,
  onReply,
  onMeeting,
}: {
  rootId: string;
  onReply: (plan: ReplyPlan) => void;
  onMeeting: (start: string) => void;
}) {
  const [conversation, setConversation] = useState<Conversation>();
  const [plan, setPlan] = useState<ReplyPlan>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [scope, setScope] = useState(""),
    [currency, setCurrency] = useState("USD");
  const [price, setPrice] = useState(""),
    [minimum, setMinimum] = useState("");
  const [delivery, setDelivery] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [checkedAt, setCheckedAt] = useState("");
  const read = async () => {
    setBusy(true);
    setError("");
    setPlan(undefined);
    try {
      setConversation((await readConversation(rootId)).conversation);
      setCheckedAt(new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const prepare = async () => {
    if (busy) return;
    setBusy(true);
    setPreparing(true);
    setError("");
    setPlan(undefined);
    try {
      const terms =
        scope || price || minimum || delivery
          ? { scope, currency, price, minimum, deliveryDays: Number(delivery) }
          : undefined;
      setPlan((await draftReply(rootId, terms)).plan);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
      setPreparing(false);
    }
  };
  return (
    <section className="reply-assistant" aria-label="Business conversation">
      <div className="reply-heading">
        <h4>The conversation</h4>
        <button className="text-link" disabled={busy} onClick={() => void read()}>
          {busy ? "Checking…" : conversation ? "Refresh replies" : "Read conversation"}
        </button>
      </div>
      {!conversation && !busy && <p>Read the latest messages in this email thread.</p>}
      {checkedAt && <p className="reply-checked" role="status">Last checked at {checkedAt}.</p>}
      {conversation && (
        <>
          <div className="reply-messages">
            {conversation.messages.slice(-4).map((message) => (
              <details key={message.id}>
                <summary>
                  <strong>
                    {message.from === conversation.recipient ? "Business" : "You"}
                  </strong>
                  {message.sentAt && (
                    <time dateTime={message.sentAt}>
                      {new Date(message.sentAt).toLocaleString()}
                    </time>
                  )}
                  <span>
                    {message.text.slice(0, 160) || "Open this message in Gmail."}
                  </span>
                </summary>
                <p className="reply-body">
                  {message.text}
                  {message.truncated ? "\n\nOpen Gmail for the complete message." : ""}
                </p>
              </details>
            ))}
          </div>
          {conversation.stopped ? (
            <p>This contact has declined further outreach. Follow-ups are stopped.</p>
          ) : !conversation.canReply ? (
            <p>Your latest message is awaiting a reply.</p>
          ) : (
            <>
              <details className="reply-terms">
                <summary>Set your offer terms</summary>
                <p>Quil can draft within these limits. Your minimum stays private.</p>
                <label>
                  Scope
                  <textarea
                    value={scope}
                    maxLength={1000}
                    rows={3}
                    placeholder="What you will deliver"
                    onChange={(e) => setScope(e.target.value)}
                  />
                </label>
                <div className="reply-term-fields">
                  <label>
                    Currency
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                    >
                      <option value="USD">USD</option>
                      <option value="GBP">GBP</option>
                      <option value="EUR">EUR</option>
                      <option value="NGN">NGN</option>
                    </select>
                  </label>
                  <label>
                    Your quote
                    <input
                      inputMode="decimal"
                      value={price}
                      maxLength={10}
                      placeholder="500.00"
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </label>
                  <label>
                    Minimum price
                    <input
                      inputMode="decimal"
                      value={minimum}
                      maxLength={10}
                      placeholder="Same as quote"
                      onChange={(e) => setMinimum(e.target.value)}
                    />
                  </label>
                  <label>
                    Working days
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={delivery}
                      onChange={(e) => setDelivery(e.target.value)}
                    />
                  </label>
                </div>
              </details>
              <button
                className="text-link"
                disabled={busy || !!conversation.latestIncoming?.truncated}
                onClick={() => void prepare()}
              >
                {preparing ? "Preparing a response…" : "Prepare a response"}
              </button>
            </>
          )}
        </>
      )}
      {plan && (
        <div className="reply-plan">
          <blockquote>{plan.evidence}</blockquote>
          <p>{plan.note}</p>
          {!!plan.text && (
            <>
              <p className="reply-body">{plan.text}</p>
              <button className="text-link" onClick={() => onReply(plan)}>
                Edit this reply
              </button>
            </>
          )}
          {plan.meetingStart && (
            <button className="text-link" onClick={() => onMeeting(plan.meetingStart!)}>
              Review proposed meeting: {new Date(plan.meetingStart).toLocaleString()}
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="outreach-error">
          {error}
        </p>
      )}
    </section>
  );
}
