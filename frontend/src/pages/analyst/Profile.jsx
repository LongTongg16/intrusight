import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { changePassword } from "../../services/api";
import { PageHeader } from "../../components/ui";
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
  });

  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
  });

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
      await axios.put(
        `${API_BASE}/api/users/profile`,
        { full_name: formData.full_name },
        getAuthHeader()
      );
      setUserData((prev) => ({ ...prev, full_name: formData.full_name }));
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
      await changePassword(passwordForm.current, passwordForm.newPass);

      setShowPasswordModal(false);
      setPasswordForm({ current: "", newPass: "", confirm: "" });
      showToast("Password updated!");
    } catch (err) {
      showToast(err.message || "Update failed", "error");
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

        <PageHeader
          title="Profile"
          subtitle="Your account details and password. Only your full name can be changed here."
        />

        <div style={s.heroCard}>
          <div style={s.avatar}>
            {initials}
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
                <div style={s.inputWrap}>
                  <label style={s.label} htmlFor="profile-full_name">
                    FULL NAME
                  </label>
                  <input
                    id="profile-full_name"
                    style={s.input(editing)}
                    value={formData.full_name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, full_name: e.target.value }))
                    }
                    readOnly={!editing}
                  />
                </div>
                <div style={s.inputWrap}>
                  <label style={s.label} htmlFor="profile-email">
                    EMAIL
                  </label>
                  <input
                    id="profile-email"
                    style={s.input(false)}
                    value={formData.email}
                    readOnly
                  />
                </div>
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
            <div>
              <p style={s.securityNote}>
                Changing your password is the only account security control this
                build implements. Multi-factor authentication is not available.
              </p>
              <button
                type="button"
                style={s.btnPrimary}
                onClick={() => setShowPasswordModal(true)}
              >
                Change Password
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
    background: "var(--accent-muted)",
    border: "1px solid color-mix(in srgb, var(--accent) 40%, transparent)",
    color: "var(--accent)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.7rem",
    fontWeight: 700,
    position: "relative",
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
    display: "inline-flex",
    gap: "2px",
    padding: "3px",
    marginBottom: "1.5rem",
    // The wrapper is layout only. It used to carry a surface and border,
    // which on the white-yellow theme resolved to #fffbeb on #fde68a and
    // drew a pale bubble around the two pills. The border stays declared but
    // transparent so the box model — and therefore the pills' position — is
    // unchanged.
    border: "1px solid transparent",
    borderRadius: "var(--radius-md)",
    background: "transparent",
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
  securityNote: {
    margin: "0 0 1.25rem",
    maxWidth: "62ch",
    color: "var(--text-muted)",
    fontSize: "0.9rem",
    lineHeight: 1.6,
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
    backgroundColor: "var(--accent-solid)",
    color: "var(--accent-on)",
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
