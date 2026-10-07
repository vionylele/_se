import { useEffect } from 'react';
import { acquireShared, subscribeToTable } from '../lib/realtime';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import type { EnrollmentRow } from '../lib/mappers';
import { useAppStore } from '../store/useAppStore';

/**
 * Live enrollments. Row Level Security decides what arrives: a student only receives their own rows,
 * the administrator receives everyone's. Needs a signed-in user.
 */
export function useEnrollments() {
  const enrollments = useAppStore((s) => s.enrollments);
  const userId = useAppStore((s) => s.currentUserId);

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;
    const release = acquireShared(`enrollments:${userId}`, () => {
      const { refreshEnrollments, applyEnrollmentChange, setSyncError } = useAppStore.getState();
      return subscribeToTable<EnrollmentRow>({
        table: 'enrollments',
        onChange: applyEnrollmentChange,
        onResync: () => void refreshEnrollments(),
        onError: setSyncError,
      });
    });
    return release;
  }, [userId]);

  return enrollments;
}
