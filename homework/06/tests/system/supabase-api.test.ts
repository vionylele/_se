/**
 * SYSTEM TESTS - Supabase REST (PostgREST) / Auth API, using Node's built-in fetch.
 *
 * Group 1-3 need nothing but network access (anon key is read from app.js).
 * Group 4 (authenticated write validation) is OPT-IN: set TEST_PATIENT_EMAIL and
 * TEST_PATIENT_PASSWORD in .env. It exercises the DB triggers/constraints and cancels any row
 * it creates (the schema has no DELETE policy by design).
 */
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readConst } from '../helpers/app-source';

const BASE = (process.env.SUPABASE_URL ?? readConst('SUPABASE_URL')).replace(/\/$/, '');
const REST = `${BASE}/rest/v1`;
const AUTH = `${BASE}/auth/v1`;
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? readConst('SUPABASE_ANON_KEY');

const json = { 'Content-Type': 'application/json' };
const anonHeaders = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };

async function call(url: string, init: RequestInit = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: any = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  return { status: res.status, body, headers: res.headers };
}

const validAppointment = (patient_id: string, overrides: Record<string, unknown> = {}) => ({
  patient_id,
  appointment_date: '2030-01-07', // far future Monday: never trips the 1-hour rule
  appointment_time: '09:00',
  department: 'General Medicine',
  chief_complaint: 'System test - sore throat',
  notes: 'automated test',
  status: 'Scheduled',
  ...overrides,
});

