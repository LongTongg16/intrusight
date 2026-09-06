/**
 * Shown while a lazily-loaded route chunk is fetched.
 *
 * Deliberately minimal: a full skeleton here would flash a layout that is
 * immediately replaced by the real page's own loading state.
 */
function RouteFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-muted-c, #64748b)",
        fontSize: "0.875rem",
      }}
    >
      <span className="visually-hidden">Loading page…</span>
      <span aria-hidden="true" className="route-spinner" />
    </div>
  );
}

export default RouteFallback;
