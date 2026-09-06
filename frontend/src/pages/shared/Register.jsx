import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { registerUser } from "../../services/api";
import PublicNavbar from "../../components/PublicNavbar";
import "./auth.css";

/* ── Password strength ─────────────────────────────────────────
   Advisory only. The backend enforces its own policy; this exists to
   guide the user before they submit.
   ───────────────────────────────────────────────────────────── */
const RULES = [
  ["At least 8 characters", (p) => p.length >= 8],
  ["Uppercase letter", (p) => /[A-Z]/.test(p)],
  ["Lowercase letter", (p) => /[a-z]/.test(p)],
  ["Number", (p) => /[0-9]/.test(p)],
  ["Special character", (p) => /[^A-Za-z0-9]/.test(p)],
];

const TIERS = [
  { label: "Weak", cls: "weak" },
  { label: "Fair", cls: "fair" },
  { label: "Good", cls: "good" },
  { label: "Strong", cls: "strong" },
];

function PasswordStrength({ password }) {
  if (!password) return null;
  const passed = RULES.filter(([, test]) => test(password));
  const score = passed.length;
  const tier = TIERS[Math.min(3, Math.max(0, score - 2))];

  return (
    <div className="pw">
      <div className="pw__bar" role="presentation">
        <div className={`pw__fill pw__fill--${tier.cls}`} style={{ width: `${(score / RULES.length) * 100}%` }} />
      </div>
      <p className="pw__meta">
        <span>Password strength</span>
        <span className={`pw__tier pw__tier--${tier.cls}`}>{tier.label}</span>
      </p>
      <ul className="pw__rules">
        {RULES.map(([label, test]) => {
          const ok = test(password);
          return (
            <li key={label} className={`pw__rule${ok ? " is-ok" : ""}`}>
              <span aria-hidden="true">{ok ? "✓" : "○"}</span>
              {label}
            </li>
          );
        })}
      </ul>
      <p className="visually-hidden" aria-live="polite">
        Password strength: {tier.label}. {score} of {RULES.length} requirements met.
      </p>
    </div>
  );
}

const EyeOpen = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOff = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <path d="M1 1l22 22" />
  </svg>
);

function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) return setError("Passwords do not match.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");

    setLoading(true);
    try {
      await registerUser(email.trim().toLowerCase(), password, name);
      setSuccess(true);
    } catch (err) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth">
        <PublicNavbar />
        <main className="auth__main">
          <div className="auth__card">
            <div className="auth__panel auth__panel--center">
              <span className="auth__badge" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
              <h1 className="auth__title">Registration submitted</h1>
              <p className="auth__sub">
                Your account has been created and is <strong>pending administrator
                approval</strong>. You can sign in once an administrator approves it.
              </p>
              <button className="auth__submit" onClick={() => navigate("/login")}>
                Back to sign in
              </button>
            </div>
          </div>
        </main>
        <footer className="auth__footer">
          IntruSight — educational network intrusion alert management platform.
        </footer>
      </div>
    );
  }

  return (
    <div className="auth">
      <PublicNavbar />

      <main className="auth__main">
        <div className="auth__card">
          <header className="auth__head">
            <h1 className="auth__title">Create an account</h1>
            <p className="auth__sub">
              New accounts require administrator approval before first sign-in.
            </p>
          </header>

          <div className="auth__panel">
            {error && (
              <div className="auth__error" role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleRegister}>
              <div className="auth__field">
                <label className="auth__label" htmlFor="reg-name">Full name</label>
                <input
                  id="reg-name" className="auth__input" type="text"
                  value={name} onChange={(e) => setName(e.target.value)}
                  required autoComplete="name"
                />
              </div>

              <div className="auth__field">
                <label className="auth__label" htmlFor="reg-email">Email</label>
                <input
                  id="reg-email" className="auth__input" type="email"
                  placeholder="analyst@example.com"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  required autoComplete="email"
                />
              </div>

              <div className="auth__field">
                <label className="auth__label" htmlFor="reg-password">Password</label>
                <div className="auth__password">
                  <input
                    id="reg-password" className="auth__input"
                    type={showPassword ? "text" : "password"}
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    required autoComplete="new-password"
                    aria-describedby="reg-password-help"
                  />
                  <button
                    type="button" className="auth__reveal"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff /> : <EyeOpen />}
                  </button>
                </div>
                <div id="reg-password-help"><PasswordStrength password={password} /></div>
              </div>

              <div className="auth__field">
                <label className="auth__label" htmlFor="reg-confirm">Confirm password</label>
                <input
                  id="reg-confirm" className="auth__input"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required autoComplete="new-password"
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="auth__hint auth__hint--error">Passwords do not match.</p>
                )}
              </div>

              <div className="auth__field">
                <span className="auth__label">Account role</span>
                <p className="auth__hint">
                  Public registration creates a Security Analyst account.
                  Administrator accounts must be created by an administrator.
                </p>
              </div>

              <button type="submit" className="auth__submit" disabled={loading}>
                {loading ? "Submitting…" : "Create account"}
              </button>
            </form>

            <p className="auth__foot">
              Already have an account? <Link to="/login" className="auth__link">Sign in</Link>
            </p>
          </div>
        </div>
      </main>

      <footer className="auth__footer">
        IntruSight — educational network intrusion alert management platform.
      </footer>
    </div>
  );
}

export default Register;
