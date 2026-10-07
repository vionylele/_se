import type { ReactNode } from 'react';
import { FieldError } from './FormFeedback';

/** Class string for native inputs/selects/textareas, with the error state applied. */
export const fieldClass = (error?: string): string => `field-input ${error ? 'field-input-error' : ''}`;

/** Label + control + hint/error wrapper. Give the child control the same `id`. */
export default function FormField({
  id, label, error, hint, children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}
