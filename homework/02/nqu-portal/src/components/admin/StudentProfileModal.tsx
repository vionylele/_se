import { useEffect, useRef } from 'react';
import { CheckCircle2, Clock, X } from 'lucide-react';
import { Avatar } from '../UserBadge';
import { MAX_CREDITS_PER_SEMESTER, formatDate, formatSlots } from '../../lib/academic';
import type { Course, StudentProfile, User } from '../../types';

interface Props {
  user: User;
  profile: StudentProfile | null;
  courses: Course[]; // courses the student is enrolled in this semester
  semester: string;
  onClose: () => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-900">{children || '-'}</dd>
    </div>
  );
}

/** Read-only view of a student's full profile and current course load, for administrators. */
export default function StudentProfileModal({ user, profile, courses, semester, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const name = profile?.fullName ?? user.fullName;
  const credits = courses.reduce((n, c) => n + c.credits, 0);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 p-4 sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="mx-auto my-4 w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start gap-4 border-b border-slate-200 bg-brand-50 px-6 py-5">
          <Avatar name={name} src={profile?.photoDataUrl} size="xl" />
          <div className="min-w-0 flex-1">
            <h2 id="student-modal-title" className="font-display text-2xl font-semibold text-slate-900">{name}</h2>
            <p className="text-sm text-slate-600">{user.email}</p>
            <div className="mt-2">
              {user.isProfileCompleted ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Profile completed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />Profile pending
                </span>
              )}
            </div>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close student profile" className="btn-secondary !px-2.5 !py-2">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-8 px-6 py-6">
          {profile ? (
            <>
              <section aria-labelledby="sm-academic">
                <h3 id="sm-academic" className="mb-3 font-display text-base font-semibold text-slate-900">Academic</h3>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Field label="Student ID">{profile.studentId}</Field>
                  <Field label="Department / Major">{profile.department}</Field>
                  <Field label="Academic Year">{profile.academicYear}</Field>
                  <Field label="Registered">{formatDate(user.createdAt)}</Field>
                </dl>
              </section>

              <section aria-labelledby="sm-personal">
                <h3 id="sm-personal" className="mb-3 font-display text-base font-semibold text-slate-900">Personal Details</h3>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Field label="Date of Birth">{profile.dateOfBirth ? `${profile.dateOfBirth} (age ${profile.age})` : ''}</Field>
                  <Field label="Nationality">{profile.nationality}</Field>
                  <Field label="Place of Origin">{profile.placeOfOrigin}</Field>
                  <Field label="Current Address">{profile.address}</Field>
                </dl>
              </section>

              <section aria-labelledby="sm-emergency">
                <h3 id="sm-emergency" className="mb-3 font-display text-base font-semibold text-slate-900">Emergency Contact</h3>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name">{profile.emergencyContactName}</Field>
                  <Field label="Phone">{profile.emergencyContactPhone}</Field>
                </dl>
              </section>
            </>
          ) : (
            <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
              This student has registered but has not completed the profile form yet, so only the account details are available.
            </p>
          )}

          <section aria-labelledby="sm-courses">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 id="sm-courses" className="font-display text-base font-semibold text-slate-900">
                Enrolled Courses <span className="text-sm font-normal text-slate-500">({semester} Semester)</span>
              </h3>
              <p className="text-sm text-slate-600">{courses.length} course{courses.length === 1 ? '' : 's'} &middot; {credits} / {MAX_CREDITS_PER_SEMESTER} credits</p>
            </div>
            {courses.length === 0 ? (
              <p className="text-sm text-slate-500">No courses selected yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[520px] divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-3 py-2">Code</th>
                      <th scope="col" className="px-3 py-2">Course</th>
                      <th scope="col" className="px-3 py-2">Credits</th>
                      <th scope="col" className="px-3 py-2">Schedule</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {courses.map((c) => (
                      <tr key={c.id}>
                        <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-900">{c.code}</td>
                        <td className="px-3 py-2">{c.title}</td>
                        <td className="px-3 py-2">{c.credits}</td>
                        <td className="px-3 py-2">{formatSlots(c.slots).split('; ').map((l) => <div key={l} className="whitespace-nowrap">{l}</div>)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
