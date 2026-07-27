import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import "./admin.css";

const styles = {
  content: { padding: "24px", display: "flex", flexDirection: "column", gap: "24px" },
  sectionLabel: { fontSize: "0.9rem", fontWeight: "700", textTransform: "uppercase", color: "var(--admin-secondary)", marginBottom: "16px" },
  tableSection: { background: "var(--admin-card)", border: "1px solid var(--admin-border)", borderRadius: "10px", overflow: "hidden" },
  tableHeaderSection: { padding: "20px 24px", borderBottom: "1px solid var(--admin-border)" },
  tableTitle: { margin: 0, fontSize: "1.1rem", fontWeight: "600" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { padding: "12px 24px", textAlign: "left", fontSize: "0.75rem", textTransform: "uppercase", color: "var(--admin-secondary)", borderBottom: "1px solid var(--admin-border)" },
  tr: { borderBottom: "1px solid var(--admin-border)" },
  td: { padding: "16px 24px", fontSize: "0.85rem" }
};

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

const getAuthHeader = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
});

const SEVERITY_ORDER  = { high: 0, medium: 1, low: 2 };
const SEVERITY_COLORS = { high: "#f97316", medium: "#eab308", low: "#3b82f6" };
const SEVERITY_LABELS  = ["high", "medium", "low"];
const SEVERITY_DISPLAY = { high: "High", medium: "Medium", low: "Low" };

// ── Sub-components ────────────────────────────────────────────
function SummaryCard({ label, value, sub, color }) {
  return (
    <div className="admin-card" style={{ flex: 1, minWidth: "200px", padding: "20px 24px" }}>
      <div style={{ fontSize: "0.78rem", color: "var(--admin-secondary)", marginBottom: "8px", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: "2rem", fontWeight: "700", color: color || "var(--admin-text)", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: "0.75rem", color: "var(--admin-secondary)", marginTop: "6px" }}>{sub}</div>}
    </div>
  );
}

