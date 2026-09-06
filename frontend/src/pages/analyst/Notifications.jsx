import { useMemo, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  PageHeader, Button, Notice, Icon, SeverityBadge, StatusBadge, EngineBadge,
  FilterBar, SelectFilter, EmptyState, ErrorState, LoadingRows,
  sourceOf, destOf,
} from "../../components/ui";
import "./analyst.css";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

/**
 * Triage queue.
 *
 * There is no notification service behind this page: it is a view over
 * alerts that have not yet been resolved. Two things were previously
 * misrepresented here and are now stated plainly:
 *
 *  1. The action labelled "mark as read" PATCHed the alert to
 *     `investigating` — a triage state change, not a read receipt. The
 *     control now says what it does.
 *  2. Failures were swallowed and the row was marked read locally
 *     anyway, so the UI claimed a change the server never accepted.
 *     Failures now surface and the row is left untouched.
 *
 * The "Channel" filter offered a single value (Dashboard) because no
 * delivery channels exist, so it has been removed.
 */

const SEVERITY_OPTIONS = [
  { value: "ALL", label: "All severities" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

/** Severity ordering used to sort the queue, matching the page's promise. */
const SEV_RANK = { high: 0, medium: 1, low: 2 };

const STATUS_OPTIONS = [
  { value: "OPEN", label: "Needs triage" },
  { value: "resolved", label: "Resolved" },
  { value: "ALL", label: "All" },
];

function Notifications() {
  const navigate = useNavigate();

  const [severity, setSeverity] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/alerts`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      setError("Could not reach the API. No alerts loaded.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  /** Moves an alert into `investigating`. Only updates the row on success. */
  const startInvestigating = async (id) => {
    setBusyId(id);
    setActionError("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/alerts/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: "investigating" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: "investigating" } : a))
      );
    } catch {
      setActionError(
        "Could not update that alert. Its status is unchanged — check the API and try again."
      );
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    return items
      .filter((a) => {
        const sev = (a.severity_label || "").toLowerCase();
        const st = (a.status || "new").toLowerCase();
        const sevMatch = severity === "ALL" || sev === severity;
        const stMatch =
          statusFilter === "ALL" ||
          (statusFilter === "OPEN" ? st !== "resolved" : st === statusFilter);
        return sevMatch && stMatch;
      })
      // The header promises "most severe first"; sort so it is actually true.
      .sort((a, b) => {
        const s = (SEV_RANK[(a.severity_label || "").toLowerCase()] ?? 9)
                - (SEV_RANK[(b.severity_label || "").toLowerCase()] ?? 9);
        if (s !== 0) return s;
        return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
      });
  }, [items, severity, statusFilter]);

  const openCount = useMemo(
    () => items.filter((a) => (a.status || "new").toLowerCase() !== "resolved").length,
    [items]
  );

  const fmtWhen = (ts) => {
    if (!ts) return "—";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleString([], {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <>
      <PageHeader
        title="Triage queue"
        subtitle="Alerts that have not been resolved yet, most severe first. This is a view over stored alerts — IntruSight does not deliver notifications by email, chat or any other channel."
        actions={
          <Button onClick={fetchAlerts} loading={loading}>
            <Icon.refresh /> Refresh
          </Button>
        }
      />

      {actionError && <Notice tone="error" className="nt-notice">{actionError}</Notice>}

      <FilterBar count={`${filtered.length} shown · ${openCount} open`}>
        <SelectFilter label="Severity" value={severity} onChange={setSeverity} options={SEVERITY_OPTIONS} />
        <SelectFilter label="Status" value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} />
      </FilterBar>

      <div className="table-container">
        {loading ? (
          <LoadingRows rows={5} label="Loading triage queue" />
        ) : error ? (
          <ErrorState onRetry={fetchAlerts}>{error}</ErrorState>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="inbox"
            title={items.length ? "Nothing matches these filters" : "Queue is clear"}
          >
            {items.length
              ? "Try widening the severity or status filter."
              : "No alerts are waiting for triage. New alerts appear here as engines report them."}
          </EmptyState>
        ) : (
          <ul className="triage-list">
            {filtered.map((a) => {
              const status = (a.status || "new").toLowerCase();
              return (
                <li key={a.id} className="triage-item">
                  <div className="triage-item__lead">
                    <SeverityBadge severity={a.severity_label} />
                  </div>

                  <div className="triage-item__body">
                    <p className="triage-item__title">{a.signature || "Unnamed event"}</p>
                    <p className="triage-item__meta">
                      <span className="ui-mono">{sourceOf(a) || "—"}</span>
                      <span aria-hidden="true">→</span>
                      <span className="ui-mono">{destOf(a) || "—"}</span>
                      <span className="triage-item__dot" aria-hidden="true" />
                      <span>{fmtWhen(a.timestamp)}</span>
                    </p>
                  </div>

                  <div className="triage-item__tags">
                    <EngineBadge engine={a.source_nids} />
                    <StatusBadge status={status} />
                  </div>

                  <div className="triage-item__actions">
                    {status === "new" && (
                      <Button
                        size="sm"
                        onClick={() => startInvestigating(a.id)}
                        disabled={busyId === a.id}
                      >
                        {busyId === a.id ? "Saving…" : "Start investigating"}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => navigate(`/alert/${a.id}`, { state: { alert: a } })}
                    >
                      <Icon.eye /> Open
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

export default Notifications;
