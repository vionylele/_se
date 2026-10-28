// Merges Vitest/Playwright JSON reports into results.json keyed by the dashboard's case IDs.
import fs from 'node:fs';

const MAP = {
  unit: { U1: /generates 21|accepts bookable|round-trip|no generated slot/, U2: /lunch break/, U3: /dinner break/,
    U4: /out-of-hours|30-minute grid/, U5: /rejects a slot (30|59)/, U6: /accepts a slot (exactly|61)/,
    U7: /already passed|dates in the past/, U8: /midnight|Asia\/Taipei|month\/year/, U9: /admin bypasses|break rules to the admin/,
    U10: /declares vionylee07|identifies the admin|case-insensitive for the admin/, U11: /as PATIENT/, U12: /ID format/,
    U13: /phone numbers|required patient fields/, U14: /source contract/i, U15: /HTML escaping/ },
  system: { S1: /returns HTTP 200|serves JSON/, S2: /Row Level Security.*anonymous callers/, S3: /NO api key|does not leak/,
    S4: /malformed api key|tampered Bearer/, S5: /Auth API refuses/, S6: /valid payload|without an api key/,
    S7: /invalid payload/, S8: /PATCH|DELETE/, S9: /accepts a valid booking/, S10: /lunch-break|dinner-break/,
    S11: /outside clinic hours|in the past \/ inside/, S12: /unknown department|missing chief|duplicate booking/,
    S13: /another patient|already Cancelled/ },
  e2e: { E1: /books an eligible slot/, E2: /books an eligible slot/, E3: /cannot submit without|invalid credentials/,
    E4: /at 10:31/, E5: /at 10:30/, E6: /tomorrow is fully/, E7: /defence in depth/,
    E8: /newest-first/, E9: /newest-first/, E10: /filter the master schedule/ },
};

const read = (f) => { try { return JSON.parse(fs.readFileSync(`out/${f}.json`, 'utf8')); } catch { return null; } };
const cases = { unit: [], system: [], e2e: [] }; // {name, status, ms}

for (const k of ['unit', 'system']) {
  for (const f of read(k)?.testResults ?? []) for (const a of f.assertionResults ?? [])
    cases[k].push({ name: a.fullName, status: a.status === 'passed' ? 'passed' : a.status === 'failed' ? 'failed' : 'skip', ms: a.duration ?? 0 });
}
const walk = (s) => { for (const sp of s.specs ?? []) {
    const rs = sp.tests.flatMap((t) => t.results);
    cases.e2e.push({ name: sp.title, status: rs.every((r) => r.status === 'skipped') ? 'skip' : sp.ok ? 'passed' : 'failed', ms: rs.reduce((n, r) => n + r.duration, 0) });
  } (s.suites ?? []).forEach(walk); };
(read('e2e')?.suites ?? []).forEach(walk);

const results = {};
for (const [k, ids] of Object.entries(MAP)) for (const [id, re] of Object.entries(ids)) {
  const hit = cases[k].filter((c) => re.test(c.name) && c.status !== 'skip');
  if (!hit.length) continue; // not run (e.g. opt-in tests) -> stays NOT RUN
  results[id] = { status: hit.some((c) => c.status === 'failed') ? 'failed' : 'passed', ms: Math.round(hit.reduce((n, c) => n + c.ms, 0)) };
}
fs.writeFileSync('results.json', JSON.stringify({ updated: new Date().toISOString(), results }, null, 2));
console.log(`results.json: ${Object.keys(results).length} case IDs`);