function SeverityBar({ label, count, max, color }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div style={{ marginBottom: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
        <span style={{ fontSize: "0.82rem", color: "var(--admin-secondary)" }}>{label}</span>
        <span style={{ fontSize: "0.82rem", color, fontWeight: "600" }}>{count}</span>
      </div>
      <div style={{ background: "var(--admin-border)", borderRadius: "4px", height: "6px" }}>
        <div style={{ width: `${pct}%`, background: color, borderRadius: "4px", height: "6px", transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
function AdminDashboard({ logs: logsProp = [], onRefreshLogs }) {
  const [alerts, setAlerts]           = useState([]);
  const [summary, setSummary]         = useState({ total: 0, severity_summary: { high: 0, medium: 0, low: 0 } });
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [logs, setLogs]               = useState(logsProp);
  const PAGE_SIZE = 10;

  useEffect(() => { setLogs(logsProp); }, [logsProp]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [alertsRes, summaryRes] = await Promise.all([
        axios.get(`${API_BASE}/api/alerts`, getAuthHeader()),
        axios.get(`${API_BASE}/api/alerts/dashboard/summary`, getAuthHeader()),
      ]);
      
      setAlerts(alertsRes.data.items || alertsRes.data || []);
      setSummary(summaryRes.data || { total: 0, severity_summary: { high: 0, medium: 0, low: 0 } });
      setCurrentPage(1);
    } catch (err) {
      console.error("Dashboard Fetch Error:", err);
      setError("Server Error (500): Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    if (typeof onRefreshLogs === "function") onRefreshLogs();
  }, [fetchData, onRefreshLogs]);

  const nidsServices = ["Suricata", "Snort", "Zeek", "Kismet"];
  const nidsStatus = nidsServices.map((serviceName) => {
    const match = logs?.find((log) => log.name?.toLowerCase().includes(serviceName.toLowerCase()));
    return {
      name: serviceName,
      status: match?.status === "Active" ? "running" : "stopped",
    };
  });

  const activeCount  = nidsStatus.filter((s) => s.status === "running").length;
  const stoppedCount = nidsStatus.filter((s) => s.status === "stopped").length;
  const severityCounts   = summary?.severity_summary || { high: 0, medium: 0, low: 0 };
  const maxSeverityCount = Math.max(...Object.values(severityCounts), 1);

  const categoryCounts = alerts.reduce((acc, a) => {
    if (a.category) acc[a.category] = (acc[a.category] || 0) + 1;
    return acc;
  }, {});

  const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];

  const sortedAlerts = [...alerts].sort((a, b) => {
    const sevDiff = (SEVERITY_ORDER[a.severity_label] ?? 99) - (SEVERITY_ORDER[b.severity_label] ?? 99);
    if (sevDiff !== 0) return sevDiff;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  const formatTime = (iso) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch { return iso; }
  };

  const pagedAlerts = sortedAlerts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="admin-page" style={styles.content}>
      <div className="admin-section-label" style={styles.sectionLabel}>System Status</div>
      
      {loading ? (
        <div style={{ color: "var(--admin-secondary)", padding: "40px", textAlign: "center" }}>
          Loading Dashboard Data...
        </div>
      ) : error ? (
        <div style={{ background: "#fef2f2", border: "1px solid #fee2e2", borderRadius: "8px", padding: "20px", marginBottom: "20px" }}>
          <span style={{ color: "#dc2626", fontWeight: "600" }}>⚠️ {error}</span>
          <button onClick={fetchData} style={{ marginLeft: "15px", padding: "5px 12px", borderRadius: "4px", cursor: "pointer" }}>Retry Connection</button>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: "16px", marginBottom: "28px", flexWrap: "wrap" }}>
        <SummaryCard label="Total Alerts" value={summary.total || 0} sub="All time" />
        <SummaryCard label="High Severity" value={severityCounts.high || 0} sub="Requires immediate attention" color="#f97316" />
        <SummaryCard 
          label="Active NIDS Services" 
          value={`${activeCount} / ${nidsServices.length}`} 
          sub={stoppedCount > 0 ? `${stoppedCount} service(s) stopped` : "All services running"}
          color={activeCount === nidsServices.length ? "#10b981" : "#f97316"}
        />
        <SummaryCard label="Top Threat" value={topCategory ? topCategory[0] : "—"} sub={topCategory ? `${topCategory[1]} alert(s)` : "No alerts"} color="#a78bfa" />
      </div>

      <div style={{ display: "flex", gap: "16px", marginBottom: "28px", flexWrap: "wrap" }}>
        <div className="admin-card" style={{ flex: 1, minWidth: "250px", padding: "20px" }}>
          <div className="admin-section-label" style={styles.sectionLabel}>Service Health</div>
          {nidsStatus.map((service) => (
            <div key={service.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px", background: "var(--admin-bg)", borderRadius: "8px", marginBottom: "8px" }}>
              <span style={{ color: "var(--admin-text)", fontSize: "0.85rem" }}>{service.name}</span>
              <span style={{ fontSize: "0.75rem", color: service.status === "running" ? "#10b981" : "#ef4444", fontWeight: "bold" }}>{service.status.toUpperCase()}</span>
            </div>
          ))}
        </div>

        <div className="admin-card" style={{ flex: 1, minWidth: "250px", padding: "20px" }}>
          <div className="admin-section-label" style={styles.sectionLabel}>Severity Distribution</div>
          {SEVERITY_LABELS.map((sev) => (
            <SeverityBar key={sev} label={SEVERITY_DISPLAY[sev]} count={severityCounts[sev] || 0} max={maxSeverityCount} color={SEVERITY_COLORS[sev]} />
          ))}
        </div>
      </div>

      <div className="admin-card" style={styles.tableSection}>
        <div style={styles.tableHeaderSection}>
          <h3 style={styles.tableTitle}>Recent Network Events</h3>
        </div>

        {sortedAlerts.length === 0 && !loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--admin-secondary)" }}>
            No alerts found in database.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {["Time","Severity","Signature","Source IP","Dest IP","Status"].map((h) => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedAlerts.map((alert, index) => (
                  <tr key={alert.id || index} style={styles.tr}>
                    <td style={styles.td}>{formatTime(alert.created_at)}</td>
                    <td style={styles.td}>
                      <span style={{ 
                        padding: "2px 8px", borderRadius: "4px", fontSize: "0.7rem", fontWeight: "bold",
                        background: (SEVERITY_COLORS[alert.severity_label] || "#444") + "22",
                        color: SEVERITY_COLORS[alert.severity_label] || "#444"
                      }}>
                        {alert.severity_label?.toUpperCase() || "LOW"}
                      </span>
                    </td>
                    <td style={{ ...styles.td, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }}>{alert.signature}</td>
                    <td style={styles.td}>{alert.src_ip}</td>
                    <td style={styles.td}>{alert.dest_ip}</td>
                    <td style={styles.td}>{alert.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;
