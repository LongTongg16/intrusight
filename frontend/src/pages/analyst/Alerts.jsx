import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { refreshAllLocations } from "../../services/api";
import {
  PageHeader, Button, Notice, Icon, SeverityBadge, StatusBadge, EngineBadge,
  FilterBar, SelectFilter, SearchFilter, EmptyState, ErrorState, LoadingRows, relTime,
  KindBadge, isObservation, sourceOf, destOf, isMacRecord,
} from "../../components/ui";
import "./analyst.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

/** Severity filter maps to the numeric `severity` the API expects. */
const SEVERITY_PARAM = { High: "1", Medium: "2", Low: "3" };

const SEVERITY_OPTIONS = [
  { value: "", label: "All severities" },
  { value: "High", label: "High" },
  { value: "Medium", label: "Medium" },
  { value: "Low", label: "Low" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "investigating", label: "Investigating" },
  { value: "resolved", label: "Resolved" },
];

/* The four engines IntruSight normalises, each contributing a different kind of
   visibility. Filtering by engine is how an analyst compares those roles. */
const ENGINE_OPTIONS = [
  { value: "", label: "All engines" },
  { value: "SURICATA", label: "Suricata — signatures" },
  { value: "SNORT", label: "Snort — rules" },
  { value: "ZEEK", label: "Zeek — network context" },
  { value: "KISMET", label: "Kismet — wireless" },
];

/* A detection asserts a rule matched. An observation describes what was seen.
   Separating them keeps context out of the triage count. */
const KIND_OPTIONS = [
  { value: "", label: "All records" },
  { value: "detection", label: "Detections" },
  { value: "observation", label: "Observations" },
];

const PER_PAGE = 12;

const fmtDate = (ts) => {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return {
    time: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    date: d.toLocaleDateString([], { day: "2-digit", month: "short" }),
  };
};

const locationLabel = (loc) => {
  if (!loc) return null;
  if (loc.city) return `${loc.city}, ${loc.country_name || loc.country || ""}`.replace(/,\s*$/, "");
  return loc.country_name || loc.country || null;
};

