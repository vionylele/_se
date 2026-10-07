import { useState } from 'react';
import { BookPlus, Megaphone, ShieldAlert, Users, type LucideIcon } from 'lucide-react';
import AnnouncementsTab from '../components/admin/AnnouncementsTab';
import CoursesTab from '../components/admin/CoursesTab';
import StudentDirectoryTab from '../components/admin/StudentDirectoryTab';
import { ADMIN_EMAIL } from '../lib/academic';
import { selectCurrentUser, useAppStore } from '../store/useAppStore';

type TabId = 'announcements' | 'courses' | 'students';

const TABS: Array<{ id: TabId; label: string; icon: LucideIcon }> = [
  { id: 'announcements', label: 'Publish Announcement', icon: Megaphone },
  { id: 'courses', label: 'Course Management', icon: BookPlus },
  { id: 'students', label: 'Student Directory', icon: Users },
];

/**
 * Admin Management. The router already restricts this page with <RequireAdmin />; the check below
 * is a second layer so the panel never renders for any account other than the administrator.
 */
export default function AdminPanel() {
  const user = useAppStore(selectCurrentUser);
  const studentCount = useAppStore((s) => s.users.filter((u) => u.role === 'STUDENT').length);
  const courseCount = useAppStore((s) => s.courses.filter((c) => c.semester === s.currentSemester).length);
  const announcementCount = useAppStore((s) => s.announcements.length);
  const [tab, setTab] = useState<TabId>('announcements');

  if (user?.role !== 'ADMIN' || user.email !== ADMIN_EMAIL) {
    return (
      <div className="card mx-auto mt-10 max-w-lg p-10 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-red-500" aria-hidden="true" />
        <h2 className="mt-3 font-display text-xl font-semibold text-slate-900">Access Denied</h2>
        <p className="mt-1 text-sm text-slate-600">This area is restricted to the portal administrator.</p>
      </div>
    );
  }

  const counts: Record<TabId, number> = { announcements: announcementCount, courses: courseCount, students: studentCount };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Admin Management</h2>
        <p className="mt-1 text-sm text-slate-600">Publish announcements, manage the course catalog, and review registered students.</p>
      </header>

      <div role="tablist" aria-label="Admin sections" className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              id={`tab-${id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`panel-${id}`}
              onClick={() => setTab(id)}
              className={`-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                active ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
              <span className={`rounded-full px-2 py-0.5 text-xs ${active ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-600'}`}>
                {counts[id]}
              </span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'announcements' && <AnnouncementsTab />}
        {tab === 'courses' && <CoursesTab />}
        {tab === 'students' && <StudentDirectoryTab />}
      </div>
    </div>
  );
}
