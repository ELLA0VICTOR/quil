import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createCipheriv, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createApi } from "../http.ts";
import { readConfig } from "../config.ts";
import { Store } from "../store.ts";
import { GoogleConnection } from "../google.ts";
import type { CreatedRun, RunSnapshot } from "../../shared/mission.ts";
import { fromCreated, prospectsFor } from "../../src/lib/run-view.ts";

const root = resolve(".quil-data/tests");
mkdirSync(root, { recursive: true });
async function setup() {
  const directory = mkdtempSync(join(root, "accounts-")),
    store = new Store(directory);
  const config = readConfig({
    QUIL_DATA_DIR: directory,
    GOOGLE_SIGNIN_CLIENT_ID: "sign-in-test",
    GOOGLE_SIGNIN_CLIENT_SECRET: "sign-in-secret",
    GOOGLE_CLIENT_ID: "agent-test",
    GOOGLE_CLIENT_SECRET: "agent-secret",
  });
  const identities = new Map<
    string,
    { sub: string; email: string; email_verified: boolean; nonce: string }
  >();
  const sent: string[] = [],
    revoked: string[] = [];
  const api = await createApi(config, {
    store,
    identityFetcher: async (url, init) => {
      assert.equal(url, "https://oauth2.googleapis.com/token");
      const code = new URLSearchParams(init!.body as string).get("code")!;
      return Response.json({ id_token: JSON.stringify(identities.get(code)) });
    },
    identityVerifier: async (token, audience) => {
      assert.equal(audience, "sign-in-test");
      return JSON.parse(token);
    },
    googleFactory: (userId) =>
      new GoogleConnection(
        config,
        store,
        async (url, init) => {
          if (String(url).endsWith("/token"))
            return Response.json({
              access_token: `access-${userId}`,
              refresh_token: `refresh-${userId}`,
              expires_in: 3600,
              scope: [
                "gmail.send",
                "gmail.readonly",
                "calendar.events",
                "calendar.freebusy",
              ]
                .map((scope) => `https://www.googleapis.com/auth/${scope}`)
                .join(" "),
            });
          if (String(url).endsWith("/profile"))
            return Response.json({ emailAddress: `${userId}@example.com` });
          if (String(url).endsWith("/revoke")) {
            revoked.push(userId);
            return Response.json({});
          }
          assert.equal(
            new Headers(init?.headers).get("Authorization"),
            `Bearer access-${userId}`,
          );
          if (String(url).endsWith("/freeBusy"))
            return Response.json({ calendars: { primary: { busy: [] } } });
          if (String(url).endsWith("/messages/send")) {
            sent.push(userId);
            return Response.json({ id: "sent-test", threadId: "thread-test" });
          }
          throw Error("Unexpected Google operation");
        },
        userId,
      ),
  });
  await new Promise<void>((resolve) => api.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(api.server.address() as { port: number }).port}`;
  function browser() {
    let cookie = "";
    const request = async (
      path: string,
      method = "GET",
      body?: unknown,
      headers: Record<string, string> = {},
    ) => {
      const response = await fetch(base + path, {
        method,
        redirect: "manual",
        headers: {
          Cookie: cookie,
          Origin: "http://localhost:5173",
          "X-Quil-Action": "review",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const next = response.headers.get("set-cookie");
      if (next) cookie = next.split(";")[0];
      return response;
    };
    const session = async () => {
      const response = await request("/api/session");
      assert.equal(response.status, 200);
      return response.json();
    };
    const start = async () => {
      await session();
      const response = await request("/api/auth/signin", "POST", {});
      assert.equal(response.status, 200);
      return new URL((await response.json()).url);
    };
    const login = async (subject: string) => {
      const authorization = await start();
      const code = randomBytes(6).toString("hex");
      identities.set(code, {
        sub: subject,
        email: `${subject}@example.com`,
        email_verified: true,
        nonce: authorization.searchParams.get("nonce")!,
      });
      const response = await request(
        `/api/auth/google/callback?state=${authorization.searchParams.get("state")}&code=${code}`,
      );
      assert.equal(response.status, 303, await response.text());
      return await session();
    };
    const connect = async () => {
      const response = await request("/api/google/connect", "POST", {});
      assert.equal(response.status, 200);
      const authorization = new URL((await response.json()).url);
      const callback = await request(
        `/api/google/callback?state=${authorization.searchParams.get("state")}&code=agent-code`,
      );
      assert.equal(callback.status, 303);
    };
    return { request, session, start, login, connect, getCookie: () => cookie };
  }
  return {
    api,
    store,
    config,
    browser,
    identities,
    sent,
    revoked,
    close: async () => {
      await api.close();
      assert.ok(resolve(directory).startsWith(root + sep));
      rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    },
  };
}
async function create(
  client: ReturnType<Awaited<ReturnType<typeof setup>>["browser"]>,
  label: string,
) {
  const response = await client.request("/api/runs", "POST", {
    request: label,
    mode: "fixture",
  });
  assert.equal(response.status, 201);
  return response.json() as Promise<CreatedRun>;
}
async function complete(
  client: ReturnType<Awaited<ReturnType<typeof setup>>["browser"]>,
  created: CreatedRun,
) {
  for (let i = 0; i < 150; i++) {
    const response = await client.request(
      `/api/runs/${created.run.id}`,
      "GET",
      undefined,
      { Authorization: `Bearer ${created.accessToken}` },
    );
    assert.equal(response.status, 200);
    const value = await response.json();
    if (value.run.status === "completed") return value.run as RunSnapshot;
    await delay(20);
  }
  throw Error("Run did not complete");
}

test("Google sign-in rotates the session, binds state to the initiating browser and rejects wrong nonce", async () => {
  const app = await setup();
  try {
    const alice = app.browser(),
      bob = app.browser();
    await alice.session();
    await bob.session();
    const start = await alice.start();
    const cross = await bob.request(
      `/api/auth/google/callback?state=${start.searchParams.get("state")}&code=anything`,
    );
    assert.equal(cross.status, 400);
    assert.equal((await bob.session()).user.authenticated, false);
    const wrong = await alice.start();
    app.identities.set("wrong", {
      sub: "alice",
      email: "alice@example.com",
      email_verified: true,
      nonce: "wrong",
    });
    assert.equal(
      (
        await alice.request(
          `/api/auth/google/callback?state=${wrong.searchParams.get("state")}&code=wrong`,
        )
      ).status,
      401,
    );
    const before = alice.getCookie(),
      signed = await alice.login("alice");
    assert.equal(signed.user.authenticated, true);
    assert.notEqual(alice.getCookie(), before);
    assert.doesNotMatch(
      JSON.stringify(signed),
      /sign-in-secret|google_sub|sessionHash|access_token/,
    );
  } finally {
    await app.close();
  }
});
test("two users can research concurrently but cannot read, replay or control each other's runs even with a leaked run token", async () => {
  const app = await setup();
  try {
    const alice = app.browser(),
      bob = app.browser();
    const a = await alice.login("alice"),
      b = await bob.login("bob");
    assert.notEqual(a.user.id, b.user.id);
    const [one, two] = await Promise.all([
      create(alice, "Alice's private brief"),
      create(bob, "Bob's private brief"),
    ]);
    const [resultA, resultB] = await Promise.all([
      complete(alice, one),
      complete(bob, two),
    ]);
    assert.equal(resultA.brief.request, "Alice's private brief");
    assert.equal(resultB.brief.request, "Bob's private brief");
    assert.equal(
      (
        await bob.request(`/api/runs/${one.run.id}`, "GET", undefined, {
          Authorization: `Bearer ${one.accessToken}`,
        })
      ).status,
      404,
    );
    assert.equal((await bob.request(one.eventsUrl)).status, 404);
    assert.equal(
      (
        await bob.request(
          `/api/runs/${one.run.id}/cancel`,
          "POST",
          {},
          { Authorization: `Bearer ${one.accessToken}` },
        )
      ).status,
      404,
    );
    assert.equal((await app.browser().request(one.eventsUrl)).status, 404);
    assert.equal(
      (
        await alice.request(`/api/runs/${two.run.id}`, "GET", undefined, {
          Authorization: `Bearer ${two.accessToken}`,
        })
      ).status,
      404,
    );
  } finally {
    await app.close();
  }
});
test("saved prospects belong to the signed-in account and reject a foreign run reference", async () => {
  const app = await setup();
  try {
    const alice = app.browser(),
      bob = app.browser();
    await alice.login("alice");
    await bob.login("bob");
    const created = await create(alice, "A saved brief"),
      run = await complete(alice, created);
    const items = prospectsFor({ ...fromCreated(created), outcome: run.outcome });
    assert.equal(
      (await alice.request("/api/me/saved", "PUT", { saved: items })).status,
      200,
    );
    assert.equal((await (await bob.request("/api/me/saved")).json()).saved.length, 0);
    assert.equal(
      (await bob.request("/api/me/saved", "PUT", { saved: items })).status,
      404,
    );
    const secondDevice = app.browser();
    assert.equal(
      (await secondDevice.login("alice")).user.id,
      (await alice.session()).user.id,
    );
    assert.equal(
      (await (await secondDevice.request("/api/me/saved")).json()).saved.length,
      3,
    );
    const a = await alice.session();
    assert.equal(
      (
        await bob.request(
          "/api/me/saved",
          "PUT",
          { saved: [] },
          { "X-Quil-Workspace": a.user.id },
        )
      ).status,
      409,
    );
  } finally {
    await app.close();
  }
});
test("Google tokens, refresh/disconnect and outreach previews stay isolated by account", async () => {
  const app = await setup();
  try {
    const alice = app.browser(),
      bob = app.browser();
    const a = await alice.login("alice"),
      b = await bob.login("bob");
    await alice.connect();
    assert.equal(
      (await (await alice.request("/api/google/status")).json()).connected,
      true,
    );
    assert.equal(
      (await (await bob.request("/api/google/status")).json()).connected,
      false,
    );
    await bob.connect();
    const created = await create(alice, "Approved test research"),
      run = await complete(alice, created);
    run.mode = "live";
    await app.store.saveRun(run); // Only this isolated test store; no real provider or customer.
    const input = {
      runId: run.id,
      candidateId: "fern",
      kind: "email",
      recipient: "owner@example.com",
      recipientConfirmed: true,
      subject: "A proposal",
      text: "A reviewed message",
    };
    const previewResponse = await alice.request("/api/outreach/prepare", "POST", input);
    assert.equal(previewResponse.status, 201);
    const preview = (await previewResponse.json()).action;
    assert.equal(
      (
        await bob.request(`/api/outreach/${preview.id}/approve`, "POST", {
          approved: true,
        })
      ).status,
      404,
    );
    assert.equal(
      (await bob.request(`/api/outreach/${preview.id}/sync`, "POST", {})).status,
      404,
    );
    assert.equal(
      (await (await bob.request(`/api/outreach?runId=${run.id}&candidateId=fern`)).json())
        .actions.length,
      0,
    );
    assert.equal(app.sent.length, 0);
    const tokenRows = (await app.store.db
      .prepare("SELECT name,secret FROM integrations")
      .all()) as { name: string; secret: string }[];
    assert.equal(tokenRows.length, 2);
    assert.ok(
      tokenRows.every(
        (row) => !row.secret.includes("access-") && !row.secret.includes("refresh-"),
      ),
    );
    const aSecret = tokenRows.find((row) => row.name === `google:${a.user.id}`)!.secret,
      bSecret = tokenRows.find((row) => row.name === `google:${b.user.id}`)!.secret;
    await app.store.db
      .prepare("UPDATE integrations SET secret=? WHERE name=?")
      .run(aSecret, `google:${b.user.id}`);
    assert.equal((await bob.request("/api/google/status")).status, 503);
    await app.store.db
      .prepare("UPDATE integrations SET secret=? WHERE name=?")
      .run(bSecret, `google:${b.user.id}`);
    assert.equal((await alice.request("/api/google/disconnect", "POST", {})).status, 200);
    assert.equal(
      (await (await bob.request("/api/google/status")).json()).connected,
      true,
    );
    assert.deepEqual(app.revoked, [a.user.id]);
  } finally {
    await app.close();
  }
});
test("logout invalidates private access while the same verified account can return on another session", async () => {
  const app = await setup();
  try {
    const alice = app.browser();
    const initial = await alice.login("alice");
    await alice.connect();
    const run = await create(alice, "Private on logout");
    await complete(alice, run);
    const oldCookie = alice.getCookie();
    assert.equal((await alice.request("/api/auth/logout", "POST", {})).status, 200);
    assert.equal((await alice.session()).user.authenticated, false);
    assert.equal(
      (
        await alice.request(`/api/runs/${run.run.id}`, "GET", undefined, {
          Authorization: `Bearer ${run.accessToken}`,
        })
      ).status,
      404,
    );
    const stale = await alice.request(`/api/runs/${run.run.id}`, "GET", undefined, {
      Cookie: oldCookie,
      Authorization: `Bearer ${run.accessToken}`,
    });
    assert.equal(stale.status, 404);
    const returned = app.browser();
    assert.equal((await returned.login("alice")).user.id, initial.user.id);
    assert.equal(
      (await (await returned.request("/api/google/status")).json()).connected,
      true,
    );
  } finally {
    await app.close();
  }
});
test("daily user allowances remain independent beneath the persistent global cap", async () => {
  const app = await setup();
  try {
    const alice = app.browser(),
      bob = app.browser();
    await alice.login("alice");
    await bob.login("bob");
    const one = await create(alice, "One"),
      two = await create(bob, "Two");
    await Promise.all([complete(alice, one), complete(bob, two)]);
    const config = { ...app.config, userDailyBudget: 50_000 };
    await app.store.reserve(one.run.id, 40_000, "openai", config);
    await assert.rejects(
      async () => await app.store.reserve(one.run.id, 20_000, "openai", config),
      /daily allowance/,
    );
    assert.ok(await app.store.reserve(two.run.id, 40_000, "openai", config));
  } finally {
    await app.close();
  }
});
test("legacy shared credentials stay invisible until the verified original Google owner signs in", async () => {
  const app = await setup();
  try {
    const key = randomBytes(32),
      iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, iv);
    writeFileSync(join(app.config.dataDir, "google-token.key"), key);
    const encrypted = Buffer.concat([
      cipher.update(
        JSON.stringify({
          access_token: "legacy-private",
          refresh_token: "legacy-refresh",
          expires_at: Date.now() + 3600_000,
          email: "alice@example.com",
        }),
      ),
      cipher.final(),
    ]);
    await app.store.db
      .prepare("INSERT INTO integrations VALUES('google',?)")
      .run(
        [iv, cipher.getAuthTag(), encrypted]
          .map((part) => part.toString("base64"))
          .join("."),
      );
    const guest = app.browser();
    assert.equal(
      (await (await guest.request("/api/google/status")).json()).connected,
      false,
    );
    const bob = app.browser();
    await bob.login("bob");
    assert.equal(
      (await (await bob.request("/api/google/status")).json()).connected,
      false,
    );
    assert.ok(
      await app.store.db
        .prepare("SELECT name FROM integrations WHERE name='google'")
        .get(),
    );
    const alice = app.browser();
    const session = await alice.login("alice");
    assert.equal(session.legacyImported, true);
    assert.equal(
      (await (await alice.request("/api/google/status")).json()).email,
      "alice@example.com",
    );
    assert.equal(
      await app.store.db
        .prepare("SELECT name FROM integrations WHERE name='google'")
        .get(),
      undefined,
    );
  } finally {
    await app.close();
  }
});

test("public configuration requires separate sign-in and canonical callbacks, and issues Secure cookies", async () => {
  assert.throws(
    () => readConfig({ QUIL_PUBLIC_ORIGIN: "https://quil.example" }),
    /sign-in client/,
  );
  const env = {
    QUIL_PUBLIC_ORIGIN: "https://quil.example",
    GOOGLE_SIGNIN_CLIENT_ID: "signin",
    GOOGLE_SIGNIN_CLIENT_SECRET: "fixture-only",
  };
  assert.throws(
    () =>
      readConfig({
        ...env,
        GOOGLE_SIGNIN_REDIRECT_URI: "http://localhost:5173/api/auth/google/callback",
      }),
    /callback/,
  );
  assert.throws(() => readConfig({ ...env, GOOGLE_CLIENT_ID: "signin" }), /separate/);
  const directory = mkdtempSync(join(root, "public-"));
  const api = await createApi(readConfig({ ...env, QUIL_DATA_DIR: directory }));
  try {
    await new Promise<void>((resolve) => api.server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(api.server.address() as { port: number }).port}`;
    const response = await fetch(base + "/api/session", {
      headers: { Host: "quil.example", Origin: "https://quil.example" },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie")!, /; Secure/);
    assert.equal((await response.json()).development, false);
    assert.equal(
      (
        await fetch(base + "/api/session", {
          headers: { Host: "quil.example", Origin: "http://localhost:5173" },
        })
      ).status,
      403,
    );
  } finally {
    await api.close();
    assert.ok(resolve(directory).startsWith(root + sep));
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});
