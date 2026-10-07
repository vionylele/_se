import { ShieldCheck, UserRound } from 'lucide-react';
import type { Role } from '../types';

const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-lg',
  xl: 'h-24 w-24 text-2xl',
} as const;

export function Avatar({
  name,
  src,
  size = 'md',
  className = '',
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

  if (src) {
    return (
      <img
        src={src}
        alt={`${name}'s profile photo`}
        className={`${SIZES[size]} shrink-0 rounded-full object-cover ring-2 ring-white ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${SIZES[size]} inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-800 ring-2 ring-white ${className}`}
    >
      {initials || '?'}
    </span>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  const isAdmin = role === 'ADMIN';
  const Icon = isAdmin ? ShieldCheck : UserRound;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
        isAdmin ? 'bg-amber-100 text-amber-800' : 'bg-brand-100 text-brand-800'
      }`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {isAdmin ? 'Admin' : 'Student'}
    </span>
  );
}
