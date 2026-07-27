import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import './admin.css';

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

const getAuthHeader = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
});

function DatabaseMaintenance() {
  const [health, setHealth] = useState(null);
  const [stats, setStats] = useState(null);
  const [backups, setBackups] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [purgeDays, setPurgeDays] = useState(90);
  const [confirmModal, setConfirmModal] = useState(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [healthRes, statsRes, backupsRes, logsRes] = await Promise.all([
        axios.get(`${API_BASE}/api/maintenance/health`, getAuthHeader()),
        axios.get(`${API_BASE}/api/maintenance/stats`, getAuthHeader()),
        axios.get(`${API_BASE}/api/maintenance/backups`, getAuthHeader()),
        axios.get(`${API_BASE}/api/maintenance/logs`, getAuthHeader()),
      ]);
      setHealth(healthRes.data);
      setStats(statsRes.data.stats);
      setBackups(backupsRes.data.backups);
      setLogs(logsRes.data.logs);
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const res = await axios.post(`${API_BASE}/api/maintenance/backup`, {}, getAuthHeader());
      showToast(`Backup created: ${res.data.filename}`);
      fetchAll();
    } catch (err) {
      showToast(err.response?.data?.detail || "Backup failed", "error");
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestore = async (filename) => {
    setIsRestoring(true);
    try {
      await axios.post(`${API_BASE}/api/maintenance/restore`, { filename }, getAuthHeader());
      showToast("Restore verified successfully");
      fetchAll();
    } catch (err) {
      showToast(err.response?.data?.detail || "Restore failed", "error");
    } finally {
      setIsRestoring(false);
      setConfirmModal(null);
    }
  };

  const handlePurge = async () => {
    setIsPurging(true);
    try {
      const res = await axios.delete(`${API_BASE}/api/maintenance/alerts/old`, {
        ...getAuthHeader(),
        data: { days: purgeDays },
      });
      showToast(`Purged ${res.data.deleted} alert(s)`);
      fetchAll();
    } catch (err) {
      showToast(err.response?.data?.detail || "Purge failed", "error");
    } finally {
      setIsPurging(false);
      setConfirmModal(null);
    }
  };

  const formatDate = (iso) => {
    try {
      return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return iso;
    }
  };

  if (loading) return (
    <div className="admin-page">
      <div className="admin-loading">Loading maintenance data…</div>
    </div>
  );

  return (
    <div className="admin-page">

      {/* ── Toast ── */}
      {toast && (
        <div className={`maint-toast maint-toast--${toast.type}`}>
          <span className="maint-toast__icon">
            {toast.type === "success" ? "✓" : toast.type === "error" ? "✕" : "ℹ"}
          </span>
          {toast.message}
        </div>
      )}

      {/* ── Confirm Modal ── */}
      {confirmModal && (
        <div className="maint-modal-backdrop" onClick={() => setConfirmModal(null)}>
          <div className="maint-modal" onClick={(e) => e.stopPropagation()}>
            <div className="maint-modal__title">{confirmModal.title}</div>
            {confirmModal.warning && (
              <div className="maint-modal__warning">{confirmModal.warning}</div>
            )}
            <p className="maint-modal__msg">{confirmModal.message}</p>
            <div className="maint-modal__actions">
              <button
                className="maint-btn maint-btn--ghost"
                onClick={() => setConfirmModal(null)}
              >
                Cancel
              </button>
              <button
                className={`maint-btn maint-btn--${confirmModal.variant || "danger"}`}
                onClick={confirmModal.onConfirm}
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page Header ── */}
      <div className="admin-page-header" style={{ marginBottom: "2rem" }}>
        <h1>Database Maintenance</h1>
        <p>Monitor health, manage backups, and perform housekeeping tasks</p>
      </div>

      {/* ── System Health ── */}
      <div className="maint-section-label">System Health</div>
      <div className="maint-card" style={{ marginBottom: "1.5rem" }}>
        <div className="maint-card__header">
          <span className="maint-card__header-title">Current Status</span>
          <button className="maint-btn maint-btn--ghost" onClick={fetchAll}>
            ↻ Refresh
          </button>
        </div>
        <div className="maint-status-grid">
          <div className="maint-status-item">
            <span className="maint-status-item__label">Database Connection</span>
            <span className="maint-status-item__value">
              <span className={`maint-dot ${health?.db_connected ? "maint-dot--on" : "maint-dot--off"}`} />
              {health?.db_connected ? "Connected" : "Disconnected"}
            </span>
          </div>
          <div className="maint-status-item">
            <span className="maint-status-item__label">Total Documents</span>
            <span className="maint-status-item__value maint-stat-num">
              {health?.total_documents?.toLocaleString() ?? "—"}
            </span>
          </div>
          <div className="maint-status-item">
            <span className="maint-status-item__label">Backups Available</span>
            <span className="maint-status-item__value maint-stat-num">
              {health?.backup_count ?? 0}
            </span>
          </div>
          <div className="maint-status-item">
            <span className="maint-status-item__label">Latest Backup</span>
            <span className="maint-status-item__value maint-mono maint-mono--sm">
              {health?.latest_backup ?? "No backups yet"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Collection Statistics ── */}
      <div className="maint-section-label">Collection Statistics</div>
      <div className="maint-summary-grid" style={{ marginBottom: "1.5rem" }}>
        <div className="maint-summary-card maint-summary-card--blue">
          <div className="maint-summary-card__label">Users</div>
          <div className="maint-summary-card__value">{stats?.users?.count ?? 0}</div>
          <div className="maint-summary-card__sub">Registered accounts</div>
        </div>
        <div className="maint-summary-card maint-summary-card--teal">
          <div className="maint-summary-card__label">Log Sources</div>
          <div className="maint-summary-card__value">{stats?.logs?.count ?? 0}</div>
          <div className="maint-summary-card__sub">IDS connections</div>
        </div>
        <div className="maint-summary-card maint-summary-card--amber">
          <div className="maint-summary-card__label">Total Alerts</div>
          <div className="maint-summary-card__value">{stats?.alerts?.count ?? 0}</div>
          <div className="maint-alert-pills">
            <span className="maint-pill maint-pill--high">H: {stats?.alerts?.high ?? 0}</span>
            <span className="maint-pill maint-pill--mid">M: {stats?.alerts?.medium ?? 0}</span>
            <span className="maint-pill maint-pill--low">L: {stats?.alerts?.low ?? 0}</span>
          </div>
        </div>
      </div>

      {/* ── Backup & Restore ── */}
      <div className="maint-section-label">Backup &amp; Restore</div>
      <div className="maint-card" style={{ marginBottom: "1.5rem" }}>
        <div className="maint-card__header">
          <div>
            <div className="maint-card__header-title">Create Backup</div>
            <div className="maint-card__header-sub">Exports all collections to compressed file</div>
          </div>
          <button
            className="maint-btn maint-btn--success"
            disabled={isBackingUp}
            onClick={handleBackup}
          >
            {isBackingUp ? "⏳ Backing up…" : "⬇ Run Backup"}
          </button>
        </div>

        <div className="maint-info-banner">
          <span className="maint-info-banner__icon">ℹ</span>
          Restore verifies recoverability — live data is untouched.
        </div>

        {backups.length === 0 ? (
          <div className="admin-empty-state">No backups found.</div>
        ) : (
          <table className="maint-table">
            <thead>
              <tr>
                <th className="maint-th">Filename</th>
                <th className="maint-th">Size</th>
                <th className="maint-th">Created</th>
                <th className="maint-th">Action</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.filename} className="maint-tr">
                  <td className="maint-td maint-mono">{b.filename}</td>
                  <td className="maint-td">{b.size_kb} KB</td>
                  <td className="maint-td">{formatDate(b.created_at)}</td>
                  <td className="maint-td">
                    <button
                      className="maint-btn maint-btn--accent maint-btn--sm"
                      disabled={isRestoring}
                      onClick={() => setConfirmModal({
                        title: "Verify Backup Restore",
                        message: `Verify "${b.filename}" in a test environment?`,
                        confirmLabel: "↺ Verify Restore",
                        variant: "accent",
                        onConfirm: () => handleRestore(b.filename),
                      })}
                    >
                      ↺ Verify
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Housekeeping ── */}
      <div className="maint-section-label">Housekeeping</div>
      <div className="maint-card" style={{ marginBottom: "1.5rem" }}>
        <div className="maint-card__header">
          <div>
            <div className="maint-card__header-title">Purge Old Alerts</div>
            <div className="maint-card__header-sub">Delete alerts older than specified days</div>
          </div>
        </div>
        <div className="maint-housekeeping-body">
          <div className="maint-warning-banner">
            ⚠ This action cannot be undone. A backup is recommended before purging.
          </div>
          <div className="maint-purge-row">
            <span className="maint-purge-label">Older than</span>
            <input
              type="number"
              className="maint-purge-input"
              value={purgeDays}
              min={1}
              onChange={(e) => setPurgeDays(Number(e.target.value))}
            />
            <span className="maint-purge-label">days</span>
            <button
              className="maint-btn maint-btn--danger"
              disabled={isPurging}
              style={{ marginLeft: "auto" }}
              onClick={() => setConfirmModal({
                title: "Confirm Alert Purge",
                message: `Permanently delete all alerts older than ${purgeDays} days?`,
                warning: "This action cannot be undone. A backup is recommended.",
                confirmLabel: "🗑 Purge Alerts",
                variant: "danger",
                onConfirm: handlePurge,
              })}
            >
              {isPurging ? "⏳ Purging…" : "🗑 Purge Old Alerts"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Activity Log ── */}
      <div className="maint-section-label">Maintenance Activity Log</div>
      <div className="maint-card">
        {logs.length === 0 ? (
          <div className="admin-empty-state">No logs recorded.</div>
        ) : (
          <table className="maint-table">
            <thead>
              <tr>
                <th className="maint-th">Time</th>
                <th className="maint-th">Action</th>
                <th className="maint-th">Detail</th>
                <th className="maint-th">Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={i} className="maint-tr">
                  <td className="maint-td">{formatDate(log.timestamp)}</td>
                  <td className="maint-td maint-td--primary">{log.action}</td>
                  <td className="maint-td maint-td--muted">{log.detail}</td>
                  <td className="maint-td">
                    <span className={`maint-badge maint-badge--${log.status.toLowerCase()}`}>
                      ● {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}

export default DatabaseMaintenance;
