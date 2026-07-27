import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import "./ForgotPassword.css";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="auth-page">
      {/* Navbar - fixed with CSS override */}
      <nav className="navbar">
        <div className="nav-logo">Intrusion Detection</div>  
        <ul className="nav-menu">
          <li>
            <NavLink 
              to="/" 
              className={({ isActive }) => isActive ? "nav-active" : "nav-link"}
            >
              Home
            </NavLink>
          </li>
          <li>
            <NavLink 
              to="/about" 
              className={({ isActive }) => isActive ? "nav-active" : "nav-link"}
            >
              About
            </NavLink>
          </li>
          <li>
            <NavLink 
              to="/features" 
              className={({ isActive }) => isActive ? "nav-active" : "nav-link"}
            >
              Features
            </NavLink>
          </li>
          <li>
            <NavLink 
              to="/demo" 
              className={({ isActive }) => isActive ? "nav-active" : "nav-link"}
            >
              Demo
            </NavLink>
          </li>
          <li>
            <NavLink 
              to="/login" 
              className={({ isActive }) => isActive ? "nav-active" : "nav-link"}
            >
              Login
            </NavLink>
          </li>
        </ul>
      </nav>

      {/* Your content - unchanged */}
      <div className="main-content">
        <div className="auth-card">
          <h1>Forgot your password?</h1>
          <p className="subtitle">
            Self-service password reset is not implemented. Contact an administrator
            to reset your password.
          </p>

          <form onSubmit={handleSubmit} className="auth-form">
            <label>EMAIL</label>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <button type="submit">
              SHOW RESET INSTRUCTIONS
            </button>
          </form>
          {submitted && (
            <p className="subtitle" role="status">
              Ask an IntruSight administrator to use the account-management reset
              workflow. No email was sent.
            </p>
          )}
        </div>
      </div>

      <footer className="footer">
        2026 Intrusion Detection Dashboard
      </footer>
    </div>
  );
};

export default ForgotPassword;
