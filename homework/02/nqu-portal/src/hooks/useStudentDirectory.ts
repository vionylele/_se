import { useEffect } from 'react';
import { acquireShared, subscribeToTable } from '../lib/realtime';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import type { ProfileRow } from '../lib/mappers';
import { useAppStore } from '../store/useAppStore';

/**
 * Administrator only: keeps the student directory live, so a new registration or a freshly
 * completed profile appears without a refresh. (RLS only lets the admin read other people's rows.)
 */
export function useStudentDirectory(enabled: boolean) {
  const users = useAppStore((s) => s.users);
  const userId = useAppStore((s) => s.currentUserId);

  useEffect(() => {
    if (!isSupabaseConfigured || !enabled || !userId) return;
    const release = acquireShared(`profiles:${userId}`, () => {
      const { refreshProfiles, applyProfileChange, setSyncError } = useAppStore.getState();
      return subscribeToTable<ProfileRow>({
        table: 'profiles',
        onChange: applyProfileChange,
        onResync: () => void refreshProfiles(),
        onError: setSyncError,
      });
    });
    return release;
  }, [enabled, userId]);

  return users;
}
