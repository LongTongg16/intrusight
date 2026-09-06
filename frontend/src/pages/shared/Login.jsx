import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { loginUser } from "../../services/api";
import PublicNavbar from "../../components/PublicNavbar";
import "./auth.css";

const EyeOpen = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOff = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <path d="M1 1l22 22" />
  </svg>
);

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState("Security Analyst");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Normalise email so "User@Example.com" and "user@example.com" are
      // treated as the same account.
      const normalisedEmail = email.trim().toLowerCase();
      const data = await loginUser(normalisedEmail, password);

      if (data.user?.status === "suspended") {
        throw new Error("Your account has been suspended. Please contact an administrator.");
      }
      if (data.user?.status === "pending") {
        throw new Error("Your account is awaiting approval.");
      }
      if (data.user?.status === "rejected") {
        throw new Error("Your account registration was rejected. Please contact an administrator.");
      }

      const serverRole = data.user?.role?.toLowerCase() || "";
      const isServerAdmin = serverRole.includes("admin");
      const selectedAdmin = role === "Administrator";

      if (isServerAdmin !== selectedAdmin) {
        throw new Error("Role mismatch. Please select the correct role for your account.");
      }

      localStorage.setItem("token", data.access_token || data.token);
      localStorage.setItem("user", JSON.stringify({
        ...data.user,
        force_password_change: data.force_password_change ?? false,
      }));
      localStorage.setItem("userId", data.user.id);

      if (data.force_password_change) navigate("/force-password-change");
      else if (isServerAdmin) navigate("/admin");
      else navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth">
      <PublicNavbar />

      <main className="auth__main">
        <div className="auth__card">
          <header className="auth__head">
            <h1 className="auth__title">Sign in</h1>
            <p className="auth__sub">
              Access the alert queue for your configured detection engines.
            </p>
          </header>

          <div className="auth__panel">
            {error && (
              <div className="auth__error" role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5M12 16h.01" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} noValidate={false}>
              <div className="auth__field">
                <label className="auth__label" htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  className="auth__input"
                  type="email"
                  placeholder="analyst@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="auth__field">
                <label className="auth__label" htmlFor="login-password">Password</label>
                <div className="auth__password">
                  <input
                    id="login-password"
                    className="auth__input"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="auth__reveal"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff /> : <EyeOpen />}
                  </button>
                </div>
                <p className="auth__aside">
                  <Link to="/forgotpassword" className="auth__link">Forgot password?</Link>
                </p>
              </div>

              <div className="auth__field">
                <label className="auth__label" htmlFor="login-role">Sign in as</label>
                <select
                  id="login-role"
                  className="auth__select"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="Security Analyst">Security Analyst</option>
                  <option value="Administrator">Administrator</option>
                </select>
                <p className="auth__hint">
                  Must match the role on your account.
                </p>
              </div>

              <button type="submit" className="auth__submit" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <p className="auth__foot">
              Don&apos;t have an account? <Link to="/register" className="auth__link">Create one</Link>
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

export default Login;
