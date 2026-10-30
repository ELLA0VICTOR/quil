import type { CSSProperties, ReactNode } from "react";
import { crew } from "../data/crew";
import type { AgentId } from "../data/crew";
import { phaseFor } from "../lib/run-view";
import type { MissionView } from "../lib/run-view";
import AgentSprite from "./AgentSprite";
import { Icon } from "./Icon";

const tasks = {
  pip: "Find matching businesses.",
  milo: "Investigate websites.",
  quil: "Coordinate the crew.",
  iris: "Check the evidence.",
  wren: "Prepare the offer.",
};
export default function CrewActivity({
  mission,
  controls,
  onMeet,
}: {
  mission: MissionView;
  controls?: ReactNode;
  onMeet: (agent: AgentId) => void;
}) {
  const phase = phaseFor(mission);
  const running = mission.status === "running" && mission.connection === "connected";
  const label =
    mission.connection === "reconnecting"
      ? "Reconnecting to your search…"
      : mission.status === "completed"
        ? "The crew’s findings"
        : mission.status === "paused"
          ? "Paused"
          : mission.status === "failed"
            ? "The search needs another try"
            : mission.status === "cancelled"
              ? "Search cancelled"
              : "Your crew, working together";
  return (
    <section
      className={`crew-activity-live phase-${phase}`}
      data-phase={phase}
      data-status={mission.status}
      aria-label="Live crew activity"
    >
      <div className="crew-live-heading">
        <span>
          <i className={running ? "crew-live-pulse" : ""} />
          {label}
        </span>
        {controls}
      </div>
      <div className="collaboration-map crew-live-map">
        <svg
          className="collaboration-lines"
          viewBox="0 0 1000 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {crew.map((person, index) => {
            const x = index * 200 + 100;
            const active = running && mission.activity[person.id] === "working";
            const path = `M${x} 28 Q${x} 65 500 80`;
            return (
              <g
                key={person.id}
                className={active ? "connection-working" : ""}
                style={{ color: person.color }}
              >
                <path d={path} />
                <circle cx={x} cy="28" r="1.6" />
                {active && <path d={path} className="connection-signal" />}
              </g>
            );
          })}
        </svg>
        {crew.map((person) => {
          const state = mission.activity[person.id] ?? "waiting";
          const active = running && state === "working";
          const note = mission.notes[person.id] ?? tasks[person.id];
          return (
            <article
              key={person.id}
              className={`agent-contribution contribution-${person.id}`}
              data-agent={person.id}
              data-state={active ? "working" : state === "working" ? "waiting" : state}
              style={{ "--voice": person.color } as CSSProperties}
            >
              <button
                className="crew-live-person"
                type="button"
                title={`${person.name}: ${note}`}
                aria-label={`${person.name}: ${note}`}
                onClick={() => onMeet(person.id)}
              >
                <AgentSprite
                  agent={person.id}
                  mood={active ? "talking" : state === "ready" ? "happy" : "idle"}
                />
                <span className="contribution-name">
                  {person.name}
                  {active ? (
                    <i className="contribution-pulse" aria-label="Working" />
                  ) : state === "ready" ? (
                    <Icon name="check" size={10} />
                  ) : null}
                </span>
              </button>
              <p title={note}>{note}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
