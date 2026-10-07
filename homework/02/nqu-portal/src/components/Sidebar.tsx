import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { GraduationCap, LogOut, X } from 'lucide-react';
import { Avatar, RoleBadge } from './UserBadge';
import { navItemsForRole } from './navigation';
import { APP_NAME } from '../lib/academic';
import { selectCurrentProfile, selectCurrentUser, useAppStore } from '../store/useAppStore';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
    isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useAppStore(selectCurrentUser);
  const profile = useAppStore(selectCurrentProfile);
  const logout = useAppStore((s) => s.logout);

  // Close the mobile drawer with the Escape key.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!user) return null;
  const displayName = profile?.fullName ?? user.fullName;
  const subline = user.role === 'STUDENT' ? `Student ID: ${profile?.studentId ?? '-'}` : user.email;

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden" onClick={onClose} aria-hidden="true" />}

      <aside
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand */}
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-white">
              <GraduationCap className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="font-display text-base font-semibold text-slate-900">{APP_NAME}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Profile card */}
        <div className="m-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          <Avatar name={displayName} src={profile?.photoDataUrl} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
            <p className="truncate text-xs text-slate-500">{subline}</p>
            <div className="mt-1.5">
              <RoleBadge role={user.role} />
            </div>
          </div>
        </div>

        {/* Links */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-4 pb-4">
          {navItemsForRole(user.role).map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={linkClass} onClick={onClose}>
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <button type="button" onClick={logout} className="btn-secondary w-full">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
