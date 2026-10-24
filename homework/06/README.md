# Homework 06 - Software Testing Suite

> **Testing suite architected and developed with assistance from Claude (Anthropic) for Homework 06.**

A three-tier automated test suite (unit, system/API, end-to-end) for the clinic appointment web app in
[`homework/03/Clinic_System/`](../03/Clinic_System/). The application code is **not modified**; everything
lives in `homework/06/`.

## 1. Target Application

| Item | Value |
|---|---|
| Path | `homework/03/Clinic_System/` (`index.html`, `app.js`, `style.css`, `schema.sql`) |
| App name in the UI | Harbor Family Clinic - Registration & Outpatient System |
| Stack | Vanilla JS (ES module), Tailwind CSS (CDN), Supabase (Auth + Postgres/PostgREST) |
| Admin | `viony07@gmail.com` (any other account is a patient) |
| Rules under test | Hours 08:00-21:00 (30-min slots, last 20:30); breaks 12:00-13:30 and 17:00-18:00; 1-hour lead time (admin exempt); mandatory cancellation reason |
| Backend | `https://xwchiameamzcwpbwyfea.supabase.co/rest/v1/` - tables `profiles`, `appointments` |

## 2. Test Pyramid Architecture

```
            /\
           /  \        E2E (Playwright)   - 3 scenarios, real browser, real app + real supabase-js
          /----\
         /      \      System (Vitest + fetch) - live Supabase REST/Auth API: auth, RLS, validation
        /--------\
       /          \    Unit (Vitest)      - pure rules from the real app.js: slots, lead time, roles, profile
      /____________\
```

| Layer | Tool | Speed | Network | What it proves |
|---|---|---|---|---|
| **Unit** | Vitest + fake timers | ~1 s | none | Business rules are correct in isolation, including time-zone and boundary behaviour |
| **System (API)** | Vitest + Node `fetch` | seconds | live Supabase | The backend enforces security (API key, RLS) and data rules (DB triggers/constraints) independently of the UI |
| **E2E** | Playwright (Chromium + Firefox, headless) | tens of seconds | CDN assets only | The user journeys work through the real UI |

Design decisions worth knowing:

* **Unit tests run the shipped code.** `app.js` is a browser module with no exports and touches `window` at load time, and it must stay untouched. `tests/helpers/load-clinic-rules.ts` slices the real "Business rules" block out of `app.js` and evaluates it, so a regression in the app fails the test. "Source contract" tests additionally pin the few rules that live inline (admin check, required fields, cancellation reason, `schema.sql` admin email).
* **System tests default to read-only/negative checks** against the production project (anon key only), so they are safe to run anytime. Authenticated write-validation tests are **opt-in** (see section 4).
* **E2E uses a deterministic in-memory Supabase** (`tests/e2e/support/fake-supabase.ts`) wired in through Playwright network interception. The browser still runs the real `index.html`/`app.js` and the real `@supabase/supabase-js` client; only the HTTP responses are simulated. This makes runs repeatable and leaves the real database untouched. The real backend is covered by the System layer.
* **Time-dependent behaviour is deterministic**: unit tests use Vitest fake timers, E2E uses `page.clock.setFixedTime`, both pinned to Asia/Taipei wall-clock time.

### Findings made while building the suite

1. **No Taiwan ID format check exists in the app.** The profile form only marks `national_id` as `required`. `tests/helpers/profile-validator.ts` is therefore an executable *specification* (letter + 1/2/8/9/A-D + 8 digits, MOI checksum) that can be dropped into `app.js`; source-contract tests verify the required fields really exist in the app.
2. **Admin role is derived in two places** (`app.js` and `is_admin()` in `schema.sql`); a contract test checks both use the same email.

## 3. Directory Structure

