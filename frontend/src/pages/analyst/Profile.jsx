import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import "./analyst.css";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
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

  if (score <= 2) {
    return { label: "Weak", color: "#ef4444", width: "20%", checks };
  }
  if (score === 3) {
    return { label: "Fair", color: "#f97316", width: "50%", checks };
  }
  if (score === 4) {
    return { label: "Good", color: "#eab308", width: "75%", checks };
  }
  return { label: "Strong", color: "#10b981", width: "100%", checks };
}

const TABS = [
  { key: "PERSONAL", label: "Personal Info" },
  { key: "SECURITY", label: "Security Settings" },
  { key: "NOTIF", label: "Notification Preferences" },
];

function Profile() {
  const [tab, setTab] = useState("PERSONAL");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const [userData, setUserData] = useState({
    full_name: "",
    email: "",
    role: "",
    status: "active",
    phone: "",
    telegram_id: "",
  });

  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    telegram_id: "",
  });

  const [notifMobile, setNotifMobile] = useState(true);
  const [notifTelegram, setNotifTelegram] = useState(true);
  const [notifEmail, setNotifEmail] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    current: "",
    newPass: "",
    confirm: "",
  });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false);

  const toastTimer = useRef(null);

  const showToast = useCallback((message, type = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const getAuthHeader = useCallback(() => {
    const token = localStorage.getItem("token");
    return {
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
      },
    };
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${API_BASE}/api/users/profile`, getAuthHeader());

        setUserData(res.data);
        setFormData({
          full_name: res.data.full_name || "",
          email: res.data.email || "",
          phone: res.data.phone || "",
          telegram_id: res.data.telegram_id || "",
        });
      } catch {
        showToast("Failed to load profile", "error");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();

    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [getAuthHeader, showToast]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      await axios.put(`${API_BASE}/api/users/profile`, formData, getAuthHeader());
      setUserData((prev) => ({ ...prev, ...formData }));
      setEditing(false);
      showToast("Profile updated!");
    } catch (err) {
      showToast(err.response?.data?.detail || "Update failed", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordSubmit = async () => {
    const errors = {};

    if (!passwordForm.current) {
      errors.current = "Current password is required";
    }
    if (!passwordForm.newPass) {
      errors.newPass = "New password is required";
    }
    if (passwordForm.newPass !== passwordForm.confirm) {
      errors.confirm = "Passwords do not match";
    }

    const strength = getPasswordStrength(passwordForm.newPass);
    if (passwordForm.newPass && strength?.label === "Weak") {
      errors.newPass = "Password is too weak";
    }

    if (Object.keys(errors).length > 0) {
      setPasswordErrors(errors);
      return;
    }

    setPasswordErrors({});
    setIsPasswordSubmitting(true);

    try {
      await axios.put(
        `${API_BASE}/api/users/profile/password`,
        {
          current_password: passwordForm.current,
          new_password: passwordForm.newPass,
        },
        getAuthHeader()
      );

      setShowPasswordModal(false);
      setPasswordForm({ current: "", newPass: "", confirm: "" });
      showToast("Password updated!");
    } catch (err) {
      showToast(err.response?.data?.detail || "Update failed", "error");
    } finally {
      setIsPasswordSubmitting(false);
    }
  };

  if (loading) {
    return <div style={s.loadingContainer}>Loading...</div>;
  }

  const initials = (userData.full_name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const strength = getPasswordStrength(passwordForm.newPass);

  return (
    <>
      <div style={s.page}>
        {toast && <div style={s.toast(toast.type)}>{toast.message}</div>}

        <h1 className="page-title">Profile</h1>
        <p style={s.headerSub}>Manage your account settings</p>

        <div style={s.heroCard}>
          <div style={s.avatar}>
            {initials}
            <div style={s.onlineDot} />
          </div>

          <div>
            <h2 style={{ margin: 0 }}>{userData.full_name}</h2>
            <p style={{ color: "var(--text-muted)", margin: "4px 0" }}>
              {userData.email}
            </p>
            <div style={s.badgeRow}>
              <span style={s.roleBadge}>{userData.role}</span>
              <span
                style={{
                  ...s.roleBadge,
                  color: "#10b981",
                  borderColor: "#10b981",
                }}
              >
                {userData.status}
              </span>
            </div>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.tabs}>
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                style={s.tabBtn(tab === key)}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "PERSONAL" && (
            <form onSubmit={handleSaveProfile}>
              <div style={s.inputGrid}>
                {["full_name", "email", "phone", "telegram_id"].map((field) => (
                  <div key={field} style={s.inputWrap}>
                    <label style={s.label}>
                      {field.replace("_", " ").toUpperCase()}
                    </label>
                    <input
                      style={s.input(editing)}
                      value={formData[field]}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          [field]: e.target.value,
                        }))
                      }
                      readOnly={!editing}
                    />
                  </div>
                ))}
              </div>

              <div style={s.actionRow}>
                <button
                  type="button"
                  style={s.btnSecondary}
                  onClick={() => setShowPasswordModal(true)}
                >
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
                            full_name: userData.full_name || "",
                            email: userData.email || "",
                            phone: userData.phone || "",
                            telegram_id: userData.telegram_id || "",
                          });
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        style={s.btnPrimary}
                        disabled={isSaving}
                      >
                        {isSaving ? "Saving…" : "Save Changes"}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      style={s.btnPrimary}
                      onClick={() => setEditing(true)}
                    >
                      Edit Profile
                    </button>
                  )}
                </div>
              </div>
            </form>
          )}

          {tab === "SECURITY" && (
            <div style={s.inputGrid}>
              <div style={s.inputWrap}>
                <label style={s.label}>MFA</label>
                <div style={s.mfaBox}>
                  <input type="checkbox" defaultChecked />
                  <span style={{ color: "var(--text-main)", fontSize: "0.9rem" }}>
                    Enable multi-factor authentication
                  </span>
                </div>
              </div>
            </div>
          )}

          {tab === "NOTIF" && (
            <div>
              <div style={s.prefRow}>
                {[
                  ["Mobile Push", notifMobile, setNotifMobile],
                  ["Telegram", notifTelegram, setNotifTelegram],
                  ["Email", notifEmail, setNotifEmail],
                ].map(([label, val, setter]) => (
                  <label key={label} style={s.checkItem(val)}>
                    <input
                      type="checkbox"
                      checked={val}
                      onChange={(e) => setter(e.target.checked)}
                      style={{ accentColor: "var(--accent-primary)" }}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>

              <div style={s.divider} />

              <button
                style={s.btnGreen}
                onClick={() => showToast("Preferences saved!")}
              >
                Save Preferences
              </button>
            </div>
          )}
        </div>

        {showPasswordModal && (
          <div style={s.overlay} onClick={() => setShowPasswordModal(false)}>
            <div style={s.modal} onClick={(e) => e.stopPropagation()}>
              <h2 style={{ marginTop: 0, color: "var(--text-main)" }}>
                Change Password
              </h2>

              <div style={{ marginBottom: "1rem" }}>
                <label style={s.label}>Current Password</label>
                <input
                  type="password"
                  style={s.input(true)}
                  value={passwordForm.current}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({
                      ...prev,
                      current: e.target.value,
                    }))
                  }
                />
                {passwordErrors.current && (
                  <p style={s.errorText}>{passwordErrors.current}</p>
                )}
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={s.label}>New Password</label>
                <input
                  type="password"
                  style={s.input(true)}
                  value={passwordForm.newPass}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({
                      ...prev,
                      newPass: e.target.value,
                    }))
                  }
                />

                {strength && (
                  <>
                    <div style={s.strengthBar}>
                      <div
                        style={{
                          height: "100%",
                          width: strength.width,
                          backgroundColor: strength.color,
                          borderRadius: "2px",
                        }}
                      />
                    </div>
                    <p style={{ ...s.helperText, color: strength.color }}>
                      Strength: {strength.label}
                    </p>
                  </>
                )}

                {passwordErrors.newPass && (
                  <p style={s.errorText}>{passwordErrors.newPass}</p>
                )}
              </div>

              <div style={{ marginBottom: "1.25rem" }}>
                <label style={s.label}>Confirm New Password</label>
                <input
                  type="password"
                  style={s.input(true)}
                  value={passwordForm.confirm}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({
                      ...prev,
                      confirm: e.target.value,
                    }))
                  }
                />
                {passwordErrors.confirm && (
                  <p style={s.errorText}>{passwordErrors.confirm}</p>
                )}
              </div>

              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
                <button
                  style={s.btnSecondary}
                  onClick={() => setShowPasswordModal(false)}
                  disabled={isPasswordSubmitting}
                >
                  Cancel
                </button>
                <button
                  style={s.btnPrimary}
                  onClick={handlePasswordSubmit}
                  disabled={isPasswordSubmitting}
                >
                  {isPasswordSubmitting ? "Updating..." : "Update"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const s = {
  page: {
    flex: 1,
    padding: "2rem",
    overflowY: "auto",
    color: "var(--text-main)",
    boxSizing: "border-box",
  },
  loadingContainer: {
    flex: 1,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh",
    color: "var(--text-main)",
  },
  headerSub: {
    color: "var(--text-muted)",
    marginBottom: "2rem",
  },
  toast: (type) => ({
    position: "fixed",
    top: "1.5rem",
    right: "1.5rem",
    zIndex: 9999,
    padding: "0.75rem 1.25rem",
    borderRadius: "10px",
    backgroundColor: type === "success" ? "#10b981" : "#ef4444",
    color: "#fff",
  }),
  heroCard: {
    background: "var(--bg-card)",
    border: "1px solid var(--border-color)",
    borderRadius: "16px",
    padding: "2rem",
    marginBottom: "1.5rem",
    display: "flex",
    alignItems: "center",
    gap: "1.5rem",
  },
  avatar: {
    width: "76px",
    height: "76px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, var(--accent-primary), #8b5cf6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.7rem",
    fontWeight: 700,
    color: "white",
    position: "relative",
  },
  onlineDot: {
    position: "absolute",
    bottom: "4px",
    right: "4px",
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    backgroundColor: "#10b981",
    border: "2px solid var(--bg-card)",
  },
  badgeRow: {
    display: "flex",
    gap: "8px",
    marginTop: "10px",
  },
  roleBadge: {
    padding: "4px 12px",
    borderRadius: "99px",
    fontSize: "0.75rem",
    backgroundColor: "rgba(59,130,246,0.1)",
    color: "var(--accent-primary)",
    border: "1px solid var(--border-color)",
  },
  card: {
    backgroundColor: "var(--bg-card)",
    border: "1px solid var(--border-color)",
    borderRadius: "16px",
    padding: "1.75rem",
    marginBottom: "1.5rem",
  },
  tabs: {
    display: "flex",
    gap: "0.5rem",
    borderBottom: "1px solid var(--border-color)",
    paddingBottom: "0.75rem",
    marginBottom: "1.5rem",
    flexWrap: "wrap",
  },
  tabBtn: (active) => ({
    backgroundColor: active ? "var(--bg-main)" : "transparent",
    border: `1px solid ${active ? "var(--accent-primary)" : "var(--border-color)"}`,
    color: active ? "var(--text-main)" : "var(--text-muted)",
    padding: "0.55rem 0.9rem",
    borderRadius: "999px",
    cursor: "pointer",
    fontWeight: 700,
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
    color: "var(--text-muted)",
  },
  input: (editable) => ({
    padding: "0.75rem 1rem",
    backgroundColor: editable ? "var(--bg-main)" : "var(--bg-card)",
    border: "1px solid var(--border-color)",
    borderRadius: "8px",
    color: "var(--text-main)",
    outline: "none",
    width: "100%",
  }),
  actionRow: {
    display: "flex",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "0.75rem",
    marginTop: "2rem",
    borderTop: "1px solid var(--border-color)",
    paddingTop: "1.5rem",
  },
  mfaBox: {
    display: "flex",
    gap: "0.6rem",
    alignItems: "center",
    padding: "0.75rem 0.9rem",
    border: "1px solid var(--border-color)",
    borderRadius: "8px",
    backgroundColor: "var(--bg-main)",
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
    backgroundColor: "var(--bg-main)",
    border: `1px solid ${checked ? "var(--accent-primary)" : "var(--border-color)"}`,
    borderRadius: "12px",
    color: "var(--text-main)",
    fontWeight: 700,
    cursor: "pointer",
  }),
  divider: {
    height: "1px",
    backgroundColor: "var(--border-color)",
    margin: "1rem 0",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1rem",
  },
  modal: {
    backgroundColor: "var(--bg-card)",
    borderRadius: "16px",
    padding: "2rem",
    width: "90%",
    maxWidth: "440px",
    border: "1px solid var(--border-color)",
  },
  strengthBar: {
    height: "4px",
    backgroundColor: "var(--border-color)",
    borderRadius: "2px",
    margin: "8px 0",
    overflow: "hidden",
  },
  helperText: {
    fontSize: "0.82rem",
    margin: "0.35rem 0 0",
  },
  errorText: {
    fontSize: "0.82rem",
    color: "#ef4444",
    margin: "0.35rem 0 0",
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
    border: "1px solid var(--border-color)",
    backgroundColor: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
  },
};

export default Profile;
