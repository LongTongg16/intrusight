import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import PublicNavbar from "../../components/PublicNavbar";
import "./public.css";

/* ────────────────────────────────────────────────────────────────
   SAMPLE DATA — the single source for every number on this page.
   Stat tiles, both charts and the table are all derived from this
   array, so nothing displayed here can drift from anything else.
   This is illustrative data. It is not fetched from the backend.
   ──────────────────────────────────────────────────────────────── */
const SAMPLE_ALERTS = [
  { id: "AL-1001", sev: "high",   type: "ET SCAN Potential SSH Scan",   src: "192.168.1.12", dst: "10.0.0.45",   port: 22,   proto: "TCP", engine: "Suricata", minsAgo: 3 },
  { id: "AL-1002", sev: "medium", type: "DNS query to rare domain",     src: "192.168.1.52", dst: "8.8.8.8",     port: 53,   proto: "UDP", engine: "Zeek",     minsAgo: 12 },
  { id: "AL-1003", sev: "low",    type: "ICMP echo request",            src: "172.16.8.12",  dst: "10.0.0.12",   port: 0,    proto: "ICMP", engine: "Snort",   minsAgo: 30 },
  { id: "AL-1004", sev: "high",   type: "SSH brute force attempt",      src: "10.0.0.45",    dst: "10.0.0.12",   port: 22,   proto: "TCP", engine: "Suricata", minsAgo: 64 },
  { id: "AL-1005", sev: "medium", type: "Long-duration outbound flow",  src: "10.0.0.77",    dst: "45.33.12.88", port: 443,  proto: "TCP", engine: "Zeek",     minsAgo: 121 },
  { id: "AL-1006", sev: "low",    type: "Unencrypted HTTP request",     src: "192.168.5.3",  dst: "10.0.0.1",    port: 80,   proto: "TCP", engine: "Snort",    minsAgo: 154 },
  { id: "AL-1007", sev: "high",   type: "SMB exploit signature match",  src: "192.168.1.90", dst: "10.0.0.20",   port: 445,  proto: "TCP", engine: "Snort",    minsAgo: 188 },
  { id: "AL-1008", sev: "medium", type: "Deauthentication burst",       src: "aa:bb:cc:11",  dst: "de:ad:be:ef", port: 0,    proto: "802.11", engine: "Kismet", minsAgo: 205 },
  { id: "AL-1009", sev: "low",    type: "New device on monitored SSID", src: "aa:bb:cc:22",  dst: "de:ad:be:ef", port: 0,    proto: "802.11", engine: "Kismet", minsAgo: 240 },
  { id: "AL-1010", sev: "medium", type: "TLS certificate anomaly",      src: "10.0.0.31",    dst: "104.18.9.4",  port: 443,  proto: "TCP", engine: "Zeek",     minsAgo: 268 },
  { id: "AL-1011", sev: "high",   type: "SQL injection pattern",        src: "203.0.113.9",  dst: "10.0.0.60",   port: 8080, proto: "TCP", engine: "Suricata", minsAgo: 305 },
  { id: "AL-1012", sev: "low",    type: "Port sweep, low rate",         src: "172.16.8.44",  dst: "10.0.0.0",    port: 0,    proto: "TCP", engine: "Snort",    minsAgo: 341 },
];

const SEV_META = {
  high:   { label: "High",   color: "#fb7185" },
  medium: { label: "Medium", color: "#fbbf24" },
  low:    { label: "Low",    color: "#34d399" },
};

const SEV_FILTERS = ["all", "high", "medium", "low"];
const ENGINE_COLOR = "#4cc9f0";

const relativeTime = (mins) => {
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return `${hours} hr${hours === 1 ? "" : "s"} ago`;
};

const chartTooltip = {
  contentStyle: {
    background: "#131e33",
    border: "1px solid rgba(148,163,184,0.22)",
    borderRadius: 8,
    color: "#dde5f2",
    fontSize: 13,
  },
  cursor: { fill: "rgba(148,163,184,0.06)" },
};

