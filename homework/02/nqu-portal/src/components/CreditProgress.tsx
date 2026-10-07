import { MAX_CREDITS_PER_SEMESTER } from '../lib/academic';

export default function CreditProgress({
  credits,
  max = MAX_CREDITS_PER_SEMESTER,
}: {
  credits: number;
  max?: number;
}) {
  const percent = Math.min(100, Math.round((credits / max) * 100));
  const remaining = max - credits;
  const barColor = credits >= max ? 'bg-red-500' : credits >= max - 5 ? 'bg-amber-500' : 'bg-brand-600';

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium text-slate-700">
          Total Enrolled:{' '}
          <strong className="text-base font-semibold text-slate-900">
            {credits} / {max} Credits
          </strong>
        </p>
        <p className="text-xs text-slate-500">
          {remaining > 0
            ? `${remaining} credit${remaining === 1 ? '' : 's'} remaining`
            : 'Maximum credit load reached'}
        </p>
      </div>
      <div
        role="progressbar"
        aria-label="Total enrolled credits"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={credits}
        className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100"
      >
        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
