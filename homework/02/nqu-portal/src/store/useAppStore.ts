import type { RealtimePostgresChangesPayload, Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import {
  ADMIN_EMAIL,
  MAX_CREDITS_PER_SEMESTER,
  PERIOD_CODES,
  WEEKDAYS,
  calculateAge,
  formatSlots,
  scoreToGrade,
  toDateInputValue,
} from '../lib/academic';
import {
  toAnnouncement,
  toCourse,
  toEnrollment,
  toStudentProfile,
  toUser,
  type AnnouncementRow,
  type CourseRow,
  type EnrollmentRow,
  type ProfileRow,
} from '../lib/mappers';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import { isValidEmail, validateProfileFields } from '../lib/validation';
import type {
  ActionErrorCode,
  ActionFailure,
  ActionResult,
  ActionSuccess,
  Announcement,
  Course,
  Enrollment,
  GradeRecord,
  NewAnnouncementInput,
  NewCourseInput,
  RegisterInput,
  RegisteredStudentRow,
  Role,
  StudentProfile,
  StudentProfileInput,
  TimetableEntry,
  TimetableSlot,
  User,
} from '../types';

// ===========================================================================
// Architecture
//
// Supabase is the source of truth for: announcements, courses, enrollments, profiles and auth.
// This Zustand store is the in-memory cache that every page already reads from. It is filled by
//   1. an initial fetch (refresh* actions), and
//   2. Supabase Realtime events (apply*Change actions), wired up in src/hooks/*.
// Mutating actions write to Supabase first and update the cache from the returned row, so the
// UI never shows something the database rejected. Row Level Security is the real authority; the
// checks here only give instant, friendly error messages.
//
// Offline behaviour: the last announcements/courses fetched are cached in localStorage and shown
// (read-only) with a sync error banner if the network is down. Writes fail with a clear message.
// Grades are not part of the Supabase schema yet, so they stay in this browser's localStorage.
// ===========================================================================

const CURRENT_SEMESTER = '2026 Fall';

const CACHE_KEYS = {
  announcements: 'nqu-cache-announcements-v1',
  courses: 'nqu-cache-courses-v1',
} as const;

// Grades live in the browser, isolated PER ACCOUNT so two students on one device never see each other's.
const gradesKey = (userId: string) => `grades_${userId}`;

// Legacy mock-database keys (previous localStorage-only version of the portal).
const LEGACY_KEYS = {
  local: ['nqu-portal-store-v1', 'nqu-portal-grades-v1'],
  session: ['nqu-portal-session-v1'],
};
const LEGACY_NOTICE_KEY = 'nqu-legacy-notice-pending';

/**
 * Detects the old mock data, purges it, and leaves a flag so the "system upgraded" banner is shown
 * until the user dismisses it (even across reloads). Runs once when the store is created.
 */
function purgeLegacyData(): boolean {
  try {
    const found =
      LEGACY_KEYS.local.some((k) => localStorage.getItem(k) !== null) ||
      LEGACY_KEYS.session.some((k) => sessionStorage.getItem(k) !== null);
    if (found) {
      LEGACY_KEYS.local.forEach((k) => localStorage.removeItem(k));
      LEGACY_KEYS.session.forEach((k) => sessionStorage.removeItem(k));
      localStorage.setItem(LEGACY_NOTICE_KEY, '1');
    }
    return localStorage.getItem(LEGACY_NOTICE_KEY) !== null;
  } catch {
    return false;
  }
}

const nowIso = () => new Date().toISOString();
const normEmail = (e: string) => e.trim().toLowerCase();
const slotKey = (s: TimetableSlot) => `${s.day}:${s.period}`;

const uid = (prefix: string): string => {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${rand}`;
};

const ok = <T = undefined>(data?: T): ActionSuccess<T> => ({ ok: true, data });

const fail = (code: ActionErrorCode, message: string, conflictWith?: Course): ActionFailure => ({
  ok: false,
  code,
  message,
  conflictWith,
});

function readCache<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeCache(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable: caching is best-effort */
  }
}

const NOT_CONFIGURED_MESSAGE =
  'The portal is not connected to Supabase yet. Set VITE_SUPABASE_URL (see .env.example) and rebuild.';

const notConfigured = (): ActionFailure => fail('NOT_CONFIGURED', NOT_CONFIGURED_MESSAGE);

interface DbError {
  message: string;
  code?: string;
}

/**
 * Converts a Supabase / Postgres error into the app's ActionFailure.
 * Server-side rules (see supabase/schema.sql) raise errors shaped "CODE|friendly message".
 */
function fromDbError(err: DbError, fallback: ActionErrorCode = 'NETWORK'): ActionFailure {
  const tagged = /^([A-Z_]+)\|([\s\S]+)$/.exec(err.message);
  if (tagged) return fail(tagged[1] as ActionErrorCode, tagged[2]);
  if (err.code === '23505') return fail('DUPLICATE', 'That value is already in use.');
  if (err.code === '42501') return fail('NOT_AUTHORIZED', 'You do not have permission to do that.');
  if (/failed to fetch|networkerror|network request failed/i.test(err.message)) {
    return fail('NETWORK', 'Could not reach the server. Check your connection and try again.');
  }
  return fail(fallback, err.message);
}

// ===========================================================================
// Reference data
// ===========================================================================

/** Past-semester results used by loadDemoTranscript() so the transcript page has content to show. */
const DEMO_GRADES: Array<Pick<GradeRecord, 'semester' | 'courseCode' | 'courseTitle' | 'credits' | 'score'>> = [
  { semester: '2025 Fall', courseCode: 'CSIE1001', courseTitle: 'Programming Fundamentals', credits: 3, score: 94 },
  { semester: '2025 Fall', courseCode: 'MATH1001', courseTitle: 'Pre-Calculus', credits: 3, score: 88 },
  { semester: '2025 Fall', courseCode: 'ENG1001', courseTitle: 'Freshman English I', credits: 2, score: 91 },
  { semester: '2025 Fall', courseCode: 'GE1002', courseTitle: 'Introduction to Sociology', credits: 2, score: 82 },
  { semester: '2025 Fall', courseCode: 'PE1001', courseTitle: 'Physical Education (Fundamentals)', credits: 1, score: 86 },
  { semester: '2026 Spring', courseCode: 'CSIE1002', courseTitle: 'Object-Oriented Programming', credits: 3, score: 79 },
  { semester: '2026 Spring', courseCode: 'MATH1002', courseTitle: 'Discrete Mathematics', credits: 3, score: 76 },
  { semester: '2026 Spring', courseCode: 'ENG1002', courseTitle: 'Freshman English II', credits: 2, score: 85 },
  { semester: '2026 Spring', courseCode: 'GE1003', courseTitle: 'World History', credits: 2, score: 68 },
  { semester: '2026 Spring', courseCode: 'BA1001', courseTitle: 'Introduction to Economics', credits: 3, score: 58 },
];

// ===========================================================================
// State shape
// ===========================================================================

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface DataSlice {
  users: User[];
  profiles: Record<string, StudentProfile>;
  courses: Course[];
  enrollments: Enrollment[];
  grades: GradeRecord[];
  announcements: Announcement[];
  currentUserId: string | null;
  currentSemester: string;
  /** True while the "system upgraded to cloud database" banner should be visible. */
  legacyNotice: boolean;
  /** False until Supabase has told us whether a saved session exists (prevents a login-page flash). */
  authReady: boolean;
  status: { announcements: LoadStatus; courses: LoadStatus; enrollments: LoadStatus; profiles: LoadStatus };
  /** Latest sync problem (network/RLS). Shown by <SyncBanner />. */
  syncError: string | null;
}

type AuthData = { role: Role; isProfileCompleted: boolean; needsEmailConfirmation?: boolean };

type Change<Row extends { [key: string]: any }> = RealtimePostgresChangesPayload<Row>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface AppState extends DataSlice {
  // Authentication & session
  initAuth: () => () => void;
  dismissLegacyNotice: () => void;
  register: (input: RegisterInput) => Promise<ActionResult<AuthData>>;
  login: (email: string, password: string) => Promise<ActionResult<AuthData>>;
  logout: () => Promise<void>;

  // Profile
  completeProfile: (input: StudentProfileInput) => Promise<ActionResult>;

  // Student: course selection
  selectCourse: (courseId: string) => Promise<ActionResult<Course>>;
  dropCourse: (courseId: string) => Promise<ActionResult>;

  // Student: transcript (demo data loader, local only)
  loadDemoTranscript: () => ActionResult;

  // Admin
  createCourse: (input: NewCourseInput) => Promise<ActionResult<Course>>;
  updateCourse: (courseId: string, input: NewCourseInput) => Promise<ActionResult<Course>>;
  deleteCourse: (courseId: string) => Promise<ActionResult>;
  postAnnouncement: (input: NewAnnouncementInput) => Promise<ActionResult<Announcement>>;
  updateAnnouncement: (announcementId: string, input: NewAnnouncementInput) => Promise<ActionResult<Announcement>>;
  deleteAnnouncement: (announcementId: string) => Promise<ActionResult>;

  // Data sync (called by the hooks in src/hooks)
  refreshAnnouncements: () => Promise<void>;
  refreshCourses: () => Promise<void>;
  refreshEnrollments: () => Promise<void>;
  refreshProfiles: () => Promise<void>;
  applyAnnouncementChange: (change: Change<AnnouncementRow>) => void;
  applyCourseChange: (change: Change<CourseRow>) => void;
  applyEnrollmentChange: (change: Change<EnrollmentRow>) => void;
  applyProfileChange: (change: Change<ProfileRow>) => void;
  setSyncError: (message: string | null) => void;
}

const sortAnnouncements = (list: Announcement[]) =>
  [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/** Insert-or-replace by id (idempotent, so duplicate realtime + fetch results never double up). */
function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((i) => i.id === item.id) ? list.map((i) => (i.id === item.id ? item : i)) : [...list, item];
}

/** DELETE events carry only the primary key (Postgres default replica identity). */
function deletedId(change: Change<any>): string | null { // eslint-disable-line @typescript-eslint/no-explicit-any
  const old = change.old as { id?: string } | undefined;
  return old?.id ?? null;
}

const initialState = (): DataSlice => ({
  users: [],
  profiles: {},
  courses: readCache<Course[]>(CACHE_KEYS.courses, []),
  enrollments: [],
  grades: [], // loaded per account after sign-in (see hydrateSession)
  announcements: readCache<Announcement[]>(CACHE_KEYS.announcements, []),
  currentUserId: null,
  currentSemester: CURRENT_SEMESTER,
  legacyNotice: purgeLegacyData(),
  authReady: !isSupabaseConfigured, // nothing to wait for when Supabase is not configured
  status: { announcements: 'idle', courses: 'idle', enrollments: 'idle', profiles: 'idle' },
  syncError: null,
});

// ===========================================================================
// Pure selectors / derivations (usable inside or outside React)
//
// Tip: functions that return NEW arrays (getEnrolledCourses, buildTimetable,
// getRegisteredStudents) should be called inside useMemo, not directly inside a
// useAppStore(selector) call, to avoid needless re-renders.
// ===========================================================================

type DataState = Pick<DataSlice, 'courses' | 'enrollments' | 'currentSemester'>;

export const selectCurrentUser = (s: DataSlice): User | null =>
  s.users.find((u) => u.id === s.currentUserId) ?? null;

export const selectCurrentProfile = (s: DataSlice): StudentProfile | null =>
  s.currentUserId ? s.profiles[s.currentUserId] ?? null : null;

export function getEnrolledCourses(state: DataState, userId: string): Course[] {
  const ids = new Set(
    state.enrollments
      .filter((e) => e.userId === userId && e.semester === state.currentSemester)
      .map((e) => e.courseId),
  );
  return state.courses.filter((c) => ids.has(c.id));
}

export const sumCredits = (courses: Course[]): number => courses.reduce((n, c) => n + c.credits, 0);

export const getEnrolledCredits = (state: DataState, userId: string): number =>
  sumCredits(getEnrolledCourses(state, userId));

/** Flattens courses into one entry per (day, period) cell for rendering the weekly grid. */
export function buildTimetable(courses: Course[]): TimetableEntry[] {
  return courses.flatMap((course) => course.slots.map((slot) => ({ ...slot, course })));
}

export function getRegisteredStudents(
  state: Pick<DataSlice, 'users' | 'profiles' | 'courses' | 'enrollments' | 'currentSemester'>,
): RegisteredStudentRow[] {
  return state.users
    .filter((u) => u.role === 'STUDENT')
    .map((user) => ({
      user,
      profile: state.profiles[user.id] ?? null,
      enrolledCredits: getEnrolledCredits(state, user.id),
    }))
    .sort((a, b) => b.user.createdAt.localeCompare(a.user.createdAt));
}

/** Returns the first already-enrolled course that shares at least one (day, period) with `candidate`. */
export function findTimeConflict(
  candidate: Course,
  enrolled: Course[],
): { course: Course; slots: TimetableSlot[] } | null {
  const wanted = new Set(candidate.slots.map(slotKey));
  for (const other of enrolled) {
    const overlap = other.slots.filter((s) => wanted.has(slotKey(s)));
    if (overlap.length > 0) return { course: other, slots: overlap };
  }
  return null;
}

// ===========================================================================
// Guards & validators
// ===========================================================================

function requireRole(state: DataSlice, role: Role): ActionFailure | null {
  if (!isSupabaseConfigured) return notConfigured();
  const user = selectCurrentUser(state);
  if (!user) return fail('NOT_AUTHENTICATED', 'Please sign in to continue.');
  if (user.role !== role) {
    return fail('NOT_AUTHORIZED', role === 'ADMIN' ? 'Administrator access is required.' : 'This action is for students only.');
  }
  return null;
}

function validateCourse(input: NewCourseInput): string | null {
  const text: Array<[string, string]> = [
    [input.code, 'Course code'], [input.title, 'Course title'], [input.instructor, 'Instructor'],
    [input.college, 'College'], [input.department, 'Department'], [input.classroom, 'Classroom'],
  ];
  for (const [value, label] of text) if (value.trim() === '') return `${label} is required.`;
  if (!Number.isInteger(input.credits) || input.credits < 1 || input.credits > 6) return 'Credits must be a whole number from 1 to 6.';
  if (!Number.isInteger(input.capacity) || input.capacity < 1) return 'Capacity must be at least 1.';
  if (input.slots.length === 0) return 'At least one timetable slot is required.';
  const seen = new Set<string>();
  for (const s of input.slots) {
    if (!WEEKDAYS.includes(s.day) || !PERIOD_CODES.includes(s.period)) return 'One or more timetable slots are invalid.';
    if (seen.has(slotKey(s))) return 'Duplicate timetable slots are not allowed.';
    seen.add(slotKey(s));
  }
  return null;
}

/**
 * Catalog rules shared by createCourse and updateCourse: field validation, unique course code,
 * and classroom / instructor double-booking. `ignoreId` excludes the course currently being edited.
 */
function checkCourseRules(state: DataSlice, input: NewCourseInput, ignoreId?: string): ActionFailure | null {
  const problem = validateCourse(input);
  if (problem) return fail('VALIDATION', problem);

  const code = input.code.trim().toUpperCase();
  const others = state.courses.filter((c) => c.semester === state.currentSemester && c.id !== ignoreId);
  if (others.some((c) => c.code === code)) {
    return fail('DUPLICATE', `A course with code ${code} already exists this semester.`);
  }

  const wanted = new Set(input.slots.map(slotKey));
  const room = input.classroom.trim().toLowerCase();
  const teacher = input.instructor.trim().toLowerCase();
  for (const other of others) {
    const overlap = other.slots.filter((sl) => wanted.has(slotKey(sl)));
    if (overlap.length === 0) continue;
    if (other.classroom.trim().toLowerCase() === room) {
      return fail('TIME_CONFLICT', `Classroom "${other.classroom}" is already booked by ${other.code} on ${formatSlots(overlap)}.`, other);
    }
    if (other.instructor.trim().toLowerCase() === teacher) {
      return fail('TIME_CONFLICT', `${other.instructor} is already teaching ${other.code} on ${formatSlots(overlap)}.`, other);
    }
  }
  return null;
}

const courseToRow = (input: NewCourseInput, semester: string) => ({
  course_code: input.code.trim().toUpperCase(),
  title: input.title.trim(),
  description: input.description.trim() || 'No description provided.',
  instructor: input.instructor.trim(),
  college: input.college.trim(),
  department: input.department.trim(),
  type: input.type,
  credits: input.credits,
  classroom: input.classroom.trim(),
  capacity: input.capacity,
  semester,
  slots: input.slots,
});

// ===========================================================================
// Store
// ===========================================================================

// Latest-wins token so a slow profile fetch from an older session can never overwrite a newer one.
let hydrateToken = 0;

export const useAppStore = create<AppState>()((set, get) => {
  /** Loads everything that depends on WHO is signed in (profile, directory for admin, enrollments). */
  async function hydrateSession(session: Session | null): Promise<void> {
    const token = ++hydrateToken;

    if (!session) {
      set({ currentUserId: null, users: [], profiles: {}, enrollments: [], grades: [], authReady: true });
      return;
    }

    const { data: me, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    if (token !== hydrateToken) return;

    if (error || !me) {
      set({
        currentUserId: null,
        users: [],
        profiles: {},
        enrollments: [],
        authReady: true,
        syncError: error
          ? fromDbError(error).message
          : 'Your account has no profile row. Make sure supabase/schema.sql was run, then sign in again.',
      });
      return;
    }

    const meRow = me as ProfileRow;
    const isAdmin = meRow.role === 'ADMIN' && normEmail(meRow.email) === ADMIN_EMAIL;
    set({
      currentUserId: meRow.id,
      users: [toUser(meRow)],
      profiles: (() => {
        const p = toStudentProfile(meRow);
        return p ? { [meRow.id]: p } : {};
      })(),
      // Switching accounts (e.g. another tab signed in as someone else): never show the previous user's data.
      enrollments: get().currentUserId === meRow.id ? get().enrollments : [],
      grades: readCache<GradeRecord[]>(gradesKey(meRow.id), []),
      authReady: true,
      syncError: null,
    });

    // Enrollments (RLS: students get their own rows, the admin gets all of them) and, for the admin, every profile.
    await Promise.all([get().refreshEnrollments(), isAdmin ? get().refreshProfiles() : Promise.resolve()]);
  }

  return {
    ...initialState(),

    // ----------------------------- Auth -------------------------------
    initAuth: () => {
      if (!isSupabaseConfigured) {
        set({ authReady: true });
        return () => undefined;
      }

      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        // Never await Supabase calls inside this callback (it can deadlock the auth lock): defer.
        // Fires in EVERY open tab when any tab signs in, signs out or switches account.
        if (event === 'TOKEN_REFRESHED') return;
        if (event === 'SIGNED_IN' && session && session.user.id === get().currentUserId) return;
        setTimeout(() => void hydrateSession(session), 0);
      });
      return () => data.subscription.unsubscribe();
    },

    dismissLegacyNotice: () => {
      try {
        localStorage.removeItem(LEGACY_NOTICE_KEY);
      } catch {
        /* ignore */
      }
      set({ legacyNotice: false });
    },

    register: async ({ email, password, fullName }) => {
      if (!isSupabaseConfigured) return notConfigured();
      const cleanEmail = normEmail(email);
      const cleanName = fullName.trim();
      if (!isValidEmail(cleanEmail)) return fail('VALIDATION', 'Please enter a valid email address.');
      if (cleanName.length < 2) return fail('VALIDATION', 'Please enter your full name.');
      if (password.length < 8) return fail('VALIDATION', 'Password must be at least 8 characters.');

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { data: { full_name: cleanName } },
      });
      if (error) {
        if (/already|registered/i.test(error.message)) return fail('EMAIL_TAKEN', 'An account with this email already exists.');
        return fromDbError(error, 'VALIDATION');
      }
      // With "Confirm email" enabled Supabase hides duplicates by returning a user with no identities.
      if (data.user && (data.user.identities?.length ?? 1) === 0) {
        return fail('EMAIL_TAKEN', 'An account with this email already exists.');
      }

      // The reserved admin email is assigned ADMIN by the database trigger; everyone else is a STUDENT.
      const role: Role = cleanEmail === ADMIN_EMAIL ? 'ADMIN' : 'STUDENT';
      if (!data.session) {
        // "Confirm email" is ON: the user must click the link in their inbox before signing in.
        return ok<AuthData>({ role, isProfileCompleted: role === 'ADMIN', needsEmailConfirmation: true });
      }
      await hydrateSession(data.session);
      const me = selectCurrentUser(get());
      if (!me) return fail('NETWORK', get().syncError ?? 'Your account was created, but your profile could not be loaded.');
      return ok<AuthData>({ role: me.role, isProfileCompleted: me.isProfileCompleted });
    },

    login: async (email, password) => {
      if (!isSupabaseConfigured) return notConfigured();
      const { data, error } = await supabase.auth.signInWithPassword({ email: normEmail(email), password });
      if (error || !data.session) {
        if (error && /confirm/i.test(error.message)) {
          return fail('EMAIL_NOT_CONFIRMED', 'Please confirm your email address using the link we sent you, then sign in.');
        }
        if (error && /failed to fetch|network/i.test(error.message)) return fromDbError(error);
        return fail('INVALID_CREDENTIALS', 'Incorrect email or password.');
      }
      await hydrateSession(data.session);
      const me = selectCurrentUser(get());
      if (!me) return fail('NETWORK', get().syncError ?? 'Signed in, but your profile could not be loaded.');
      return ok<AuthData>({ role: me.role, isProfileCompleted: me.isProfileCompleted });
    },

    logout: async () => {
      hydrateToken += 1;
      set({ currentUserId: null, users: [], profiles: {}, enrollments: [], grades: [] });
      if (isSupabaseConfigured) await supabase.auth.signOut();
    },

    // ---------------------------- Profile -----------------------------
    completeProfile: async (input) => {
      const state = get();
      const denied = requireRole(state, 'STUDENT');
      if (denied) return denied;
      const user = selectCurrentUser(state)!;

      const firstProblem = Object.values(validateProfileFields(input))[0];
      if (firstProblem) return fail('VALIDATION', firstProblem);

      const { data, error } = await supabase
        .from('profiles')
        .update({
          full_name: input.fullName.trim(),
          student_id: input.studentId.trim().toUpperCase(),
          department: input.department,
          academic_year: input.academicYear,
          year_level: input.yearLevel,
          age: calculateAge(input.dateOfBirth),
          origin: input.placeOfOrigin.trim(),
          nationality: input.nationality.trim(),
          address: input.address.trim(),
          photo_url: input.photoDataUrl || null,
          date_of_birth: input.dateOfBirth,
          emergency_contact: input.emergencyContactName.trim(),
          emergency_phone: input.emergencyContactPhone.trim(),
          is_profile_completed: true,
        })
        .eq('id', user.id)
        .select()
        .maybeSingle();

      if (error) {
        const f = fromDbError(error);
        return f.code === 'DUPLICATE' ? fail('DUPLICATE', 'This Student ID is already registered to another account.') : f;
      }
      if (!data) return fail('NOT_AUTHORIZED', 'Your profile could not be saved.');

      const row = data as ProfileRow;
      const profile = toStudentProfile(row);
      set((s) => ({
        users: s.users.map((u) => (u.id === row.id ? toUser(row) : u)),
        profiles: profile ? { ...s.profiles, [row.id]: profile } : s.profiles,
      }));
      return ok();
    },

    // ------------------------ Course selection ------------------------
    selectCourse: async (courseId) => {
      const state = get();
      const denied = requireRole(state, 'STUDENT');
      if (denied) return denied;
      const user = selectCurrentUser(state)!;

      if (!user.isProfileCompleted) {
        return fail('PROFILE_INCOMPLETE', 'Please complete your student profile before selecting courses.');
      }
      const course = state.courses.find((c) => c.id === courseId && c.semester === state.currentSemester);
      if (!course) return fail('COURSE_NOT_FOUND', 'This course is not available for the current semester.');

      const enrolled = getEnrolledCourses(state, user.id);
      if (enrolled.some((c) => c.id === course.id)) {
        return fail('ALREADY_ENROLLED', `You are already enrolled in ${course.code}.`);
      }
      if (course.enrolledCount >= course.capacity) {
        return fail('COURSE_FULL', `${course.code} has reached its capacity of ${course.capacity} students.`);
      }

      // Fast client-side checks (the database trigger enforces the same rules authoritatively).
      const currentCredits = sumCredits(enrolled);
      const projected = currentCredits + course.credits;
      if (projected > MAX_CREDITS_PER_SEMESTER) {
        return fail(
          'CREDIT_LIMIT',
          `Cannot add ${course.code} (${course.credits} credits). You have ${currentCredits} credits; adding it would bring you to ${projected}, above the ${MAX_CREDITS_PER_SEMESTER}-credit maximum.`,
        );
      }
      const conflict = findTimeConflict(course, enrolled);
      if (conflict) {
        return fail(
          'TIME_CONFLICT',
          `${course.code} conflicts with ${conflict.course.code} (${conflict.course.title}) on ${formatSlots(conflict.slots)}.`,
          conflict.course,
        );
      }

      const { data, error } = await supabase
        .from('enrollments')
        .insert({ student_id: user.id, course_id: course.id })
        .select()
        .single();
      if (error) {
        if (error.code === '23505') return fail('ALREADY_ENROLLED', `You are already enrolled in ${course.code}.`);
        // Someone else may have taken the last seat: pull fresh seat counts before showing the message.
        void get().refreshCourses();
        return fromDbError(error);
      }

      set((s) => ({ enrollments: upsertById(s.enrollments, toEnrollment(data as EnrollmentRow)) }));
      void get().refreshCourses(); // seat counter is maintained by the database
      return ok(course);
    },

    dropCourse: async (courseId) => {
      const state = get();
      const denied = requireRole(state, 'STUDENT');
      if (denied) return denied;
      const user = selectCurrentUser(state)!;

      const exists = state.enrollments.some(
        (e) => e.userId === user.id && e.courseId === courseId && e.semester === state.currentSemester,
      );
      if (!exists) return fail('NOT_ENROLLED', 'You are not enrolled in this course.');

      const { data, error } = await supabase
        .from('enrollments')
        .delete()
        .eq('student_id', user.id)
        .eq('course_id', courseId)
        .select();
      if (error) return fromDbError(error);
      if (!data || data.length === 0) return fail('NOT_ENROLLED', 'You are not enrolled in this course.');

      set((s) => ({
        enrollments: s.enrollments.filter((e) => !(e.userId === user.id && e.courseId === courseId)),
      }));
      void get().refreshCourses();
      return ok();
    },

    // --------------------------- Transcript ---------------------------
    loadDemoTranscript: () => {
      const state = get();
      const denied = requireRole(state, 'STUDENT');
      if (denied) return denied;
      const user = selectCurrentUser(state)!;
      if (state.grades.some((g) => g.userId === user.id)) {
        return fail('DUPLICATE', 'Sample grades have already been loaded for this account.');
      }
      const recordedAt = nowIso();
      const records: GradeRecord[] = DEMO_GRADES.map((g) => {
        const grade = scoreToGrade(g.score);
        return {
          ...g,
          id: uid('grade'),
          userId: user.id,
          letterGrade: grade.letter,
          gradePoint: grade.gradePoint,
          recordedAt,
        };
      });
      set((s) => ({ grades: [...s.grades, ...records] }));
      return ok();
    },

    // ----------------------------- Admin ------------------------------
    createCourse: async (input) => {
      const state = get();
      const denied = requireRole(state, 'ADMIN');
      if (denied) return denied;

      const rule = checkCourseRules(state, input);
      if (rule) return rule;

      const { data, error } = await supabase
        .from('courses')
        .insert(courseToRow(input, state.currentSemester))
        .select()
        .single();
      if (error) return fromDbError(error);

      const course = toCourse(data as CourseRow);
      set((s) => ({ courses: upsertById(s.courses, course) }));
      return ok(course);
    },

    updateCourse: async (courseId, input) => {
      const state = get();
      const denied = requireRole(state, 'ADMIN');
      if (denied) return denied;
      const existing = state.courses.find((c) => c.id === courseId);
      if (!existing) return fail('COURSE_NOT_FOUND', 'This course no longer exists.');

      const rule = checkCourseRules(state, input, courseId);
      if (rule) return rule;

      const enrolledUserIds = state.enrollments.filter((e) => e.courseId === courseId).map((e) => e.userId);
      const taken = Math.max(enrolledUserIds.length, existing.enrolledCount);
      if (input.capacity < taken) {
        return fail('VALIDATION', `Capacity cannot be lower than the ${taken} student(s) already enrolled.`);
      }

      const preview: Course = { ...existing, ...input, code: input.code.trim().toUpperCase() };
      // Students already enrolled must stay valid under the new schedule and credit value.
      for (const userId of enrolledUserIds) {
        const others = getEnrolledCourses(state, userId).filter((c) => c.id !== courseId);
        if (sumCredits(others) + preview.credits > MAX_CREDITS_PER_SEMESTER) {
          return fail('CREDIT_LIMIT', `This change would push an enrolled student above the ${MAX_CREDITS_PER_SEMESTER}-credit maximum.`);
        }
        const conflict = findTimeConflict(preview, others);
        if (conflict) {
          return fail(
            'TIME_CONFLICT',
            `The new schedule would clash with ${conflict.course.code} on ${formatSlots(conflict.slots)} for an enrolled student. Choose different periods, or ask the student to drop one of the courses first.`,
            conflict.course,
          );
        }
      }

      const { data, error } = await supabase
        .from('courses')
        .update(courseToRow(input, existing.semester))
        .eq('id', courseId)
        .select()
        .maybeSingle();
      if (error) return fromDbError(error);
      if (!data) return fail('NOT_AUTHORIZED', 'The course could not be updated. Are you signed in as the administrator?');

      const updated = toCourse(data as CourseRow);
      set((s) => ({ courses: upsertById(s.courses, updated) }));
      return ok(updated);
    },

    deleteCourse: async (courseId) => {
      const denied = requireRole(get(), 'ADMIN');
      if (denied) return denied;
      if (!get().courses.some((c) => c.id === courseId)) return fail('COURSE_NOT_FOUND', 'Course not found.');

      const { data, error } = await supabase.from('courses').delete().eq('id', courseId).select('id');
      if (error) return fromDbError(error);
      if (!data || data.length === 0) return fail('NOT_AUTHORIZED', 'The course could not be deleted.');

      // The database cascades to enrollments; mirror that in the cache.
      set((s) => ({
        courses: s.courses.filter((c) => c.id !== courseId),
        enrollments: s.enrollments.filter((e) => e.courseId !== courseId),
      }));
      return ok();
    },

    postAnnouncement: async (input) => {
      const state = get();
      const denied = requireRole(state, 'ADMIN');
      if (denied) return denied;
      const admin = selectCurrentUser(state)!;

      const title = input.title.trim();
      const content = input.content.trim();
      if (title.length < 3) return fail('VALIDATION', 'Title must be at least 3 characters.');
      if (content.length < 10) return fail('VALIDATION', 'Message must be at least 10 characters.');
      if ((input.authorName ?? '').trim().length > 80) return fail('VALIDATION', 'The "Posted by" name must be 80 characters or fewer.');

      let createdAt = nowIso();
      if (input.date) {
        const published = new Date(`${input.date}T09:00:00`);
        if (Number.isNaN(published.getTime())) return fail('VALIDATION', 'Please enter a valid publication date.');
        createdAt = published.toISOString();
      }

      const { data, error } = await supabase
        .from('announcements')
        .insert({
          title,
          content,
          category: input.category,
          pinned: input.pinned,
          author_name: input.authorName?.trim() || admin.fullName,
          created_by: admin.id,
          created_at: createdAt,
        })
        .select()
        .single();
      if (error) return fromDbError(error);

      const announcement = toAnnouncement(data as AnnouncementRow);
      set((s) => ({ announcements: sortAnnouncements(upsertById(s.announcements, announcement)) }));
      return ok(announcement);
    },

    updateAnnouncement: async (announcementId, input) => {
      const state = get();
      const denied = requireRole(state, 'ADMIN');
      if (denied) return denied;
      const existing = state.announcements.find((a) => a.id === announcementId);
      if (!existing) return fail('VALIDATION', 'This announcement no longer exists.');

      const title = input.title.trim();
      const content = input.content.trim();
      if (title.length < 3) return fail('VALIDATION', 'Title must be at least 3 characters.');
      if (content.length < 10) return fail('VALIDATION', 'Message must be at least 10 characters.');
      if ((input.authorName ?? '').trim().length > 80) return fail('VALIDATION', 'The "Posted by" name must be 80 characters or fewer.');

      // Only touch the timestamp when the admin actually picked a different date.
      let createdAt = existing.createdAt;
      if (input.date && input.date !== toDateInputValue(new Date(existing.createdAt))) {
        const published = new Date(`${input.date}T09:00:00`);
        if (Number.isNaN(published.getTime())) return fail('VALIDATION', 'Please enter a valid publication date.');
        createdAt = published.toISOString();
      }

      const { data, error } = await supabase
        .from('announcements')
        .update({
          title,
          content,
          category: input.category,
          pinned: input.pinned,
          author_name: input.authorName?.trim() || existing.authorName,
          created_at: createdAt,
        })
        .eq('id', announcementId)
        .select()
        .maybeSingle();
      if (error) return fromDbError(error);
      if (!data) return fail('NOT_AUTHORIZED', 'The announcement could not be updated. Are you signed in as the administrator?');

      const updated = toAnnouncement(data as AnnouncementRow);
      set((s) => ({ announcements: sortAnnouncements(upsertById(s.announcements, updated)) }));
      return ok(updated);
    },

    deleteAnnouncement: async (announcementId) => {
      const denied = requireRole(get(), 'ADMIN');
      if (denied) return denied;
      const { data, error } = await supabase.from('announcements').delete().eq('id', announcementId).select('id');
      if (error) return fromDbError(error);
      if (!data || data.length === 0) return fail('NOT_AUTHORIZED', 'The announcement could not be deleted.');
      set((s) => ({ announcements: s.announcements.filter((a) => a.id !== announcementId) }));
      return ok();
    },

    // ------------------------- Data sync (fetch) -----------------------
    refreshAnnouncements: async () => {
      if (!isSupabaseConfigured) return;
      set((s) => ({ status: { ...s.status, announcements: s.announcements.length ? s.status.announcements : 'loading' } }));
      const { data, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
      if (error) {
        set((s) => ({ status: { ...s.status, announcements: 'error' }, syncError: fromDbError(error).message }));
        return;
      }
      const list = (data as AnnouncementRow[]).map(toAnnouncement);
      writeCache(CACHE_KEYS.announcements, list);
      set((s) => ({ announcements: list, status: { ...s.status, announcements: 'ready' }, syncError: null }));
    },

    refreshCourses: async () => {
      if (!isSupabaseConfigured) return;
      set((s) => ({ status: { ...s.status, courses: s.courses.length ? s.status.courses : 'loading' } }));
      const { data, error } = await supabase.from('courses').select('*').order('course_code');
      if (error) {
        set((s) => ({ status: { ...s.status, courses: 'error' }, syncError: fromDbError(error).message }));
        return;
      }
      const list = (data as CourseRow[]).map(toCourse);
      writeCache(CACHE_KEYS.courses, list);
      set((s) => ({ courses: list, status: { ...s.status, courses: 'ready' }, syncError: null }));
    },

    refreshEnrollments: async () => {
      if (!isSupabaseConfigured || !get().currentUserId) return;
      const { data, error } = await supabase.from('enrollments').select('*');
      if (error) {
        set((s) => ({ status: { ...s.status, enrollments: 'error' }, syncError: fromDbError(error).message }));
        return;
      }
      set((s) => ({
        enrollments: (data as EnrollmentRow[]).map(toEnrollment),
        status: { ...s.status, enrollments: 'ready' },
      }));
    },

    refreshProfiles: async () => {
      if (!isSupabaseConfigured || !get().currentUserId) return;
      const { data, error } = await supabase.from('profiles').select('*');
      if (error) {
        set((s) => ({ status: { ...s.status, profiles: 'error' }, syncError: fromDbError(error).message }));
        return;
      }
      const rows = data as ProfileRow[];
      const profiles: Record<string, StudentProfile> = {};
      for (const r of rows) {
        const p = toStudentProfile(r);
        if (p) profiles[r.id] = p;
      }
      set((s) => ({ users: rows.map(toUser), profiles, status: { ...s.status, profiles: 'ready' } }));
    },

    // ----------------------- Data sync (realtime) ----------------------
    applyAnnouncementChange: (change) => {
      if (change.eventType === 'DELETE') {
        const id = deletedId(change);
        if (id) set((s) => ({ announcements: s.announcements.filter((a) => a.id !== id) }));
        return;
      }
      const item = toAnnouncement(change.new as AnnouncementRow);
      set((s) => {
        const announcements = sortAnnouncements(upsertById(s.announcements, item));
        writeCache(CACHE_KEYS.announcements, announcements);
        return { announcements };
      });
    },

    applyCourseChange: (change) => {
      if (change.eventType === 'DELETE') {
        const id = deletedId(change);
        if (id) {
          set((s) => ({
            courses: s.courses.filter((c) => c.id !== id),
            enrollments: s.enrollments.filter((e) => e.courseId !== id),
          }));
        }
        return;
      }
      const item = toCourse(change.new as CourseRow);
      set((s) => {
        const courses = upsertById(s.courses, item);
        writeCache(CACHE_KEYS.courses, courses);
        return { courses };
      });
    },

    applyEnrollmentChange: (change) => {
      if (change.eventType === 'DELETE') {
        const id = deletedId(change);
        if (id) set((s) => ({ enrollments: s.enrollments.filter((e) => e.id !== id) }));
        return;
      }
      const item = toEnrollment(change.new as EnrollmentRow);
      set((s) => ({ enrollments: upsertById(s.enrollments, item) }));
    },

    applyProfileChange: (change) => {
      if (change.eventType === 'DELETE') {
        const id = deletedId(change);
        if (id) {
          set((s) => {
            const rest = { ...s.profiles };
            delete rest[id];
            return { users: s.users.filter((u) => u.id !== id), profiles: rest };
          });
        }
        return;
      }
      const row = change.new as ProfileRow;
      const profile = toStudentProfile(row);
      set((s) => ({
        users: upsertById(s.users, toUser(row)),
        profiles: profile ? { ...s.profiles, [row.id]: profile } : s.profiles,
      }));
    },

    setSyncError: (message) => set({ syncError: message }),
  };
});

// Grades are not in the Supabase schema (yet): persist them per account under grades_<userId>.
useAppStore.subscribe((state, previous) => {
  if (state.grades !== previous.grades && state.currentUserId) {
    writeCache(gradesKey(state.currentUserId), state.grades);
  }
});
