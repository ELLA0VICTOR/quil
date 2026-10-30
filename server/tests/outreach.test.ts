import test from "node:test";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join, sep } from "node:path";
import { Store, hashToken } from "../store.ts";
import { readConfig } from "../config.ts";
import { GoogleConnection } from "../google.ts";
import { OutreachService } from "../outreach.ts";
import { createApi } from "../http.ts";
import type { RunSnapshot } from "../../shared/mission.ts";

const root = resolve(".quil-data/tests");
mkdirSync(root, { recursive: true });
async function setup() {
  const directory = mkdtempSync(join(root, "outreach-")),
    store = new Store(directory);
  let now = Date.now(),
    sends = 0,
    invites = 0,
    busy = false,
    reply = false,
    lost = false,
    attendance = "needsAction",
    grantScopes = "";
  const config = readConfig({
    QUIL_DATA_DIR: directory,
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-secret",
  });
  const transport: typeof fetch = async (url, init) => {
    const path = String(url);
    if (path === "https://oauth2.googleapis.com/token")
      return Response.json({
        access_token: "private-test-access",
        refresh_token: "private-test-refresh",
        expires_in: 3600,
        scope: grantScopes,
      });
    if (path.endsWith("/profile"))
      return Response.json({ emailAddress: "freelancer@example.com" });
    if (path.endsWith("/revoke")) return Response.json({});
    if (path.endsWith("/freeBusy")) {
      const period = JSON.parse(init!.body as string);
      return Response.json({
        calendars: {
          primary: {
            busy: busy ? [{ start: period.timeMin, end: period.timeMax }] : [],
          },
        },
      });
    }
    if (path.includes("/messages/send")) {
      sends++;
      const payload = JSON.parse(init!.body as string);
      const raw = Buffer.from(payload.raw, "base64url").toString("utf8");
      assert.match(raw, /To: <owner@example.com>/);
      assert.doesNotMatch(raw, /Bcc:/);
      if (lost) throw Error("private-test-access must never reach the UI");
      return Response.json({ id: `message-${sends}`, threadId: "thread-one" });
    }
    if (path.includes("/threads/thread-one"))
      return Response.json({
        messages: [
          {
            id: "message-1",
            payload: {
              headers: [
                { name: "From", value: "Freelancer <freelancer@example.com>" },
                { name: "Message-ID", value: "<actual-message@example.com>" },
              ],
            },
          },
          ...(reply
            ? [
                {
                  id: "reply-1",
                  payload: {
                    headers: [{ name: "From", value: "Owner <owner@example.com>" }],
                  },
                },
              ]
            : []),
        ],
      });
    if (path.includes("/messages?q="))
      return Response.json({
        messages: [{ id: "message-1", threadId: "thread-one" }],
      });
    if (path.includes("/events?")) {
      invites++;
      const data = JSON.parse(init!.body as string);
      assert.deepEqual(data.attendees, [{ email: "owner@example.com" }]);
      return Response.json({
        id: data.id,
        htmlLink: "https://calendar.google.com/event",
        hangoutLink: "https://meet.google.com/test",
      });
    }
    if (path.includes("/events/"))
      return Response.json({
        id: path.split("/").at(-1),
        attendees: [{ email: "owner@example.com", responseStatus: attendance }],
      });
    throw Error("Unexpected Google path in test");
  };
  const google = new GoogleConnection(config, store, transport),
    service = new OutreachService(store, google, () => now);
  const run: RunSnapshot = {
    id: "live-run",
    mode: "live",
    status: "completed",
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    brief: {
      request: "Find a business",
      category: "hairdressers",
      location: "Manchester",
      service: "booking pages",
      limit: 1,
    },
    outcome: {
      text: "A supported conversation",
      candidates: [
        {
          id: "business-one",
          name: "A Real Business",
          website: null,
          sourceIds: ["source"],
        },
      ],
      findings: [],
      decisions: [
        {
          candidateId: "business-one",
          verdict: "opportunity",
          reason: "A public profile requests messages for bookings.",
          sourceIds: ["source"],
        },
      ],
      drafts: [],
      sources: [],
    },
  };
  await store.db
    .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
    .run(
      "internal-test",
      "test-sub",
      "freelancer@example.com",
      "Test",
      new Date().toISOString(),
    );
  await store.createRun(run, "test-run-token", "internal-test");
  const input = {
    runId: run.id,
    candidateId: "business-one",
    kind: "email",
    recipient: "owner@example.com",
    recipientConfirmed: true,
    subject: "A booking-page idea",
    text: "Would a booking page be useful?",
  };
  const connect = async () => {
    const url = new URL(await google.authorize("http://localhost:5173"));
    grantScopes = url.searchParams.get("scope")!;
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    const state = url.searchParams.get("state")!;
    await google.callback(state, "test-code");
    return state;
  };
  const close = async () => {
    await store.close();
    assert.ok(resolve(directory).startsWith(root + sep));
    rmSync(directory, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  };
  return {
    config,
    store,
    google,
    service,
    input,
    run,
    connect,
    close,
    counts: () => ({ sends, invites }),
    advance: (days: number) => {
      now += days * 86400_000;
    },
    setReply: (value: boolean) => {
      reply = value;
    },
    setBusy: (value: boolean) => {
      busy = value;
    },
    loseReceipt: () => {
      lost = true;
    },
    accept: () => {
      attendance = "accepted";
    },
    now: () => now,
  };
}

test("Google uses single-use OAuth state, encrypted server credentials and exposes no tokens", async () => {
  const app = await setup();
  try {
    const state = await app.connect();
    assert.equal((await app.google.status()).email, "freelancer@example.com");
    assert.doesNotMatch(JSON.stringify(await app.google.status()), /private-test/);
    const row = (await app.store.db.prepare("SELECT secret FROM integrations").get()) as {
      secret: string;
    };
    assert.doesNotMatch(row.secret, /private-test|freelancer@example/);
    await assert.rejects(app.google.callback(state, "reused-code"), /expired|verified/);
  } finally {
    await app.close();
  }
});
test("messages require a reviewed preview and durable approval prevents duplicate sends", async () => {
  const app = await setup();
  try {
    await app.connect();
    await assert.rejects(
      app.service.prepare({ ...app.input, recipientConfirmed: false }),
      /correct business contact/,
    );
    await assert.rejects(
      app.service.prepare({
        ...app.input,
        subject: "Hi\r\nBcc: bad@example.com",
      }),
      /one line/,
    );
    const action = await app.service.prepare(app.input);
    assert.equal(app.counts().sends, 0);
    await assert.rejects(app.service.approve(action.id, false), /approval/);
    const result = await Promise.allSettled([
      app.service.approve(action.id, true),
      app.service.approve(action.id, true),
    ]);
    assert.equal(result.filter((value) => value.status === "fulfilled").length, 1);
    assert.equal(app.counts().sends, 1);
    assert.equal((await app.service.get(action.id)).state, "sent");
  } finally {
    await app.close();
  }
});
test("fictional and withdrawn leads cannot send through Gmail", async () => {
  const app = await setup();
  try {
    await app.connect();
    app.run.mode = "fixture";
    await app.store.saveRun(app.run);
    await assert.rejects(app.service.prepare(app.input), /Fictional/);
    app.run.mode = "live";
    app.run.outcome!.decisions[0].verdict = "ruled_out";
    await app.store.saveRun(app.run);
    await assert.rejects(app.service.prepare(app.input), /approved live opportunity/);
    assert.equal(app.counts().sends, 0);
  } finally {
    await app.close();
  }
});
test("follow-ups wait until due and stop if a reply arrives before or after preview", async () => {
  const app = await setup();
  try {
    await app.connect();
    const original = await app.service.prepare(app.input);
    await app.service.approve(original.id, true);
    await assert.rejects(
      app.service.prepare({ ...app.input, kind: "follow_up" }),
      /due after/,
    );
    app.advance(3);
    app.setReply(true);
    await assert.rejects(
      app.service.prepare({ ...app.input, kind: "follow_up" }),
      /reply was received/,
    );
    app.setReply(false);
    const followUp = await app.service.prepare({
      ...app.input,
      kind: "follow_up",
    });
    app.setReply(true);
    await assert.rejects(app.service.approve(followUp.id, true), /reply has arrived/);
    assert.equal(app.counts().sends, 1);
  } finally {
    await app.close();
  }
});
test("lost send receipts stay uncertain and reconcile without resending", async () => {
  const app = await setup();
  try {
    await app.connect();
    const action = await app.service.prepare(app.input);
    app.loseReceipt();
    await assert.rejects(
      app.service.approve(action.id, true),
      (error: Error) => !error.message.includes("private-test-access"),
    );
    assert.equal((await app.service.get(action.id)).state, "uncertain");
    await assert.rejects(app.service.approve(action.id, true), /already been processed/);
    assert.equal((await app.service.sync(action.id)).state, "sent");
    assert.equal(app.counts().sends, 1);
  } finally {
    await app.close();
  }
});
test("meeting invitations recheck availability and distinguish invitation from attendee acceptance", async () => {
  const app = await setup();
  try {
    await app.connect();
    const input = {
      ...app.input,
      kind: "meeting",
      start: new Date(app.now() + 86400_000).toISOString(),
      end: new Date(app.now() + 86400_000 + 20 * 60_000).toISOString(),
      timeZone: "Africa/Lagos",
    };
    const first = await app.service.prepare(input);
    app.setBusy(true);
    await assert.rejects(app.service.approve(first.id, true), /overlaps/);
    assert.equal(app.counts().invites, 0);
    app.setBusy(false);
    const second = await app.service.prepare(input),
      sent = await app.service.approve(second.id, true);
    assert.equal(sent.attendance, "needsAction");
    app.accept();
    assert.equal((await app.service.sync(second.id)).attendance, "accepted");
    assert.equal(app.counts().invites, 1);
  } finally {
    await app.close();
  }
});
test("calendar suggestions respect busy periods, working hours and the user's timezone", async () => {
  const app = await setup();
  try {
    await app.connect();
    const request = {
      runId: app.run.id,
      candidateId: "business-one",
      duration: 20,
      timeZone: "Africa/Lagos",
    };
    const slots = await app.service.availableSlots(request);
    assert.equal(slots.length, 3);
    for (const slot of slots) {
      assert.equal(Date.parse(slot.end) - Date.parse(slot.start), 20 * 60_000);
      const local = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Lagos",
        weekday: "short",
        hour: "2-digit",
        hourCycle: "h23",
      }).formatToParts(new Date(slot.start));
      assert.ok(
        !["Sat", "Sun"].includes(local.find((part) => part.type === "weekday")!.value),
      );
      assert.ok(Number(local.find((part) => part.type === "hour")!.value) >= 9);
    }
    app.setBusy(true);
    assert.equal((await app.service.availableSlots(request)).length, 0);
    assert.equal(app.counts().invites, 0);
  } finally {
    await app.close();
  }
});
test("integration HTTP writes require a local owner cookie, allowed origin and explicit review header", async () => {
  const app = await setup(),
    api = await createApi(app.config, {
      store: app.store,
      googleFactory: () => app.google,
    });
  await new Promise<void>((resolve) => api.server.listen(0, "127.0.0.1", resolve));
  const port = (api.server.address() as { port: number }).port,
    base = `http://127.0.0.1:${port}`;
  try {
    const unauthorized = await fetch(base + "/api/google/connect", {
      method: "POST",
    });
    assert.equal(unauthorized.status, 401);
    const token = randomBytes(32).toString("hex");
    await app.store.db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(hashToken(token), "internal-test", Date.now() + 3600_000);
    const cookie = `quil_session=${token}`;
    const headers = {
      Cookie: cookie,
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    };
    assert.equal(
      (await fetch(base + "/api/google/connect", { method: "POST", headers })).status,
      403,
    );
    const response = await fetch(base + "/api/google/connect", {
      method: "POST",
      headers: { ...headers, "X-Quil-Action": "review" },
    });
    assert.equal(response.status, 200);
    assert.equal(new URL((await response.json()).url).hostname, "accounts.google.com");
    assert.equal(app.counts().sends, 0);
    await app.connect();
    const reviewHeaders = { ...headers, "X-Quil-Action": "review" };
    const prepared = await fetch(base + "/api/outreach/prepare", {
      method: "POST",
      headers: reviewHeaders,
      body: JSON.stringify(app.input),
    });
    assert.equal(prepared.status, 201);
    const action = (await prepared.json()).action;
    const sent = await fetch(base + `/api/outreach/${action.id}/approve`, {
      method: "POST",
      headers: reviewHeaders,
      body: JSON.stringify({ approved: true }),
    });
    assert.equal(sent.status, 200);
    assert.ok(
      (await app.store.events(app.run.id)).some(
        (event) => event.type === "outreach.agent.completed" && event.agent === "wren",
      ),
    );
    assert.ok(
      (await app.store.events(app.run.id)).some(
        (event) => event.type === "outreach.agent.completed" && event.agent === "quil",
      ),
    );
  } finally {
    await api.close();
    assert.ok(resolve(app.config.dataDir).startsWith(root + sep));
    rmSync(app.config.dataDir, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
});
