import type {
  Announcement,
  AnnouncementCategory,
  Course,
  CourseType,
  Enrollment,
  Role,
  StudentProfile,
  TimetableSlot,
  User,
} from '../types';

// ---------------------------------------------------------------------------
// Database row shapes (snake_case, exactly as stored in Postgres)
// ---------------------------------------------------------------------------

export interface AnnouncementRow {
  id: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  pinned: boolean;
  author_name: string;
  created_by: string | null;
  created_at: string;
}

export interface CourseRow {
  id: string;
  course_code: string;
  title: string;
  description: string;
  instructor: string;
  college: string;
  department: string;
  type: CourseType;
  credits: number;
  classroom: string;
  capacity: number;
  enrolled_count: number;
  semester: string;
  slots: TimetableSlot[];
  day_of_week: string | null;
  periods: string | null;
  created_at: string;
}

export interface ProfileRow {
  id: string;
  email: string;
  role: Role;
  full_name: string;
  student_id: string | null;
  department: string | null;
  academic_year: string | null;
  year_level: number | null;
  age: number | null;
  origin: string | null;
  nationality: string | null;
  address: string | null;
  photo_url: string | null;
  date_of_birth: string | null;
  emergency_contact: string | null;
  emergency_phone: string | null;
  is_profile_completed: boolean;
  created_at: string;
}

export interface EnrollmentRow {
  id: string;
  student_id: string;
  course_id: string;
  semester: string;
  enrolled_at: string;
}

// ---------------------------------------------------------------------------
// Row -> app model
// ---------------------------------------------------------------------------

export const toAnnouncement = (r: AnnouncementRow): Announcement => ({
  id: r.id,
  title: r.title,
  content: r.content,
  category: r.category,
  pinned: r.pinned,
  authorId: r.created_by ?? 'system',
  authorName: r.author_name,
  createdAt: r.created_at,
});

export const toCourse = (r: CourseRow): Course => ({
  id: r.id,
  code: r.course_code,
  title: r.title,
  description: r.description,
  credits: r.credits,
  instructor: r.instructor,
  college: r.college,
  department: r.department,
  type: r.type,
  capacity: r.capacity,
  enrolledCount: r.enrolled_count,
  classroom: r.classroom,
  semester: r.semester,
  slots: Array.isArray(r.slots) ? r.slots : [],
  createdAt: r.created_at,
});

export const toEnrollment = (r: EnrollmentRow): Enrollment => ({
  id: r.id,
  userId: r.student_id,
  courseId: r.course_id,
  semester: r.semester,
  enrolledAt: r.enrolled_at,
});

export const toUser = (r: ProfileRow): User => ({
  id: r.id,
  email: r.email.toLowerCase(),
  fullName: r.full_name,
  role: r.role,
  isProfileCompleted: r.is_profile_completed,
  createdAt: r.created_at,
});

/** Returns null while the student has not finished the first-login form. */
export const toStudentProfile = (r: ProfileRow): StudentProfile | null =>
  r.role === 'STUDENT' && r.is_profile_completed
    ? {
        userId: r.id,
        studentId: r.student_id ?? '',
        fullName: r.full_name,
        department: r.department ?? '',
        yearLevel: r.year_level ?? 1,
        academicYear: r.academic_year ?? '',
        dateOfBirth: r.date_of_birth ?? '',
        age: r.age ?? 0,
        placeOfOrigin: r.origin ?? '',
        nationality: r.nationality ?? '',
        address: r.address ?? '',
        photoDataUrl: r.photo_url,
        emergencyContactName: r.emergency_contact ?? '',
        emergencyContactPhone: r.emergency_phone ?? '',
        completedAt: r.created_at,
      }
    : null;
