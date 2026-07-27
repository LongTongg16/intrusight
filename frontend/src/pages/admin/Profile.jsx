import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import "./admin.css";

const API_BASE =
  import.meta.env.VITE_API_BASE ??
  "http://localhost:8000";

function getPasswordStrength(password) {
  if (!password) return null;
  const checks = {
    "8+ characters": password.length >= 8,
    "Uppercase letter": /[A-Z]/.test(password),
    "Lowercase letter": /[a-z]/.test(password),
    Number: /[0-9]/.test(password),
    "Special character": /[^A-Za-z0-9]/.test(password),
  };
  const score = Object.values(checks).filter(Boolean).length;
  if (score <= 2) return { label: "Weak",   color: "#ef4444", width: "20%",  checks };
  if (score === 3) return { label: "Fair",   color: "#f97316", width: "50%",  checks };
  if (score === 4) return { label: "Good",   color: "#eab308", width: "75%",  checks };
  return             { label: "Strong", color: "#10b981", width: "100%", checks };
}

const s = {
  page: {
    flex: 1,
    padding: "2rem",
    overflowY: "auto",
    color: "var(--text-primary)",
    backgroundColor: "var(--bg-primary)",
    boxSizing: "border-box",
    fontFamily: "'Inter', sans-serif",
  },
  toast: (type) => ({
    position: "fixed",
    top: "1.5rem",
    right: "1.5rem",
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    padding: "0.75rem 1.25rem",
    borderRadius: "10px",
    fontSize: "0.9rem",
    fontWeight: 500,
    backgroundColor: type === "success" ? "#10b981" : "#ef4444",
    color: "#fff",
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  }),
  heroCard: {
    background: "var(--hero-gradient, linear-gradient(135deg, #1e3a5f 0%, #1e293b 60%, #0f172a 100%))",
    border: "1px solid var(--border-primary)",
    borderRadius: "16px",
    padding: "2rem",
    marginBottom: "1.5rem",
    display: "flex",
    alignItems: "center",
    gap: "1.5rem",
    color: "#ffffff",
  },
  avatar: {
    width: "76px",
    height: "76px",
    borderRadius: "50%",
    background: "var(--accent-primary)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.7rem",
    fontWeight: 700,
    color: "white",
    position: "relative",
    flexShrink: 0,
  },
  onlineDot: {
    position: "absolute",
    bottom: "4px",
    right: "4px",
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    backgroundColor: "#10b981",
    border: "2px solid #1e3a5f",
  },
  badgeRow: {
    display: "flex",
    gap: "8px",
    marginTop: "10px",
    flexWrap: "wrap",
  },
  roleBadge: {
    padding: "4px 12px",
    borderRadius: "99px",
    fontSize: "0.75rem",
    backgroundColor: "rgba(59,130,246,0.25)",
    color: "#93c5fd",
    border: "1px solid rgba(59,130,246,0.4)",
  },
  card: {
    backgroundColor: "var(--bg-card)",
    border: "1px solid var(--border-primary)",
    borderRadius: "16px",
    padding: "1.75rem",
    marginBottom: "1.5rem",
  },
  tabs: {
    display: "flex",
    gap: "0.5rem",
    flexWrap: "wrap",
    borderBottom: "1px solid var(--border-primary)",
    paddingBottom: "0.75rem",
    marginBottom: "1.5rem",
  },
  tabBtn: (active) => ({
    backgroundColor: active ? "var(--bg-primary)" : "transparent",
    border: `1px solid ${active ? "#3b82f6" : "var(--border-primary)"}`,
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    padding: "0.55rem 0.9rem",
    borderRadius: "999px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "0.85rem",
  }),
  inputGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "1.25rem",
  },
  inputWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
  },
  label: {
    fontSize: "0.8rem",
    color: "var(--text-secondary)",
  },
  input: (editable) => ({
    padding: "0.75rem 1rem",
    width: "100%",
    boxSizing: "border-box",
    backgroundColor: editable ? "var(--bg-input)" : "var(--bg-primary)",
    border: `1px solid ${editable ? "#3b82f6" : "var(--border-primary)"}`,
    borderRadius: "8px",
    color: editable ? "var(--text-primary)" : "var(--text-secondary)",
    outline: "none",
    transition: "all 0.2s ease",
  }),
  select: {
    padding: "0.75rem 1rem",
    width: "100%",
    boxSizing: "border-box",
    backgroundColor: "var(--bg-primary)",
    border: "1px solid var(--border-primary)",
    borderRadius: "8px",
    color: "var(--text-primary)",
    outline: "none",
  },
  prefRow: {
    display: "flex",
    gap: "1rem",
    flexWrap: "wrap",
    marginBottom: "1.25rem",
  },
  checkItem: (checked) => ({
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
    padding: "0.65rem 0.85rem",
    backgroundColor: "var(--bg-primary)",
    border: `1px solid ${checked ? "#3b82f6" : "var(--border-primary)"}`,
    borderRadius: "12px",
    color: "var(--text-primary)",
    fontWeight: 700,
    cursor: "pointer",
    userSelect: "none",
  }),
  divider: {
    height: "1px",
    backgroundColor: "var(--border-primary)",
    margin: "1rem 0",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    backdropFilter: "blur(4px)",
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  modal: {
    backgroundColor: "var(--bg-card)",
    borderRadius: "16px",
    padding: "2rem",
    width: "90%",
    maxWidth: "440px",
    border: "1px solid var(--border-primary)",
  },
  strengthBar: {
    height: "4px",
    backgroundColor: "var(--border-primary)",
    borderRadius: "2px",
    margin: "8px 0",
  },
  btnPrimary: {
    padding: "0.7rem 1.4rem",
    borderRadius: "8px",
    border: "none",
    backgroundColor: "var(--accent-primary)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  },
  btnGreen: {
    padding: "0.7rem 1.4rem",
    borderRadius: "8px",
    border: "none",
    backgroundColor: "#16a34a",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  },
  btnSecondary: {
    padding: "0.7rem 1.4rem",
    borderRadius: "8px",
    border: "1px solid var(--border-primary)",
    backgroundColor: "transparent",
    color: "var(--text-secondary)",
    cursor: "pointer",
  },
};

const TABS = [
  { key: "PERSONAL", label: "Personal Info" },
  { key: "SECURITY", label: "Security Settings" },
  { key: "NOTIF",    label: "Notification Preferences" },
];

function Profile() {
  const [tab, setTab] = useState("PERSONAL");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const [userData, setUserData] = useState({
    full_name: "", email: "", role: "", status: "active",
    phone: "", telegram_id: "",
  });

  const [formData, setFormData] = useState({
    full_name: "", email: "", phone: "", telegram_id: "",
  });

  const [notifMobile,   setNotifMobile]   = useState(true);
  const [notifTelegram, setNotifTelegram] = useState(true);
  const [notifEmail,    setNotifEmail]    = useState(false);
  const [severityPref,  setSeverityPref]  = useState("HIGH_ONLY");

  const [showPasswordModal,    setShowPasswordModal]    = useState(false);
  const [passwordForm,         setPasswordForm]         = useState({ current: "", newPass: "", confirm: "" });
  const [passwordErrors,       setPasswordErrors]       = useState({});
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false);

  const toastTimer = useRef(null);

  const showToast = useCallback((message, type = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const getAuthHeader = useCallback(() => ({
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  }), []);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${API_BASE}/api/users/profile`, getAuthHeader());
        const data = res.data;
        setUserData(data);
        setFormData({
          full_name:   data.full_name   || "",
          email:       data.email       || "",
          phone:       data.phone       || "",
          telegram_id: data.telegram_id || "",
        });
      } catch {
        showToast("Failed to load profile", "error");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, [getAuthHeader, showToast]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!formData.full_name.trim()) return showToast("Name is required", "error");
    setIsSaving(true);
    try {
      await axios.put(
        `${API_BASE}/api/users/profile`,
        { full_name: formData.full_name, phone: formData.phone, telegram_id: formData.telegram_id },
        getAuthHeader()
      );
      setUserData((prev) => ({ ...prev, ...formData }));
      setEditing(false);
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      localStorage.setItem("user", JSON.stringify({ ...stored, ...formData }));
      window.dispatchEvent(new Event("user-updated"));
      showToast("Profile updated!");
    } catch (err) {
      showToast(err.response?.data?.detail || "Update failed", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveNotif = () => showToast("Preferences saved!");

  const handlePasswordSubmit = async () => {
    const errors = {};
    const strength = getPasswordStrength(passwordForm.newPass);
    if (!passwordForm.current)                         errors.current = "Required";
    if (strength?.label === "Weak")                    errors.newPass = "Password is too weak";
    if (passwordForm.newPass !== passwordForm.confirm) errors.confirm = "Passwords do not match";
    if (Object.keys(errors).length > 0) return setPasswordErrors(errors);

    setIsPasswordSubmitting(true);
    try {
      await axios.put(
        `${API_BASE}/api/users/profile/password`,
        { current_password: passwordForm.current, new_password: passwordForm.newPass },
        getAuthHeader()
      );
      setShowPasswordModal(false);
      setPasswordForm({ current: "", newPass: "", confirm: "" });
      setPasswordErrors({});
      showToast("Password updated!");
    } catch (err) {
      showToast(err.response?.data?.detail || "Update failed", "error");
    } finally {
      setIsPasswordSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ ...s.page, display: "flex", justifyContent: "center", alignItems: "center" }}>
        Loading...
      </div>
    );
  }

  const initials = (userData.full_name || "?")
    .split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const strength = getPasswordStrength(passwordForm.newPass);

  return (
    <div style={s.page}>
      {toast && <div style={s.toast(toast.type)}>{toast.message}</div>}

      <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem", color: "var(--text-primary)" }}>
        Admin Profile
      </h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
        Manage your admin account settings
      </p>

      {/* ── Hero Card ── */}
      <div style={s.heroCard}>
        <div style={s.avatar}>
          {initials}
          <div style={s.onlineDot} />
        </div>
        <div>
          <h2 style={{ margin: 0, color: "#ffffff" }}>{userData.full_name}</h2>
          <p style={{ color: "rgba(255,255,255,0.7)", margin: "4px 0" }}>{userData.email}</p>
          <div style={s.badgeRow}>
            <span style={s.roleBadge}>{userData.role || "Admin"}</span>
            <span style={{
              ...s.roleBadge,
              color: "#6ee7b7",
              backgroundColor: "rgba(16,185,129,0.2)",
              border: "1px solid rgba(16,185,129,0.4)",
            }}>
              {userData.status}
            </span>
          </div>
        </div>
      </div>

      {/* ── Main Card ── */}
      <div style={s.card}>
        <div style={s.tabs}>
          {TABS.map(({ key, label }) => (
            <button key={key} type="button" style={s.tabBtn(tab === key)} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Personal Info ── */}
        {tab === "PERSONAL" && (
          <form onSubmit={handleSaveProfile}>
            <div style={s.inputGrid}>
              <div style={s.inputWrap}>
                <label style={s.label}>Full Name</label>
                <input
                  style={s.input(editing)}
                  value={formData.full_name}
                  onChange={(e) => setFormData((p) => ({ ...p, full_name: e.target.value }))}
                  readOnly={!editing}
                />
              </div>
              <div style={s.inputWrap}>
                <label style={s.label}>Email</label>
                <input style={s.input(false)} value={formData.email} readOnly />
              </div>
              <div style={s.inputWrap}>
                <label style={s.label}>Phone</label>
                <input
                  style={s.input(editing)}
                  value={formData.phone}
                  onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                  readOnly={!editing}
                />
              </div>
              <div style={s.inputWrap}>
                <label style={s.label}>Telegram ID</label>
                <input
                  style={s.input(editing)}
                  value={formData.telegram_id}
                  onChange={(e) => setFormData((p) => ({ ...p, telegram_id: e.target.value }))}
                  readOnly={!editing}
                  placeholder="e.g. 123456789"
                />
              </div>
            </div>

            <div style={{
              display: "flex", justifyContent: "space-between", flexWrap: "wrap",
              gap: "0.75rem", marginTop: "2rem",
              borderTop: "1px solid var(--border-primary)",
              paddingTop: "1.5rem",
            }}>
              <button type="button" style={s.btnSecondary} onClick={() => setShowPasswordModal(true)}>
                Change Password
              </button>
              <div style={{ display: "flex", gap: "10px" }}>
                {editing ? (
                  <>
                    <button
                      type="button"
                      style={s.btnSecondary}
                      onClick={() => {
                        setEditing(false);
                        setFormData({
                          full_name:   userData.full_name,
                          email:       userData.email,
                          phone:       userData.phone,
                          telegram_id: userData.telegram_id,
                        });
                      }}
                    >
                      Cancel
                    </button>
                    <button type="submit" style={s.btnPrimary} disabled={isSaving}>
                      {isSaving ? "Saving…" : "Save Changes"}
                    </button>
                  </>
                ) : (
                  <button type="button" style={s.btnPrimary} onClick={() => setEditing(true)}>
                    Edit Profile
                  </button>
                )}
              </div>
            </div>
          </form>
        )}

        {/* ── Security Settings ── */}
        {tab === "SECURITY" && (
          <div>
            <div style={s.inputGrid}>
              <div style={s.inputWrap}>
                <label style={s.label}>Current Password</label>
                <input
                  type="password"
                  style={s.input(true)}
                  placeholder="••••••••"
                  value={passwordForm.current}
                  onChange={(e) => setPasswordForm((p) => ({ ...p, current: e.target.value }))}
                />
                {passwordErrors.current && (
                  <small style={{ color: "#ef4444" }}>{passwordErrors.current}</small>
                )}
              </div>
              <div style={s.inputWrap}>
                <label style={s.label}>New Password</label>
                <input
                  type="password"
                  style={s.input(true)}
                  placeholder="••••••••"
                  value={passwordForm.newPass}
                  onChange={(e) => setPasswordForm((p) => ({ ...p, newPass: e.target.value }))}
                />
                {strength && (
                  <>
                    <div style={s.strengthBar}>
                      <div style={{
                        height: "100%",
                        width: strength.width,
                        backgroundColor: strength.color,
                        borderRadius: "2px",
                      }} />
                    </div>
                    <small style={{ color: strength.color }}>Strength: {strength.label}</small>
                  </>
                )}
                {passwordErrors.newPass && (
                  <small style={{ color: "#ef4444" }}>{passwordErrors.newPass}</small>
                )}
              </div>
              <div style={s.inputWrap}>
                <label style={s.label}>Confirm Password</label>
                <input
                  type="password"
                  style={s.input(true)}
                  placeholder="••••••••"
                  value={passwordForm.confirm}
                  onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))}
                />
                {passwordErrors.confirm && (
                  <small style={{ color: "#ef4444" }}>{passwordErrors.confirm}</small>
                )}
              </div>
              <div style={s.inputWrap}>
                <label style={s.label}>MFA</label>
                <div style={{
                  display: "flex", gap: "0.6rem", alignItems: "center",
                  padding: "0.75rem 0.9rem",
                  border: "1px solid var(--border-primary)",
                  borderRadius: "8px",
                  backgroundColor: "var(--bg-primary)",
                }}>
                  <input type="checkbox" defaultChecked />
                  <span style={{ color: "var(--text-primary)", fontSize: "0.9rem" }}>
                    Enable multi-factor authentication
                  </span>
                </div>
              </div>
            </div>

            <div style={{
              display: "flex", justifyContent: "flex-end", gap: "0.6rem",
              marginTop: "2rem",
              borderTop: "1px solid var(--border-primary)",
              paddingTop: "1.5rem",
            }}>
              <button
                style={s.btnPrimary}
                onClick={() => {
                  setPasswordErrors({});
                  handlePasswordSubmit();
                }}
                disabled={isPasswordSubmitting}
              >
                {isPasswordSubmitting ? "Updating…" : "Update Password"}
              </button>
              <button style={s.btnSecondary} onClick={() => showToast("MFA setup (mock)")}>
                Setup MFA
              </button>
            </div>
          </div>
        )}

        {/* ── Notification Preferences ── */}
        {tab === "NOTIF" && (
          <div>
            <div style={s.prefRow}>
              {[
                ["Mobile Push", notifMobile,   setNotifMobile],
                ["Telegram",    notifTelegram,  setNotifTelegram],
                ["Email",       notifEmail,     setNotifEmail],
              ].map(([label, val, setter]) => (
                <label key={label} style={s.checkItem(val)}>
                  <input
                    type="checkbox"
                    checked={val}
                    onChange={(e) => setter(e.target.checked)}
                    style={{ accentColor: "#3b82f6" }}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <div style={s.divider} />
            <div style={s.inputWrap}>
              <label style={s.label}>Severity Selection</label>
              <select
                style={s.select}
                value={severityPref}
                onChange={(e) => setSeverityPref(e.target.value)}
              >
                <option value="HIGH_ONLY">High only</option>
                <option value="HIGH_MED">High &amp; Medium</option>
                <option value="ALL">All severities</option>
              </select>
            </div>
            <div style={{
              display: "flex", justifyContent: "flex-end",
              marginTop: "2rem",
              borderTop: "1px solid var(--border-primary)",
              paddingTop: "1.5rem",
            }}>
              <button style={s.btnGreen} onClick={handleSaveNotif}>
                Save Preferences
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Password Modal ── */}
      {showPasswordModal && (
        <div style={s.overlay} onClick={() => setShowPasswordModal(false)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, color: "var(--text-primary)" }}>Change Password</h2>

            <div style={{ marginBottom: "1rem" }}>
              <label style={s.label}>Current Password</label>
              <input
                type="password" style={s.input(true)}
                value={passwordForm.current}
                onChange={(e) => setPasswordForm((p) => ({ ...p, current: e.target.value }))}
              />
              {passwordErrors.current && (
                <small style={{ color: "#ef4444" }}>{passwordErrors.current}</small>
              )}
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={s.label}>New Password</label>
              <input
                type="password" style={s.input(true)}
                value={passwordForm.newPass}
                onChange={(e) => setPasswordForm((p) => ({ ...p, newPass: e.target.value }))}
              />
              {strength && (
                <>
                  <div style={s.strengthBar}>
                    <div style={{
                      height: "100%", width: strength.width,
                      backgroundColor: strength.color, borderRadius: "2px",
                    }} />
                  </div>
                  <small style={{ color: strength.color }}>Strength: {strength.label}</small>
                </>
              )}
              {passwordErrors.newPass && (
                <div style={{ color: "#ef4444", fontSize: "0.8rem", marginTop: "4px" }}>
                  {passwordErrors.newPass}
                </div>
              )}
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={s.label}>Confirm Password</label>
              <input
                type="password" style={s.input(true)}
                value={passwordForm.confirm}
                onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))}
              />
              {passwordErrors.confirm && (
                <small style={{ color: "#ef4444" }}>{passwordErrors.confirm}</small>
              )}
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                style={{ ...s.btnSecondary, flex: 1 }}
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordErrors({});
                  setPasswordForm({ current: "", newPass: "", confirm: "" });
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                style={{ ...s.btnPrimary, flex: 1 }}
                onClick={handlePasswordSubmit}
                disabled={isPasswordSubmitting}
              >
                {isPasswordSubmitting ? "Updating…" : "Update"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Profile;
