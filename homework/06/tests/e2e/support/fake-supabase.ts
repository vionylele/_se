/**
 * Deterministic in-memory stand-in for the Supabase backend, wired in with Playwright network
 * interception. The browser still runs the REAL, UNMODIFIED app (index.html + app.js) and the
 * REAL @supabase/supabase-js client; only the HTTP responses come from this class. This keeps
 * E2E runs repeatable, offline-friendly and free of side effects on the production database.
 */
import type { Page, Request, Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SUPABASE_UMD = path.resolve(here, '../../../node_modules/@supabase/supabase-js/dist/umd/supabase.js');
const SUPABASE_HOST = /^https:\/\/xwchiameamzcwpbwyfea\.supabase\.co\/(auth|rest)\/v1\//;

export const PATIENT = { id: '11111111-1111-4111-8111-111111111111', email: 'patient@example.com', password: 'Passw0rd!', name: 'Chen Wei-Ming' };
export const OTHER = { id: '33333333-3333-4333-8333-333333333333', email: 'other@example.com', password: 'Passw0rd!', name: 'Lin Mei-Hua' };
export const ADMIN = { id: '22222222-2222-4222-8222-222222222222', email: 'vionylee07@gmail.com', password: 'AdminPass1!', name: '' };

/** Calendar date (YYYY-MM-DD) in Asia/Taipei, `offsetDays` from `from`. */
export function taipeiDate(offsetDays = 0, from = new Date()): string {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(from).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}

export interface Appt {
  id: string; patient_id: string; appointment_date: string; appointment_time: string;
  department: string; chief_complaint: string; notes: string; status: string;
  cancellation_reason: string | null; cancelled_by: string | null; reschedule_count: number;
}
export interface LoggedRequest { method: string; path: string; search: string; body: any }

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const makeJwt = (u: { id: string; email: string }) =>
  `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp: 4_102_444_800 })}.fakesignature`;

export class FakeSupabase {
  users = [PATIENT, OTHER, ADMIN];
  appts: Appt[] = [];
  requests: LoggedRequest[] = [];
  private seq = 100;

  constructor() { this.seed(); }

  private seed() {
    const a = (id: string, pid: string, off: number, time: string, dept: string, cc: string, status = 'Scheduled'): Appt => ({
      id, patient_id: pid, appointment_date: taipeiDate(off), appointment_time: `${time}:00`, department: dept,
      chief_complaint: cc, notes: '', status, cancellation_reason: null, cancelled_by: null, reschedule_count: 0,
    });
    this.appts = [
      a('a1', OTHER.id, 1, '10:00', 'General Medicine', 'Seed: headache'),      // occupies tomorrow 10:00
      a('a2', PATIENT.id, 3, '15:00', 'ENT', 'Seed: ear pain'),
      a('a3', OTHER.id, 5, '09:30', 'Family Medicine', 'Seed: check-up'),
      a('a4', PATIENT.id, 2, '14:00', 'Pediatrics', 'Seed: child fever'),
      a('a5', PATIENT.id, -3, '11:00', 'General Medicine', 'Seed: old visit', 'Completed'),
    ];
  }

  postsTo(table: string) { return this.requests.filter((r) => r.method === 'POST' && r.path === `/rest/v1/${table}`); }
  patchesTo(table: string) { return this.requests.filter((r) => r.method === 'PATCH' && r.path === `/rest/v1/${table}`); }

  async install(page: Page) {
    // Pin supabase-js to the local copy (same version as index.html) so the suite works offline.
    if (fs.existsSync(SUPABASE_UMD)) {
      await page.route('**/@supabase/supabase-js@*/**', (r) => r.fulfill({ path: SUPABASE_UMD, contentType: 'application/javascript' }));
    }
    await page.route(SUPABASE_HOST, (route) => this.handle(route));
    // Realtime: accept the socket and stay silent (live-update toasts are out of scope for E2E).
    await page.routeWebSocket(/\/realtime\/v1\/websocket/, () => { /* no server connection */ });
  }

  private cors(req: Request): Record<string, string> {
    return {
      'access-control-allow-origin': req.headers()['origin'] ?? '*',
      'access-control-allow-headers': req.headers()['access-control-request-headers'] ?? '*',
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'access-control-expose-headers': '*',
    };
  }

  private reply(route: Route, status: number, body?: unknown) {
    const headers = { ...this.cors(route.request()), 'content-type': 'application/json' };
    return route.fulfill({ status, headers, body: body === undefined ? '' : JSON.stringify(body) });
  }

  private caller(req: Request) {
    const token = (req.headers()['authorization'] ?? '').replace(/^Bearer\s+/i, '');
    try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { sub: string; email: string }; }
    catch { return null; }
  }

  private embed(a: Appt) {
    const p = this.users.find((u) => u.id === a.patient_id);
    return { ...a, profiles: { full_name: p?.name ?? '', email: p?.email ?? '', phone: '0912345678' } };
  }

  private async handle(route: Route) {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: this.cors(req) });

    const url = new URL(req.url());
    let body: any;
    try { body = req.postData() ? JSON.parse(req.postData()!) : undefined; } catch { body = req.postData(); }
    this.requests.push({ method: req.method(), path: url.pathname, search: url.search, body });

    const me = this.caller(req);
    const isAdmin = me?.email?.toLowerCase() === ADMIN.email;

    /* ---- Auth ---- */
    if (url.pathname === '/auth/v1/token') {
      const u = this.users.find((x) => x.email === body?.email?.toLowerCase() && x.password === body?.password);
      if (!u) return this.reply(route, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      const now = Math.floor(Date.now() / 1000);
      return this.reply(route, 200, {
        access_token: makeJwt(u), token_type: 'bearer', expires_in: 2_592_000, expires_at: now + 2_592_000,
        refresh_token: 'fake-refresh-token',
        user: { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
      });
    }
    if (url.pathname === '/auth/v1/logout') return this.reply(route, 204);
    if (url.pathname.startsWith('/auth/v1/')) return this.reply(route, 404, { message: 'not mocked' });
    if (!me) return this.reply(route, 401, { message: 'JWT required' });

    /* ---- REST: profiles ---- */
    if (url.pathname === '/rest/v1/profiles') {
      if (req.method() === 'GET') {
        const idEq = url.searchParams.get('id')?.replace('eq.', '');
        const toProfile = (u: typeof PATIENT) => ({ id: u.id, email: u.email, full_name: u.name, national_id: 'A123456789', date_of_birth: '1990-05-17', gender: 'Male', phone: '0912345678', emergency_contact: 'Family', emergency_phone: '0223456789', medical_notes: '', created_at: new Date().toISOString() });
        if (idEq) {
          const u = this.users.find((x) => x.id === idEq);
          const wantsObject = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
          if (wantsObject) return u && u.name ? this.reply(route, 200, toProfile(u)) : this.reply(route, 406, { code: 'PGRST116', details: 'The result contains 0 rows', hint: null, message: 'JSON object requested, multiple (or no) rows returned' });
          return this.reply(route, 200, u ? [toProfile(u)] : []);
        }
        return this.reply(route, 200, isAdmin ? [PATIENT, OTHER].map(toProfile) : []);
      }
      return this.reply(route, 204);
    }

    /* ---- REST: rpc/get_taken_slots ---- */
    if (url.pathname === '/rest/v1/rpc/get_taken_slots') {
      const taken = this.appts.filter((a) => a.appointment_date === body.p_date && a.department === body.p_dept && ['Scheduled', 'Rescheduled'].includes(a.status));
      return this.reply(route, 200, taken.map((a) => ({ appointment_time: a.appointment_time })));
    }

    /* ---- REST: appointments ---- */
    if (url.pathname === '/rest/v1/appointments') {
      if (req.method() === 'GET') {
        const rows = this.appts
          .filter((a) => isAdmin || a.patient_id === me.sub)
          .sort((x, y) => (y.appointment_date + y.appointment_time).localeCompare(x.appointment_date + x.appointment_time))
          .map((a) => this.embed(a));
        return this.reply(route, 200, rows);
      }
      if (req.method() === 'POST') {
        const dupe = this.appts.find((a) => a.appointment_date === body.appointment_date && a.appointment_time.slice(0, 5) === body.appointment_time.slice(0, 5)
          && a.department === body.department && ['Scheduled', 'Rescheduled'].includes(a.status));
        if (dupe) return this.reply(route, 409, { code: '23505', message: 'duplicate key value violates unique constraint "appt_unique_active_slot"' });
        this.appts.push({
          id: `new-${++this.seq}`, notes: '', cancellation_reason: null, cancelled_by: null, reschedule_count: 0, ...body,
          appointment_time: `${String(body.appointment_time).slice(0, 5)}:00`,
        });
        return this.reply(route, 201);
      }
      if (req.method() === 'PATCH') {
        const id = url.searchParams.get('id')?.replace('eq.', '');
        const row = this.appts.find((a) => a.id === id && (isAdmin || a.patient_id === me.sub));
        if (row) Object.assign(row, body, body.appointment_time ? { appointment_time: `${body.appointment_time.slice(0, 5)}:00` } : {});
        return this.reply(route, 204);
      }
    }
    return this.reply(route, 404, { message: `not mocked: ${req.method()} ${url.pathname}` });
  }
}
