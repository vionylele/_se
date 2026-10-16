import { useRef, useState, type FormEvent } from 'react';
import { Pencil, Pin, Save, Send, X } from 'lucide-react';
import { CATEGORY_STYLES } from '../announcementStyles';
import ConfirmDeleteButton from '../ui/ConfirmDeleteButton';
import FormField, { fieldClass } from '../ui/FormField';
import { FormAlert } from '../ui/FormFeedback';
import { formatDate, toDateInputValue } from '../../lib/academic';
import { selectCurrentUser, useAppStore } from '../../store/useAppStore';
import type { Announcement, AnnouncementCategory } from '../../types';

const CATEGORIES: AnnouncementCategory[] = ['Academic', 'General', 'Urgent'];
const MAX_BODY = 1000;
const MAX_AUTHOR = 80;

interface Errors { title?: string; content?: string; date?: string; authorName?: string }

export default function AnnouncementsTab() {
  const user = useAppStore(selectCurrentUser);
  const announcements = useAppStore((s) => s.announcements);
  const postAnnouncement = useAppStore((s) => s.postAnnouncement);
  const updateAnnouncement = useAppStore((s) => s.updateAnnouncement);
  const deleteAnnouncement = useAppStore((s) => s.deleteAnnouncement);

  const formRef = useRef<HTMLFormElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<AnnouncementCategory>('General');
  const [date, setDate] = useState(toDateInputValue());
  const [content, setContent] = useState('');
  const [pinned, setPinned] = useState(false);
  const [authorName, setAuthorName] = useState(user?.fullName ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [feedback, setFeedback] = useState<{ variant: 'error' | 'success'; text: string } | null>(null);

  const isEditing = editingId !== null;

  /** Clears the form back to "new announcement" mode. The "Posted by" name is kept for convenience. */
  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setContent('');
    setPinned(false);
    setCategory('General');
    setDate(toDateInputValue());
    setErrors({});
  };

  const startEdit = (a: Announcement) => {
    setEditingId(a.id);
    setTitle(a.title);
    setCategory(a.category);
    setDate(toDateInputValue(new Date(a.createdAt)));
    setContent(a.content);
    setPinned(a.pinned);
    setAuthorName(a.authorName);
    setErrors({});
    setFeedback(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const found: Errors = {};
    if (title.trim().length < 3) found.title = 'Please enter a title of at least 3 characters.';
    if (content.trim().length < 10) found.content = 'The message body must be at least 10 characters.';
    if (!date) found.date = 'Please choose a publication date.';
    if (authorName.trim().length > MAX_AUTHOR) found.authorName = `Keep this under ${MAX_AUTHOR} characters.`;
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const input = { title, content, category, pinned, date, authorName };
    setBusy(true);
    const result = isEditing ? await updateAnnouncement(editingId, input) : await postAnnouncement(input);
    setBusy(false);
    if (!result.ok) {
      setFeedback({ variant: 'error', text: result.message });
      return;
    }
    setFeedback({
      variant: 'success',
      text: isEditing ? 'Announcement updated. Every student sees the change instantly.' : 'Announcement published. Every student sees it instantly.',
    });
    resetForm();
  };

  const handleDelete = async (id: string) => {
    const result = await deleteAnnouncement(id);
    if (!result.ok) {
      setFeedback({ variant: 'error', text: result.message });
      return;
    }
    if (id === editingId) resetForm();
  };

  const sorted = [...announcements].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <form ref={formRef} onSubmit={handleSubmit} noValidate className="card scroll-mt-24 space-y-5 p-5 sm:p-6">
        <h3 className="font-display text-lg font-semibold text-slate-900">
          {isEditing ? 'Edit Announcement' : 'New Announcement'}
        </h3>
        <FormAlert message={feedback?.text} variant={feedback?.variant} onDismiss={() => setFeedback(null)} />

        <FormField id="ann-title" label="Title" error={errors.title}>
          <input id="ann-title" className={fieldClass(errors.title)} placeholder="e.g., Library Opening Hours During Mid-Terms"
            value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </FormField>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField id="ann-category" label="Category">
            <select id="ann-category" className="field-input" value={category}
              onChange={(e) => setCategory(e.target.value as AnnouncementCategory)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>
          <FormField id="ann-date" label="Publication Date" error={errors.date}>
            <input id="ann-date" type="date" className={fieldClass(errors.date)} value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
        </div>

        <FormField id="ann-author" label="Posted By" error={errors.authorName}
          hint='Shown on the announcement as "Posted by ...". Leave blank to use your account name.'>
          <input id="ann-author" className={fieldClass(errors.authorName)} placeholder="e.g., Office of Academic Affairs"
            value={authorName} onChange={(e) => setAuthorName(e.target.value)} maxLength={MAX_AUTHOR + 20} />
        </FormField>

        <FormField id="ann-content" label="Message Body" error={errors.content} hint={`${content.length} / ${MAX_BODY} characters`}>
          <textarea id="ann-content" rows={6} className={fieldClass(errors.content)} maxLength={MAX_BODY}
            placeholder="Write the full announcement text here." value={content} onChange={(e) => setContent(e.target.value)} />
        </FormField>

        <label className="flex items-center gap-2.5 text-sm text-slate-700">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600" />
          Pin to the top of the announcement board
        </label>

        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn-primary" disabled={busy}>
            {isEditing ? <Save className="h-4 w-4" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            {busy ? 'Saving...' : isEditing ? 'Save Changes' : 'Publish Announcement'}
          </button>
          {isEditing && (
            <button type="button" className="btn-secondary" onClick={() => { resetForm(); setFeedback(null); }}>
              <X className="h-4 w-4" aria-hidden="true" />
              Cancel Editing
            </button>
          )}
        </div>
      </form>

      <section aria-labelledby="published-title" className="card overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <h3 id="published-title" className="font-display text-lg font-semibold text-slate-900">
            Published Announcements <span className="text-sm font-normal text-slate-500">({sorted.length})</span>
          </h3>
        </div>
        <ul className="max-h-[40rem] divide-y divide-slate-100 overflow-y-auto">
          {sorted.length === 0 && <li className="p-8 text-center text-sm text-slate-500">No announcements have been published.</li>}
          {sorted.map((a) => {
            const { icon: Icon, chip } = CATEGORY_STYLES[a.category];
            return (
              <li key={a.id} className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between ${a.id === editingId ? 'bg-brand-50/70' : ''}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${chip}`}>
                      <Icon className="h-3 w-3" aria-hidden="true" />{a.category}
                    </span>
                    {a.pinned && <Pin className="h-3.5 w-3.5 text-slate-400" aria-label="Pinned" />}
                    <span className="text-xs text-slate-500">{formatDate(a.createdAt)}</span>
                  </div>
                  <p className="mt-1.5 font-medium text-slate-900">{a.title}</p>
                  <p className="text-xs text-slate-500">Posted by {a.authorName}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button type="button" onClick={() => startEdit(a)} aria-label={`Edit announcement ${a.title}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    Edit
                  </button>
                  <ConfirmDeleteButton ariaLabel={`Delete announcement ${a.title}`} onConfirm={() => handleDelete(a.id)} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
