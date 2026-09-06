export const styles = {
  content: {
    padding: "24px",
    margin: "0 auto",
    color: "var(--text-main)",
  },
  header: {
    marginBottom: "32px",
  },
  pageTitle: {
    fontSize: "1.75rem",
    fontWeight: "700",
    color: "var(--text-main)",
    margin: 0,
  },
  subtitle: {
    color: "var(--text-muted)",
    fontSize: "0.9rem",
    marginTop: "4px",
  },
  controls: {
    display: "flex",
    gap: "16px",
    marginBottom: "20px",
    alignItems: "center",
  },
  searchInput: {
    padding: "10px 16px",
    backgroundColor: "var(--bg-card)",
    border: "1px solid var(--border-color)",
    borderRadius: "8px",
    color: "var(--text-main)",
    fontSize: "0.9rem",
    outline: "none",
    transition: "border-color 0.2s",
  },
  addUserBtn: {
    padding: "10px 20px",
    backgroundColor: "var(--accent-primary)",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontWeight: "600",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  tableSection: {
    backgroundColor: "var(--bg-card)",
    borderRadius: "12px",
    border: "1px solid var(--border-color)",
    overflowX: "auto",
    overflowY: "visible",
    position: "relative",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
  },
th: {
  padding: "0.75rem 1rem",
  textAlign: "left",
  fontSize: "0.78rem",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  backgroundColor: "var(--bg-hover)",
  color: "var(--text-secondary)",
  borderBottom: "2px solid var(--border-primary)",
},
  td: {
    padding: "16px 20px",
    borderBottom: "1px solid var(--border-color)",
    fontSize: "0.9rem",
    color: "var(--text-main)",
  },
  tr: {
    transition: "background-color 0.2s",
  },
  trHover: {
    backgroundColor: "rgba(255, 255, 255, 0.02)",
  },
  
  // Status Badges
  statusBadge: (status) => {
    const colors = {
      active: { bg: "rgba(16, 185, 129, 0.1)", text: "#10b981" },
      pending: { bg: "rgba(245, 158, 11, 0.1)", text: "#f59e0b" },
      suspended: { bg: "rgba(239, 68, 68, 0.1)", text: "#ef4444" },
      rejected: { bg: "rgba(100, 116, 139, 0.1)", text: "#64748b" },
    };
    const style = colors[status?.toLowerCase()] || colors.rejected;
    return {
      padding: "4px 10px",
      borderRadius: "6px",
      fontSize: "0.75rem",
      fontWeight: "600",
      backgroundColor: style.bg,
      color: style.text,
      textTransform: "capitalize",
    };
  },

  // Role Badges
  roleBadge: (role) => {
    const isAdmin = role === "Administrator";
    return {
      padding: "4px 10px",
      borderRadius: "6px",
      fontSize: "0.75rem",
      fontWeight: "600",
      backgroundColor: isAdmin ? "rgba(59, 130, 246, 0.1)" : "rgba(139, 92, 246, 0.1)",
      color: isAdmin ? "var(--accent)" : "var(--text-secondary-c)",
    };
  },

  // Dropdown Menu
  menuTrigger: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    background: "none",
    border: "1px solid transparent",
    color: "var(--text-muted-c)",
    cursor: "pointer",
    padding: 0,
    borderRadius: "var(--radius-sm)",
    transition: "var(--transition-base)",
  },
  dropdown: {
    position: "absolute",
    top: "110%",
    right: 0,
    minWidth: "160px",
    backgroundColor: "var(--bg-card)",
    border: "1px solid var(--border-color)",
    borderRadius: "10px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
    zIndex: 9999,
  },
  dropdownItem: {
    width: "100%",
    padding: "10px 12px",
    textAlign: "left",
    background: "none",
    border: "none",
    color: "var(--text-main)",
    fontSize: "0.85rem",
    cursor: "pointer",
    borderRadius: "4px",
    transition: "background 0.2s",
    display: "block",
    ":hover": {
        backgroundColor: "var(--bg-sidebar)"
    }
  },

  // Modals
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    backdropFilter: "blur(4px)",
  },
  modal: {
    backgroundColor: "var(--bg-card)",
    borderRadius: "12px",
    width: "100%",
    maxWidth: "450px",
    border: "1px solid var(--border-color)",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
  },
  modalHeader: {
    padding: "20px",
    borderBottom: "1px solid var(--border-color)",
  },
  modalTitle: {
    fontSize: "1.1rem",
    fontWeight: "600",
    color: "var(--text-main)",
    margin: 0,
  },
  modalBody: {
    padding: "20px",
  },
  modalFooter: {
    padding: "16px 20px",
    borderTop: "1px solid var(--border-color)",
    display: "flex",
    justifyContent: "flex-end",
    gap: "12px",
  },
  fieldLabel: {
    display: "block",
    fontSize: "0.8rem",
    fontWeight: "600",
    color: "var(--text-muted)",
    marginBottom: "6px",
    marginTop: "12px",
  },
  inputField: {
    width: "100%",
    padding: "10px 12px",
    backgroundColor: "var(--bg-sidebar)",
    border: "1px solid var(--border-color)",
    borderRadius: "6px",
    color: "var(--text-main)",
    fontSize: "0.9rem",
    outline: "none",
  },
  saveBtn: {
    padding: "8px 16px",
    backgroundColor: "var(--accent-primary)",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontWeight: "600",
    cursor: "pointer",
  },
  cancelBtn: {
    padding: "8px 16px",
    backgroundColor: "transparent",
    color: "var(--text-muted)",
    border: "1px solid var(--border-color)",
    borderRadius: "6px",
    fontWeight: "600",
    cursor: "pointer",
  },
  toast: (type) => ({
    position: "fixed",
    bottom: "24px",
    right: "24px",
    padding: "12px 20px",
    borderRadius: "8px",
    backgroundColor: type === "success" ? "#065f46" : "#991b1b",
    color: "white",
    fontSize: "0.9rem",
    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.2)",
    zIndex: 2000,
    display: "flex",
    alignItems: "center",
    gap: "10px",
  }),
};