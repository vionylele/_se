import type { InputHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { FieldError } from './FormFeedback';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  icon?: LucideIcon;
  error?: string;
  /** Element rendered inside the right edge of the input (e.g., a show-password button). */
  trailing?: ReactNode;
}

export default function TextField({ id, label, icon: Icon, error, trailing, className = '', ...rest }: TextFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <Icon
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
        )}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`field-input ${Icon ? 'pl-10' : ''} ${trailing ? 'pr-11' : ''} ${error ? 'field-input-error' : ''} ${className}`}
          {...rest}
        />
        {trailing && <div className="absolute inset-y-0 right-0 flex items-center pr-2">{trailing}</div>}
      </div>
      <FieldError id={errorId} message={error} />
    </div>
  );
}
