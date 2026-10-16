import { useState } from 'react';
import { Trash2 } from 'lucide-react';

/** Two-step delete: the first click arms the button, the second click confirms. */
export default function ConfirmDeleteButton({
  onConfirm, ariaLabel, warning,
}: {
  onConfirm: () => void;
  ariaLabel: string;
  warning?: string;
}) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        aria-label={ariaLabel}
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        Delete
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      {warning && <span className="text-xs text-red-600">{warning}</span>}
      <button
        type="button"
        onClick={() => { setArmed(false); onConfirm(); }}
        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
      >
        Confirm
      </button>
      <button type="button" onClick={() => setArmed(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
        Cancel
      </button>
    </span>
  );
}
