import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  PageHeader, Button, Icon, StatusBadge, EngineBadge, EngineMark, relTime,
  sourceOf, destOf, isObservation,
  SectionHeader, EmptyState, ErrorState, LoadingRows,
} from "../../components/ui";
import "./analyst.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const SEV_COLORS = {
  high:   "var(--severity-high)",
  medium: "var(--severity-medium)",
  low:    "var(--severity-low)",
};
const SEV_ORDER = { high: 0, medium: 1, low: 2 };
const ENGINES = ["SURICATA", "SNORT", "ZEEK", "KISMET"];

const chartTooltip = {
  contentStyle: {
    background: "var(--surface-1)",
    border: "1px solid var(--border-default)",
    borderRadius: 8,
    color: "var(--text-body)",
    fontSize: 12,
  },
  cursor: { fill: "rgba(148,163,184,0.06)" },
};

/** Alerts bucketed by hour of day, split by severity. */
function ActivityChart({ alerts }) {
  const data = useMemo(() => {
    const buckets = {};
    alerts.forEach((a) => {
      if (!a.timestamp) return;
      const d = new Date(a.timestamp);
      if (Number.isNaN(d.getTime())) return;
      const key = `${String(d.getHours()).padStart(2, "0")}:00`;
      buckets[key] ??= { time: key, high: 0, medium: 0, low: 0 };
      const sev = (a.severity_label || "").toLowerCase();
      if (sev in buckets[key]) buckets[key][sev] += 1;
    });
    return Object.values(buckets).sort((a, b) => a.time.localeCompare(b.time));
  }, [alerts]);

  if (!data.length) {
    return <p className="dash-chart-empty">No timestamped alerts to plot.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -26 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
        <XAxis dataKey="time" tick={{ fill: "var(--text-muted-c)", fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={{ fill: "var(--text-muted-c)", fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip {...chartTooltip} />
        <Bar dataKey="low" stackId="s" fill={SEV_COLORS.low} />
        <Bar dataKey="medium" stackId="s" fill={SEV_COLORS.medium} />
        <Bar dataKey="high" stackId="s" fill={SEV_COLORS.high} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function SeverityDonut({ counts }) {
  const data = Object.entries(counts)
    .map(([k, v]) => ({ name: k, value: v, color: SEV_COLORS[k] }))
    .filter((d) => d.value > 0);

  if (!data.length) return <p className="dash-chart-empty">No alerts to summarise.</p>;

  return (
    <>
      <ResponsiveContainer width="100%" height={150}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
               innerRadius={42} outerRadius={64} paddingAngle={2} strokeWidth={0}>
            {data.map((d) => <Cell key={d.name} fill={d.color} />)}
          </Pie>
          <Tooltip {...chartTooltip} cursor={false} />
        </PieChart>
      </ResponsiveContainer>
      {/* Text legend so severity is never conveyed by colour alone. */}
      <ul className="dash-legend">
        {data.map((d) => (
          <li key={d.name}>
            <span className="dash-legend__swatch" style={{ background: d.color }} aria-hidden="true" />
            <span className="dash-legend__name">{d.name}</span>
            <span className="dash-legend__value">{d.value}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Compact "top N" list — the repeat offenders an analyst actually chases. */
function TopList({ title, hint, items, emptyText }) {
  const max = items.length ? items[0].count : 1;
  return (
    <section className="ui-panel dash-top">
      <div className="ui-panel__body">
        <SectionHeader title={title} hint={hint} />
        {items.length === 0 ? (
          <p className="dash-chart-empty">{emptyText}</p>
        ) : (
          <ol className="dash-top__list">
            {items.map((it) => (
              <li key={it.key} className="dash-top__row">
                <span className="dash-top__label" title={it.key}>{it.key}</span>
                <span className="dash-top__bar" aria-hidden="true">
                  <span style={{ width: `${Math.max(6, (it.count / max) * 100)}%` }} />
                </span>
                <span className="dash-top__count">{it.count}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastLoaded, setLastLoaded] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/alerts`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAlerts(data.items || []);
      setLastLoaded(new Date());
    } catch {
      setError("Could not reach the API. No alerts loaded.");
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Derived triage signals (all from stored alert fields) ─── */
  const stats = useMemo(() => {
    const counts = { high: 0, medium: 0, low: 0 };
    let needsTriage = 0;
    let highOpen = 0;
    const engines = new Set();

    let observations = 0;

    alerts.forEach((a) => {
      // Every engine contributes to coverage, including the ones that only
      // report context.
      if (a.source_nids) engines.add(String(a.source_nids).toUpperCase());

      if (isObservation(a)) {
        observations += 1;
        return;
      }

      const sev = (a.severity_label || "").toLowerCase();
      const status = (a.status || "new").toLowerCase();
      if (sev in counts) counts[sev] += 1;
      if (status === "new") needsTriage += 1;
      if (sev === "high" && status !== "resolved") highOpen += 1;
    });

    return { counts, needsTriage, highOpen, engines, observations,
             total: alerts.length, detections: alerts.length - observations };
  }, [alerts]);

  const topSources = useMemo(() => {
    const m = new Map();
    alerts.forEach((a) => a.src_ip && m.set(a.src_ip, (m.get(a.src_ip) || 0) + 1));
    return [...m.entries()].map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count).slice(0, 5);
  }, [alerts]);

  const topSignatures = useMemo(() => {
    const m = new Map();
    alerts.forEach((a) => a.signature && m.set(a.signature, (m.get(a.signature) || 0) + 1));
    return [...m.entries()].map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count).slice(0, 5);
  }, [alerts]);

  /* Most severe, then newest — what an analyst should look at first. */
  const priority = useMemo(() => {
    return [...alerts]
      .filter((a) => !isObservation(a))
      .filter((a) => (a.status || "new").toLowerCase() !== "resolved")
      .sort((a, b) => {
        const s = (SEV_ORDER[(a.severity_label || "").toLowerCase()] ?? 9)
                - (SEV_ORDER[(b.severity_label || "").toLowerCase()] ?? 9);
        if (s !== 0) return s;
        return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
      })
      .slice(0, 8);
  }, [alerts]);

  const reporting = ENGINES.filter((e) => stats.engines.has(e));

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={
          lastLoaded
            ? `Snapshot of stored alerts, loaded ${lastLoaded.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Data refreshes when you reload or press refresh — it does not stream.`
            : "Snapshot of stored alerts. Data refreshes when you reload or press refresh — it does not stream."
        }
        actions={
          <Button onClick={fetchData} loading={loading}>
            <Icon.refresh /> Refresh
          </Button>
        }
      />

      {/* Operational summary as a single band rather than four floating
          cards — it reads as one statement about the queue. */}
      <dl className="triage">
        <div className="triage__cell triage__cell--urgent">
          <dt>Awaiting triage</dt>
          <dd className="triage__num">{loading ? "—" : stats.needsTriage}</dd>
          <dd className="triage__hint">Not yet resolved</dd>
        </div>
        <div className="triage__cell triage__cell--high">
          <dt>High, unresolved</dt>
          <dd className="triage__num">{loading ? "—" : stats.highOpen}</dd>
          <dd className="triage__hint">Highest severity open</dd>
        </div>
        <div className="triage__cell">
          <dt>Engines reporting</dt>
          <dd className="triage__num">
            {loading ? "—" : `${reporting.length}/${ENGINES.length}`}
          </dd>
          <dd className="triage__hint">Produced stored alerts</dd>
        </div>
        <div className="triage__cell">
          <dt>Records stored</dt>
          <dd className="triage__num">{loading ? "—" : stats.total}</dd>
          <dd className="triage__hint">
            {loading
              ? "In this snapshot"
              : `${stats.detections} detection${stats.detections === 1 ? "" : "s"}, ${stats.observations} context`}
          </dd>
        </div>
      </dl>

      {error && <ErrorState onRetry={fetchData}>{error}</ErrorState>}

      {!error && (
        <div className="ui-enter">
          {/* The queue is the product, so it leads the page and takes the
              wider column. The rail beside it summarises the same set. */}
          <div className="dash-split">
            <section className="ops" aria-labelledby="dash-priority-h">
              <div className="ops__head">
                <h2 className="ops__title" id="dash-priority-h">Needs attention</h2>
                <span className="ops__meta">
                  <Link to="/alerts" className="ui-btn ui-btn--ghost ui-btn--sm">
                    All alerts <Icon.chevron />
                  </Link>
                </span>
              </div>

              {loading ? (
                <div className="queue"><LoadingRows rows={6} label="Loading alerts" /></div>
              ) : priority.length === 0 ? (
                <div className="ops-empty">
                  <span className="ops-empty__icon" aria-hidden="true"><Icon.inbox /></span>
                  <div>
                    <p className="ops-empty__title">Nothing awaiting triage</p>
                    <p className="ops-empty__text">
                      Every stored alert has been resolved. New alerts appear here as engines report them.
                    </p>
                  </div>
                </div>
              ) : (
                <ul className="queue">
                  {priority.map((a) => (
                    <li key={a.id} className={`q q--${(a.severity_label || "").toLowerCase()}`}>
                      <button
                        type="button"
                        className="q__open"
                        onClick={() => navigate(`/alert/${a.id}`, { state: { alert: a } })}
                      >
                        <span className="q__sev">{a.severity_label || "—"}</span>

                        <span className="q__body">
                          <span className="q__sig">{a.signature || "Unnamed event"}</span>
                          <span className="q__flow ui-mono">
                            {sourceOf(a) || "—"}
                            <span className="q__arrow" aria-hidden="true">→</span>
                            {destOf(a) || "—"}
                            {a.dest_port ? <span className="q__port">:{a.dest_port}</span> : null}
                            {a.proto ? <span className="q__proto">{a.proto}</span> : null}
                          </span>
                        </span>

                        <span className="q__side">
                          <EngineBadge engine={a.source_nids} />
                          <span className="q__meta">
                            <StatusBadge status={a.status} />
                            <span className="q__age ui-mono">{relTime(a.timestamp)}</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <aside className="dash-rail">
              <section className="ops" aria-labelledby="dash-sev-h">
                <div className="ops__head">
                  <h2 className="ops__title" id="dash-sev-h">Severity mix</h2>
                </div>
                <div className="rail">
                  {loading
                    ? <LoadingRows rows={2} label="Loading severity mix" />
                    : <SeverityDonut counts={stats.counts} />}
                </div>
              </section>

              {/* The multi-engine premise, stated from stored data rather
                  than from configuration. Never a health check. */}
              <section className="ops" aria-labelledby="dash-eng-h">
                <div className="ops__head">
                  <h2 className="ops__title" id="dash-eng-h">Engine coverage</h2>
                </div>
                <ul className="engrail">
                  {ENGINES.map((e) => {
                    const active = stats.engines.has(e);
                    const count = alerts.filter(
                      (a) => String(a.source_nids || "").toUpperCase() === e
                    ).length;
                    const share = alerts.length ? (count / alerts.length) * 100 : 0;
                    return (
                      <li
                        key={e}
                        className={`engrow engrow--${e.toLowerCase()}${active ? " is-active" : ""}`}
                      >
                        <EngineMark engine={e} />
                        <span className="engrow__body">
                          <span className="engrow__name">{e}</span>
                          <span className="engrow__track" aria-hidden="true">
                            <span className="engrow__fill" style={{ width: `${share}%` }} />
                          </span>
                        </span>
                        <span className="engrow__count">{loading ? "—" : count}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="engrail__note">
                  Reflects stored alerts, not a live health check.
                </p>
              </section>
            </aside>
          </div>

          <section className="ops" aria-labelledby="dash-activity-h">
            <div className="ops__head">
              <h2 className="ops__title" id="dash-activity-h">Activity by hour</h2>
              <span className="ops__meta">Bucketed by the hour the engine reported</span>
            </div>
            <div className="chartpanel">
              {loading
                ? <LoadingRows rows={2} label="Loading activity" />
                : <ActivityChart alerts={alerts} />}
            </div>
          </section>

          <div className="dash-grid dash-grid--even">
            <TopList
              title="Most frequent sources"
              hint="Addresses appearing across the most stored alerts."
              items={loading ? [] : topSources}
              emptyText={loading ? "Loading…" : "No source addresses recorded."}
            />
            <TopList
              title="Most frequent signatures"
              hint="Rules firing most often across stored alerts."
              items={loading ? [] : topSignatures}
              emptyText={loading ? "Loading…" : "No signatures recorded."}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default Dashboard;
