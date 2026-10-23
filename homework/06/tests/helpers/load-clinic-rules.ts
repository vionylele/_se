/**
 * app.js is a browser ES module that touches `window` and the DOM at load time and has no
 * exports, and the assignment requires it to stay untouched. So instead of copying its rules,
 * this loader slices the real "Business rules" block out of app.js and evaluates it in
 * isolation. The unit tests therefore exercise the SHIPPED code, not a re-implementation.
 */
import { readAppJs, readConst } from './app-source';

export interface ClinicRules {
  ADMIN_EMAIL: string;
  SLOTS: number[];
  fmt: (m: number) => string;
  toMin: (t: string) => number;
  taipeiNow: () => { date: string; minutes: number };
  dayNum: (d: string) => number;
  slotError: (date: string, m: number, isAdmin?: boolean) => string;
  esc: (s: unknown) => string;
}

export function loadClinicRules(): ClinicRules {
  const src = readAppJs();
  const start = src.indexOf('const SLOTS = [];');
  const end = src.indexOf('/* ------------------------------ UI helpers');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Could not locate the business-rules block in app.js (markers changed?)');
  }
  const rulesBlock = src.slice(start, end);
  const escLine = src.split('\n').find((l) => l.startsWith('const esc ='));
  if (!escLine) throw new Error('esc() helper not found in app.js');

  const factory = new Function(
    'ADMIN_EMAIL',
    `${escLine}\n${rulesBlock}\nreturn { SLOTS, fmt, toMin, taipeiNow, dayNum, slotError, esc };`,
  );
  const adminEmail = readConst('ADMIN_EMAIL');
  return { ADMIN_EMAIL: adminEmail, ...factory(adminEmail) } as ClinicRules;
}
