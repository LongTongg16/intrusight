import { Link } from "react-router-dom";
import PublicNavbar from "../../components/PublicNavbar";
import "./auth.css";

/**
 * Self-service password reset does not exist in this project — there is no
 * mail transport and no reset-token endpoint. This page therefore explains
 * the real recovery path instead of collecting an address into a form that
 * never sends anything.
 *
 * The only reset path is `POST /api/users/{user_id}/reset-password`, which is
 * administrator-only and is NOT surfaced anywhere in the admin interface, so
 * an operator has to call it directly. The wording below says exactly that
 * rather than pointing users at a User Management button that does not exist.
 */
function ForgotPassword() {
  return (
    <div className="auth">
      <PublicNavbar />

      <main className="auth__main">
        <div className="auth__card">
          <header className="auth__head">
            <h1 className="auth__title">Password reset</h1>
            <p className="auth__sub">
              IntruSight has no self-service reset: there is no mail delivery
              and no reset-token flow. Passwords are reset by an administrator.
            </p>
          </header>

          <div className="auth__panel">
            <ol className="auth__steps">
              <li>
                <span className="auth__step-num">1</span>
                <div>
                  <p className="auth__step-title">Contact an administrator</p>
                  <p className="auth__step-text">
                    Ask someone with an administrator account on this deployment
                    to reset your password.
                  </p>
                </div>
              </li>
              <li>
                <span className="auth__step-num">2</span>
                <div>
                  <p className="auth__step-title">They set a temporary password</p>
                  <p className="auth__step-text">
                    There is no reset button in the admin interface. An
                    administrator has to call the reset endpoint directly
                    (<code className="auth__code">POST /api/users/&#123;id&#125;/reset-password</code>)
                    with an administrator token.
                  </p>
                </div>
              </li>
              <li>
                <span className="auth__step-num">3</span>
                <div>
                  <p className="auth__step-title">You choose a new one</p>
                  <p className="auth__step-text">
                    The reset flags the account, so signing in with the temporary
                    password takes you straight to a change-password step before
                    anything else loads.
                  </p>
                </div>
              </li>
            </ol>

            <p className="auth__foot">
              <Link to="/login" className="auth__link">Back to sign in</Link>
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

export default ForgotPassword;
