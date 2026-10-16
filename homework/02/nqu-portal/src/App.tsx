import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import LegacyNoticeBanner from './components/LegacyNoticeBanner';
import { PublicOnly, RequireAdmin, RequireAuth, RequireRole } from './components/RouteGuards';
import AdminPanel from './pages/AdminPanel';
import ClassSchedule from './pages/ClassSchedule';
import CourseSelection from './pages/CourseSelection';
import Dashboard from './pages/Dashboard';
import GradeReport from './pages/GradeReport';
import Login from './pages/Login';
import Register from './pages/Register';
import { useAppStore } from './store/useAppStore';

/**
 * HashRouter keeps the route after a "#" (e.g. /#/courses), so deep links and page refreshes never
 * hit GitHub Pages as unknown paths and therefore never return a 404.
 */
export default function App() {
  // Session sync. Subscribes to supabase.auth.onAuthStateChange: restores a saved session on load and
  // reacts to sign-in / sign-out / account switches made in ANY other tab or window of this browser.
  useEffect(() => useAppStore.getState().initAuth(), []);

  return (
    <HashRouter>
      <LegacyNoticeBanner />
      <Routes>
        {/* Public: signed-in users are redirected to the dashboard */}
        <Route element={<PublicOnly />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

        {/* Authenticated shell (also hosts the mandatory first-time profile guard) */}
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<Dashboard />} />

            <Route element={<RequireRole role="STUDENT" />}>
              <Route path="courses" element={<CourseSelection />} />
              <Route path="schedule" element={<ClassSchedule />} />
              <Route path="transcript" element={<GradeReport />} />
            </Route>

            {/* Administrator only (vionylee07@gmail.com) */}
            <Route element={<RequireAdmin />}>
              <Route path="admin" element={<AdminPanel />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
