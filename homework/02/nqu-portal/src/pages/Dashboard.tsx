import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpenCheck,
  ChevronDown,
  ChevronUp,
  Megaphone,
  Pin,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { CATEGORY_STYLES } from '../components/announcementStyles';
import { Avatar } from '../components/UserBadge';
import { MAX_CREDITS_PER_SEMESTER, formatDate } from '../lib/academic';
import {
  getEnrolledCourses,
  selectCurrentProfile,
  selectCurrentUser,
  sumCredits,
  useAppStore,
} from '../store/useAppStore';
import type { Announcement } from '../types';

// ---------------------------------------------------------------------------
// Announcement board
// ---------------------------------------------------------------------------

const FILTERS = ['All', 'Academic', 'General', 'Urgent'] as const;
type Filter = (typeof FILTERS)[number];

const COLLAPSE_AT = 190; // characters

function AnnouncementCard({ item }: { item: Announcement }) {
  const [expanded, setExpanded] = useState(false);
  const { icon: Icon, chip, accent } = CATEGORY_STYLES[item.category];
  const isLong = item.content.length > COLLAPSE_AT;
  const body = isLong && !expanded ? `${item.content.slice(0, COLLAPSE_AT).trimEnd()}...` : item.content;

  return (
    <article className={`rounded-xl border border-l-4 border-slate-200 bg-white p-5 ${accent}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${chip}`}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {item.category}
        </span>
        {item.pinned && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
            <Pin className="h-3.5 w-3.5" aria-hidden="true" />
            Pinned
          </span>
        )}
        <time dateTime={item.createdAt} className="ml-auto text-xs text-slate-500">
          {formatDate(item.createdAt)}
        </time>
      </div>

      <h3 className="mt-3 text-base font-semibold text-slate-900">{item.title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{body}</p>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">Posted by {item.authorName}</span>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800"
          >
            {expanded ? 'Show less' : 'Read more'}
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </article>
  );
}

