import { Loader2 } from 'lucide-react';
import { Navigate, Outlet } from 'react-router-dom';
import { ADMIN_EMAIL } from '../lib/academic';
import { selectCurrentUser, useAppStore } from '../store/useAppStore';
import type { Role } from '../types';

/** Shown while Supabase restores a saved session, so a signed-in user never flashes the login page. */
function AuthLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-live="polite">
      <Loader2 className="h-6 w-6 animate-spin text-brand-700" aria-hidden="true" />
      <span className="sr-only">Loading your session...</span>
    </div>
  );
}

/** Login / Register: signed-in users are sent to the dashboard. */
export function PublicOnly() {
  const user = useAppStore(selectCurrentUser);
  const authReady = useAppStore((s) => s.authReady);
  if (!authReady) return <AuthLoading />;
  return user ? <Navigate to="/" replace /> : <Outlet />;
}

/** Everything inside requires a signed-in session. */
export function RequireAuth() {
  const user = useAppStore(selectCurrentUser);
  const authReady = useAppStore((s) => s.authReady);
  if (!authReady) return <AuthLoading />;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

/** Restricts a branch of routes to one role; other roles are sent back to the dashboard. */
export function RequireRole({ role }: { role: Role }) {
  const user = useAppStore(selectCurrentUser);
  const authReady = useAppStore((s) => s.authReady);
  if (!authReady) return <AuthLoading />;
  return user?.role === role ? <Outlet /> : <Navigate to="/" replace />;
}

/**
 * Admin-only branch. Requires BOTH the ADMIN role and the reserved administrator email, so the
 * panel stays locked to vionylee07@gmail.com even if another account were ever given the role.
 * (UI guard only. The real enforcement is Row Level Security in supabase/schema.sql.)
 */
export function RequireAdmin() {
  const user = useAppStore(selectCurrentUser);
  const authReady = useAppStore((s) => s.authReady);
  if (!authReady) return <AuthLoading />;
  const isAdmin = user?.role === 'ADMIN' && user.email === ADMIN_EMAIL;
  return isAdmin ? <Outlet /> : <Navigate to="/" replace />;
}
