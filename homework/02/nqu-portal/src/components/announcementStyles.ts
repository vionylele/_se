import { AlertTriangle, GraduationCap, Megaphone, type LucideIcon } from 'lucide-react';
import type { AnnouncementCategory } from '../types';

export const CATEGORY_STYLES: Record<AnnouncementCategory, { icon: LucideIcon; chip: string; accent: string }> = {
  Academic: { icon: GraduationCap, chip: 'bg-sky-100 text-sky-800', accent: 'border-l-sky-500' },
  General: { icon: Megaphone, chip: 'bg-slate-100 text-slate-700', accent: 'border-l-slate-400' },
  Urgent: { icon: AlertTriangle, chip: 'bg-red-100 text-red-700', accent: 'border-l-red-500' },
};
