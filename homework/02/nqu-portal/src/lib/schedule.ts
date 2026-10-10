import type { PeriodCode, TimetableSlot, Weekday } from '../types';
import { WEEKDAYS } from './academic';

const DAY_BY_PREFIX: Record<string, Weekday> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat',
};

export type ParsedSchedule = { ok: true; slots: TimetableSlot[] } | { ok: false; error: string };

const error = (message: string): ParsedSchedule => ({ ok: false, error: message });

/**
 * Parses free-form schedule text into timetable slots.
 *   "Tue 3-4"            -> Tue periods 3, 4
 *   "Mon 2-4, Wed 1"     -> Mon 2, 3, 4 and Wed 1
 *   "Wed Z"              -> Wed noon break
 * Numeric ranges never include Z; write Z explicitly if the noon break is needed.
 */
export function parseSchedule(input: string): ParsedSchedule {
  const text = input.trim().replace(/[\u2013\u2014]/g, '-').replace(/[;,]/g, ' ');
  if (text === '') return error('Please enter the day and periods, for example "Tue 3-4".');

  const slots: TimetableSlot[] = [];
  const seen = new Set<string>();
  let day: Weekday | null = null;
  let periodsForDay = 0;

  for (const raw of text.split(/\s+/)) {
    const token = raw.toLowerCase();

    const dayMatch = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*$/.exec(token);
    if (dayMatch) {
      if (dayMatch[1] === 'sun') return error('Sunday classes are not supported. Please use Monday to Saturday.');
      if (day && periodsForDay === 0) return error(`Please add at least one period after "${day}".`);
      day = DAY_BY_PREFIX[dayMatch[1]];
      periodsForDay = 0;
      continue;
    }

    if (!day) return error('Start with a day, for example "Tue 3-4".');

    let periods: PeriodCode[] | null = null;
    if (token === 'z') {
      periods = ['Z'];
    } else if (/^[1-9]$/.test(token)) {
      periods = [token as PeriodCode];
    } else {
      const range = /^([1-9])-([1-9])$/.exec(token);
      if (range) {
        const from = Number(range[1]);
        const to = Number(range[2]);
        if (from > to) return error(`"${raw}" is not a valid range. Use ascending periods such as 3-4.`);
        periods = [];
        for (let p = from; p <= to; p += 1) periods.push(String(p) as PeriodCode);
      }
    }
    if (!periods) {
      return error(`"${raw}" was not recognized. Use days (Mon-Sat) and periods 1-9 or Z, e.g., "Tue 3-4, Thu 6".`);
    }

    for (const period of periods) {
      const key = `${day}:${period}`;
      if (!seen.has(key)) {
        seen.add(key);
        slots.push({ day, period });
      }
    }
    periodsForDay += periods.length;
  }

  if (day && periodsForDay === 0) return error(`Please add at least one period after "${day}".`);
  return { ok: true, slots };
}

/** Inverse of parseSchedule: [Mon 2,3,4 + Wed 1] -> "Mon 2-4, Wed 1". */
export function slotsToText(slots: TimetableSlot[]): string {
  const byDay = new Map<Weekday, PeriodCode[]>();
  for (const s of slots) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s.period]);

  return WEEKDAYS.filter((d) => byDay.has(d))
    .map((day) => {
      const periods = byDay.get(day)!;
      const numbers = periods.filter((p) => p !== 'Z').map(Number).sort((a, b) => a - b);
      const parts: string[] = [];
      let i = 0;
      while (i < numbers.length) {
        let j = i;
        while (j + 1 < numbers.length && numbers[j + 1] === numbers[j] + 1) j += 1;
        parts.push(i === j ? String(numbers[i]) : `${numbers[i]}-${numbers[j]}`);
        i = j + 1;
      }
      if (periods.includes('Z')) parts.push('Z');
      return `${day} ${parts.join(' ')}`;
    })
    .join(', ');
}
