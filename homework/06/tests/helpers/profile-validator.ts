/**
 * Reference validator for the patient profile form.
 *
 * NOTE: the shipped app only marks these fields `required` in HTML; it performs NO format check
 * on the National ID (see "Findings" in the README). This module is therefore the test suite's
 * executable specification of a correct Taiwan ID/ARC check, and could be copied into app.js.
 *
 * Formats
 *  - National ID : [A-Z] + [1|2] + 8 digits       (1 = male, 2 = female)
 *  - ARC (new)   : [A-Z] + [8|9] + 8 digits       (2021+ unified ID)
 *  - ARC (old)   : [A-Z] + [A-D] + 8 digits
 *  - Check digit : weighted mod-10 checksum (MOI algorithm)
 */
const LETTER_CODE: Record<string, number> = {
  A: 10, B: 11, C: 12, D: 13, E: 14, F: 15, G: 16, H: 17, I: 34, J: 18, K: 19, L: 20, M: 21,
  N: 22, O: 35, P: 23, Q: 24, R: 25, S: 26, T: 27, U: 28, V: 29, W: 32, X: 30, Y: 31, Z: 33,
};

export type IdKind = 'NATIONAL_ID' | 'ARC_NEW' | 'ARC_OLD';

export function classifyTaiwanId(raw: string): IdKind | null {
  const id = raw.trim().toUpperCase();
  if (!/^[A-Z][1289A-D]\d{8}$/.test(id)) return null;

  const second = id[1];
  let secondDigit: number;
  let kind: IdKind;
  if (second === '1' || second === '2') { secondDigit = +second; kind = 'NATIONAL_ID'; }
  else if (second === '8' || second === '9') { secondDigit = +second; kind = 'ARC_NEW'; }
  else { secondDigit = LETTER_CODE[second] % 10; kind = 'ARC_OLD'; }

  const code = LETTER_CODE[id[0]];
  const digits = [Math.floor(code / 10), code % 10, secondDigit, ...id.slice(2).split('').map(Number)];
  const weights = [1, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1];
  const sum = digits.reduce((acc, d, i) => acc + d * weights[i], 0);
  return sum % 10 === 0 ? kind : null;
}

export const isValidTaiwanId = (id: string) => classifyTaiwanId(id) !== null;

/** Taiwan mobile (09xx-xxx-xxx), landline (0x-xxxx-xxxx) or +886 forms. */
export function isValidTaiwanPhone(raw: string): boolean {
  const p = raw.replace(/[\s-]/g, '').replace(/^\+886/, '0');
  return /^09\d{8}$/.test(p) || /^0[2-8]\d{7,8}$/.test(p);
}

export interface ProfileInput {
  full_name?: string; national_id?: string; date_of_birth?: string; gender?: string;
  phone?: string; emergency_contact?: string; emergency_phone?: string;
}
export interface ProfileResult { valid: boolean; errors: Partial<Record<keyof ProfileInput, string>> }

export function validateProfile(p: ProfileInput, today = new Date()): ProfileResult {
  const errors: ProfileResult['errors'] = {};
  const blank = (v?: string) => !v || !v.trim();

  if (blank(p.full_name)) errors.full_name = 'Full name is required.';
  if (blank(p.national_id)) errors.national_id = 'National ID / ARC number is required.';
  else if (!isValidTaiwanId(p.national_id!)) errors.national_id = 'Invalid Taiwan National ID / ARC number.';

  if (blank(p.date_of_birth)) errors.date_of_birth = 'Date of birth is required.';
  else {
    const d = new Date(`${p.date_of_birth}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== p.date_of_birth) errors.date_of_birth = 'Invalid date.';
    else if (d.getTime() > today.getTime()) errors.date_of_birth = 'Date of birth cannot be in the future.';
  }

  if (!['Male', 'Female', 'Other'].includes(p.gender ?? '')) errors.gender = 'Select a gender.';

  if (blank(p.phone)) errors.phone = 'Phone number is required.';
  else if (!isValidTaiwanPhone(p.phone!)) errors.phone = 'Invalid Taiwan phone number.';

  if (blank(p.emergency_contact)) errors.emergency_contact = 'Emergency contact name is required.';
  if (blank(p.emergency_phone)) errors.emergency_phone = 'Emergency contact phone is required.';
  else if (!isValidTaiwanPhone(p.emergency_phone!)) errors.emergency_phone = 'Invalid emergency phone number.';

  return { valid: Object.keys(errors).length === 0, errors };
}
