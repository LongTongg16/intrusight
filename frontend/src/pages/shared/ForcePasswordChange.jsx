import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

// ── Password strength ─────────────────────────────────────────────────────────
function getPasswordStrength(password) {
  if (!password) return null;
  const checks = {
    "8+ characters":     password.length >= 8,
    "Uppercase":         /[A-Z]/.test(password),
    "Lowercase":         /[a-z]/.test(password),
    "Number":            /[0-9]/.test(password),
    "Special character": /[^A-Za-z0-9]/.test(password),
  };
  const score = Object.values(checks).filter(Boolean).length;
  if (score <= 2) return { label: "Weak",   color: "#ef4444", width: "20%",  checks };
  if (score === 3) return { label: "Fair",   color: "#f97316", width: "50%",  checks };
  if (score === 4) return { label: "Good",   color: "#eab308", width: "75%",  checks };
  return             { label: "Strong", color: "#10b981", width: "100%", checks };
}

// ── Eye icon ──────────────────────────────────────────────────────────────────
function EyeIcon({ visible }) {
  return visible ? (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
      fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
      fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  page: {
    minHeight: "100vh", backgroundColor: "#0f172a",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    padding: "2rem",
  },
  card: {
    backgroundColor: "#1e293b", border: "1px solid #334155",
    borderRadius: "16px", padding: "2.5rem",
    width: "100%", maxWidth: "440px",
    boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
  },
  icon:     { fontSize: "2.5rem", textAlign: "center", marginBottom: "1rem" },
  title:    { fontSize: "1.4rem", fontWeight: 700, color: "#f1f5f9", margin: "0 0 0.5rem 0", textAlign: "center" },
  subtitle: { fontSize: "0.88rem", color: "#64748b", textAlign: "center", margin: "0 0 1.5rem 0", lineHeight: 1.6 },
  warningBox: {
    backgroundColor: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
    borderRadius: "8px", padding: "12px 14px", fontSize: "0.82rem",
    color: "#fcd34d", marginBottom: "1.5rem", lineHeight: 1.5,
  },
  banner: {
    backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: "8px", padding: "10px 14px", fontSize: "0.85rem",
    color: "#fca5a5", marginBottom: "1.25rem",
  },
  group:   { marginBottom: "1.1rem" },
  label:   { display: "block", fontSize: "0.78rem", color: "#64748b", fontWeight: 600, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" },
  wrapper: { position: "relative" },
  input: {
    width: "100%", padding: "0.75rem 2.8rem 0.75rem 1rem", boxSizing: "border-box",
    backgroundColor: "#334155", border: "1px solid #475569",
    borderRadius: "8px", color: "#f1f5f9", fontSize: "0.95rem", outline: "none",
  },
  eyeBtn: {
    position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
    background: "none", border: "none", cursor: "pointer", padding: "4px",
    display: "flex", alignItems: "center",
  },
  error:  { display: "block", fontSize: "0.75rem", color: "#ef4444", marginTop: "4px" },
  matchOk:  { display: "block", fontSize: "0.72rem", color: "#10b981", marginTop: "4px" },
  matchErr: { display: "block", fontSize: "0.72rem", color: "#ef4444", marginTop: "4px" },
  btn: (disabled) => ({
    width: "100%", padding: "0.85rem", border: "none", borderRadius: "8px",
    fontSize: "0.95rem", fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
    backgroundColor: "#3b82f6", color: "white",
    opacity: disabled ? 0.6 : 1, marginTop: "0.5rem",
  }),
  strengthBar: {
    height: "4px", backgroundColor: "#334155",
    borderRadius: "2px", overflow: "hidden", margin: "8px 0 6px",
  },
  checkList: { display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "6px" },
  check: (ok) => ({
    fontSize: "0.7rem", padding: "2px 7px", borderRadius: "9999px",
    backgroundColor: ok ? "rgba(16,185,129,0.1)" : "rgba(100,116,139,0.1)",
    color: ok ? "#10b981" : "#475569",
    border: `1px solid ${ok ? "rgba(16,185,129,0.2)" : "rgba(100,116,139,0.15)"}`,
  }),
};

// ── Component ─────────────────────────────────────────────────────────────────
function ForcePasswordChange() {
  const [newPassword, setNewPassword]         = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew]                 = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [errors, setErrors]                   = useState({});
  const [apiError, setApiError]               = useState("");
  const [loading, setLoading]                 = useState(false);
  const navigate = useNavigate();

  const token    = localStorage.getItem("token");
  const userData = JSON.parse(localStorage.getItem("user") || "{}");
  const strength = getPasswordStrength(newPassword);

  const validate = () => {
    const e = {};
    if (!newPassword)                e.newPassword = "New password is required";
    else if (newPassword.length < 8) e.newPassword = "Minimum 8 characters";
    if (newPassword !== confirmPassword) e.confirmPassword = "Passwords do not match";
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError("");
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setLoading(true);
    try {
      // Uses the force-change-password endpoint — no current password required
      const response = await axios.post(
        `${API_BASE}/api/users/force-change-password`,
        { new_password: newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      localStorage.setItem("token", response.data.token);

      // Clear the flag from localStorage
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      localStorage.setItem("user", JSON.stringify({ ...stored, force_password_change: false }));

      // Redirect based on role
      const role = userData.role?.toLowerCase() || "";
      navigate(role.includes("admin") ? "/admin" : "/dashboard");
    } catch (err) {
      setApiError(err.response?.data?.detail || "Failed to update password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.icon}>🔒</div>
        <h1 style={s.title}>Password Change Required</h1>
        <p style={s.subtitle}>
          Your password was set by an administrator and must be changed before you can access the dashboard.
        </p>

        <div style={s.warningBox}>
          ⚠ You will not be able to proceed until you set a new password.
        </div>

        {apiError && <div style={s.banner}>{apiError}</div>}

        <form onSubmit={handleSubmit}>

          {/* New Password */}
          <div style={s.group}>
            <label style={s.label}>New Password</label>
            <div style={s.wrapper}>
              <input
                type={showNew ? "text" : "password"}
                style={s.input}
                placeholder="Enter your new password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setErrors({}); }}
              />
              <button type="button" style={s.eyeBtn} onClick={() => setShowNew(v => !v)}>
                <EyeIcon visible={showNew} />
              </button>
            </div>
            {errors.newPassword && <span style={s.error}>{errors.newPassword}</span>}

            {/* Strength indicator */}
            {newPassword && strength && (
              <div>
                <div style={s.strengthBar}>
                  <div style={{ height: "100%", width: strength.width, backgroundColor: strength.color, borderRadius: "2px", transition: "width 0.3s ease" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem" }}>
                  <span style={{ color: "#64748b" }}>Password strength</span>
                  <span style={{ color: strength.color, fontWeight: 600 }}>{strength.label}</span>
                </div>
                <div style={s.checkList}>
                  {Object.entries(strength.checks).map(([label, ok]) => (
                    <span key={label} style={s.check(ok)}>{ok ? "✓" : "○"} {label}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div style={s.group}>
            <label style={s.label}>Confirm New Password</label>
            <div style={s.wrapper}>
              <input
                type={showConfirm ? "text" : "password"}
                style={s.input}
                placeholder="Confirm your new password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setErrors({}); }}
              />
              <button type="button" style={s.eyeBtn} onClick={() => setShowConfirm(v => !v)}>
                <EyeIcon visible={showConfirm} />
              </button>
            </div>
            {errors.confirmPassword && <span style={s.error}>{errors.confirmPassword}</span>}
            {confirmPassword && !errors.confirmPassword && (
              newPassword === confirmPassword
                ? <span style={s.matchOk}>✓ Passwords match</span>
                : <span style={s.matchErr}>✕ Passwords do not match</span>
            )}
          </div>

          <button type="submit" style={s.btn(loading)} disabled={loading}>
            {loading ? "Updating…" : "Set New Password & Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ForcePasswordChange;
