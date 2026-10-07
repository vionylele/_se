import { useEffect } from 'react';
import { acquireShared, subscribeToTable } from '../lib/realtime';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import type { AnnouncementRow } from '../lib/mappers';
import { useAppStore } from '../store/useAppStore';

/**
 * Live announcements.
 *  - fetches once on mount,
 *  - opens ONE shared Realtime channel (INSERT / UPDATE / DELETE) no matter how many components use the hook,
 *  - re-fetches after a dropped connection comes back, so nothing is missed.
 * Any component that calls this re-renders the moment the admin publishes, edits or deletes a post.
 */
export function useAnnouncements() {
  const announcements = useAppStore((s) => s.announcements);
  const status = useAppStore((s) => s.status.announcements);
  const refresh = useAppStore((s) => s.refreshAnnouncements);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const release = acquireShared('announcements', () => {
      const { refreshAnnouncements, applyAnnouncementChange, setSyncError } = useAppStore.getState();
      void refreshAnnouncements();
      return subscribeToTable<AnnouncementRow>({
        table: 'announcements',
        onChange: applyAnnouncementChange,
        onResync: () => void refreshAnnouncements(),
        onError: setSyncError,
      });
    });
    return release;
  }, []);

  return { announcements, loading: status === 'loading' && announcements.length === 0, refresh };
}
