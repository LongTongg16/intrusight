import React, { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Icon } from "../../components/ui";
import "../../styles/shell.css";
import "./admin.css";

const readUser = () => JSON.parse(localStorage.getItem("user") || "{}");

/* Grouped so the sidebar reads as an information architecture rather than a
   flat list: what you look at, what you configure, and who you are. */
const NAV_GROUPS = [
  {
    label: "Overview",
    items: [{ to: "/admin", label: "Dashboard", icon: "grid", end: true }],
  },
  {
    label: "Administration",
    items: [
      { to: "/admin/users", label: "User Management", icon: "users" },
      { to: "/admin/log-management", label: "Log Sources", icon: "plug" },
      { to: "/admin/maintenance", label: "Maintenance", icon: "database" },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/admin/settings", label: "Appearance", icon: "sliders" },
      { to: "/admin/profile", label: "Profile", icon: "user" },
    ],
  },
];

function AdminSidebar() {
  const navigate = useNavigate();
  const [user, setUser] = useState(readUser());

  useEffect(() => {
    const handleUserUpdated = () => setUser(readUser());
    window.addEventListener("user-updated", handleUserUpdated);
    window.addEventListener("storage", handleUserUpdated);

    return () => {
      window.removeEventListener("user-updated", handleUserUpdated);
      window.removeEventListener("storage", handleUserUpdated);
    };
  }, []);

  const adminName = user.full_name || "Administrator";
  const handleLogout = () => navigate("/logout");

  return (
    <div className="shell">
      <aside className="shell__side">
        <NavLink to="/admin" end className="shell__brand">
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
            <span className="shell__scope">Administration</span>
          </span>
        </NavLink>

        <nav className="shell__nav" aria-label="Administration">
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
                        end={item.end}
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
          <NavLink to="/admin/profile" className="shell__account">
            <span className="shell__avatar" aria-hidden="true">
              {adminName.charAt(0).toUpperCase()}
            </span>
            <span className="shell__who">
              <span className="shell__whoname">{adminName}</span>
              <span className="shell__whorole">Administrator</span>
            </span>
          </NavLink>

          <button className="shell__logout" onClick={handleLogout} type="button">
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
}

export default AdminSidebar;
