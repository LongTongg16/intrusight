import { Link } from "react-router-dom";
import PublicNavbar from "../../components/PublicNavbar";
import "./public.css";

const ENGINES = ["Suricata", "Snort", "Zeek", "Kismet"];

const PIPELINE = [
  {
    num: "01",
    title: "Collect",
    text:
      "Ingestor scripts read the log and event files each engine already writes — Suricata eve.json, Snort alerts, Zeek logs, Kismet captures — and post them to the API.",
  },
  {
    num: "02",
    title: "Normalize",
    text:
      "Every alert is mapped onto one shared schema: source and destination address, port, protocol, signature, category, severity, and the engine it came from.",
  },
  {
    num: "03",
    title: "Triage",
    text:
      "Analysts filter by severity, source and status, attach investigation notes, move an alert through new → investigating → resolved, and export the result.",
  },
];

const CAPABILITIES = [
  {
    title: "One queue across four engines",
    text:
      "Alerts from every configured engine land in a single sortable table, each row labelled with the engine that produced it.",
    tags: ["Suricata", "Snort", "Zeek", "Kismet"],
  },
  {
    title: "Severity and status filtering",
    text:
      "Three severity levels and three triage states filter server-side, with client-side search across address, port, protocol and signature.",
    tags: ["Server-side filters"],
  },
  {
    title: "Investigation notes",
    text:
      "Notes attach to an individual alert and persist with it, keeping the reasoning behind a status change next to the evidence.",
    tags: ["Per-alert notes"],
  },
  {
    title: "Report export",
    text:
      "The alert set currently matching your filters exports as CSV, or renders to PDF for a written incident record.",
    tags: ["CSV", "PDF"],
  },
  {
    title: "Geographic context",
    text:
      "Addresses resolve to an approximate location at ingest time and plot on a map. Resolution is best-effort; some alerts have none.",
    tags: ["Best-effort"],
  },
  {
    title: "Analyst and administrator roles",
    text:
      "Analysts work the alert queue. Administrators manage accounts, review log sources and run database maintenance.",
    tags: ["Two roles"],
  },
];

const FACTS = [
  { value: "4", label: "Detection engines normalized into one alert schema", lead: true },
  { value: "3", label: "Severity levels — high, medium and low" },
  { value: "3", label: "Triage states — new, investigating, resolved" },
  { value: "CSV · PDF", label: "Export formats for the filtered alert set" },
];

// Illustrative rows for the hero preview, shaped exactly like the real
// normalized schema so the preview cannot drift from what the app renders.
const PREVIEW_ROWS = [
  { sev: "high",   engine: "Suricata", sig: "ET SCAN Potential SSH Scan", meta: "192.168.1.12 → 10.0.0.45 · tcp/22" },
  { sev: "medium", engine: "Zeek",     sig: "DNS query to rare domain",   meta: "192.168.1.52 → 8.8.8.8 · udp/53" },
  { sev: "low",    engine: "Snort",    sig: "ICMP echo request",          meta: "172.16.8.12 → 10.0.0.12 · icmp" },
];

const ArrowRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h13M13 6l6 6-6 6" />
  </svg>
);

