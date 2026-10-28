/**
 * UNIT TESTS - client & logic layer.
 * The scheduling rules are loaded from the real homework/03/Clinic_System/app.js (see
 * helpers/load-clinic-rules.ts), so a regression in the app breaks these tests.
 *
 * Clock: Asia/Taipei = UTC+8. `setNow('2026-10-23', '10:30')` pins the app's "now" to that
 * Taipei wall-clock time via Vitest fake timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadClinicRules } from '../helpers/load-clinic-rules';
import { readAppJs, readSchema } from '../helpers/app-source';
import { getRole } from '../helpers/roles';
import {
  classifyTaiwanId, isValidTaiwanId, isValidTaiwanPhone, validateProfile,
} from '../helpers/profile-validator';

const rules = loadClinicRules();
const { SLOTS, fmt, toMin, slotError, taipeiNow, esc, ADMIN_EMAIL } = rules;

const FAR_DATE = '2026-12-01'; // far enough ahead that the 1-hour rule never interferes
const setNow = (date: string, hhmm: string) => vi.setSystemTime(new Date(`${date}T${hhmm}:00+08:00`));

beforeEach(() => { vi.useFakeTimers(); setNow('2026-10-23', '10:30'); });
afterEach(() => { vi.useRealTimers(); });

/* ------------------------------------------------------------------ */
describe('Time slot & break guard', () => {
  it('generates 21 thirty-minute slots from 08:00 to 20:30', () => {
    expect(SLOTS).toHaveLength(21);
    expect(fmt(SLOTS[0])).toBe('08:00');
    expect(fmt(SLOTS[SLOTS.length - 1])).toBe('20:30');
  });

  it.each(['08:00', '11:30', '13:30', '16:30', '18:00', '20:30'])('accepts bookable slot %s', (t) => {
    expect(slotError(FAR_DATE, toMin(t))).toBe('');
  });

  describe('lunch break 12:00-13:30', () => {
    it.each(['12:00', '12:30', '13:00'])('rejects %s', (t) => {
      expect(slotError(FAR_DATE, toMin(t))).toMatch(/clinic hours.*breaks/i);
      expect(SLOTS).not.toContain(toMin(t));
    });
    it('13:30 is the first slot after lunch', () => expect(SLOTS).toContain(toMin('13:30')));
  });

  describe('dinner break 17:00-18:00', () => {
    it.each(['17:00', '17:30'])('rejects %s', (t) => {
      expect(slotError(FAR_DATE, toMin(t))).toMatch(/clinic hours.*breaks/i);
      expect(SLOTS).not.toContain(toMin(t));
    });
    it('18:00 is the first slot after dinner', () => expect(SLOTS).toContain(toMin('18:00')));
  });

  it.each(['07:30', '21:00', '23:30', '00:00'])('rejects out-of-hours slot %s', (t) => {
    expect(slotError(FAR_DATE, toMin(t))).not.toBe('');
  });

  it('rejects times that are not on the 30-minute grid', () => {
    expect(slotError(FAR_DATE, toMin('09:15'))).not.toBe('');
    expect(slotError(FAR_DATE, toMin('14:45'))).not.toBe('');
  });

  it('applies break rules to the admin as well (admin is exempt only from lead time)', () => {
    expect(slotError(FAR_DATE, toMin('12:30'), true)).not.toBe('');
    expect(slotError(FAR_DATE, toMin('17:00'), true)).not.toBe('');
  });

  it('no generated slot ever falls inside a break window', () => {
    for (const m of SLOTS) {
      expect(m >= 720 && m < 810).toBe(false);
      expect(m >= 1020 && m < 1080).toBe(false);
    }
  });

  it('fmt/toMin round-trip', () => {
    for (const m of SLOTS) expect(toMin(fmt(m))).toBe(m);
  });
});

