import { forwardRef } from 'react';
import { GraduationCap } from 'lucide-react';
import {
  GRADE_SCALE,
  UNIVERSITY_NAME,
  formatDateOnly,
  type AcademicStanding,
  type GpaSummary,
  type SemesterGroup,
} from '../lib/academic';

export interface TranscriptStudent {
  name: string;
  studentId: string;
  dateOfBirth: string;
  nationality: string;
  department: string;
  academicYear: string;
  photoDataUrl: string | null;
}

export interface TranscriptDocumentProps {
  student: TranscriptStudent;
  groups: SemesterGroup[];
  cumulative: GpaSummary;
  standing: AcademicStanding;
  issuedOn: string;
  variant?: 'screen' | 'print';
}

export const TRANSCRIPT_PRINT_WIDTH = 720; // maps to A4 portrait with 10 mm margins

const SIZES = {
  screen: { root: 'text-sm p-6 sm:p-10', cell: 'px-3 py-2', head: 'px-3 py-2.5 text-xs' },
  print: { root: 'text-[12px] p-7', cell: 'px-2 py-1.5', head: 'px-2 py-2 text-[10.5px]' },
} as const;

const TH = 'border border-brand-800 bg-brand-800 text-left font-semibold uppercase tracking-wide text-white';
const TD = 'border border-slate-300';

/**
 * The transcript "paper". Used twice: on screen (responsive) and as the hidden fixed-width copy that
 * html2canvas captures for the PDF. Elements marked data-pdf-block are the only places a page may break.
 */
