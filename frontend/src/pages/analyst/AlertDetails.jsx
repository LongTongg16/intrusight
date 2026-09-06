import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Button, Notice, Icon, SeverityBadge, StatusBadge, EngineBadge,
  SectionHeader, EmptyState, LoadingRows,
  isObservation, OBSERVATION_LABELS, KindBadge, sourceOf, destOf,
} from "../../components/ui";
import {
  getAlertById, getNotes, addNote, updateAlertStatus,
  refreshAlertLocation, getAlerts,
} from "../../services/api";
import "./analyst.css";

const STATUSES = ["new", "investigating", "resolved"];

const formatTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
};

const AlertDetails = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();

  const [alert, setAlert] = useState(location.state?.alert || null);
  const [loading, setLoading] = useState(!location.state?.alert);
  const [loadError, setLoadError] = useState("");

  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState("");
  const [notePosting, setNotePosting] = useState(false);
  const [noteError, setNoteError] = useState("");

  const [status, setStatus] = useState(location.state?.alert?.status || "new");
  const [saving, setSaving] = useState(false);
  const [statusError, setStatusError] = useState("");

  const [refreshingLocation, setRefreshingLocation] = useState(false);

  const [showRelated, setShowRelated] = useState(false);
  const [relatedAlerts, setRelatedAlerts] = useState(null);
  const [relatedLoading, setRelatedLoading] = useState(false);

  /* ── Load the alert ───────────────────────────────────────── */
  /* Opening an alert used to fire POST /api/alerts/{id}/refresh-location,
     which writes src_location and dest_location back to the document. Merely
     viewing a record should not mutate it, and the page renders from the
     locations already resolved at ingest time, so the write now happens only
     when an analyst presses "Refresh location". */
  useEffect(() => {
    if (!id) return;
    let alive = true;

    (async () => {
      try {
        setLoadError("");
        const data = await getAlertById(id);
        if (!alive) return;
        setAlert(data.item);
        setStatus(data.item?.status || "new");
      } catch {
        if (alive) setLoadError("Could not load this alert from the API.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setNotes([]);
    getNotes(id)
      .then((data) => { if (alive) setNotes(data.items || []); })
      .catch(() => { if (alive) setNotes([]); });
    return () => { alive = false; };
  }, [id]);

  /* ── Handlers ─────────────────────────────────────────────── */
  const handlePostNote = async () => {
    if (!newNote.trim()) return;
    setNotePosting(true);
    setNoteError("");
    try {
      const res = await addNote(id || alert?.id, newNote.trim());
      setNotes((prev) => [...prev, {
        id: res.note?.id ?? prev.length,
        text: res.note.text,
        author: res.note.author || "Analyst",
        role: res.note.role || "Analyst",
        time: res.note.time,
      }]);
      setNewNote("");
    } catch {
      // Previously silent. A note the server rejected must not appear saved.
      setNoteError("Note was not saved — the API rejected the request.");
    } finally {
      setNotePosting(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (newStatus === status) return;
    setSaving(true);
    setStatusError("");
    const previous = status;
    try {
      await updateAlertStatus(id || alert?.id, newStatus);
      setStatus(newStatus);
    } catch {
      // Previously the UI adopted the new status even on failure, so it
      // displayed a triage state the server had never accepted.
      setStatus(previous);
      setStatusError("Status was not changed — the API rejected the update.");
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshLocation = async () => {
    if (!alert?.id) return;
    setRefreshingLocation(true);
    try {
      const res = await refreshAlertLocation(alert.id);
      setAlert(res.item);
      setStatus(res.item?.status || "new");
    } catch {
      /* location is supplementary — leave the previous value in place */
    } finally {
      setRefreshingLocation(false);
    }
  };

  const handleLinkAlerts = useCallback(async () => {
    if (showRelated) { setShowRelated(false); return; }
    if (relatedAlerts) { setShowRelated(true); return; }
    setRelatedLoading(true);
    setShowRelated(true);
    try {
      const data = await getAlerts();
      const all = Array.isArray(data) ? data : (data.items ?? []);
      const others = all.filter((a) => a.id !== (alert?.id || id));
      const seen = new Set();
      const dedup = (arr) => arr.filter((a) => {
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
      });
      setRelatedAlerts({
        sameSrc: dedup(others.filter((a) => a.src_ip && a.src_ip === alert?.src_ip)),
        sameDst: dedup(others.filter((a) => a.dest_ip && a.dest_ip === alert?.dest_ip)),
        sameSig: dedup(others.filter((a) => a.signature && a.signature === alert?.signature)),
      });
    } catch {
      setRelatedAlerts({ sameSrc: [], sameDst: [], sameSig: [] });
    } finally {
      setRelatedLoading(false);
    }
  }, [showRelated, relatedAlerts, alert, id]);

  /* ── States ───────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="ad">
        <div className="ui-panel"><LoadingRows rows={4} label="Loading alert" /></div>
      </div>
    );
  }

  if (!alert) {
    return (
      <div className="ad">
        <EmptyState
          icon="alert"
          title="Alert not available"
          actions={<Button onClick={() => navigate("/alerts")}>Back to alerts</Button>}
        >
          {loadError || "This alert could not be found. It may have been purged."}
        </EmptyState>
      </div>
    );
  }

  // Engine-native fields, flattened for display. `provenance` is surfaced
  // separately as a banner, so it is not repeated in the detail grid.
  const engineDetail = Object.entries(alert.engine_context || {})
    .filter(([key, value]) =>
      key !== "provenance" && value !== null && value !== undefined && value !== "")
    .map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : String(value)]);

  const provenance = (alert.engine_context || {}).provenance;

  const dest = alert.dest_location || null;
  const src = alert.src_location || null;
  const relatedTotal = relatedAlerts
    ? relatedAlerts.sameSrc.length + relatedAlerts.sameDst.length + relatedAlerts.sameSig.length
    : 0;

  return (
    <div className="ad">
      {/* ── Investigation header ─────────────────────────────── */}
      <div className="ad__bar">
        <button type="button" className="ad__back" onClick={() => navigate(-1)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </button>
        <span className="ad__crumb">Alert {alert.id}</span>
      </div>

      <header className="ad__head">
        <div className="ad__headline">
          {isObservation(alert)
            ? <KindBadge record={alert} />
            : <SeverityBadge severity={alert.severity_label} />}
          <h1 className="ad__title">{alert.signature || "Unnamed event"}</h1>
        </div>
        <p className="ad__facts">
          <EngineBadge engine={alert.source_nids} />
          <StatusBadge status={status} />
          <span className="ad__fact">{formatTime(alert.timestamp)}</span>
          {alert.category && <span className="ad__fact">{alert.category}</span>}
          {alert.sid && <span className="ad__fact ui-mono">SID {alert.sid}</span>}
        </p>
      </header>

      {statusError && <Notice tone="error" className="ad__notice">{statusError}</Notice>}

      <div className="ad__grid">
        {/* ── Main column ─────────────────────────────────────── */}
        <div className="ad__main">
          {/* Connection */}
          {provenance === "replayed-fixture" && (
            <Notice tone="info">
              Demonstration record. This is recorded engine output replayed
              through the normal ingestion path — not live sensor data.
            </Notice>
          )}

          <section className="ui-panel" aria-labelledby="ad-conn">
            <div className="ui-panel__body">
              <SectionHeader
                id="ad-conn"
                title={isObservation(alert) ? "Observed endpoints" : "Connection"}
                hint={
                  alert.asset_kind === "mac"
                    ? "802.11 hardware addresses as Kismet reported them. Kismet observes the radio layer and reports no IP addresses."
                    : "Addresses and ports exactly as the engine reported them."
                }
              />
              <div className="ad__flow">
                <div className="ad__endpoint">
                  <span className="ad__endpoint-label">Source</span>
                  <span className="ad__endpoint-ip ui-mono">{sourceOf(alert) || "—"}</span>
                  {alert.src_port ? <span className="ad__endpoint-port ui-mono">port {alert.src_port}</span> : null}
                  {src?.country && (
                    <span className="ad__endpoint-geo">{src.city ? `${src.city}, ` : ""}{src.country_name || src.country}</span>
                  )}
                </div>

                <div className="ad__arrow" aria-hidden="true">
                  <span className="ad__arrow-proto">{alert.proto || "—"}</span>
                  <svg width="100%" height="10" viewBox="0 0 120 10" preserveAspectRatio="none" fill="none">
                    <line x1="0" y1="5" x2="110" y2="5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 3" />
                    <path d="M110 1.5L118 5l-8 3.5z" fill="currentColor" />
                  </svg>
                </div>

                <div className="ad__endpoint ad__endpoint--dest">
                  <span className="ad__endpoint-label">Destination</span>
                  <span className="ad__endpoint-ip ui-mono">{destOf(alert) || "—"}</span>
                  {alert.dest_port ? <span className="ad__endpoint-port ui-mono">port {alert.dest_port}</span> : null}
                  {dest?.country && (
                    <span className="ad__endpoint-geo">{dest.city ? `${dest.city}, ` : ""}{dest.country_name || dest.country}</span>
                  )}
                </div>
              </div>

              {dest?.latitude != null && dest?.longitude != null && (
                <div className="ad__geo">
                  <span className="ad__geo-coords ui-mono">
                    {Number(dest.latitude).toFixed(4)}, {Number(dest.longitude).toFixed(4)}
                  </span>
                  <span className="ad__geo-note">
                    Approximate, from an IP lookup — not a physical location.
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate(`/threat-map?alertId=${alert.id}`)}
                  >
                    <Icon.map /> View on map
                  </Button>
                </div>
              )}
            </div>
          </section>

          {/* Related alerts. Collapsed to a section band until asked for —
              a whole panel holding one button wasted a block of the page. */}
          <section className="ops ad__related-section" aria-labelledby="ad-related">
            <div className="ops__head">
              <h2 className="ops__title" id="ad-related">Related alerts</h2>
              <span className="ops__meta">
                <Button size="sm" variant="ghost" onClick={handleLinkAlerts}>
                  {showRelated ? "Hide" : "Find related"} <Icon.chevron />
                </Button>
              </span>
            </div>
            <div className={showRelated ? "ad__relatedbody" : "ad__relatedbody is-collapsed"}>
              {showRelated && (
                relatedLoading ? (
                  <LoadingRows rows={3} label="Finding related alerts" />
                ) : relatedTotal === 0 ? (
                  <p className="ad__muted">
                    No other stored alert shares this source, destination or signature.
                  </p>
                ) : (
                  <div className="ad__related">
                    {[
                      { key: "sameSrc", label: `Same source · ${sourceOf(alert)}` },
                      { key: "sameDst", label: `Same destination · ${destOf(alert)}` },
                      { key: "sameSig", label: "Same signature" },
                    ].map(({ key, label }) =>
                      relatedAlerts[key].length > 0 && (
                        <div key={key}>
                          <p className="ad__related-label">
                            {label}
                            <span className="ad__related-count">{relatedAlerts[key].length}</span>
                          </p>
                          <ul className="ad__related-list">
                            {relatedAlerts[key].map((a) => (
                              <li key={a.id}>
                                <button
                                  type="button"
                                  className="ad__related-row"
                                  onClick={() => navigate(`/alert/${a.id}`)}
                                >
                                  <SeverityBadge severity={a.severity_label} />
                                  <span className="ad__related-sig">{a.signature || "Unnamed event"}</span>
                                  <span className="ad__related-net ui-mono">
                                    {a.src_ip} → {a.dest_ip}
                                  </span>
                                  <span className="ad__related-time">{formatTime(a.timestamp)}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    )}
                  </div>
                )
              )}
            </div>
          </section>

          {/* Notes */}
          <section className="ui-panel" aria-labelledby="ad-notes">
            <div className="ui-panel__body">
              <SectionHeader
                id="ad-notes"
                title="Investigation notes"
                hint="Stored with the alert so the reasoning stays next to the evidence."
              />

              {noteError && <Notice tone="error" className="ad__notice">{noteError}</Notice>}

              {notes.length > 0 ? (
                <ol className="ad__notes">
                  {notes.map((note) => (
                    <li key={note.id} className="ad__note">
                      <span className="ad__note-avatar" aria-hidden="true">
                        {(note.author || "A").substring(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <p className="ad__note-meta">
                          <span className="ad__note-author">{note.author}</span>
                          {note.role && <span className="ad__note-role">{note.role}</span>}
                          <span className="ad__note-time">{formatTime(note.time)}</span>
                        </p>
                        <p className="ad__note-text">{note.text || note.content}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="ad__muted">No notes recorded yet.</p>
              )}

              <div className="ad__compose">
                <label className="visually-hidden" htmlFor="ad-note-input">Add an investigation note</label>
                <textarea
                  id="ad-note-input"
                  className="ad__textarea"
                  placeholder="What did you check, and what did you conclude?"
                  rows={3}
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                />
                <div className="ad__compose-foot">
                  <Button
                    variant="primary"
                    onClick={handlePostNote}
                    disabled={notePosting || !newNote.trim()}
                  >
                    {notePosting ? "Saving…" : "Add note"}
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ── Side rail ───────────────────────────────────────── */}
        <aside className="ad__rail">
          <section className="ui-panel" aria-labelledby="ad-triage">
            <div className="ui-panel__body">
              <SectionHeader id="ad-triage" title="Triage" />
              <div className="ad__statuses" role="group" aria-label="Alert status">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`ad__status${status === s ? " is-active" : ""}`}
                    aria-pressed={status === s}
                    disabled={saving}
                    onClick={() => handleStatusChange(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="ad__rail-hint">
                {saving ? "Saving…" : "Changes save immediately."}
              </p>
            </div>
          </section>

          <section className="ui-panel" aria-labelledby="ad-record">
            <div className="ui-panel__body">
              <SectionHeader id="ad-record" title="Record" />
              <dl className="ui-meta ad__meta">
                <div>
                  <dt>Alert ID</dt>
                  <dd className="ui-mono">{alert.id}</dd>
                </div>
                <div>
                  <dt>Engine</dt>
                  <dd>{alert.source_nids || "—"}</dd>
                </div>
                <div>
                  <dt>Protocol</dt>
                  <dd>{alert.proto || "—"}</dd>
                </div>
                <div>
                  <dt>Category</dt>
                  <dd>{alert.category || "—"}</dd>
                </div>
                <div>
                  <dt>Record</dt>
                  <dd>
                    {isObservation(alert)
                      ? (OBSERVATION_LABELS[alert.observation_type] || "Observation")
                      : "Detection"}
                  </dd>
                </div>
                {/* Only a rule match has a signature id. Zeek observations and
                    Kismet sightings do not, and the field is omitted rather
                    than filled with a placeholder. */}
                {alert.sid ? (
                  <div>
                    <dt>Signature ID</dt>
                    <dd className="ui-mono">{alert.sid}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Ingested</dt>
                  <dd>{formatTime(alert.created_at)}</dd>
                </div>
              </dl>

              {/* Engine-native detail. This is what each engine contributes
                  beyond the shared columns — Zeek's connection state and
                  resolved name, Kismet's SSID/BSSID/channel/encryption,
                  Suricata's app protocol. Kept in the detail view so the queue
                  stays scannable. */}
              {engineDetail.length > 0 && (
                <>
                  <p className="ad__ctx-head">
                    {alert.source_nids || "Engine"} detail
                  </p>
                  <dl className="ui-meta ad__meta ad__ctx">
                    {engineDetail.map(([key, value]) => (
                      <div key={key}>
                        <dt>{key.replace(/_/g, " ")}</dt>
                        <dd className="ui-mono">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}

              <div className="ad__rail-actions">
                <Button
                  size="sm"
                  onClick={handleRefreshLocation}
                  disabled={refreshingLocation}
                >
                  <Icon.refresh />
                  {refreshingLocation ? "Refreshing…" : "Refresh location"}
                </Button>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default AlertDetails;