/* ------------------------------------------------------------------ */
describe('1-hour advance-notice validation', () => {
  const TODAY = '2026-10-23';

  it('rejects a slot 30 minutes away', () => {
    setNow(TODAY, '10:30');
    expect(slotError(TODAY, toMin('11:00'))).toMatch(/at least 1 hour/i);
  });

  it('rejects a slot 59 minutes away (boundary - 1)', () => {
    setNow(TODAY, '10:31');
    expect(slotError(TODAY, toMin('11:30'))).toMatch(/at least 1 hour/i);
  });

  it('accepts a slot exactly 60 minutes away (boundary)', () => {
    setNow(TODAY, '10:30');
    expect(slotError(TODAY, toMin('11:30'))).toBe('');
  });

  it('accepts a slot 61+ minutes away', () => {
    setNow(TODAY, '10:29');
    expect(slotError(TODAY, toMin('11:30'))).toBe('');
    setNow(TODAY, '08:00');
    expect(slotError(TODAY, toMin('14:00'))).toBe('');
  });

  it('rejects slots that already passed today', () => {
    setNow(TODAY, '15:00');
    expect(slotError(TODAY, toMin('09:00'))).toMatch(/at least 1 hour/i);
  });

  it('rejects dates in the past', () => {
    expect(slotError('2026-10-22', toMin('14:00'))).toMatch(/at least 1 hour/i);
  });

  it('measures the lead time across midnight (next-day 08:00 booked at 21:45 -> accepted)', () => {
    setNow(TODAY, '21:45');
    expect(slotError('2026-10-24', toMin('08:00'))).toBe('');
  });

  it('uses Asia/Taipei, not UTC: 00:30 UTC on the 24th is 08:30 Taipei', () => {
    vi.setSystemTime(new Date('2026-10-24T00:30:00Z'));
    expect(taipeiNow()).toEqual({ date: '2026-10-24', minutes: 8 * 60 + 30 });
    // 09:00 Taipei is only 30 minutes away, so it must be rejected
    expect(slotError('2026-10-24', toMin('09:00'))).toMatch(/at least 1 hour/i);
    expect(slotError('2026-10-24', toMin('09:30'))).toBe('');
  });

  it('admin bypasses the lead-time rule', () => {
    setNow(TODAY, '10:30');
    expect(slotError(TODAY, toMin('11:00'), true)).toBe('');
  });

  it('crosses month/year boundaries correctly', () => {
    vi.setSystemTime(new Date('2026-12-31T20:00:00+08:00'));
    expect(slotError('2027-01-01', toMin('08:00'))).toBe('');
    expect(slotError('2026-12-31', toMin('20:30'))).toMatch(/at least 1 hour/i);
  });
});

/* ------------------------------------------------------------------ */
describe('Role & account validation', () => {
  it('the app declares vionylee07@gmail.com as admin', () => expect(ADMIN_EMAIL).toBe('vionylee07@gmail.com'));

  it('identifies the admin email as ADMIN', () => expect(getRole('vionylee07@gmail.com', ADMIN_EMAIL)).toBe('ADMIN'));
  it('is case-insensitive for the admin email', () => {
    expect(getRole('Vionylee07@Gmail.com', ADMIN_EMAIL)).toBe('ADMIN');
    expect(getRole('VIONYLEE07@GMAIL.COM', ADMIN_EMAIL)).toBe('ADMIN');
  });
  it.each(['patient@example.com', 'viony07@gmail.com', 'vionylee08@gmail.com', 'xvionylee07@gmail.com', 'vionylee07@gmail.com.tw', 'vionylee07@gmail.co', ''])(
    'identifies %j as PATIENT', (email) => expect(getRole(email, ADMIN_EMAIL)).toBe('PATIENT'));

  describe('source contract (fails if app.js / schema.sql drift from the helper)', () => {
    it('app.js derives isAdmin with a lower-cased exact match on ADMIN_EMAIL', () => {
      expect(readAppJs()).toContain('state.isAdmin = session.user.email.toLowerCase() === ADMIN_EMAIL;');
    });
    it('the database is_admin() function uses the same admin email', () => {
      expect(readSchema()).toContain(`= '${ADMIN_EMAIL}'`);
    });
    it('cancellation reason is mandatory (>= 3 chars) in app.js', () => {
      const src = readAppJs();
      expect(src).toContain('reason.length < 3');
      expect(src).toContain('id="c-reason" required minlength="3"');
    });
  });
});

