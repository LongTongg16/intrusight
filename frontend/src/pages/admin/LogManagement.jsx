import React, { useState, useEffect, useCallback } from 'react';
import {
  PageHeader, SectionHeader, Icon, EmptyState, EngineMark,
} from '../../components/ui';
import "./admin.css";
import { styles } from './LogManagement.styles';

const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

// ── IDS tool configurations ───────────────────────────────────────────────────
const IDS_CONFIGS = {
  Suricata: {
    logType:       "File based",
    formats:       ["JSON"],
    defaultFormat: "JSON",
    extraField:    "filepath",
    placeholder:   "e.g. /var/log/suricata/eve.json",
  },
  Zeek: {
    logType:       "File based",
    formats:       ["JSON", "TSV"],
    defaultFormat: "JSON",
    extraField:    "filepath",
    placeholder:   "e.g. /var/log/zeek/current/conn.log",
  },
  Snort: {
    logType:       "Syslog",
    formats:       ["UDP", "TCP"],
    defaultFormat: "UDP",
    extraField:    "syslog",
    placeholder:   "e.g. 192.168.1.1",
  },
  Kismet: {
    logType:       "Syslog",
    formats:       ["UDP"],
    defaultFormat: "UDP",
    extraField:    "syslog",
    placeholder:   "e.g. 192.168.1.1",
  },
};

const IDS_TOOLS = Object.keys(IDS_CONFIGS);

// `status` is a field on the stored configuration record. Nothing in the
// backend starts, stops or probes an ingestion process, so it is labelled as
// configuration state ("Enabled"/"Disabled") rather than sensor health.
const STATUS_LABELS = { active: "Enabled", inactive: "Disabled" };
const statusLabel = (status) =>
  STATUS_LABELS[String(status ?? "").toLowerCase()] ?? "Not configured";

const EMPTY_FORM = {
  idsTool:       "",
  logType:       "",
  parsingOption: "",
  filePath:      "",
  syslogHost:    "",
  syslogPort:    "",
};

// ── API helper ────────────────────────────────────────────────────────────────
const apiFetch = (path, options = {}) => {
  const token = localStorage.getItem('token');
  return fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  }).then(r => {
    if (!r.ok) throw new Error(`API error: ${r.status}`);
    return r.json();
  });
};

// ── Inline style constants ────────────────────────────────────────────────────
const fieldLabelStyle = {
  display: 'block',
  fontSize: '0.78rem',
  color: '#64748b',
  fontWeight: '600',
  marginBottom: '6px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const lockedFieldStyle = {
  opacity: 0.6,
  cursor: 'not-allowed',
  backgroundColor: '#0f172a',
};

const hintBoxStyle = {
  padding: '10px 14px',
  background: 'rgba(59,130,246,0.08)',
  border: '1px solid rgba(59,130,246,0.2)',
  borderRadius: '8px',
  fontSize: '0.82rem',
  color: '#94a3b8',
  lineHeight: 1.5,
};

