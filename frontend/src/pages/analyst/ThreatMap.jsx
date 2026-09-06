import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './analyst.css';
import L from 'leaflet';

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  "http://localhost:8000";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const SEV_COLOR = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' };

// A truthiness check on latitude/longitude discards 0, which is a valid
// coordinate (the equator and the prime meridian), so plot-ability is decided
// on explicit presence plus finiteness instead. `Number(null)` and `Number('')`
// are both 0, so those are rejected before the finiteness test.
const isCoord = (value) =>
  value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

const hasCoords = (location) =>
  location != null && isCoord(location.latitude) && isCoord(location.longitude);
const SEV_RADIUS = { high: 10, medium: 7, low: 5 };

const MapFocuser = ({ focusAlert, markerRefs }) => {
  const map = useMap();

  useEffect(() => {
    if (!hasCoords(focusAlert?.dest_location)) return;
    const { latitude, longitude } = focusAlert.dest_location;
    map.flyTo([latitude, longitude], 8, { duration: 1.2 });

    const timer = setTimeout(() => {
      const ref = markerRefs.current[focusAlert.id];
      if (ref) ref.openPopup();
    }, 1400);

    return () => clearTimeout(timer);
  }, [focusAlert, map, markerRefs]);

  return null;
};

const ThreatMap = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const highlightId = searchParams.get('alertId');

  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [focusAlert, setFocusAlert] = useState(null);
  const [stats, setStats] = useState({ total: 0, mapped: 0, high: 0, medium: 0, low: 0 });

  const markerRefs = useRef({});

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/alerts?limit=500`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      const items = data.items || [];

      setStats({
        total: items.length,
        mapped: items.filter(a => hasCoords(a.dest_location)).length,
        high: items.filter(a => a.severity_label === 'high').length,
        medium: items.filter(a => a.severity_label === 'medium').length,
        low: items.filter(a => a.severity_label === 'low').length,
      });

      setAlerts(items);

      if (highlightId) {
        const target = items.find(a => a.id === highlightId);
        if (hasCoords(target?.dest_location)) {
          setFocusAlert(target);
        }
      }
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [highlightId]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const mappableAlerts = alerts.filter(a => {
    if (!hasCoords(a.dest_location)) return false;
    if (filter !== 'all' && a.severity_label !== filter) return false;
    return true;
  });

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div className="tm-head">
          <h1 className="ui-pagehead__title">Threat map</h1>
          <p className="ui-pagehead__sub">
            Approximate destination locations for alerts that resolved to
            coordinates. Positions come from an IP database lookup, not from
            the sensor, and are accurate to a region at best.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {focusAlert && (
            <button
              onClick={() => {
                setFocusAlert(null);
                navigate('/threat-map');
              }}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--accent-main)',
                borderRadius: 6,
                color: 'var(--accent-main)',
                padding: '4px 12px',
                cursor: 'pointer',
                fontSize: '0.78rem',
              }}
            >
              Clear focus
            </button>
          )}
          <div className="seg" role="group" aria-label="Filter by severity">
            {['all', 'high', 'medium', 'low'].map(s => (
              <button
                key={s}
                type="button"
                className="seg-btn"
                aria-pressed={filter === s}
                onClick={() => setFilter(s)}
                style={{ textTransform: 'capitalize' }}
              >
                {s === 'all' ? 'All' : s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {focusAlert && (
        <div style={{
          background: 'var(--bg-card)',
          border: `1px solid ${SEV_COLOR[focusAlert.severity_label] || 'var(--border-color)'}`,
          borderRadius: 8,
          padding: '10px 16px',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}>
          <span style={{ color: SEV_COLOR[focusAlert.severity_label], fontWeight: 700, fontSize: '0.82rem', textTransform: 'uppercase' }}>
            {focusAlert.severity_label}
          </span>
          <span style={{ color: 'var(--text-main)', fontSize: '0.85rem' }}>{focusAlert.signature}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            {focusAlert.src_ip} → {focusAlert.dest_ip}
          </span>
          {focusAlert.dest_location?.city && (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              📍 {focusAlert.dest_location.city}, {focusAlert.dest_location.country_name || focusAlert.dest_location.country}
            </span>
          )}
          <button
            onClick={() => navigate(`/alert/${focusAlert.id}`)}
            style={{
              marginLeft: 'auto',
              background: 'var(--accent-main)',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              padding: '4px 14px',
              cursor: 'pointer',
              fontSize: '0.78rem',
            }}
          >
            View Alert Details →
          </button>
        </div>
      )}

      <dl className="triage tm-stats">
        {[
          { label: 'Alerts loaded', value: stats.total, hint: 'In this snapshot' },
          { label: 'Geo-mapped',    value: stats.mapped, hint: 'Resolved to coordinates' },
          { label: 'High',          value: stats.high, hint: 'Of the loaded set', mod: 'high' },
          { label: 'Medium',        value: stats.medium, hint: 'Of the loaded set' },
          { label: 'Low',           value: stats.low, hint: 'Of the loaded set' },
        ].map(({ label, value, hint, mod }) => (
          <div key={label} className={`triage__cell${mod ? ` triage__cell--${mod}` : ''}`}>
            <dt>{label}</dt>
            <dd className="triage__num">{loading ? '—' : value}</dd>
            <dd className="triage__hint">{hint}</dd>
          </div>
        ))}
      </dl>

      <div className="tm-map">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--bg-card)', color: 'var(--text-muted)' }}>
            Loading alerts…
          </div>
        ) : (
          <MapContainer
            center={[20, 0]}
            zoom={2}
            style={{ width: '100%', height: '100%' }}
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapFocuser focusAlert={focusAlert} markerRefs={markerRefs} />

            {mappableAlerts.map((alert) => {
              const isFocused = focusAlert?.id === alert.id;
              return (
                <CircleMarker
                  key={alert.id}
                  ref={(el) => { if (el) markerRefs.current[alert.id] = el; }}
                  center={[alert.dest_location.latitude, alert.dest_location.longitude]}
                  radius={isFocused ? (SEV_RADIUS[alert.severity_label] || 6) + 4 : (SEV_RADIUS[alert.severity_label] || 6)}
                  pathOptions={{
                    color: isFocused ? '#fff' : SEV_COLOR[alert.severity_label] || '#94a3b8',
                    fillColor: SEV_COLOR[alert.severity_label] || '#94a3b8',
                    fillOpacity: isFocused ? 1 : 0.7,
                    weight: isFocused ? 2.5 : 1,
                  }}
                >
                  <Popup>
                    <div style={{ minWidth: 190, fontFamily: 'inherit' }}>
                      <div style={{ fontWeight: 700, marginBottom: 6, color: SEV_COLOR[alert.severity_label] }}>
                        {alert.severity_label?.toUpperCase()} — {alert.signature}
                      </div>
                      <div style={{ fontSize: '0.82rem', lineHeight: 1.7 }}>
                        <div><b>Src:</b> {alert.src_ip}</div>
                        <div><b>Dest:</b> {alert.dest_ip}</div>
                        {alert.dest_location?.city && <div><b>City:</b> {alert.dest_location.city}</div>}
                        {alert.dest_location?.country_name && <div><b>Country:</b> {alert.dest_location.country_name}</div>}
                        <div><b>Protocol:</b> {alert.proto}</div>
                        <div><b>Status:</b> {alert.status}</div>
                        {alert.timestamp && <div><b>Time:</b> {new Date(alert.timestamp).toLocaleString()}</div>}
                      </div>
                      <button
                        onClick={() => navigate(`/alert/${alert.id}`)}
                        style={{
                          marginTop: 8,
                          width: '100%',
                          background: SEV_COLOR[alert.severity_label] || '#3b82f6',
                          border: 'none',
                          borderRadius: 5,
                          color: '#fff',
                          padding: '5px 0',
                          cursor: 'pointer',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                        }}
                      >
                        View Alert Details →
                      </button>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        )}
      </div>

      <div style={{ display: 'flex', gap: '16px', marginTop: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Severity:</span>
        {Object.entries(SEV_COLOR).map(([sev, color]) => (
          <span key={sev} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill={color} fillOpacity={0.8} /></svg>
            {sev.charAt(0).toUpperCase() + sev.slice(1)}
          </span>
        ))}
        {stats.mapped === 0 && !loading && (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginLeft: 'auto' }}>
            No geo-mapped alerts yet — install the GeoLite2 database to see locations.
          </span>
        )}
      </div>

    </>
  );
};

export default ThreatMap;