/* ------------------------------------------------------------------ */
describe('1. GET /rest/v1/appointments with anon key', () => {
  it('returns HTTP 200 and a JSON array', async () => {
    const r = await call(`${REST}/appointments?select=*&limit=5`, { headers: anonHeaders });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('applies Row Level Security: anonymous callers see zero appointments', async () => {
    const r = await call(`${REST}/appointments?select=id,patient_id,chief_complaint`, { headers: anonHeaders });
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });

  it('applies Row Level Security to profiles: anonymous callers see zero patients', async () => {
    const r = await call(`${REST}/profiles?select=email,national_id`, { headers: anonHeaders });
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });

  it('serves JSON content-type and honours ordering/limit params (as used by the app)', async () => {
    const r = await call(
      `${REST}/appointments?select=*&order=appointment_date.desc&order=appointment_time.desc&limit=1`,
      { headers: anonHeaders },
    );
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/application\/json/);
  });
});

/* ------------------------------------------------------------------ */
describe('2. Unauthorized / invalid credentials are rejected', () => {
  it('rejects a request with NO api key (401/403)', async () => {
    const r = await call(`${REST}/appointments?select=*`);
    expect([401, 403]).toContain(r.status);
  });

  it('rejects a request with a malformed api key (401/403)', async () => {
    const r = await call(`${REST}/appointments?select=*`, { headers: { apikey: 'not-a-real-key' } });
    expect([401, 403]).toContain(r.status);
  });

  it('rejects a valid api key paired with a tampered Bearer token (401/403)', async () => {
    const r = await call(`${REST}/appointments?select=*`, {
      headers: { apikey: ANON_KEY, Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.invalidsignature' },
    });
    expect([401, 403]).toContain(r.status);
  });

  it('does not leak data in the error response when unauthenticated', async () => {
    const r = await call(`${REST}/appointments?select=*`);
    expect(Array.isArray(r.body)).toBe(false);
  });

  it('Auth API refuses wrong credentials (400/401/422)', async () => {
    const r = await call(`${AUTH}/token?grant_type=password`, {
      method: 'POST',
      headers: { ...json, apikey: ANON_KEY },
      body: JSON.stringify({ email: 'nobody-qa@example.com', password: 'definitely-wrong-password' }),
    });
    expect([400, 401, 422]).toContain(r.status);
    expect(r.body?.access_token).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
describe('3. POST /rest/v1/appointments as an anonymous caller', () => {
  const stranger = '00000000-0000-0000-0000-000000000001';

  it('is blocked by RLS even with a perfectly valid payload (401/403, never 2xx)', async () => {
    const r = await call(`${REST}/appointments`, {
      method: 'POST',
      headers: { ...json, ...anonHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify(validAppointment(stranger)),
    });
    expect([401, 403]).toContain(r.status);
  });

  it('is blocked for an invalid payload as well (invalid department)', async () => {
    const r = await call(`${REST}/appointments`, {
      method: 'POST',
      headers: { ...json, ...anonHeaders },
      body: JSON.stringify(validAppointment(stranger, { department: 'Astrology' })),
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  });

  it('is blocked without an api key', async () => {
    const r = await call(`${REST}/appointments`, { method: 'POST', headers: json, body: JSON.stringify(validAppointment(stranger)) });
    expect([401, 403]).toContain(r.status);
  });

  it('anonymous PATCH (e.g. forging a cancellation) changes nothing', async () => {
    const r = await call(`${REST}/appointments?status=eq.Scheduled`, {
      method: 'PATCH',
      headers: { ...json, ...anonHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'Cancelled', cancellation_reason: 'forged', cancelled_by: 'admin' }),
    });
    // either rejected outright, or accepted-but-zero-rows because RLS hides every row
    if (r.status >= 200 && r.status < 300) expect(r.body ?? []).toEqual([]);
    else expect([401, 403]).toContain(r.status);
  });

  it('anonymous DELETE is not permitted (no DELETE policy: records are retained)', async () => {
    const r = await call(`${REST}/appointments?status=eq.Scheduled`, {
      method: 'DELETE',
      headers: { ...anonHeaders, Prefer: 'return=representation' },
    });
    if (r.status >= 200 && r.status < 300) expect(r.body ?? []).toEqual([]);
    else expect([401, 403]).toContain(r.status);
  });
});

/* ------------------------------------------------------------------ */
const EMAIL = process.env.TEST_PATIENT_EMAIL;
const PASSWORD = process.env.TEST_PATIENT_PASSWORD;

describe.skipIf(!EMAIL || !PASSWORD)('4. Authenticated patient: server-side validation of POST /appointments', () => {
  let token = '';
  let userId = '';
  const created: string[] = [];

  const post = (body: unknown, prefer = 'return=representation') =>
    call(`${REST}/appointments`, {
      method: 'POST',
      headers: { ...json, apikey: ANON_KEY, Authorization: `Bearer ${token}`, Prefer: prefer },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    const r = await call(`${AUTH}/token?grant_type=password`, {
      method: 'POST', headers: { ...json, apikey: ANON_KEY }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    expect(r.status, 'login with TEST_PATIENT_* credentials').toBe(200);
    token = r.body.access_token;
    userId = r.body.user.id;
  });

  // Clean up: patients cannot DELETE, so cancel anything we created.
  afterAll(async () => {
    for (const id of created) {
      await call(`${REST}/appointments?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...json, apikey: ANON_KEY, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'Cancelled', cancellation_reason: 'system test cleanup', cancelled_by: 'patient' }),
      });
    }
  });

  it('GET with a patient token returns 200', async () => {
    const r = await call(`${REST}/appointments?select=*`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('accepts a valid booking (201) and stores it as Scheduled', async () => {
    const r = await post(validAppointment(userId, { appointment_time: '10:00' }));
    expect(r.status).toBe(201);
    expect(r.body[0].status).toBe('Scheduled');
    created.push(r.body[0].id);
  });

  it('rejects a duplicate booking of the same department/slot (409, unique index)', async () => {
    const dupe = validAppointment(userId, { appointment_time: '10:30' });
    const first = await post(dupe);
    expect(first.status).toBe(201);
    created.push(first.body[0].id);
    const second = await post(dupe);
    expect(second.status).toBe(409);
  });

  it.each([['12:00'], ['12:30'], ['13:00']])('rejects a lunch-break slot %s (400, DB trigger)', async (t) => {
    const r = await post(validAppointment(userId, { appointment_time: t }));
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toMatch(/lunch/i);
  });

  it.each([['17:00'], ['17:30']])('rejects a dinner-break slot %s (400, DB trigger)', async (t) => {
    const r = await post(validAppointment(userId, { appointment_time: t }));
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toMatch(/dinner/i);
  });

  it('rejects a slot outside clinic hours (21:00) and off-grid time (09:15)', async () => {
    expect((await post(validAppointment(userId, { appointment_time: '21:00' }))).status).toBe(400);
    expect((await post(validAppointment(userId, { appointment_time: '09:15' }))).status).toBe(400);
  });

  it('rejects a booking in the past / inside the 1-hour window (400)', async () => {
    const r = await post(validAppointment(userId, { appointment_date: '2020-01-06' }));
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toMatch(/1 hour/i);
  });

  it('rejects an unknown department (400, check constraint 23514)', async () => {
    const r = await post(validAppointment(userId, { appointment_time: '11:00', department: 'Astrology' }));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('23514');
  });

  it('rejects a missing chief_complaint (400, NOT NULL 23502)', async () => {
    const { chief_complaint, ...rest } = validAppointment(userId, { appointment_time: '11:30' });
    void chief_complaint;
    const r = await post(rest);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('23502');
  });

  it('rejects booking on behalf of another patient (RLS, 401/403)', async () => {
    const r = await post(validAppointment('00000000-0000-0000-0000-000000000002', { appointment_time: '14:00' }));
    expect([401, 403]).toContain(r.status);
  });

  it('rejects creating a row that is already Cancelled (RLS requires Scheduled)', async () => {
    const r = await post(validAppointment(userId, { appointment_time: '14:30', status: 'Cancelled' }));
    expect([401, 403]).toContain(r.status);
  });
});
