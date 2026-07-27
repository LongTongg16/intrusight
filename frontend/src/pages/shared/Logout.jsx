import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

/**
 * Logout Component
 * Invalidates the session server-side before clearing local state,
 * satisfying UC22 step 2 (system invalidates the session on the server).
 */
function Logout() {
  const navigate  = useNavigate();
  const [loading, setLoading] = useState(false);

  // ── Keep Browsing ─────────────────────────────────────────────
  const handleCancel = () => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const role = user.role?.toLowerCase() || "";
      navigate(role.includes("admin") ? "/admin" : "/dashboard");
    } catch {
      navigate("/");
    }
  };

  // ── Actual Logout ─────────────────────────────────────────────
  const handleLogout = async () => {
    setLoading(true);
    try {
      // Step 1 — invalidate the token server-side so it can't be reused
      const token = localStorage.getItem("token");
      if (token) {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method:  "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // If the server call fails, still proceed with client-side logout
    } finally {
      // Step 2 — clear all client-side session data
      localStorage.removeItem("token");
      localStorage.removeItem("user");

      // Step 3 — redirect to landing page, preventing back-navigation to the logout screen
      navigate("/", { replace: true });

      // Step 4 — reload to reset any in-memory state
      window.location.reload();
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.iconWrapper}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </div>

        <h2 style={styles.title}>Confirm Logout</h2>
        <p style={styles.subtitle}>
          Are you sure you want to log out? You will need to enter your credentials to access your account again.
        </p>

        <div style={styles.buttonStack}>
          <button
            style={{ ...styles.logoutButton, opacity: loading ? 0.6 : 1, cursor: loading ? "not-allowed" : "pointer" }}
            onClick={handleLogout}
            disabled={loading}
          >
            {loading ? "Logging out…" : "Yes, Logout"}
          </button>

          <button
            style={styles.cancelButton}
            onClick={handleCancel}
            disabled={loading}
          >
            Keep Browsing
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = {
  container: {
    display: "flex", 
    justifyContent: "center",
    alignItems: "center",
    height: "100vh", 
    backgroundColor: "#0f172a",
    fontFamily: "'Inter', sans-serif",
  },
  card: {
    backgroundColor: "#1e293b", 
    padding: "2.5rem", 
    borderRadius: "16px",
    width: "100%", 
    maxWidth: "400px", 
    textAlign: "center",
    boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)", 
    border: "1px solid #334155",
  },
  iconWrapper: {
    backgroundColor: "rgba(239,68,68,0.1)", 
    width: "70px", 
    height: "70px",
    borderRadius: "50%", 
    display: "flex", 
    justifyContent: "center",
    alignItems: "center", 
    margin: "0 auto 1.5rem auto",
  },

  title:    { 
    color: "#f1f5f9", 
    fontSize: "1.5rem", 
    fontWeight: "700", 
    margin: "0 0 0.5rem 0" },
  
  subtitle: { 
    color: "#94a3b8", 
    fontSize: "0.95rem", 
    lineHeight: "1.6", 
    marginBottom: "2rem" },
  
  buttonStack: { 
    display: "flex", 
    flexDirection: "column", 
    gap: "0.75rem" },
  
  logoutButton: {
    padding: "0.8rem", 
    backgroundColor: "#ef4444", 
    color: "white",
    border: "none", 
    borderRadius: "8px", 
    fontSize: "1rem", 
    fontWeight: "600",
    cursor: "pointer", 
    transition: "background 0.2s",
  },
  cancelButton: {
    padding: "0.8rem", 
    backgroundColor: "transparent", 
    color: "#94a3b8",
    border: "1px solid #334155", 
    borderRadius: "8px",
     fontSize: "1rem",
    fontWeight: "500", 
    cursor: "pointer", 
    transition: "all 0.2s",
  },
};

export default Logout;
