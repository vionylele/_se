import { useMemo, useRef, useState } from 'react';
import { Award, Download, FlaskConical, Library, Loader2, ShieldCheck, TrendingUp, type LucideIcon } from 'lucide-react';
import TranscriptDocument, { type TranscriptStudent } from '../components/TranscriptDocument';
import { FormAlert } from '../components/ui/FormFeedback';
import {
  UNIVERSITY_NAME,
  computeGpa,
  formatDate,
  getAcademicStanding,
  groupGradesBySemester,
  type StandingTone,
} from '../lib/academic';
import { exportElementToPdf } from '../lib/pdf';
import { selectCurrentProfile, selectCurrentUser, useAppStore } from '../store/useAppStore';

const TONE_STYLES: Record<StandingTone, { icon: string; value: string }> = {
  excellent: { icon: 'bg-amber-100 text-amber-700', value: 'text-amber-700' },
  good: { icon: 'bg-emerald-100 text-emerald-700', value: 'text-emerald-700' },
  warning: { icon: 'bg-red-100 text-red-700', value: 'text-red-700' },
  none: { icon: 'bg-slate-100 text-slate-500', value: 'text-slate-600' },
};

function StatCard({
  icon: Icon, label, value, sub, iconClass = 'bg-brand-50 text-brand-700', valueClass = 'text-slate-900',
}: {
  icon: LucideIcon; label: string; value: string; sub: string; iconClass?: string; valueClass?: string;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconClass}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="text-sm font-medium text-slate-500">{label}</p>
      </div>
      <p className={`mt-3 font-display text-3xl font-semibold ${valueClass}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
    </div>
  );
}

export default function GradeReport() {
  const user = useAppStore(selectCurrentUser);
  const profile = useAppStore(selectCurrentProfile);
  const grades = useAppStore((s) => s.grades);
  const loadDemoTranscript = useAppStore((s) => s.loadDemoTranscript);

  const sheetRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<{ variant: 'error' | 'success'; text: string } | null>(null);

  const myGrades = useMemo(() => (user ? grades.filter((g) => g.userId === user.id) : []), [grades, user]);
  const groups = useMemo(() => groupGradesBySemester(myGrades), [myGrades]);
  const cumulative = useMemo(() => computeGpa(myGrades), [myGrades]);
  const standing = useMemo(() => getAcademicStanding(groups, cumulative), [groups, cumulative]);

  if (!user) return null;

  const latest = groups[groups.length - 1];
  const hasGrades = groups.length > 0;
  const tone = TONE_STYLES[standing.tone];

  const student: TranscriptStudent = {
    name: profile?.fullName ?? user.fullName,
    studentId: profile?.studentId ?? '-',
    dateOfBirth: profile?.dateOfBirth ?? '',
    nationality: profile?.nationality ?? '-',
    department: profile?.department ?? '-',
    academicYear: profile?.academicYear ?? '-',
    photoDataUrl: profile?.photoDataUrl ?? null,
  };
  const issuedOn = formatDate(new Date().toISOString());

  const handleDownload = async () => {
    if (!sheetRef.current) return;
    setMessage(null);
    setExporting(true);
    try {
      await exportElementToPdf(sheetRef.current, {
        filename: `Official-Transcript-${student.studentId}.pdf`,
        title: `${UNIVERSITY_NAME} - Official Academic Transcript`,
        orientation: 'portrait',
        paginate: true,
      });
    } catch (err) {
      console.error('Transcript export failed', err);
      setMessage({ variant: 'error', text: 'The transcript PDF could not be generated. Please try again.' });
    } finally {
      setExporting(false);
    }
  };

  const handleLoadSample = () => {
    const result = loadDemoTranscript();
    setMessage(result.ok ? { variant: 'success', text: 'Sample grade records have been loaded.' } : { variant: 'error', text: result.message });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Academic Transcript</h2>
          <p className="mt-1 text-sm text-slate-600">Your complete grade record on the Taiwan 4.3 GPA scale.</p>
        </div>
        <button type="button" onClick={handleDownload} disabled={exporting || !hasGrades} className="btn-primary"
          title={hasGrades ? undefined : 'No grade records are available to export.'}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
          {exporting ? 'Generating PDF...' : 'Download Official Transcript (PDF)'}
        </button>
      </header>

      <FormAlert message={message?.text} variant={message?.variant} onDismiss={() => setMessage(null)} />

      {hasGrades ? (
        <section aria-label="Summary statistics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={TrendingUp} label="Semester GPA" value={latest.summary.gpa.toFixed(2)}
            sub={`${latest.label} \u00b7 ${latest.summary.attemptedCredits} credits attempted`} />
          <StatCard icon={Award} label="Cumulative GPA" value={cumulative.gpa.toFixed(2)} sub="Out of 4.3 (Taiwan scale)" />
          <StatCard icon={Library} label="Total Earned Credits" value={String(cumulative.earnedCredits)}
            sub={`of ${cumulative.attemptedCredits} credits attempted`} />
          <StatCard icon={ShieldCheck} label="Academic Standing" value={standing.label} sub={standing.detail}
            iconClass={tone.icon} valueClass={`!text-2xl ${tone.value}`} />
        </section>
      ) : (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <Library className="h-6 w-6" aria-hidden="true" />
          </span>
          <h3 className="font-display text-lg font-semibold text-slate-900">No grade records yet</h3>
          <p className="max-w-md text-sm text-slate-600">
            Grades appear here after the Registrar&apos;s Office posts them. To preview the transcript layout and PDF,
            you can load a set of sample records.
          </p>
          <button type="button" onClick={handleLoadSample} className="btn-secondary">
            <FlaskConical className="h-4 w-4" aria-hidden="true" />
            Load Sample Grades (Demo)
          </button>
        </div>
      )}

      {hasGrades && (
        <section aria-label="Transcript" className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
          <div className="min-w-[720px]">
            <TranscriptDocument student={student} groups={groups} cumulative={cumulative} standing={standing} issuedOn={issuedOn} />
          </div>
        </section>
      )}

      {/* Hidden fixed-width copy captured for the PDF */}
      {hasGrades && (
        <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 0 }}>
          <TranscriptDocument ref={sheetRef} variant="print" student={student} groups={groups}
            cumulative={cumulative} standing={standing} issuedOn={issuedOn} />
        </div>
      )}
    </div>
  );
}
