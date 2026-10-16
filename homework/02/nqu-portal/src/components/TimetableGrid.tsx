import { useMemo } from 'react';
import { PERIODS, WEEKDAYS, WEEKDAY_NAMES } from '../lib/academic';
import { buildTimetable } from '../store/useAppStore';
import type { Course, Weekday } from '../types';

// ---------------------------------------------------------------------------
// Course colors (inline hex values so the PDF renderer reproduces them exactly)
// ---------------------------------------------------------------------------

export interface CourseColor {
  bg: string;
  border: string;
  text: string;
}

const PALETTE: CourseColor[] = [
  { bg: '#d1fae5', border: '#6ee7b7', text: '#065f46' },
  { bg: '#dbeafe', border: '#93c5fd', text: '#1e3a8a' },
  { bg: '#fef3c7', border: '#fcd34d', text: '#78350f' },
  { bg: '#ede9fe', border: '#c4b5fd', text: '#4c1d95' },
  { bg: '#ffe4e6', border: '#fda4af', text: '#881337' },
  { bg: '#cffafe', border: '#67e8f9', text: '#164e63' },
  { bg: '#ffedd5', border: '#fdba74', text: '#7c2d12' },
  { bg: '#e0e7ff', border: '#a5b4fc', text: '#312e81' },
  { bg: '#ecfccb', border: '#bef264', text: '#365314' },
  { bg: '#fae8ff', border: '#f0abfc', text: '#701a75' },
  { bg: '#ccfbf1', border: '#5eead4', text: '#134e4a' },
  { bg: '#fce7f3', border: '#f9a8d4', text: '#831843' },
];

/** Gives every course a stable color for the current list (cycles if there are more than 12). */
export function assignCourseColors(courses: Course[]): Record<string, CourseColor> {
  const colors: Record<string, CourseColor> = {};
  courses.forEach((course, i) => {
    colors[course.id] = PALETTE[i % PALETTE.length];
  });
  return colors;
}

// ---------------------------------------------------------------------------
// Grid model: consecutive periods of the same course are merged into one tall cell
// ---------------------------------------------------------------------------

type GridCell =
  | { kind: 'empty' }
  | { kind: 'covered' } // swallowed by the rowSpan of the cell above
  | { kind: 'course'; courses: Course[]; span: number };

