import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpenCheck, Download, Loader2 } from 'lucide-react';
import PrintableTimetable from '../components/PrintableTimetable';
import TimetableGrid, { assignCourseColors } from '../components/TimetableGrid';
import { FormAlert } from '../components/ui/FormFeedback';
import { MAX_CREDITS_PER_SEMESTER, UNIVERSITY_NAME } from '../lib/academic';
import { exportElementToPdf } from '../lib/pdf';
import {
  getEnrolledCourses,
  selectCurrentProfile,
  selectCurrentUser,
  sumCredits,
  useAppStore,
} from '../store/useAppStore';

export default function ClassSchedule() {
  const user = useAppStore(selectCurrentUser);
  const profile = useAppStore(selectCurrentProfile);
  const courses = useAppStore((s) => s.courses);
  const enrollments = useAppStore((s) => s.enrollments);
  const currentSemester = useAppStore((s) => s.currentSemester);

  const sheetRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const enrolled = useMemo(
    () =>
      user
        ? getEnrolledCourses({ courses, enrollments, currentSemester }, user.id).sort((a, b) =>
            a.code.localeCompare(b.code),
          )
        : [],
    [user, courses, enrollments, currentSemester],
  );
  const colors = useMemo(() => assignCourseColors(enrolled), [enrolled]);
  const totalCredits = sumCredits(enrolled);

  if (!user) return null;

  const studentName = profile?.fullName ?? user.fullName;
  const studentId = profile?.studentId ?? '-';
  const department = profile?.department ?? '-';

  const handleExport = async () => {
    if (!sheetRef.current) return;
    setExportError(null);
    setExporting(true);
    try {
      await exportElementToPdf(sheetRef.current, {
        filename: `Class-Timetable-${studentId}-${currentSemester.replace(/\s+/g, '-')}.pdf`,
        title: `${UNIVERSITY_NAME} - Student Class Timetable`,
        orientation: 'landscape',
      });
    } catch (err) {
      console.error('PDF export failed', err);
      setExportError('The PDF could not be generated. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Weekly Class Schedule
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {currentSemester} Semester &middot; {enrolled.length} course{enrolled.length === 1 ? '' : 's'} &middot;{' '}
            {totalCredits} / {MAX_CREDITS_PER_SEMESTER} credits
          </p>
        </div>

        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || enrolled.length === 0}
          title={enrolled.length === 0 ? 'Add at least one course to export your schedule.' : undefined}
          className="btn-primary"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4" aria-hidden="true" />
          )}
          {exporting ? 'Generating PDF...' : 'Export Schedule to PDF'}
        </button>
      </header>

      <FormAlert message={exportError} onDismiss={() => setExportError(null)} />

      {enrolled.length === 0 && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 sm:flex-row sm:items-center sm:justify-between">
          <p>Your timetable is empty. Select courses and they will appear in the grid below.</p>
          <Link to="/courses" className="btn-primary shrink-0">
            <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
            Go to Course Selection
          </Link>
        </div>
      )}

      {/* Timetable */}
      <section aria-label="Weekly timetable" className="card overflow-x-auto p-3 sm:p-4">
        <TimetableGrid courses={enrolled} colors={colors} />
      </section>

      {/* Legend */}
      {enrolled.length > 0 && (
        <section aria-labelledby="legend-title" className="card p-5">
          <h3 id="legend-title" className="text-sm font-semibold text-slate-900">
            Course Legend
          </h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {enrolled.map((c) => (
              <li key={c.id} className="flex items-center gap-2.5 text-sm text-slate-700">
                <span
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 rounded"
                  style={{ backgroundColor: colors[c.id].bg, border: `2px solid ${colors[c.id].border}` }}
                />
                <span className="truncate">
                  <strong className="font-semibold text-slate-900">{c.code}</strong> {c.title}{' '}
                  <span className="text-slate-500">({c.credits} cr)</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Hidden, fixed-width sheet that html2canvas captures for the PDF */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 0 }}>
        <PrintableTimetable
          ref={sheetRef}
          studentName={studentName}
          studentId={studentId}
          department={department}
          academicYear={profile?.academicYear ?? '-'}
          semester={currentSemester}
          courses={enrolled}
          colors={colors}
          totalCredits={totalCredits}
        />
      </div>
    </div>
  );
}
