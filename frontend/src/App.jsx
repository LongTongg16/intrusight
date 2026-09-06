import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute";
import RouteFallback from "./components/RouteFallback";
import ErrorBoundary from "./components/ErrorBoundary";

/* ── Eager: the public entry points and auth flow ──────────────
   These are what an unauthenticated visitor hits first, so they stay
   in the main chunk to avoid a spinner on the very first paint.
   ───────────────────────────────────────────────────────────── */
import Visitor from "./pages/shared/Visitor";
import Login from "./pages/shared/Login";

/* ── Lazy: everything else ────────────────────────────────────
   Route-level splitting keeps Recharts (Dashboard/Demo), Leaflet
   (ThreatMap) and jsPDF (Reports) out of the initial bundle. Those
   three libraries were roughly two thirds of it.
   ───────────────────────────────────────────────────────────── */
const About               = lazy(() => import("./pages/shared/About"));
const Features            = lazy(() => import("./pages/shared/Features"));
const Demo                = lazy(() => import("./pages/shared/Demo"));
const Register            = lazy(() => import("./pages/shared/Register"));
const ForgetPassword      = lazy(() => import("./pages/shared/ForgotPassword"));
const Logout              = lazy(() => import("./pages/shared/Logout"));
const ForcePasswordChange = lazy(() => import("./pages/shared/ForcePasswordChange"));

const AnalystSidebar  = lazy(() => import("./pages/analyst/AnalystSidebar"));
const Dashboard       = lazy(() => import("./pages/analyst/Dashboard"));
const Alerts          = lazy(() => import("./pages/analyst/Alerts"));
const AlertDetails    = lazy(() => import("./pages/analyst/AlertDetails"));
const Reports         = lazy(() => import("./pages/analyst/Reports"));
const NetworkTraffic  = lazy(() => import("./pages/analyst/NetworkTraffic"));
const ThreatMap       = lazy(() => import("./pages/analyst/ThreatMap"));
const Notifications   = lazy(() => import("./pages/analyst/Notifications"));
const AnalystSettings = lazy(() => import("./pages/analyst/Settings"));
const AnalystProfile  = lazy(() => import("./pages/analyst/Profile"));

const AdminSidebar        = lazy(() => import("./pages/admin/AdminSidebar"));
const AdminDashboard      = lazy(() => import("./pages/admin/AdminDashboard"));
const Usermanagement      = lazy(() => import("./pages/admin/UserManagement"));
const LogManagement       = lazy(() => import("./pages/admin/LogManagement"));
const AdminSettings       = lazy(() => import("./pages/admin/Settings"));
const DatabaseMaintenance = lazy(() => import("./pages/admin/DatabaseMaintenance"));
const AdminProfile        = lazy(() => import("./pages/admin/Profile"));

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
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
          <Route path="/force-password-change" element={<ForcePasswordChange />} />

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
              <Route index element={<AdminDashboard />} />
              <Route path="users" element={<Usermanagement />} />
              <Route path="log-management" element={<LogManagement />} />
              <Route path="settings" element={<AdminSettings />} />
              <Route path="maintenance" element={<DatabaseMaintenance />} />
              <Route path="profile" element={<AdminProfile />} />
              <Route path="logout" element={<Logout />} />
            </Route>
          </Route>
        </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
