import { useMemo, useState } from 'react';
import { Check, Plus, Search, Trash2, X } from 'lucide-react';
import CreditProgress from '../components/CreditProgress';
import { FormAlert } from '../components/ui/FormFeedback';
import TextField from '../components/ui/TextField';
import { COURSE_TYPES, WEEKDAYS, WEEKDAY_NAMES, formatSlots } from '../lib/academic';
import { getEnrolledCourses, selectCurrentUser, sumCredits, useAppStore } from '../store/useAppStore';
import type { Course, CourseType, Weekday } from '../types';

type Feedback = { variant: 'error' | 'success' | 'info'; message: string } | null;

const TYPE_STYLES: Record<CourseType, string> = {
  Required: 'bg-rose-50 text-rose-700 ring-rose-200',
  Elective: 'bg-sky-50 text-sky-700 ring-sky-200',
  'General Education': 'bg-violet-50 text-violet-700 ring-violet-200',
  'Physical Education': 'bg-amber-50 text-amber-700 ring-amber-200',
};

function TypeBadge({ type }: { type: CourseType }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TYPE_STYLES[type]}`}>
      {type}
    </span>
  );
}

/** One line per meeting day, e.g. "Mon: Period 3, 4" / "Wed: Period 1". */
function Schedule({ course }: { course: Course }) {
  return (
    <>
      {formatSlots(course.slots)
        .split('; ')
        .map((line) => (
          <div key={line} className="whitespace-nowrap">
            {line}
          </div>
        ))}
    </>
  );
}

const TH = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500';
const TD = 'px-4 py-3 align-top text-sm text-slate-700';

export default function CourseSelection() {
  const user = useAppStore(selectCurrentUser);
  const courses = useAppStore((s) => s.courses);
  const enrollments = useAppStore((s) => s.enrollments);
  const currentSemester = useAppStore((s) => s.currentSemester);
  const selectCourse = useAppStore((s) => s.selectCourse);
  const dropCourse = useAppStore((s) => s.dropCourse);

  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('All');
  const [day, setDay] = useState<'All' | Weekday>('All');
  const [type, setType] = useState<'All' | CourseType>('All');
  const [feedback, setFeedback] = useState<Feedback>(null);

  // ----------------------------- Derived data -----------------------------

  const catalog = useMemo(
    () => courses.filter((c) => c.semester === currentSemester).sort((a, b) => a.code.localeCompare(b.code)),
    [courses, currentSemester],
  );

  const departments = useMemo(() => Array.from(new Set(catalog.map((c) => c.department))).sort(), [catalog]);

  const enrolled = useMemo(
    () => (user ? getEnrolledCourses({ courses, enrollments, currentSemester }, user.id) : []),
    [user, courses, enrollments, currentSemester],
  );
  const enrolledIds = useMemo(() => new Set(enrolled.map((c) => c.id)), [enrolled]);
  const totalCredits = sumCredits(enrolled);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter(
      (c) =>
        (q === '' || c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)) &&
        (department === 'All' || c.department === department) &&
        (day === 'All' || c.slots.some((s) => s.day === day)) &&
        (type === 'All' || c.type === type),
    );
  }, [catalog, query, department, day, type]);

  const hasActiveFilters = query !== '' || department !== 'All' || day !== 'All' || type !== 'All';
  const clearFilters = () => {
    setQuery('');
    setDepartment('All');
    setDay('All');
    setType('All');
  };

  // ------------------------------- Actions --------------------------------
  // The store performs the hard validation (25-credit cap, time-slot clash, capacity, etc.) and
  // returns a ready-to-display English message, so the UI only has to show it.

  const handleAdd = async (course: Course) => {
    const result = await selectCourse(course.id);
    setFeedback(
      result.ok
        ? { variant: 'success', message: `${course.code} ${course.title} has been added to your timetable.` }
        : { variant: 'error', message: result.message },
    );
  };

  const handleDrop = async (course: Course) => {
    const result = await dropCourse(course.id);
    setFeedback(
      result.ok
        ? { variant: 'info', message: `${course.code} ${course.title} has been dropped.` }
        : { variant: 'error', message: result.message },
    );
  };

  if (!user) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Sticky: credit progress + latest result stay visible while scrolling the catalog */}
      <div className="sticky top-16 z-10 -mx-4 space-y-3 bg-slate-50/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="card p-4 sm:p-5">
          <CreditProgress credits={totalCredits} />
        </div>
        <FormAlert message={feedback?.message} variant={feedback?.variant} onDismiss={() => setFeedback(null)} />
      </div>

      {/* ------------------------------ Catalog ------------------------------ */}
      <section aria-labelledby="catalog-title" className="card overflow-hidden">
        <div className="space-y-4 border-b border-slate-200 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="catalog-title" className="font-display text-lg font-semibold text-slate-900">
              Course Catalog <span className="text-sm font-normal text-slate-500">({currentSemester} Semester)</span>
            </h2>
            <p className="text-sm text-slate-500" aria-live="polite">
              Showing {filtered.length} of {catalog.length} courses
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[2fr_1.6fr_1fr_1fr_auto] xl:items-end">
            <TextField
              id="course-search"
              label="Search"
              icon={Search}
              placeholder="Course code or name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />

            <div>
              <label htmlFor="filter-department" className="field-label">Department</label>
              <select id="filter-department" className="field-input" value={department} onChange={(e) => setDepartment(e.target.value)}>
                <option value="All">All departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filter-day" className="field-label">Day of the Week</label>
              <select id="filter-day" className="field-input" value={day} onChange={(e) => setDay(e.target.value as 'All' | Weekday)}>
                <option value="All">All days</option>
                {WEEKDAYS.map((d) => (
                  <option key={d} value={d}>{WEEKDAY_NAMES[d]}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filter-type" className="field-label">Course Type</label>
              <select id="filter-type" className="field-input" value={type} onChange={(e) => setType(e.target.value as 'All' | CourseType)}>
                <option value="All">All types</option>
                {COURSE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <button type="button" onClick={clearFilters} disabled={!hasActiveFilters} className="btn-secondary">
              <X className="h-4 w-4" aria-hidden="true" />
              Clear Filters
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className={TH}>Course Code</th>
                <th scope="col" className={TH}>Course Name</th>
                <th scope="col" className={TH}>Department</th>
                <th scope="col" className={TH}>Type</th>
                <th scope="col" className={TH}>Credits</th>
                <th scope="col" className={TH}>Instructor</th>
                <th scope="col" className={TH}>Schedule</th>
                <th scope="col" className={TH}>Classroom</th>
                <th scope="col" className={TH}>Seats</th>
                <th scope="col" className={`${TH} text-right`}>Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-14 text-center text-sm text-slate-500">
                    No courses match your search and filters.
                    {hasActiveFilters && (
                      <button type="button" onClick={clearFilters} className="ml-2 font-semibold text-brand-700 hover:underline">
                        Clear filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((course) => {
                  const isEnrolled = enrolledIds.has(course.id);
                  const taken = course.enrolledCount;
                  const isFull = taken >= course.capacity;
                  return (
                    <tr key={course.id} className={isEnrolled ? 'bg-brand-50/60' : 'hover:bg-slate-50'}>
                      <td className={`${TD} whitespace-nowrap font-semibold text-slate-900`}>{course.code}</td>
                      <td className={`${TD} min-w-[14rem]`}>
                        <div className="font-medium text-slate-900">{course.title}</div>
                      </td>
                      <td className={TD}>{course.department}</td>
                      <td className={TD}><TypeBadge type={course.type} /></td>
                      <td className={TD}>{course.credits}</td>
                      <td className={`${TD} whitespace-nowrap`}>{course.instructor}</td>
                      <td className={TD}><Schedule course={course} /></td>
                      <td className={TD}>{course.classroom}</td>
                      <td className={`${TD} whitespace-nowrap ${isFull ? 'font-semibold text-red-600' : ''}`}>
                        {taken} / {course.capacity}
                      </td>
                      <td className={`${TD} text-right`}>
                        {isEnrolled ? (
                          <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                            <Check className="h-4 w-4" aria-hidden="true" />
                            Enrolled
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAdd(course)}
                            disabled={isFull}
                            aria-label={`Add course ${course.code} ${course.title}`}
                            className="btn-primary !px-3 !py-1.5 text-xs"
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                            {isFull ? 'Course Full' : 'Add Course'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* --------------------------- Enrolled courses -------------------------- */}
      <section aria-labelledby="enrolled-title" className="card overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 p-5">
          <h2 id="enrolled-title" className="font-display text-lg font-semibold text-slate-900">
            Enrolled Courses
          </h2>
          <p className="text-sm text-slate-500">
            {enrolled.length} course{enrolled.length === 1 ? '' : 's'} &middot; {totalCredits} credits
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className={TH}>Course Code</th>
                <th scope="col" className={TH}>Course Name</th>
                <th scope="col" className={TH}>Credits</th>
                <th scope="col" className={TH}>Instructor</th>
                <th scope="col" className={TH}>Schedule</th>
                <th scope="col" className={TH}>Classroom</th>
                <th scope="col" className={`${TH} text-right`}>Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enrolled.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                    You have not selected any courses yet. Use "Add Course" in the catalog above to get started.
                  </td>
                </tr>
              ) : (
                enrolled.map((course) => (
                  <tr key={course.id} className="hover:bg-slate-50">
                    <td className={`${TD} whitespace-nowrap font-semibold text-slate-900`}>{course.code}</td>
                    <td className={`${TD} min-w-[14rem] font-medium text-slate-900`}>{course.title}</td>
                    <td className={TD}>{course.credits}</td>
                    <td className={`${TD} whitespace-nowrap`}>{course.instructor}</td>
                    <td className={TD}><Schedule course={course} /></td>
                    <td className={TD}>{course.classroom}</td>
                    <td className={`${TD} text-right`}>
                      <button
                        type="button"
                        onClick={() => handleDrop(course)}
                        aria-label={`Drop course ${course.code} ${course.title}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Drop Course
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {enrolled.length > 0 && (
              <tfoot className="bg-slate-50">
                <tr>
                  <th scope="row" colSpan={2} className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                    Total Enrolled Credits
                  </th>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-900">{totalCredits}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}
