import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Pencil, PlusCircle, Save, X } from 'lucide-react';
import ConfirmDeleteButton from '../ui/ConfirmDeleteButton';
import FormField, { fieldClass } from '../ui/FormField';
import { FormAlert } from '../ui/FormFeedback';
import { COURSE_TYPES, MAX_CREDITS_PER_SEMESTER, formatSlots } from '../../lib/academic';
import { parseSchedule, slotsToText } from '../../lib/schedule';
import { useAppStore } from '../../store/useAppStore';
import type { Course, CourseType } from '../../types';

interface CourseForm {
  code: string; title: string; instructor: string; department: string; credits: string;
  schedule: string; classroom: string; capacity: string; type: CourseType; description: string;
}
type Errors = Partial<Record<keyof CourseForm, string>>;

const EMPTY: CourseForm = {
  code: '', title: '', instructor: '', department: '', credits: '3',
  schedule: '', classroom: '', capacity: '40', type: 'Elective', description: '',
};
const NO_DESCRIPTION = 'No description provided.';

const TH = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500';
const TD = 'px-4 py-3 align-top text-sm text-slate-700';

export default function CoursesTab() {
  const courses = useAppStore((s) => s.courses);
  const currentSemester = useAppStore((s) => s.currentSemester);
  const createCourse = useAppStore((s) => s.createCourse);
  const updateCourse = useAppStore((s) => s.updateCourse);
  const deleteCourse = useAppStore((s) => s.deleteCourse);

  const formRef = useRef<HTMLFormElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CourseForm>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [feedback, setFeedback] = useState<{ variant: 'error' | 'success'; text: string } | null>(null);

  const semesterCourses = useMemo(
    () => courses.filter((c) => c.semester === currentSemester).sort((a, b) => a.code.localeCompare(b.code)),
    [courses, currentSemester],
  );
  const departments = useMemo(() => Array.from(new Set(semesterCourses.map((c) => c.department))).sort(), [semesterCourses]);

  const parsed = useMemo(() => (form.schedule.trim() ? parseSchedule(form.schedule) : null), [form.schedule]);
  const editingCourse = editingId ? courses.find((c) => c.id === editingId) : undefined;
  const isEditing = editingId !== null;

  const update = <K extends keyof CourseForm>(key: K, value: CourseForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY);
    setErrors({});
  };

  const startEdit = (c: Course) => {
    setEditingId(c.id);
    setForm({
      code: c.code,
      title: c.title,
      instructor: c.instructor,
      department: c.department,
      credits: String(c.credits),
      schedule: slotsToText(c.slots),
      classroom: c.classroom,
      capacity: String(c.capacity),
      type: c.type,
      description: c.description === NO_DESCRIPTION ? '' : c.description,
    });
    setErrors({});
    setFeedback(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const found: Errors = {};
    const credits = Number(form.credits);
    const capacity = Number(form.capacity);
    if (!/^[A-Za-z0-9-]{3,12}$/.test(form.code.trim())) found.code = 'Course code must be 3-12 letters or digits (e.g., CSIE2401).';
    if (!form.title.trim()) found.title = 'Please enter the course title.';
    if (!form.instructor.trim()) found.instructor = 'Please enter the instructor name.';
    if (!form.department.trim()) found.department = 'Please enter or select a department.';
    if (!Number.isInteger(credits) || credits < 1 || credits > 6) found.credits = 'Credits must be a whole number from 1 to 6.';
    if (!form.classroom.trim()) found.classroom = 'Please enter the classroom.';
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) found.capacity = 'Capacity must be a whole number from 1 to 500.';
    const schedule = parseSchedule(form.schedule);
    if (!schedule.ok) found.schedule = schedule.error;
    setErrors(found);
    if (Object.keys(found).length > 0 || !schedule.ok) return;

    const department = form.department.trim();
    const input = {
      code: form.code,
      title: form.title,
      description: form.description,
      credits,
      instructor: form.instructor,
      // Reuse the college of an existing course in the same department; otherwise fall back to the department.
      college: courses.find((c) => c.department === department)?.college ?? department,
      department,
      type: form.type,
      capacity,
      classroom: form.classroom,
      slots: schedule.slots,
    };

    setBusy(true);
    const result = isEditing ? await updateCourse(editingId, input) : await createCourse(input);
    setBusy(false);
    if (!result.ok) {
      if (result.code === 'DUPLICATE') setErrors({ code: result.message });
      setFeedback({ variant: 'error', text: result.message });
      return;
    }
    const label = result.data?.code ?? 'The course';
    setFeedback({
      variant: 'success',
      text: isEditing ? `${label} has been updated. Students see the change instantly.` : `${label} has been added to the ${currentSemester} catalog.`,
    });
    resetForm();
  };

  const handleDelete = async (id: string) => {
    const result = await deleteCourse(id);
    if (!result.ok) {
      setFeedback({ variant: 'error', text: result.message });
      return;
    }
    if (id === editingId) resetForm();
  };

  return (
    <div className="space-y-6">
      <form ref={formRef} onSubmit={handleSubmit} noValidate className="card scroll-mt-24 space-y-5 p-5 sm:p-6">
        <h3 className="font-display text-lg font-semibold text-slate-900">
          {isEditing ? `Edit Course ${editingCourse?.code ?? ''}` : 'Add New Course'}{' '}
          <span className="text-sm font-normal text-slate-500">({currentSemester} Semester)</span>
        </h3>
        {isEditing && (
          <FormAlert
            variant="info"
            message={`Students already enrolled keep their place. A change is blocked if it would clash with an enrolled student's other courses, push them above ${MAX_CREDITS_PER_SEMESTER} credits, or set the capacity below the current enrollment.`}
          />
        )}
        <FormAlert message={feedback?.text} variant={feedback?.variant} onDismiss={() => setFeedback(null)} />

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <FormField id="c-code" label="Course Code" error={errors.code}>
            <input id="c-code" className={fieldClass(errors.code)} placeholder="e.g., CSIE2401" value={form.code}
              onChange={(e) => update('code', e.target.value.toUpperCase())} maxLength={12} />
          </FormField>
          <div className="xl:col-span-2">
            <FormField id="c-title" label="Course Title" error={errors.title}>
              <input id="c-title" className={fieldClass(errors.title)} placeholder="e.g., Operating Systems" value={form.title}
                onChange={(e) => update('title', e.target.value)} />
            </FormField>
          </div>

          <FormField id="c-instructor" label="Instructor" error={errors.instructor}>
            <input id="c-instructor" className={fieldClass(errors.instructor)} placeholder="e.g., Prof. Wei-Lin Chen"
              value={form.instructor} onChange={(e) => update('instructor', e.target.value)} />
          </FormField>
          <FormField id="c-department" label="Department" error={errors.department} hint="Pick an existing department or type a new one.">
            <input id="c-department" list="department-options" className={fieldClass(errors.department)}
              placeholder="e.g., Computer Science" value={form.department} onChange={(e) => update('department', e.target.value)} />
            <datalist id="department-options">{departments.map((d) => <option key={d} value={d} />)}</datalist>
          </FormField>
          <FormField id="c-type" label="Course Type">
            <select id="c-type" className="field-input" value={form.type} onChange={(e) => update('type', e.target.value as CourseType)}>
              {COURSE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormField>

          <FormField id="c-credits" label="Credits" error={errors.credits}>
            <input id="c-credits" type="number" min={1} max={6} className={fieldClass(errors.credits)} value={form.credits}
              onChange={(e) => update('credits', e.target.value)} />
          </FormField>
          <FormField id="c-schedule" label="Day & Periods" error={errors.schedule}
            hint={parsed?.ok ? `Parsed: ${formatSlots(parsed.slots)}` : 'Examples: "Tue 3-4", "Mon 2-4, Wed 1", "Wed Z" (noon break).'}>
            <input id="c-schedule" className={fieldClass(errors.schedule)} placeholder="e.g., Tue 3-4" value={form.schedule}
              onChange={(e) => update('schedule', e.target.value)} />
          </FormField>
          <FormField id="c-classroom" label="Classroom" error={errors.classroom}>
            <input id="c-classroom" className={fieldClass(errors.classroom)} placeholder="e.g., Engineering Hall 302"
              value={form.classroom} onChange={(e) => update('classroom', e.target.value)} />
          </FormField>

          <FormField id="c-capacity" label="Capacity" error={errors.capacity}>
            <input id="c-capacity" type="number" min={1} max={500} className={fieldClass(errors.capacity)} value={form.capacity}
              onChange={(e) => update('capacity', e.target.value)} />
          </FormField>
          <div className="md:col-span-2">
            <FormField id="c-description" label="Description (optional)">
              <input id="c-description" className="field-input" placeholder="One-sentence course summary" value={form.description}
                onChange={(e) => update('description', e.target.value)} />
            </FormField>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn-primary" disabled={busy}>
            {isEditing ? <Save className="h-4 w-4" aria-hidden="true" /> : <PlusCircle className="h-4 w-4" aria-hidden="true" />}
            {busy ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Course'}
          </button>
          {isEditing && (
            <button type="button" className="btn-secondary" onClick={() => { resetForm(); setFeedback(null); }}>
              <X className="h-4 w-4" aria-hidden="true" />
              Cancel Editing
            </button>
          )}
        </div>
      </form>

      <section aria-labelledby="catalog-admin-title" className="card overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <h3 id="catalog-admin-title" className="font-display text-lg font-semibold text-slate-900">
            Current Catalog <span className="text-sm font-normal text-slate-500">({semesterCourses.length} courses)</span>
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {['Course Code', 'Course Title', 'Department', 'Credits', 'Schedule', 'Classroom', 'Instructor', 'Seats'].map((h) => (
                  <th key={h} scope="col" className={TH}>{h}</th>
                ))}
                <th scope="col" className={`${TH} text-right`}>Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {semesterCourses.map((c) => {
                const taken = c.enrolledCount;
                return (
                  <tr key={c.id} className={c.id === editingId ? 'bg-brand-50/70' : 'hover:bg-slate-50'}>
                    <td className={`${TD} whitespace-nowrap font-semibold text-slate-900`}>{c.code}</td>
                    <td className={`${TD} min-w-[12rem] font-medium text-slate-900`}>{c.title}</td>
                    <td className={TD}>{c.department}</td>
                    <td className={TD}>{c.credits}</td>
                    <td className={TD}>{formatSlots(c.slots).split('; ').map((l) => <div key={l} className="whitespace-nowrap">{l}</div>)}</td>
                    <td className={TD}>{c.classroom}</td>
                    <td className={`${TD} whitespace-nowrap`}>{c.instructor}</td>
                    <td className={`${TD} whitespace-nowrap`}>{taken} / {c.capacity}</td>
                    <td className={`${TD} text-right`}>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button type="button" onClick={() => startEdit(c)} aria-label={`Edit course ${c.code}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          Edit
                        </button>
                        <ConfirmDeleteButton ariaLabel={`Delete course ${c.code}`}
                          warning={taken > 0 ? `Also drops ${taken} enrollment${taken === 1 ? '' : 's'}.` : undefined}
                          onConfirm={() => handleDelete(c.id)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