function AnnouncementBoard() {
  const announcements = useAppStore((s) => s.announcements);
  const [filter, setFilter] = useState<Filter>('All');

  const sorted = useMemo(
    () =>
      [...announcements].sort(
        (a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt),
      ),
    [announcements],
  );
  const visible = filter === 'All' ? sorted : sorted.filter((a) => a.category === filter);
  const countFor = (f: Filter) => (f === 'All' ? sorted.length : sorted.filter((a) => a.category === f).length);

  return (
    <section aria-labelledby="board-title" className="card">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <Megaphone className="h-5 w-5 text-brand-700" aria-hidden="true" />
          <h2 id="board-title" className="font-display text-lg font-semibold text-slate-900">
            Announcement Board
          </h2>
        </div>

        <div role="tablist" aria-label="Filter announcements by category" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                filter === f ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f} <span className="opacity-70">({countFor(f)})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 p-5">
        {visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            There are no {filter === 'All' ? '' : `${filter.toLowerCase()} `}announcements right now.
          </p>
        ) : (
          visible.map((item) => <AnnouncementCard key={item.id} item={item} />)
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Right-hand status cards
// ---------------------------------------------------------------------------

function StudentStatusCard() {
  const user = useAppStore(selectCurrentUser);
  const profile = useAppStore(selectCurrentProfile);
  const courses = useAppStore((s) => s.courses);
  const enrollments = useAppStore((s) => s.enrollments);
  const currentSemester = useAppStore((s) => s.currentSemester);

  const enrolled = useMemo(
    () => (user ? getEnrolledCourses({ courses, enrollments, currentSemester }, user.id) : []),
    [user, courses, enrollments, currentSemester],
  );
  if (!user) return null;

  const credits = sumCredits(enrolled);
  const remaining = MAX_CREDITS_PER_SEMESTER - credits;
  const percent = Math.min(100, Math.round((credits / MAX_CREDITS_PER_SEMESTER) * 100));
  const barColor = credits >= MAX_CREDITS_PER_SEMESTER ? 'bg-red-500' : credits >= 20 ? 'bg-amber-500' : 'bg-brand-600';

  const rows: Array<[string, string]> = [
    ['Student ID', profile?.studentId ?? '-'],
    ['Department / Major', profile?.department ?? '-'],
    ['Academic Year', profile?.academicYear ?? '-'],
  ];

  return (
    <section aria-labelledby="status-title" className="card overflow-hidden">
      <div className="flex items-center gap-4 bg-gradient-to-br from-brand-700 to-brand-900 p-5 text-white">
        <Avatar name={profile?.fullName ?? user.fullName} src={profile?.photoDataUrl} size="lg" className="ring-white/60" />
        <div className="min-w-0">
          <h2 id="status-title" className="text-xs font-semibold uppercase tracking-wider text-brand-100">
            Student Quick Status
          </h2>
          <p className="mt-0.5 truncate font-display text-lg font-semibold">{profile?.fullName ?? user.fullName}</p>
        </div>
      </div>

      <dl className="divide-y divide-slate-100 px-5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 py-3">
            <dt className="text-sm text-slate-500">{label}</dt>
            <dd className="text-right text-sm font-medium text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="border-t border-slate-100 p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-slate-700">Enrolled Credits</span>
          <span className="text-sm text-slate-500">
            <strong className="text-lg font-semibold text-slate-900">{credits}</strong> / {MAX_CREDITS_PER_SEMESTER} max
          </span>
        </div>

        <div
          role="progressbar"
          aria-label="Enrolled credits"
          aria-valuemin={0}
          aria-valuemax={MAX_CREDITS_PER_SEMESTER}
          aria-valuenow={credits}
          className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-slate-100"
        >
          <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${percent}%` }} />
        </div>

        <p className="mt-2 text-xs text-slate-500">
          {remaining > 0
            ? `${remaining} credit${remaining === 1 ? '' : 's'} remaining this semester`
            : 'You have reached the maximum credit load.'}{' '}
          &middot; {enrolled.length} course{enrolled.length === 1 ? '' : 's'} selected
        </p>

        <Link to="/courses" className="btn-primary mt-4 w-full">
          <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
          Go to Course Selection
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

function AdminStatusCard() {
  const users = useAppStore((s) => s.users);
  const courses = useAppStore((s) => s.courses);
  const currentSemester = useAppStore((s) => s.currentSemester);
  const announcements = useAppStore((s) => s.announcements);

  const students = users.filter((u) => u.role === 'STUDENT');
  const stats: Array<[string, number]> = [
    ['Registered students', students.length],
    ['Profiles completed', students.filter((u) => u.isProfileCompleted).length],
    [`Courses (${currentSemester})`, courses.filter((c) => c.semester === currentSemester).length],
    ['Announcements', announcements.length],
  ];

  return (
    <section aria-labelledby="admin-status-title" className="card overflow-hidden">
      <div className="flex items-center gap-3 bg-gradient-to-br from-amber-600 to-amber-800 p-5 text-white">
        <ShieldCheck className="h-8 w-8" aria-hidden="true" />
        <h2 id="admin-status-title" className="font-display text-lg font-semibold">
          Administrator Overview
        </h2>
      </div>
      <dl className="divide-y divide-slate-100 px-5">
        {stats.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between py-3">
            <dt className="text-sm text-slate-500">{label}</dt>
            <dd className="text-lg font-semibold text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-slate-100 p-5">
        <Link to="/admin" className="btn-primary w-full">
          <Users className="h-4 w-4" aria-hidden="true" />
          Open Admin Management
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const user = useAppStore(selectCurrentUser);
  const profile = useAppStore(selectCurrentProfile);
  const semester = useAppStore((s) => s.currentSemester);
  if (!user) return null;

  const firstName = (profile?.fullName ?? user.fullName).split(' ')[0];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Welcome back, {firstName}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Here is what is happening on campus this {semester} semester.
        </p>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <AnnouncementBoard />
        </div>
        <aside className="order-first xl:order-none">
          {user.role === 'STUDENT' ? <StudentStatusCard /> : <AdminStatusCard />}
        </aside>
      </div>
    </div>
  );
}
