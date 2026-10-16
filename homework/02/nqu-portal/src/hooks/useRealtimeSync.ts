import { ADMIN_EMAIL } from '../lib/academic';
import { selectCurrentUser, useAppStore } from '../store/useAppStore';
import { useAnnouncements } from './useAnnouncements';
import { useCourses } from './useCourses';
import { useEnrollments } from './useEnrollments';
import { useStudentDirectory } from './useStudentDirectory';

/**
 * One call that keeps the whole app live. Mounted once in <AppLayout /> (the signed-in shell),
 * so every page below it always reads fresh data from the store.
 */
export function useRealtimeSync(): void {
  const user = useAppStore(selectCurrentUser);
  const isAdmin = user?.role === 'ADMIN' && user.email === ADMIN_EMAIL;

  useAnnouncements();
  useCourses();
  useEnrollments();
  useStudentDirectory(isAdmin);
}
