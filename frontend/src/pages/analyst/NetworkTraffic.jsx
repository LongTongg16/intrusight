import { useMemo, useState, useEffect } from "react";
import { getTrafficLogs } from "../../services/api";
import './analyst.css';

function NetworkTraffic() {
  const [ip, setIp] = useState("");
  const [port, setPort] = useState("");
  const [protocol, setProtocol] = useState("ALL");
  const [, setTimeRange] = useState("24H");
  const [idsSource, setIdsSource] = useState("ALL");
  const [flowType, setFlowType] = useState("ALL"); // ALL | TRIGGERED | CLEAN
  const [selectedIp, setSelectedIp] = useState(null);
  const [viewingRow, setViewingRow] = useState(null);

  const [liveRows, setLiveRows] = useState([]);
  const [backendOnline, setBackendOnline] = useState(false);

  useEffect(() => {
    getTrafficLogs()
      .then((data) => {
        if (data.items && data.items.length > 0) {
          setLiveRows(data.items);
          setBackendOnline(true);
        }
      })
      .catch(() => {});
  }, []);

  const rows = useMemo(() => {
    if (backendOnline && liveRows.length > 0) return liveRows;
    // Fallback demo data — shows both triggered alerts and clean flows
    const now = Date.now();
    const ago = (min) => new Date(now - min * 60000).toISOString();
    return [
      { ts: ago(2),  src: "192.168.1.45",  dst: "185.220.101.45", sport: 54231, dport: 443,  proto: "TCP",  bytes: 4821, ids: "Suricata", flags: "PSH, ACK", duration: "1.23s", packets: 18, triggered: true,  signature: "ET SCAN Port Sweep",          severity: "high"   },
      { ts: ago(5),  src: "192.168.1.10",  dst: "8.8.8.8",        sport: 54231, dport: 53,   proto: "UDP",  bytes: 72,   ids: "Zeek",     flags: "—",        duration: "0.01s", packets: 1,  triggered: false, signature: null,                           severity: null     },
      { ts: ago(8),  src: "192.168.1.22",  dst: "142.250.80.46",  sport: 52341, dport: 443,  proto: "TCP",  bytes: 3100, ids: "Suricata", flags: "SYN, ACK", duration: "0.88s", packets: 9,  triggered: false, signature: null,                           severity: null     },
      { ts: ago(12), src: "10.0.0.55",     dst: "192.168.1.100",  sport: 6667,  dport: 8080, proto: "TCP",  bytes: 9200, ids: "Snort",    flags: "PSH, ACK", duration: "3.40s", packets: 42, triggered: true,  signature: "ET TROJAN IRC Botnet Command", severity: "high"   },
      { ts: ago(18), src: "192.168.1.33",  dst: "140.82.114.4",   sport: 58901, dport: 443,  proto: "TCP",  bytes: 1870, ids: "Suricata", flags: "PSH, ACK", duration: "0.55s", packets: 7,  triggered: false, signature: null,                           severity: null     },
      { ts: ago(25), src: "192.168.1.100", dst: "192.168.1.200",  sport: 55678, dport: 5432, proto: "TCP",  bytes: 8900, ids: "Zeek",     flags: "PSH, ACK", duration: "0.08s", packets: 42, triggered: false, signature: null,                           severity: null     },
      { ts: ago(31), src: "192.168.1.52",  dst: "203.0.113.42",   sport: 44321, dport: 4444, proto: "TCP",  bytes: 512,  ids: "Snort",    flags: "SYN",      duration: "0.02s", packets: 2,  triggered: true,  signature: "ET MALWARE Reverse Shell",    severity: "high"   },
      { ts: ago(40), src: "192.168.1.1",   dst: "216.239.35.0",   sport: 123,   dport: 123,  proto: "UDP",  bytes: 48,   ids: "Zeek",     flags: "—",        duration: "0.03s", packets: 1,  triggered: false, signature: null,                           severity: null     },
      { ts: ago(47), src: "192.168.1.22",  dst: "52.42.196.12",   sport: 56123, dport: 443,  proto: "TCP",  bytes: 2800, ids: "Suricata", flags: "PSH, ACK", duration: "0.72s", packets: 14, triggered: false, signature: null,                           severity: null     },
      { ts: ago(55), src: "192.168.1.77",  dst: "10.0.0.1",       sport: 12345, dport: 23,   proto: "TCP",  bytes: 320,  ids: "Snort",    flags: "SYN, ACK", duration: "0.11s", packets: 3,  triggered: true,  signature: "ET SCAN Telnet Brute Force",  severity: "medium" },
    ];
  }, [backendOnline, liveRows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const ipMatch   = ip.trim() === "" || (r.src || "").includes(ip.trim()) || (r.dst || "").includes(ip.trim());
      const portMatch = port.trim() === "" || String(r.sport) === port.trim() || String(r.dport) === port.trim();
      const protoMatch = protocol === "ALL" || r.proto === protocol;
      const idsMatch  = idsSource === "ALL" || r.ids === idsSource;
      const typeMatch = flowType === "ALL" || (flowType === "TRIGGERED" ? r.triggered : !r.triggered);
      return ipMatch && portMatch && protoMatch && idsMatch && typeMatch;
    });
  }, [rows, ip, port, protocol, idsSource, flowType]);

  const fmtTs = (ts) => {
    if (!ts) return "—";
    try { return new Date(ts).toLocaleString([], { dateStyle: "short", timeStyle: "medium" }); }
    catch { return ts; }
  };

  const onReset = () => {
    setIp(""); setPort(""); setProtocol("ALL"); setTimeRange("24H"); setIdsSource("ALL"); setFlowType("ALL"); setSelectedIp(null);
  };

  const openIpDetails = (ipAddr) => {
    setSelectedIp({
      ip: ipAddr,
      country: "United States",
      asn: "AS16509",
      volume: "34.5 GB",
      relatedAlerts: [
        { type: "SQL Injection", when: "1 week ago", source: "Suricata" },
        { type: "Command Injection", when: "3 weeks ago", source: "Suricata" },
      ],
    });
  };

  /* ── Export CSV ───────────────────────────────────────────────────────────── */
  const exportCSV = () => {
    const headers = ["Timestamp", "Source IP", "Destination IP", "Src Port", "Dst Port", "Protocol", "Bytes", "Packets", "Duration", "Flags", "IDS Source"];
    const csvRows = filtered.map((r) => [
      r.ts,
      r.src,
      r.dst,
      r.sport,
      r.dport,
      r.proto,
      r.bytes,
      r.packets ?? "",
      r.duration ?? "",
      r.flags ?? "",
      r.ids,
    ]);

    const csvContent = [
      headers.join(","),
      ...csvRows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `traffic_logs_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div style={styles.main}>
        <h1 className="page-title">Network Traffic Logs</h1>

        {/* Filters Card */}
        <div style={styles.card}>
          <div style={styles.filtersRow}>
            <div style={styles.field}>
              <label style={styles.label}>IP Address</label>
              <input
                style={styles.input}
                placeholder="Source or destination IP"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Port</label>
              <input
                style={styles.input}
                placeholder="1 - 65535"
                value={port}
                onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Protocol</label>
              <select style={styles.select} value={protocol} onChange={(e) => setProtocol(e.target.value)}>
                <option value="ALL">All Protocols</option>
                <option value="TCP">TCP</option>
                <option value="UDP">UDP</option>
                <option value="ICMP">ICMP</option>
              </select>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>IDS Source</label>
              <select style={styles.select} value={idsSource} onChange={(e) => setIdsSource(e.target.value)}>
                <option value="ALL">All Sources</option>
                <option value="Suricata">Suricata</option>
                <option value="Snort">Snort</option>
                <option value="Zeek">Zeek</option>
              </select>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Flow Type</label>
              <select style={styles.select} value={flowType} onChange={(e) => setFlowType(e.target.value)}>
                <option value="ALL">All Flows</option>
                <option value="TRIGGERED">Triggered (Alerts)</option>
                <option value="CLEAN">Clean (No Alert)</option>
              </select>
            </div>
          </div>

          <div style={styles.filtersRow}>
            <div style={styles.actions}>
              <button style={styles.secondaryBtn} onClick={onReset}>Reset</button>
              <button style={styles.ghostBtn} onClick={exportCSV}>Export CSV</button>
            </div>
          </div>
        </div>

        <div style={styles.contentRow}>
          <div style={{ ...styles.card, flex: 1, overflow: "hidden" }}>
            <div style={styles.tableHeader}>
              Showing {filtered.length} results
            </div>

            <div style={styles.tableWrap}>
              <table className="alerts-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Source IP</th>
                    <th>Destination IP</th>
                    <th>Ports</th>
                    <th>Protocol</th>
                    <th>Bytes</th>
                    <th>Source</th>
                    <th>Type</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, idx) => (
                    <tr key={idx}>
                      <td style={{ fontSize: '0.78rem' }}>{fmtTs(r.ts)}</td>
                      <td style={{ color: "var(--accent-primary)", cursor: "pointer", textDecoration: "underline" }} onClick={() => openIpDetails(r.src)}>{r.src}</td>
                      <td style={{ color: "var(--accent-primary)", cursor: "pointer", textDecoration: "underline" }} onClick={() => openIpDetails(r.dst)}>{r.dst}</td>
                      <td>{r.sport} → {r.dport}</td>
                      <td>
                        <span style={{ ...styles.badge, ...badgeForProto(r.proto) }}>{r.proto}</span>
                      </td>
                      <td>{r.bytes}</td>
                      <td><span style={styles.tag}>{r.ids}</span></td>
                      <td>
                        {r.triggered
                          ? <span style={{ ...styles.badge, backgroundColor: '#7f1d1d', borderColor: '#ef4444', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>⚠ Alert</span>
                          : <span style={{ ...styles.badge, backgroundColor: '#052e16', borderColor: '#22c55e', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>✓ Clean</span>
                        }
                      </td>
                      <td>
                        <button style={styles.smallBtn} onClick={() => setViewingRow(r)}>View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {selectedIp && (
            <div style={styles.drawer}>
              <div style={styles.drawerHeader}>
                <div>
                  <div style={styles.drawerTitle}>IP Details</div>
                  <div style={styles.drawerIp}>{selectedIp.ip}</div>
                </div>
                <button style={styles.drawerClose} onClick={() => setSelectedIp(null)}>×</button>
              </div>
              <div style={styles.drawerBody}>
                <div style={styles.kvRow}><span style={styles.kvKey}>Country</span><span style={styles.kvVal}>{selectedIp.country}</span></div>
                <div style={styles.kvRow}><span style={styles.kvKey}>ASN</span><span style={styles.kvVal}>{selectedIp.asn}</span></div>
                <div style={styles.divider} />
                <div style={styles.drawerSectionTitle}>Quick Links</div>
                <div style={styles.quickLinks}>
                  <button style={styles.linkBtn} onClick={() => window.open(`https://www.virustotal.com/gui/ip-address/${selectedIp.ip}`, '_blank')}>VirusTotal</button>
                  <button style={styles.linkBtn} onClick={() => window.open(`https://who.is/whois-ip/ip-address/${selectedIp.ip}`, '_blank')}>Whois</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Traffic Log Detail Modal ──────────────────────────────────────── */}
      {viewingRow && (
        <div className="modal-overlay" onClick={() => setViewingRow(null)}>
          <div className="modal-box" style={{ maxWidth: '460px', maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ padding: '0.6rem 0.9rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ ...styles.badge, ...badgeForProto(viewingRow.proto), padding: '0.15rem 0.55rem', fontSize: '0.72rem' }}>{viewingRow.proto}</span>
                <span style={styles.tag}>{viewingRow.ids}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{viewingRow.ts}</span>
              </div>
              <button className="back-icon" onClick={() => setViewingRow(null)} aria-label="Close">×</button>
            </div>

            <div style={{ padding: '0.5rem 0.9rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem 1rem' }}>
              {[
                ["Src IP",    viewingRow.src,              true],
                ["Dst IP",    viewingRow.dst,              true],
                ["Src Port",  viewingRow.sport,            true],
                ["Dst Port",  viewingRow.dport,            true],
                ["Bytes",     viewingRow.bytes,            false],
                ["Packets",   viewingRow.packets ?? "—",   false],
                ["Duration",  viewingRow.duration ?? "—",  false],
                ["TCP Flags", viewingRow.flags ?? "—",     false],
                ...(viewingRow.triggered && viewingRow.signature
                  ? [["Signature", viewingRow.signature, false], ["Severity", (viewingRow.severity || "").toUpperCase(), false]]
                  : []),
              ].map(([key, val, mono]) => (
                <div key={key} style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{key}</div>
                  <div style={{ color: 'var(--text-main)', fontSize: '0.8rem', fontWeight: 600, fontFamily: mono ? 'monospace' : 'inherit' }}>{val}</div>
                </div>
              ))}
            </div>

            <div style={{ padding: '0.5rem 0.9rem 0.75rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: '0.25rem' }}>Investigate:</span>
              <button style={styles.linkBtn} onClick={() => window.open(`https://www.virustotal.com/gui/ip-address/${viewingRow.src}`, '_blank')}>VT — Src IP</button>
              <button style={styles.linkBtn} onClick={() => window.open(`https://www.virustotal.com/gui/ip-address/${viewingRow.dst}`, '_blank')}>VT — Dst IP</button>
              <button style={styles.linkBtn} onClick={() => window.open(`https://who.is/whois-ip/ip-address/${viewingRow.src}`, '_blank')}>Whois</button>
              <button className="modal-cancel" style={{ marginLeft: 'auto', fontSize: '0.75rem', padding: '0.25rem 0.75rem' }} onClick={() => setViewingRow(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function badgeForProto(proto) {
  switch (proto) {
    case "TCP":  return { backgroundColor: "#1e40af", borderColor: "#3b82f6" };
    case "UDP":  return { backgroundColor: "#92400e", borderColor: "#f59e0b" };
    case "ICMP": return { backgroundColor: "#064e3b", borderColor: "#10b981" };
    default:     return { backgroundColor: "#334155", borderColor: "#64748b" };
  }
}

const styles = {
  main: { flex: 1, padding: "2rem", overflowY: "auto" },
  card: { backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "12px", padding: "1rem", marginBottom: "1rem" },
  filtersRow: { display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "0.75rem" },
  field: { display: "flex", flexDirection: "column", gap: "0.35rem", flex: "1", minWidth: "150px" },
  label: { fontSize: "0.8rem", color: "var(--text-muted)" },
  input: { backgroundColor: "var(--bg-main)", border: "1px solid var(--border-color)", color: "var(--text-main)", borderRadius: "8px", padding: "0.6rem" },
  select: { backgroundColor: "var(--bg-main)", border: "1px solid var(--border-color)", color: "var(--text-main)", borderRadius: "8px", padding: "0.6rem" },
  actions: { display: "flex", gap: "0.6rem", flex: "1", justifyContent: "flex-end" },
  secondaryBtn: { backgroundColor: "var(--bg-main)", color: "var(--text-main)", border: "1px solid var(--border-color)", padding: "0.6rem 1.2rem", borderRadius: "8px", cursor: "pointer" },
  ghostBtn: { background: "none", border: "1px dashed var(--border-color)", color: "var(--text-muted)", padding: "0.6rem 1.2rem", borderRadius: "8px", cursor: "pointer" },
  contentRow: { display: "flex", gap: "1rem" },
  tableHeader: { color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "0.5rem" },
  tableWrap: { overflowX: "auto", borderRadius: "12px", border: "1px solid var(--border-color)", borderTop: "3px solid var(--accent-primary)" },
  badge: { padding: "0.2rem 0.5rem", borderRadius: "10px", color: "#fff", fontSize: "0.7rem", fontWeight: "bold", border: "1px solid transparent" },
  tag: { display: "inline-block", padding: "0.25rem 0.55rem", borderRadius: "10px", backgroundColor: "var(--bg-primary)", border: "1px solid var(--border-color)", color: "var(--text-primary)", fontSize: "0.75rem", fontWeight: "700" },
  smallBtn: { backgroundColor: "var(--bg-hover)", border: "1px solid var(--border-color)", color: "var(--text-main)", padding: "0.4rem 0.75rem", borderRadius: "8px", cursor: "pointer", fontWeight: "600", fontSize: "0.8rem" },
  drawer: { width: "320px", backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "12px", padding: "1rem", position: "sticky", top: "0" },
  drawerHeader: { display: "flex", justifyContent: "space-between", marginBottom: "1rem" },
  drawerIp: { fontSize: "1.2rem", fontWeight: "bold", color: "var(--text-main)" },
  drawerTitle: { fontSize: "0.8rem", color: "var(--text-muted)" },
  drawerClose: { background: "none", border: "none", color: "var(--text-main)", fontSize: "1.5rem", cursor: "pointer" },
  drawerBody: {},
  kvRow: { display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" },
  kvKey: { color: "var(--text-muted)", fontSize: "0.85rem" },
  kvVal: { color: "var(--text-main)", fontSize: "0.85rem", fontWeight: "bold" },
  divider: { height: "1px", backgroundColor: "var(--border-color)", margin: "1rem 0" },
  drawerSectionTitle: { fontSize: "0.9rem", fontWeight: "bold", color: "var(--text-main)", marginBottom: "0.5rem" },
  quickLinks: { display: "flex", gap: "0.5rem" },
  linkBtn: { backgroundColor: "var(--bg-main)", border: "1px solid var(--border-color)", color: "var(--text-main)", padding: "0.4rem 0.6rem", borderRadius: "6px", cursor: "pointer", fontSize: "0.8rem" },
};

export default NetworkTraffic;
