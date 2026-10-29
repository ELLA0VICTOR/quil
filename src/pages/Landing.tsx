import { lazy, Suspense, useCallback, useState } from "react";
import { Brand } from "../components/Shared";
import { Icon } from "../components/Icon";
import CrewScene from "../components/CrewScene";

const ParticleScene = lazy(() => import("../components/ParticleScene"));
const steps = [
  {
    number: "01",
    title: "Find the right businesses.",
    description: "A service. A place. A little direction for Pip to follow.",
  },
  {
    number: "02",
    title: "Look a little closer.",
    description: "Milo connects the details while Iris checks the evidence.",
  },
  {
    number: "03",
    title: "Question the first answer.",
    description: "A new finding can change the plan. That’s a good thing.",
  },
  {
    number: "04",
    title: "Make a thoughtful move.",
    description: "Wren finds the words. You decide when to say hello.",
  },
];

export default function Landing({
  openWorkspace,
}: {
  openWorkspace: () => void;
}) {
  const [phase, setPhase] = useState<"cube" | "tree">("cube"),
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
          className={`nav-pill${menu ? " mobile-nav-open" : ""}`}
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
          <a href="#the-crew" onClick={() => setMenu(false)}>
            The crew
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
                <span />
              </div>
            }
          >
            <ParticleScene onPhase={phaseChange} />
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
          <a
            className="hero-scroll"
            href="#how-it-works"
            aria-label="Scroll to meet the crew"
          >
            <span>THERE’S A LITTLE TEAM BEHIND THIS.</span>
            <Icon name="arrow" size={15} />
          </a>
          <div className="pointer-hint">
            <span /> MOVE TO EXPLORE
          </div>
        </section>
        <section className="warm-section content-section" id="how-it-works">
          <div className="section-topline">
            <span className="section-label">
              <span className="tiny-cross">+</span> FROM SIGNAL TO CONVERSATION
            </span>
            <span className="section-index">01 / A LITTLE TEAMWORK</span>
          </div>
          <div className="section-intro">
            <h2>
              A warmer way
              <br />
              to get started.
            </h2>
            <p>
              You bring the skill. Quil brings a few curious minds.
              <br />
              Tell the crew what you’re looking for, and watch
              <br className="desktop-break" /> them put their heads together.
            </p>
          </div>
          <div id="the-crew" className="landing-crew">
            <CrewScene variant="landing" />
          </div>
          <div className="journey-steps">
            {steps.map((step) => (
              <div className="journey-step" key={step.number}>
                <span>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="conversation-section content-section">
          <div className="section-topline">
            <span className="section-label">
              <span className="tiny-cross">+</span> A GOOD TEAM CHANGES ITS MIND
            </span>
            <span className="section-index">02 / THE LITTLE DETAILS</span>
          </div>
          <div className="conversation-layout">
            <div>
              <h2>
                A first impression.
                <br />A second opinion.
              </h2>
              <p>
                The first listing doesn’t tell the whole story.
                <br />
                That’s why the crew compares notes before
                <br className="desktop-break" /> Wren puts a word on the page.
              </p>
              <button className="text-link" onClick={openWorkspace}>
                Pull up a conversation <Icon name="arrow" size={17} />
              </button>
            </div>
            <div className="landing-exchange">
              <div>
                <span className="exchange-name">
                  Pip <i />
                </span>
                <p>
                  No website on this listing.
                  <br />
                  Could be an opportunity.
                </p>
              </div>
              <div>
                <span className="exchange-name iris-name">
                  Iris <i />
                </span>
                <p>
                  Hold on. There’s a matching site
                  <br />
                  in another source.
                </p>
              </div>
              <div>
                <span className="exchange-name quil-name">
                  Quil <i />
                </span>
                <p>Good catch. Let’s change the plan.</p>
              </div>
              <span className="exchange-caption">
                AN ILLUSTRATIVE CONVERSATION
              </span>
            </div>
          </div>
        </section>
      </main>
      <footer className="site-footer" id="footer">
        <div className="footer-top">
          <div>
            <span className="section-label">SOME GOOD THINGS START SMALL.</span>
            <h2>
              A little hello.
              <br />A new beginning.
            </h2>
            <button className="button button-blue" onClick={openWorkspace}>
              Say hello to Quil <Icon name="arrow-up" size={17} />
            </button>
          </div>
          <nav aria-label="Footer navigation">
            <span>TAKE A LOOK AROUND</span>
            <a href="#platform">
              The platform <Icon name="arrow-up" size={14} />
            </a>
            <a href="#how-it-works">
              How it works <Icon name="arrow-up" size={14} />
            </a>
            <a href="#the-crew">
              Meet the crew <Icon name="arrow-up" size={14} />
            </a>
            <button onClick={openWorkspace}>
              Open Quil <Icon name="arrow-up" size={14} />
            </button>
          </nav>
        </div>
        <div className="footer-bottom">
          <Brand />
          <span>Made for a thoughtful first move.</span>
          <a href="#platform">
            Back to the stars <Icon name="arrow-up" size={13} />
          </a>
          <span className="footer-year">2026</span>
        </div>
      </footer>
    </div>
  );
}
