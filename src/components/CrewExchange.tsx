import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import AgentSprite from "./AgentSprite";
import { Icon } from "./Icon";
import { crew } from "../data/crew";
import type { AgentId, MissionPhase } from "../data/crew";

const tasks: Record<AgentId, string> = {
  quil: "A few different perspectives. One clear answer.",
  pip: "Find matching businesses.",
  milo: "Look at websites and bookings.",
  iris: "Check the evidence.",
  wren: "Shape the first hello.",
};
const working: Partial<Record<MissionPhase, AgentId[]>> = {
  planning: ["quil"],
  discovering: ["pip"],
  investigating: ["milo", "iris"],
  reviewing: ["iris"],
  writing: ["wren"],
};
const order: AgentId[] = ["quil", "pip", "milo", "iris", "wren"];

export default function CrewExchange({
  id,
  request,
  phase,
  notes,
  complete,
  children,
}: {
  id: number;
  request: string;
  phase: MissionPhase;
  notes: Partial<Record<AgentId, string>>;
  complete: boolean;
  children: ReactNode;
}) {
  const map = useRef<HTMLDivElement>(null);
  const [connections, setConnections] = useState<{
    width: number;
    height: number;
    paths: { agent: AgentId; d: string; x: number; y: number }[];
  } | null>(null);

  useLayoutEffect(() => {
    const element = map.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      const endX = bounds.width / 2;
      const endY = bounds.height - 10;
      const paths = order.map((agent) => {
        const node = element.querySelector<HTMLElement>(
          `[data-agent="${agent}"]`,
        )!;
        const rect = node.getBoundingClientRect();
        const left = agent === "pip" || agent === "iris";
        const x =
          agent === "quil"
            ? rect.left - bounds.left + rect.width / 2
            : (left ? rect.right + 8 : rect.left - 8) - bounds.left;
        const y =
          agent === "quil"
            ? rect.bottom - bounds.top + 6
            : rect.top - bounds.top + 22;
        return {
          agent,
          x,
          y,
          d: `M${x},${y} C${endX},${y} ${endX},${endY - 38} ${endX},${endY}`,
        };
      });
      setConnections({ width: bounds.width, height: bounds.height, paths });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    element
      .querySelectorAll(".agent-contribution")
      .forEach((node) => observer.observe(node));
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [notes]);

  return (
    <section
      className={`crew-exchange${complete ? " exchange-complete" : ""}`}
      data-mission-id={id}
      aria-label="The crew's shared answer"
    >
      <div className="exchange-brief">
        <span>You asked</span>
        <p>{request}</p>
      </div>
      <p className="exchange-example">Fictional example · Manchester</p>
      <div className="collaboration-map" ref={map}>
        {connections && (
          <svg
            className="collaboration-lines"
            viewBox={`0 0 ${connections.width} ${connections.height}`}
            aria-hidden="true"
          >
            {connections.paths.map(({ agent, d, x, y }) => {
              const person = crew.find((p) => p.id === agent)!;
              const active = working[phase]?.includes(agent) && !complete;
              return (
                <g
                  key={agent}
                  style={{ color: person.color }}
                  className={active ? "connection-working" : ""}
                >
                  <path d={d} />
                  <circle cx={x} cy={y} r="1.6" />
                  {active && <path d={d} className="connection-signal" />}
                </g>
              );
            })}
          </svg>
        )}
        {order.map((agent) => {
          const person = crew.find((p) => p.id === agent)!;
          const active =
            !complete && (working[phase]?.includes(agent) ?? false);
          const ready = complete || (!!notes[agent] && !active);
          const text =
            agent === "quil" && complete
              ? "Findings checked. Over to you."
              : (notes[agent] ?? tasks[agent]);
          return (
            <article
              key={agent}
              className={`agent-contribution contribution-${agent}`}
              data-agent={agent}
              data-state={active ? "working" : ready ? "ready" : "waiting"}
              style={{ "--voice": person.color } as CSSProperties}
            >
              <AgentSprite
                agent={agent}
                mood={active ? "talking" : ready ? "happy" : "idle"}
              />
              <div>
                <div className="contribution-name">
                  <span>{person.name}</span>
                  {active ? (
                    <span className="contribution-pulse" aria-label="Working" />
                  ) : ready ? (
                    <Icon name="check" size={12} />
                  ) : null}
                </div>
                <p>{text}</p>
              </div>
            </article>
          );
        })}
        <div className="collaboration-joint" aria-hidden="true">
          <Icon name={complete ? "check" : "feather"} size={13} />
        </div>
      </div>
      {complete ? (
        <section className="shared-outcome" aria-label="Combined result">
          <div className="outcome-heading">
            <Icon name="feather" size={19} />
            <h2>Final answer</h2>
          </div>
          {children}
        </section>
      ) : (
        <p className="exchange-progress" role="status">
          {phase === "paused"
            ? "Paused. We’ll pick up here."
            : "Bringing the findings together"}
          {phase !== "paused" && (
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
