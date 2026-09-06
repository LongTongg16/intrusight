/**
 * api.js - Central API service layer
 * Uses one configurable FastAPI backend.
 */

const AUTH_BASE = import.meta.env.VITE_AUTH_URL || import.meta.env.VITE_API_BASE || "http://localhost:8000";
const ALERTS_BASE = import.meta.env.VITE_ALERTS_URL || import.meta.env.VITE_API_BASE || "http://localhost:8000";

/**
 * Core request helper
 * @param {string} baseUrl - Either AUTH_BASE or ALERTS_BASE
 * @param {string} path - The endpoint path
 */
async function request(
  baseUrl,
  path,
  options = {},
  { redirectOnUnauthorized = true } = {},
) {
  const token = localStorage.getItem("token");
  const headers = { 
    "Content-Type": "application/json", 
    ...options.headers 
  };
  
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, { ...options, headers });

  if (!res.ok) {
    if (res.status === 401 && redirectOnUnauthorized) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// --- AUTH SERVICES ---

export async function loginUser(email, password) {
  return request(
    AUTH_BASE,
    "/api/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ email, password }),
    },
    { redirectOnUnauthorized: false },
  );
}

export async function registerUser(email, password, full_name, role = "Security Analyst") {
  return request(AUTH_BASE, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, full_name, role }),
  });
}

export async function healthCheck() {
  return request(AUTH_BASE, "/health");
}

export async function changePassword(currentPassword, newPassword) {
  return request(AUTH_BASE, "/api/users/change-password", {
    method: "POST",
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
}

// --- ALERTS & DASHBOARD SERVICES ---

export async function getDashboardSummary() {
  return request(ALERTS_BASE, "/api/alerts/dashboard/summary");
}

export async function getAlerts(params = {}) {
  const qs = new URLSearchParams();
  if (params.severity) qs.append("severity", params.severity);
  if (params.src_ip)   qs.append("src_ip",   params.src_ip);
  if (params.dest_ip)  qs.append("dest_ip",  params.dest_ip);
  if (params.proto)    qs.append("proto",    params.proto);
  if (params.status)   qs.append("status",   params.status);
  
  const q = qs.toString();
  return request(ALERTS_BASE, `/api/alerts${q ? `?${q}` : ""}`);
}

export async function getAlertById(id) {
  return request(ALERTS_BASE, `/api/alerts/${id}`);
}

export async function updateAlertStatus(id, status) {
  return request(ALERTS_BASE, `/api/alerts/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function getNotes(alertId) {
  return request(ALERTS_BASE, `/api/alerts/${alertId}/notes`);
}

export async function addNote(alertId, text) {
  return request(ALERTS_BASE, `/api/alerts/${alertId}/notes`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function updateAlert(alertId, updates) {
  return request(ALERTS_BASE, `/api/alerts/${alertId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export async function refreshAlertLocation(alertId) {
  return request(ALERTS_BASE, `/api/alerts/${alertId}/refresh-location`, {
    method: "POST",
  });
}

export async function refreshAllLocations() {
  return request(ALERTS_BASE, "/api/alerts/refresh-all-locations", {
    method: "POST",
  });
}

export async function getTrafficLogs() {
  return request(ALERTS_BASE, "/api/traffic");
}
