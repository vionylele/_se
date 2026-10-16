import type { CourseType } from '../types';

const TYPE_STYLES: Record<CourseType, string> = {
  Required: 'bg-rose-50 text-rose-700 ring-rose-200',
  Elective: 'bg-sky-50 text-sky-700 ring-sky-200',
  'General Education': 'bg-violet-50 text-violet-700 ring-violet-200',
  'Physical Education': 'bg-amber-50 text-amber-700 ring-amber-200',
};

export default function CourseTypeBadge({ type }: { type: CourseType }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TYPE_STYLES[type]}`}>
      {type}
    </span>
  );
}
