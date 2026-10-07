<div align="center">

# National Quemoy University (NQU) Academic Administration Portal

**A fully English-language, static campus management system that runs entirely in the browser and deploys to GitHub Pages.**

[![Created & Architected by Claude (Anthropic)](https://img.shields.io/badge/Created%20%26%20Architected%20by-Claude%20(Anthropic)-D97757?style=for-the-badge)](https://www.anthropic.com)

[![Deploy to GitHub Pages](https://github.com/OWNER/REPO/actions/workflows/deploy.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/deploy.yml)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white)
![Zustand](https://img.shields.io/badge/State-Zustand-433E38)
![Language](https://img.shields.io/badge/UI_Language-English_only-2EA44F)
![Hosting](https://img.shields.io/badge/Hosting-GitHub_Pages-181717?logo=github)

</div>

> **Backend update:** persistence now uses **Supabase** (Auth + Postgres + Realtime) instead of browser `localStorage`. Announcements, courses, enrollments and profiles are shared live between the admin and all students. Follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md) first; sections below that mention "no backend" or `localStorage` describe the previous version.

> **Before you publish:** replace `OWNER/REPO` in the deploy-status badge above with your GitHub username and repository name.
> The portal is inspired by National Quemoy University and is a demonstration project; it is not an official university system.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Key Modules](#key-modules)
3. [Tech Stack](#tech-stack)
4. [Directory Tree](#directory-tree)
5. [Local Development](#local-development)
6. [GitHub Pages Deployment Guide](#github-pages-deployment-guide)
7. [Test Account Guide for Evaluators](#test-account-guide-for-evaluators)
8. [Configuration Reference](#configuration-reference)
9. [Known Limitations](#known-limitations)
10. [Troubleshooting](#troubleshooting)

---

## System Overview

The NQU Academic Administration Portal is a single-page application that models the day-to-day workflow of a Taiwanese university: students register, complete a mandatory profile, select courses under strict rules, view a period-based timetable, and download an official-style academic transcript, while an administrator publishes announcements, manages the catalog, and reviews the student directory.

- **100% English UI.** Every label, form, validation message, table heading, and exported PDF is in English.
- **No backend.** All data lives in the browser's `localStorage` through a persisted Zustand store, so the app is a pure static site that GitHub Pages can host for free.
- **Taiwan academic conventions.** Uses the Taiwan 4.3 GPA scale, the standard Taiwan class-period slot system (Periods 1-9 plus the Period Z noon break), and a 25-credit semester limit.
- **Deep-link safe.** Uses `HashRouter`, so refreshing any page on GitHub Pages never produces a 404.

---

## Key Modules

### 1. Authentication & Administrator Access
- Email and password registration and sign-in with clear English validation messages.
- **Role assignment at registration:** the reserved email `vionylee07@gmail.com` is registered with the `ADMIN` role; every other email becomes a `STUDENT`.
- Route guards: signed-out users are redirected to sign-in, students cannot open admin routes, and `/admin` requires both the `ADMIN` role and the reserved administrator email.
- Passwords are stored as salted SHA-256 hashes (see [Known Limitations](#known-limitations)).

### 2. Mandatory Student Profile (First Login)
- A student whose `isProfileCompleted` flag is `false` sees **only** the profile form. The sidebar, navbar, and every page are not rendered, so there is nothing to navigate to until the form is submitted.
- Fields: full name, Student ID, department / major, academic year, date of birth (age calculated automatically), place of origin, nationality, current living address, optional profile photo, and emergency contact name and phone.
- The photo is center-cropped to a square, compressed, and stored as a base64 data URL with an instant preview.
- Validation is shared between the form and the store (`src/lib/validation.ts`), and Student IDs must be unique.

### 3. Course Add / Drop (25-Credit Limit)
- Filterable catalog: search by course code or name, department, day of the week, and course type.
- Real-time progress bar: **"Total Enrolled: X / 25 Credits"**.
- Hard guard rails enforced in the store (not just the UI):
  - **Credit cap:** adding a course that would push the total above 25 credits is rejected with an explanatory message.
  - **Time conflict:** a course sharing any day and period with an enrolled course is rejected, naming the clashing course and slot.
  - Also blocks duplicate enrollment and full courses.
- "Enrolled Courses" table with one-click **Drop Course**.

### 4. Taiwan Period Timetable with PDF Export
- Weekly grid, Monday to Friday (Saturday appears only if an enrolled course meets then), with rows for Period 1-4, **Period Z (Noon Break)**, and Period 5-9, each labeled with its clock time.

  | Period | Time | Period | Time |
  |---|---|---|---|
  | 1 | 08:10 - 09:00 | 5 | 13:30 - 14:20 |
  | 2 | 09:10 - 10:00 | 6 | 14:30 - 15:20 |
  | 3 | 10:10 - 11:00 | 7 | 15:30 - 16:20 |
  | 4 | 11:10 - 12:00 | 8 | 16:30 - 17:20 |
  | Z (Noon Break) | 12:10 - 13:00 | 9 | 17:30 - 18:20 |

- Consecutive periods of the same course merge into one block showing course name, instructor, and classroom.
- **Export Schedule to PDF** (jsPDF + html2canvas): an A4-landscape document headed "National Quemoy University - Student Class Timetable" with student name, Student ID, department, and semester.

### 5. Official Grade Transcript (Taiwan 4.3 GPA) with PDF Export
- Academic record table: Semester, Course Code, Course Title, Credits, Numeric Score, Letter Grade, Grade Point, with a per-semester summary row.
- Summary cards: **Semester GPA**, **Cumulative GPA**, **Total Earned Credits**, and **Academic Standing**.
- Grade scale:

  | Letter | Score | Grade Point | Letter | Score | Grade Point |
  |---|---|---|---|---|---|
  | A+ | 90-100 | 4.3 | B- | 70-72 | 2.7 |
  | A | 85-89 | 4.0 | C+ | 67-69 | 2.3 |
  | A- | 80-84 | 3.7 | C | 63-66 | 2.0 |
  | B+ | 77-79 | 3.3 | C- | 60-62 | 1.7 (minimum pass) |
  | B | 73-76 | 3.0 | F | below 60 | 0.0 |

- GPA is credit-weighted, and failed courses count toward attempted credits.
- **Download Official Transcript (PDF)**: A4 portrait, institution header, student biography (with photo), grade table, grading-system key, and a signature and seal footer. Long transcripts paginate automatically, and rows and sections are never cut in half.

### 6. Administrator Panel
- **Publish Announcement:** title, category (Academic / General / Urgent), publication date, a free-text **Posted By** label (for example "Office of Academic Affairs"), body text, and an optional pin. Published announcements can be **edited** or deleted.
- **Course Management:** add courses with code, title, instructor, department, credits, day and periods (for example `Tue 3-4` or `Mon 2-4, Wed 1`), classroom, and capacity. Rejects duplicate codes and classroom or instructor double-booking. Existing courses can be **edited** (changes are blocked if they would clash with an enrolled student's other courses, push them above 25 credits, or set the capacity below the current enrollment) or deleted (their enrollments are removed too).
- **Student Directory:** every registered student with profile status, contact details, emergency contact, and enrolled credits, searchable and filterable.

---

## Tech Stack

| Concern | Choice |
|---|---|
| Framework | React 18 + TypeScript, built with Vite |
| Styling | Tailwind CSS 3, Lucide React icons |
| Routing | React Router 6 with `HashRouter` |
| State & persistence | Zustand with `persist` middleware (`localStorage`) |
| PDF export | jsPDF + html2canvas (loaded on demand) |
| Hosting & CI | GitHub Pages, GitHub Actions |

---

## Directory Tree

```text
nqu-portal/
├── .github/
│   └── workflows/
│       └── deploy.yml               # CI/CD: build on push to main, publish to GitHub Pages
├── .gitignore                       # Ignores node_modules and dist
├── index.html                       # HTML entry point (page title, Google Fonts)
├── package.json                     # Dependencies and npm scripts (dev, build, preview)
├── postcss.config.js                # PostCSS: Tailwind + Autoprefixer
├── tailwind.config.js               # Brand color palette and font families
├── tsconfig.json                    # Strict TypeScript configuration
├── vite.config.ts                   # Vite config; base './' for GitHub Pages sub-paths
├── README.md
└── src/
    ├── main.tsx                     # React bootstrap
    ├── App.tsx                      # HashRouter route table and route guards
    ├── index.css                    # Tailwind layers and shared component classes
    │
    ├── types/
    │   └── index.ts                 # Models: User, StudentProfile, Course, Enrollment,
    │                                #   GradeRecord, Announcement, TimetableSlot, ActionResult
    ├── store/
    │   └── useAppStore.ts           # Zustand store: auth, profile, course add/drop validation,
    │                                #   admin actions, localStorage persistence, seed data
    ├── lib/
    │   ├── academic.ts              # Constants (admin email, 25-credit cap), 4.3 grade scale,
    │   │                            #   period table, GPA and standing logic, date helpers
    │   ├── validation.ts            # Login, registration, and profile validators (English messages)
    │   ├── schedule.ts              # Parses "Tue 3-4" style text into timetable slots
    │   ├── image.ts                 # Crops and compresses profile photos to base64
    │   └── pdf.ts                   # html2canvas + jsPDF export (single-page and paginated)
    │
    ├── components/
    │   ├── AppLayout.tsx            # Authenticated shell and the mandatory-profile guard
    │   ├── AuthLayout.tsx           # Split-screen layout for sign-in and registration
    │   ├── FirstTimeProfileModal.tsx# Blocking first-login profile form
    │   ├── Navbar.tsx               # Top bar: page title, semester, user chip, sign out
    │   ├── Sidebar.tsx              # Navigation drawer: profile card, role-aware links
    │   ├── navigation.ts            # Navigation items and which roles can see them
    │   ├── RouteGuards.tsx          # PublicOnly, RequireAuth, RequireRole, RequireAdmin
    │   ├── UserBadge.tsx            # Avatar (photo or initials) and role badge
    │   ├── CreditProgress.tsx       # "Total Enrolled: X / 25 Credits" progress bar
    │   ├── TimetableGrid.tsx        # Weekly period grid (screen and print variants)
    │   ├── PrintableTimetable.tsx   # Fixed-width sheet captured for the timetable PDF
    │   ├── TranscriptDocument.tsx   # Transcript layout (screen view and PDF capture)
    │   ├── announcementStyles.ts    # Category colors and icons for announcements
    │   ├── admin/
    │   │   ├── AnnouncementsTab.tsx     # Publish / delete announcements
    │   │   ├── CoursesTab.tsx           # Add / delete courses
    │   │   └── StudentDirectoryTab.tsx  # Registered student table
    │   └── ui/
    │       ├── FormFeedback.tsx         # Error / success / info alerts and field errors
    │       ├── FormField.tsx            # Label + control + hint/error wrapper
    │       ├── TextField.tsx            # Icon text input with validation state
    │       └── ConfirmDeleteButton.tsx  # Two-step delete button
    │
    └── pages/
        ├── Login.tsx                # Sign in
        ├── Register.tsx             # Create an account
        ├── Dashboard.tsx            # Announcement board and quick status card
        ├── CourseSelection.tsx      # Catalog, filters, add/drop, enrolled table
        ├── ClassSchedule.tsx        # Weekly timetable and PDF export
        ├── GradeReport.tsx          # Transcript, GPA cards, PDF export
        └── AdminPanel.tsx           # Tabbed admin console (administrator only)
```

---

## Local Development

**Requirements:** Node.js 18 or newer (20 recommended) and npm.

```bash
# 1. Install dependencies (also creates package-lock.json: commit it)
npm install

# 2. Start the dev server with hot reload at http://localhost:5173
npm run dev

# 3. Type-check and create a production build in ./dist
npm run build

# 4. Preview the production build locally
npm run preview
```

`npm run build` runs `tsc --noEmit` before `vite build`, so any TypeScript error fails the build (and the deployment) by design.

---

## GitHub Pages Deployment Guide

Deployment is automated by [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

### 1. Push the project to GitHub
Create a repository, then push the project to the **`main`** branch.

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/OWNER/REPO.git
git push -u origin main
```

### 2. Enable GitHub Pages with GitHub Actions
In the repository, open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**. This is a one-time setting; without it the deploy job cannot publish.

### 3. Let the workflow run
Every push to `main` triggers the workflow, which installs dependencies, runs `npm run build`, and publishes `./dist`. You can also run it manually from the **Actions** tab (**Run workflow**). When it finishes, the site is live at:

```text
https://OWNER.github.io/REPO/
```

### Why the base path is `./` (`vite.config.ts`)

Project sites on GitHub Pages are served from a sub-path (`/REPO/`), not from the domain root. If a build assumed assets live at `/assets/...`, the browser would request `https://OWNER.github.io/assets/...` and the page would load blank.

```ts
// vite.config.ts
export default defineConfig({
  base: './',          // relative asset URLs: works at /REPO/, at the domain root, and on custom domains
  plugins: [react()],
});
```

With `base: './'` the built `index.html` references its scripts and styles relatively, so the same build works under any repository name with no configuration. If you prefer an absolute base, set `base: '/REPO/'` instead (it must match the repository name exactly).

### Why `HashRouter`

GitHub Pages is a static host with no server-side rewrite rules. With a path-based router, refreshing `https://OWNER.github.io/REPO/courses` asks the server for a file that does not exist and returns a 404. `HashRouter` keeps the route after a `#` (`.../REPO/#/courses`), which the browser never sends to the server, so every deep link and refresh works.

### Optional: custom domain or user site
No changes are needed. Because the base path is relative, the same build works on `OWNER.github.io`, on a project path, and on a custom domain configured under **Settings → Pages**.

---

## Test Account Guide for Evaluators

**There are no pre-created accounts.** All data lives in the visiting browser's `localStorage`, so every evaluator starts with an empty system (plus the seeded catalog and announcements) and creates their own accounts. Use **one browser (normal window, not incognito) for the whole walkthrough**, because data is not shared between browsers, devices, or incognito windows. Inside that browser you can open the **administrator in one tab and a student in another tab** and watch changes arrive live.

| Role | Email | Password | How to get it |
|---|---|---|---|
| Student | any valid email, e.g. `student1@example.com` | any, 8 or more characters | Register on the **Create an account** page |
| Administrator | `vionylee07@gmail.com` (exact) | any, 8 or more characters | Register with this email; it is automatically assigned the `ADMIN` role |

### Suggested walkthrough

**A. Student flow**
1. Open the site and choose **Create an account**. Register as a student.
2. You are taken straight to the **Complete Your Student Profile** form. Confirm there is no way to reach another page. Submit it with sample data (for example Student ID `NQU113001`).
3. **Course Selection, time conflict:** add `CSIE1101` (Mon periods 2-4), then try `MATH1101` (Mon periods 3-4 and Wed period 1). Expected: a red alert naming the clash on **Mon: Period 3, 4**.
4. **Course Selection, 25-credit cap:** drop everything, then add `CSIE1101`, `CSIE2203`, `CSIE2305`, `CSIE3401`, `CSIE3502`, `MATH2101`, `EE2201`, and `BA1101` (24 credits). Try `BA2301` (3 credits). Expected: rejected, because the total would be 27 against the 25-credit maximum. Then add `CDS1001` (1 credit). Expected: accepted, the bar shows **25 / 25 Credits**.
5. **Class Schedule:** view the grid (note the Period Z noon-break row, with `CDS1001` placed in it on Wednesday) and click **Export Schedule to PDF**.
6. **Academic Transcript:** new students have no grades yet. Click **Load Sample Grades (Demo)**. Expected values:

   | | Value |
   |---|---|
   | Fall 2025 semester GPA | 4.08 |
   | Spring 2026 semester GPA (latest) | 2.42 |
   | Cumulative GPA | 3.18 |
   | Earned credits | 21 of 24 attempted |
   | Academic Standing | Good Standing |

   Then click **Download Official Transcript (PDF)**.
7. Click **Sign Out**.

**B. Administrator flow**
1. Register with `vionylee07@gmail.com` (still in the same browser). You land on the dashboard with an **Admin Management** link and no student links.
2. **Student Directory:** the student from step A appears with profile status, contact details, and enrolled credits (25).
3. **Publish Announcement:** post one in each category, then check the Dashboard board.
4. **Course Management:** add a course with schedule `Tue 3-4` and a new classroom. Then try reusing an existing classroom at an overlapping time (for example `Engineering Bldg E301` on `Mon 2`). Expected: rejected as a double booking.
5. Sign in as the student again and confirm the new course appears in the catalog.

### Resetting the data
Open the browser's developer tools → **Application** (or **Storage**) → **Local Storage**, and delete the key `nqu-portal-store-v1`, then reload.

---

## Configuration Reference

| What | Where |
|---|---|
| Reserved administrator email | `ADMIN_EMAIL` in `src/lib/academic.ts` |
| Maximum credits per semester | `MAX_CREDITS_PER_SEMESTER` in `src/lib/academic.ts` |
| Grade scale, period times, departments | `GRADE_SCALE`, `PERIODS`, `DEPARTMENTS` in `src/lib/academic.ts` |
| Academic standing rules | `getAcademicStanding()` in `src/lib/academic.ts` |
| Portal and university names | `APP_NAME`, `UNIVERSITY_NAME` in `src/lib/academic.ts` |
| Current semester, seed courses, seed announcements | `CURRENT_SEMESTER` and the seed constants in `src/store/useAppStore.ts` |
| Brand colors and fonts | `tailwind.config.js` |

---

## Known Limitations

This is a static, client-only demonstration. Please read before using it for anything beyond a demo.

- **Data is per browser.** There is no server. Several tabs and windows of the **same browser** stay in sync automatically (an announcement, course, or registration made in one tab appears in the others within moments), but a different browser, a different device, or a private/incognito window has its own separate data. Sharing data between different people's devices requires a hosted database (for example Firebase or Supabase), which is not part of this static build.
- **Sessions are per tab.** The signed-in account is kept in `sessionStorage`, so you can stay signed in as the administrator in one tab and as a student in another tab of the same browser. Closing a tab signs that tab out.
- **No real security.** Roles, guards, and password hashes all live in client-side code and `localStorage`, where anyone can read or edit them. Because the administrator account is "whoever registers the reserved email", anyone can claim it in their own browser. A production system requires a backend with real authentication and authorization.
- **Grades are not editable in the UI.** The administrator panel covers announcements, courses, and students. Grade records come only from the **Load Sample Grades (Demo)** button.
- **Academic standing rules are placeholders.** The thresholds (Warning below 2.0 cumulative GPA or when more than half of the latest semester's credits are failed; Dean's List at a 4.0 semester GPA with no failures) are illustrative and should be aligned with the university's actual regulations.
- **Storage quota.** Browsers allow roughly 5 MB of `localStorage`. Profile photos are compressed to keep this safe, but very large numbers of students in one browser could reach the limit.
- **Transcript wording.** The PDF's signature and seal areas are blank placeholders. A document generated by the portal is not a certified copy.

---

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Deployed site is a blank white page | `base` in `vite.config.ts` was changed to an absolute path that does not match the repository name. Restore `base: './'`. |
| Workflow fails at **Type-check and build** | A TypeScript error. Run `npm run build` locally to see it. |
| Workflow fails at **Install dependencies** | A corrupt or out-of-sync `package-lock.json`. Delete it, run `npm install`, and commit the new one. |
| Deploy job fails with a permissions or "Pages not enabled" error | Set **Settings → Pages → Source** to **GitHub Actions** (see step 2 above). |
| PDF export button reports an error | Reload and retry; the PDF libraries load on demand and need network access the first time. Check the browser console for details. |
| Old data or a broken state after an update | Clear the `nqu-portal-store-v1` key in Local Storage and reload. |

---

<div align="center">

Created & Architected by **Claude (Anthropic)**.

</div>
