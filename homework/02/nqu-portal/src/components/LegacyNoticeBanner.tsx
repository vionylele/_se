import { Info, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

/** Shown once after old mock data was found and purged. Visible on every page, including login. */
export default function LegacyNoticeBanner() {
  const show = useAppStore((s) => s.legacyNotice);
  const dismiss = useAppStore((s) => s.dismissLegacyNotice);
  if (!show) return null;

  return (
    <div role="status" className="sticky top-0 z-50 flex items-start gap-3 bg-brand-700 px-4 py-3 text-sm text-white shadow">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="flex-1">System upgraded to cloud database. Please register a new account to continue.</p>
      <button type="button" onClick={dismiss} aria-label="Dismiss notice" className="rounded p-0.5 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