```
homework/06/
├── package.json                 # dependencies + npm scripts
├── vitest.config.ts             # unit + system config (loads .env via dotenv)
├── playwright.config.ts         # Chromium + Firefox, local web server -> ../03/Clinic_System
├── tsconfig.json
├── .env.example                 # optional overrides / opt-in credentials
├── .gitignore
├── README.md
├── index.html                   # QA dashboard for GitHub Pages (in-browser runner + results.json)
├── scripts/build-results.mjs    # merges Vitest/Playwright JSON into results.json
└── tests/
    ├── helpers/
    │   ├── app-source.ts        # locates and reads the app files
    │   ├── load-clinic-rules.ts # extracts the real rules from app.js
    │   ├── roles.ts             # ADMIN / PATIENT resolution
    │   └── profile-validator.ts # Taiwan ID/ARC + profile validation spec
    ├── unit/
    │   └── clinic-rules.test.ts
    ├── system/
    │   └── supabase-api.test.ts
    └── e2e/
        ├── clinic-flow.spec.ts
        └── support/
            ├── fake-supabase.ts # in-memory backend + seed data
            └── fixtures.ts      # test fixture, login/date/slot helpers
```

## 4. Prerequisites & Installation

* Node.js 18+ (developed against 22) and npm
* Internet access (System tests call Supabase; the app page loads Tailwind/Lucide from CDNs)

```bash
cd homework/06
npm install
npx playwright install          # downloads Chromium + Firefox
# Linux CI/containers only: npx playwright install --with-deps
```

Optional: `cp .env.example .env`. By default the Supabase URL and anon key are read from `app.js`.
To enable the authenticated write-validation group (it **creates then cancels** a few real rows, because
the schema has no DELETE policy), add a patient account's `TEST_PATIENT_EMAIL` / `TEST_PATIENT_PASSWORD`.

## 5. Execution Commands

| Command | Runs |
|---|---|
| `npm run test:unit` | Unit tests (`tests/unit`) |
| `npm run test:system` | System/API tests (`tests/system`) |
| `npm run test:e2e` | Playwright E2E, Chromium + Firefox (starts the local server automatically) |
| `npm run test:all` | Unit, then System, then E2E (stops at the first failing tier) |
| `npm run test:e2e:headed` | E2E with a visible browser, for debugging |
| `npm run report` | Opens the Playwright HTML report |
| `npx playwright test --project=chromium` | E2E in one browser only |

## 6. Test Scenarios & Assertions Matrix

### 6.1 Unit - `tests/unit/clinic-rules.test.ts`

| Suite | Test case | Verifies |
|---|---|---|
| Slot & break guard | 21 slots, 08:00-20:30 | Slot grid size and first/last slot |
| | Bookable slots (08:00, 11:30, 13:30, 16:30, 18:00, 20:30) | Accepted, empty error |
| | 12:00, 12:30, 13:00 | Rejected, absent from `SLOTS` (lunch) |
| | 17:00, 17:30 | Rejected, absent from `SLOTS` (dinner) |
| | 07:30, 21:00, 23:30, 00:00 | Rejected (outside hours) |
| | 09:15, 14:45 | Rejected (off the 30-min grid) |
| | Admin + 12:30 / 17:00 | Break rules apply to admin too |
| | `fmt`/`toMin` round-trip | Helper consistency |
| 1-hour rule | 30 min ahead | Rejected |
| | 59 min ahead | Rejected (boundary - 1) |
| | exactly 60 min ahead | Accepted (boundary) |
| | 61+ min ahead | Accepted |
| | Past slot today / past date | Rejected |
| | 21:45 -> next day 08:00 | Accepted (cross-midnight) |
| | 00:30 UTC = 08:30 Taipei | Time zone is Asia/Taipei, not UTC |
| | Admin 30 min ahead | Admin bypasses lead time only |
| | 2026-12-31 -> 2027-01-01 | Month/year rollover |
| Roles | `viony07@gmail.com`, any case | `ADMIN` |
| | other emails, look-alikes (`viony08`, `xviony07`, `.com.tw`, `.co`, empty) | `PATIENT` |
| | Source contract | `app.js` admin expression, `schema.sql` admin email, cancellation reason >= 3 chars |
| Profile validator | Valid National ID (`A123456789`, `F131104093`, lower-case) | Accepted |
| | New-format ARC (8/9), old-format ARC (A-D) | Accepted with correct classification |
| | Bad checksum, short, long, no letter, bad gender digit, non-digit, empty, whitespace, SQL-ish text | Rejected |
| | Phones: mobile, dashed, `+886`, landline / short, long, letters, empty | Accepted / rejected |
| | Each of 7 required fields blank | Rejected with a message |
| | Whitespace name, future DOB, `1990-02-31`, gender `Unknown` | Rejected |
| | Source contract | Required inputs and gender options exist in `app.js` |
| `esc()` | Markup/quotes, null/undefined | XSS-safe output |

