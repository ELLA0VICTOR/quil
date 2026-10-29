import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { FormEvent, ReactNode } from "react";
import { Icon } from "./components/Icon";
import type { IconName } from "./components/Icon";
import type { SceneShape } from "./components/ParticleScene";
import { exampleEvents, exampleProspects } from "./data/example";
import type { Prospect } from "./data/example";
import "./App.css";

const ParticleScene = lazy(() => import("./components/ParticleScene"));

function Brand({
  compact = false,
  onClick,
}: {
  compact?: boolean;
  onClick?: () => void;
}) {
  return (
    <a
      className={`brand${compact ? " compact-brand" : ""}`}
      href="#"
      onClick={onClick}
      aria-label="Quil home"
    >
      <Icon name="feather" size={29} />
      <span>
        Quil<span className="brand-period">.</span>
      </span>
    </a>
  );
}

function Cursor() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      el.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
      el.classList.toggle(
        "cursor-over-control",
        Boolean(
          (e.target as Element).closest("button,a,input,textarea,select"),
        ),
      );
      el.classList.add("cursor-visible");
    };
    const leave = () => ref.current?.classList.remove("cursor-visible");
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
    };
  }, []);
  return (
    <div ref={ref} className="custom-cursor" aria-hidden="true">
      <i />
      <span />
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = ref.current;
    element?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && element) {
        const nodes = [
          ...element.querySelectorAll<HTMLElement>(
            'button,a[href],input,select,textarea,[tabindex="0"]',
          ),
        ].filter((x) => !x.hasAttribute("disabled"));
        const first = nodes[0],
          last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="glass modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-heading"
      >
        <div className="modal-heading">
          <h2 id="modal-heading">{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const features: {
  number: string;
  icon: IconName;
  title: string;
  description: string;
}[] = [
  {
    number: "01",
    icon: "search",
    title: "Find the right businesses",
    description:
      "Start with what you offer and where you want to work. Give your next search a direction.",
  },
  {
    number: "02",
    icon: "globe",
    title: "See the whole picture",
    description:
      "Bring business details, website signals and public sources into one clear view.",
  },
  {
    number: "03",
    icon: "shield",
    title: "A second pair of eyes",
    description:
      "Question weak signals. Cross-check the evidence. Keep uncertainty out in the open.",
  },
  {
    number: "04",
    icon: "feather",
    title: "Make a thoughtful move",
    description:
      "Turn a relevant finding into a personal introduction. You decide what happens next.",
  },
];

function Landing({ openWorkspace }: { openWorkspace: () => void }) {
  const [shape, setShape] = useState<SceneShape>("auto"),
    [paused, setPaused] = useState(false),
    [phase, setPhase] = useState<"cube" | "tree">("cube"),
    [menu, setMenu] = useState(false);
  const phaseChange = useCallback(
    (next: "cube" | "tree") => setPhase(next),
    [],
  );
  return (
    <div className="landing">
      <header className="site-header">
        <Brand />
        <nav
          className={`nav-pill glass${menu ? " mobile-nav-open" : ""}`}
          aria-label="Main navigation"
        >
          <a
            className="nav-current"
            href="#platform"
            onClick={() => setMenu(false)}
          >
            Platform
          </a>
          <a href="#how-it-works" onClick={() => setMenu(false)}>
            How it works
          </a>
          <a href="#the-agents" onClick={() => setMenu(false)}>
            The agents
          </a>
        </nav>
        <div className="header-actions">
          <button
            className="button button-blue header-cta"
            onClick={openWorkspace}
          >
            Try now <Icon name="arrow-up" size={15} />
          </button>
          <button
            className="icon-button mobile-menu-button"
            aria-label="Toggle navigation"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <Icon name={menu ? "close" : "menu"} />
          </button>
        </div>
      </header>
      <main>
        <section className="hero-section" id="platform">
          <div className="hero-atmosphere" aria-hidden="true" />
          <Suspense
            fallback={
              <div className="scene-loading">
                <span className="loading-orbit" />
              </div>
            }
          >
            <ParticleScene
              shape={shape}
              paused={paused}
              onPhase={phaseChange}
            />
          </Suspense>
          <div className="hero-copy">
            <span className="eyebrow">
              <i className="status-dot" /> A LITTLE SIGNAL. A NEW BEGINNING.
            </span>
            <h1>
              Your next client.
              <br />
              Already in sight.
            </h1>
          </div>
          <div className="hero-aside">
            <p>
              A little research goes a long way.
              <br />
              Meet the AI sales team that turns
              <br className="desktop-break" /> business signals into your next
              <br className="desktop-break" /> thoughtful introduction.
            </p>
            <button className="text-link" onClick={openWorkspace}>
              Find your next opportunity <Icon name="arrow" size={16} />
            </button>
          </div>
          <div className="scene-caption">
            <span className="tiny-cross">+</span>
            <span>
              {phase === "cube"
                ? "ONE BRIEF. A WORLD OF POSSIBILITY."
                : "GOOD CONNECTIONS GROW FROM HERE."}
            </span>
          </div>
          <div className="scene-controls glass" aria-label="Animation controls">
            <button
              className={shape === "auto" ? "selected" : ""}
              onClick={() => setShape("auto")}
              aria-pressed={shape === "auto"}
            >
              Auto
            </button>
            <button
              className={shape === "cube" ? "selected" : ""}
              onClick={() => setShape("cube")}
              aria-pressed={shape === "cube"}
            >
              Cube
            </button>
            <button
              className={shape === "tree" ? "selected" : ""}
              onClick={() => setShape("tree")}
              aria-pressed={shape === "tree"}
            >
              Tree
            </button>
            <span />
            <button
              className="pause-button"
              onClick={() => setPaused(!paused)}
              aria-label={paused ? "Play animation" : "Pause animation"}
              aria-pressed={paused}
            >
              <Icon name={paused ? "play" : "pause"} size={13} />
            </button>
          </div>
          <div className="pointer-hint">
            <span className="pointer-hint-dot" /> MOVE TO EXPLORE
          </div>
          <div className="feature-grid">
            {features.map((feature) => (
              <a
                className="feature-card glass"
                href="#how-it-works"
                key={feature.number}
              >
                <div className="feature-top">
                  <Icon name={feature.icon} size={19} />
                  <span>{feature.number}</span>
                </div>
                <div>
                  <h2>{feature.title}</h2>
                  <p>{feature.description}</p>
                </div>
                <Icon name="arrow-up" size={16} className="feature-arrow" />
              </a>
            ))}
          </div>
        </section>
        <section className="workflow-section content-section" id="how-it-works">
          <div className="section-topline">
            <span className="section-label">
              <span className="tiny-cross">+</span> FROM SIGNAL TO CONVERSATION
            </span>
            <span className="section-index">01 / THE WORKFLOW</span>
          </div>
          <div className="section-intro">
            <h2>
              A warmer way
              <br />
              to get started.
            </h2>
            <p>
              You bring the skill. Quil helps you find the businesses that could
              use it—and understand why before you say hello.
            </p>
          </div>
          <div className="workflow-grid">
            <div className="workflow-step">
              <span className="step-index">01</span>
              <div className="mini-brief glass">
                <span>
                  <Icon name="feather" size={15} /> YOUR BRIEF
                </span>
                <p>
                  I build websites for
                  <br />
                  <b>local cleaning businesses.</b>
                </p>
                <div>
                  <Icon name="pin" size={13} /> Manchester, UK
                </div>
              </div>
              <h3>Tell Quil what you do.</h3>
              <p>
                Choose a service, a type of business and a location. Start with
                a focused search.
              </p>
            </div>
            <div className="workflow-step">
              <span className="step-index">02</span>
              <div className="mini-agents">
                <span className="agent-chip chip-blue">
                  <Icon name="search" size={14} /> Scout <i />
                </span>
                <span className="agent-chip chip-violet">
                  <Icon name="globe" size={14} /> Researcher <i />
                </span>
                <span className="agent-chip chip-cyan">
                  <Icon name="target" size={14} /> Website analyst <i />
                </span>
                <span className="agent-chip chip-green">
                  <Icon name="shield" size={14} /> Reviewer <i />
                </span>
                <div className="mini-connection" aria-hidden="true" />
              </div>
              <h3>Let a team look closer.</h3>
              <p>
                Agents investigate from different angles, exchange findings and
                challenge assumptions.
              </p>
            </div>
            <div className="workflow-step">
              <span className="step-index">03</span>
              <div className="mini-draft glass">
                <span>
                  <i className="status-dot" /> READY FOR YOUR REVIEW
                </span>
                <p>
                  Hi Fern & Co. team,
                  <br />
                  <span>
                    I had an idea to make booking
                    <br />a little easier for your customers…
                  </span>
                </p>
                <div>
                  <Icon name="check" size={13} /> You make the final call{" "}
                  <span>ILLUSTRATIVE</span>
                </div>
              </div>
              <h3>Make it personal.</h3>
              <p>
                Review the evidence, shape the introduction and save the
                opportunities worth pursuing.
              </p>
            </div>
          </div>
          <div className="workflow-bottom">
            <p>A focused workflow. Your judgement at the center.</p>
            <button className="text-link" onClick={openWorkspace}>
              Explore the workspace <Icon name="arrow" size={17} />
            </button>
          </div>
        </section>
        <section className="agents-section content-section" id="the-agents">
          <div className="section-topline">
            <span className="section-label">
              <span className="tiny-cross">+</span> DIFFERENT PERSPECTIVES.
              SHARED CONTEXT.
            </span>
            <span className="section-index">02 / THE TEAM</span>
          </div>
          <div className="agents-layout">
            <div className="agents-copy">
              <span className="eyebrow subdued">
                <Icon name="layers" size={14} /> BUILT AROUND MOZAIK
              </span>
              <h2>
                Better together.
                <br />
                By design.
              </h2>
              <p>
                One finding can change the whole conversation. Quil’s team is
                designed to share evidence, question an early conclusion and
                refine the next step.
              </p>
              <button className="button button-outline" onClick={openWorkspace}>
                Meet your team <Icon name="arrow" size={16} />
              </button>
            </div>
            <div className="collaboration glass">
              <div className="collaboration-header">
                <span>
                  <i className="status-dot" /> A LOOK INSIDE A RUN
                </span>
                <span>ILLUSTRATIVE EXAMPLE</span>
              </div>
              <div className="collab-line">
                <span className="agent-avatar blue">
                  <Icon name="search" size={17} />
                </span>
                <div>
                  <b>Scout</b>
                  <p>No website appears on this business listing.</p>
                </div>
                <span>01</span>
              </div>
              <div className="collab-line">
                <span className="agent-avatar cyan">
                  <Icon name="target" size={17} />
                </span>
                <div>
                  <b>Website analyst</b>
                  <p>A second search found a matching website.</p>
                  <span className="evidence-tag">
                    <Icon name="globe" size={11} /> New evidence shared
                  </span>
                </div>
                <span>02</span>
              </div>
              <div className="collab-line">
                <span className="agent-avatar green">
                  <Icon name="shield" size={17} />
                </span>
                <div>
                  <b>Reviewer</b>
                  <p>
                    Withdraw the “no website” pitch. Investigate a specific need
                    first.
                  </p>
                  <span className="review-tag">
                    <Icon name="check" size={11} /> Conclusion updated
                  </span>
                </div>
                <span>03</span>
              </div>
              <div className="collab-footer">
                <Icon name="layers" size={14} />
                <span>Independent work. A shared understanding.</span>
              </div>
            </div>
          </div>
        </section>
        <section className="closing-section">
          <div className="closing-orbit" aria-hidden="true" />
          <span className="eyebrow">
            <i className="status-dot" /> START WITH A LITTLE CURIOSITY
          </span>
          <h2>
            There’s a good
            <br />
            connection out there.
          </h2>
          <button className="button button-blue" onClick={openWorkspace}>
            Let’s find it <Icon name="arrow-up" size={17} />
          </button>
        </section>
      </main>
      <footer className="site-footer">
        <Brand compact />
        <span>A thoughtful first move.</span>
        <a href="#platform">
          Back to the stars <Icon name="arrow-up" size={13} />
        </a>
      </footer>
    </div>
  );
}

type Tab = "discover" | "saved" | "activity";
function Workspace({ goHome }: { goHome: () => void }) {
  const [tab, setTab] = useState<Tab>("discover"),
    [modal, setModal] = useState<"connections" | "about" | null>(null),
    [selected, setSelected] = useState<Prospect | null>(null);
  const [hasExample, setHasExample] = useState(false),
    [running, setRunning] = useState(false),
    [eventCount, setEventCount] = useState(0),
    [filter, setFilter] = useState("All prospects"),
    [query, setQuery] = useState(""),
    [toast, setToast] = useState(""),
    [draft, setDraft] = useState("");
  const [offer, setOffer] = useState("I build websites for local businesses"),
    [location, setLocation] = useState("Manchester, UK"),
    [industry, setIndustry] = useState("Cleaning services"),
    [formError, setFormError] = useState("");
  const [saved, setSaved] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem("quil:saved") || "[]",
      );
      return Array.isArray(value)
        ? value.filter((id): id is string => typeof id === "string")
        : [];
    } catch {
      return [];
    }
  });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem("quil:saved", JSON.stringify(saved));
    } catch {
      /* Storage may be unavailable in private sessions. */
    }
  }, [saved]);
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  };
  const toggleSave = (id: string) =>
    setSaved((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  const closeModal = useCallback(() => setModal(null), []),
    closeDetail = useCallback(() => setSelected(null), []);
  const preview = () => {
    timers.current.forEach(clearTimeout);
    setHasExample(true);
    setRunning(true);
    setEventCount(0);
    setTab("discover");
    setFilter("All prospects");
    exampleEvents.forEach((_, i) => {
      timers.current.push(
        setTimeout(() => setEventCount(i + 1), 450 + i * 650),
      );
    });
    timers.current.push(
      setTimeout(() => {
        setRunning(false);
        notify("Example run complete. No API credits used.");
      }, 3900),
    );
  };
  const startResearch = (event: FormEvent) => {
    event.preventDefault();
    if (!offer.trim() || !location.trim()) {
      setFormError("Add what you offer and a location to continue.");
      return;
    }
    setFormError("");
    setModal("connections");
  };
  const showDetail = (prospect: Prospect) => {
    setSelected(prospect);
    setDraft(prospect.draft);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      notify("Introduction copied. Give it your own finishing touch.");
    } catch {
      notify("Clipboard unavailable. You can select and copy the draft text.");
    }
  };
  const exportSaved = () => {
    const rows = [
      ["Business", "Category", "Location", "Signal", "Example data"],
      ...exampleProspects
        .filter((p) => saved.includes(p.id))
        .map((p) => [
          p.name,
          p.category,
          p.location,
          p.signal,
          "Fictional UI example",
        ]),
    ];
    const csv = rows
        .map((row) =>
          row.map((cell) => '"' + cell.replaceAll('"', '""') + '"').join(","),
        )
        .join("\r\n"),
      url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8;" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "quil-saved-examples.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Saved examples exported.");
  };
  const base =
    tab === "saved"
      ? exampleProspects.filter((p) => saved.includes(p.id))
      : hasExample
        ? exampleProspects
        : [];
  const prospects = base.filter(
    (p) =>
      (filter === "All prospects" ||
        (filter === "Opportunities" && p.status === "Opportunity") ||
        (filter === "Needs review" && p.status === "Needs a closer look")) &&
      `${p.name} ${p.category} ${p.signal}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="workspace">
      <aside className="workspace-sidebar">
        <Brand onClick={goHome} />
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Workspace">
          <button
            className={tab === "discover" ? "active" : ""}
            onClick={() => setTab("discover")}
          >
            <Icon name="search" size={18} /> Discover{" "}
            <span className="nav-shortcut">01</span>
          </button>
          <button
            className={tab === "saved" ? "active" : ""}
            onClick={() => setTab("saved")}
          >
            <Icon name="bookmark" size={18} /> Saved{" "}
            <span className="count-pill">{saved.length}</span>
          </button>
          <button
            className={tab === "activity" ? "active" : ""}
            onClick={() => setTab("activity")}
          >
            <Icon name="layers" size={18} /> Agent activity
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="small-feather">
            <Icon name="feather" size={23} />
          </span>
          <p>
            A thoughtful first move
            <br />
            starts right here.
          </p>
          <span className="fine-text">A little signal. A new beginning.</span>
        </div>
        <div className="sidebar-bottom">
          <button onClick={() => setModal("connections")}>
            <Icon name="settings" size={17} />
            <span>
              Connections<small>Setup needed</small>
            </span>
            <i className="connection-dot" />
          </button>
          <button className="sidebar-home" onClick={goHome}>
            <Icon name="back" size={15} /> Back to Quil
          </button>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-header">
          <div>
            <span>Workspace</span>
            <span className="breadcrumb-slash">/</span>
            <b>
              {tab === "discover"
                ? "Discover"
                : tab === "saved"
                  ? "Saved opportunities"
                  : "Agent activity"}
            </b>
          </div>
          <div className="workspace-header-right">
            <span className="preview-pill">
              <i /> Interactive preview
            </span>
            <button
              className="avatar-button"
              onClick={() => setModal("about")}
              aria-label="About Quil"
            >
              Q
            </button>
          </div>
        </header>
        <main
          className="workspace-content"
          id="workspace-content"
          tabIndex={-1}
        >
          <div className="workspace-title">
            <div>
              <span className="eyebrow subdued">
                {tab === "discover"
                  ? "A LITTLE CURIOSITY GOES A LONG WAY"
                  : tab === "saved"
                    ? "KEEP THE GOOD CONNECTIONS CLOSE"
                    : "A SHARED UNDERSTANDING"}
              </span>
              <h1>
                {tab === "discover"
                  ? "Find your next beginning."
                  : tab === "saved"
                    ? "Worth a closer look."
                    : "See how the team thinks."}
              </h1>
              <p>
                {tab === "discover"
                  ? "A focused brief. A fresh perspective. Your next opportunity."
                  : tab === "saved"
                    ? "The businesses you’ve saved, ready when you are."
                    : "Follow the findings, the questions and the changes of direction."}
              </p>
            </div>
            {tab === "saved" && saved.length > 0 ? (
              <button className="button button-outline" onClick={exportSaved}>
                <Icon name="download" size={16} /> Export saved
              </button>
            ) : (
              <button
                className="button button-outline small-button"
                onClick={() => setModal("connections")}
              >
                <Icon name="settings" size={16} /> Connections
              </button>
            )}
          </div>
          <div className="example-banner">
            <Icon name="spark" size={16} />
            <p>
              <b>Explore Quil’s first interface.</b> Example runs use fictional
              businesses. Live search and model access aren’t connected yet.
            </p>
            <button onClick={preview} disabled={running}>
              {running ? "Playing example…" : "Try an example"}
              <Icon name="arrow" size={15} />
            </button>
          </div>
          {tab === "discover" && (
            <div className="research-layout">
              <section className="search-panel glass">
                <div className="panel-heading">
                  <span className="square-icon">
                    <Icon name="feather" size={18} />
                  </span>
                  <div>
                    <h2>Your next search</h2>
                    <p>Start with what you do best.</p>
                  </div>
                  <span className="panel-number">01</span>
                </div>
                <form onSubmit={startResearch}>
                  <label htmlFor="offer">What do you offer?</label>
                  <textarea
                    id="offer"
                    value={offer}
                    onChange={(e) => setOffer(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="I build websites for local businesses"
                  />
                  <label htmlFor="industry">Who would you like to help?</label>
                  <div className="select-wrap">
                    <select
                      id="industry"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                    >
                      <option>Cleaning services</option>
                      <option>Home repair & trades</option>
                      <option>Independent restaurants</option>
                      <option>Health & fitness studios</option>
                      <option>Other local businesses</option>
                    </select>
                    <Icon name="chevron" size={15} />
                  </div>
                  <label htmlFor="location">Where should we look?</label>
                  <div className="input-with-icon">
                    <Icon name="pin" size={16} />
                    <input
                      id="location"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      maxLength={120}
                      placeholder="City, country"
                    />
                  </div>
                  <div className="search-scope">
                    <Icon name="target" size={15} />
                    <span>
                      A focused batch of <b>5 businesses</b>
                    </span>
                  </div>
                  {formError && (
                    <p className="form-error" role="alert">
                      {formError}
                    </p>
                  )}
                  <button
                    className="button button-blue full-button"
                    type="submit"
                  >
                    Find opportunities <Icon name="arrow" size={17} />
                  </button>
                  <button
                    className="example-button"
                    type="button"
                    onClick={preview}
                    disabled={running}
                  >
                    <Icon name="play" size={12} />
                    {running
                      ? "Playing example run…"
                      : "Or explore a sample run"}
                  </button>
                </form>
                <div className="search-panel-footer">
                  <Icon name="shield" size={14} />
                  <p>
                    You review every introduction.
                    <br />
                    Nothing is sent from this preview.
                  </p>
                </div>
              </section>
              <div className="results-column">
                <div className="results-heading">
                  <div>
                    <h2>Your discoveries</h2>
                    <span>
                      {hasExample
                        ? "3 example businesses"
                        : "A clear view starts here"}
                    </span>
                  </div>
                  {hasExample && (
                    <span className="example-tag">EXAMPLE DATA</span>
                  )}
                </div>
                {hasExample ? (
                  <>
                    <div className="results-toolbar">
                      <div className="filter-wrap">
                        <select
                          aria-label="Filter discoveries"
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                        >
                          <option>All prospects</option>
                          <option>Opportunities</option>
                          <option>Needs review</option>
                        </select>
                        <Icon name="chevron" size={13} />
                      </div>
                      <div className="result-search">
                        <Icon name="search" size={15} />
                        <input
                          placeholder="Find a business"
                          aria-label="Search discoveries"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </div>
                    </div>
                    {running ? (
                      <div className="research-running glass">
                        <div className="running-orbit">
                          <Icon name="feather" size={30} />
                        </div>
                        <h3>A few different perspectives.</h3>
                        <p>Playing the illustrative team workflow.</p>
                        <div className="run-progress">
                          <span
                            style={{
                              width: `${(eventCount / exampleEvents.length) * 100}%`,
                            }}
                          />
                        </div>
                        <span>
                          {eventCount} / {exampleEvents.length} example steps
                        </span>
                      </div>
                    ) : (
                      <div className="prospect-list">
                        {prospects.map((prospect) => (
                          <ProspectCard
                            key={prospect.id}
                            prospect={prospect}
                            saved={saved.includes(prospect.id)}
                            onSave={() => toggleSave(prospect.id)}
                            onOpen={() => showDetail(prospect)}
                          />
                        ))}
                        {!prospects.length && (
                          <div className="small-empty">
                            <Icon name="search" />
                            <p>No examples match this filter.</p>
                            <button
                              className="text-link"
                              onClick={() => {
                                setFilter("All prospects");
                                setQuery("");
                              }}
                            >
                              Clear filters <Icon name="arrow" size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="discovery-empty glass">
                    <div className="empty-constellation" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                      <Icon name="feather" size={40} />
                    </div>
                    <span className="eyebrow subdued">
                      A WORLD OF POSSIBILITY
                    </span>
                    <h2>
                      Your next connection
                      <br />
                      is out there.
                    </h2>
                    <p>
                      Set a direction on the left, or take a look
                      <br />
                      around with an example search.
                    </p>
                    <button className="button button-outline" onClick={preview}>
                      Explore an example <Icon name="arrow" size={16} />
                    </button>
                    <span className="fine-text">
                      Fictional businesses. Real interactions. No API spend.
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
          {tab === "saved" && (
            <section className="saved-section">
              {saved.length > 0 ? (
                <div className="saved-grid">
                  {prospects.map((prospect) => (
                    <ProspectCard
                      key={prospect.id}
                      prospect={prospect}
                      saved={true}
                      onSave={() => toggleSave(prospect.id)}
                      onOpen={() => showDetail(prospect)}
                    />
                  ))}
                </div>
              ) : (
                <div className="saved-empty glass">
                  <Icon name="bookmark" size={36} />
                  <h2>Keep a little possibility.</h2>
                  <p>
                    Save a business from Discover and it will be waiting here.
                  </p>
                  <button
                    className="button button-blue"
                    onClick={() => setTab("discover")}
                  >
                    Explore Discover <Icon name="arrow" size={16} />
                  </button>
                </div>
              )}
            </section>
          )}
          <section
            className={`activity-panel glass${tab === "activity" ? " activity-full" : ""}`}
          >
            <div className="activity-heading">
              <div>
                <span className="square-icon">
                  <Icon name="layers" size={17} />
                </span>
                <div>
                  <h2>Your team, in the open</h2>
                  <p>
                    {hasExample
                      ? "Illustrative activity · no live model calls"
                      : "Discoveries make more sense with context."}
                  </p>
                </div>
              </div>
              <span className="activity-status">
                <i className={running ? "pulse" : ""} />
                {running
                  ? "Example running"
                  : hasExample
                    ? "Example complete"
                    : "Ready to explore"}
              </span>
            </div>
            {hasExample ? (
              <div className="activity-events" aria-live="polite">
                {exampleEvents.slice(0, eventCount).map((event, i) => (
                  <div className="activity-event" key={event.agent}>
                    <span className={`agent-avatar ${event.color}`}>
                      <Icon name={event.icon} size={15} />
                    </span>
                    <b>{event.agent}</b>
                    <p>{event.text}</p>
                    <span className="event-time">{event.time}</span>
                    <span className="event-index">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="activity-idle">
                <div className="idle-agent-stack">
                  <span className="agent-avatar blue">
                    <Icon name="search" size={16} />
                  </span>
                  <span className="agent-avatar violet">
                    <Icon name="globe" size={16} />
                  </span>
                  <span className="agent-avatar cyan">
                    <Icon name="target" size={16} />
                  </span>
                  <span className="agent-avatar green">
                    <Icon name="shield" size={16} />
                  </span>
                </div>
                <p>
                  A place for every finding, cross-check and change of mind.
                </p>
                <button className="text-link" onClick={preview}>
                  Preview the team <Icon name="arrow" size={14} />
                </button>
              </div>
            )}
            <div className="activity-bottom">
              <span>
                <Icon name="clock" size={12} />{" "}
                {hasExample ? "Example timeline" : "Run history appears here"}
              </span>
              <span>
                Mozaik integration planned <i>·</i> GPT-6 Luna selected
              </span>
            </div>
          </section>
          <footer className="workspace-footer">
            <span>
              <Icon name="feather" size={14} /> Quil · A thoughtful first move.
            </span>
            <button onClick={() => setModal("about")}>
              About this preview <Icon name="arrow-up" size={12} />
            </button>
          </footer>
        </main>
      </div>
      {modal && (
        <Modal
          title={
            modal === "connections"
              ? "A little setup, then we’re off."
              : "A thoughtful first move."
          }
          onClose={closeModal}
        >
          {modal === "connections" ? (
            <>
              <p className="modal-description">
                This build is the frontend preview. Live business research needs
                a server-side connection to the services below.
              </p>
              <div className="connection-card">
                <span className="connection-logo">S</span>
                <div>
                  <b>Serper</b>
                  <p>Business discovery and web search</p>
                </div>
                <span className="connection-state">Not connected</span>
              </div>
              <div className="connection-card">
                <span className="connection-logo openai-logo">
                  <Icon name="spark" size={22} />
                </span>
                <div>
                  <b>OpenAI · GPT-6 Luna</b>
                  <p>Research, review and introduction drafts</p>
                </div>
                <span className="connection-state">Not connected</span>
              </div>
              <div className="connection-note">
                <Icon name="shield" size={18} />
                <p>
                  API keys belong on the server. This interface doesn’t ask for
                  or store your credentials. Spending limits will be enforced
                  with the live integration.
                </p>
              </div>
              <button
                className="button button-blue full-button"
                onClick={() => {
                  setModal(null);
                  preview();
                }}
              >
                Explore the example instead <Icon name="arrow" size={16} />
              </button>
            </>
          ) : (
            <>
              <div className="about-brand">
                <Icon name="feather" size={48} />
                <span>Quil.</span>
              </div>
              <p className="modal-description">
                A sales workspace for finding relevant businesses, understanding
                their needs and making a thoughtful introduction.
              </p>
              <p className="modal-description">
                This first build establishes the visual experience. Its example
                businesses, evidence and agent timeline are fictional. Live
                Mozaik agents, search and GPT requests are the next integration
                stage.
              </p>
              <div className="about-stack">
                <span>React + TypeScript</span>
                <span>Interactive WebGL</span>
                <span>Local saved examples</span>
              </div>
            </>
          )}
        </Modal>
      )}
      {selected && (
        <Modal title={selected.name} onClose={closeDetail}>
          <div className="detail-meta">
            <span
              className={`prospect-status ${selected.status === "Opportunity" ? "opportunity" : selected.status === "Website found" ? "website-found" : "needs-review"}`}
            >
              <i />
              {selected.status}
            </span>
            <span>Fictional example</span>
          </div>
          <div className="detail-tabs">
            <Icon name="globe" size={16} />
            <b>The evidence</b>
            <span>{selected.sources.length} example sources</span>
          </div>
          <div className="evidence-list">
            {selected.sources.map((source, i) => (
              <div className="evidence-item" key={source.title}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <b>{source.title}</b>
                  <small>{source.kind} · Illustrative record</small>
                  <p>{source.observation}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="draft-heading">
            <h3>
              <Icon name="feather" size={17} /> Your introduction
            </h3>
            <span>
              {selected.status === "Website found"
                ? "WITHDRAWN IN EXAMPLE"
                : "EDIT BEFORE USING"}
            </span>
          </div>
          <textarea
            className="draft-textarea"
            aria-label="Edit introduction"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={9}
          />
          <div className="draft-actions">
            <button
              className="button button-outline"
              onClick={() => toggleSave(selected.id)}
            >
              <Icon
                name={saved.includes(selected.id) ? "check" : "bookmark"}
                size={15}
              />
              {saved.includes(selected.id) ? "Saved" : "Save opportunity"}
            </button>
            <button className="button button-blue" onClick={copy}>
              <Icon name="copy" size={15} /> Copy draft
            </button>
          </div>
          <p className="detail-disclaimer">
            Illustrative draft for a fictional business. No message is sent.
          </p>
        </Modal>
      )}
      {toast && (
        <div className="toast glass" role="status">
          <Icon name="check" size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}

function ProspectCard({
  prospect,
  saved,
  onSave,
  onOpen,
}: {
  prospect: Prospect;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
}) {
  return (
    <article className="prospect-card glass">
      <div className="prospect-card-top">
        <span
          className="business-avatar"
          style={{
            color: prospect.color,
            background: `${prospect.color}13`,
            borderColor: `${prospect.color}30`,
          }}
        >
          {prospect.initials}
        </span>
        <div>
          <h3>{prospect.name}</h3>
          <p>
            {prospect.category}
            <span>·</span>
            {prospect.location}
          </p>
        </div>
        <button
          className={`icon-button save-button${saved ? " is-saved" : ""}`}
          onClick={onSave}
          aria-label={`${saved ? "Unsave" : "Save"} ${prospect.name}`}
          aria-pressed={saved}
        >
          <Icon name={saved ? "check" : "bookmark"} size={17} />
        </button>
      </div>
      <span
        className={`prospect-status ${prospect.status === "Opportunity" ? "opportunity" : prospect.status === "Website found" ? "website-found" : "needs-review"}`}
      >
        <i />
        {prospect.status}
      </span>
      <p className="prospect-note">{prospect.note}</p>
      <div className="prospect-card-bottom">
        <span>
          <Icon name="file" size={12} />
          {prospect.sources.length} example sources
        </span>
        <button className="text-link" onClick={onOpen}>
          Review opportunity <Icon name="arrow-up" size={14} />
        </button>
      </div>
    </article>
  );
}

export default function App() {
  const [workspace, setWorkspace] = useState(() =>
    window.location.hash.startsWith("#/workspace"),
  );
  useEffect(() => {
    const change = () => {
      const next = window.location.hash.startsWith("#/workspace");
      setWorkspace(next);
      if (next) window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const openWorkspace = () => {
    window.location.hash = "/workspace";
    window.scrollTo(0, 0);
  };
  const goHome = () => {
    window.location.hash = "";
    setWorkspace(false);
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    document.title = workspace
      ? "Workspace · Quil"
      : "Quil — Your next client. Already in sight.";
  }, [workspace]);
  return (
    <>
      <a
        className="skip-link"
        href={workspace ? "#workspace-content" : "#platform"}
        onClick={
          workspace
            ? (event) => {
                event.preventDefault();
                document
                  .querySelector<HTMLElement>(".workspace-content")
                  ?.focus();
              }
            : undefined
        }
      >
        Skip to content
      </a>
      {workspace ? (
        <Workspace goHome={goHome} />
      ) : (
        <Landing openWorkspace={openWorkspace} />
      )}
      <Cursor />
    </>
  );
}
