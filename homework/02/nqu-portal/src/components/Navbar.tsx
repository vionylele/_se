import { useLocation } from 'react-router-dom';
import { CalendarRange, LogOut, Menu } from 'lucide-react';
import { Avatar, RoleBadge } from './UserBadge';
import { titleForPath } from './navigation';
import { selectCurrentProfile, selectCurrentUser, useAppStore } from '../store/useAppStore';

export default function Navbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { pathname } = useLocation();
  const user = useAppStore(selectCurrentUser);
  const profile = useAppStore(selectCurrentProfile);
  const semester = useAppStore((s) => s.currentSemester);
  const logout = useAppStore((s) => s.logout);

  if (!user) return null;
  const displayName = profile?.fullName ?? user.fullName;

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/85 px-4 backdrop-blur sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
        className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <h1 className="truncate font-display text-lg font-semibold text-slate-900">{titleForPath(pathname)}</h1>

      <div className="ml-auto flex items-center gap-3 sm:gap-4">
        <span className="hidden items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 md:inline-flex">
          <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
          {semester} Semester
        </span>

        <div className="flex items-center gap-3">
          <Avatar name={displayName} src={profile?.photoDataUrl} size="sm" />
          <div className="hidden min-w-0 leading-tight sm:block">
            <p className="max-w-[10rem] truncate text-sm font-semibold text-slate-900">{displayName}</p>
            <p className="max-w-[10rem] truncate text-xs text-slate-500">
              {user.role === 'STUDENT' ? profile?.studentId ?? '-' : 'Administrator'}
            </p>
          </div>
          <RoleBadge role={user.role} />
        </div>

        <button type="button" onClick={logout} className="btn-secondary hidden !px-3 !py-2 md:inline-flex">
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign Out
        </button>
      </div>
    </header>
  );
}
