import { useEffect, useMemo, useState } from "react";
import { getAlerts } from "../../services/api";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import './analyst.css';

function getStorageKey() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    return `report_history_${user.email || "default"}`;
  } catch { return "report_history_default"; }
}

function loadLocalHistory() {
  try { return JSON.parse(localStorage.getItem(getStorageKey()) || "[]"); }
  catch { return []; }
}

function saveLocalHistory(items) {
  try { localStorage.setItem(getStorageKey(), JSON.stringify(items)); }
  catch {
    // Reporting still works when browser storage is unavailable.
  }
}


function Reports() {
  /* ── Live alert data from API ──────────────────────────────── */
  const [liveAlerts, setLiveAlerts] = useState([]);

  useEffect(() => {
    getAlerts()
      .then((data) => {
        const items = Array.isArray(data) ? data : (data.items ?? data.alerts ?? []);
        setLiveAlerts(items);
      })
      .catch(() => {});
  }, []);

  /* ── Generate-form state ───────────────────────────────────── */
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo]         = useState(() => new Date().toISOString().slice(0, 10));
  const [severity, setSeverity]   = useState("HIGH_ONLY");
  const [format, setFormat]       = useState("PDF");
  const [idsSource, setIdsSource] = useState("ALL");

  /* ── History table (user-scoped localStorage + API sync) ───── */
  const [reports, setReports] = useState(() => loadLocalHistory());

  /* ── Table filters ─────────────────────────────────────────── */
  const [filterScope,  setFilterScope]  = useState("ALL");
  const [filterFormat, setFilterFormat] = useState("ALL");

  /* ── Derived ───────────────────────────────────────────────── */
  const severityLabel = useMemo(() => {
    if (severity === "HIGH_ONLY") return "High Only";
    if (severity === "HIGH_MED")  return "Medium & High";
    return "All";
  }, [severity]);

  const isRangeValid = useMemo(() => {
    try { return new Date(from).getTime() <= new Date(to).getTime(); }
    catch { return false; }
  }, [from, to]);

  /* Filter alerts by date range + severity + IDS source */
  const filterAlerts = (alerts, scope, srcFilter, fromDate, toDate) => {
    const start = new Date(fromDate);
    const end   = new Date(toDate); end.setHours(23, 59, 59, 999);

    return alerts.filter((a) => {
      // Date range
      if (a.timestamp) {
        const t = new Date(a.timestamp);
        if (t < start || t > end) return false;
      }
      // Severity scope
      const sev = (a.severity_label || '').toLowerCase();
      if (scope === "High Only"     && sev !== 'high') return false;
      if (scope === "Medium & High" && !['high','medium'].includes(sev)) return false;
      // IDS source (best-effort on proto/ids field)
      if (srcFilter !== "ALL" && a.proto !== srcFilter && a.ids !== srcFilter) return false;
      return true;
    });
  };

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      const scopeMatch  = filterScope  === "ALL" || r.scope  === filterScope;
      const fmtMatch    = filterFormat === "ALL" || r.format === filterFormat;
      return scopeMatch && fmtMatch;
    });
  }, [reports, filterScope, filterFormat]);

  /* ── Generate — filter, download, log ─────────────────────── */
  const generate = () => {
    if (!isRangeValid) return;

    const scopedAlerts = filterAlerts(liveAlerts, severityLabel, idsSource, from, to);
    const by = idsSource === "ALL" ? "All Sources" : idsSource;
    const generatedAt = new Date().toLocaleDateString();

    const newReport = {
      id: `RPT-${Date.now()}`,
      generatedAt,
      dateFrom: from,
      dateTo: to,
      scope: severityLabel,
      by,
      format,
      alertCount: scopedAlerts.length,
    };

    // Download immediately
    if (format === "CSV") {
      triggerCSV(newReport, scopedAlerts);
    } else {
      triggerPDF(newReport, scopedAlerts);
    }

    // Save to localStorage
    setReports((prev) => {
      const updated = [newReport, ...prev];
      saveLocalHistory(updated);
      return updated;
    });
  };

  const resetForm = () => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    setFrom(d.toISOString().slice(0, 10));
    setTo(new Date().toISOString().slice(0, 10));
    setSeverity("HIGH_ONLY");
    setFormat("PDF");
    setIdsSource("ALL");
  };

  /* ── Download helpers ──────────────────────────────────────── */
  const downloadRow = (r) => {
    const scopedAlerts = filterAlerts(liveAlerts, r.scope, r.by === "All Sources" ? "ALL" : r.by, r.dateFrom, r.dateTo);
    if (r.format === "CSV") triggerCSV(r, scopedAlerts);
    else triggerPDF(r, scopedAlerts);
  };

  const triggerCSV = (report, alerts) => {
    const headers = ["Alert ID", "Severity", "Signature", "Source IP", "Destination IP", "Port", "Status", "Timestamp"];
    const dataRows = alerts.length > 0
      ? alerts.map((a) => [
          a.id ?? "", a.severity_label ?? "", a.signature ?? "",
          a.src_ip ?? "", a.dest_ip ?? "", a.dest_port ?? "",
          a.status ?? "", a.timestamp ?? "",
        ])
      : [["No alerts matched the selected filters", "", "", "", "", "", "", ""]];

    const csvContent = [
      `# Report: ${report.id} | Generated: ${report.generatedAt} | Period: ${report.dateFrom} to ${report.dateTo}`,
      `# Scope: ${report.scope} | Source: ${report.by} | Total matching alerts: ${alerts.length}`,
      "",
      headers.join(","),
      ...dataRows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${report.id}_${report.dateFrom}_${report.dateTo}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const triggerPDF = (report, alerts) => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const highCount = alerts.filter(a => (a.severity_label || '').toLowerCase() === 'high').length;

    // Header
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`Security Alert Report - ${report.id}`, 40, 40);

    // Meta info
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 60);
    doc.text(`Period: ${report.dateFrom}  to  ${report.dateTo}`, 40, 73);
    doc.text(`Scope: ${report.scope}   |   IDS Source: ${report.by}`, 40, 86);
    doc.text(`Total Matching Alerts: ${alerts.length}   |   High Severity: ${highCount}`, 40, 99);

    // Table
    doc.setTextColor(0);
    if (alerts.length > 0) {
      autoTable(doc, {
        startY: 115,
        head: [["Severity", "Signature", "Src IP", "Dst IP", "Port", "Status", "Time"]],
        body: alerts.map(a => [
          (a.severity_label ?? "").toUpperCase(),
          a.signature ?? "",
          a.src_ip ?? "",
          a.dest_ip ?? "",
          String(a.dest_port ?? ""),
          a.status ?? "",
          a.timestamp ? new Date(a.timestamp).toLocaleString() : "",
        ]),
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 1: { cellWidth: 160 } },
      });
    } else {
      doc.setFontSize(10);
      doc.setTextColor(150);
      doc.text("No alerts matched the selected filters for this period.", 40, 130);
    }

    doc.save(`${report.id}_${report.dateFrom}_${report.dateTo}.pdf`);
  };

  /* ─────────────────────────────────────────────────────────── */
  return (
    <main className="dashboard-main">
      <div className="dashboard-status-bar">
        <h1 className="page-title">Reports</h1>
      </div>

      {/* ── Generate form ── */}
      <div className="card">
        <h2 className="section-title">Generate Report</h2>

        <div className="filters">
          {/* Date range */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label className="nav-section-title">Alert Date Range</label>
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
              <input className="time-filter" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>to</span>
              <input className="time-filter" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            {!isRangeValid && <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>End date must be after start date</span>}
          </div>

          {/* Severity */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label className="nav-section-title">Severity Scope</label>
            <select className="time-filter" value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="HIGH_ONLY">High Only</option>
              <option value="HIGH_MED">Medium &amp; High</option>
              <option value="ALL">All Severities</option>
            </select>
          </div>

          {/* IDS Source */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label className="nav-section-title">IDS Source</label>
            <select className="time-filter" value={idsSource} onChange={(e) => setIdsSource(e.target.value)}>
              <option value="ALL">All Sources</option>
              <option value="Suricata">Suricata</option>
              <option value="Snort">Snort</option>
              <option value="Zeek">Zeek</option>
            </select>
          </div>

          {/* Format */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label className="nav-section-title">Output Format</label>
            <select className="time-filter" value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="PDF">PDF</option>
              <option value="CSV">CSV</option>
            </select>
          </div>
        </div>

        {/* Form actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.75rem' }}>
          <button className="export-btn" onClick={resetForm}>Reset</button>
          <button className="view-btn" onClick={generate} disabled={!isRangeValid}>
            Generate
          </button>
        </div>
      </div>

      <div className="divider" />

      {/* ── History table ── */}
      <div className="recent-alerts-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 className="section-title" style={{ margin: 0 }}>
            Report History
            <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.85rem', marginLeft: '0.5rem' }}>
              ({filteredReports.length} of {reports.length})
            </span>
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="time-filter" value={filterScope} onChange={(e) => setFilterScope(e.target.value)}>
              <option value="ALL">All Scopes</option>
              <option value="High Only">High Only</option>
              <option value="Medium & High">Medium &amp; High</option>
              <option value="All">All Severities</option>
            </select>
            <select className="time-filter" value={filterFormat} onChange={(e) => setFilterFormat(e.target.value)}>
              <option value="ALL">All Formats</option>
              <option value="PDF">PDF</option>
              <option value="CSV">CSV</option>
            </select>
            {(filterScope !== "ALL" || filterFormat !== "ALL") && (
              <button className="export-btn" onClick={() => { setFilterScope("ALL"); setFilterFormat("ALL"); }}>Clear</button>
            )}
          </div>
        </div>

        <div className="table-scroll">
          <table className="alerts-table">
            <thead>
              <tr>
                <th>Report ID</th>
                <th>Generated</th>
                <th>Period</th>
                <th>Scope</th>
                <th>Source</th>
                <th>Alerts</th>
                <th>Format</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-text">No reports generated yet. Use the form above to generate one.</td>
                </tr>
              ) : filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-text">No reports match the current filters.</td>
                </tr>
              ) : (
                filteredReports.map((r) => (
                  <tr key={r.id}>
                    <td><span className="mono">{r.id}</span></td>
                    <td>{r.generatedAt}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.dateFrom} → {r.dateTo}</td>
                    <td>{r.scope}</td>
                    <td>{r.by}</td>
                    <td>{r.alertCount}</td>
                    <td><span className="tag">{r.format}</span></td>
                    <td>
                      <button className="export-btn" onClick={() => downloadRow(r)}>
                        ↓ {r.format}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

export default Reports;