### 6.2 System - `tests/system/supabase-api.test.ts`

| Group | Test case | Expected |
|---|---|---|
| 1. Anon GET | `GET /appointments` | HTTP 200, JSON array |
| | rows visible to anon | `[]` (RLS) |
| | `GET /profiles` as anon | 200, `[]` (no PII leak) |
| | order/limit params as used by the app | 200, `application/json` |
| 2. Unauthorized | no `apikey` | 401/403 |
| | malformed `apikey` | 401/403 |
| | valid key + tampered Bearer token | 401/403 |
| | error body | Not a data array |
| | Auth API, wrong credentials | 400/401/422, no `access_token` |
| 3. Anon POST | valid payload | 401/403, never 2xx |
| | invalid department | 4xx |
| | no API key | 401/403 |
| | anonymous PATCH (forged cancellation) | Rejected, or 0 rows affected |
| | anonymous DELETE | Rejected, or 0 rows affected |
| 4. Authenticated (opt-in) | patient GET | 200 array |
| | valid booking | 201, `Scheduled` |
| | duplicate dept/date/time | 409 (unique index) |
| | 12:00 / 12:30 / 13:00 | 400 "lunch" (DB trigger) |
| | 17:00 / 17:30 | 400 "dinner" (DB trigger) |
| | 21:00, 09:15 | 400 |
| | past date / inside 1 hour | 400 "1 hour" |
| | department `Astrology` | 400, code `23514` |
| | missing `chief_complaint` | 400, code `23502` |
| | other patient's `patient_id` | 401/403 (RLS) |
| | row created already `Cancelled` | 401/403 (RLS) |

### 6.3 E2E - `tests/e2e/clinic-flow.spec.ts`

| Scenario | Test | Key assertions |
|---|---|---|
| **A** Patient booking | Full journey | Patient sees patient nav only; dept + tomorrow -> 21 slots; zero break slots; taken 10:00 disabled; pick 09:00 (`selected`); submit -> success toast; Upcoming tab count `(3)`; card shows date/time/department/`Scheduled`; POST body correct |
| | No slot chosen | "Please select a time slot." toast, no request sent |
| | Wrong password | "Invalid login credentials", stays on login |
| **B** 1-hour rule | Clock 10:31 | 08:00-11:30 disabled (11:30 = 59 min); 13:30, 20:30 enabled |
| | Clock 10:30 | 11:00 disabled, 11:30 enabled (exact 60 min) |
| | Tomorrow at 19:45 | All 21 slots enabled |
| | DOM tampering (re-enable button) | Error toast "at least 1 hour...", no POST sent |
| **C** Admin queue | Master schedule + cancel | Admin badge/nav; 5 rows sorted newest first (first = +5 days, last = -3 days); empty reason blocked (`:invalid`, no PATCH); with reason -> "Appointment cancelled."; badge `Cancelled`; reason displayed; action buttons removed; PATCH has `status`, `cancellation_reason`, `cancelled_by: 'admin'` |
| | Status filter | `Completed` shows exactly one row |

## 7. Running Tests Without a Terminal

* **Dashboard -> "Run in browser"** runs the Unit cases (U1-U12, U14, U15) and System/API cases (S1-S8) inside the page: it fetches the real `app.js` and calls the live Supabase API. E2E, U13 and the opt-in S9-S13 are not runnable this way.
* **Dashboard -> "Run all on GitHub"** opens the Actions page. Copy `.github/workflows/tests.yml` to the repository root, press *Run workflow*; it runs all three tiers, commits `homework/06/results.json`, and re-triggers `deploy.yml` so the dashboard badges update.

## 8. Notes & Limitations

* E2E simulates the backend; the live backend is covered by the System tier. Pointing E2E at the real project would require dedicated test accounts and would write to production data.
* The Playwright server uses `http-server` (a devDependency) so the ES module `app.js` loads over `http://`, not `file://`.
* The page still loads Tailwind, Lucide and fonts from CDNs. `@supabase/supabase-js@2.45.4` (the version `index.html` loads) is served from `node_modules`, so it works even if that CDN is unreachable.
* Group 4 of the System tests and the production-only behaviours (e.g. realtime) are intentionally outside the default run.
