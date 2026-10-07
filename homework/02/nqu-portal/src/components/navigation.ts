import {
  BookOpenCheck,
  CalendarDays,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '../types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  end?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['STUDENT', 'ADMIN'], end: true },
  { to: '/courses', label: 'Course Selection', icon: BookOpenCheck, roles: ['STUDENT'] },
  { to: '/schedule', label: 'Class Schedule', icon: CalendarDays, roles: ['STUDENT'] },
  { to: '/transcript', label: 'Academic Transcript', icon: ScrollText, roles: ['STUDENT'] },
  { to: '/admin', label: 'Admin Management', icon: ShieldCheck, roles: ['ADMIN'] },
];

export const navItemsForRole = (role: Role): NavItem[] => NAV_ITEMS.filter((item) => item.roles.includes(role));

export function titleForPath(pathname: string): string {
  const match = NAV_ITEMS.find((item) => (item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)));
  return match?.label ?? 'Dashboard';
}
