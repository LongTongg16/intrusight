import { Link } from "react-router-dom";
import PublicNavbar from "../../components/PublicNavbar";
import "./public.css";

const TECH_STACK = [
  { group: "Frontend", items: ["React", "Vite", "React Router", "Recharts", "Leaflet"] },
  { group: "Backend",  items: ["FastAPI", "Python", "MongoDB"] },
  { group: "Engines",  items: ["Suricata", "Snort", "Zeek", "Kismet"] },
];

const PROBLEMS = [
  "Each detection engine writes its own log format, in its own location, with its own severity scheme.",
  "Comparing what Suricata and Zeek said about the same host means reading two unrelated files.",
  "Triage decisions and the reasoning behind them end up in notebooks and chat, not next to the alert.",
  "Producing a written record of an investigation is a manual copy-and-paste exercise.",
];

const RESPONSES = [
  "One ingest endpoint and one normalized alert schema shared by all four engines.",
  "A single queue where the producing engine is a column you can filter and sort on.",
  "Notes and triage status stored against the alert itself.",
  "CSV and PDF export of whatever alert set is currently on screen.",
];

const FLOW = [
  {
    title: "Detection engines",
    text: "Suricata, Snort, Zeek and Kismet run where they already run, and keep writing their own logs.",
  },
  {
    title: "Ingestion scripts",
    text: "Per-engine parsers read those files, map each record onto the shared schema, and POST it to the API with an ingest key.",
  },
  {
    title: "API and store",
    text: "FastAPI validates and persists each alert in MongoDB, adds a severity label, an initial status of new, and a best-effort geolocation lookup.",
  },
];

const CAPABILITIES = [
  {
    title: "Alert review",
    text: "Filter by severity and status server-side; search address, port, protocol and signature client-side; open any alert for full detail.",
  },
  {
    title: "Traffic log view",
    text: "Browse the stored records with the producing engine shown alongside each entry.",
  },
  {
    title: "Investigation tracking",
    text: "Attach notes to an alert and move it through new, investigating and resolved.",
  },
  {
    title: "Reporting",
    text: "Export the filtered alert set as CSV, or render a PDF report for a write-up.",
  },
];

function About() {
  return (
    <div className="p-page">
      <PublicNavbar />

      <main className="p-main">
        <section className="p-shell p-hero">
          <div className="p-hero__body">
            <p className="p-badge">
              <span className="p-badge__dot" aria-hidden="true" />
              Final year project
            </p>

            <h1 className="p-h1">
              Why a normalization layer{" "}
              <span className="p-accent-text">between engines and analysts</span>
            </h1>

            <p className="p-lede">
              IntruSight was built to study how alert triage actually works when
              more than one detection engine is deployed, and to make that
              workflow observable in a single interface.
            </p>

            <div className="p-hero__actions">
              <Link to="/demo" className="p-btn p-btn--primary">
                Explore the demo
              </Link>
              <Link to="/features" className="p-btn p-btn--tertiary">
                See the feature list
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h13M13 6l6 6-6 6" />
                </svg>
              </Link>
            </div>
          </div>

          <div className="p-preview">
            <div style={{ padding: "var(--p-s5)" }}>
              <h2 className="p-h3">Scope of the project</h2>
              <p className="p-body" style={{ marginBottom: "var(--p-s3)" }}>
                IntruSight sits downstream of detection. It does not observe the
                network itself.
              </p>
              <ul className="p-scope__list p-scope__list--yes">
                <li>Receives alerts and events already produced by the engines</li>
                <li>Normalizes, stores, filters and annotates them</li>
                <li>Does not capture packets or inspect live traffic</li>
                <li>Does not author or tune detection rules</li>
                <li>Is not a SIEM and is not production-verified</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="p-band" aria-labelledby="problem-heading">
          <div className="p-shell p-section">
          <div className="p-section__head">
            <div>
              <span className="p-eyebrow">Motivation</span>
              <h2 id="problem-heading" className="p-h2">
                The problem it addresses
              </h2>
            </div>
            <p className="p-body">
              Running several engines gives better coverage than any one of them
              alone. It also multiplies the number of places an analyst has to
              look.
            </p>
          </div>

          <div className="p-scope">
            <div className="p-panel">
              <h3 className="p-h3">Observed friction</h3>
              <ul className="p-scope__list">
                {PROBLEMS.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>

            <div className="p-panel">
              <h3 className="p-h3">How IntruSight responds</h3>
              <ul className="p-scope__list p-scope__list--yes">
                {RESPONSES.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
          </div>
        </section>

        <section className="p-shell p-section" aria-labelledby="arch-heading">
          <div className="p-section__head">
            <div>
              <span className="p-eyebrow">Architecture</span>
              <h2 id="arch-heading" className="p-h2">
                How an alert reaches the dashboard
              </h2>
            </div>
            <p className="p-body">
              Ingestion is pull-based and script-driven: each parser reads engine
              output and posts to the API. There is no agent installed on the
              sensor and no live connection back to it.
            </p>
          </div>

          <ol className="p-flow">
            {FLOW.map((step, i) => (
              <li key={step.title} className="p-flow__step">
                <span className="p-step__index">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="p-h3">{step.title}</h3>
                <p className="p-body">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="p-shell p-section" aria-labelledby="cap-heading">
          <span className="p-eyebrow">In the application</span>
          <h2 id="cap-heading" className="p-h2" style={{ marginBottom: "var(--p-s5)" }}>
            Core capabilities
          </h2>

          <ul className="p-grid-2">
            {CAPABILITIES.map((item) => (
              <li key={item.title} className="p-panel p-panel--interactive">
                <h3 className="p-h3">{item.title}</h3>
                <p className="p-body">{item.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="p-shell p-section" aria-labelledby="stack-heading">
          <span className="p-eyebrow">Implementation</span>
          <h2 id="stack-heading" className="p-h2" style={{ marginBottom: "var(--p-s5)" }}>
            Tech stack
          </h2>

          <ul className="p-grid-3">
            {TECH_STACK.map((group) => (
              <li key={group.group} className="p-panel">
                <h3 className="p-h3">{group.group}</h3>
                <ul className="p-stack">
                  {group.items.map((name) => (
                    <li key={name} className="p-chip p-chip--plain">
                      {name}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="p-footer">
        <div className="p-shell p-footer__inner">
          <span>IntruSight — educational network intrusion alert management platform.</span>
          <span>FYP-26-S1-20</span>
        </div>
      </footer>
    </div>
  );
}

export default About;
