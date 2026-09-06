import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {
  PageHeader, Button, Icon, SeverityBadge, StatusBadge,
  EngineBadge, EngineMark, EmptyState, ErrorState, LoadingRows, Notice, relTime,
  sourceOf, destOf,
} from "../../components/ui";
import "./admin.css";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";
const authHeader = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
});

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };
const SEVERITIES = ["high", "medium", "low"];
const ENGINES = ["Suricata", "Snort", "Zeek", "Kismet"];
const PAGE_SIZE = 10;

const fmtTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
};

function AdminDashboard() {
  const [alerts, setAlerts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [logsUnavailable, setLogsUnavailable] = useState(false);
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    setLogsUnavailable(false);
    try {
      // Each leg degrades independently: a failing log-source lookup should
      // not blank the alert overview, and vice versa.
      const [alertsRes, logsRes] = await Promise.all([
        axios.get(`${API_BASE}/api/alerts`, authHeader()),
        axios.get(`${API_BASE}/api/logs`, authHeader()).catch(() => null),
      ]);
      setAlerts(alertsRes.data.items ?? alertsRes.data ?? []);
      if (logsRes) setLogs(logsRes.data.items ?? logsRes.data ?? []);
      else { setLogs([]); setLogsUnavailable(true); }
      setPage(1);
    } catch {
      setError("Could not load alert data from the API.");
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* Severity counts are derived here rather than from the summary endpoint so
     the figures always agree with the table rendered below them. */
  const severityCounts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0 };
    alerts.forEach((a) => {
      const k = (a.severity_label || "").toLowerCase();
      if (k in c) c[k] += 1;
    });
    return c;
  }, [alerts]);

  const severityTotal = SEVERITIES.reduce((n, sev) => n + severityCounts[sev], 0);

  /* A log source's `status` is a configuration flag an administrator sets.
     It is NOT a health probe — the backend never contacts the sensor — so it
     is described as "enabled/disabled", never "running/stopped". */
  const sources = useMemo(() => ENGINES.map((name) => {
    const match = logs?.find((l) => l.name?.toLowerCase().includes(name.toLowerCase()));
    return {
      name,
      configured: Boolean(match),
      enabled: match?.status === "Active",
      host: match?.host || match?.path || null,
      // Transport recorded on the stored configuration, e.g. "File based · JSON".
      transport: match ? [match.type, match.logType].filter(Boolean).join(" · ") : "",
    };
  }), [logs]);

  const enabledCount = sources.filter((s) => s.enabled).length;

  const categories = useMemo(() => {
    const m = new Map();
    alerts.forEach((a) => a.category && m.set(a.category, (m.get(a.category) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [alerts]);

  const topCategory = categories[0] || null;

  const sorted = useMemo(() => [...alerts].sort((a, b) => {
    const s = (SEVERITY_ORDER[a.severity_label] ?? 9) - (SEVERITY_ORDER[b.severity_label] ?? 9);
    if (s !== 0) return s;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  }), [alerts]);

  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Administration"
        subtitle="Configuration and stored-data overview. IntruSight does not probe sensors — everything here reflects what has been configured and what has been ingested."
        actions={
          <Button onClick={fetchData} loading={loading}>
            <Icon.refresh /> Refresh
          </Button>
        }
      />

      {error && <ErrorState onRetry={fetchData}>{error}</ErrorState>}

      {!error && (
        <>
          <dl className="triage">
            <div className="triage__cell">
              <dt>Alerts stored</dt>
              <dd className="triage__num">{loading ? "—" : alerts.length}</dd>
              <dd className="triage__hint">Across every engine</dd>
            </div>
            <div className="triage__cell triage__cell--high">
              <dt>High severity</dt>
              <dd className="triage__num">{loading ? "—" : severityCounts.high}</dd>
              <dd className="triage__hint">Of the stored set</dd>
            </div>
            <div className="triage__cell">
              <dt>Sources enabled</dt>
              <dd className="triage__num">
                {loading ? "—" : `${enabledCount}/${ENGINES.length}`}
              </dd>
              <dd className="triage__hint">Configuration state</dd>
            </div>
            <div className="triage__cell">
              <dt>Distinct categories</dt>
              <dd className="triage__num">{loading ? "—" : categories.length}</dd>
              <dd className="triage__hint">
                {topCategory ? `Most common: ${topCategory[0]}` : "None recorded"}
              </dd>
            </div>
          </dl>

          <div className="admin-grid">
            <section className="ops" aria-labelledby="admin-sources">
              <div className="ops__head">
                <h2 className="ops__title" id="admin-sources">Log sources</h2>
                <span className="ops__meta">
                  <Link to="/admin/log-management" className="ui-btn ui-btn--ghost ui-btn--sm">
                    Manage <Icon.chevron />
                  </Link>
                </span>
              </div>
              <div className="srcpanel">
                <p className="srcpanel__note">
                  Whether each engine is configured and enabled for ingestion.
                  This is configuration state, not sensor health.
                </p>

                {logsUnavailable && (
                  <Notice tone="warning" className="admin-notice">
                    Log-source configuration could not be loaded, so the states below are unknown.
                  </Notice>
                )}

                <ul className="src-list">
                  {sources.map((s) => {
                    const state = logsUnavailable
                      ? "unknown"
                      : !s.configured
                        ? "absent"
                        : s.enabled ? "on" : "off";
                    const label = { unknown: "Unknown", absent: "Not configured",
                                    on: "Enabled", off: "Disabled" }[state];
                    return (
                      <li key={s.name} className={`src src--${state}`}>
                        <EngineMark engine={s.name} />
                        <span className="src__body">
                          <span className="src__name">{s.name}</span>
                          <span className="src__meta">{s.transport || "No configuration stored"}</span>
                        </span>
                        <span className="src__state">
                          <span className="src__dot" aria-hidden="true" />
                          {label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>

            <div className="admin-rail">
            <section className="ops" aria-labelledby="admin-sev">
              <div className="ops__head">
                <h2 className="ops__title" id="admin-sev">Severity</h2>
              </div>
              <div className="srcpanel">
                {severityTotal === 0 ? (
                  <p className="sevdist__empty">
                    {loading ? "Loading severity mix…" : "No stored alerts to summarise yet."}
                  </p>
                ) : (
                  <div className="sevdist">
                    <div
                      className="sevdist__bar"
                      role="img"
                      aria-label={SEVERITIES.map(
                        (sev) => `${severityCounts[sev]} ${sev}`
                      ).join(", ")}
                    >
                      {SEVERITIES.map((sev) =>
                        severityCounts[sev] > 0 ? (
                          <span
                            key={sev}
                            className={`sevdist__seg sevdist__seg--${sev}`}
                            style={{ width: `${(severityCounts[sev] / severityTotal) * 100}%` }}
                          />
                        ) : null
                      )}
                    </div>
                    <ul className="sevdist__rows">
                      {SEVERITIES.map((sev) => (
                        <li key={sev} className={`sevdist__row sevdist__row--${sev}`}>
                          <span className="sevdist__dot" aria-hidden="true" />
                          <span className="sevdist__name">{sev}</span>
                          <span className="sevdist__share">
                            {Math.round((severityCounts[sev] / severityTotal) * 100)}%
                          </span>
                          <span className="sevdist__count">{severityCounts[sev]}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>

            <section className="ops" aria-labelledby="admin-cat">
              <div className="ops__head">
                <h2 className="ops__title" id="admin-cat">Categories</h2>
                <span className="ops__meta">{categories.length} distinct</span>
              </div>
              {categories.length === 0 ? (
                <div className="ops-empty">
                  <span className="ops-empty__icon" aria-hidden="true"><Icon.inbox /></span>
                  <div>
                    <p className="ops-empty__title">No categories recorded</p>
                    <p className="ops-empty__text">Engines attach a category to each alert they report.</p>
                  </div>
                </div>
              ) : (
                <ul className="catlist">
                  {categories.slice(0, 6).map(([name, count]) => (
                    <li className="catrow" key={name}>
                      <span className="catrow__name" title={name}>{name}</span>
                      <span className="catrow__track" aria-hidden="true">
                        <span
                          className="catrow__fill"
                          style={{ width: `${(count / categories[0][1]) * 100}%` }}
                        />
                      </span>
                      <span className="catrow__count">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            </div>
          </div>

          <section className="ops" aria-labelledby="admin-recent">
            <div className="ops__head">
              <h2 className="ops__title" id="admin-recent">Stored alerts</h2>
              <span className="ops__meta">Most severe first — the same records analysts triage</span>
            </div>

            {loading ? (
              <LoadingRows rows={6} label="Loading alerts" />
            ) : sorted.length === 0 ? (
              <EmptyState icon="inbox" title="No alerts stored yet">
                Run an ingestor for a configured engine to populate the database.
              </EmptyState>
            ) : (
              <>
                <div className="table-container">
                  <div className="table-scroll">
                    <table className="alerts-table altable">
                      <caption className="visually-hidden">Stored alerts, most severe first</caption>
                      <thead>
                        <tr>
                          <th scope="col">Severity</th>
                          <th scope="col">Event</th>
                          <th scope="col">Connection</th>
                          <th scope="col">Engine</th>
                          <th scope="col">Status</th>
                          <th scope="col">Ingested</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paged.map((a, i) => (
                          <tr key={a.id || i} className={`altable__row altable__row--${(a.severity_label || "").toLowerCase()}`}>
                            <td><SeverityBadge severity={a.severity_label} /></td>
                            <td>
                              <span className="altable__sig">{a.signature || "Unnamed event"}</span>
                              {a.category && <span className="altable__cat">{a.category}</span>}
                            </td>
                            <td>
                              <span className="altable__flow ui-mono">
                                <span className="altable__ip">{sourceOf(a) || "—"}</span>
                                <span className="altable__arrow" aria-hidden="true">→</span>
                                <span className="altable__ip">{destOf(a) || "—"}</span>
                                {a.dest_port ? <span className="altable__port">:{a.dest_port}</span> : null}
                              </span>
                              {a.proto && (
                                <span className="altable__sub">
                                  <span className="altable__proto">{a.proto}</span>
                                </span>
                              )}
                            </td>
                            <td><EngineBadge engine={a.source_nids} /></td>
                            <td><StatusBadge status={a.status} /></td>
                            <td className="altable__when">
                              <span className="altable__age">{relTime(a.created_at)}</span>
                              <span className="altable__abs ui-mono">{fmtTime(a.created_at)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {totalPages > 1 && (
                  <nav className="pagination" aria-label="Alert pages">
                    <p>
                      Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length}
                    </p>
                    <div className="pages">
                      <button className="page-nav" onClick={() => setPage((p) => p - 1)} disabled={page === 1} aria-label="Previous page">‹</button>
                      <span className="page-number active" aria-current="page">{page}</span>
                      <button className="page-nav" onClick={() => setPage((p) => p + 1)} disabled={page === totalPages} aria-label="Next page">›</button>
                    </div>
                  </nav>
                )}
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}

export default AdminDashboard;
