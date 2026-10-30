import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Store } from "../store.ts";
import { readConfig } from "../config.ts";
import { createApi } from "../http.ts";
import { GoogleConnection } from "../google.ts";
import { FixtureProvider } from "../providers.ts";
import { fromCreated, prospectsFor } from "../../src/lib/run-view.ts";
import type { CreatedRun, RunSnapshot } from "../../shared/mission.ts";

const connectionString = process.env.QUIL_TEST_DATABASE_URL || process.env.DATABASE_URL;
test(
  "Neon keeps OAuth, runs, controls, private saved items and atomic budgets across independent instances",
  { skip: !connectionString, timeout: 180_000 },
  async () => {
    const namespace = `quil_test_${randomBytes(6).toString("hex")}`;
    const storeA = new Store(".quil-data/postgres-tests", connectionString, namespace),
      storeB = new Store(".quil-data/postgres-tests", connectionString, namespace);
    const config = readConfig({
      QUIL_STORAGE: "postgres",
      DATABASE_URL: connectionString,
      QUIL_GOOGLE_TOKEN_KEY: randomBytes(32).toString("base64"),
      GOOGLE_CLIENT_ID: "fixture-agent",
      GOOGLE_CLIENT_SECRET: "fixture-agent-secret",
      GOOGLE_SIGNIN_CLIENT_ID: "fixture-signin",
      GOOGLE_SIGNIN_CLIENT_SECRET: "fixture-signin-secret",
    });
    const identities = new Map<
      string,
      { sub: string; email: string; email_verified: boolean; nonce: string }
    >();
    let sends = 0;
    const options = (store: Store) => ({
      store,
      identityFetcher: async (_url: string | URL | Request, init?: RequestInit) =>
        Response.json({
          id_token: JSON.stringify(
            identities.get(new URLSearchParams(init!.body as string).get("code")!),
          ),
        }),
      identityVerifier: async (token: string) => JSON.parse(token),
      googleFactory: (id: string) =>
        new GoogleConnection(
          config,
          store,
          async (url, init) => {
            if (String(url).endsWith("/token"))
              return Response.json({
                access_token: "fixture-access",
                refresh_token: "fixture-refresh",
                expires_in: 3600,
                scope: [
                  "gmail.send",
                  "gmail.readonly",
                  "calendar.events",
                  "calendar.freebusy",
                ]
                  .map((s) => "https://www.googleapis.com/auth/" + s)
                  .join(" "),
              });
            if (String(url).endsWith("/profile"))
              return Response.json({ emailAddress: `${id}@example.test` });
            if (String(url).endsWith("/messages/send")) {
              assert.equal(init?.method, "POST");
              sends++;
              await delay(150);
              return Response.json({ id: "fixture-message", threadId: "fixture-thread" });
            }
            if (String(url).includes("/threads/fixture-thread"))
              return Response.json({
                messages: [
                  {
                    id: "fixture-message",
                    payload: {
                      mimeType: "text/plain",
                      headers: [
                        { name: "From", value: `${id}@example.test` },
                        { name: "Message-ID", value: "<fixture@example.test>" },
                      ],
                      body: {
                        data: Buffer.from("Our introduction").toString("base64url"),
                      },
                    },
                  },
                  {
                    id: "owner-reply",
                    payload: {
                      mimeType: "text/plain",
                      headers: [
                        { name: "From", value: "owner@example.test" },
                        { name: "Message-ID", value: "<reply@owner.test>" },
                      ],
                      body: {
                        data: Buffer.from("Could you do USD 450?").toString("base64url"),
                      },
                    },
                  },
                ],
              });
            if (String(url).endsWith("/revoke")) return Response.json({});
            throw Error("Unexpected external operation in an isolated database test");
          },
          id,
        ),
      providerFactory: () => new FixtureProvider(),
    });
    const apiA = await createApi(config, options(storeA)),
      apiB = await createApi(config, options(storeB));
    await Promise.all([
      new Promise<void>((r) => apiA.server.listen(0, "127.0.0.1", r)),
      new Promise<void>((r) => apiB.server.listen(0, "127.0.0.1", r)),
    ]);
    const bases = [apiA, apiB].map(
      (api) => `http://127.0.0.1:${(api.server.address() as { port: number }).port}`,
    );
    function browser() {
      let cookie = "";
      const request = async (
        path: string,
        method = "GET",
        body?: unknown,
        instance = 0,
        extra: Record<string, string> = {},
      ) => {
        const response = await fetch(bases[instance] + path, {
          method,
          redirect: "manual",
          headers: {
            Cookie: cookie,
            Origin: "http://localhost:5173",
            "X-Quil-Action": "review",
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
            ...extra,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const next = response.headers.get("set-cookie");
        if (next) cookie = next.split(";")[0];
        return response;
      };
      return {
        request,
        login: async (name: string) => {
          await request("/api/session");
          const started = await request("/api/auth/signin", "POST", {});
          assert.equal(started.status, 200);
          const url = new URL((await started.json()).url),
            code = randomBytes(6).toString("hex");
          identities.set(code, {
            sub: name,
            email: `${name}@example.test`,
            email_verified: true,
            nonce: url.searchParams.get("nonce")!,
          });
          const callback = await request(
            `/api/auth/google/callback?state=${url.searchParams.get("state")}&code=${code}`,
            "GET",
            undefined,
            1,
          );
          assert.equal(callback.status, 303);
          return (await (await request("/api/session")).json()).user;
        },
        connect: async () => {
          const started = await request("/api/google/connect", "POST", {}, 1);
          assert.equal(started.status, 200);
          const url = new URL((await started.json()).url);
          assert.equal(
            (
              await request(
                `/api/google/callback?state=${url.searchParams.get("state")}&code=fixture-agent-code`,
              )
            ).status,
            303,
          );
        },
      };
    }
    try {
      const alice = browser(),
        bob = browser();
      const a = await alice.login("alice"),
        b = await bob.login("bob");
      assert.notEqual(a.id, b.id);
      await alice.connect();
      await bob.connect();
      assert.equal(
        (await (await alice.request("/api/google/status", "GET", undefined, 1)).json())
          .connected,
        true,
      );
      const createdResponse = await alice.request("/api/runs", "POST", {
        mode: "fixture",
        request: "A private Neon example",
      });
      assert.equal(createdResponse.status, 201);
      const created = (await createdResponse.json()) as CreatedRun;
      assert.equal(
        (
          await bob.request(`/api/runs/${created.run.id}`, "GET", undefined, 1, {
            Authorization: `Bearer ${created.accessToken}`,
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await alice.request(`/api/runs/${created.run.id}/pause`, "POST", {}, 1, {
            Authorization: `Bearer ${created.accessToken}`,
          })
        ).status,
        200,
      );
      await delay(400);
      assert.equal((await storeB.control(created.run.id))!.desired, "paused");
      // A new server instance must not mark a healthy in-flight run failed.
      await storeB.recover();
      assert.notEqual(
        (await storeB.run(created.run.id, created.accessToken, a.id))!.status,
        "failed",
      );
      assert.equal(
        (
          await alice.request(`/api/runs/${created.run.id}/resume`, "POST", {}, 1, {
            Authorization: `Bearer ${created.accessToken}`,
          })
        ).status,
        200,
      );
      const stream = await alice.request(created.eventsUrl, "GET", undefined, 1);
      assert.equal(stream.status, 200);
      const events = await stream.text();
      assert.match(events, /run.completed/);
      assert.match(events, /agent.completed/);
      const run = (await storeB.run(created.run.id, created.accessToken, a.id))!;
      assert.equal(run.status, "completed");
      const saved = prospectsFor({ ...fromCreated(created), outcome: run.outcome });
      assert.equal(
        (await alice.request("/api/me/saved", "PUT", { saved }, 1)).status,
        200,
      );
      assert.equal((await (await alice.request("/api/me/saved")).json()).saved.length, 3);
      assert.equal(
        (await (await bob.request("/api/me/saved", "GET", undefined, 1)).json()).saved
          .length,
        0,
      );
      assert.equal((await bob.request("/api/me/saved", "PUT", { saved })).status, 404);

      run.mode = "live";
      await storeB.saveRun(run); // Synthetic records and injected Google only.
      const preparation = await alice.request("/api/outreach/prepare", "POST", {
        runId: run.id,
        candidateId: "fern",
        kind: "email",
        recipient: "owner@example.test",
        recipientConfirmed: true,
        subject: "Reviewed synthetic proposal",
        text: "A test using an injected Google transport.",
      });
      assert.equal(preparation.status, 201);
      const action = (await preparation.json()).action;
      assert.equal(
        (
          await bob.request(
            `/api/outreach/${action.id}/approve`,
            "POST",
            { approved: true },
            1,
          )
        ).status,
        404,
      );
      const approvals = await Promise.all([
        alice.request(`/api/outreach/${action.id}/approve`, "POST", { approved: true }),
        alice.request(
          `/api/outreach/${action.id}/approve`,
          "POST",
          { approved: true },
          1,
        ),
      ]);
      assert.deepEqual(approvals.map((r) => r.status).sort(), [200, 409]);
      assert.equal(sends, 1);

      assert.equal(
        (await bob.request(`/api/outreach/${action.id}/thread`, "POST", {}, 1)).status,
        404,
      );
      const conversation = await alice.request(
        `/api/outreach/${action.id}/thread`,
        "POST",
        {},
        1,
      );
      assert.equal(conversation.status, 200);
      assert.equal(
        (await conversation.json()).conversation.latestIncoming.id,
        "owner-reply",
      );
      const replyInput = {
        runId: run.id,
        candidateId: "fern",
        kind: "reply",
        parentId: action.id,
        replyToMessageId: "owner-reply",
        recipient: "owner@example.test",
        recipientConfirmed: true,
        subject: action.subject,
        text: "The proposed fee is USD 450.",
        terms: {
          currency: "USD",
          price: "500",
          minimum: "400",
          scope: "One booking page",
          deliveryDays: 10,
        },
      };
      const previews = await Promise.all([
        alice.request("/api/outreach/prepare", "POST", replyInput),
        alice.request("/api/outreach/prepare", "POST", replyInput, 1),
      ]);
      assert.deepEqual(previews.map((r) => r.status).sort(), [201, 409]);
      const preview = (await previews.find((r) => r.status === 201)!.json()).action;
      const sentReply = await Promise.all([
        alice.request(`/api/outreach/${preview.id}/approve`, "POST", { approved: true }),
        alice.request(
          `/api/outreach/${preview.id}/approve`,
          "POST",
          { approved: true },
          1,
        ),
      ]);
      assert.deepEqual(sentReply.map((r) => r.status).sort(), [200, 409]);
      assert.equal(sends, 2);

      const now = new Date().toISOString();
      const budgetRun: RunSnapshot = {
        id: randomBytes(16).toString("hex"),
        mode: "fixture",
        status: "completed",
        brief: run.brief,
        createdAt: now,
        updatedAt: now,
      };
      await storeA.createRun(budgetRun, "private-test-token", a.id);
      const capped = {
        ...config,
        totalBudget: 50_000,
        runBudget: 50_000,
        userDailyBudget: 50_000,
      };
      const reservations = await Promise.allSettled([
        storeA.reserve(budgetRun.id, 40_000, "openai", capped),
        storeB.reserve(budgetRun.id, 40_000, "openai", capped),
      ]);
      assert.equal(reservations.filter((r) => r.status === "fulfilled").length, 1);
      const charged = await storeB.usage(budgetRun.id);
      assert.equal(charged[0].nanoUsd, 40_000);
      assert.equal((await alice.request("/api/auth/logout", "POST", {}, 1)).status, 200);
      assert.equal(
        (
          await alice.request(`/api/runs/${run.id}`, "GET", undefined, 1, {
            Authorization: `Bearer ${created.accessToken}`,
          })
        ).status,
        404,
      );
      assert.equal(
        (await (await bob.request("/api/google/status")).json()).connected,
        true,
      );
    } finally {
      // Only the randomly named schema created by this test is removed.
      assert.match(namespace, /^quil_test_[a-f0-9]{12}$/);
      await storeA.db.exec(`DROP SCHEMA ${namespace} CASCADE`);
      await apiA.close();
      await apiB.close();
    }
  },
);
