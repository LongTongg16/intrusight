import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import axios from "axios";

// Import the gatekeeper
import ProtectedRoute from "./components/ProtectedRoute";

// Shared Pages
import Login from "./pages/shared/Login";
import About from "./pages/shared/About";
import Features from "./pages/shared/Features";
import Demo from "./pages/shared/Demo";
import Register from "./pages/shared/Register";
import Visitor from "./pages/shared/Visitor";
import ForgetPassword from "./pages/shared/ForgotPassword";
import Logout from "./pages/shared/Logout";
import ForcePasswordChange from "./pages/shared/ForcePasswordChange";

// Admin Pages
import AdminDashboard from "./pages/admin/AdminDashboard";
import Usermanagement from "./pages/admin/UserManagement";
import Profile from "./pages/admin/Profile";
import AdminSidebar from "./pages/admin/AdminSidebar";
import LogManagement from "./pages/admin/LogManagement";
import AdminSettings from "./pages/admin/Settings";
import DatabaseMaintenance from "./pages/admin/DatabaseMaintenance";

// Analyst Pages
import Dashboard from "./pages/analyst/Dashboard";
import Alerts from "./pages/analyst/Alerts";
import Reports from "./pages/analyst/Reports";
import AnalystProfile from "./pages/analyst/Profile";
import AlertDetails from "./pages/analyst/AlertDetails";
import NetworkTraffic from "./pages/analyst/NetworkTraffic";
import Notifications from "./pages/analyst/Notifications";
import AnalystSettings from "./pages/analyst/Settings";
import AnalystSidebar from "./pages/analyst/AnalystSidebar";
import ThreatMap from "./pages/analyst/ThreatMap";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

const getAuthHeader = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
});

function App() {
  const [logs, setLogs] = useState([]);

  const fetchLogs = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const res = await axios.get(`${API_BASE}/api/logs`, getAuthHeader());
      setLogs(res.data.items ?? res.data ?? []);
    } catch (err) {
      console.error("Failed to fetch log sources:", err);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <BrowserRouter>
      <Routes>
        {/* --- PUBLIC ROUTES --- */}
        <Route path="/" element={<Visitor />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/about" element={<About />} />
        <Route path="/features" element={<Features />} />
        <Route path="/demo" element={<Demo />} />
        <Route path="/forgotpassword" element={<ForgetPassword />} />
        <Route path="/logout" element={<Logout />} />
        <Route
          path="/force-password-change"
          element={<ForcePasswordChange />}
        />

        {/* --- PROTECTED ZONE --- */}
        <Route element={<ProtectedRoute />}>
          {/* Analyst Layout + Routes */}
          <Route element={<AnalystSidebar />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/alert/:id" element={<AlertDetails />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/network-traffic" element={<NetworkTraffic />} />
            <Route path="/threat-map" element={<ThreatMap />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/settings" element={<AnalystSettings />} />
            <Route path="/analyst/profile" element={<AnalystProfile />} />
            <Route path="/profile" element={<AnalystProfile />} />
          </Route>

          {/* Admin Layout + Routes */}
          <Route path="/admin" element={<AdminSidebar />}>
            <Route
              index
              element={
                <AdminDashboard logs={logs} onRefreshLogs={fetchLogs} />
              }
            />
            <Route path="users" element={<Usermanagement />} />
            <Route
              path="log-management"
              element={
                <LogManagement
                  logs={logs}
                  setLogs={setLogs}
                  onRefreshLogs={fetchLogs}
                />
              }
            />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="maintenance" element={<DatabaseMaintenance />} />
            <Route path="profile" element={<Profile />} />
            <Route path="logout" element={<Logout />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
