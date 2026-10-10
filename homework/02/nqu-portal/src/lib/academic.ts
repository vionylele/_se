import type {
  CourseType,
  GradeRecord,
  GradeScaleEntry,
  PeriodCode,
  PeriodDefinition,
  ProgramLevel,
  TimetableSlot,
  Weekday,
} from '../types';

export const ADMIN_EMAIL = 'vionylee07@gmail.com';
export const MAX_CREDITS_PER_SEMESTER = 25;

export const WEEKDAYS: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Taiwan standard 4.3 scale. Ordered high -> low. */
export const GRADE_SCALE: GradeScaleEntry[] = [
  { letter: 'A+', minScore: 90, maxScore: 100, gradePoint: 4.3 },
  { letter: 'A', minScore: 85, maxScore: 89, gradePoint: 4.0 },
  { letter: 'A-', minScore: 80, maxScore: 84, gradePoint: 3.7 },
  { letter: 'B+', minScore: 77, maxScore: 79, gradePoint: 3.3 },
  { letter: 'B', minScore: 73, maxScore: 76, gradePoint: 3.0 },
  { letter: 'B-', minScore: 70, maxScore: 72, gradePoint: 2.7 },
  { letter: 'C+', minScore: 67, maxScore: 69, gradePoint: 2.3 },
  { letter: 'C', minScore: 63, maxScore: 66, gradePoint: 2.0 },
  { letter: 'C-', minScore: 60, maxScore: 62, gradePoint: 1.7 },
  { letter: 'F', minScore: 0, maxScore: 59, gradePoint: 0.0 },
];

/** Minimum passing score. Undergraduate = 60 (C-). Graduate = 70 is an assumption; adjust as needed. */
export const PASSING_SCORE: Record<ProgramLevel, number> = {
  Undergraduate: 60,
  Graduate: 70,
};

export const PERIODS: PeriodDefinition[] = [
  { code: '1', label: 'Period 1', start: '08:10', end: '09:00', isNoonBreak: false },
  { code: '2', label: 'Period 2', start: '09:10', end: '10:00', isNoonBreak: false },
  { code: '3', label: 'Period 3', start: '10:10', end: '11:00', isNoonBreak: false },
  { code: '4', label: 'Period 4', start: '11:10', end: '12:00', isNoonBreak: false },
  { code: 'Z', label: 'Period Z (Noon Break)', start: '12:10', end: '13:00', isNoonBreak: true },
  { code: '5', label: 'Period 5', start: '13:30', end: '14:20', isNoonBreak: false },
  { code: '6', label: 'Period 6', start: '14:30', end: '15:20', isNoonBreak: false },
  { code: '7', label: 'Period 7', start: '15:30', end: '16:20', isNoonBreak: false },
  { code: '8', label: 'Period 8', start: '16:30', end: '17:20', isNoonBreak: false },
  { code: '9', label: 'Period 9', start: '17:30', end: '18:20', isNoonBreak: false },
];

export const PERIOD_CODES: PeriodCode[] = PERIODS.map((p) => p.code);

/** Converts a 0-100 score (rounded to the nearest integer) to its grade-scale entry. */
export function scoreToGrade(score: number): GradeScaleEntry {
  const s = Math.min(100, Math.max(0, Math.round(score)));
  return GRADE_SCALE.find((g) => s >= g.minScore && s <= g.maxScore) ?? GRADE_SCALE[GRADE_SCALE.length - 1];
}

export function isPassing(score: number, level: ProgramLevel = 'Undergraduate'): boolean {
  return Math.round(score) >= PASSING_SCORE[level];
}

export interface GpaSummary {
  gpa: number; // 2-decimal, 0 when no credits attempted
  attemptedCredits: number;
  earnedCredits: number;
}

/** Credit-weighted GPA. Failed courses count toward attempted credits (and pull GPA down). */
export function computeGpa(records: GradeRecord[], level: ProgramLevel = 'Undergraduate'): GpaSummary {
  let points = 0;
  let attempted = 0;
  let earned = 0;
  for (const r of records) {
    attempted += r.credits;
    points += r.gradePoint * r.credits;
    if (isPassing(r.score, level)) earned += r.credits;
  }
  return {
    gpa: attempted === 0 ? 0 : Math.round((points / attempted) * 100) / 100,
    attemptedCredits: attempted,
    earnedCredits: earned,
  };
}

export function periodLabel(code: PeriodCode): string {
  return PERIODS.find((p) => p.code === code)?.label ?? `Period ${code}`;
}

/** "Mon: Period 3, 4" style summary, grouped by day. */
export function formatSlots(slots: TimetableSlot[]): string {
  const byDay = new Map<Weekday, PeriodCode[]>();
  for (const s of slots) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s.period]);
  return WEEKDAYS.filter((d) => byDay.has(d))
    .map((d) => {
      const codes = byDay
        .get(d)!
        .sort((a, b) => PERIOD_CODES.indexOf(a) - PERIOD_CODES.indexOf(b));
      return `${d}: Period ${codes.join(', ')}`;
    })
    .join('; ');
}

