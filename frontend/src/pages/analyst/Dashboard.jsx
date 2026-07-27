import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FiEye, FiRefreshCw } from 'react-icons/fi';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
  ScatterChart, Scatter, ZAxis,
} from 'recharts';
import './analyst.css';
import AnalystSidebar from './AnalystSidebar';

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  "http://localhost:8000";

const SEV_COLORS = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' };

const DistributionChart = ({ high = 0, medium = 0, low = 0, chartType = 'donut' }) => {
  const pieData = [
    { name: 'High', value: high, color: SEV_COLORS.high },
    { name: 'Medium', value: medium, color: SEV_COLORS.medium },
    { name: 'Low', value: low, color: SEV_COLORS.low },
  ].filter(d => d.value > 0);

  const barData = [
    { name: 'High', count: high, fill: SEV_COLORS.high },
    { name: 'Medium', count: medium, fill: SEV_COLORS.medium },
    { name: 'Low', count: low, fill: SEV_COLORS.low },
  ];

  if (chartType === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
          <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
          <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
          <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-main)' }} />
          {barData.map(d => (
            <Bar key={d.name} dataKey="count" data={[d]} fill={d.fill} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={160}>
      <PieChart>
        <Pie
          data={pieData.length ? pieData : [{ name: 'None', value: 1, color: 'var(--border-color)' }]}
          cx="50%" cy="50%"
          innerRadius={chartType === 'donut' ? 35 : 0}
          outerRadius={60}
          dataKey="value"
          strokeWidth={0}
        >
          {(pieData.length ? pieData : [{ color: 'var(--border-color)' }]).map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-main)' }} />
        <Legend formatter={(v) => <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{v}</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
};

const TrendsChart = ({ alerts = [], chartType = 'bar' }) => {
  const hourMap = {};
  alerts.forEach(a => {
    if (!a.timestamp) return;
    const d = new Date(a.timestamp);
    const key = `${d.getHours().toString().padStart(2, '0')}:00`;
    if (!hourMap[key]) hourMap[key] = { time: key, high: 0, medium: 0, low: 0 };
    hourMap[key][a.severity_label] = (hourMap[key][a.severity_label] || 0) + 1;
  });
  const data = Object.values(hourMap).sort((a, b) => a.time.localeCompare(b.time));

  if (!data.length) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: 'var(--text-muted)', fontSize: '0.85rem' }}>No trend data available</div>;
  }

  const commonProps = {
    data,
    margin: { top: 4, right: 8, bottom: 4, left: -20 },
  };
  const axisProps = { tick: { fill: 'var(--text-muted)', fontSize: 11 } };
  const tooltipStyle = { contentStyle: { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-main)' } };
  const gridProps = { strokeDasharray: "3 3", stroke: "var(--border-color)" };

  if (chartType === 'radar') {
    return (
      <ResponsiveContainer width="100%" height={160}>
        <LineChart {...commonProps}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="time" {...axisProps} />
          <YAxis {...axisProps} />
          <Tooltip {...tooltipStyle} />
          <Legend formatter={(v) => <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{v}</span>} />
          <Line type="monotone" dataKey="high" stroke={SEV_COLORS.high} strokeWidth={2} dot={{ r: 3, fill: SEV_COLORS.high }} activeDot={{ r: 5 }} />
          <Line type="monotone" dataKey="medium" stroke={SEV_COLORS.medium} strokeWidth={2} dot={{ r: 3, fill: SEV_COLORS.medium }} activeDot={{ r: 5 }} />
          <Line type="monotone" dataKey="low" stroke={SEV_COLORS.low} strokeWidth={2} dot={{ r: 3, fill: SEV_COLORS.low }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'scatter') {
    const toScatter = (sev) =>
      alerts
        .filter(a => a.severity_label === sev && a.timestamp)
        .map(a => {
          const d = new Date(a.timestamp);
          return { x: d.getHours() + d.getMinutes() / 60, y: 1, z: 1 };
        });

    return (
      <ResponsiveContainer width="100%" height={160}>
        <ScatterChart margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
          <CartesianGrid {...gridProps} />
          <XAxis type="number" dataKey="x" name="Hour" domain={[0, 23]} tickCount={8}
            tickFormatter={v => `${Math.floor(v)}:00`} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
          <YAxis type="number" dataKey="y" hide />
          <ZAxis type="number" dataKey="z" range={[20, 20]} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ payload }) => {
              if (!payload?.length) return null;
              const h = Math.floor(payload[0]?.value);
              return (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: 'var(--text-main)' }}>
                  {`${h}:00 – ${h + 1}:00`}
                </div>
              );
            }}
          />
          <Legend formatter={(v) => <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{v}</span>} />
          <Scatter name="high" data={toScatter('high')} fill={SEV_COLORS.high} fillOpacity={0.8} />
          <Scatter name="medium" data={toScatter('medium')} fill={SEV_COLORS.medium} fillOpacity={0.8} />
          <Scatter name="low" data={toScatter('low')} fill={SEV_COLORS.low} fillOpacity={0.8} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart {...commonProps}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="time" {...axisProps} />
        <YAxis {...axisProps} />
        <Tooltip {...tooltipStyle} />
        <Legend formatter={(v) => <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{v}</span>} />
        <Bar dataKey="high" fill={SEV_COLORS.high} radius={[3, 3, 0, 0]} />
        <Bar dataKey="medium" fill={SEV_COLORS.medium} radius={[3, 3, 0, 0]} />
        <Bar dataKey="low" fill={SEV_COLORS.low} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
};

const ChartTypeBtn = ({ active, onClick, label }) => (
  <button onClick={onClick} style={{
    background: active ? 'var(--accent-main)' : 'transparent',
    border: '1px solid var(--border-color)',
    borderRadius: 4,
    color: active ? '#fff' : 'var(--text-muted)',
    padding: '2px 8px',
    cursor: 'pointer',
    fontSize: '0.72rem',
  }}>{label}</button>
);

const Dashboard = () => {
  const navigate = useNavigate();

  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backendStatus, setBackendStatus] = useState("Connecting…");
  const [telegramId, setTelegramId] = useState("");
  const [trendsChartType, setTrendsChartType] = useState('bar');
  const [distChartType, setDistChartType] = useState('donut');
  const [alertPage, setAlertPage] = useState(1);
  const ALERTS_PER_PAGE = 10;

  const high = alerts.filter(a => a.severity_label === "high").length;
  const medium = alerts.filter(a => a.severity_label === "medium").length;
  const low = alerts.filter(a => a.severity_label === "low").length;
  const total = alerts.length;

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/alerts`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setAlerts(data.items || []);
      setBackendStatus(`✅ Connected — ${data.items?.length ?? 0} alert(s) loaded`);
    } catch {
      setBackendStatus("⚠️ Backend offline — showing no live data");
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE}/api/users/profile`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        setTelegramId(data.telegram_id);
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
    fetchUser();
  }, []);

  const handleViewAlert = (alert) => navigate(`/alert/${alert.id}`, { state: { alert } });

  const sendTelegramMessage = async (alertData) => {
    if (!telegramId) {
      alert("No Telegram ID set in profile!");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/alerts/send-telegram`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ alert_id: alertData.id })
      });

      const data = await res.json();
      if (data.ok) {
        alert("Telegram message sent!");
      } else {
        alert("Failed to send Telegram message");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to send Telegram message");
    }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h1 className="page-title">Dashboard Overview</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.8rem', color: backendStatus.startsWith('✅') ? '#22c55e' : '#f59e0b' }}>
            {backendStatus}
          </span>
          <button onClick={fetchData}
            style={{ background: 'transparent', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-muted)', padding: '0.35rem 0.6rem', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <FiRefreshCw /> Refresh
          </button>
        </div>
      </div>

      <div className="summary-cards">
        <div className="card card-total">
          <span className="card-icon">!</span>
          <div className="card-label">Total Alerts</div>
          <hr style={{ borderColor: 'var(--border-color)', opacity: 0.2 }} />
          <div className="card-value">{loading ? '…' : total}</div>
        </div>
        <div className="card card-high">
          <span className="card-icon">!</span>
          <div className="card-label">High Severity</div>
          <hr style={{ borderColor: 'var(--border-color)', opacity: 0.2 }} />
          <div className="card-value">{loading ? '…' : high}</div>
        </div>
        <div className="card card-medium">
          <span className="card-icon">!</span>
          <div className="card-label">Medium Severity</div>
          <hr style={{ borderColor: 'var(--border-color)', opacity: 0.2 }} />
          <div className="card-value">{loading ? '…' : medium}</div>
        </div>
        <div className="card card-low">
          <span className="card-icon">!</span>
          <div className="card-label">Low Severity</div>
          <hr style={{ borderColor: 'var(--border-color)', opacity: 0.2 }} />
          <div className="card-value">{loading ? '…' : low}</div>
        </div>
      </div>

      <div className="trends-distribution-row">
        <div className="trends-card" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div className="trends-header">
            <span style={{ color: 'var(--text-main)' }}>Threat Trends</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[['bar','Bar'],['radar','Line'],['scatter','Scatter']].map(([v,l]) => (
                <ChartTypeBtn key={v} active={trendsChartType === v} onClick={() => setTrendsChartType(v)} label={l} />
              ))}
            </div>
          </div>
          <TrendsChart alerts={alerts} chartType={trendsChartType} />
        </div>
        <div className="distribution-card" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div className="distribution-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-main)' }}>
            <span>Alerts Distribution</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[['donut','Donut'],['pie','Pie'],['bar','Bar']].map(([v,l]) => (
                <ChartTypeBtn key={v} active={distChartType === v} onClick={() => setDistChartType(v)} label={l} />
              ))}
            </div>
          </div>
          <DistributionChart high={high} medium={medium} low={low} chartType={distChartType} />
        </div>
      </div>

      <div className="recent-alerts-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ color: 'var(--text-main)', margin: 0 }}>Recent Alerts</h2>
          <Link to="/alerts" style={{ color: 'var(--accent-primary)', fontSize: '0.85rem', textDecoration: 'none' }}>
            View all alerts →
          </Link>
        </div>
        {loading ? (
          <p style={{ color: 'var(--text-muted)', padding: '1rem 0' }}>Loading alerts…</p>
        ) : alerts.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', padding: '1rem 0' }}>
            No alerts found. Run <code>eve_ingestor.py</code> to ingest sample data.
          </p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="alerts-table">
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Alert Type</th>
                    <th>Source IP</th>
                    <th>Destination IP</th>
                    <th>Protocol</th>
                    <th>Time</th>
                    <th>Status</th>
                    <th>View</th>
                    <th>Telegram</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.slice((alertPage - 1) * ALERTS_PER_PAGE, alertPage * ALERTS_PER_PAGE).map((alert) => (
                    <tr key={alert.id}>
                      <td><span className={`severity-badge ${alert.severity_label}`}>{alert.severity_label}</span></td>
                      <td style={{ color: 'var(--text-main)', textTransform: 'capitalize' }}>{alert.signature}</td>
                      <td style={{ fontFamily: 'monospace', color: 'var(--accent-primary)' }}>{alert.src_ip}</td>
                      <td style={{ fontFamily: 'monospace', color: 'var(--text-main)' }}>{alert.dest_ip}</td>
                      <td style={{ color: 'var(--text-main)' }}>{alert.proto}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                      </td>
                      <td><span className={`progress-badge ${alert.status}`}>{alert.status}</span></td>
                      <td>
                        <button className="view-btn" onClick={() => handleViewAlert(alert)} title="View details">
                          <FiEye />
                        </button>
                      </td>
                      <td>
                        <button className="telegram-btn" onClick={() => sendTelegramMessage(alert)}>Send</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination" style={{ marginTop: '0.75rem' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Showing {alerts.length === 0 ? 0 : (alertPage - 1) * ALERTS_PER_PAGE + 1}–{Math.min(alertPage * ALERTS_PER_PAGE, alerts.length)} of {alerts.length} alerts
              </p>
              <div className="pages">
                <button
                  className="page-nav"
                  onClick={() => setAlertPage(p => p - 1)}
                  disabled={alertPage === 1}
                >‹</button>
                {Array.from({ length: Math.ceil(alerts.length / ALERTS_PER_PAGE) }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    className={`page-number ${page === alertPage ? 'active' : ''}`}
                    onClick={() => setAlertPage(page)}
                  >{page}</button>
                ))}
                <button
                  className="page-nav"
                  onClick={() => setAlertPage(p => p + 1)}
                  disabled={alertPage === Math.ceil(alerts.length / ALERTS_PER_PAGE)}
                >›</button>
              </div>
            </div>
          </>
        )}
      </div>

      <footer className="footer" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)' }}>
        <p>© 2026 Intrusion Detection Dashboard</p>
      </footer>
    </>
  );
};

export default Dashboard;