const TranscriptDocument = forwardRef<HTMLDivElement, TranscriptDocumentProps>(function TranscriptDocument(
  { student, groups, cumulative, standing, issuedOn, variant = 'screen' },
  ref,
) {
  const v = SIZES[variant];
  const bio: Array<[string, string]> = [
    ['Student Name', student.name],
    ['Student ID', student.studentId],
    ['Date of Birth', formatDateOnly(student.dateOfBirth)],
    ['Nationality', student.nationality],
    ['Department / Major', student.department],
    ['Program Level', 'Undergraduate'],
    ['Academic Year', student.academicYear],
  ];

  return (
    <div
      ref={ref}
      id={variant === 'print' ? 'transcript-print-sheet' : undefined}
      className={`bg-white text-slate-900 ${v.root}`}
      style={variant === 'print' ? { width: TRANSCRIPT_PRINT_WIDTH } : undefined}
    >
      {/* Institution header */}
      <header data-pdf-block="true" className="flex items-center gap-4 border-b-[3px] border-double border-brand-800 pb-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-brand-700 text-brand-700">
          <GraduationCap className="h-7 w-7" aria-hidden="true" />
        </span>
        <div className="flex-1 text-center">
          <h1 className="font-display text-2xl font-bold text-brand-900">{UNIVERSITY_NAME}</h1>
          <p className="text-[0.8em] uppercase tracking-[0.25em] text-slate-500">Office of the Registrar</p>
          <p className="mt-2 text-[1.1em] font-semibold uppercase tracking-widest text-slate-800">Official Academic Transcript</p>
        </div>
        <span className="w-14 shrink-0" aria-hidden="true" />
      </header>

      {/* Student biography */}
      <section data-pdf-block="true" className="mt-4 flex items-start gap-5">
        <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2.5">
          {bio.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[0.75em] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        {student.photoDataUrl && (
          <img src={student.photoDataUrl} alt="" className="h-24 w-24 shrink-0 border border-slate-300 object-cover" />
        )}
      </section>

      {/* Academic record */}
      <table className="mt-5 w-full border-collapse">
        <thead>
          <tr>
            <th scope="col" className={`${TH} ${v.head}`}>Semester</th>
            <th scope="col" className={`${TH} ${v.head}`}>Course Code</th>
            <th scope="col" className={`${TH} ${v.head}`}>Course Title</th>
            <th scope="col" className={`${TH} ${v.head} text-center`}>Credits</th>
            <th scope="col" className={`${TH} ${v.head} text-center`}>Numeric Score</th>
            <th scope="col" className={`${TH} ${v.head} text-center`}>Letter Grade</th>
            <th scope="col" className={`${TH} ${v.head} text-center`}>Grade Point</th>
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.semester} data-pdf-block="true">
            {group.records.map((r, i) => {
              const failed = r.letterGrade === 'F';
              return (
                <tr key={r.id} style={failed ? { color: '#b91c1c' } : undefined}>
                  {i === 0 && (
                    <th
                      scope="rowgroup"
                      rowSpan={group.records.length + 1}
                      className={`${TD} ${v.cell} bg-slate-50 text-left align-top font-semibold text-slate-800`}
                    >
                      {group.label}
                    </th>
                  )}
                  <td className={`${TD} ${v.cell} whitespace-nowrap font-medium`}>{r.courseCode}</td>
                  <td className={`${TD} ${v.cell}`}>{r.courseTitle}</td>
                  <td className={`${TD} ${v.cell} text-center tabular-nums`}>{r.credits}</td>
                  <td className={`${TD} ${v.cell} text-center tabular-nums`}>{Math.round(r.score)}</td>
                  <td className={`${TD} ${v.cell} text-center font-semibold`}>{r.letterGrade}</td>
                  <td className={`${TD} ${v.cell} text-center tabular-nums`}>{r.gradePoint.toFixed(1)}</td>
                </tr>
              );
            })}
            <tr className="bg-slate-50 font-semibold">
              <td colSpan={2} className={`${TD} ${v.cell}`}>Semester Summary</td>
              <td className={`${TD} ${v.cell} text-center tabular-nums`}>{group.summary.attemptedCredits}</td>
              <td colSpan={3} className={`${TD} ${v.cell} text-center`}>
                Semester GPA: {group.summary.gpa.toFixed(2)} &middot; Earned Credits: {group.summary.earnedCredits}
              </td>
            </tr>
          </tbody>
        ))}
      </table>

      {/* Cumulative summary */}
      <section data-pdf-block="true" className="mt-5 grid grid-cols-4 gap-3">
        {[
          ['Cumulative GPA (4.3 Scale)', cumulative.gpa.toFixed(2)],
          ['Credits Attempted', String(cumulative.attemptedCredits)],
          ['Credits Earned', String(cumulative.earnedCredits)],
          ['Academic Standing', standing.label],
        ].map(([label, value]) => (
          <div key={label} className="border border-slate-300 bg-slate-50 p-3 text-center">
            <div className="text-[0.75em] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-1 text-[1.25em] font-bold text-brand-900">{value}</div>
          </div>
        ))}
      </section>

      {/* Grading system */}
      <section data-pdf-block="true" className="mt-5">
        <h2 className="mb-1.5 text-[0.8em] font-semibold uppercase tracking-wide text-slate-600">
          Grading System (Taiwan 4.3 Scale)
        </h2>
        <table className="w-full border-collapse text-center text-[0.9em]">
          <tbody>
            <tr>
              <th scope="row" className={`${TD} bg-slate-100 px-2 py-1 text-left`}>Letter Grade</th>
              {GRADE_SCALE.map((g) => <td key={g.letter} className={`${TD} px-1 py-1 font-semibold`}>{g.letter}</td>)}
            </tr>
            <tr>
              <th scope="row" className={`${TD} bg-slate-100 px-2 py-1 text-left`}>Score</th>
              {GRADE_SCALE.map((g) => (
                <td key={g.letter} className={`${TD} px-1 py-1`}>{g.letter === 'F' ? '< 60' : `${g.minScore}-${g.maxScore}`}</td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={`${TD} bg-slate-100 px-2 py-1 text-left`}>Grade Point</th>
              {GRADE_SCALE.map((g) => <td key={g.letter} className={`${TD} px-1 py-1`}>{g.gradePoint.toFixed(1)}</td>)}
            </tr>
          </tbody>
        </table>
        <p className="mt-1 text-[0.85em] text-slate-500">Minimum passing grade for undergraduate students: C- (60).</p>
      </section>

      {/* Signature footer */}
      <footer data-pdf-block="true" className="mt-8">
        <div className="grid grid-cols-3 gap-8 pt-8">
          <div className="border-t border-slate-500 pt-1 text-center text-[0.85em]">Registrar&apos;s Signature</div>
          <div className="text-center text-[0.85em]">
            <div className="pb-1 font-semibold">{issuedOn}</div>
            <div className="border-t border-slate-500 pt-1">Date of Issue</div>
          </div>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-slate-400 text-center text-[0.7em] leading-tight text-slate-400">
            Official
            <br />
            Seal
          </div>
        </div>
        <p className="mt-4 text-[0.8em] leading-relaxed text-slate-500">
          This transcript is system-generated. It is valid only when it bears the university seal and the Registrar&apos;s signature.
        </p>
      </footer>
    </div>
  );
});

export default TranscriptDocument;
