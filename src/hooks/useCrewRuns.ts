import { useCallback, useEffect, useRef, useState } from "react";
import { createRun, getRun, controlRun, watchRun } from "../lib/api";
import {
  applyRunEvent,
  ended,
  fromCreated,
  fromSnapshot,
  newMission,
} from "../lib/run-view";
import type { ChatItem, MissionView } from "../lib/run-view";
import type { AgentId, Brief, CreatedRun } from "../../shared/mission";

function remember(value: CreatedRun | null, storageKey: string) {
  try {
    if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
    else sessionStorage.removeItem(storageKey);
  } catch {
    /* Session recovery is optional in private browsing. */
  }
}
function remembered(storageKey: string): CreatedRun | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
    return value &&
      /^[a-f0-9-]{36}$/.test(value.run?.id) &&
      typeof value.run?.brief?.request === "string" &&
      typeof value.run?.brief?.location === "string" &&
      ["fixture", "live"].includes(value.run?.mode) &&
      /^[a-f0-9]{64}$/.test(value.accessToken) &&
      value.eventsUrl ===
        `/api/runs/${value.run.id}/events?token=${value.accessToken}`
      ? value
      : null;
  } catch {
    return null;
  }
}

export function useCrewRuns(storageKey: string) {
  const [items, setItems] = useState<ChatItem[]>(() => {
    const saved = remembered(storageKey);
    return saved ? [fromCreated(saved)] : [];
  });
  const [busy, setBusy] = useState(false);
  const active = useRef<CreatedRun | null>(null),
    closeStream = useRef<(() => void) | null>(null),
    generation = useRef(0),
    mounted = useRef(false),
    starting = useRef(false);
  const update = useCallback(
    (id: string, change: (view: MissionView) => MissionView) =>
      setItems((current) =>
        current.map((item) =>
          item.kind === "mission" && item.id === id ? change(item) : item,
        ),
      ),
    [],
  );
  const attach = useCallback(
    (created: CreatedRun) => {
      closeStream.current?.();
      active.current = created;
      const version = generation.current;
      let checking = false;
      const valid = () =>
        mounted.current &&
        generation.current === version &&
        active.current?.run.id === created.run.id;
      closeStream.current = watchRun(
        created,
        (event) => {
          if (!valid()) return;
          update(created.run.id, (view) => applyRunEvent(view, event));
          if (
            ["run.completed", "run.failed", "run.cancelled"].includes(
              event.type,
            )
          )
            active.current = null;
        },
        () => {
          if (!valid()) return;
          update(created.run.id, (view) => ({
            ...view,
            connection: "reconnecting",
          }));
          // A GET can recover a terminal snapshot if the terminal SSE frame was
          // lost. It never creates/retries a model or search request.
          if (checking) return;
          checking = true;
          void getRun(created.run.id, created.accessToken)
            .then(({ run }) => {
              if (!valid()) return;
              if (ended(run.status)) {
                update(run.id, (view) => fromSnapshot(view, run));
                closeStream.current?.();
                active.current = null;
              }
            })
            .catch(() => {
              /* EventSource reconnects using its Last-Event-ID. */
            })
            .finally(() => {
              checking = false;
            });
        },
        () => {
          if (valid())
            update(created.run.id, (view) => ({
              ...view,
              connection: "connected",
            }));
        },
      );
    },
    [update],
  );
  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    const saved = remembered(storageKey);
    if (saved) {
      void getRun(saved.run.id, saved.accessToken)
        .then(({ run }) => {
          if (disposed) return;
          update(run.id, (view) => fromSnapshot(view, run));
          if (ended(run.status)) return;
          // Replay reconstructs the five contributions as well as the outcome.
          attach({ ...saved, run });
        })
        .catch((error) => {
          if (disposed) return;
          remember(null, storageKey);
          update(saved.run.id, (view) => ({
            ...view,
            status: "failed",
            error: (error as Error).message,
          }));
        });
    }
    return () => {
      disposed = true;
      mounted.current = false;
      closeStream.current?.();
    };
  }, [attach, update, storageKey]);

  const start = async (
    request: string,
    brief: Partial<Brief> = {},
    fixture = false,
  ) => {
    if (starting.current || active.current) return;
    starting.current = true;
    setBusy(true);
    remember(null, storageKey);
    const id = crypto.randomUUID(),
      version = generation.current;
    setItems((current) => [...current, { ...newMission(id, request), brief }]);
    try {
      const created = await createRun({
        request,
        ...brief,
        ...(fixture ? { mode: "fixture" as const } : {}),
      });
      if (!mounted.current || generation.current !== version) {
        await controlRun(created.run.id, created.accessToken, "cancel").catch(
          () => {},
        );
        return;
      }
      setItems((current) =>
        current.map((item) => (item.id === id ? fromCreated(created) : item)),
      );
      remember(created, storageKey);
      attach(created);
    } catch (error) {
      if (mounted.current && generation.current === version)
        update(id, (view) => ({
          ...view,
          status: "failed",
          error: (error as Error).message,
        }));
    } finally {
      starting.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const control = async (action: "pause" | "resume" | "cancel") => {
    const created = active.current;
    if (!created) return;
    setBusy(true);
    try {
      const { run } = await controlRun(
        created.run.id,
        created.accessToken,
        action,
      );
      if (mounted.current) update(run.id, (view) => fromSnapshot(view, run));
    } catch (error) {
      if (mounted.current)
        update(created.run.id, (view) => ({
          ...view,
          error: (error as Error).message,
        }));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const reset = async () => {
    if (starting.current) return;
    const created = active.current;
    if (created) {
      setBusy(true);
      try {
        await controlRun(created.run.id, created.accessToken, "cancel");
      } catch (error) {
        update(created.run.id, (view) => ({
          ...view,
          error: (error as Error).message,
        }));
        setBusy(false);
        return;
      }
    }
    generation.current++;
    closeStream.current?.();
    active.current = null;
    remember(null, storageKey);
    setItems([]);
    setBusy(false);
  };
  const say = (speaker: AgentId | "you", text: string) =>
    setItems((current) => [
      ...current,
      { kind: "message", id: crypto.randomUUID(), speaker, text },
    ]);
  const filterOpportunities = () =>
    setItems((current) =>
      current.map((item) =>
        item.kind === "mission" && item.outcome
          ? { ...item, onlyOpportunities: true }
          : item,
      ),
    );
  const lastMission = items.findLast(
    (item): item is MissionView => item.kind === "mission",
  );
  return {
    items,
    busy,
    lastMission,
    start,
    control,
    reset,
    say,
    filterOpportunities,
    hasActive: !!lastMission && !ended(lastMission.status),
  };
}
