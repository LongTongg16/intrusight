export const styles = {
  pageContainer: {
    padding: '2rem',
    color: 'var(--admin-text)',
  },

  header: {
    marginBottom: '1.5rem',
  },

  pageTitle: {
    fontSize: '2rem',
    fontWeight: '700',
    margin: 0,
    color: 'var(--admin-text)',
  },

  pageNote: {
    margin: '0.6rem 0 0',
    maxWidth: '78ch',
    fontSize: '0.875rem',
    lineHeight: 1.6,
    color: 'var(--text-secondary-c, #93a1b8)',
  },

  tableSection: {
    background: 'var(--admin-card)',
    border: '1px solid var(--admin-border)',
    borderRadius: 'var(--admin-radius)',
    padding: '1.5rem',
    marginBottom: '2rem',
    overflowX: 'auto',
  },

  tableHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },

  searchInput: {
    width: '100%',
    padding: '0.875rem 1rem',
    background: 'var(--admin-input)',
    border: '1px solid var(--admin-border)',
    borderRadius: 'var(--radius)',
    color: 'var(--admin-text)',
    fontSize: '0.95rem',
    marginBottom: '1rem',
    boxSizing: 'border-box',
  },

  logsTable: {
    width: '100%',
    borderCollapse: 'collapse',
    background: 'var(--admin-card)',
    borderRadius: 'var(--radius-lg)',
  },

  th: {
    padding: '1rem',
    textAlign: 'left',
    color: 'var(--admin-secondary)',
    fontSize: '0.85rem',
    fontWeight: '600',
    textTransform: 'uppercase',
    borderBottom: '1px solid var(--admin-border)',
  },

  tr: {
    borderBottom: '1px solid var(--admin-border)',
    transition: 'var(--transition)',
  },

  trHover: {
    borderBottom: '1px solid var(--admin-border)',
    transition: 'var(--transition)',
    background: 'var(--admin-hover)',
  },

  td: {
    padding: '1rem',
    fontSize: '0.9rem',
    color: 'var(--admin-text)',
  },

  actionBtn: {
    background: 'transparent',
    border: '1px solid var(--admin-border)',
    color: 'var(--admin-secondary)',
    borderRadius: '6px',
    padding: '0.5rem 0.75rem',
    fontSize: '0.8rem',
    cursor: 'pointer',
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  formSection: {
    background: 'var(--admin-card)',
    border: '1px solid var(--admin-border)',
    borderRadius: 'var(--admin-radius)',
    padding: '1.5rem',
  },

  formTitle: {
    color: 'var(--admin-text)',
    fontSize: '1.25rem',
    fontWeight: '600',
    marginBottom: '1rem',
  },

  form: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '1rem',
  },

  input: {
    width: '100%',
    padding: '0.875rem 1rem',
    background: 'var(--admin-input)',
    border: '1px solid var(--admin-border)',
    borderRadius: 'var(--radius)',
    color: 'var(--admin-text)',
    fontSize: '0.95rem',
    boxSizing: 'border-box',
  },

  submitBtn: {
    minHeight: '36px',
    padding: '0 1.1rem',
    background: 'var(--accent-solid)',
    color: 'var(--accent-on)',
    border: '1px solid var(--accent-solid)',
    borderRadius: 'var(--radius-sm)',
    fontWeight: 600,
    fontSize: 'var(--fs-md)',
    cursor: 'pointer',
    transition: 'var(--transition-base)',
  },

  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    zIndex: 1000,
  },

  modalBox: {
    width: '100%',
    maxWidth: '720px',
    background: 'var(--admin-card)',
    border: '1px solid var(--admin-border)',
    borderRadius: '16px',
    padding: '1.5rem',
    boxShadow: '0 20px 40px rgba(0,0,0,0.35)',
  },

  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1rem',
  },

  modalSubtitle: {
    margin: 0,
    fontSize: '0.78rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--admin-secondary)',
  },

  modalTitle: {
    margin: '0.25rem 0 0 0',
    fontSize: '1.4rem',
    fontWeight: '700',
    color: 'var(--admin-text)',
  },

  modalClose: {
    background: 'transparent',
    border: 'none',
    color: 'var(--admin-secondary)',
    fontSize: '1.1rem',
    cursor: 'pointer',
  },

  modalStatusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '1.5rem',
    flexWrap: 'wrap',
  },

  modalTimestamp: {
    fontSize: '0.82rem',
    color: 'var(--admin-secondary)',
  },

  detailGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '1rem',
    marginBottom: '1.5rem',
  },

  detailItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
    padding: '1rem',
    background: 'var(--admin-bg)',
    border: '1px solid var(--admin-border)',
    borderRadius: '12px',
  },

  detailLabel: {
    fontSize: '0.78rem',
    color: 'var(--admin-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },

  detailValue: {
    color: 'var(--admin-text)',
    fontSize: '0.95rem',
    wordBreak: 'break-word',
  },

  editInput: {
    width: '100%',
    padding: '0.8rem 0.9rem',
    background: 'var(--admin-input)',
    border: '1px solid var(--admin-border)',
    borderRadius: '10px',
    color: 'var(--admin-text)',
    boxSizing: 'border-box',
  },

  modalActions: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },

  btnSave: {
    padding: '0.8rem 1.1rem',
    border: 'none',
    borderRadius: '10px',
    background: 'var(--primary)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: '600',
  },

  btnSecondary: {
    padding: '0.8rem 1.1rem',
    border: '1px solid var(--admin-border)',
    borderRadius: '10px',
    background: 'transparent',
    color: 'var(--admin-text)',
    cursor: 'pointer',
  },

  btnEdit: {
    padding: '0.8rem 1.1rem',
    border: '1px solid var(--admin-border)',
    borderRadius: '10px',
    background: 'var(--admin-hover)',
    color: 'var(--admin-text)',
    cursor: 'pointer',
  },

  btnDelete: {
    padding: '0.8rem 1.1rem',
    border: '1px solid rgba(239,68,68,0.35)',
    borderRadius: '10px',
    background: 'rgba(239,68,68,0.12)',
    color: '#ef4444',
    cursor: 'pointer',
  },

  toast: (type) => ({
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: 3000,
    padding: '0.9rem 1.2rem',
    borderRadius: '10px',
    color: '#fff',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: type === 'success' ? '#10b981' : '#ef4444',
    boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
  }),

  statusBadge: (status) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.35rem 0.75rem',
    borderRadius: '999px',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: status === 'active' ? '#10b981' : '#94a3b8',
    background: status === 'active'
      ? 'rgba(16,185,129,0.12)'
      : 'rgba(148,163,184,0.12)',
    border: status === 'active'
      ? '1px solid rgba(16,185,129,0.25)'
      : '1px solid rgba(148,163,184,0.25)',
  }),

  statusDot: (status) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    display: 'inline-block',
    backgroundColor: status === 'active' ? '#10b981' : '#94a3b8',
  }),

  btnToggle: (status) => ({
    padding: '0.8rem 1.1rem',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontWeight: '600',
    color: '#fff',
    background: status === 'Active' ? '#f59e0b' : '#10b981',
  }),
};