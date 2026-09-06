import { Link } from "react-router-dom";
import PublicNavbar from "../../components/PublicNavbar";
import "./public.css";

const FEATURE_GROUPS = [
  {
    group: "Ingestion",
    heading: "Getting alerts in",
    blurb:
      "Each engine writes a different format in a different place. These parsers read what is already on disk and reduce it to one record shape.",
    features: [
      {
        title: "Multi-engine normalization",
        text:
          "Separate parsers for Suricata eve.json, Snort alert output, Zeek logs and Kismet captures map each record onto one shared alert schema.",
        tags: ["Suricata", "Snort", "Zeek", "Kismet"],
      },
      {
        title: "Engine attribution",
        text:
          "Every stored alert keeps the engine that produced it, so the source is visible in the queue and preserved in exports.",
        tags: ["Per-alert source"],
      },
      {
        title: "Authenticated ingest endpoint",
        text:
          "Ingestion posts to a dedicated endpoint guarded by a separate ingest key, kept distinct from analyst session credentials.",
        tags: ["Ingest key"],
      },
    ],
  },
  {
    group: "Triage",
    heading: "Working the queue",
    blurb:
      "Once alerts share a schema they can share a workflow — filtered, annotated and moved through a fixed set of states.",
    features: [
      {
        title: "Severity classification",
        text:
          "Engine severity is mapped to three levels — high, medium and low — and shown consistently across every view.",
        tags: ["3 levels"],
      },
      {
        title: "Filtering and search",
        text:
          "Severity and status filters are applied server-side. Free-text search across address, port, protocol and signature runs over the returned set.",
        tags: ["Server filters", "Client search"],
      },
      {
        title: "Status workflow",
        text:
          "Move an alert through new, investigating and resolved. The current state is shown as a labelled badge, not colour alone.",
        tags: ["new → investigating → resolved"],
      },
      {
        title: "Investigation notes",
        text:
          "Free-text notes are attached to an individual alert and stored with it, keeping the reasoning next to the evidence.",
        tags: ["Per-alert"],
      },
    ],
  },
  {
    group: "Analysis and output",
    heading: "Making sense of it",
    blurb:
      "Aggregate views and exports built on the same stored records, so a chart and a report never disagree with the table.",
    features: [
      {
        title: "Severity mix and hourly activity",
        text:
          "The dashboard renders the loaded alert set as a severity donut and a bar chart of alerts bucketed by the hour the engine reported them. Both are fixed views; there is no chart-type selector.",
        tags: ["Recharts"],
      },
      {
        title: "Geographic view",
        text:
          "Addresses resolved at ingest time are plotted on a map. Resolution is best-effort and some alerts will have no location.",
        tags: ["Leaflet", "Best-effort"],
      },
      {
        title: "CSV and PDF export",
        text:
          "Export the alert set currently matching your filters as CSV, or render it to a PDF report for documentation.",
        tags: ["CSV", "PDF"],
      },
      {
        title: "Role separation",
        text:
          "Analyst and administrator interfaces are separate. Administrators manage accounts, log sources and database maintenance.",
        tags: ["Analyst", "Administrator"],
      },
    ],
  },
];

function Features() {
  return (
    <div className="p-page">
      <PublicNavbar />

      <main className="p-main">
        <section className="p-shell p-hero">
          <div className="p-hero__body">
            <p className="p-badge">
              <span className="p-badge__dot" aria-hidden="true" />
              Feature reference
            </p>

            <h1 className="p-h1">
              Everything the interface{" "}
              <span className="p-accent-text">currently does</span>
            </h1>

            <p className="p-lede">
              This page lists implemented behavior only. Where a capability has
              a limitation worth knowing about, it is stated alongside the
              feature rather than omitted.
            </p>

            <div className="p-hero__actions">
              <Link to="/demo" className="p-btn p-btn--primary">
                Explore the demo
              </Link>
              <Link to="/register" className="p-btn p-btn--secondary">
                Create an account
              </Link>
            </div>
          </div>

          <div className="p-preview">
            <div style={{ padding: "var(--p-s5)" }}>
              <h2 className="p-h3">Data refresh model</h2>
              <p className="p-body">
                Views fetch alerts when they load and when you press refresh.
                IntruSight does not poll on a timer, hold a socket open, or push
                updates to the browser — anything describing it as “real-time”
                would be inaccurate.
              </p>
            </div>
          </div>
        </section>

        {FEATURE_GROUPS.map(({ group, heading, blurb, features }, groupIndex) => {
          const id = `group-${group.toLowerCase().replace(/\s+/g, "-")}`;
          const banded = groupIndex % 2 === 0;
          return (
            <section key={group} className={banded ? "p-band" : undefined} aria-labelledby={id}>
              <div className="p-shell p-section">
                <div className="p-split">
                  <div className="p-split__aside">
                    <span className="p-eyebrow">{group}</span>
                    <h2 id={id} className="p-h2">{heading}</h2>
                    <p className="p-body" style={{ marginTop: "var(--p-s5)" }}>
                      {blurb}
                    </p>
                  </div>

                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {features.map((f) => (
                      <li key={f.title} className="p-feature">
                        <span className="p-feature__mark" aria-hidden="true">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        </span>
                        <div>
                          <h3 className="p-h3" style={{ marginBottom: "var(--p-s2)" }}>
                            {f.title}
                          </h3>
                          <p className="p-body">{f.text}</p>
                          <ul className="p-tags">
                            {f.tags.map((tag) => (
                              <li key={tag} className="p-tag">{tag}</li>
                            ))}
                          </ul>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          );
        })}

        <section className="p-shell p-section p-section--sm">
          <div className="p-cta">
            <div>
              <h2 className="p-h2">Point it at your own engine output</h2>
              <p className="p-body" style={{ marginTop: "var(--p-s1)" }}>
                Create an account, then run the ingestor for whichever engines
                you have.
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

export default Features;