function Demo() {
  const [sevFilter, setSevFilter] = useState("all");
  const [activeAlert, setActiveAlert] = useState(null);
  const closeRef = useRef(null);
  const lastFocusedRef = useRef(null);

  const stats = useMemo(() => {
    const by = { high: 0, medium: 0, low: 0 };
    SAMPLE_ALERTS.forEach((a) => { by[a.sev] += 1; });
    return { total: SAMPLE_ALERTS.length, ...by };
  }, []);

  const severityData = useMemo(
    () =>
      Object.entries(SEV_META)
        .map(([key, meta]) => ({ name: meta.label, value: stats[key], color: meta.color }))
        .filter((d) => d.value > 0),
    [stats]
  );

  const engineData = useMemo(() => {
    const counts = {};
    SAMPLE_ALERTS.forEach((a) => { counts[a.engine] = (counts[a.engine] || 0) + 1; });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, []);

  const filtered = useMemo(
    () => (sevFilter === "all" ? SAMPLE_ALERTS : SAMPLE_ALERTS.filter((a) => a.sev === sevFilter)),
    [sevFilter]
  );

  const openAlert = (alert, event) => {
    lastFocusedRef.current = event.currentTarget;
    setActiveAlert(alert);
  };

  const closeAlert = useCallback(() => {
    setActiveAlert(null);
    lastFocusedRef.current?.focus();
  }, []);

  // Esc closes the dialog; focus moves into it on open and back out on close.
  useEffect(() => {
    if (!activeAlert) return undefined;
    const onKeyDown = (e) => { if (e.key === "Escape") closeAlert(); };
    document.addEventListener("keydown", onKeyDown);
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeAlert, closeAlert]);

  return (
    <div className="p-page">
      <PublicNavbar />

      <main className="p-main">
        <section className="p-shell" style={{ paddingTop: "var(--p-s6)" }}>
          <p className="p-badge">
            <span className="p-badge__dot" aria-hidden="true" />
            Interactive preview
          </p>
          <h1 className="p-h1">Analyst view, sample data</h1>
          <p className="p-lede" style={{ marginBottom: "var(--p-s4)" }}>
            A read-only walkthrough of the alert queue. Every figure below is
            computed from a fixed set of twelve illustrative alerts held in the
            page itself.
          </p>

          <div className="p-notice" style={{ marginBottom: "var(--p-s5)" }}>
            <span aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </span>
            <span>
              <strong>Sample data.</strong> Nothing on this page is fetched from
              a backend or produced by a sensor. Sign in to work real alerts.
            </span>
          </div>

          <div className="p-hero__actions" style={{ marginTop: 0, marginBottom: "var(--p-s6)" }}>
            <Link to="/login" className="p-btn p-btn--primary">Sign in</Link>
            <Link to="/register" className="p-btn p-btn--secondary">Create an account</Link>
          </div>
        </section>

        <section className="p-shell p-demo" aria-label="Demo dashboard">
          <nav className="p-demo__nav" aria-label="Demo sections">
            <p className="p-demo__nav-title">Analyst menu</p>
            <ul className="p-demo__nav-list">
              <li className="p-demo__nav-item" aria-current="page">Dashboard</li>
              <li className="p-demo__nav-item">Alerts</li>
              <li className="p-demo__nav-item">Reports</li>
              <li className="p-demo__nav-item">Threat map</li>
              <li className="p-demo__nav-item">Notifications</li>
            </ul>
            <p className="p-body" style={{ fontSize: "var(--p-fs-xs)", marginTop: "var(--p-s2)" }}>
              Navigation is inert in this preview.
            </p>
          </nav>

          <div className="p-demo__body">
            <ul className="p-metrics" style={{ paddingBottom: 0 }}>
              <li className="p-metric p-metric--lead">
                <div className="p-metric__value">{stats.total}</div>
                <div className="p-metric__label">Total alerts</div>
              </li>
              {Object.entries(SEV_META).map(([key, meta]) => (
                <li key={key} className="p-metric">
                  <div className="p-metric__value" style={{ color: meta.color }}>
                    {stats[key]}
                  </div>
                  <div className="p-metric__label">{meta.label} severity</div>
                </li>
              ))}
            </ul>

            <div className="p-demo__charts">
              <div className="p-panel">
                <div className="p-panel__head">
                  <h2 className="p-panel__title">Alerts by engine</h2>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={engineData} margin={{ top: 4, right: 8, bottom: 4, left: -24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "#93a1b8", fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: "#93a1b8", fontSize: 12 }} tickLine={false} axisLine={false} />
                    <Tooltip {...chartTooltip} />
                    <Bar dataKey="count" name="Alerts" fill={ENGINE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="p-panel">
                <div className="p-panel__head">
                  <h2 className="p-panel__title">Severity split</h2>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={severityData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={44}
                      outerRadius={72}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {severityData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip {...chartTooltip} cursor={false} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Text legend so severity is never conveyed by colour alone. */}
                <ul className="p-tags" style={{ justifyContent: "center" }}>
                  {severityData.map((entry) => (
                    <li key={entry.name} className="p-tag" style={{ color: entry.color }}>
                      {entry.name} · {entry.value}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="p-panel">
              <div className="p-panel__head">
                <h2 className="p-panel__title">Alert queue</h2>
                <Link to="/login" className="p-btn p-btn--ghost">
                  Open the real analyst view →
                </Link>
              </div>

              <div className="p-controls">
                <div className="p-tabs" role="group" aria-label="Filter by severity">
                {SEV_FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    className="p-tab"
                    aria-pressed={sevFilter === f}
                    onClick={() => setSevFilter(f)}
                  >
                    {f === "all" ? "All" : SEV_META[f].label}
                    {f !== "all" && ` (${stats[f]})`}
                  </button>
                ))}
                </div>
              </div>

              <div className="p-tablewrap">
                <table className="p-table">
                  <caption>
                    Showing {filtered.length} of {SAMPLE_ALERTS.length} sample alerts
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Severity</th>
                      <th scope="col">Signature</th>
                      <th scope="col">Source</th>
                      <th scope="col">Destination</th>
                      <th scope="col">Engine</th>
                      <th scope="col">Seen</th>
                      <th scope="col"><span className="visually-hidden">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <span className={`p-sev p-sev--${a.sev}`}>{SEV_META[a.sev].label}</span>
                        </td>
                        <td>{a.type}</td>
                        <td className="p-mono">{a.src}</td>
                        <td className="p-mono">{a.dst}</td>
                        <td><span className="p-pill">{a.engine}</span></td>
                        <td style={{ color: "var(--p-text-muted)", whiteSpace: "nowrap" }}>
                          {relativeTime(a.minsAgo)}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="p-rowbtn"
                            onClick={(e) => openAlert(a, e)}
                          >
                            View
                            <span className="visually-hidden"> details for {a.type}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="p-footer">
        <div className="p-shell p-footer__inner">
          <span>IntruSight — educational network intrusion alert management platform.</span>
          <span>FYP-26-S1-20</span>
        </div>
      </footer>

      {activeAlert && (
        <div
          className="p-overlay"
          onClick={closeAlert}
          role="presentation"
        >
          <div
            className="p-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-modal__head">
              <div>
                <h2 id="demo-modal-title" className="p-h3" style={{ margin: 0 }}>
                  {activeAlert.type}
                </h2>
                <p className="p-body" style={{ fontSize: "var(--p-fs-sm)" }}>
                  {activeAlert.id} · sample alert
                </p>
              </div>
              <button
                type="button"
                ref={closeRef}
                className="p-modal__close"
                onClick={closeAlert}
                aria-label="Close alert details"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="p-modal__body">
              <dl className="p-kv">
                <div>
                  <dt>Severity</dt>
                  <dd>
                    <span className={`p-sev p-sev--${activeAlert.sev}`}>
                      {SEV_META[activeAlert.sev].label}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Detection engine</dt>
                  <dd>{activeAlert.engine}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd className="p-mono">{activeAlert.src}</dd>
                </div>
                <div>
                  <dt>Destination</dt>
                  <dd className="p-mono">{activeAlert.dst}</dd>
                </div>
                <div>
                  <dt>Protocol</dt>
                  <dd>{activeAlert.proto}{activeAlert.port ? ` / ${activeAlert.port}` : ""}</dd>
                </div>
                <div>
                  <dt>Seen</dt>
                  <dd>{relativeTime(activeAlert.minsAgo)}</dd>
                </div>
              </dl>

              <div className="p-notice">
                <span>
                  Investigation notes and status changes are available to
                  signed-in analysts. This preview is read-only.
                </span>
              </div>
            </div>

            <div className="p-modal__foot">
              <button type="button" className="p-btn p-btn--secondary" onClick={closeAlert}>
                Close
              </button>
              <Link to="/login" className="p-btn p-btn--primary">
                Sign in to investigate
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Demo;
