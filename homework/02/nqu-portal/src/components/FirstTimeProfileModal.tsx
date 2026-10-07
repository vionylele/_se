import { useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Camera, GraduationCap, LogOut, Save, Trash2 } from 'lucide-react';
import { Avatar } from './UserBadge';
import { FieldError, FormAlert } from './ui/FormFeedback';
import { DEPARTMENTS, calculateAge, getAcademicYearOptions } from '../lib/academic';
import { compressImageToDataUrl } from '../utils/imageCompressor';
import { validateProfileFields, type ProfileErrors } from '../lib/validation';
import { selectCurrentUser, useAppStore } from '../store/useAppStore';
import type { StudentProfileInput } from '../types';

interface FormState {
  fullName: string;
  studentId: string;
  department: string;
  yearLevel: string; // "" until chosen, then "1".."5"
  dateOfBirth: string;
  placeOfOrigin: string;
  nationality: string;
  address: string;
  photoDataUrl: string | null;
  emergencyContactName: string;
  emergencyContactPhone: string;
}

/** Order used to focus the first invalid field. */
const FIELD_ORDER: Array<keyof StudentProfileInput> = [
  'fullName', 'studentId', 'department', 'academicYear', 'dateOfBirth', 'placeOfOrigin',
  'nationality', 'address', 'emergencyContactName', 'emergencyContactPhone',
];

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function Field({
  id, label, error, hint, children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="border-b border-slate-200 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
      {children}
    </h3>
  );
}

/**
 * Blocking profile form. AppLayout renders this INSTEAD of the app shell and routes while a
 * student's `isProfileCompleted` flag is false, so no other page can be reached until it is saved.
 */
