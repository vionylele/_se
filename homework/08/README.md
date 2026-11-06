
> **Note:** This README was **created by Claude** (an AI assistant by Anthropic) by summarizing the contents of the whole homework repository. Please verify technical details against the original files.

## Weekly Checklist

| Week | Topic | Attended & submitted on time | Late submission with leave proof | Homework link |
|:--:|---|:--:|:--:|:--:|
| 1 | curl | ✅ Yes | | [01](https://github.com/vionylele/_se/tree/main/homework/01) |
| 2 | Campus administration system | ✅ Yes | | [02](https://github.com/vionylele/_se/tree/main/homework/02) |
| 3 | Valuable project | ✅ Yes | | [03](https://github.com/vionylele/_se/tree/main/homework/03) |
| 4 | Git flow |  ✅ Yes |  | [04](https://github.com/vionylele/_se/tree/main/homework/04) |
| 5 | (Holiday) | ✅ Yes | | |
| 6 | Docker | ✅ Yes | | [05](https://github.com/vionylele/_se/tree/main/homework/05) |
| 7 | Website testing | ✅ Yes | | [06](https://github.com/vionylele/_se/tree/main/homework/06) |
| 8 | Valuable project | ✅ Yes | | [07](https://github.com/vionylele/_se/tree/main/homework/07) |
| 9 | Cloudflare website project | ✅ Yes | | [durable-chat-template](https://github.com/vionylele/durable-chat-template) |

---

## Summary of All Homework

This repository holds the assignments for *Modern Software Engineering*: seven projects inside this repo (HW01–HW07) plus the final Cloudflare project (Week 9), which lives in its own repository. They move from a small command-line tool, to full-stack web apps with a database, to Docker, Git, automated testing, a client-side document tool, and finally a real-time app on Cloudflare Workers. Most projects are deployed or deployable on **GitHub Pages**, and a root [`index.html`](index.html) acts as a landing page for them.

[Summary of All Homework](https://vionylele.github.io/_se/) <-- Click Me

## Homework 01 — PyCurl-Lite

A lightweight, `curl`-inspired **command-line HTTP client** written in Python on top of the `requests` library. It is independent of the third-party `pycurl` package.

- **Methods:** `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, and custom methods via `-X`
- **Request options:** custom headers (`-H`), raw/JSON body (`-d`), multipart form fields (`-F`), Basic Auth (`-u`), `User-Agent` (`-A`), cookies (`-b`)
- **Output options:** save to file (`-o`, `-O`), headers only (`-I`), include headers (`-i`), verbose trace (`-v`), silent mode (`-s`)
- **Other:** follow redirects (`-L`), skip SSL verification (`-k`), connection and total timeouts

```bash
pip install -r requirements.txt
python pycurl_lite.py -X POST -H "Content-Type: application/json" -d '{"name": "claude"}' https://httpbin.org/post
```

## Homework 02 — NQU Academic Administration Portal

An English-language campus management system, inspired by National Quemoy University, written as a React + TypeScript single-page app. Persistence now uses **Supabase** (Auth + Postgres + Realtime), so announcements, courses, enrollments, and profiles are shared live between the administrator and all students. Setup steps are in `SUPABASE_SETUP.md`.

- **Authentication and roles:** email/password sign-up and sign-in, with `ADMIN` and `STUDENT` roles and route guards.
- **Mandatory first-login profile:** students must complete a profile (with a compressed photo) before seeing anything else.
- **Course add/drop:** filterable catalog, a 25-credit limit, time-conflict detection, and duplicate/full-course checks.
- **Timetable:** Taiwan period system (Periods 1–9 with a 12:00–13:30 lunch break), exportable to PDF.
- **Transcript:** Taiwan 4.3 GPA scale with semester and cumulative GPA, exportable to PDF.
- **Administrator panel:** announcements, course management, and a student directory.

## Homework 03 — Lele Clinic (Medical Registration & Outpatient System)

A static web app (no application server) for a small Taiwanese clinic, backed by Supabase Auth, Postgres, and Realtime. Patients book, reschedule, and cancel visits; clinic staff manage the schedule.

- **Clinic rules:** hours 08:00–21:00 in 30-minute slots, lunch break 12:00–13:30, dinner break 17:00–18:00, bookings at least 1 hour ahead (admin exempt), no double booking per department and slot, and a mandatory cancellation reason.
- **Rules enforced twice:** in `app.js` for instant feedback, and in a PostgreSQL trigger so the API cannot bypass them.
- **Role-based access:** the admin role comes from the verified JWT email inside the `is_admin()` SQL function, not from a client-side flag. Row Level Security protects patient data.
- **Patients:** profile, booking, rescheduling, cancelling, and an appointment history.
- **Admin:** dashboard metrics, master schedule with search and filters, status changes (Completed, No-Show, etc.), and a patient directory with visit history.
- **Files:** `index.html`, `app.js`, `style.css`, `schema.sql`.

## Homework 04 — Git Practice

Exercises in Git collaboration using the sample repository `git_Example`. The [`README.md`](homework/04/README.md) records the commit history of two repositories: the main project (with branches `main` and `developGitBranch`) and its **fork**. The history includes `Initial commit`, `add gitBranch.md`, `add vionylele_Fork.md`, and the **pull requests** merged between the main project and the fork.

- `git_Example/gitBranch.md` — a file added on a branch.
- `git_Example/vionylele_Fork.md` — a file added from the fork.

## Homework 05 — IoT Sensor Monitoring Hub

A small **microservices** project that simulates virtual IoT devices streaming temperature, humidity, and battery readings into PostgreSQL, displayed live on a web dashboard. It runs entirely in Docker Compose and needs no hardware.

| Service | Role |
|---|---|
| `nginx` | Serves the dashboard and proxies `/api/*` to the backend. It is the only published port (80). |
| `backend` | Node.js 22 + Express REST API (multi-stage Docker build). Ingests and queries readings. |
| `db` | PostgreSQL with a persistent named volume. |
| `simulator` | Three virtual devices post a reading every 3–5 seconds. |

- **Networking:** two networks, `edge_net` and an internal `backend_net` so the database has no outside access.
- **Documentation:** the README includes Mermaid and ASCII architecture diagrams, an API reference, a Docker learning log, an AI development log, and a guide for a live demo on GitHub Pages.

```bash
cp .env.example .env
docker compose up --build
```

## Homework 06 — Software Testing Suite

A three-tier automated test suite for the clinic app from Homework 03. The application code is **not modified**.

| Layer | Tool | What it checks |
|---|---|---|
| Unit | Vitest (fake timers) | Business rules taken from the real `app.js`: slots, lead time, roles, profile checks |
| System (API) | Vitest + `fetch` | Live Supabase REST/Auth: API key, RLS, and database validation |
| End-to-end | Playwright (Chromium and Firefox) | User journeys through the real UI, with a deterministic in-memory Supabase |

- **Latest recorded run:** all **38** tests passed (15 unit, 13 system, 10 end-to-end), according to `results.json` (updated 2026-11-05).
- **CI:** `.github/workflows/tests.yml` runs the tests from a "Run workflow" button, writes `results.json`, and redeploys GitHub Pages. A dashboard page (`index.html`) shows the results.
- **Documented finding:** the app has no Taiwan national-ID format check, so `profile-validator.ts` works as an executable specification of the missing rule.

## Homework 07 — DocuTidy (Document Layout Cleaner & Formatter)

A browser-based tool that audits a Word (`.docx`) or PowerPoint (`.pptx`) file for broken layout, repairs it, and gives back a `_tidy` copy. Everything runs in the browser tab, so documents are never uploaded.

- **Word fixes:** tables wider than the page, clipped cell text, mis-numbered typed lists, piles of blank paragraphs, stray spaces, and uneven spacing and font sizes.
- **PowerPoint fixes:** text spilling out of boxes, overlapping boxes, double line breaks, and titles that drift between slides.
- **Batch mode:** select many files at once, review one combined audit, and download the results as a single ZIP or file by file.
- **Transparent and safe:** each rule can be switched off, the original is never modified, and the output is re-opened and re-audited to report remaining issues.
- **Built with:** JSZip, `DOMParser`, and `XMLSerializer`. Includes "try a broken sample" buttons.

## Week 9 — Cloudflare Website Project (Durable Chat)

Source: [`vionylele/durable-chat-template`](https://github.com/vionylele/durable-chat-template). This project is **not stored in this repository**; it has its own repo.

A real-time chat app that runs on **Cloudflare Workers**. Each visitor gets a chat room based on the ID in the URL, and anyone who opens the same URL joins the same room.

- **How it works:** each room is one **Durable Object** (`Chat` class). Browsers connect to it over **WebSocket**, and connections are managed with the **PartyKit** server API (`partyserver`, `partysocket`).
- **Storage:** messages are saved in the Durable Object's built-in **SQL storage** (a `messages` table) with parameterized queries. New users receive the full history when they join, and new messages are broadcast to everyone in the room.
- **Hibernation:** the Durable Object uses WebSocket hibernation to avoid paying for idle connections.
- **Front end:** React 19 with `react-router`, built with `esbuild`. Static files are served from `public/` through the Workers assets binding, with single-page-app fallback.
- **Configuration:** `wrangler.json` (Durable Object binding `Chat`, SQLite migration `v1`, observability enabled).

```bash
npm install
npx wrangler deploy     # deploy to Cloudflare
npx wrangler tail       # watch logs
```

---

## Repository Structure

```
.
├── README.md
├── index.html                  # landing page for all homework
├── .github/workflows/          # deploy.yml (GitHub Pages), tests.yml (HW06 tests)
└── homework/
    ├── 01/pycurl_lite/         # Python CLI HTTP client
    ├── 02/nqu-portal/          # React + Supabase academic portal
    ├── 03/Clinic_System/       # clinic registration web app
    ├── 04/                     # Git practice (git_Example, README.md)
    ├── 05/iot-sensor-hub/      # Docker Compose microservices
    ├── 06/                     # Vitest + Playwright test suite
    └── 07/Document Layout Cleaner & Formatter/   # DocuTidy
```

---

*This README was created by Claude (Anthropic).*
