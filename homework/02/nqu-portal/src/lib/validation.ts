import type { StudentProfileInput } from '../types';
import { calculateAge } from './academic';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\-\s]{7,20}$/;
const STUDENT_ID_RE = /^[A-Za-z0-9]{6,12}$/;
const MAX_PHOTO_CHARS = 280_000; // ~200 KB of base64

export const isValidEmail = (value: string): boolean => EMAIL_RE.test(value.trim());
const isBlank = (value: string): boolean => value.trim().length === 0;

// ----------------------------- Authentication -----------------------------

export interface LoginErrors {
  email?: string;
  password?: string;
}

export function validateLoginFields(email: string, password: string): LoginErrors {
  const errors: LoginErrors = {};
  if (isBlank(email)) errors.email = 'Please enter your email address.';
  else if (!isValidEmail(email)) errors.email = 'Please enter a valid email address (e.g., name@example.com).';
  if (password.length === 0) errors.password = 'Please enter your password.';
  return errors;
}

export interface RegisterFields {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}
export type RegisterErrors = Partial<Record<keyof RegisterFields, string>>;

export function validateRegisterFields(f: RegisterFields): RegisterErrors {
  const errors: RegisterErrors = {};
  if (isBlank(f.fullName)) errors.fullName = 'Please enter your full name.';
  else if (f.fullName.trim().length < 2) errors.fullName = 'Full name must be at least 2 characters.';

  if (isBlank(f.email)) errors.email = 'Please enter your email address.';
  else if (!isValidEmail(f.email)) errors.email = 'Please enter a valid email address (e.g., name@example.com).';

  if (f.password.length === 0) errors.password = 'Please create a password.';
  else if (f.password.length < 8) errors.password = 'Password must be at least 8 characters.';

  if (f.confirmPassword.length === 0) errors.confirmPassword = 'Please confirm your password.';
  else if (f.password !== f.confirmPassword) errors.confirmPassword = 'Passwords do not match.';
  return errors;
}

// ------------------------------ Student profile ---------------------------

export type ProfileErrors = Partial<Record<keyof StudentProfileInput, string>>;

/** Single source of truth for profile validation (used by the form and by the store). */
export function validateProfileFields(input: StudentProfileInput): ProfileErrors {
  const e: ProfileErrors = {};

  if (isBlank(input.fullName)) e.fullName = 'Please enter your full name.';
  else if (input.fullName.trim().length < 2) e.fullName = 'Full name must be at least 2 characters.';

  if (isBlank(input.studentId)) e.studentId = 'Please enter your Student ID.';
  else if (!STUDENT_ID_RE.test(input.studentId.trim())) {
    e.studentId = 'Student ID must be 6-12 letters or digits (e.g., NQU113001).';
  }

  if (isBlank(input.department)) e.department = 'Please select your department / major.';

  if (isBlank(input.academicYear) || !Number.isInteger(input.yearLevel) || input.yearLevel < 1 || input.yearLevel > 6) {
    e.academicYear = 'Please select your academic year.';
  }

  if (isBlank(input.dateOfBirth)) e.dateOfBirth = 'Please enter your date of birth.';
  else {
    const age = calculateAge(input.dateOfBirth);
    if (Number.isNaN(age) || age < 0) e.dateOfBirth = 'Date of birth must be a valid date in the past.';
    else if (age < 15 || age > 100) e.dateOfBirth = `The age calculated from this date (${age}) looks incorrect. Please check it.`;
  }

  if (isBlank(input.placeOfOrigin)) e.placeOfOrigin = 'Please enter your place of origin.';
  if (isBlank(input.nationality)) e.nationality = 'Please enter your nationality.';
  if (isBlank(input.address)) e.address = 'Please enter your current living address.';
  else if (input.address.trim().length < 5) e.address = 'Please enter a complete address.';

  if (isBlank(input.emergencyContactName)) e.emergencyContactName = 'Please enter an emergency contact name.';
  if (isBlank(input.emergencyContactPhone)) e.emergencyContactPhone = 'Please enter an emergency contact phone number.';
  else if (!PHONE_RE.test(input.emergencyContactPhone.trim())) {
    e.emergencyContactPhone = 'Please enter a valid phone number (digits, spaces, +, -, and parentheses only).';
  }

  if (input.photoDataUrl && (!input.photoDataUrl.startsWith('data:image/') || input.photoDataUrl.length > MAX_PHOTO_CHARS)) {
    e.photoDataUrl = 'The profile photo is invalid or too large. Please choose another image.';
  }
  return e;
}
