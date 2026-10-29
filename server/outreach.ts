import { randomBytes } from "node:crypto";
import type { Store } from "./store.ts";
import { ActionError, GoogleConnection } from "./google.ts";
import type { OutreachAction } from "../shared/outreach.ts";
import type { RunSnapshot } from "../shared/mission.ts";

const email = (value: unknown) => {
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(
      value,
    )
  )
    throw new ActionError(
      400,
      "Enter one valid business email address; Quil never guesses an address.",
    );
  return value.trim().toLowerCase();
};
const text = (value: unknown, max: number) => {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new ActionError(
      400,
      "Complete the message within the displayed limits.",
    );
  return value.trim();
};
type Json = Record<string, unknown>;
type Message = {
  id?: string;
  payload?: { headers?: { name: string; value: string }[] };
};
export class OutreachService {
  constructor(
    private store: Store,
    private google: GoogleConnection,
    private now = () => Date.now(),
  ) {}
  private persist(action: OutreachAction) {
    this.store.db
      .prepare("INSERT OR REPLACE INTO outreach VALUES(?,?,?,?,?)")
      .run(
        action.id,
        action.runId,
        action.candidateId,
        action.state,
        JSON.stringify(action),
      );
    return action;
  }
  get(id: string): OutreachAction {
    const row = this.store.db
      .prepare("SELECT record FROM outreach WHERE id=?")
      .get(id) as { record: string } | undefined;
    if (!row) throw new ActionError(404, "Outreach item not found.");
    return JSON.parse(row.record);
  }
  list(runId: string, candidateId: string): OutreachAction[] {
    return (
      this.store.db
        .prepare(
          "SELECT record FROM outreach WHERE run_id=? AND candidate_id=? ORDER BY rowid DESC LIMIT 30",
        )
        .all(runId, candidateId) as { record: string }[]
    ).map((row) => JSON.parse(row.record));
  }
  private lead(runId: string, candidateId: string) {
    const row = this.store.db
      .prepare("SELECT snapshot FROM runs WHERE id=?")
      .get(runId) as { snapshot: string } | undefined;
    const run: RunSnapshot | undefined = row
      ? JSON.parse(row.snapshot)
      : undefined;
    if (
      !run ||
      run.mode !== "live" ||
      run.status !== "completed" ||
      !run.outcome?.decisions.some(
        (decision) =>
          decision.candidateId === candidateId &&
          decision.verdict === "opportunity",
      )
    )
      throw new ActionError(
        409,
        "Only a completed, approved live opportunity can be contacted. Fictional examples cannot send mail or invitations.",
      );
    const candidate = run.outcome.candidates.find(
      (candidate) => candidate.id === candidateId,
    )!;
    return { run, candidate };
  }
  async prepare(value: Json): Promise<OutreachAction> {
    const runId = text(value.runId, 80),
      candidateId = text(value.candidateId, 100);
    const { candidate } = this.lead(runId, candidateId);
    const sender = this.google.status().email;
    if (!sender)
      throw new ActionError(409, "Connect Gmail and Google Calendar first.");
    const recipient = email(value.recipient);
    if (value.recipientConfirmed !== true)
      throw new ActionError(
        400,
        "Confirm that you checked this is the correct business contact.",
      );
    const kind =
      value.kind === "meeting"
        ? "meeting"
        : value.kind === "follow_up"
          ? "follow_up"
          : value.kind === "email"
            ? "email"
            : undefined;
    if (!kind)
      throw new ActionError(400, "Choose a message or a meeting invitation.");
    const subject = text(value.subject, 180);
    if (/[\r\n]/.test(subject))
      throw new ActionError(400, "The subject must be one line.");
    const body = text(value.text, 10_000),
      history = this.list(runId, candidateId);
    if (
      history.some(
        (action) =>
          action.kind === kind &&
          ["prepared", "sending", "uncertain"].includes(action.state),
      )
    )
      throw new ActionError(
        409,
        "Review, cancel or reconcile the existing preview before preparing another.",
      );
    const action: OutreachAction = {
      id: randomBytes(16).toString("hex"),
      runId,
      candidateId,
      kind,
      state: "prepared",
      recipient,
      sender,
      subject,
      text: body,
      createdAt: new Date(this.now()).toISOString(),
      expiresAt: new Date(this.now() + 30 * 60_000).toISOString(),
    };
    if (
      kind === "email" &&
      history.some((item) => item.kind === "email" && item.state === "sent")
    )
      throw new ActionError(
        409,
        "An introduction has already been sent. Use the follow-up workflow.",
      );
    if (kind === "follow_up") {
      const initial = history.find(
        (item) => item.kind === "email" && item.state === "sent",
      );
      if (!initial?.threadId || initial.recipient !== recipient)
        throw new ActionError(
          409,
          "Send the approved introduction to this address first.",
        );
      const root = await this.sync(initial.id);
      if (root.receivedReply)
        throw new ActionError(
          409,
          "A reply was received. Read it in Gmail and respond personally; the unanswered-message follow-up has been stopped.",
        );
      const count = history.filter(
        (item) => item.kind === "follow_up" && item.state === "sent",
      ).length;
      if (count >= 2)
        throw new ActionError(
          409,
          "The two prepared follow-ups are complete. No further campaign messages are queued.",
        );
      action.parentId = root.id;
      action.threadId = root.threadId;
      action.followUpNumber = count + 1;
      action.subject = root.subject;
      const due = Date.parse(root.sentAt!) + (count === 0 ? 3 : 7) * 86400_000;
      if (this.now() < due)
        throw new ActionError(
          409,
          `This follow-up is due after ${new Date(due).toISOString()}. Its text can be reviewed now, but it is not due to send.`,
        );
    }
    if (kind === "meeting") {
      const start = text(value.start, 60),
        end = text(value.end, 60),
        timeZone = text(value.timeZone, 80);
      const a = Date.parse(start),
        b = Date.parse(end);
      if (
        !Number.isFinite(a) ||
        !Number.isFinite(b) ||
        !/(?:Z|[+-]\d\d:\d\d)$/.test(start) ||
        !/(?:Z|[+-]\d\d:\d\d)$/.test(end) ||
        a < this.now() ||
        a > this.now() + 90 * 86400_000 ||
        b - a < 15 * 60_000 ||
        b - a > 60 * 60_000
      )
        throw new ActionError(
          400,
          "Choose a future meeting of 15–60 minutes within the next 90 days, including its timezone.",
        );
      try {
        new Intl.DateTimeFormat("en", { timeZone });
      } catch {
        throw new ActionError(400, "Choose a valid meeting timezone.");
      }
      action.start = new Date(a).toISOString();
      action.end = new Date(b).toISOString();
      action.timeZone = timeZone;
      action.eventId = action.id;
      await this.checkFree(action);
    }
    if (!candidate.name)
      throw new ActionError(409, "The business identity needs another check.");
    return this.persist(action);
  }
  async availableSlots(value: Json) {
    this.lead(text(value.runId, 80), text(value.candidateId, 100));
    const timeZone = text(value.timeZone, 80),
      duration = Number(value.duration);
    if (![15, 20, 30, 45, 60].includes(duration))
      throw new ActionError(
        400,
        "Choose a meeting duration between 15 and 60 minutes.",
      );
    let local: Intl.DateTimeFormat;
    try {
      local = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        weekday: "short",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      });
    } catch {
      throw new ActionError(400, "Choose a valid meeting timezone.");
    }
    const from = this.now() + 3600_000,
      until = from + 7 * 86400_000;
    const result = await this.google.request("/calendar/v3/freeBusy", "POST", {
      timeMin: new Date(from).toISOString(),
      timeMax: new Date(until).toISOString(),
      timeZone,
      items: [{ id: "primary" }],
    });
    const calendarMap = result.calendars as
      | Record<
          string,
          { errors?: unknown[]; busy?: { start: string; end: string }[] }
        >
      | undefined;
    const calendar =
      calendarMap?.primary ??
      (calendarMap && Object.keys(calendarMap).length === 1
        ? Object.values(calendarMap)[0]
        : undefined);
    if (!calendar || calendar.errors?.length || !Array.isArray(calendar.busy))
      throw new ActionError(
        409,
        "Google could not confirm calendar availability.",
      );
    const busy = calendar.busy.map((period) => [
      Date.parse(period.start),
      Date.parse(period.end),
    ]);
    if (busy.some((period) => period.some((value) => !Number.isFinite(value))))
      throw new ActionError(
        502,
        "Calendar availability could not be read reliably.",
      );
    const selected: { start: string; end: string; timeZone: string }[] = [],
      dates = new Set<string>();
    for (
      let start = Math.ceil(from / 900_000) * 900_000;
      start + duration * 60_000 <= until;
      start += 900_000
    ) {
      const end = start + duration * 60_000,
        parts = Object.fromEntries(
          local.formatToParts(start).map((part) => [part.type, part.value]),
        );
      const date = `${parts.year}-${parts.month}-${parts.day}`,
        minute = Number(parts.hour) * 60 + Number(parts.minute);
      if (
        dates.has(date) ||
        ["Sat", "Sun"].includes(parts.weekday) ||
        minute < 9 * 60 ||
        minute + duration > 17 * 60 ||
        busy.some(([a, b]) => start < b && end > a)
      )
        continue;
      selected.push({
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        timeZone,
      });
      dates.add(date);
      if (selected.length === 3) break;
    }
    return selected;
  }
  private async checkFree(action: OutreachAction) {
    const availability = await this.google.request(
      "/calendar/v3/freeBusy",
      "POST",
      {
        timeMin: action.start,
        timeMax: action.end,
        items: [{ id: "primary" }],
        timeZone: action.timeZone,
      },
    );
    const calendars = availability.calendars as
      Record<string, { errors?: unknown[]; busy?: unknown[] }> | undefined;
    const primary =
      calendars?.primary ??
      (calendars && Object.keys(calendars).length === 1
        ? Object.values(calendars)[0]
        : undefined);
    if (!primary || primary.errors?.length || !Array.isArray(primary.busy))
      throw new ActionError(
        409,
        "Google could not confirm calendar availability. No invitation was created.",
      );
    if (primary.busy.length)
      throw new ActionError(
        409,
        "That time overlaps an existing event. Choose another time.",
      );
  }
  private raw(action: OutreachAction, parent?: OutreachAction) {
    const headers = [
      `From: <${email(action.sender)}>`,
      `To: <${action.recipient}>`,
      `Subject: =?UTF-8?B?${Buffer.from(action.subject).toString("base64")}?=`,
      `Date: ${new Date(this.now()).toUTCString()}`,
      `Message-ID: <${action.id}@quil.local>`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
    ];
    if (parent)
      headers.push(
        `In-Reply-To: ${parent.rfcMessageId || `<${parent.id}@quil.local>`}`,
        `References: ${parent.rfcMessageId || `<${parent.id}@quil.local>`}`,
      );
    const encoded =
      Buffer.from(action.text)
        .toString("base64")
        .match(/.{1,76}/g)
        ?.join("\r\n") ?? "";
    return Buffer.from(headers.join("\r\n") + "\r\n\r\n" + encoded).toString(
      "base64url",
    );
  }
  async approve(id: string, confirmed: unknown) {
    let action = this.get(id);
    if (confirmed !== true)
      throw new ActionError(
        400,
        "Explicit approval of the preview is required.",
      );
    if (action.state !== "prepared")
      throw new ActionError(
        409,
        "This preview has already been processed. Check its status instead of sending it again.",
      );
    if (Date.parse(action.expiresAt) < this.now())
      throw new ActionError(
        409,
        "The preview expired. Cancel it and prepare a fresh one.",
      );
    this.lead(action.runId, action.candidateId);
    if (this.google.status().email !== action.sender)
      throw new ActionError(
        409,
        "The connected sender changed. Prepare a new preview for that account.",
      );
    // Claim durably before any network request. Concurrent clicks cannot send twice.
    const claim = this.store.db
      .prepare(
        "UPDATE outreach SET state='sending' WHERE id=? AND state='prepared'",
      )
      .run(id);
    if (!claim.changes)
      throw new ActionError(409, "This preview is already being processed.");
    action.state = "sending";
    this.persist(action);
    let issued = false;
    try {
      if (action.kind === "meeting") {
        await this.checkFree(action);
        issued = true;
        const event = await this.google.request(
          "/calendar/v3/calendars/primary/events?sendUpdates=all&conferenceDataVersion=1",
          "POST",
          {
            id: action.eventId,
            summary: action.subject,
            description: action.text
              .replaceAll("&", "&amp;")
              .replaceAll("<", "&lt;")
              .replaceAll(">", "&gt;"),
            start: { dateTime: action.start, timeZone: action.timeZone },
            end: { dateTime: action.end, timeZone: action.timeZone },
            attendees: [{ email: action.recipient }],
            conferenceData: {
              createRequest: {
                requestId: action.id,
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            },
          },
        );
        if (event.id !== action.eventId)
          throw new ActionError(
            502,
            "Google did not confirm the event identifier. Check status before taking another action.",
          );
        action.calendarUrl =
          typeof event.htmlLink === "string" ? event.htmlLink : undefined;
        action.meetUrl =
          typeof event.hangoutLink === "string" ? event.hangoutLink : undefined;
        action.attendance = "needsAction";
      } else {
        const parent = action.parentId
          ? await this.sync(action.parentId)
          : undefined;
        if (parent?.receivedReply)
          throw new ActionError(
            409,
            "A reply has arrived. The unanswered-message follow-up was stopped.",
          );
        issued = true;
        const sent = await this.google.request(
          "/gmail/v1/users/me/messages/send",
          "POST",
          {
            raw: this.raw(action, parent),
            ...(action.threadId ? { threadId: action.threadId } : {}),
          },
        );
        if (typeof sent.id !== "string" || typeof sent.threadId !== "string")
          throw new ActionError(
            502,
            "Gmail did not return a message receipt. Check Gmail before taking another action.",
          );
        action.messageId = sent.id;
        action.threadId = sent.threadId;
        action.rfcMessageId = `<${action.id}@quil.local>`;
      }
      action.state = "sent";
      action.sentAt = new Date(this.now()).toISOString();
      action = this.persist(action);
    } catch (error) {
      const rejected =
        error instanceof ActionError &&
        error.upstreamStatus !== undefined &&
        [400, 401, 403, 404, 422].includes(error.upstreamStatus);
      action.state = issued && !rejected ? "uncertain" : "failed";
      action.error =
        error instanceof ActionError
          ? error.message
          : "The action could not be confirmed. No automatic retry was made.";
      this.persist(action);
      throw new ActionError(issued ? 502 : 409, action.error);
    }
    return action;
  }
  async sync(id: string): Promise<OutreachAction> {
    const action = this.get(id);
    if (action.sender !== this.google.status().email)
      throw new ActionError(
        409,
        "Reconnect the Gmail account used for this item.",
      );
    if (
      action.kind === "meeting" &&
      action.eventId &&
      ["sent", "uncertain"].includes(action.state)
    ) {
      const event = await this.google.request(
        `/calendar/v3/calendars/primary/events/${encodeURIComponent(action.eventId)}`,
      );
      if (event.status === "cancelled") action.state = "cancelled";
      else {
        action.state = "sent";
        const attendees = event.attendees as
          | { email?: string; responseStatus?: OutreachAction["attendance"] }[]
          | undefined;
        action.attendance =
          attendees?.find(
            (attendee) => attendee.email?.toLowerCase() === action.recipient,
          )?.responseStatus ?? "needsAction";
        action.calendarUrl =
          typeof event.htmlLink === "string"
            ? event.htmlLink
            : action.calendarUrl;
        action.meetUrl =
          typeof event.hangoutLink === "string"
            ? event.hangoutLink
            : action.meetUrl;
      }
    } else if (action.kind !== "meeting") {
      if (action.state === "uncertain") {
        const found = await this.google.request(
          `/gmail/v1/users/me/messages?q=${encodeURIComponent(`rfc822msgid:${action.id}@quil.local`)}&maxResults=2`,
        );
        const messages = found.messages as
          { id?: string; threadId?: string }[] | undefined;
        if (messages?.length === 1 && messages[0].id && messages[0].threadId) {
          action.messageId = messages[0].id;
          action.threadId = messages[0].threadId;
          action.state = "sent";
          action.sentAt ??= action.createdAt;
        }
      }
      if (action.threadId) {
        const thread = await this.google.request(
          `/gmail/v1/users/me/threads/${encodeURIComponent(action.threadId)}?format=metadata&metadataHeaders=From&metadataHeaders=Message-ID&fields=id,messages(id,payload(headers))`,
        );
        const messages = (thread.messages as Message[] | undefined) ?? [];
        action.receivedReply = messages.some((message) => {
          const from =
            message.payload?.headers?.find(
              (header) => header.name.toLowerCase() === "from",
            )?.value ?? "";
          const address = from.match(/<([^>]+)>/)?.[1] ?? from.trim();
          return address.toLowerCase() !== action.sender?.toLowerCase();
        });
        const sent = messages.find(
          (message) => message.id === action.messageId,
        );
        const messageId = sent?.payload?.headers?.find(
          (header) => header.name.toLowerCase() === "message-id",
        )?.value;
        if (messageId && /^<[^\r\n<>]{1,250}>$/.test(messageId))
          action.rfcMessageId = messageId;
      }
    }
    return this.persist(action);
  }
  cancel(id: string) {
    const action = this.get(id);
    if (action.state !== "prepared")
      throw new ActionError(
        409,
        "Only an unsent preview can be cancelled here.",
      );
    action.state = "cancelled";
    return this.persist(action);
  }
  recover() {
    const rows = this.store.db
      .prepare("SELECT record FROM outreach WHERE state='sending'")
      .all() as { record: string }[];
    for (const row of rows) {
      const action: OutreachAction = JSON.parse(row.record);
      action.state = "uncertain";
      action.error =
        "The server restarted before confirmation. Check status; nothing was automatically resent.";
      this.persist(action);
    }
  }
}