export default function FirstTimeProfileModal() {
  const user = useAppStore(selectCurrentUser);
  const completeProfile = useAppStore((s) => s.completeProfile);
  const logout = useAppStore((s) => s.logout);

  const yearOptions = useMemo(() => getAcademicYearOptions(), []);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [form, setForm] = useState<FormState>({
    fullName: user?.fullName ?? '',
    studentId: '',
    department: '',
    yearLevel: '',
    dateOfBirth: '',
    placeOfOrigin: '',
    nationality: '',
    address: '',
    photoDataUrl: null,
    emergencyContactName: '',
    emergencyContactPhone: '',
  });
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const age = form.dateOfBirth ? calculateAge(form.dateOfBirth) : NaN;
  const ageText = Number.isFinite(age) && age >= 0 ? String(age) : '';

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      if (key === 'yearLevel') delete next.academicYear;
      return next;
    });
  };

  const inputClass = (key: keyof ProfileErrors) => `field-input ${errors[key] ? 'field-input-error' : ''}`;
  const aria = (key: keyof ProfileErrors, id: string) => ({
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': errors[key] ? `${id}-error` : undefined,
  });

  const handlePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow choosing the same file again
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setPhotoError('Please choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError('This image is larger than 5 MB. Please choose a smaller file.');
      return;
    }
    try {
      update('photoDataUrl', await compressImageToDataUrl(file));
      setPhotoError(null);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'This image could not be processed.');
    }
  };

  const buildInput = (): StudentProfileInput => {
    const option = yearOptions.find((o) => o.value === form.yearLevel);
    return {
      fullName: form.fullName,
      studentId: form.studentId,
      department: form.department,
      yearLevel: Number(form.yearLevel) || 0,
      academicYear: option?.label ?? '',
      dateOfBirth: form.dateOfBirth,
      age: Number.isFinite(age) ? age : 0,
      placeOfOrigin: form.placeOfOrigin,
      nationality: form.nationality,
      address: form.address,
      photoDataUrl: form.photoDataUrl,
      emergencyContactName: form.emergencyContactName,
      emergencyContactPhone: form.emergencyContactPhone,
    };
  };

  const focusFirstError = (found: ProfileErrors) => {
    const first = FIELD_ORDER.find((key) => found[key]);
    if (first) document.getElementById(first === 'academicYear' ? 'yearLevel' : first)?.focus();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const input = buildInput();
    const found = validateProfileFields(input);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFormError('Please correct the highlighted fields before continuing.');
      focusFirstError(found);
      return;
    }

    setSaving(true);
    const result = await completeProfile(input);
    setSaving(false);
    if (!result.ok) {
      if (result.code === 'DUPLICATE') {
        setErrors({ studentId: result.message });
        focusFirstError({ studentId: result.message });
      }
      setFormError(result.message);
    }
    // On success the store flips isProfileCompleted and AppLayout swaps this form for the portal.
  };

  const displayName = form.fullName.trim() || user?.fullName || 'Student';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gradient-to-br from-brand-900 via-brand-800 to-slate-900">
      <div className="flex min-h-full items-start justify-center p-4 sm:items-center sm:p-6">
        <form
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-modal-title"
          noValidate
          onSubmit={handleSubmit}
          className="my-4 w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-start gap-4 border-b border-slate-200 bg-brand-50 px-6 py-5 sm:px-8">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white">
              <GraduationCap className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h2 id="profile-modal-title" className="font-display text-2xl font-semibold text-slate-900">
                Complete Your Student Profile
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Welcome{user ? `, ${user.fullName.split(' ')[0]}` : ''}! This one-time form is required. You will not be
                able to access any other page until it has been submitted.
              </p>
            </div>
          </div>

          <div className="space-y-8 px-6 py-6 sm:px-8">
            <FormAlert message={formError} />

            {/* Photo */}
            <section className="space-y-4">
              <SectionTitle>Profile Photo</SectionTitle>
              <div className="flex items-center gap-5">
                <Avatar name={displayName} src={form.photoDataUrl} size="xl" />
                <div>
                  <div className="flex flex-wrap gap-2">
                    <label className="btn-secondary cursor-pointer focus-within:ring-2 focus-within:ring-brand-600">
                      <Camera className="h-4 w-4" aria-hidden="true" />
                      {form.photoDataUrl ? 'Change Photo' : 'Choose Photo'}
                      <input
                        id="photo"
                        type="file"
                        accept={ACCEPTED_IMAGE_TYPES.join(',')}
                        onChange={handlePhotoChange}
                        className="sr-only"
                      />
                    </label>
                    {form.photoDataUrl && (
                      <button type="button" className="btn-secondary" onClick={() => update('photoDataUrl', null)}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Remove
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Optional. JPG, PNG, or WebP up to 5 MB. Your photo is cropped to a square automatically.
                  </p>
                  <FieldError id="photo-error" message={photoError ?? errors.photoDataUrl} />
                </div>
              </div>
            </section>

            {/* Personal */}
            <section className="space-y-4">
              <SectionTitle>Personal & Academic Information</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="fullName" label="Full Name" error={errors.fullName}>
                  <input id="fullName" className={inputClass('fullName')} {...aria('fullName', 'fullName')}
                    autoComplete="name" placeholder="e.g., John Doe"
                    value={form.fullName} onChange={(e) => update('fullName', e.target.value)} />
                </Field>

                <Field id="studentId" label="Student ID" error={errors.studentId}>
                  <input id="studentId" className={inputClass('studentId')} {...aria('studentId', 'studentId')}
                    autoComplete="off" placeholder="e.g., NQU113001" maxLength={12}
                    value={form.studentId} onChange={(e) => update('studentId', e.target.value)} />
                </Field>

                <Field id="department" label="Department / Major" error={errors.department}>
                  <select id="department" className={inputClass('department')} {...aria('department', 'department')}
                    value={form.department} onChange={(e) => update('department', e.target.value)}>
                    <option value="">Select your department / major</option>
                    {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </Field>

                <Field id="yearLevel" label="Academic Year" error={errors.academicYear}>
                  <select id="yearLevel" className={inputClass('academicYear')} {...aria('academicYear', 'yearLevel')}
                    value={form.yearLevel} onChange={(e) => update('yearLevel', e.target.value)}>
                    <option value="">Select your academic year</option>
                    {yearOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>

                <Field id="dateOfBirth" label="Date of Birth" error={errors.dateOfBirth}>
                  <input id="dateOfBirth" type="date" max={today}
                    className={inputClass('dateOfBirth')} {...aria('dateOfBirth', 'dateOfBirth')}
                    value={form.dateOfBirth} onChange={(e) => update('dateOfBirth', e.target.value)} />
                </Field>

                <Field id="age" label="Age" hint="Calculated automatically from your date of birth.">
                  <input id="age" readOnly tabIndex={-1} className="field-input"
                    placeholder="Select your date of birth first" value={ageText} />
                </Field>
              </div>
            </section>

            {/* Origin & residence */}
            <section className="space-y-4">
              <SectionTitle>Origin & Residence</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="placeOfOrigin" label="Place of Origin" error={errors.placeOfOrigin}>
                  <input id="placeOfOrigin" className={inputClass('placeOfOrigin')} {...aria('placeOfOrigin', 'placeOfOrigin')}
                    placeholder="e.g., Kinmen County, Taiwan"
                    value={form.placeOfOrigin} onChange={(e) => update('placeOfOrigin', e.target.value)} />
                </Field>
                <Field id="nationality" label="Nationality" error={errors.nationality}>
                  <input id="nationality" className={inputClass('nationality')} {...aria('nationality', 'nationality')}
                    autoComplete="country-name" placeholder="e.g., Taiwanese"
                    value={form.nationality} onChange={(e) => update('nationality', e.target.value)} />
                </Field>
                <div className="sm:col-span-2">
                  <Field id="address" label="Current Living Address" error={errors.address}>
                    <input id="address" className={inputClass('address')} {...aria('address', 'address')}
                      autoComplete="street-address" placeholder="e.g., No. 1, University Rd., Jinning Township, Kinmen County"
                      value={form.address} onChange={(e) => update('address', e.target.value)} />
                  </Field>
                </div>
              </div>
            </section>

            {/* Emergency contact */}
            <section className="space-y-4">
              <SectionTitle>Emergency Contact</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="emergencyContactName" label="Emergency Contact Name" error={errors.emergencyContactName}>
                  <input id="emergencyContactName" className={inputClass('emergencyContactName')}
                    {...aria('emergencyContactName', 'emergencyContactName')}
                    placeholder="e.g., Jane Doe"
                    value={form.emergencyContactName} onChange={(e) => update('emergencyContactName', e.target.value)} />
                </Field>
                <Field id="emergencyContactPhone" label="Emergency Contact Phone Number" error={errors.emergencyContactPhone}>
                  <input id="emergencyContactPhone" type="tel" className={inputClass('emergencyContactPhone')}
                    {...aria('emergencyContactPhone', 'emergencyContactPhone')}
                    placeholder="e.g., +886 912 345 678"
                    value={form.emergencyContactPhone} onChange={(e) => update('emergencyContactPhone', e.target.value)} />
                </Field>
              </div>
            </section>
          </div>

          {/* Footer */}
          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <button type="button" onClick={logout} className="btn-secondary">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign Out
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              <Save className="h-4 w-4" aria-hidden="true" />
              {saving ? 'Saving...' : 'Save and Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