function buildGrid(courses: Course[], days: Weekday[]): Map<Weekday, GridCell[]> {
  const lookup = new Map<string, Course[]>();
  for (const entry of buildTimetable(courses)) {
    const key = `${entry.day}:${entry.period}`;
    lookup.set(key, [...(lookup.get(key) ?? []), entry.course]);
  }

  const grid = new Map<Weekday, GridCell[]>();
  for (const day of days) {
    const cells: GridCell[] = [];
    let i = 0;
    while (i < PERIODS.length) {
      const here = lookup.get(`${day}:${PERIODS[i].code}`);
      if (!here) {
        cells.push({ kind: 'empty' });
        i += 1;
        continue;
      }
      let span = 1;
      if (here.length === 1) {
        while (i + span < PERIODS.length) {
          const next = lookup.get(`${day}:${PERIODS[i + span].code}`);
          if (next && next.length === 1 && next[0].id === here[0].id) span += 1;
          else break;
        }
      }
      cells.push({ kind: 'course', courses: here, span });
      for (let k = 1; k < span; k += 1) cells.push({ kind: 'covered' });
      i += span;
    }
    grid.set(day, cells);
  }
  return grid;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const VARIANTS = {
  screen: {
    table: 'min-w-[880px] text-xs',
    row: 'h-[72px]',
    headCell: 'px-3 py-3 text-sm',
    rowHead: 'px-3 py-2',
    block: 'p-2 text-xs',
    title: 'text-[13px]',
    firstCol: 148,
  },
  print: {
    table: 'text-[10px]',
    row: 'h-[54px]',
    headCell: 'px-2 py-2 text-[11px]',
    rowHead: 'px-2 py-1',
    block: 'p-1.5 text-[9px]',
    title: 'text-[10.5px]',
    firstCol: 118,
  },
} as const;

const NOON_BG = '#fffbeb';

function CourseText({ course, titleClass }: { course: Course; titleClass: string }) {
  return (
    <>
      <div className="text-[0.85em] font-bold uppercase tracking-wide opacity-70">{course.code}</div>
      <div className={`font-semibold leading-snug ${titleClass}`}>{course.title}</div>
      <div className="mt-0.5 leading-snug opacity-90">{course.instructor}</div>
      <div className="leading-snug opacity-90">{course.classroom}</div>
    </>
  );
}

export default function TimetableGrid({
  courses,
  colors,
  variant = 'screen',
}: {
  courses: Course[];
  colors: Record<string, CourseColor>;
  variant?: 'screen' | 'print';
}) {
  const v = VARIANTS[variant];

  // Monday-Friday always; Saturday only appears if an enrolled course meets on Saturday.
  const days = useMemo(() => {
    const hasSaturday = courses.some((c) => c.slots.some((s) => s.day === 'Sat'));
    return WEEKDAYS.filter((d) => d !== 'Sat' || hasSaturday);
  }, [courses]);

  const grid = useMemo(() => buildGrid(courses, days), [courses, days]);

  return (
    <table className={`w-full table-fixed border-collapse bg-white ${v.table}`}>
      <colgroup>
        <col style={{ width: v.firstCol }} />
        {days.map((d) => (
          <col key={d} />
        ))}
      </colgroup>

      <thead>
        <tr>
          <th scope="col" className={`border border-brand-800 bg-brand-800 text-left font-semibold text-white ${v.headCell}`}>
            Period / Time
          </th>
          {days.map((d) => (
            <th
              key={d}
              scope="col"
              className={`border border-brand-800 bg-brand-700 text-center font-semibold text-white ${v.headCell}`}
            >
              {WEEKDAY_NAMES[d]}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {PERIODS.map((period, rowIndex) => (
          <tr key={period.code} className={v.row}>
            <th
              scope="row"
              className={`border border-slate-300 text-left align-middle font-normal ${v.rowHead} ${
                period.isNoonBreak ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-700'
              }`}
            >
              <div className="font-semibold">{period.label}</div>
              <div className="opacity-80">
                {period.start} - {period.end}
              </div>
            </th>

            {days.map((day) => {
              const cell = grid.get(day)?.[rowIndex];
              if (!cell || cell.kind === 'covered') return null;

              if (cell.kind === 'empty') {
                return (
                  <td
                    key={day}
                    className="border border-slate-300"
                    style={period.isNoonBreak ? { backgroundColor: NOON_BG } : undefined}
                  />
                );
              }

              // Normal case: exactly one course, so the cell itself carries the color.
              if (cell.courses.length === 1) {
                const course = cell.courses[0];
                const color = colors[course.id] ?? PALETTE[0];
                return (
                  <td
                    key={day}
                    rowSpan={cell.span}
                    className={`align-top ${v.block}`}
                    style={{
                      backgroundColor: color.bg,
                      color: color.text,
                      border: `1px solid ${color.border}`,
                      borderLeft: `4px solid ${color.text}`,
                    }}
                  >
                    <CourseText course={course} titleClass={v.title} />
                  </td>
                );
              }

              // Defensive: overlapping courses (should be blocked by the store) are stacked.
              return (
                <td key={day} className="border border-slate-300 align-top">
                  {cell.courses.map((course) => {
                    const color = colors[course.id] ?? PALETTE[0];
                    return (
                      <div key={course.id} className={v.block} style={{ backgroundColor: color.bg, color: color.text }}>
                        <CourseText course={course} titleClass={v.title} />
                      </div>
                    );
                  })}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
