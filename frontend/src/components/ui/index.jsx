/**
 * Shared UI primitives.
 *
 * Deliberately small and boring: these exist because the same markup was
 * being retyped across analyst and admin pages with slightly different
 * classes each time, not to build a design system for its own sake.
 */
import "../../styles/data.css";
import "../../styles/ops.css";
import "./ui.css";

/* ── Page header ───────────────────────────────────────────── */
export function PageHeader({ title, subtitle, actions, id }) {
  return (
    <header className="ui-pagehead">
      <div>
        <h1 className="ui-pagehead__title" id={id}>{title}</h1>
        {subtitle && <p className="ui-pagehead__sub">{subtitle}</p>}
      </div>
      {actions && <div className="ui-pagehead__actions">{actions}</div>}
    </header>
  );
}

/* ── Section header ────────────────────────────────────────── */
export function SectionHeader({ title, hint, actions, id }) {
  return (
    <div className="ui-section">
      <div>
        <h2 className="ui-section__title" id={id}>{title}</h2>
        {hint && <p className="ui-section__hint">{hint}</p>}
      </div>
      {actions}
    </div>
  );
}

/* ── Button ────────────────────────────────────────────────── */
export function Button({
  variant = "secondary",
  size,
  type = "button",
  className = "",
  loading = false,
  children,
  ...rest
}) {
  const cls = [
    "ui-btn",
    `ui-btn--${variant}`,
    size === "sm" ? "ui-btn--sm" : "",
    loading ? "is-loading" : "",
    className,
  ].filter(Boolean).join(" ");
  return (
    <button
      type={type}
      className={cls}
      // A loading button stays in the tab order and keeps its label, so a
      // screen reader hears the state instead of the control vanishing.
      aria-busy={loading || undefined}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading && <span className="ui-btn__spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

/* ── Badges ────────────────────────────────────────────────── */
const SEVERITIES = ["high", "medium", "low"];

export function SeverityBadge({ severity }) {
  const key = String(severity || "").toLowerCase();
  const known = SEVERITIES.includes(key);
  return (
    <span className={`ui-sev${known ? ` ui-sev--${key}` : ""}`}>
      {known ? key : "unknown"}
    </span>
  );
}

const STATUSES = ["new", "investigating", "resolved"];

export function StatusBadge({ status }) {
  const key = String(status || "new").toLowerCase();
  const known = STATUSES.includes(key);
  return (
    <span className={`ui-status${known ? ` ui-status--${key}` : ""}`}>
      {key.replace(/_/g, " ")}
    </span>
  );
}

/* The four engines IntruSight normalizes. Each has a reserved hue and
   monogram (see ui.css) so a source is recognisable at a glance without
   reading the label. Anything else falls back to a neutral treatment. */
export const ENGINE_KEYS = ["suricata", "snort", "zeek", "kismet"];

export const engineKey = (engine) => {
  const k = String(engine || "").trim().toLowerCase();
  return ENGINE_KEYS.includes(k) ? k : "";
};

/** Renders the producing detection engine (`source_nids`). */
export function EngineBadge({ engine }) {
  if (!engine) return <span style={{ color: "var(--text-muted-c)" }}>—</span>;
  const key = engineKey(engine);
  return (
    <span className={`ui-engine${key ? ` ui-engine--${key}` : ""}`}>
      <span className="ui-engine__mark" aria-hidden="true">
        {String(engine).charAt(0).toUpperCase()}
      </span>
      {engine}
    </span>
  );
}

/** Standalone engine monogram for log-source rows and coverage tiles. */
export function EngineMark({ engine }) {
  const key = engineKey(engine);
  return (
    <span
      className={`ui-enginemark${key ? ` ui-enginemark--${key}` : ""}`}
      aria-hidden="true"
    >
      {String(engine || "?").charAt(0).toUpperCase()}
    </span>
  );
}

/* ── Heterogeneous record helpers ───────────────────────────────
   Not every engine reports the same kind of thing. Suricata and Snort assert
   that traffic matched a rule; Zeek describes what a connection was; Kismet
   reports what is present on the air. The backend records that distinction as
   `event_kind`, and these helpers let the UI honour it in one place instead of
   every view guessing. */

export const isObservation = (record) =>
  (record?.event_kind ?? "detection") === "observation";

/* Human labels for the observation vocabulary each engine contributes. */
export const OBSERVATION_LABELS = {
  connection: "Connection",
  dns_query: "DNS query",
  http_request: "HTTP request",
  tls_handshake: "TLS handshake",
  wireless_ap: "Access point",
  wireless_client: "Wireless client",
};

/* Endpoint display.

   Kismet identifies endpoints by 802.11 hardware address, so its records carry
   `source_asset`/`destination_asset` with `asset_kind: "mac"` and no IP at all.
   Reading `src_ip` alone would render those rows as "—". */
export const sourceOf = (record) => record?.source_asset || record?.src_ip || null;
export const destOf = (record) => record?.destination_asset || record?.dest_ip || null;
export const isMacRecord = (record) => record?.asset_kind === "mac";

/** Small badge distinguishing context from a detection. */
export function KindBadge({ record }) {
  if (!isObservation(record)) return null;
  const label = OBSERVATION_LABELS[record?.observation_type] || "Observation";
  return <span className="ui-kind" title="Context reported by the engine, not a rule match">{label}</span>;
}

/* Relative age of a real timestamp. Derived from the record's own
   `timestamp`, so it states when an engine reported the event — it is not a
   live counter and nothing re-renders it on a timer. */
export function relTime(iso) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const secs = Math.round((Date.now() - t) / 1000);
  if (secs < 0) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString([], { day: "2-digit", month: "short" });
}

/* ── Icons (inline, no icon-font dependency) ───────────────── */
const iconProps = {
  width: 18, height: 18, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 1.7,
  strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true,
};

export const Icon = {
  inbox:  () => <svg {...iconProps}><path d="M4 13h4l2 3h4l2-3h4" /><path d="M5 5h14l2 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z" /></svg>,
  search: () => <svg {...iconProps} width="15" height="15"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>,
  alert:  () => <svg {...iconProps}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>,
  plug:   () => <svg {...iconProps}><path d="M9 2v6M15 2v6" /><path d="M6 8h12v3a6 6 0 0 1-12 0z" /><path d="M12 17v5" /></svg>,
  refresh:() => <svg {...iconProps} width="15" height="15"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>,
  download:() => <svg {...iconProps} width="15" height="15"><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M4 20h16" /></svg>,
  close:  () => <svg {...iconProps} width="15" height="15" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>,
  info:   () => <svg {...iconProps} width="15" height="15"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>,
  eye:    () => <svg {...iconProps} width="15" height="15"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="2.5" /></svg>,
  map:    () => <svg {...iconProps} width="15" height="15"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></svg>,

  /* Navigation. Same 24px grid and stroke weight as the set above so the
     sidebar does not read as a second icon family. */
  grid:   () => <svg {...iconProps}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>,
  users:  () => <svg {...iconProps}><circle cx="9" cy="8" r="3.2" /><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0" /><path d="M16.5 5.3a3.2 3.2 0 0 1 0 5.9" /><path d="M18 14.4a6.2 6.2 0 0 1 3.2 5.6" /></svg>,
  database:() => <svg {...iconProps}><ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" /><path d="M4.5 5.5v6c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-6" /><path d="M4.5 11.5v6c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-6" /></svg>,
  sliders:() => <svg {...iconProps}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>,
  user:   () => <svg {...iconProps}><circle cx="12" cy="8" r="3.4" /><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" /></svg>,
  flow:   () => <svg {...iconProps}><path d="M3 7h6l3 5h9" /><path d="M3 17h6l3-5" /><circle cx="20" cy="7" r="1.6" /><circle cx="20" cy="17" r="1.6" /></svg>,
  chart:  () => <svg {...iconProps}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
  bell:   () => <svg {...iconProps}><path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6z" /><path d="M13.7 20a2 2 0 0 1-3.4 0" /></svg>,
  shield: () => <svg {...iconProps}><path d="M12 3 5 6v5.5c0 4.3 2.9 8.3 7 9.5 4.1-1.2 7-5.2 7-9.5V6z" /></svg>,
  logout: () => <svg {...iconProps} width="15" height="15"><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" /><path d="M15 8l4 4-4 4M19 12H9" /></svg>,
  chevron:() => <svg {...iconProps} width="14" height="14"><path d="M9 6l6 6-6 6" /></svg>,
  userplus:() => <svg {...iconProps} width="15" height="15"><circle cx="9" cy="8" r="3.2" /><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0" /><path d="M18.5 8v6M21.5 11h-6" /></svg>,
  dots:   () => <svg {...iconProps} width="16" height="16" strokeWidth="2.4"><circle cx="5" cy="12" r="0.6" /><circle cx="12" cy="12" r="0.6" /><circle cx="19" cy="12" r="0.6" /></svg>,

  /* Maintenance + operational actions. */
  archive: () => <svg {...iconProps} width="15" height="15"><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></svg>,
  restore: () => <svg {...iconProps} width="15" height="15"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>,
  trash:   () => <svg {...iconProps} width="15" height="15"><path d="M4 7h16" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" /><path d="M10 11v6M14 11v6" /></svg>,
  check:   () => <svg {...iconProps} width="15" height="15" strokeWidth="2.2"><path d="M4.5 12.5 9.5 17.5 19.5 7" /></svg>,
  clock:   () => <svg {...iconProps} width="15" height="15"><circle cx="12" cy="12" r="9" /><path d="M12 7v5.4l3.4 2" /></svg>,
  warn:    () => <svg {...iconProps} width="15" height="15"><path d="M12 9v4.5M12 17h.01" /><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>,
};

/* ── States ────────────────────────────────────────────────── */
export function EmptyState({ icon = "inbox", title, children, actions }) {
  const Glyph = Icon[icon] || Icon.inbox;
  return (
    <div className="ui-state">
      <span className="ui-state__icon"><Glyph /></span>
      <h2 className="ui-state__title">{title}</h2>
      {children && <p className="ui-state__text">{children}</p>}
      {actions && <div className="ui-state__actions">{actions}</div>}
    </div>
  );
}

export function ErrorState({ title = "Could not load data", children, onRetry }) {
  return (
    <div className="ui-state">
      <span className="ui-state__icon" style={{ color: "var(--feedback-error)" }}>
        <Icon.alert />
      </span>
      <h2 className="ui-state__title">{title}</h2>
      {children && <p className="ui-state__text">{children}</p>}
      {onRetry && (
        <div className="ui-state__actions">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <Icon.refresh /> Retry
          </Button>
        </div>
      )}
    </div>
  );
}

/** Skeleton rows — communicates the shape of what is loading. */
export function LoadingRows({ rows = 5, label = "Loading" }) {
  return (
    <div className="ui-skeleton-rows" role="status" aria-live="polite">
      <span className="visually-hidden">{label}…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden="true">
          <span className="ui-skeleton" style={{ width: "60%" }} />
          <span className="ui-skeleton" style={{ width: `${55 + ((i * 13) % 35)}%` }} />
          <span className="ui-skeleton" style={{ width: "70%" }} />
          <span className="ui-skeleton" style={{ width: "80%" }} />
          <span className="ui-skeleton" style={{ width: "50%" }} />
        </div>
      ))}
    </div>
  );
}

/* ── Notice ────────────────────────────────────────────────── */
export function Notice({ tone = "info", children, className = "" }) {
  return (
    <div className={`ui-notice ui-notice--${tone} ${className}`.trim()}>
      <Icon.info />
      <span>{children}</span>
    </div>
  );
}

/* ── Filter primitives ─────────────────────────────────────── */
export function FilterBar({ children, count }) {
  return (
    <div className="ui-filters">
      {children}
      {count != null && <span className="ui-filters__count">{count}</span>}
    </div>
  );
}

export function SelectFilter({ label, value, onChange, options, id }) {
  const selectId = id || `filter-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="ui-filters__field">
      <label className="ui-filters__label" htmlFor={selectId}>{label}</label>
      <select
        id={selectId}
        className="ui-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function SearchFilter({ value, onChange, placeholder, label = "Search" }) {
  return (
    <div className="ui-search">
      <Icon.search />
      <label className="visually-hidden" htmlFor="ui-search-input">{label}</label>
      <input
        id="ui-search-input"
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