// ── Component ─────────────────────────────────────────────────────────────────
function LogManagement() {
  // Log sources are owned here rather than lifted into App: this is the only
  // route that mutates them, and App-level fetching ran on every page load.
  const [logs, setLogs] = useState([]);
  const [formData, setFormData]         = useState(EMPTY_FORM);
  const [filter, setFilter]             = useState('');
  const [modalLog, setModalLog]         = useState(null);
  const [editMode, setEditMode]         = useState(false);
  const [editData, setEditData]         = useState({});
  const [confirmModal, setConfirmModal] = useState(null);
  const [toast, setToast]               = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedConfig = IDS_CONFIGS[formData.idsTool] || null;

  // ── Toast ────────────────────────────────────────────────────────
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Fetch logs on mount ──────────────────────────────────────────
useEffect(() => {
    apiFetch('/api/logs')
      .then(data => setLogs(Array.isArray(data) ? data : data.logs ?? []))
      .catch(() => showToast('Failed to load logs', 'error'));
  }, [setLogs, showToast]);

  // ── When IDS tool changes, auto-fill logType + format ────────────
  const handleToolChange = (e) => {
    const tool   = e.target.value;
    const config = IDS_CONFIGS[tool];
    if (config) {
      setFormData({
        ...EMPTY_FORM,
        idsTool:       tool,
        logType:       config.logType,
        parsingOption: config.defaultFormat,
      });
    } else {
      setFormData(EMPTY_FORM);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditData(prev => ({ ...prev, [name]: value }));
  };

  // ── Validation ───────────────────────────────────────────────────
  const validate = () => {
    if (!formData.idsTool)       { showToast('Please select an IDS tool', 'error'); return false; }
    if (!formData.parsingOption) { showToast('Please select a format', 'error');    return false; }
    if (selectedConfig?.extraField === 'filepath' && !formData.filePath.trim()) {
      showToast('Please enter the log file path', 'error');
      return false;
    }
    if (selectedConfig?.extraField === 'syslog') {
      if (!formData.syslogHost.trim()) { showToast('Please enter the syslog host', 'error'); return false; }
      if (!formData.syslogPort)        { showToast('Please enter the syslog port', 'error'); return false; }
    }
    return true;
  };

  // ── Submit ───────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const newLog = await apiFetch('/api/logs', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:       formData.idsTool,
          type:       formData.logType,
          logType:    formData.parsingOption,
          filePath:   formData.filePath   || null,
          syslogHost: formData.syslogHost || null,
          syslogPort: formData.syslogPort ? parseInt(formData.syslogPort) : null,
        }),
      });

      setLogs(prev => [...prev, newLog]);
      setFormData(EMPTY_FORM);
      showToast(`"${newLog.name}" configuration saved`);
    } catch {
      showToast('Failed to save configuration', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Modal helpers ────────────────────────────────────────────────
  const openModal  = (log) => { setModalLog(log); setEditData({ ...log }); setEditMode(false); };
  const closeModal = ()    => { setModalLog(null); setEditMode(false); };

  // ── Save edit ────────────────────────────────────────────────────
  const handleSaveEdit = async () => {
    try {
      const updated = await apiFetch(`/api/logs/${modalLog.id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:    editData.name,
          type:    editData.type,
          logType: editData.logType,
        }),
      });
      setLogs(prev => prev.map(l => l.id === updated.id ? updated : l));
      setModalLog(updated);
      setEditMode(false);
      showToast(`"${updated.name}" updated successfully`);
    } catch {
      showToast('Failed to update log', 'error');
    }
  };

  // ── Toggle status ────────────────────────────────────────────────
  const handleToggleStatus = async () => {
    try {
      const updated = await apiFetch(`/api/logs/${modalLog.id}/status`, { method: 'PUT' });
      setLogs(prev => prev.map(l => l.id === updated.id ? updated : l));
      setModalLog(updated);
      setEditData(prev => ({ ...prev, status: updated.status }));
      showToast(`"${updated.name}" configuration set to ${statusLabel(updated.status)}`);
    } catch {
      showToast('Failed to update status', 'error');
    }
  };

  // ── Delete ───────────────────────────────────────────────────────
  const handleDeleteLog = () => {
    setConfirmModal({
      title:        'Remove Log Source',
      message:      `Remove the stored configuration record for "${modalLog.name}"? `
                    + `Ingestion processes run outside this application and are not `
                    + `started or stopped from here.`,
      confirmLabel: 'Remove',
      confirmColor: '#ef4444',
      onConfirm: async () => {
        try {
          await apiFetch(`/api/logs/${modalLog.id}`, { method: 'DELETE' });
          setLogs(prev => prev.filter(l => l.id !== modalLog.id));
          closeModal();
          showToast(`"${modalLog.name}" configuration removed`);
        } catch {
          showToast('Failed to remove log', 'error');
        }
      },
    });
  };

const filteredLogs = (logs ?? []).filter(log =>
  (log.name ?? '').toLowerCase().includes(filter.toLowerCase()) ||
  (log.type ?? '').toLowerCase().includes(filter.toLowerCase())
);

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div style={styles.pageContainer}>

      {/* Toast */}
      {toast && (
        <div style={styles.toast(toast.type)}>
          <span>{toast.type === 'success' ? '✓' : '✕'}</span> {toast.message}
        </div>
      )}

      {/* Confirm Modal — higher z-index so it appears above the log detail modal */}
      {confirmModal && (
        <div className="ui-backdrop" style={{ ...styles.modalOverlay, zIndex: 2000 }} onClick={() => setConfirmModal(null)}>
          <div className="ui-pop" style={styles.modalBox} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <p style={styles.modalSubtitle}>Confirm Action</p>
                <h2 style={styles.modalTitle}>{confirmModal.title}</h2>
              </div>
              <button style={styles.modalClose} onClick={() => setConfirmModal(null)}>✕</button>
            </div>
            <div style={{ padding: '0 0 1.5rem 0' }}>
              <p style={{ color: '#94a3b8', margin: 0, lineHeight: 1.6 }}>{confirmModal.message}</p>
            </div>
            <div style={styles.modalActions}>
              <button style={styles.btnSecondary} onClick={() => setConfirmModal(null)}>Cancel</button>
              <button
                style={{ ...styles.btnSave, backgroundColor: confirmModal.confirmColor }}
                onClick={async () => { await confirmModal.onConfirm(); setConfirmModal(null); }}
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Detail / Edit Modal */}
      {modalLog && (
        <div className="ui-backdrop" style={styles.modalOverlay} onClick={closeModal}>
          <div className="ui-pop" style={styles.modalBox} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <p style={styles.modalSubtitle}>Log source configuration</p>
                <h2 style={styles.modalTitle}>{modalLog.name}</h2>
              </div>
              <button style={styles.modalClose} onClick={closeModal}>✕</button>
            </div>
            <div style={styles.modalStatusRow}>
              <span style={styles.statusBadge((modalLog.status ?? 'unknown').toLowerCase())}>
                <span style={styles.statusDot((modalLog.status ?? 'unknown').toLowerCase())} />
                {statusLabel(modalLog.status)}
              </span>
              <span style={styles.modalTimestamp}>Record updated: {modalLog.lastUpdated}</span>
            </div>
            <div style={styles.detailGrid}>
              {editMode ? (
                <>
                  <div style={styles.detailItem}>
                    <label style={styles.detailLabel}>Log Name</label>
                    <input name="name" value={editData.name} onChange={handleEditChange} style={styles.editInput} />
                  </div>
                  <div style={styles.detailItem}>
                    <label style={styles.detailLabel}>Log Type</label>
                    <select aria-label="Log type" name="type" value={editData.type} onChange={handleEditChange} style={styles.editInput}>
                      <option value="File based">File based</option>
                      <option value="Syslog">Syslog</option>
                    </select>
                  </div>
                  <div style={styles.detailItem}>
                    <label style={styles.detailLabel}>Format</label>
                    <select name="logType" aria-label="Format" value={editData.logType} onChange={handleEditChange} style={styles.editInput}>
                      <option value="JSON">JSON</option>
                      <option value="TSV">TSV</option>
                      <option value="UDP">UDP</option>
                      <option value="TCP">TCP</option>
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Log Type</span>
                    <span style={styles.detailValue}>{modalLog.type}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Format</span>
                    <span style={styles.detailValue}>{modalLog.logType}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Record ID</span>
                    <span style={styles.detailValue}>#{String(modalLog.id).slice(-4)}</span>
                  </div>
                  {modalLog.filePath && (
                    <div style={{ ...styles.detailItem, gridColumn: '1 / -1' }}>
                      <span style={styles.detailLabel}>File Path</span>
                      <span style={{ ...styles.detailValue, fontFamily: 'monospace', fontSize: '0.85rem', color: '#94a3b8' }}>
                        {modalLog.filePath}
                      </span>
                    </div>
                  )}
                  {modalLog.syslogHost && (
                    <div style={styles.detailItem}>
                      <span style={styles.detailLabel}>Syslog Host</span>
                      <span style={{ ...styles.detailValue, fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        {modalLog.syslogHost}:{modalLog.syslogPort}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
            <div style={styles.modalActions}>
              {editMode ? (
                <>
                  <button style={styles.btnSave} onClick={handleSaveEdit}>Save Changes</button>
                  <button style={styles.btnSecondary} onClick={() => setEditMode(false)}>Cancel</button>
                </>
              ) : (
                <>
                  <button style={styles.btnEdit} onClick={() => setEditMode(true)}>Edit</button>
                  <button style={styles.btnToggle(modalLog.status ?? 'unknown')} onClick={handleToggleStatus}>
                    {modalLog.status === 'Active' ? 'Mark disabled' : 'Mark enabled'}
                  </button>
                  <button style={styles.btnDelete} onClick={handleDeleteLog}>Remove</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="Log Sources"
        subtitle="Stored configuration records describing where each engine writes its logs. IntruSight does not start, stop or monitor the ingestion processes themselves — those run separately, and changes here do not affect a running ingestor."
      />

      {/* Log source configuration records */}
      <section className="ui-panel lm-panel">
        <div className="lm-toolbar">
          <div className="um-search">
            <Icon.search />
            <input
              type="text"
              placeholder="Search log sources"
              aria-label="Search log sources"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {filter && (
              <button
                type="button"
                className="um-search__clear"
                aria-label="Clear search"
                onClick={() => setFilter('')}
              >
                <Icon.close />
              </button>
            )}
          </div>
          <span className="um-count">
            {filteredLogs.length} of {logs.length} stored
          </span>
        </div>

        {filteredLogs.length === 0 ? (
          <EmptyState
            icon="plug"
            title={filter ? 'No log sources match that search' : 'No log source configurations stored'}
          >
            {filter
              ? 'Try a different engine name or transport.'
              : 'Add a record below describing where an engine writes its logs. Storing it here does not start an ingestor.'}
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="alerts-table lm-table">
              <thead>
                <tr>
                  <th>Engine</th>
                  <th>Transport</th>
                  <th>Configuration</th>
                  <th>Record updated</th>
                  <th><span className="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <div className="lm-engine">
                        <EngineMark engine={log.name} />
                        <span className="lm-engine__body">
                          <span className="lm-engine__name">{log.name}</span>
                          <span className="lm-engine__path ui-mono">
                            {log.filePath || (log.syslogHost ? `${log.syslogHost}:${log.syslogPort}` : '—')}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="lm-transport">{log.type}</span>
                      <span className="lm-format ui-mono">{log.logType}</span>
                    </td>
                    <td>
                      <span className={`um-status um-status--${(log.status ?? '').toLowerCase() === 'active' ? 'active' : 'rejected'}`}>
                        <span className="um-status__dot" aria-hidden="true" />
                        {statusLabel(log.status)}
                      </span>
                    </td>
                    <td className="ui-mono lm-when">{log.lastUpdated}</td>
                    <td className="um-actions">
                      <button
                        type="button"
                        style={styles.actionBtn}
                        onClick={() => openModal(log)}
                        aria-haspopup="dialog"
                        aria-label={`Manage ${log.name} configuration`}
                      >
                        <Icon.dots />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Add Connection Form */}
      <section className="ui-panel lm-form">
        <div className="ui-panel__body">
          <SectionHeader
            title="Add log source configuration"
            hint="Records where an engine writes its output. Saving does not start or restart an ingestor."
          />
        <form style={{ ...styles.form, gap: '16px' }} onSubmit={handleSubmit}>

          {/* IDS Tool */}
          <div>
            <label style={fieldLabelStyle}>IDS Tool</label>
            <select
              aria-label="Detection engine"
              name="idsTool"
              value={formData.idsTool}
              onChange={handleToolChange}
              style={styles.input}
              required
            >
              <option value="">Select IDS Tool</option>
              {IDS_TOOLS.map(tool => (
                <option key={tool} value={tool}>{tool}</option>
              ))}
            </select>
          </div>

          {selectedConfig && (
            <>
              {/* Log Type — locked */}
              <div>
                <label style={fieldLabelStyle}>Log Type</label>
                <input
                  value={selectedConfig.logType}
                  style={{ ...styles.input, ...lockedFieldStyle }}
                  readOnly
                />
              </div>

              {/* Format — locked if one option, selectable if multiple */}
              <div>
                <label style={fieldLabelStyle}>Format</label>
                {selectedConfig.formats.length === 1 ? (
                  <input
                    value={selectedConfig.formats[0]}
                    style={{ ...styles.input, ...lockedFieldStyle }}
                    readOnly
                  />
                ) : (
                  <select
                    aria-label="Format"
                    name="parsingOption"
                    value={formData.parsingOption}
                    onChange={handleInputChange}
                    style={styles.input}
                    required
                  >
                    {selectedConfig.formats.map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* File path — Suricata and Zeek */}
              {selectedConfig.extraField === 'filepath' && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={fieldLabelStyle}>Log File Path</label>
                  <input
                    name="filePath"
                    value={formData.filePath}
                    onChange={handleInputChange}
                    placeholder={selectedConfig.placeholder}
                    style={{ ...styles.input, width: '100%', boxSizing: 'border-box' }}
                    required
                  />
                </div>
              )}

              {/* Syslog host + port — Snort and Kismet */}
              {selectedConfig.extraField === 'syslog' && (
                <div style={{ display: 'flex', gap: '10px', gridColumn: '1 / -1' }}>
                  <div style={{ flex: 2 }}>
                    <label style={fieldLabelStyle}>Syslog Host</label>
                    <input
                      name="syslogHost"
                      value={formData.syslogHost}
                      onChange={handleInputChange}
                      placeholder={selectedConfig.placeholder}
                      style={styles.input}
                      required
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={fieldLabelStyle}>Port</label>
                    <input
                      name="syslogPort"
                      type="number"
                      value={formData.syslogPort}
                      onChange={handleInputChange}
                      placeholder="514"
                      style={styles.input}
                      required
                    />
                  </div>
                </div>
              )}

              {/* Hint box */}
              <div style={{ ...hintBoxStyle, gridColumn: '1 / -1' }}>
                {selectedConfig.extraField === 'filepath'
                  ? `${formData.idsTool} is configured as a file-based source. Record the full path to the log file so the ingestor can be pointed at it.`
                  : `${formData.idsTool} is configured as a syslog source. Record the host and port the ingestor should listen on.`
                }
              </div>
            </>
          )}

          <button
            type="submit"
            style={{
              ...styles.submitBtn,
              ...(!selectedConfig || isSubmitting ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
            }}
            disabled={!selectedConfig || isSubmitting}
          >
            {isSubmitting ? 'Saving…' : 'Save configuration'}
          </button>
        </form>
        </div>
      </section>
    </div>
  );
}

export default LogManagement;