// ---------------------------------------------------------------------------
// Branding, profile options and date helpers
// ---------------------------------------------------------------------------

export const APP_NAME = 'NQU Academic Portal';

export const DEPARTMENTS: string[] = [
  'Applied English',
  'Applied Mathematics',
  'Business Administration',
  'Civil Engineering',
  'Computer Science',
  'Electrical Engineering',
  'Food Science',
  'Hospitality Management',
  'International Tourism',
];

export interface AcademicYearOption {
  value: string; // year level as a string: "1".."5"
  label: string; // "Year 1 / Freshman (2026-2027)"
}

/** Academic years start in August. Returns the starting calendar year of the current one. */
export function currentAcademicYearStart(now = new Date()): number {
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}

export function getAcademicYearOptions(now = new Date()): AcademicYearOption[] {
  const start = currentAcademicYearStart(now);
  const span = `${start}-${start + 1}`;
  const levels = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Extended'];
  return levels.map((name, i) => ({
    value: String(i + 1),
    label: i < 4 ? `Year ${i + 1} / ${name} (${span})` : `Year 5+ / Extended Study (${span})`,
  }));
}

/** Age in whole years for a YYYY-MM-DD date. Returns NaN for invalid input. */
export function calculateAge(dateOfBirth: string, now = new Date()): number {
  const dob = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return NaN;
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export const UNIVERSITY_NAME = 'National Quemoy University';

export const WEEKDAY_NAMES: Record<Weekday, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
};

export const COURSE_TYPES: CourseType[] = ['Required', 'Elective', 'General Education', 'Physical Education'];

// ---------------------------------------------------------------------------
// Transcript helpers
// ---------------------------------------------------------------------------

/** "2025 Fall" -> "Fall 2025". Unknown formats are returned unchanged. */
export function formatSemesterLabel(semester: string): string {
  const m = /^(\d{4})\s+(Spring|Summer|Fall)$/i.exec(semester.trim());
  return m ? `${m[2][0].toUpperCase()}${m[2].slice(1).toLowerCase()} ${m[1]}` : semester;
}

/** Chronological sort key: Spring < Summer < Fall within a calendar year. */
export function semesterSortKey(semester: string): number {
  const m = /^(\d{4})\s+(Spring|Summer|Fall)$/i.exec(semester.trim());
  if (!m) return Number.MAX_SAFE_INTEGER;
  const term = { spring: 1, summer: 2, fall: 3 }[m[2].toLowerCase() as 'spring' | 'summer' | 'fall'];
  return Number(m[1]) * 10 + term;
}

export interface SemesterGroup {
  semester: string; // "2025 Fall"
  label: string; // "Fall 2025"
  records: GradeRecord[];
  summary: GpaSummary;
}

export function groupGradesBySemester(records: GradeRecord[]): SemesterGroup[] {
  const bySemester = new Map<string, GradeRecord[]>();
  for (const r of records) bySemester.set(r.semester, [...(bySemester.get(r.semester) ?? []), r]);
  return Array.from(bySemester.entries())
    .sort((a, b) => semesterSortKey(a[0]) - semesterSortKey(b[0]))
    .map(([semester, recs]) => ({
      semester,
      label: formatSemesterLabel(semester),
      records: [...recs].sort((a, b) => a.courseCode.localeCompare(b.courseCode)),
      summary: computeGpa(recs),
    }));
}

export type StandingTone = 'excellent' | 'good' | 'warning' | 'none';

export interface AcademicStanding {
  label: string;
  tone: StandingTone;
  detail: string;
}

/**
 * Placeholder standing rules (adjust to the university's regulations):
 *  - Warning: more than half of the latest semester's credits failed, or cumulative GPA below 2.0.
 *  - Dean's List: latest semester GPA of 4.0+ with no failed course.
 *  - Otherwise: Good Standing.
 */
export function getAcademicStanding(groups: SemesterGroup[], cumulative: GpaSummary): AcademicStanding {
  if (groups.length === 0) {
    return { label: 'No Record', tone: 'none', detail: 'No grades have been posted yet.' };
  }
  const latest = groups[groups.length - 1];
  const failedCredits = latest.records.filter((r) => !isPassing(r.score)).reduce((n, r) => n + r.credits, 0);

  if (failedCredits * 2 > latest.summary.attemptedCredits) {
    return { label: 'Academic Warning', tone: 'warning', detail: 'More than half of the latest semester credits were failed.' };
  }
  if (cumulative.gpa < 2.0) {
    return { label: 'Academic Warning', tone: 'warning', detail: 'Cumulative GPA is below 2.0.' };
  }
  if (latest.summary.gpa >= 4.0 && failedCredits === 0) {
    return { label: "Dean's List", tone: 'excellent', detail: 'Latest semester GPA of 4.0 or above with no failed courses.' };
  }
  return { label: 'Good Standing', tone: 'good', detail: 'Cumulative GPA is 2.0 or above.' };
}

/** Local-time YYYY-MM-DD, suitable for <input type="date"> values. */
export function toDateInputValue(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Formats a date-only string (YYYY-MM-DD) without timezone shifting. */
export function formatDateOnly(value: string): string {
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
