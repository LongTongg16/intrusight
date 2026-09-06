import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { PageHeader, Button, Icon } from "../../components/ui";
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

  const collections = [
    { key: "users",  label: "Users",       value: stats?.users?.count,  hint: "Accounts" },
    { key: "logs",   label: "Log sources", value: stats?.logs?.count,   hint: "Configurations" },
    { key: "alerts", label: "Alerts",      value: stats?.alerts?.count, hint: "Stored records" },
  ];
  const sev = stats?.alerts ?? {};
  const sevTotal = (sev.high ?? 0) + (sev.medium ?? 0) + (sev.low ?? 0);
  const connected = Boolean(health?.db_connected);

  return (
    <div className="admin-page">

      {toast && (
        <div className={`maint-toast maint-toast--${toast.type}`} role="status">
          <span className="maint-toast__icon" aria-hidden="true">
            {toast.type === "error" ? <Icon.warn /> : <Icon.check />}
          </span>
          {toast.message}
        </div>
      )}

      {confirmModal && (
        <div className="maint-modal-backdrop ui-backdrop" onClick={() => setConfirmModal(null)}>
          <div
            className="maint-modal ui-pop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="maint-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="maint-modal__title" id="maint-confirm-title">{confirmModal.title}</div>
            {confirmModal.warning && (
              <div className="maint-modal__warning">
                <Icon.warn />
                <span>{confirmModal.warning}</span>
              </div>
            )}
            <p className="maint-modal__msg">{confirmModal.message}</p>
            <div className="maint-modal__actions">
              <Button variant="ghost" onClick={() => setConfirmModal(null)}>Cancel</Button>
              <Button
                variant={confirmModal.variant === "danger" ? "danger" : "primary"}
                onClick={confirmModal.onConfirm}
              >
                {confirmModal.confirmIcon}
                {confirmModal.confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="Maintenance"
        subtitle="Database state, backups and housekeeping for this deployment. Everything here reports on stored data — nothing on this page contacts a sensor."
        actions={
          <Button onClick={fetchAll} loading={loading}>
            <Icon.refresh /> Refresh
          </Button>
        }
      />

      <div className="ui-enter">

        {/* ── 1. DATABASE STATE ───────────────────────────────────
            A split status band, not a card: connection state on the
            left, a data strip of counts on the right. */}
        <section className="ops" aria-labelledby="maint-db">
          <div className="ops__head">
            <h2 className="ops__title" id="maint-db">Database</h2>
            <span className="ops__meta ui-mono">
              {health?.checked_at ? `checked ${formatDate(health.checked_at)}` : "not checked"}
            </span>
          </div>

          <div className="dbstate">
            <div className={`dbstate__conn dbstate__conn--${connected ? "on" : "off"}`}>
              <span className="dbstate__dot" aria-hidden="true" />
              <span className="dbstate__connbody">
                <span className="dbstate__connlabel">
                  {loading ? "Checking…" : connected ? "Connected" : "Disconnected"}
                </span>
                <span className="dbstate__connsub ui-mono">MongoDB</span>
              </span>
            </div>

            <dl className="dbstate__strip">
              <div className="dbstate__cell">
                <dt>Documents</dt>
                <dd className="dbstate__num">
                  {health?.total_documents != null ? health.total_documents.toLocaleString() : "—"}
                </dd>
              </div>
              {collections.map((c) => (
                <div className="dbstate__cell" key={c.key}>
                  <dt>{c.label}</dt>
                  <dd className="dbstate__num">{c.value != null ? c.value.toLocaleString() : "—"}</dd>
                  <dd className="dbstate__hint">{c.hint}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Severity split of the stored alerts — real counts only. */}
          {sevTotal > 0 && (
            <div className="dbstate__sev">
              <span className="dbstate__sevlabel">Alert severity</span>
              <div className="dbstate__sevbar" role="img"
                   aria-label={`${sev.high} high, ${sev.medium} medium, ${sev.low} low`}>
                {["high", "medium", "low"].map((k) => (
                  sev[k] > 0 ? (
                    <span key={k} className={`dbstate__seg dbstate__seg--${k}`}
                          style={{ width: `${(sev[k] / sevTotal) * 100}%` }} />
                  ) : null
                ))}
              </div>
              <span className="dbstate__sevlegend">
                <span className="dbstate__key dbstate__key--high">{sev.high ?? 0} high</span>
                <span className="dbstate__key dbstate__key--medium">{sev.medium ?? 0} medium</span>
                <span className="dbstate__key dbstate__key--low">{sev.low ?? 0} low</span>
              </span>
            </div>
          )}
        </section>

        {/* ── 2. BACKUP & RECOVERY ────────────────────────────────
            A split pane: the action and its explanation on the left,
            the stored backups as a list on the right. */}
        <section className="ops" aria-labelledby="maint-backup">
          <div className="ops__head">
            <h2 className="ops__title" id="maint-backup">Backup &amp; recovery</h2>
            <span className="ops__meta">{backups.length} stored</span>
          </div>

          <div className="bk">
            <div className="bk__action">
              <p className="bk__lead">Create a backup</p>
              <p className="bk__text">
                Exports every collection to a compressed archive on the server.
              </p>
              <Button variant="primary" loading={isBackingUp} onClick={handleBackup}>
                <Icon.archive /> Run backup
              </Button>

              <p className="bk__note">
                <Icon.info />
                <span>
                  Verifying a backup restores it into temporary
                  <code className="ui-mono"> restore_test_* </code>
                  collections. Live data is never overwritten.
                </span>
              </p>
            </div>

            <div className="bk__list">
              {backups.length === 0 ? (
                <div className="ops-empty">
                  <span className="ops-empty__icon" aria-hidden="true"><Icon.archive /></span>
                  <div>
                    <p className="ops-empty__title">No backups yet</p>
                    <p className="ops-empty__text">Run a backup to create the first archive.</p>
                  </div>
                </div>
              ) : (
                <ul className="bklist">
                  {backups.map((b) => (
                    <li className="bkrow" key={b.filename}>
                      <span className="bkrow__icon" aria-hidden="true"><Icon.archive /></span>
                      <span className="bkrow__body">
                        <span className="bkrow__name ui-mono">{b.filename}</span>
                        <span className="bkrow__meta ui-mono">
                          {b.size_kb} KB · {formatDate(b.created_at)}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        loading={isRestoring}
                        onClick={() => setConfirmModal({
                          title: "Verify this backup?",
                          message: `"${b.filename}" will be restored into temporary restore_test_* collections so its contents can be checked. Live data is not touched.`,
                          confirmLabel: "Verify restore",
                          confirmIcon: <Icon.restore />,
                          variant: "primary",
                          onConfirm: () => handleRestore(b.filename),
                        })}
                      >
                        <Icon.restore /> Verify
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* ── 3. HOUSEKEEPING ─────────────────────────────────────
            A contained danger zone: a bordered section with a warning
            rail, holding one grouped control. */}
        <section className="ops ops--danger" aria-labelledby="maint-danger">
          <div className="ops__head">
            <h2 className="ops__title" id="maint-danger">
              <Icon.warn /> Destructive actions
            </h2>
          </div>

          <div className="danger">
            <div className="danger__body">
              <p className="danger__lead">Purge old alerts</p>
              <p className="danger__text">
                Permanently deletes stored alerts older than the chosen age. This
                cannot be undone — take a backup first.
              </p>
            </div>

            <div className="danger__control">
              <label className="danger__field" htmlFor="purge-days">
                <span className="danger__fieldlabel">Older than</span>
                <span className="danger__input">
                  <input
                    id="purge-days"
                    type="number"
                    value={purgeDays}
                    min={1}
                    onChange={(e) => setPurgeDays(Number(e.target.value))}
                  />
                  <span className="danger__unit">days</span>
                </span>
              </label>

              <Button
                variant="danger"
                loading={isPurging}
                onClick={() => setConfirmModal({
                  title: "Purge stored alerts?",
                  message: `Every alert older than ${purgeDays} days will be permanently deleted from the database.`,
                  warning: "This cannot be undone. A backup is recommended first.",
                  confirmLabel: "Purge alerts",
                  confirmIcon: <Icon.trash />,
                  variant: "danger",
                  onConfirm: handlePurge,
                })}
              >
                <Icon.trash /> Purge alerts
              </Button>
            </div>
          </div>
        </section>

        {/* ── 4. ACTIVITY ─────────────────────────────────────────
            A timeline, deliberately not another table. */}
        <section className="ops" aria-labelledby="maint-activity">
          <div className="ops__head">
            <h2 className="ops__title" id="maint-activity">Recent activity</h2>
            <span className="ops__meta">{logs.length} recorded</span>
          </div>

          {logs.length === 0 ? (
            <div className="ops-empty">
              <span className="ops-empty__icon" aria-hidden="true"><Icon.clock /></span>
              <div>
                <p className="ops-empty__title">No maintenance activity yet</p>
                <p className="ops-empty__text">
                  Backups, restore checks and purges are recorded here as they run.
                </p>
              </div>
            </div>
          ) : (
            <ol className="tl">
              {logs.map((log, i) => {
                // `status` comes straight from a Mongo document; older entries
                // may predate the field, and an unguarded .toLowerCase() here
                // used to take the whole page down.
                const status = String(log.status ?? "unknown").toLowerCase();
                return (
                  <li className={`tl__item tl__item--${status}`} key={i}>
                    <span className="tl__marker" aria-hidden="true" />
                    <div className="tl__body">
                      <p className="tl__head">
                        <span className="tl__action">{String(log.action ?? "—").replace(/_/g, " ")}</span>
                        <span className={`tl__status tl__status--${status}`}>{log.status ?? "unknown"}</span>
                      </p>
                      <p className="tl__detail">{log.detail}</p>
                    </div>
                    <time className="tl__time ui-mono">{formatDate(log.timestamp)}</time>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

export default DatabaseMaintenance;
