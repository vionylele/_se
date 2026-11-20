# Modern Software Engineering: Student Homework Collection

> **Note: this README and all the projects in this repository were made by Claude (Anthropic).**
> The code, documentation, and this README were generated with Claude. Please verify technical details against the original files before relying on them.

## About This Repository

This repository holds the homework for the course **Modern Software Engineering** (115 academic year, first semester). The projects start with a small command-line tool and move on to full-stack web apps, Docker microservices, automated testing, a client-side document tool, a real-time Cloudflare app, and a Python package.

| Field | Details |
|---|---|
| Course | Modern Software Engineering |
| Semester | 115 academic year, first semester |
| Instructor | [陳鍾誠](https://www.nqu.edu.tw/educsie/index.php?act=blog&code=list&ids=4) |
| School | [National Quemoy University, Department of Computer Science and Information Engineering](https://www.nqu.edu.tw/educsie/index.php) |
| Student | 李俽嫺 (Student ID: 111410537) |
| Landing page | [vionylele.github.io/_se](https://vionylele.github.io/_se/) (the root `index.html` links to every homework) |

Everything is organised **by homework**. Each section below describes one assignment, including every language and tool it uses.

> **Numbering note:** the homework numbers follow the folders in `homework/`. The course weekly checklist counts Git flow as Week 4, Docker as Week 6, and so on. Folder `homework/08/` contains only a summary README. The Cloudflare project from Week 9 lives in its own repository, so it appears here as Homework 08. The Python package in `homework/09/` is Homework 09.

## Table of Contents

- [Homework 01: PyCurl-Lite (curl-style HTTP client)](#homework-01-pycurl-lite-curl-style-http-client)
- [Homework 02: NQU Academic Administration Portal](#homework-02-nqu-academic-administration-portal)
- [Homework 03: Lele Clinic Registration and Outpatient System](#homework-03-lele-clinic-registration-and-outpatient-system)
- [Homework 04: Git Flow Practice](#homework-04-git-flow-practice)
- [Homework 05: IoT Sensor Monitoring Hub (Docker)](#homework-05-iot-sensor-monitoring-hub-docker)
- [Homework 06: Software Testing Suite](#homework-06-software-testing-suite)
- [Homework 07: DocuTidy (Document Layout Cleaner and Formatter)](#homework-07-docutidy-document-layout-cleaner-and-formatter)
- [Homework 08: Durable Chat on Cloudflare Workers](#homework-08-durable-chat-on-cloudflare-workers)
- [Homework 09: dupe-hunter-kit (Duplicate File Finder)](#homework-09-dupe-hunter-kit-duplicate-file-finder)
- [Repository Structure](#repository-structure)
- [Deployment](#deployment)
- [Credits](#credits)

---

## Homework 01: PyCurl-Lite (curl-style HTTP client)

**Location:** `homework/01/pycurl_lite/`

### Overview / What It Is About
- A lightweight, `curl`-inspired command-line HTTP client.
- It is an independent implementation and is **not** related to the third-party `pycurl` library.
- Goal: reproduce the most common `curl` workflows.
  - HTTP methods: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, plus any custom method via `-X`.
  - Request options: headers (`-H`), raw or JSON body (`-d`), multipart form fields (`-F`), Basic Auth (`-u`), `User-Agent` (`-A`), cookies (`-b`).
  - Output options: save to file (`-o`, `-O`), headers only (`-I`), include headers (`-i`), verbose trace (`-v`), silent mode (`-s`).
  - Other: follow redirects (`-L`), skip SSL verification (`-k`), connection and total timeouts.
- A browser demo page (`index.html`) lets you type a curl-style command on the web.

### Programming Language(s)
- Python 3.7+ (CLI)
- HTML / CSS / JavaScript (web demo page)

### Tools & Technologies
- `requests` (`requests>=2.31.0`), listed in `requirements.txt`
- Python `argparse` for flag parsing
- Tailwind CSS (CDN) for the demo page
- GitHub Pages for hosting the demo page
- VS Code launch configuration (`.vscode/launch.json`)

### How It Works
1. `argparse` parses curl-style flags and the target URL.
2. Header strings (`Key: Value`) are converted to a dict. Malformed headers produce a warning and are skipped.
3. The tool builds a `requests` call from the method, headers, body, form data, auth, cookies, redirect and TLS options, and timeouts.
4. The response is printed, with optional headers and verbose request/response trace, or saved to a file.

```bash
pip install -r requirements.txt
python pycurl_lite.py -X POST -H "Content-Type: application/json" -d '{"name": "claude"}' https://httpbin.org/post
```

### Output / Result
- The response body is printed to the terminal, or saved to a file with `-o` or `-O`.
- `-I` prints headers only. `-v` prints a `curl -v`-style trace.
- Known limitations: no HTTP/2 or HTTP/3, no non-HTTP protocols, no progress bar, no `.netrc`, no advanced TLS options.
- The web demo shows the command's result in the browser.

---

## Homework 02: NQU Academic Administration Portal

**Location:** `homework/02/nqu-portal/`

### Overview / What It Is About
- A fully English-language campus management system inspired by National Quemoy University. It is a demonstration project, not an official university system.
- Student features:
  - Email/password registration and sign-in.
  - Mandatory first-login profile, including a compressed profile photo.
  - Course add/drop with a **25-credit limit**, time-conflict detection, and duplicate/full-course checks.
  - Weekly timetable using the Taiwan period system (Periods 1-9, lunch break 12:00-13:30), exportable to PDF.
  - Grade transcript on the Taiwan **4.3 GPA scale**, with semester and cumulative GPA, exportable to PDF.
- Administrator features: publish announcements, manage the course catalog, view the student directory.

### Programming Language(s)
- TypeScript (React application)
- SQL (PostgreSQL schema and migration)
- CSS (Tailwind), HTML

### Tools & Technologies
- React 18, Vite 5, Tailwind CSS 3, `react-router-dom` (HashRouter)
- Zustand for state management
- Supabase (Auth, Postgres, Realtime) via `@supabase/supabase-js`
- `jsPDF` and `html2canvas` for PDF export
- `lucide-react` for icons
- GitHub Actions and GitHub Pages for build and deployment

### How It Works
- **Structure:** `src/pages` holds the screens (Login, Register, Dashboard, CourseSelection, ClassSchedule, GradeReport, AdminPanel). `src/components` holds shared UI and admin tabs. `src/store/useAppStore.ts` is the central Zustand store. `src/lib` holds the GPA scale, validation, schedule parsing, and PDF helpers.
- **Rules in the store:** the credit cap, time conflicts, and duplicate/full-course checks are enforced in the store, not just the UI.
- **Route guards:** signed-out users are redirected. Students cannot open admin routes. The profile form blocks all navigation until it is completed.
- **Persistence:** Supabase provides authentication, the database (`supabase/schema.sql`, plus a migration for department-required electives), and realtime sync, so the admin and all students see the same data live. Setup steps are in `SUPABASE_SETUP.md`.
- **Deployment:** the GitHub Actions workflow builds the Vite project and publishes it to GitHub Pages at `/homework/02/`.

> The project README still contains older passages that mention a `localStorage`-only version. The Supabase backend replaced it.

### Output / Result
- A single-page web application with a sign-in screen, student dashboard with announcements, course selection page, timetable grid, transcript page, and an admin console.
- Downloadable PDFs: an A4-landscape class timetable and an A4-portrait official-style transcript.

---

## Homework 03: Lele Clinic Registration and Outpatient System

**Location:** `homework/03/Clinic_System/`

### Overview / What It Is About
- A static web app for a small Taiwanese clinic that replaces walk-in queues and phone bookings.
- **Patients** sign up, manage a profile, and book, reschedule, or cancel visits.
- **Clinic staff (admin)** see dashboard metrics, a master schedule with search and filters, status management (Completed, No-Show, and so on), and a patient directory with visit history.
- Clinic rules:
  - Hours 08:00-21:00 in 30-minute slots.
  - Lunch break 12:00-13:30 and dinner break 17:00-18:00.
  - Bookings must be made at least 1 hour ahead (admin exempt).
  - One active appointment per department per slot.
  - A cancellation reason is mandatory.

### Programming Language(s)
- JavaScript (ES modules, vanilla)
- SQL (PostgreSQL / PL/pgSQL)
- HTML and CSS

### Tools & Technologies
- Supabase: Auth, Postgres, Realtime, Row Level Security
- Tailwind CSS and Lucide icons (CDN), Supabase JS client (CDN)
- GitHub Pages for hosting (no application server)

### How It Works
- `index.html` is the app shell. `app.js` handles authentication state, views, validation, and realtime updates. `style.css` holds small custom styles. `schema.sql` defines tables, triggers, RLS policies, and the realtime publication.
- **Rules are enforced twice:** instantly in `app.js` (greyed-out slots, toasts) and in a PostgreSQL trigger (`validate_appointment`), so the API cannot bypass them.
- **Role-based access:** the admin role is derived from the verified JWT email claim inside the `is_admin()` SQL function, not from a client-side flag. RLS limits patients to their own rows.
- **Tables:** `profiles` and `appointments`. A partial unique index prevents double booking, and `get_taken_slots()` lets patients see taken times without exposing other patients' data.

### Output / Result
- A responsive web app with separate patient and admin views.
- Patient view: appointment tabs (Upcoming, Past, Rescheduled, Cancelled and No-Show).
- Admin view: master schedule, dashboard metrics, and patient directory.
- Appointment records live in Supabase.

---

## Homework 04: Git Flow Practice

**Location:** `homework/04/README.md` (the practice repositories are separate)

### Overview / What It Is About
- Exercises in Git collaboration: branches, forks, and pull requests.
- The README records the commit history of two repositories:
  - `TestExamplevionylele/git_Example` (branches `main` and `developGitBranch`).
  - The fork `vionylele/git_Example` (branch `main`).
- Recorded commits include `Initial commit`, `add gitBranch.md`, `add vionylele_Fork.md`, and the merged pull requests between the main project and the fork.

### Programming Language(s)
- None. The work is version control with Markdown files.

### Tools & Technologies
- Git (branching, merging, forking)
- GitHub (pull requests, forks)

### How It Works
1. Create the main repository and an initial commit.
2. Add `gitBranch.md` on `main` and on the `developGitBranch` branch.
3. Fork the repository and add `vionylele_Fork.md` in the fork.
4. Open a pull request from the fork to the main project, merge it, and merge back (`Merge pull request #1` appears on both sides).

### Output / Result
- A documented commit and branch history for both repositories (see `homework/04/README.md`).
- The two practice repositories are not stored here. [To be confirmed: their full contents.]

---

## Homework 05: IoT Sensor Monitoring Hub (Docker)

**Location:** `homework/05/iot-sensor-hub/`

### Overview / What It Is About
- A microservices project in which virtual IoT devices stream temperature, humidity, and battery readings into PostgreSQL and appear live on a web dashboard.
- It runs entirely in Docker Compose and needs **no physical hardware**.
- The README also contains an architecture diagram (Mermaid and ASCII), an API reference, a Docker learning log, and an AI development log.

### Programming Language(s)
- JavaScript (Node.js 22): backend and simulator
- SQL: database schema
- HTML / CSS / JavaScript: dashboard
- Dockerfile, YAML, and Nginx configuration

### Tools & Technologies
- Docker and Docker Compose (healthchecks, named volume, two networks)
- Express (REST API) and the `pg` PostgreSQL client
- PostgreSQL (alpine image)
- Nginx (static files and reverse proxy)
- Tailwind CSS (CDN) and Chart.js
- GitHub Actions and GitHub Pages (demo-mode dashboard)

### How It Works
| Service | Role |
|---|---|
| `nginx` | Serves the dashboard and proxies `/api/*` to the backend. It is the only published port (80). |
| `backend` | Express API with multi-stage, non-root Docker build. It validates and stores readings and runs a retention job (default 24 h). |
| `db` | PostgreSQL with a persistent named volume, initialised by `db/init.sql`. |
| `simulator` | Three virtual devices (`sensor-living-room`, `sensor-warehouse`, `sensor-kitchen`) post a reading every 3-5 seconds. |

- **Flow:** the simulator posts to `POST /api/sensors/data`. The backend inserts into the `sensor_readings` table. The browser polls `/api/sensors/latest` and `/api/sensors/history/:deviceId` through Nginx.
- **Design choices:** the database sits on an `internal` network reachable only by the backend. Startup is gated by healthchecks (db, then backend, then nginx and simulator). The API is same-origin, so no CORS is needed.
- **Other endpoint:** `GET /api/health`.

```bash
cp .env.example .env
docker compose up --build      # then open http://localhost
```

### Output / Result
- A live dashboard at `http://localhost` showing three device cards and a history chart (click a card to change the device).
- Readings persist in PostgreSQL.
- A GitHub Pages **demo mode** simulates the sensors in the browser, because Pages cannot run Docker.

---

## Homework 06: Software Testing Suite

**Location:** `homework/06/`

### Overview / What It Is About
- A three-tier automated test suite for the clinic app from Homework 03.
- The application code is **not modified**. Everything lives in `homework/06/`.
- Layers:
  - **Unit:** business rules (slots, 1-hour lead time, roles, profile checks).
  - **System/API:** the live Supabase REST and Auth API (API key, RLS, database validation).
  - **End-to-end:** user journeys through the real UI.
- Documented finding: the app has no Taiwan national-ID format check, so `profile-validator.ts` works as an executable specification of the missing rule.

### Programming Language(s)
- TypeScript
- JavaScript (`.mjs` helper scripts)
- HTML (QA dashboard page)

### Tools & Technologies
- Vitest (unit and system tests, fake timers)
- Playwright (Chromium and Firefox, headless)
- `@supabase/supabase-js`, `dotenv`, `http-server`
- GitHub Actions (`tests.yml`) and GitHub Pages (QA dashboard)

### How It Works
- **Unit tests run the shipped code:** `load-clinic-rules.ts` slices the real "Business rules" block out of `app.js` and evaluates it, so regressions in the app fail the tests.
- **System tests** use read-only and negative checks with the anon key. Authenticated write tests are opt-in via `TEST_PATIENT_EMAIL` / `TEST_PATIENT_PASSWORD`.
- **E2E tests** use a deterministic in-memory Supabase (`fake-supabase.ts`) wired in through Playwright network interception, with time pinned to Asia/Taipei.
- **CI:** the "Homework 06 Tests" workflow runs all tiers, merges the output into `results.json` (`scripts/build-results.mjs`), commits it, and redeploys GitHub Pages so the dashboard updates.

```bash
cd homework/06
npm install
npx playwright install
npm run test:all      # or test:unit, test:system, test:e2e
```

### Output / Result
- Latest recorded run in `results.json` (updated 2026-11-05): **38 of 38 tests passed** (15 unit, 13 system, 10 end-to-end).
- A QA dashboard (`index.html`) with pass/fail status, and a Playwright HTML report (`npm run report`).

---

## Homework 07: DocuTidy (Document Layout Cleaner and Formatter)

**Location:** `homework/07/Document Layout Cleaner & Formatter/`

### Overview / What It Is About
- A browser-based tool that audits a Word (`.docx`) or PowerPoint (`.pptx`) file for broken layout, repairs it, and returns a `_tidy` copy.
- Everything runs in the browser tab, so documents are **never uploaded**.
- Word fixes: tables wider than the page, clipped cell text, mis-numbered typed lists, blank paragraphs, stray spaces, uneven spacing and font sizes.
- PowerPoint fixes: text overflowing its box, double line breaks, off-centre titles, and slightly misaligned boxes.
- Batch mode: select many files, see one combined audit, and download one ZIP or each file separately.

### Programming Language(s)
- JavaScript (vanilla)
- HTML and CSS

### Tools & Technologies
- JSZip (unzip and re-zip the Office package)
- `DOMParser` and `XMLSerializer` (OOXML editing)
- Tailwind CSS (CDN) and Google Fonts (Fraunces, Instrument Sans)
- GitHub Pages (single static `index.html`)

### How It Works
1. **Open:** JSZip unpacks the OOXML package. The file type is detected from its parts (`word/document.xml` or `ppt/presentation.xml`).
2. **Parse:** the relevant XML parts are loaded with `DOMParser`.
3. **Audit (dry run):** each rule runs on a throw-away DOM and counts what it would change. The same code is used for repair, so audit numbers match.
4. **Repair:** the selected rules run on a fresh DOM, inserting elements in schema order so Office opens the result cleanly.
5. **Package:** `XMLSerializer` and JSZip write a `name_tidy` file. The original is untouched.
6. **Verify:** the output is re-opened and re-scanned to report remaining issues.
- Each rule can be switched off. Only the main body is processed. Headers, footers, footnotes, slide masters, and notes are not.

### Output / Result
- A repaired `name_tidy.docx` or `name_tidy.pptx`, or `docutidy_tidy.zip` for batches.
- An on-page audit and result summary with remaining-issue counts.
- "Try a broken sample" buttons generate demo files for testing.

---

## Homework 08: Durable Chat on Cloudflare Workers

**Location:** separate repository, [`vionylele/durable-chat-template`](https://github.com/vionylele/durable-chat-template). It is not stored in this repo. This section is summarised from the existing project summary in `homework/08/README.md`. [To be confirmed against the source repository.]

### Overview / What It Is About
- A real-time chat app on Cloudflare Workers (Week 9: Cloudflare website project).
- Each visitor gets a chat room based on the ID in the URL. Anyone who opens the same URL joins the same room.

### Programming Language(s)
- TypeScript / JavaScript (Worker and React front end) [To be confirmed]

### Tools & Technologies
- Cloudflare Workers and **Durable Objects** (one `Chat` class per room)
- WebSocket through **PartyKit** libraries (`partyserver`, `partysocket`)
- Durable Object SQL storage
- React 19 and `react-router`, built with `esbuild`
- Wrangler CLI (`wrangler.json`: Durable Object binding `Chat`, SQLite migration `v1`, observability enabled)

### How It Works
- Browsers open a WebSocket to the room's Durable Object.
- Messages are saved in a `messages` table using parameterized queries.
- New users receive the full history on join, and new messages are broadcast to everyone in the room.
- WebSocket hibernation avoids paying for idle connections.
- Static files are served from `public/` through the Workers assets binding, with single-page-app fallback.

```bash
npm install
npx wrangler deploy     # deploy to Cloudflare
npx wrangler tail       # watch logs
```

### Output / Result
- A live, multi-user chat room reachable by URL, with persistent message history.
- Deployed on Cloudflare Workers. [To be confirmed: live URL.]

---

## Homework 09: dupe-hunter-kit (Duplicate File Finder)

**Location:** `homework/09/dupe-hunter-kit/`

### Overview / What It Is About
- A fast, zero-dependency duplicate file finder and storage analyzer, usable as a Python library and a command-line tool.
- It finds byte-for-byte identical files, reports how much disk space can be reclaimed, and can safely delete or quarantine the extra copies.
- Safe by default: cleanup is a **dry run** unless `--yes` is given, and at least one original per group is always kept.

### Programming Language(s)
- Python 3.9+ (fully type-hinted, with a `py.typed` marker)

### Tools & Technologies
- Python standard library only (`hashlib`, `pathlib`, `os`, `shutil`, `argparse`, `json`). There are no runtime dependencies.
- `hatchling` build backend (`pyproject.toml`), packaged for PyPI
- `pytest` for tests (about 32 test functions in `tests/test_dupe_hunter.py`)
- `build` and `twine` as optional dev tools

### How It Works
- **Two-pass algorithm:**
  1. Group files by byte size. Files with a unique size are discarded without reading their contents.
  2. Stream only the remaining candidates through SHA-256 in 64 KiB chunks.
- **Modules:** `core.py` (hashing, scanning, reporting, cleanup), `cli.py` (argparse CLI), `exceptions.py` (`DupeHunterError` and subclasses), `__init__.py` (public API).
- **API:** `find_duplicates`, `get_storage_report`, `clean_duplicates`, `compute_file_hash`, `human_readable_size`.
- **Cleanup strategies:** `keep_oldest`, `keep_newest`, `keep_shortest_path`. Symlinks are never scanned or removed. `--move-to` never overwrites existing files.

```bash
pip install -e ".[dev]"
dupe-hunter scan ~/demo --ext .pdf,.jpg,.docx
dupe-hunter scan ~/demo --delete --strategy keep_shortest_path      # dry run
dupe-hunter scan ~/demo --move-to ~/quarantine --yes                # apply
```

### Output / Result
- A CLI summary (files scanned, duplicate groups, redundant files, reclaimable space), a table of groups, and the list of paths in each group.
- `--json` gives a machine-readable report. A dry-run preview lists what would be deleted or moved.
- Exit code `0` on success, `2` on error.
- A pytest suite verifies behaviour. [To be confirmed: latest test results.]

---

## Repository Structure

```text
.
├── README.md                    # this file
├── index.html                   # landing page for all homework (GitHub Pages)
├── LICENSE
├── .github/workflows/
│   ├── deploy.yml               # builds HW02 and publishes the site to GitHub Pages
│   └── tests.yml                # runs the HW06 test suite and updates results.json
└── homework/
    ├── 01/pycurl_lite/          # Python CLI HTTP client + web demo
    ├── 02/nqu-portal/           # React + TypeScript + Supabase portal
    ├── 03/Clinic_System/        # clinic registration web app
    ├── 04/                      # Git flow practice notes
    ├── 05/iot-sensor-hub/       # Docker Compose microservices
    ├── 06/                      # Vitest + Playwright test suite
    ├── 07/Document Layout Cleaner & Formatter/   # DocuTidy
    ├── 08/                      # summary README (Cloudflare project lives in its own repo)
    └── 09/dupe-hunter-kit/      # Python duplicate-file package
```

## Deployment

- The root workflow `deploy.yml` runs on every push to `main`. It builds the Homework 02 portal with Vite and publishes the repository, including the built portal at `/homework/02/`, to GitHub Pages.
- The `tests.yml` workflow for Homework 06 is started manually ("Run workflow"). It commits an updated `results.json` and redeploys Pages.
- Live site: [vionylele.github.io/_se](https://vionylele.github.io/_se/)

## Credits

- **This README and all projects in this repository were made by Claude (Anthropic).**
- Course: Modern Software Engineering, National Quemoy University.
- Licensed under the terms in [LICENSE](LICENSE). Individual projects may carry their own license (for example, `dupe-hunter-kit` is MIT).
