import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { useAppStore } from '../store/useAppStore';

/** Shows connection / permission problems instead of failing silently. Cached data stays visible. */
export default function SyncBanner() {
  const syncError = useAppStore((s) => s.syncError);
  const setSyncError = useAppStore((s) => s.setSyncError);

  const retry = () => {
    const s = useAppStore.getState();
    setSyncError(null);
    void Promise.all([s.refreshAnnouncements(), s.refreshCourses(), s.refreshEnrollments()]);
  };

  const message = !isSupabaseConfigured
    ? 'Supabase is not configured (VITE_SUPABASE_URL is missing). Showing cached data only.'
    : syncError;
  if (!message) return null;

  return (
    <div role="alert" className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 sm:px-6 lg:px-8">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="flex-1">{message}</p>
      {isSupabaseConfigured && (
        <button type="button" onClick={retry} className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
        </button>
      )}
      {isSupabaseConfigured && (
        <button type="button" onClick={() => setSyncError(null)} aria-label="Dismiss" className="rounded p-0.5 hover:bg-amber-100">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
