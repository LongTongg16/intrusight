import { useMemo, useState, useEffect, useCallback } from "react";
import { getTrafficLogs } from "../../services/api";
import {
  PageHeader, Button, Notice, Icon, SeverityBadge, EngineBadge,
  FilterBar, SelectFilter, SearchFilter, EmptyState, ErrorState, LoadingRows,
} from "../../components/ui";
import "./analyst.css";

/**
 * Flow records.
 *
 * Provenance matters on this page, so it is stated in the UI rather than
 * assumed:
 *
 *  - "Triggered" rows are derived from stored alerts. Their addresses,
 *    ports, protocol, engine and signature are real.
 *  - "Sample" rows are seeded background flows the API returns to
 *    illustrate what non-alerting traffic looks like. They are not
 *    observed traffic and are labelled as such.
 *
 * Byte counts, packet counts, TCP flags and durations are NOT displayed.
 * The API synthesises them per request (they are not stored on an alert),
 * so rendering them would present random numbers as measurements.
 * IntruSight does not capture or inspect packets.
 */

const PROTOCOLS = [
  { value: "ALL", label: "All protocols" },
  { value: "TCP", label: "TCP" },
  { value: "UDP", label: "UDP" },
  { value: "ICMP", label: "ICMP" },
];

const ENGINES = [
  { value: "ALL", label: "All engines" },
  { value: "Suricata", label: "Suricata" },
  { value: "Snort", label: "Snort" },
  { value: "Zeek", label: "Zeek" },
  { value: "Kismet", label: "Kismet" },
];

const FLOW_TYPES = [
  { value: "ALL", label: "All records" },
  { value: "TRIGGERED", label: "Triggered by a rule" },
  { value: "CLEAN", label: "Sample background flows" },
];

const fmtTs = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString([], {
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
};

function NetworkTraffic() {
  const [query, setQuery] = useState("");
  const [protocol, setProtocol] = useState("ALL");
  const [engine, setEngine] = useState("ALL");
  const [flowType, setFlowType] = useState("ALL");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    getTrafficLogs()
      .then((data) => setRows(data.items ?? []))
      .catch(() => {
        setError("Could not reach the API. No flow records loaded.");
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const haystack = `${r.src ?? ""} ${r.dst ?? ""} ${r.sport ?? ""} ${r.dport ?? ""} ${r.signature ?? ""}`.toLowerCase();
      const matchQ = q === "" || haystack.includes(q);
      const matchProto = protocol === "ALL" || r.proto === protocol;
      const matchEngine = engine === "ALL" || (r.ids || "").toLowerCase() === engine.toLowerCase();
      const matchType = flowType === "ALL"
        || (flowType === "TRIGGERED" ? r.triggered : !r.triggered);
      return matchQ && matchProto && matchEngine && matchType;
    });
  }, [rows, query, protocol, engine, flowType]);

  const triggeredCount = useMemo(() => rows.filter((r) => r.triggered).length, [rows]);
  const sampleCount = rows.length - triggeredCount;

  const exportCSV = () => {
    const headers = ["Timestamp", "Source", "Destination", "Source port", "Destination port", "Protocol", "Engine", "Record type", "Signature", "Severity"];
    const body = filtered.map((r) => [
      r.ts ?? "", r.src ?? "", r.dst ?? "", r.sport ?? "", r.dport ?? "",
      r.proto ?? "", r.ids ?? "",
      r.triggered ? "triggered" : "sample background flow",
      r.signature ?? "", r.severity ?? "",
    ]);
    const csv = [headers, ...body]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "flow_records.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setQuery(""); setProtocol("ALL"); setEngine("ALL"); setFlowType("ALL");
  };

  return (
    <>
      <PageHeader
        title="Flow records"
        subtitle="Connection records reconstructed from stored alerts, alongside seeded background flows for comparison. IntruSight does not capture or inspect packets — these fields come from what the detection engines reported."
        actions={
          <>
            <Button onClick={load} loading={loading}>
              <Icon.refresh /> Refresh
            </Button>
            <Button onClick={exportCSV} disabled={!filtered.length}>
              <Icon.download /> Export CSV
            </Button>
          </>
        }
      />

      {sampleCount > 0 && (
        <Notice tone="warning" className="nt-notice">
          <strong>{sampleCount} of {rows.length} records are seeded sample flows.</strong>{" "}
          They illustrate non-alerting traffic and are not observed from your network.
          Rows marked <em>Triggered</em> are derived from real stored alerts.
        </Notice>
      )}

      <FilterBar count={`${filtered.length} of ${rows.length}`}>
        <SearchFilter
          value={query}
          onChange={setQuery}
          placeholder="Search address, port or signature"
          label="Search flow records"
        />
        <SelectFilter label="Protocol" value={protocol} onChange={setProtocol} options={PROTOCOLS} />
        <SelectFilter label="Engine" value={engine} onChange={setEngine} options={ENGINES} />
        <SelectFilter label="Type" value={flowType} onChange={setFlowType} options={FLOW_TYPES} />
      </FilterBar>

      <div className="table-container">
        {loading ? (
          <LoadingRows rows={6} label="Loading flow records" />
        ) : error ? (
          <ErrorState onRetry={load}>{error}</ErrorState>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="inbox"
            title={rows.length ? "No records match these filters" : "No flow records yet"}
            actions={rows.length
              ? <Button size="sm" onClick={resetFilters}>Clear filters</Button>
              : undefined}
          >
            {rows.length
              ? "Try widening the protocol, engine or record-type filter."
              : "Flow records are derived from stored alerts. Run an ingestor to load alerts first."}
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="alerts-table alerts-table--flows">
              <caption className="visually-hidden">
                Flow records derived from stored alerts and seeded sample traffic
              </caption>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Source</th>
                  <th scope="col">Destination</th>
                  <th scope="col">Proto</th>
                  <th scope="col">Engine</th>
                  <th scope="col">Record</th>
                  <th scope="col">Signature</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => (
                  <tr key={`${r.ts}-${r.src}-${r.dst}-${idx}`}>
                    <td className="nt-time">{fmtTs(r.ts)}</td>
                    <td className="ui-mono">
                      {r.src}
                      {r.sport ? <span className="nt-port">:{r.sport}</span> : null}
                    </td>
                    <td className="ui-mono">
                      {r.dst}
                      {r.dport ? <span className="nt-port">:{r.dport}</span> : null}
                    </td>
                    <td>{r.proto || "—"}</td>
                    <td><EngineBadge engine={r.ids} /></td>
                    <td>
                      {r.triggered
                        ? <span className="ui-status ui-status--investigating">Triggered</span>
                        : <span className="ui-status">Sample</span>}
                    </td>
                    <td>
                      {r.triggered && r.signature ? (
                        <div className="nt-sig">
                          <span>{r.signature}</span>
                          {r.severity && <SeverityBadge severity={r.severity} />}
                        </div>
                      ) : (
                        <span className="nt-none">No rule matched</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export default NetworkTraffic;