/* ------------------------------------------------------------------ */
describe('Profile validator (Taiwan NHI / National ID / ARC)', () => {
  const GOOD = {
    full_name: 'Chen Wei-Ming', national_id: 'A123456789', date_of_birth: '1990-05-17', gender: 'Male',
    phone: '0912-345-678', emergency_contact: 'Chen Mei-Ling', emergency_phone: '02-2345-6789',
  };

  describe('ID format & checksum', () => {
    it.each(['A123456789', 'F131104093', 'a123456789'])('accepts valid National ID %s', (id) => {
      expect(classifyTaiwanId(id)).toBe('NATIONAL_ID');
    });
    it('accepts a valid new-format ARC (second digit 8/9)', () => {
      // construct: letter A (10) + 8 + 7 digits chosen, last digit computed
      const body = 'A8' + '1234567';
      let found = '';
      for (let c = 0; c < 10; c++) if (isValidTaiwanId(body + c)) found = body + c;
      expect(found).not.toBe('');
      expect(classifyTaiwanId(found)).toBe('ARC_NEW');
    });
    it('accepts a valid old-format ARC (second letter A-D)', () => {
      const body = 'AA' + '1234567';
      let found = '';
      for (let c = 0; c < 10; c++) if (isValidTaiwanId(body + c)) found = body + c;
      expect(found).not.toBe('');
      expect(classifyTaiwanId(found)).toBe('ARC_OLD');
    });
    it.each([
      ['wrong checksum', 'A123456788'],
      ['too short', 'A12345678'],
      ['too long', 'A1234567890'],
      ['no leading letter', '1123456789'],
      ['invalid gender digit', 'A323456789'],
      ['non-digit body', 'A12345678X'],
      ['empty', ''],
      ['spaces only', '   '],
      ['SQL-ish junk', "A1' OR '1'='1"],
    ])('rejects %s (%s)', (_label, id) => expect(isValidTaiwanId(id)).toBe(false));
  });

  describe('phone numbers', () => {
    it.each(['0912345678', '0912-345-678', '+886912345678', '02-2345-6789', '0223456789'])(
      'accepts %s', (p) => expect(isValidTaiwanPhone(p)).toBe(true));
    it.each(['12345', '0812345678901', 'abcdefghij', '', '091234567'])('rejects %j', (p) => expect(isValidTaiwanPhone(p)).toBe(false));
  });

  describe('required patient fields', () => {
    it('accepts a fully valid profile', () => expect(validateProfile(GOOD, new Date('2026-10-23'))).toEqual({ valid: true, errors: {} }));

    it.each(['full_name', 'national_id', 'date_of_birth', 'gender', 'phone', 'emergency_contact', 'emergency_phone'] as const)(
      'rejects a profile with missing %s', (field) => {
        const r = validateProfile({ ...GOOD, [field]: '' }, new Date('2026-10-23'));
        expect(r.valid).toBe(false);
        expect(r.errors[field]).toBeTruthy();
      });

    it('rejects whitespace-only names', () => expect(validateProfile({ ...GOOD, full_name: '   ' }).errors.full_name).toBeTruthy());
    it('rejects an invalid National ID with a specific message', () => {
      expect(validateProfile({ ...GOOD, national_id: 'A123456780' }).errors.national_id).toMatch(/invalid/i);
    });
    it('rejects a future date of birth', () => {
      expect(validateProfile({ ...GOOD, date_of_birth: '2030-01-01' }, new Date('2026-10-23')).errors.date_of_birth).toMatch(/future/i);
    });
    it('rejects an impossible calendar date', () => {
      expect(validateProfile({ ...GOOD, date_of_birth: '1990-02-31' }).errors.date_of_birth).toBeTruthy();
    });
    it('rejects a gender outside Male/Female/Other (mirrors the DB check constraint)', () => {
      expect(validateProfile({ ...GOOD, gender: 'Unknown' }).errors.gender).toBeTruthy();
    });
  });

  describe('source contract: profile form in app.js', () => {
    it.each(['full_name', 'national_id', 'date_of_birth', 'phone', 'emergency_contact', 'emergency_phone'])(
      'marks %s as a required input', (field) => {
        const re = new RegExp(`f\\('${field}',[^)]*,\\s*true\\)`);
        expect(readAppJs()).toMatch(re);
      });
    it('gender select is required and limited to Male/Female/Other', () => {
      const src = readAppJs();
      expect(src).toContain(`['', 'Male', 'Female', 'Other']`);
      expect(src).toContain('<select id="gender" name="gender" required');
    });
  });
});

/* ------------------------------------------------------------------ */
describe('HTML escaping helper (XSS guard used when rendering complaints/notes)', () => {
  it('escapes markup and quotes', () => {
    expect(esc('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(esc(`O'Brien & Sons`)).toBe('O&#39;Brien &amp; Sons');
  });
  it('handles null/undefined as empty string', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});