function Visitor() {
  return (
    <div className="p-page">
      <PublicNavbar />

      <main className="p-main">
        {/* ── Hero ─────────────────────────────────────────── */}
        <section className="p-shell p-hero">
          <div className="p-hero__body">
            <p className="p-badge">
              <span className="p-badge__dot" aria-hidden="true" />
              Educational project · FYP-26-S1-20
            </p>

            <h1 className="p-h1">
              Alerts from four detection engines,
              <br />
              <span className="p-accent-text">one review queue</span>
            </h1>

            <p className="p-lede">
              IntruSight centralizes and normalizes alerts produced by Suricata,
              Snort, Zeek and Kismet, then gives analysts a single interface to
              filter, investigate and document them.
            </p>

            <ul className="p-engines">
              <li className="p-engines__label">Engines</li>
              {ENGINES.map((name) => (
                <li key={name}>
                  <span className="p-chip">{name}</span>
                </li>
              ))}
            </ul>

            <div className="p-hero__actions">
              <Link to="/register" className="p-btn p-btn--primary">
                Create an account
              </Link>
              <Link to="/demo" className="p-btn p-btn--secondary">
                Explore the demo
              </Link>
              <Link to="/about" className="p-btn p-btn--tertiary">
                How it works
                <ArrowRight />
              </Link>
            </div>

            <p className="p-note">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v5M12 8h.01" />
              </svg>
              <span>
                <strong>Scope.</strong> IntruSight reads alerts those engines have
                already written. It does not capture packets, inspect traffic, or
                author detection rules.
              </span>
            </p>
          </div>

          {/* ── Hero preview ───────────────────────────────── */}
          <div className="p-preview">
            <div className="p-preview__bar">
              <p className="p-preview__title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 6h16M4 12h16M4 18h10" />
                </svg>
                Alert queue
              </p>
              <span className="p-preview__tag">Illustrative</span>
            </div>

            <ul className="p-preview__rows">
              {PREVIEW_ROWS.map((row) => (
                <li key={row.sig} className="p-preview__row">
                  <span className={`p-sev p-sev--${row.sev}`}>{row.sev}</span>
                  <div>
                    <div className="p-preview__sig">{row.sig}</div>
                    <div className="p-preview__meta p-mono">{row.meta}</div>
                  </div>
                  <span className="p-pill">{row.engine}</span>
                </li>
              ))}
            </ul>

            <p className="p-preview__foot">
              Sample rows shown in the real alert schema — not live data.
            </p>
          </div>
        </section>

        {/* ── Metrics ──────────────────────────────────────── */}
        <section className="p-shell" aria-labelledby="facts-heading">
          <h2 id="facts-heading" className="visually-hidden">At a glance</h2>
          <ul className="p-metrics">
            {FACTS.map((fact) => (
              <li
                key={fact.label}
                className={`p-metric${fact.lead ? " p-metric--lead" : ""}`}
              >
                <div className="p-metric__value">{fact.value}</div>
                <div className="p-metric__label">{fact.label}</div>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Architecture (banded) ────────────────────────── */}
        <section className="p-band" aria-labelledby="pipeline-heading">
          <div className="p-shell p-section">
            <div className="p-section__head">
              <div>
                <span className="p-eyebrow">Architecture</span>
                <h2 id="pipeline-heading" className="p-h2">
                  Four engines in, one review queue out
                </h2>
              </div>
              <p className="p-body">
                Ingestion is script-driven: each parser reads the output an
                engine already writes and posts it to the API. Nothing is
                inferred — an alert exists because an engine reported it.
              </p>
            </div>

            {/* Diagram. Decorative connectors are hidden from assistive tech;
                the same structure is conveyed by the list semantics below. */}
            <div className="arch">
              <div className="arch__tier arch__tier--sources">
                <p className="arch__tier-label">Detection engines</p>
                <ul className="arch__engines">
                  {ENGINES.map((name) => (
                    <li
                      key={name}
                      className={`arch__engine arch__engine--${name.toLowerCase()}`}
                    >
                      <span className="arch__enginemark" aria-hidden="true">
                        {name.charAt(0)}
                      </span>
                      {name}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="arch__connector" aria-hidden="true">
                <svg viewBox="0 0 800 56" preserveAspectRatio="none" fill="none">
                  <path d="M100 0 V22 Q100 32 110 32 H390 Q400 32 400 42 V56" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M300 0 V22 Q300 32 310 32 H390 Q400 32 400 42 V56" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M500 0 V22 Q500 32 490 32 H410 Q400 32 400 42 V56" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M700 0 V22 Q700 32 690 32 H410 Q400 32 400 42 V56" stroke="currentColor" strokeWidth="1.2" />
                </svg>

                {/* Illustrative pulses showing the direction of ingestion.
                    Not driven by data — see the caption below the diagram. */}
                <svg
                  className="arch__flow"
                  viewBox="0 0 800 56"
                  preserveAspectRatio="none"
                  fill="none"
                >
                  <path d="M100 0 V22 Q100 32 110 32 H390 Q400 32 400 42 V56" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M300 0 V22 Q300 32 310 32 H390 Q400 32 400 42 V56" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M500 0 V22 Q500 32 490 32 H410 Q400 32 400 42 V56" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M700 0 V22 Q700 32 690 32 H410 Q400 32 400 42 V56" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </div>

              <div className="arch__tier arch__tier--core">
                <ol className="arch__stages">
                  {PIPELINE.map((step) => (
                    <li key={step.title} className="arch__stage">
                      <span className="arch__stage-index">{step.num}</span>
                      <div>
                        <h3 className="p-h3">{step.title}</h3>
                        <p className="p-body">{step.text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="arch__connector arch__connector--single" aria-hidden="true">
                <svg viewBox="0 0 800 34" preserveAspectRatio="none" fill="none">
                  <path d="M400 0 V26" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M394 24 L400 34 L406 24 Z" fill="currentColor" />
                </svg>
              </div>

              <div className="arch__tier arch__tier--out">
                <div className="arch__outcome">
                  <span className="arch__outcome-label">Result</span>
                  <p className="arch__outcome-text">
                    One queue an analyst filters, annotates and exports —
                    with the producing engine attached to every alert.
                  </p>
                </div>
              </div>
            </div>

            <p className="arch__caption">
              Diagram only. The moving pulses illustrate the direction of
              ingestion — they are not live traffic, and IntruSight does not
              measure throughput.
            </p>
          </div>
        </section>

        {/* ── Capabilities: asymmetric split ───────────────── */}
        <section className="p-shell p-section" aria-labelledby="capabilities-heading">
          <div className="p-split">
            <div className="p-split__aside">
              <span className="p-eyebrow">Capabilities</span>
              <h2 id="capabilities-heading" className="p-h2">
                What the interface actually does
              </h2>
              <p className="p-body" style={{ marginTop: "var(--p-s5)" }}>
                Each item maps to a screen in the application. Alerts are fetched
                when a view loads and when you refresh — there is no streaming or
                push channel.
              </p>
            </div>

            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {CAPABILITIES.map((item) => (
                <li key={item.title} className="p-feature">
                  <span className="p-feature__mark" aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </span>
                  <div>
                    <h3 className="p-h3" style={{ marginBottom: "var(--p-s2)" }}>
                      {item.title}
                    </h3>
                    <p className="p-body">{item.text}</p>
                    <ul className="p-tags">
                      {item.tags.map((tag) => (
                        <li key={tag} className="p-tag">{tag}</li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Scope (banded) ───────────────────────────────── */}
        <section className="p-band" aria-labelledby="scope-heading">
          <div className="p-shell p-section">
            <div className="p-section__head p-section__head--center">
              <div>
                <span className="p-eyebrow">Scope</span>
                <h2 id="scope-heading" className="p-h2">
                  What IntruSight is, and what it is not
                </h2>
              </div>
            </div>

            <div className="p-scope">
              <div className="p-panel">
                <h3 className="p-h3">It is</h3>
                <ul className="p-scope__list p-scope__list--yes">
                  <li>An alert management and triage interface</li>
                  <li>A normalization layer across four engines</li>
                  <li>A coursework project built to study SOC workflows</li>
                  <li>A place to record and export investigation decisions</li>
                </ul>
              </div>

              <div className="p-panel">
                <h3 className="p-h3">It is not</h3>
                <ul className="p-scope__list p-scope__list--no">
                  <li>A SIEM, or a replacement for one</li>
                  <li>A packet capture or traffic inspection system</li>
                  <li>A replacement for the detection engines themselves</li>
                  <li>A rule-authoring platform</li>
                  <li>A verified production deployment</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────── */}
        <section className="p-shell p-section p-section--sm">
          <div className="p-cta">
            <div>
              <h2 className="p-h2">Try it against your own sensor output</h2>
              <p className="p-body" style={{ marginTop: "var(--p-s3)" }}>
                Create an account, then point the ingestor scripts at the logs
                your engines are already writing.
              </p>
            </div>
            <Link to="/register" className="p-btn p-btn--primary">
              Create an account
            </Link>
          </div>
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

export default Visitor;
