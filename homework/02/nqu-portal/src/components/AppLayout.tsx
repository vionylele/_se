import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import FirstTimeProfileModal from './FirstTimeProfileModal';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import SyncBanner from './SyncBanner';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { selectCurrentUser, useAppStore } from '../store/useAppStore';

/**
 * Authenticated application shell and the Mandatory Profile Completion Guard.
 * While a student's profile is incomplete, ONLY the profile form renders: the sidebar, navbar and
 * <Outlet /> (every page) are not mounted, so there is nothing to navigate to.
 */
export default function AppLayout() {
  const user = useAppStore(selectCurrentUser);
  const { pathname } = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Live data: announcements, courses, enrollments (and the student directory for the admin).
  useRealtimeSync();

  useEffect(() => setSidebarOpen(false), [pathname]);

  if (!user) return null;

  if (user.role === 'STUDENT' && !user.isProfileCompleted) {
    return <FirstTimeProfileModal />;
  }

  return (
    <div className="min-h-screen lg:pl-72">
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="flex min-h-screen flex-col">
        <Navbar onMenuClick={() => setSidebarOpen(true)} />
        <SyncBanner />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
