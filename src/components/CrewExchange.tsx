import type { ReactNode } from "react";
import { Icon } from "./Icon";
import type { MissionPhase } from "../data/crew";
import type { MissionView } from "../lib/run-view";

export default function CrewExchange({
  id,
  request,
  phase,
  complete,
  children,
  mode,
  location,
  status,
  connection,
}: {
  id: number | string;
  request: string;
  phase: MissionPhase;
  complete: boolean;
  children: ReactNode;
  mode: MissionView["mode"];
  location: string;
  status: MissionView["status"];
  connection: MissionView["connection"];
}) {
  return (
    <section
      className={`crew-exchange${complete ? " exchange-complete" : ""}`}
      data-mission-id={id}
      data-phase={phase}
      data-status={status}
      aria-label="The crew's shared answer"
    >
      <div className="exchange-brief" aria-label="Your request">
        <p>{request}</p>
      </div>
      <p className="exchange-example">
        {mode === "fixture"
          ? `Fictional example · ${location}`
          : mode === "live"
            ? location
            : "Connecting to Quil"}
      </p>
      {complete ? (
        <section className="shared-outcome" aria-label="Combined result">
          <div className="outcome-heading">
            <Icon name="feather" size={19} />
            <h2>Quil</h2>
          </div>
          {children}
        </section>
      ) : (
        <p className="exchange-progress" role="status">
          {status === "failed"
            ? "The search couldn’t finish."
            : status === "cancelled"
              ? "Search cancelled."
              : connection === "reconnecting"
                ? "Reconnecting to the same search…"
                : status === "paused"
                  ? "Paused. We’ll pick up here."
                  : "The crew is on it."}
          {status === "running" && connection === "connected" && (
            <span className="progress-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          )}
        </p>
      )}
    </section>
  );
}