const Alerts = () => {
  const navigate = useNavigate();

  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [engineFilter, setEngineFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [page, setPage] = useState(1);
  const [refreshingLocations, setRefreshingLocations] = useState(false);
  const [locationError, setLocationError] = useState("");

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (SEVERITY_PARAM[severityFilter]) params.append("severity", SEVERITY_PARAM[severityFilter]);
      if (statusFilter) params.append("status", statusFilter);
      const qs = params.toString();

      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/alerts${qs ? `?${qs}` : ""}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAlerts(data.items || []);
    } catch {
      setError("Could not reach the API. No alerts loaded.");
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [severityFilter, statusFilter]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);
  useEffect(() => { setPage(1); }, [search, severityFilter, statusFilter, engineFilter, kindFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Searching only the IP fields missed Kismet entirely, and missed the
    // engine-native detail (SSID, DNS name, TLS server name) that is the whole
    // reason those records are here.
    return alerts.filter((a) => {
      if (engineFilter && String(a.source_nids || "").toUpperCase() !== engineFilter) return false;
      if (kindFilter && (a.event_kind || "detection") !== kindFilter) return false;
      if (!q) return true;
      const context = Object.values(a.engine_context || {})
        .filter((v) => typeof v === "string" || typeof v === "number")
        .join(" ");
      return [
        sourceOf(a), destOf(a), a.signature, a.dest_port, a.proto,
        a.source_nids, a.category, a.observation_type, context,
      ].join(" ").toLowerCase().includes(q);
    });
  }, [alerts, search, engineFilter, kindFilter]);

  const counts = useMemo(() => {
    // Observations carry the informational level because the shared scale has
    // no "not graded" value. Counting them as low severity would inflate that
    // bucket with records no engine ever assessed.
    const c = { high: 0, medium: 0, low: 0, observations: 0 };
    alerts.forEach((a) => {
      if (isObservation(a)) { c.observations += 1; return; }
      const k = (a.severity_label || "").toLowerCase();
      if (k in c) c[k] += 1;
    });
    return c;
  }, [alerts]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const pageWindow = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const wanted = new Set([1, totalPages, page, page - 1, page + 1]);
    const sorted = [...wanted].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
    return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? ["…", p] : [p]));
  }, [page, totalPages]);

  const exportCSV = () => {
    const headers = ["Record", "Type", "Severity", "Signature", "Source", "Destination",
                     "Endpoint kind", "Location", "Port", "Protocol", "Engine", "Time", "Status"];
    const rows = filtered.map((a) => [
      a.event_kind || "detection",
      a.observation_type || "",
      isObservation(a) ? "" : (a.severity_label || ""),
      a.signature || "", sourceOf(a) || "", destOf(a) || "",
      a.asset_kind || "", locationLabel(a.dest_location) || "",
      a.dest_port || "", a.proto || "",
      a.source_nids || "", a.timestamp || "", a.status || "",
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "alerts_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleRefreshLocations = async () => {
    setRefreshingLocations(true);
    setLocationError("");
    try {
      await refreshAllLocations();
      await fetchAlerts();
    } catch {
      setLocationError("Location lookup failed. Existing locations are unchanged.");
    } finally {
      setRefreshingLocations(false);
    }
  };

  const clearFilters = () => { setSearch(""); setSeverityFilter(""); setStatusFilter(""); };
  const hasFilters = Boolean(search || severityFilter || statusFilter || engineFilter || kindFilter);

  return (
    <>
      <PageHeader
        title="Alerts"
        subtitle="Every alert reported by a configured engine, newest first. Severity and status filter on the server; search runs across the loaded set."
        actions={
          <>
            <Button onClick={handleRefreshLocations} loading={refreshingLocations}>
              <Icon.map />
              {refreshingLocations ? "Resolving…" : "Resolve locations"}
            </Button>
            <Button onClick={exportCSV} disabled={!filtered.length}>
              <Icon.download /> Export CSV
            </Button>
          </>
        }
      />

      {locationError && <Notice tone="warning" className="nt-notice">{locationError}</Notice>}

      {/* Operational summary: one strip, not four marketing tiles. */}
      <ul className="stat-strip">
        <li className="stat-strip__item stat-strip__item--lead">
          <span className="stat-strip__value">{loading ? "—" : alerts.length}</span>
          <span className="stat-strip__label">
            {loading ? "Total loaded" : `Loaded · ${counts.observations} context`}
          </span>
        </li>
        {[
          ["high", "High"],
          ["medium", "Medium"],
          ["low", "Low"],
        ].map(([key, label]) => (
          <li key={key} className={`stat-strip__item stat-strip__item--${key}`}>
            <span className="stat-strip__value">{loading ? "—" : counts[key]}</span>
            <span className="stat-strip__label">{label} severity</span>
          </li>
        ))}
      </ul>

      <FilterBar count={hasFilters ? `${filtered.length} of ${alerts.length}` : `${alerts.length} alerts`}>
        <SearchFilter
          value={search}
          onChange={setSearch}
          placeholder="Search address, port, signature or engine"
          label="Search alerts"
        />
        <SelectFilter label="Severity" value={severityFilter} onChange={setSeverityFilter} options={SEVERITY_OPTIONS} />
        <SelectFilter label="Status" value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} />
        {/* Filtering by engine is how the four roles are compared side by side. */}
        <SelectFilter label="Engine" value={engineFilter} onChange={setEngineFilter} options={ENGINE_OPTIONS} />
        <SelectFilter label="Record" value={kindFilter} onChange={setKindFilter} options={KIND_OPTIONS} />
      </FilterBar>

      <div className="table-container">
        {loading ? (
          <LoadingRows rows={6} label="Loading alerts" />
        ) : error ? (
          <ErrorState onRetry={fetchAlerts}>{error}</ErrorState>
        ) : current.length === 0 ? (
          <EmptyState
            icon={hasFilters ? "search" : "inbox"}
            title={hasFilters ? "No alerts match these filters" : "No alerts stored yet"}
            actions={hasFilters
              ? <Button size="sm" onClick={clearFilters}>Clear filters</Button>
              : undefined}
          >
            {hasFilters
              ? "Try a broader severity or status, or clear the search."
              : "Run one of the ingestor scripts (Suricata, Snort, Zeek or Kismet) to load alerts from your sensor output."}
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="alerts-table alerts-table--actions altable">
              <caption className="visually-hidden">Intrusion detection alerts</caption>
              <thead>
                <tr>
                  <th scope="col">Severity</th>
                  <th scope="col">Event</th>
                  <th scope="col">Connection</th>
                  <th scope="col">Engine</th>
                  <th scope="col">Status</th>
                  <th scope="col">Reported</th>
                  <th scope="col"><span className="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {current.map((a) => {
                  const when = fmtDate(a.timestamp);
                  const place = locationLabel(a.dest_location);
                  const hasGeo = a.dest_location?.latitude != null && a.dest_location?.longitude != null;
                  return (
                    <tr
                      key={a.id}
                      className={`altable__row altable__row--${(a.severity_label || "").toLowerCase()}${
                        isObservation(a) ? " altable__row--observation" : ""
                      }`}
                    >
                      {/* An observation has no severity of its own. Showing a
                          badge would imply the engine graded it. */}
                      <td>
                        {isObservation(a)
                          ? <span className="altable__nosev" aria-label="Not a severity-graded detection">—</span>
                          : <SeverityBadge severity={a.severity_label} />}
                      </td>

                      {/* The signature is the thing an analyst reads first, so
                          it leads and the category sits under it as context. */}
                      <td>
                        <span className="altable__sig">{a.signature || "Unnamed event"}</span>
                        <span className="altable__cat">
                          <KindBadge record={a} />
                          {a.category && <span>{a.category}</span>}
                        </span>
                      </td>

                      {/* Source and destination belong together — split across
                          three columns they read as unrelated values. Kismet
                          reports MACs, so endpoints come from the asset fields. */}
                      <td>
                        <span className="altable__flow ui-mono">
                          <span className="altable__ip">{sourceOf(a) || "—"}</span>
                          <span className="altable__arrow" aria-hidden="true">→</span>
                          <span className="altable__ip">{destOf(a) || "—"}</span>
                          {a.dest_port ? <span className="altable__port">:{a.dest_port}</span> : null}
                        </span>
                        <span className="altable__sub">
                          {a.proto && <span className="altable__proto">{a.proto}</span>}
                          {isMacRecord(a) && <span className="altable__proto">MAC</span>}
                          {place && <span className="altable__geo">{place}</span>}
                        </span>
                      </td>

                      <td><EngineBadge engine={a.source_nids} /></td>
                      <td><StatusBadge status={a.status} /></td>

                      <td className="altable__when">
                        <span className="altable__age">{relTime(a.timestamp)}</span>
                        {when && <span className="altable__abs ui-mono">{when.date} {when.time}</span>}
                      </td>

                      <td>
                        <div className="alerts-rowactions">
                          <Link
                            to={`/alert/${a.id}`}
                            state={{ alert: a }}
                            className="ui-btn ui-btn--ghost ui-btn--sm"
                          >
                            <Icon.eye />
                            <span className="visually-hidden">Open {a.signature || "alert"}</span>
                          </Link>
                          {hasGeo && (
                            <button
                              type="button"
                              className="ui-btn ui-btn--ghost ui-btn--sm"
                              onClick={() => navigate(`/threat-map?alertId=${a.id}`)}
                            >
                              <Icon.map />
                              <span className="visually-hidden">Show on threat map</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && !error && filtered.length > PER_PAGE && (
        <nav className="pagination" aria-label="Alert pages">
          <p>
            Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} of {filtered.length}
          </p>
          <div className="pages">
            <button className="page-nav" onClick={() => setPage((p) => p - 1)} disabled={page === 1} aria-label="Previous page">‹</button>
            {pageWindow.map((p, i) => (
              <button
                key={`${p}-${i}`}
                className={`page-number ${p === page ? "active" : ""} ${p === "…" ? "dots" : ""}`}
                onClick={() => p !== "…" && setPage(p)}
                disabled={p === "…"}
                aria-current={p === page ? "page" : undefined}
              >{p}</button>
            ))}
            <button className="page-nav" onClick={() => setPage((p) => p + 1)} disabled={page === totalPages} aria-label="Next page">›</button>
          </div>
        </nav>
      )}
    </>
  );
};

export default Alerts;
