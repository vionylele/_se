import { forwardRef } from 'react';
import TimetableGrid, { type CourseColor } from './TimetableGrid';
import { APP_NAME, UNIVERSITY_NAME, formatDate, formatSlots } from '../lib/academic';
import type { Course } from '../types';

export interface PrintableTimetableProps {
  studentName: string;
  studentId: string;
  department: string;
  academicYear: string;
  semester: string;
  courses: Course[];
  colors: Record<string, CourseColor>;
  totalCredits: number;
}

export const PRINT_SHEET_WIDTH = 1123; // A4 landscape at 96 dpi

/**
 * Off-screen, fixed-width layout that html2canvas turns into the PDF. It is deliberately styled
 * with a plain white background, solid colors, and tables only (no shadows, blur, or sticky parts)
 * so the exported file matches what is shown here.
 */
const PrintableTimetable = forwardRef<HTMLDivElement, PrintableTimetableProps>(function PrintableTimetable(
  { studentName, studentId, department, academicYear, semester, courses, colors, totalCredits },
  ref,
) {
  const info: Array<[string, string]> = [
    ['Student Name', studentName],
    ['Student ID', studentId],
    ['Department / Major', department],
    ['Semester', `${semester} Semester`],
    ['Academic Year', academicYear],
    ['Total Credits', `${totalCredits} Credits (${courses.length} Course${courses.length === 1 ? '' : 's'})`],
  ];

  return (
    <div
      ref={ref}
      id="timetable-print-sheet"
      style={{ width: PRINT_SHEET_WIDTH, backgroundColor: '#ffffff', color: '#0f172a', padding: 32 }}
    >
      {/* University header */}
      <div style={{ borderBottom: '3px solid #146155', paddingBottom: 12 }}>
        <h1 className="font-display" style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#12413b' }}>
          {UNIVERSITY_NAME} - Student Class Timetable
        </h1>
      </div>

      {/* Student information */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '10px 24px',
          margin: '14px 0 16px',
        }}
      >
        {info.map(([label, value]) => (
          <div key={label}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6, color: '#64748b' }}>
              {label}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{value}</div>
          </div>
        ))}
      </div>

      <TimetableGrid courses={courses} colors={colors} variant="print" />

      {/* Course list */}
      <table className="w-full border-collapse" style={{ marginTop: 16, fontSize: 10 }}>
        <thead>
          <tr style={{ backgroundColor: '#f1f5f9' }}>
            {['Course Code', 'Course Name', 'Credits', 'Instructor', 'Classroom', 'Meeting Times'].map((h) => (
              <th
                key={h}
                scope="col"
                style={{ border: '1px solid #cbd5e1', padding: '4px 6px', textAlign: 'left', fontWeight: 600 }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {courses.map((c) => {
            const color = colors[c.id];
            return (
              <tr key={c.id}>
                <td style={{ border: '1px solid #cbd5e1', padding: '4px 6px', fontWeight: 600 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      marginRight: 6,
                      borderRadius: 2,
                      backgroundColor: color?.border,
                    }}
                  />
                  {c.code}
                </td>
                <td style={{ border: '1px solid #cbd5e1', padding: '4px 6px' }}>{c.title}</td>
                <td style={{ border: '1px solid #cbd5e1', padding: '4px 6px' }}>{c.credits}</td>
                <td style={{ border: '1px solid #cbd5e1', padding: '4px 6px' }}>{c.instructor}</td>
                <td style={{ border: '1px solid #cbd5e1', padding: '4px 6px' }}>{c.classroom}</td>
                <td style={{ border: '1px solid #cbd5e1', padding: '4px 6px' }}>{formatSlots(c.slots)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p style={{ marginTop: 12, fontSize: 9, color: '#64748b' }}>
        Generated on {formatDate(new Date().toISOString())} from the {APP_NAME}. Period Z is the noon break (12:10 - 13:00).
      </p>
    </div>
  );
});

export default PrintableTimetable;
