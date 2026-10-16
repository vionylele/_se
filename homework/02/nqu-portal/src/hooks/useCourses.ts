import { useEffect } from 'react';
import { acquireShared, subscribeToTable } from '../lib/realtime';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import type { CourseRow } from '../lib/mappers';
import { useAppStore } from '../store/useAppStore';

/**
 * Live course catalogue (including the seat counter `enrolledCount`, which the database updates
 * whenever any student enrolls or drops, so every open catalogue page shows it change in real time).
 */
export function useCourses() {
  const courses = useAppStore((s) => s.courses);
  const status = useAppStore((s) => s.status.courses);
  const refresh = useAppStore((s) => s.refreshCourses);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const release = acquireShared('courses', () => {
      const { refreshCourses, applyCourseChange, setSyncError } = useAppStore.getState();
      void refreshCourses();
      return subscribeToTable<CourseRow>({
        table: 'courses',
        onChange: applyCourseChange,
        onResync: () => void refreshCourses(),
        onError: setSyncError,
      });
    });
    return release;
  }, []);

  return { courses, loading: status === 'loading' && courses.length === 0, refresh };
}
