/**
 * Domain models for the Academic Administration Portal.
 * All user-facing strings in this app are English only.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type Role = 'ADMIN' | 'STUDENT';

export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat';

/** Standard Taiwan period codes. "Z" is the noon-break period. */
export type PeriodCode = '1' | '2' | '3' | '4' | 'Z' | '5' | '6' | '7' | '8' | '9';

/** Taiwan 4.3 GPA letter grades. */
export type LetterGrade = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'F';

export type CourseType = 'Required' | 'Elective' | 'General Education' | 'Physical Education';

export type ProgramLevel = 'Undergraduate' | 'Graduate';

export type AnnouncementCategory = 'Academic' | 'General' | 'Urgent';

// ---------------------------------------------------------------------------
// Core entities
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string; // stored lower-cased
  fullName: string;
  role: Role;
  /** False until the student completes the first-login profile form. Admins are always true. */
  isProfileCompleted: boolean;
  createdAt: string; // ISO 8601
}

export interface StudentProfile {
  userId: string;
  studentId: string; // e.g. "NQU113001"
  fullName: string;
  department: string; // Department / Major
  yearLevel: number; // 1..6
  academicYear: string; // e.g. "Year 1 / Freshman (2026-2027)"
  dateOfBirth: string; // YYYY-MM-DD
  age: number; // derived from dateOfBirth at save time
  placeOfOrigin: string;
  nationality: string;
  address: string; // current living address
  /** Resized square JPEG as a base64 data URL, or null when no photo was uploaded. */
  photoDataUrl: string | null;
  emergencyContactName: string;
  emergencyContactPhone: string;
  completedAt: string; // ISO 8601
}

/** One weekly meeting slot: a single period on a single day. */
export interface TimetableSlot {
  day: Weekday;
  period: PeriodCode;
}

export interface Course {
  id: string;
  code: string; // e.g. "CSIE2203"
  title: string;
  description: string;
  credits: number;
  instructor: string;
  college: string;
  department: string;
  type: CourseType;
  capacity: number;
  /** Seats taken. Maintained by the database (trigger on enrollments), so every student sees it. */
  enrolledCount: number;
  classroom: string;
  semester: string; // e.g. "2026 Fall"
  /** One entry per weekly period (a 3-credit course typically has 3 slots). */
  slots: TimetableSlot[];
  createdAt: string;
}

export interface Enrollment {
  id: string;
  userId: string;
  courseId: string;
  semester: string;
  enrolledAt: string;
}

/** Self-contained snapshot so transcripts survive course catalogue changes. */
export interface GradeRecord {
  id: string;
  userId: string;
  semester: string;
  courseCode: string;
  courseTitle: string;
  credits: number;
  score: number; // 0..100
  letterGrade: LetterGrade;
  gradePoint: number; // 0.0..4.3
  recordedAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  pinned: boolean;
  authorId: string;
  authorName: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Reference-data shapes
// ---------------------------------------------------------------------------

export interface PeriodDefinition {
  code: PeriodCode;
  label: string; // "Period 1", "Period Z (Noon Break)"
  start: string; // "08:10"
  end: string; // "09:00"
  isNoonBreak: boolean;
}

export interface GradeScaleEntry {
  letter: LetterGrade;
  minScore: number;
  maxScore: number;
  gradePoint: number;
}

// ---------------------------------------------------------------------------
// Derived / view models
// ---------------------------------------------------------------------------

/** A course placed on a specific cell of the weekly timetable grid. */
export interface TimetableEntry extends TimetableSlot {
  course: Course;
}

export interface RegisteredStudentRow {
  user: User;
  profile: StudentProfile | null;
  enrolledCredits: number;
}

// ---------------------------------------------------------------------------
// Form inputs
// ---------------------------------------------------------------------------

export type StudentProfileInput = Omit<StudentProfile, 'userId' | 'completedAt'>;

export type NewCourseInput = Omit<Course, 'id' | 'semester' | 'createdAt' | 'enrolledCount'>;

export type NewAnnouncementInput = Pick<Announcement, 'title' | 'content' | 'category' | 'pinned'> & {
  /** Publication date (YYYY-MM-DD). Defaults to now. */
  date?: string;
  /** Free-text "Posted by" label. Falls back to the admin's account name when blank. */
  authorName?: string;
};

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
}

// ---------------------------------------------------------------------------
// Store action results (no thrown errors; UI renders `message` directly)
// ---------------------------------------------------------------------------

export type ActionErrorCode =
  | 'VALIDATION'
  | 'NOT_AUTHENTICATED'
  | 'NOT_AUTHORIZED'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_TAKEN'
  | 'PROFILE_INCOMPLETE'
  | 'COURSE_NOT_FOUND'
  | 'ALREADY_ENROLLED'
  | 'NOT_ENROLLED'
  | 'COURSE_FULL'
  | 'CREDIT_LIMIT'
  | 'TIME_CONFLICT'
  | 'DUPLICATE'
  | 'EMAIL_NOT_CONFIRMED'
  | 'NOT_CONFIGURED'
  | 'NETWORK';

export interface ActionSuccess<T = void> {
  ok: true;
  data?: T;
}

export interface ActionFailure {
  ok: false;
  code: ActionErrorCode;
  message: string;
  /** Present for TIME_CONFLICT: the already-enrolled course that clashes. */
  conflictWith?: Course;
}

export type ActionResult<T = void> = ActionSuccess<T> | ActionFailure;
