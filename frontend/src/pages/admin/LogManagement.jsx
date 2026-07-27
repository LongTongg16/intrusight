import React, { useState, useEffect, useCallback } from 'react';
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
function LogManagement({ logs = [], setLogs }) {
  const [formData, setFormData]         = useState(EMPTY_FORM);
  const [filter, setFilter]             = useState('');
  const [hoveredRow, setHoveredRow]     = useState(null);
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
      showToast(`"${newLog.name}" connection added`);
    } catch {
      showToast('Failed to add connection', 'error');
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
      showToast(`"${updated.name}" set to ${updated.status}`);
    } catch {
      showToast('Failed to update status', 'error');
    }
  };

  // ── Delete ───────────────────────────────────────────────────────
  const handleDeleteLog = () => {
    setConfirmModal({
      title:        'Remove Log Source',
      message:      `Remove "${modalLog.name}"? This will stop ingesting data.`,
      confirmLabel: 'Remove',
      confirmColor: '#ef4444',
      onConfirm: async () => {
        try {
          await apiFetch(`/api/logs/${modalLog.id}`, { method: 'DELETE' });
          setLogs(prev => prev.filter(l => l.id !== modalLog.id));
          closeModal();
          showToast(`"${modalLog.name}" removed`, 'error');
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
        <div style={{ ...styles.modalOverlay, zIndex: 2000 }} onClick={() => setConfirmModal(null)}>
          <div style={styles.modalBox} onClick={e => e.stopPropagation()}>
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
        <div style={styles.modalOverlay} onClick={closeModal}>
          <div style={styles.modalBox} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <p style={styles.modalSubtitle}>Log Connection</p>
                <h2 style={styles.modalTitle}>{modalLog.name}</h2>
              </div>
              <button style={styles.modalClose} onClick={closeModal}>✕</button>
            </div>
            <div style={styles.modalStatusRow}>
              <span style={styles.statusBadge((modalLog.status ?? 'unknown').toLowerCase())}>
                <span style={styles.statusDot((modalLog.status ?? 'unknown').toLowerCase())} />
                {modalLog.status}
              </span>
              <span style={styles.modalTimestamp}>Last updated: {modalLog.lastUpdated}</span>
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
                    <select name="type" value={editData.type} onChange={handleEditChange} style={styles.editInput}>
                      <option value="File based">File based</option>
                      <option value="Syslog">Syslog</option>
                    </select>
                  </div>
                  <div style={styles.detailItem}>
                    <label style={styles.detailLabel}>Format</label>
                    <select name="logType" value={editData.logType} onChange={handleEditChange} style={styles.editInput}>
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
                    <span style={styles.detailLabel}>Connection ID</span>
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
                      {modalLog.status === 'Active' ? 'Deactivate' : 'Activate'}
                  </button>
                  <button style={styles.btnDelete} onClick={handleDeleteLog}>Remove</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div style={styles.header}>
        <h1 style={styles.pageTitle}>Log Management</h1>
      </div>

      {/* Log Sources Table */}
      <div style={styles.tableSection}>
        <div style={styles.tableHeader}>
          <input
            type="text"
            placeholder="Search logs..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={styles.searchInput}
          />
        </div>
        <table style={styles.logsTable}>
          <thead>
            <tr>
              <th style={styles.th}>Log Name</th>
              <th style={styles.th}>Log Type</th>
              <th style={styles.th}>Format</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Last Updated</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ ...styles.td, textAlign: 'center', color: '#64748b', padding: '2rem' }}>
                  No log connections found.
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <tr
                  key={log.id}
                  style={hoveredRow === log.id ? styles.trHover : styles.tr}
                  onMouseEnter={() => setHoveredRow(log.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  <td style={styles.td}>{log.name}</td>
                  <td style={styles.td}>{log.type}</td>
                  <td style={styles.td}>{log.logType}</td>
                  <td style={styles.td}>
                    <span style={styles.statusBadge((log.status ?? 'unknown').toLowerCase())}>
                      <span style={styles.statusDot((log.status ?? 'unknown').toLowerCase())} />
                      {log.status ?? 'unknown'}
                    </span>
                  </td>
                  <td style={styles.td}>{log.lastUpdated}</td>
                  <td style={styles.td}>
                    <button style={styles.actionBtn} onClick={() => openModal(log)} title="Manage connection">
                      ···
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Connection Form */}
      <div style={styles.formSection}>
        <h3 style={styles.formTitle}>Add New Connection</h3>
        <form style={{ ...styles.form, gap: '16px' }} onSubmit={handleSubmit}>

          {/* IDS Tool */}
          <div>
            <label style={fieldLabelStyle}>IDS Tool</label>
            <select
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
                  ? `📄 ${formData.idsTool} uses file-based ingestion. Provide the full path to the log file on your server.`
                  : `📡 ${formData.idsTool} uses syslog ingestion. Provide the host and port your IDS is forwarding logs to.`
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
            {isSubmitting ? 'Adding…' : 'Add Connection'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LogManagement;
