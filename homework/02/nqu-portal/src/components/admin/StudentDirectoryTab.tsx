import { useMemo, useState } from 'react';
import { CheckCircle2, Clock, Search } from 'lucide-react';
import { Avatar } from '../UserBadge';
import { MAX_CREDITS_PER_SEMESTER, formatDate } from '../../lib/academic';
import { getRegisteredStudents, useAppStore } from '../../store/useAppStore';

const TH = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500';
const TD = 'px-4 py-3 align-top text-sm text-slate-700';

type StatusFilter = 'All' | 'Completed' | 'Pending';

export default function StudentDirectoryTab() {
  const users = useAppStore((s) => s.users);
  const profiles = useAppStore((s) => s.profiles);
  const courses = useAppStore((s) => s.courses);
  const enrollments = useAppStore((s) => s.enrollments);
  const currentSemester = useAppStore((s) => s.currentSemester);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('All');

  const rows = useMemo(
    () => getRegisteredStudents({ users, profiles, courses, enrollments, currentSemester }),
    [users, profiles, courses, enrollments, currentSemester],
  );
  const completed = rows.filter((r) => r.user.isProfileCompleted).length;

  const visible = rows.filter((r) => {
    const q = query.trim().toLowerCase();
    const matchesQuery =
      q === '' ||
      r.user.fullName.toLowerCase().includes(q) ||
      r.user.email.includes(q) ||
      (r.profile?.studentId.toLowerCase().includes(q) ?? false);
    const matchesStatus =
      status === 'All' || (status === 'Completed' ? r.user.isProfileCompleted : !r.user.isProfileCompleted);
    return matchesQuery && matchesStatus;
  });

  return (
    <section aria-labelledby="directory-title" className="card overflow-hidden">
      <div className="space-y-4 border-b border-slate-200 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="directory-title" className="font-display text-lg font-semibold text-slate-900">Registered Students</h3>
          <p className="text-sm text-slate-500">
            {rows.length} total &middot; {completed} profiles completed &middot; {rows.length - completed} pending
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
          <div className="relative">
            <label htmlFor="student-search" className="sr-only">Search students</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input id="student-search" className="field-input pl-10" placeholder="Search by name, Student ID, or email"
              value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div>
            <label htmlFor="student-status" className="sr-only">Profile status</label>
            <select id="student-status" className="field-input" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
              <option value="All">All profile statuses</option>
              <option value="Completed">Profile completed</option>
              <option value="Pending">Profile pending</option>
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              {['Student', 'Student ID', 'Department / Major', 'Profile Status', 'Contact Details', 'Emergency Contact', 'Enrolled Credits', 'Registered'].map((h) => (
                <th key={h} scope="col" className={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-14 text-center text-sm text-slate-500">
                  {rows.length === 0 ? 'No students have registered yet.' : 'No students match your search.'}
                </td>
              </tr>
            ) : (
              visible.map(({ user, profile, enrolledCredits }) => (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className={TD}>
                    <div className="flex items-center gap-3">
                      <Avatar name={profile?.fullName ?? user.fullName} src={profile?.photoDataUrl} size="sm" />
                      <span className="font-medium text-slate-900">{profile?.fullName ?? user.fullName}</span>
                    </div>
                  </td>
                  <td className={`${TD} whitespace-nowrap font-medium`}>{profile?.studentId ?? '-'}</td>
                  <td className={TD}>
                    {profile?.department ?? '-'}
                    {profile && <div className="text-xs text-slate-500">{profile.academicYear}</div>}
                  </td>
                  <td className={TD}>
                    {user.isProfileCompleted ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Completed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />Pending
                      </span>
                    )}
                  </td>
                  <td className={`${TD} min-w-[14rem]`}>
                    <a href={`mailto:${user.email}`} className="text-brand-700 hover:underline">{user.email}</a>
                    {profile && <div className="text-xs text-slate-500">{profile.address}</div>}
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {profile ? (
                      <>
                        {profile.emergencyContactName}
                        <div className="text-xs text-slate-500">{profile.emergencyContactPhone}</div>
                      </>
                    ) : '-'}
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    <span className="font-semibold text-slate-900">{enrolledCredits}</span> / {MAX_CREDITS_PER_SEMESTER}
                    <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                      <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, (enrolledCredits / MAX_CREDITS_PER_SEMESTER) * 100)}%` }} />
                    </div>
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>{formatDate(user.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
