import { useMemo, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import './analyst.css';

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

function Notifications() {
  const navigate = useNavigate();

  const [severity, setSeverity] = useState("ALL");
  const [status, setStatus] = useState("UNREAD");
  const [channel, setChannel] = useState("ALL");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/alerts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const mapped = (data.items || []).map((alert) => ({
        id:      alert.id,
        sev:     severityMap(alert.severity_label),
        title:   alert.signature || "Unknown Alert",
        ip:      alert.src_ip || "-",
        when:    alert.timestamp
                   ? new Date(alert.timestamp).toLocaleString([], { dateStyle: "short", timeStyle: "short" })
                   : "-",
        channel: "DASHBOARD",
        read:    alert.status === "resolved",
        failed:  false,
        status:  alert.status,
      }));

      setItems(mapped);
    } catch {
      setError("Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const acknowledge = async (id) => {
    try {
      const token = localStorage.getItem("token");
      await fetch(`${API_BASE}/api/alerts/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "investigating" }),
      });
      setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch {
      // silently fail — UI still marks as read locally
      setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    }
  };

  const markAllRead = async () => {
    const token = localStorage.getItem("token");
    const unread = items.filter(n => !n.read);
    await Promise.allSettled(
      unread.map(n =>
        fetch(`${API_BASE}/api/alerts/${n.id}/status`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: "investigating" }),
        })
      )
    );
    setItems(prev => prev.map(n => ({ ...n, read: true })));
  };

  const filtered = useMemo(() => {
    return items.filter((n) => {
      const sevMatch    = severity === "ALL" || n.sev === severity;
      const statusMatch = status   === "ALL" || (status === "UNREAD" ? !n.read : n.read);
      const chanMatch   = channel  === "ALL" || n.channel === channel;
      return sevMatch && statusMatch && chanMatch;
    });
  }, [items, severity, status, channel]);

  const unreadCount = items.filter(n => !n.read).length;

  return (
    <main className="dashboard-main">
      {/* Header */}
      <div className="dashboard-status-bar">
        <div>
          <h1 className="page-title">Notifications</h1>
          <div className="text-sm text-muted">Unread: {unreadCount}</div>
        </div>
        <button className="export-btn" onClick={markAllRead}>
          Mark all as read
        </button>
      </div>

      {/* Filter bar */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="filters" style={{ marginBottom: 0 }}>
          <span className="nav-section-title" style={{ alignSelf: 'center' }}>Filters</span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Severity</span>
            <select className="time-filter" value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="ALL">All</option>
              <option value="HIGH">High</option>
              <option value="MED">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</span>
            <select className="time-filter" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="UNREAD">Unread</option>
              <option value="READ">Read</option>
              <option value="ALL">All</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Channel</span>
            <select className="time-filter" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="ALL">All</option>
              <option value="DASHBOARD">Dashboard</option>
            </select>
          </div>

          <div style={{ marginLeft: 'auto', alignSelf: 'flex-end', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {filtered.length} notification{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* States */}
      {loading && <div className="loading-text">Loading notifications…</div>}
      {error   && <div className="error-banner">⚠️ {error}</div>}

      {/* Notification cards */}
      {!loading && filtered.length === 0 ? (
        <div className="empty-text">No notifications match the current filters.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
          {filtered.map((n) => (
            <div
              key={n.id}
              className="card"
              style={{
                opacity: n.read ? 0.55 : 1,
                borderLeft: `3px solid ${sevColor(n.sev)}`,
                padding: '0.75rem 1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
              }}
            >
              {/* Top row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '0.15rem 0.55rem',
                  borderRadius: '999px',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  backgroundColor: sevBg(n.sev),
                  color: sevColor(n.sev),
                  border: `1px solid ${sevColor(n.sev)}`,
                  flexShrink: 0,
                }}>
                  {n.sev === 'MED' ? 'MEDIUM' : n.sev}
                </span>

                {n.failed && (
                  <span style={{ color: 'var(--color-yellow)', fontSize: '0.72rem', fontWeight: 700 }}>
                    ⚠ Delivery failed
                  </span>
                )}

                <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {n.when}
                </span>
              </div>

              {/* Title */}
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.3 }}>
                {n.title}
              </div>

              {/* Meta */}
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                IP: <span className="src-ip mono" style={{ fontSize: '0.75rem' }}>{n.ip}</span>
                <span style={{ margin: '0 0.3rem' }}>•</span>
                {n.channel}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                {!n.read ? (
                  <button
                    className="view-btn"
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                    onClick={() => acknowledge(n.id)}
                  >
                    ✓ Acknowledge
                  </button>
                ) : (
                  <button
                    className="view-btn"
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                    onClick={() => navigate(`/alert/${n.id}`)}
                  >
                    View
                  </button>
                )}
                <button
                  className="export-btn"
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                  onClick={() => navigate("/alerts")}
                >
                  View Alert →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

/* Severity helpers */
function severityMap(label) {
  if (!label) return "LOW";
  const l = label.toLowerCase();
  if (l === "high")   return "HIGH";
  if (l === "medium") return "MED";
  return "LOW";
}

function sevColor(sev) {
  if (sev === 'HIGH') return '#ef4444';
  if (sev === 'MED')  return '#f59e0b';
  return '#22c55e';
}

function sevBg(sev) {
  if (sev === 'HIGH') return 'rgba(239,68,68,0.12)';
  if (sev === 'MED')  return 'rgba(245,158,11,0.12)';
  return 'rgba(34,197,94,0.12)';
}

export default Notifications;
