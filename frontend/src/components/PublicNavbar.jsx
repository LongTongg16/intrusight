import { NavLink } from "react-router-dom";
import "./PublicNavbar.css";

const links = [
  { label: "Home",     to: "/",         end: true },
  { label: "About",    to: "/about" },
  { label: "Features", to: "/features" },
  { label: "Demo",     to: "/demo" },
];

function PublicNavbar() {
  return (
    <header className="p-nav">
      <nav className="p-nav__inner" aria-label="Main">
        <NavLink to="/" className="p-nav__brand">
          <span className="p-nav__mark" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21s7-3.6 7-9V5.6L12 3 5 5.6V12c0 5.4 7 9 7 9z" />
              <path d="M8.6 12.2h2L12 15l1.6-5 1.2 2.2h1" />
            </svg>
          </span>
          IntruSight
        </NavLink>

        <ul className="p-nav__list">
          {links.map(({ label, to, end }) => (
            <li key={label}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `p-nav__link${isActive ? " is-active" : ""}`
                }
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="p-nav__actions">
          <span className="p-nav__divider" aria-hidden="true" />
          <NavLink to="/login" className="p-nav__signin">
            Sign in
          </NavLink>
        </div>
      </nav>
    </header>
  );
}

export default PublicNavbar;
