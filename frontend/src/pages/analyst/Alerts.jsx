import React, { useState, useEffect, useMemo, useCallback } from "react";
import { FiEye, FiDownload, FiSearch, FiMap } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import { refreshAllLocations } from "../../services/api";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  "http://localhost:8000";

const Alerts = () => {
  const navigate = useNavigate();

  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshingLocations, setRefreshingLocations] = useState(false);

  const alertsPerPage = 5;

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      let url = `${API_BASE}/api/alerts`;
      const params = new URLSearchParams();

      if (severityFilter) {
        if (severityFilter === "High") params.append("severity", "1");
        if (severityFilter === "Medium") params.append("severity", "2");
        if (severityFilter === "Low") params.append("severity", "3");
      }

      if (statusFilter) {
        params.append("status", statusFilter.toLowerCase());
      }

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const token = localStorage.getItem("token");

      const response = await fetch(url, {
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {},
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch alerts: HTTP ${response.status}`);
      }

      const data = await response.json();
      setAlerts(data.items || []);
    } catch (err) {
      console.error("Fetch alerts failed:", err);
      setError("Could not reach backend — showing no live data.");
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [severityFilter, statusFilter]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      const text =
        `${alert.src_ip || ""} ${alert.dest_ip || ""} ${alert.signature || ""} ${alert.dest_port || ""} ${alert.proto || ""}`.toLowerCase();

      return text.includes(search.toLowerCase());
    });
  }, [alerts, search]);

  const totalAlerts = filteredAlerts.length;
  const totalPages = Math.max(1, Math.ceil(totalAlerts / alertsPerPage));

  const highCount = alerts.filter(
    (a) => (a.severity_label || "").toLowerCase() === "high"
  ).length;

  const mediumCount = alerts.filter(
    (a) => (a.severity_label || "").toLowerCase() === "medium"
  ).length;

  const lowCount = alerts.filter(
    (a) => (a.severity_label || "").toLowerCase() === "low"
  ).length;

  const getSeverityClass = (severity) => {
    const value = (severity || "").toLowerCase();
    if (value === "high") return "sev-high";
    if (value === "medium") return "sev-medium";
    return "sev-low";
  };

  const indexOfLastAlert = currentPage * alertsPerPage;
  const indexOfFirstAlert = indexOfLastAlert - alertsPerPage;
  const currentAlerts = filteredAlerts.slice(indexOfFirstAlert, indexOfLastAlert);

  const getPageNumbers = () => {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];
    let l;

    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 ||
        i === totalPages ||
        (i >= currentPage - delta && i <= currentPage + delta)
      ) {
        range.push(i);
      }
    }

    range.forEach((i) => {
      if (l) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l !== 1) {
          rangeWithDots.push("...");
        }
      }
      rangeWithDots.push(i);
      l = i;
    });

    return rangeWithDots;
  };

  const exportToCSV = () => {
    const headers = [
      "Severity",
      "Alert Type",
      "Source IP",
      "Destination IP",
      "Location",
      "Port",
      "IDS Source",
      "Time",
      "Status",
    ];

    const rows = filteredAlerts.map((alert) => [
      alert.severity_label || "",
      alert.signature || "",
      alert.src_ip || "",
      alert.dest_ip || "",
      alert.dest_location
        ? alert.dest_location.city
          ? `${alert.dest_location.city}, ${alert.dest_location.country}`
          : alert.dest_location.country || ""
        : "",
      alert.dest_port || "",
      alert.proto || "",
      alert.timestamp || "",
      alert.status || "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "alerts_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleRefreshAllLocations = async () => {
    setRefreshingLocations(true);
    try {
      await refreshAllLocations();
      await fetchAlerts();
    } catch (error) {
      console.error("Failed to refresh locations:", error);
      setError("Failed to refresh locations");
    } finally {
      setRefreshingLocations(false);
    }
  };

  const showingFrom = totalAlerts === 0 ? 0 : indexOfFirstAlert + 1;
  const showingTo = Math.min(indexOfLastAlert, totalAlerts);

  return (
    <main className="dashboard-main">
      <div className="alerts-wrapper">
        <div className="alerts-header">
          <h1>Intrusion Detection Alerts</h1>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              className="refresh-btn"
              onClick={handleRefreshAllLocations}
              disabled={refreshingLocations}
            >
              {refreshingLocations ? "⟳ Refreshing..." : "🗺️ Refresh Locations"}
            </button>
            <button className="export-btn" onClick={exportToCSV}>
              <FiDownload /> Export
            </button>
          </div>
        </div>

        <div className="summary-cards">
          <div className="card card-total">
            <span className="card-icon">!</span>
            <div className="card-label">Total Alerts</div>
            <hr />
            <div className="card-value">{loading ? "…" : alerts.length}</div>
          </div>

          <div className="card card-high">
            <span className="card-icon">!</span>
            <div className="card-label">High Severity</div>
            <hr />
            <div className="card-value">{loading ? "…" : highCount}</div>
          </div>

          <div className="card card-medium">
            <span className="card-icon">!</span>
            <div className="card-label">Medium Severity</div>
            <hr />
            <div className="card-value">{loading ? "…" : mediumCount}</div>
          </div>

          <div className="card card-low">
            <span className="card-icon">!</span>
            <div className="card-label">Low Severity</div>
            <hr />
            <div className="card-value">{loading ? "…" : lowCount}</div>
          </div>
        </div>

        {error && <div className="error-banner">⚠️ {error}</div>}

        <div className="filters">
          <select
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="">All Severities</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="">All Status</option>
            <option value="new">New</option>
            <option value="investigating">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>

          <div className="search-box">
            <FiSearch />
            <input
              placeholder="Search IP, Port, Type"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
        </div>

        <div className="table-container">
          {loading ? (
            <p className="loading-text">Loading alerts…</p>
          ) : currentAlerts.length === 0 ? (
            <p className="empty-text">No alerts found.</p>
          ) : (
            <div className="table-scroll">
              <table className="alerts-table">
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Alert Type</th>
                    <th>Source IP</th>
                    <th>Destination IP</th>
                    <th>Location</th>
                    <th>Port</th>
                    <th>IDS Source</th>
                    <th>Time</th>
                    <th>Status</th>
                    <th>View</th>
                    <th>Map</th>
                  </tr>
                </thead>
                <tbody>
                  {currentAlerts.map((alert) => {
                    const hasgeo =
                      alert.dest_location?.latitude &&
                      alert.dest_location?.longitude;

                    return (
                      <tr key={alert.id}>
                        <td>
                          <span
                            className={`badge ${getSeverityClass(
                              alert.severity_label
                            )}`}
                          >
                            {alert.severity_label || "-"}
                          </span>
                        </td>
                        <td style={{ textTransform: "capitalize" }}>
                          {alert.signature || "-"}
                        </td>
                        <td>{alert.src_ip || "-"}</td>
                        <td>{alert.dest_ip || "-"}</td>
                        <td>
                          {alert.dest_location ? (
                            <span
                              style={{
                                fontSize: "0.85rem",
                                color: "var(--text-muted)",
                              }}
                            >
                              {alert.dest_location.city
                                ? `${alert.dest_location.city}, ${alert.dest_location.country}`
                                : alert.dest_location.country || "-"}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>-</span>
                          )}
                        </td>
                        <td>{alert.dest_port || "-"}</td>
                        <td>{alert.proto || "-"}</td>
                        <td>
                          {alert.timestamp
                            ? new Date(alert.timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })
                            : "-"}
                        </td>
                        <td>{alert.status || "new"}</td>
                        <td>
                          <Link to={`/alert/${alert.id}`} state={{ alert }}>
                            <FiEye className="view-icon" />
                          </Link>
                        </td>
                        <td>
                          {hasgeo ? (
                            <FiMap
                              className="view-icon"
                              title="View on Threat Map"
                              style={{
                                cursor: "pointer",
                                color: "var(--accent-main)",
                              }}
                              onClick={() =>
                                navigate(`/threat-map?alertId=${alert.id}`)
                              }
                            />
                          ) : (
                            <span style={{ color: "var(--text-dim)" }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="pagination">
          <p>
            Showing {showingFrom} to {showingTo} of {totalAlerts} alerts
          </p>
          <div className="pages">
            <button
              onClick={() => setCurrentPage((prev) => prev - 1)}
              disabled={currentPage === 1}
              className="page-nav"
            >
              ‹
            </button>

            {getPageNumbers().map((page, index) => (
              <button
                key={index}
                className={`page-number ${page === currentPage ? "active" : ""} ${
                  page === "..." ? "dots" : ""
                }`}
                onClick={() => page !== "..." && setCurrentPage(page)}
                disabled={page === "..."}
              >
                {page}
              </button>
            ))}

            <button
              onClick={() => setCurrentPage((prev) => prev + 1)}
              disabled={currentPage === totalPages}
              className="page-nav"
            >
              ›
            </button>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Alerts;
