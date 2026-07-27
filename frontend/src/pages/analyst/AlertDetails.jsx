import React, { useState, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import "./AlertDetails.css";
import {
  FaArrowLeft,
  FaExclamationCircle,
  FaLink,
  FaCloudDownloadAlt,
  FaMapMarkerAlt,
} from "react-icons/fa";
import {
  getAlertById,
  getNotes,
  addNote,
  updateAlertStatus,
  refreshAlertLocation,
  getAlerts,
} from "../../services/api";

const AlertDetails = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();

  // State
  const [alert, setAlert] = useState(location.state?.alert || null);
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState("");
  const [status, setStatus] = useState(location.state?.alert?.status || "new");
  const [saving, setSaving] = useState(false);
  const [notePosting, setNotePosting] = useState(false);
  const [refreshingLocation, setRefreshingLocation] = useState(false);

  // Helper function to format ISO timestamp
  const formatTime = (isoString) => {
    if (!isoString) return "—";
    try {
      const date = new Date(isoString);
      return date.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return isoString;
    }
  };

  const [selectedProgress, setSelectedProgress] = useState("new");

  // Related alerts state
  const [showRelated, setShowRelated] = useState(false);
  const [relatedAlerts, setRelatedAlerts] = useState(null); // null = not loaded yet
  const [relatedLoading, setRelatedLoading] = useState(false);

  // 1. Effect to fetch Alert Metadata and refresh location on every load
  useEffect(() => {
    if (!id) return;

    const loadAlert = async () => {
      try {
        const data = await getAlertById(id);
        const alertItem = data.item;
        setAlert(alertItem);
        setStatus(alertItem?.status || "new");
        setSelectedProgress(alertItem?.status || "new");

        if (alertItem?.id) {
          const refreshData = await refreshAlertLocation(alertItem.id);
          setAlert(refreshData.item);
          setStatus(refreshData.item?.status || "new");
          setSelectedProgress(refreshData.item?.status || "new");
        }
      } catch (error) {
        console.error("Failed to load alert or refresh location:", error);
      }
    };

    loadAlert();
  }, [id]);

  useEffect(() => {
    let isMounted = true;

    if (id) {
      setNotes([]); 

      getNotes(id)
        .then((data) => {
          if (isMounted) {
            setNotes(data.items || []);
          }
        })
        .catch((err) => {
          console.error("Fetch error for notes:", err);
          if (isMounted) setNotes([]); 
        });
    }

    return () => { isMounted = false; };
  }, [id]);

  // Handlers
  const handlePostNote = async () => {
    if (!newNote.trim()) return;
    setNotePosting(true);
    try {
      const res = await addNote(id || alert?.id, newNote.trim());
      setNotes((prev) => [...prev, {
        id: prev.length,
        text: res.note.text,
        author: res.note.author || "Analyst",
        role: res.note.role || "Analyst",
        time: res.note.time
      }]);
      setNewNote("");
    } catch (err) {
      console.error("Could not post note:", err);
    } finally {
      setNotePosting(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    setSaving(true);
    try {
      await updateAlertStatus(id || alert?.id, newStatus);
      setStatus(newStatus);
      setSelectedProgress(newStatus);
    } catch {
      setStatus(newStatus);
      setSelectedProgress(newStatus);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = () => handleStatusChange(selectedProgress);
  const handleBack = () => navigate(-1);

  const handleLinkAlerts = async () => {
    if (showRelated) { setShowRelated(false); return; }
    if (relatedAlerts) { setShowRelated(true); return; } // already loaded
    setRelatedLoading(true);
    setShowRelated(true);
    try {
      const data = await getAlerts();
      const all = Array.isArray(data) ? data : (data.items ?? []);
      const others = all.filter(a => a.id !== (alert?.id || id));

      const bySrcIp   = others.filter(a => a.src_ip  && a.src_ip  === alert?.src_ip);
      const byDstIp   = others.filter(a => a.dest_ip && a.dest_ip === alert?.dest_ip);
      const bySig     = others.filter(a => a.signature && a.signature === alert?.signature && a.id !== (alert?.id || id));

      // De-duplicate across groups
      const seen = new Set();
      const dedup = (arr) => arr.filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true; });

      setRelatedAlerts({
        sameSrc: dedup(bySrcIp),
        sameDst: dedup(byDstIp),
        sameSig: dedup(bySig),
      });
    } catch {
      setRelatedAlerts({ sameSrc: [], sameDst: [], sameSig: [] });
    } finally {
      setRelatedLoading(false);
    }
  };

  const handleRefreshLocation = async () => {
    if (!alert?.id) return;
    setRefreshingLocation(true);
    try {
      const response = await refreshAlertLocation(alert.id);
      setAlert(response.item);
      setStatus(response.item?.status || "new");
      setSelectedProgress(response.item?.status || "new");
    } catch (error) {
      console.error("Failed to refresh location:", error);
    } finally {
      setRefreshingLocation(false);
    }
  };

  if (!alert) {
    return (
      <div className="alert-page no-alert" style={{ color: 'var(--text-main)', padding: '2rem' }}>
        <h2>No alert selected</h2>
        <button onClick={handleBack} className="modal-cancel" style={{ marginTop: '1rem' }}>Go back</button>
      </div>
    );
  }

  // Formatting helper variables
  const srcIp = alert.src_ip || alert.src || "—";
  const dstIp = alert.dest_ip || alert.dst || "—";
  const alertType = alert.signature || alert.type || "Unknown";
  const idsSource = alert.proto || alert.ids || "—";
  const time = formatTime(alert.timestamp) || (alert.time || "—");
  const destLocation = alert.dest_location || null;

  return (
    <div className="alert-details-container" style={{ padding: '2rem' }}>
      {/* Header */}
      <div className="header" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <FaArrowLeft className="back-icon" onClick={handleBack} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} />
        <h1 className="page-title">Alert Details</h1>
      </div>

      <div className="content-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
        {/* LEFT PANEL */}
        <div className="left-panel">
          <div className="alert-overview-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem' }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <h2 className="section-title" style={{ margin: 0, color: 'var(--text-main)' }}>Alert Overview</h2>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <button
                  onClick={handleRefreshLocation}
                  disabled={refreshingLocation}
                  style={{
                    padding: "0.4rem 0.8rem",
                    borderRadius: 6,
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-card)",
                    color: "var(--text-main)",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.3rem"
                  }}
                >
                  {refreshingLocation ? "⟳" : "🗺️"} {refreshingLocation ? "Refreshing..." : "Refresh Location"}
                </button>
                {["new", "investigating", "resolved"].map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    disabled={saving}
                    style={{
                      padding: "0.25rem 0.6rem", borderRadius: 20, border: "1px solid",
                      fontSize: "0.75rem", cursor: "pointer", fontWeight: 600, textTransform: "capitalize",
                      background: status === s ? "var(--accent-dim)" : "transparent",
                      color: status === s ? "var(--accent-main)" : "var(--text-muted)",
                      borderColor: status === s ? "var(--accent-main)" : "var(--border-color)",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="overview-grid" style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '10px' }}>
              <div className="label" style={{ color: 'var(--text-muted)' }}>Alert Type</div>
              <div className="value" style={{ color: 'var(--text-main)', textTransform: 'capitalize' }}>{alertType}</div>
              <div className="label" style={{ color: 'var(--text-muted)' }}>Status</div>
              <div className="value" style={{ textTransform: "capitalize", color: 'var(--text-main)' }}>{status}</div>
              <div className="label" style={{ color: 'var(--text-muted)' }}>IDS Source</div>
              <div className="value" style={{ color: 'var(--text-main)' }}>{idsSource}</div>
              <div className="label" style={{ color: 'var(--text-muted)' }}>Detection Time</div>
              <div className="value" style={{ color: 'var(--text-main)' }}>{time}</div>
              <div className="label" style={{ color: 'var(--text-muted)' }}>Source IP</div>
              <div className="value" style={{ color: 'var(--accent-main)', fontFamily: 'monospace' }}>{srcIp}</div>
              <div className="label" style={{ color: 'var(--text-muted)' }}>Destination IP</div>
              <div className="value" style={{ fontFamily: 'monospace', color: 'var(--text-main)' }}>{dstIp}</div>
              {destLocation && (
                <>
                  <div className="label" style={{ color: 'var(--text-muted)' }}>Dest. Location</div>
                  <div className="value" style={{ color: 'var(--text-main)' }}>
                    {destLocation.city ? `${destLocation.city}, ${destLocation.country_name || destLocation.country}` : destLocation.country_name || destLocation.country || "Unknown"}
                  </div>
                  <div className="label" style={{ color: 'var(--text-muted)' }}>Coordinates</div>
                  <div className="value" style={{ color: 'var(--text-main)', fontSize: '0.9rem' }}>
                    {destLocation.latitude?.toFixed(4) || "—"}, {destLocation.longitude?.toFixed(4) || "—"}
                  </div>
                  <div className="label" style={{ color: 'var(--text-muted)' }}>Timezone</div>
                  <div className="value" style={{ color: 'var(--text-main)' }}>{destLocation.timezone || "—"}</div>
                </>
              )}
            </div>

            <div className="description-box" style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--bg-sidebar)', borderRadius: '8px' }}>
              <div className="description-title" style={{ color: 'var(--text-main)', fontWeight: 'bold', marginBottom: '0.5rem' }}>Description</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5' }}>
                Detected {alertType} targeting the network endpoint. (Route: {srcIp} → {dstIp})
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="right-panel">
          <div className="card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '1.5rem', borderRadius: '12px', marginBottom: '1rem' }}>
            <h2 style={{ color: 'var(--text-main)', fontSize: '1.1rem', marginBottom: '1rem' }}>Quick Actions</h2>
            <div className="action-item" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', color: 'var(--text-main)' }}>
              <FaExclamationCircle style={{ color: '#ef4444' }} />
              <span>Create Incident</span>
            </div>
            <div
              className="action-item"
              onClick={handleLinkAlerts}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', color: 'var(--accent-main)', cursor: 'pointer', borderRadius: 6, transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <FaLink style={{ color: 'var(--accent-main)' }} />
              <span style={{ fontWeight: 500 }}>{showRelated ? 'Hide Related Alerts' : 'Link Alerts'}</span>
            </div>
            {destLocation?.latitude && destLocation?.longitude && (
              <div
                className="action-item"
                onClick={() => navigate(`/threat-map?alertId=${alert?.id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', color: 'var(--accent-main)', cursor: 'pointer', borderRadius: 6, transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <FaMapMarkerAlt style={{ color: 'var(--accent-main)' }} />
                <span style={{ fontWeight: 500 }}>View on Threat Map</span>
              </div>
            )}
          </div>

          <div className="card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '1.5rem', borderRadius: '12px' }}>
            <h2 style={{ color: 'var(--text-main)', fontSize: '1.1rem', marginBottom: '1rem' }}>Alert Status</h2>
            <select
              value={selectedProgress}
              onChange={(e) => setSelectedProgress(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-sidebar)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px', marginBottom: '1rem' }}
            >
              <option value="new">New</option>
              <option value="investigating">Investigating</option>
              <option value="resolved">Resolved</option>
            </select>
            <button onClick={handleUpdateStatus} style={{ width: '100%', padding: '0.6rem', background: 'var(--accent-main)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              Update Status
            </button>
          </div>
        </div>
      </div>

      {/* RELATED ALERTS PANEL */}
      {showRelated && (
        <div style={{ marginTop: '2rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem' }}>
          <h2 className="section-title" style={{ color: 'var(--text-main)', marginBottom: '1rem' }}>
            Related Alerts
            <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
              — grouped by shared attacker IP, victim IP, or attack signature
            </span>
          </h2>

          {relatedLoading ? (
            <div style={{ color: 'var(--text-muted)', padding: '1rem' }}>Loading related alerts…</div>
          ) : relatedAlerts && (relatedAlerts.sameSrc.length + relatedAlerts.sameDst.length + relatedAlerts.sameSig.length === 0) ? (
            <div style={{ color: 'var(--text-muted)', padding: '1rem', textAlign: 'center', border: '1px dashed var(--border-color)', borderRadius: 8 }}>
              No related alerts found — this appears to be an isolated incident.
            </div>
          ) : relatedAlerts && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {[
                { label: `Same Source IP (${alert?.src_ip})`, key: 'sameSrc', color: '#ef4444' },
                { label: `Same Destination IP (${alert?.dest_ip})`, key: 'sameDst', color: '#f59e0b' },
                { label: `Same Signature (${alert?.signature})`, key: 'sameSig', color: '#8b5cf6' },
              ].map(({ label, key, color }) => relatedAlerts[key].length > 0 && (
                <div key={key}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                    {label} — {relatedAlerts[key].length} alert{relatedAlerts[key].length !== 1 ? 's' : ''}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {relatedAlerts[key].map(a => (
                      <div
                        key={a.id}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.9rem', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderLeft: `3px solid ${color}`, borderRadius: 8 }}
                      >
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 999, border: `1px solid ${a.severity_label === 'high' ? '#ef4444' : a.severity_label === 'medium' ? '#f59e0b' : '#22c55e'}`, color: a.severity_label === 'high' ? '#ef4444' : a.severity_label === 'medium' ? '#f59e0b' : '#22c55e', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                          {a.severity_label || 'low'}
                        </span>
                        <span style={{ color: 'var(--text-main)', fontSize: '0.85rem', flex: 1, fontWeight: 500 }}>{a.signature || 'Unknown'}</span>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{a.src_ip} → {a.dest_ip}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatTime(a.timestamp)}</span>
                        <button
                          onClick={() => navigate(`/alert/${a.id}`)}
                          style={{ fontSize: '0.72rem', color: '#fff', background: 'var(--accent-main)', padding: '0.2rem 0.6rem', borderRadius: 5, whiteSpace: 'nowrap', fontWeight: 600, border: 'none', cursor: 'pointer' }}
                        >View →</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* INVESTIGATION NOTES */}
      <div className="investigation-notes" style={{ marginTop: '2rem' }}>
        <h2 className="section-title" style={{ color: 'var(--text-main)' }}>Investigation Notes</h2>
        
        <div className="notes-list" style={{ margin: '1rem 0' }}>
          {notes.length > 0 ? (
            notes.map(note => (
              <div key={note.id} className="note-item" style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', padding: '1rem', background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div className="note-avatar" style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent-dim)', color: 'var(--accent-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                  {(note.author || "A").substring(0, 2).toUpperCase()}
                </div>
                <div className="note-content-area" style={{ flex: 1 }}>
                  <div className="note-header" style={{ marginBottom: '0.3rem' }}>
                    <span className="note-author" style={{ fontWeight: 'bold', color: 'var(--text-main)', marginRight: '10px' }}>
                      {note.author} <span style={{ fontWeight: 'normal', fontSize: '0.85em', color: 'var(--text-muted)' }}>({note.role || 'Analyst'})</span>
                    </span>
                    <span className="note-time" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatTime(note.time)}</span>
                  </div>
                  <p className="note-content" style={{ color: 'var(--text-main)', fontSize: '0.9rem' }}>{note.text || note.content}</p>
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '8px' }}>
               No investigation notes recorded for alert {id}.
            </div>
          )}
        </div>

        <div className="add-note">
          <textarea
            className="note-input"
            placeholder="Write a note..."
            rows="3"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            style={{ width: '100%', padding: '1rem', background: 'var(--bg-card)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
          />
          <div className="add-note-footer" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
            <button
              onClick={handlePostNote}
              disabled={notePosting || !newNote.trim()}
              style={{ padding: '0.6rem 1.5rem', background: 'var(--accent-main)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', opacity: notePosting ? 0.5 : 1 }}
            >
              {notePosting ? "Posting…" : "Post Note"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AlertDetails;
