import React, { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Icon } from "../../components/ui";
import "../../styles/shell.css";
import "./analyst.css";

const readUser = () => JSON.parse(localStorage.getItem("user") || "{}");

/* Grouped by what an analyst is doing: working the queue, looking at the
   stored record set, then their own account. */
const NAV_GROUPS = [
  {
    label: "Triage",
    items: [
      { to: "/dashboard", label: "Overview", icon: "grid" },
      { to: "/alerts", label: "Alerts", icon: "alert" },
      { to: "/notifications", label: "Triage Queue", icon: "bell" },
    ],
  },
  {
    label: "Investigate",
    items: [
      { to: "/network-traffic", label: "Flow Records", icon: "flow" },
      { to: "/threat-map", label: "Threat Map", icon: "map" },
      { to: "/reports", label: "Reports", icon: "chart" },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/settings", label: "Appearance", icon: "sliders" },
      { to: "/analyst/profile", label: "Profile", icon: "user" },
    ],
  },
];

const AnalystSidebar = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(readUser);

  useEffect(() => {
    const handleUserUpdated = () => setUser(readUser());

    window.addEventListener("user-updated", handleUserUpdated);
    window.addEventListener("storage", handleUserUpdated);

    return () => {
      window.removeEventListener("user-updated", handleUserUpdated);
      window.removeEventListener("storage", handleUserUpdated);
    };
  }, []);

  const analystName = user.full_name || "Security Analyst";

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    // Trigger a storage event if other tabs are open
    window.dispatchEvent(new Event("storage"));
    navigate("/login");
  };

  return (
    <div className="shell">
      <aside className="shell__side">
        <NavLink to="/dashboard" className="shell__brand">
          <span className="shell__mark" aria-hidden="true">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2.1"
                 strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3 5 6v5.5c0 4.3 2.9 8.3 7 9.5 4.1-1.2 7-5.2 7-9.5V6z" />
              <path d="M9.5 12.2 11.4 14l3.3-3.6" />
            </svg>
          </span>
          <span className="shell__wordmark">
            <span className="shell__name">IntruSight</span>
            <span className="shell__scope">Analyst</span>
          </span>
        </NavLink>

        <nav className="shell__nav" aria-label="Analyst">
          {NAV_GROUPS.map((group) => (
            <div className="shell__group" key={group.label}>
              <p className="shell__grouplabel">{group.label}</p>
              <ul className="shell__list">
                {group.items.map((item) => {
                  const Glyph = Icon[item.icon];
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        className={({ isActive }) =>
                          `shell__link${isActive ? " is-active" : ""}`
                        }
                      >
                        <Glyph />
                        {item.label}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shell__foot">
          <NavLink to="/analyst/profile" className="shell__account">
            <span className="shell__avatar" aria-hidden="true">
              {analystName.charAt(0).toUpperCase()}
            </span>
            <span className="shell__who">
              <span className="shell__whoname">{analystName}</span>
              <span className="shell__whorole">Analyst</span>
            </span>
          </NavLink>

          <button className="shell__logout" onClick={handleLogout} type="button" title="Log out">
            <Icon.logout />
            Log out
          </button>
        </div>
      </aside>

      <main className="shell__main">
        <div className="shell__content">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AnalystSidebar;
