# Lele Clinic - Medical Registration & Outpatient System

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES_Modules-F7DF1E?logo=javascript&logoColor=black)
![Supabase](https://img.shields.io/badge/Supabase-Auth%20%7C%20Postgres%20%7C%20Realtime-3ECF8E?logo=supabase&logoColor=white)
![GitHub Pages](https://img.shields.io/badge/Deployed%20on-GitHub%20Pages-181717?logo=github)

> **This system was architected, designed, and generated with assistance from Claude (Anthropic).**
> **This project was made by Claude.**

---

## 1. Project Overview & Value

Small general clinics in Taiwan often rely on walk-in queues, phone calls, or paper registration. This causes long waiting times, missed appointments, and manual bookkeeping.

This web app provides:

- **Patients:** self-service sign-up (with account full name), profile management, booking, rescheduling and cancelling visits.
- **Clinic staff (Admin):** live dashboard, a master schedule with search and filters, status management (Completed / No-Show), and a patient directory with full visit history.

**Commercial value:** it requires no server (static hosting + Supabase free tier), reduces no-shows and front-desk phone traffic, and enforces clinic scheduling rules automatically in both the browser and the database.

## 2. Taiwan Clinic Business Logic

| Rule | Value |
|---|---|
| Operating hours | **08:00 - 21:00** (last 30-minute slot starts at 20:30) |
| Lunch break (no appointments) | **12:00 - 13:30** |
| Dinner break (no appointments) | **17:00 - 18:00** |
| Slot granularity | 30 minutes |
| Lead time | Bookings **and** reschedules must be made **at least 1 hour** before the slot (e.g. a 12:00-equivalent slot must be submitted before 11:00) |
| Time zone | `Asia/Taipei` is used for the lead-time check |
| Double booking | One active appointment per department per date/time slot |
| Cancellation | A reason is mandatory (patient or admin) |

Rules are enforced twice: in `app.js` (instant user feedback, greyed-out slots) and in a PostgreSQL trigger (`validate_appointment`) so they cannot be bypassed via the API. Admins are exempt from the 1-hour lead time only.

## 3. RBAC Matrix

| Capability | Admin (`vionylee07@gmail.com`) | Patient (any other email) |
|---|:---:|:---:|
| Sign up / sign in / sign out | Yes | Yes |
| View & edit own profile | Yes | Yes |
| View other patients' profiles | **Yes** | No |
| Book an appointment | - | Yes |
| Reschedule own appointment (>= 1 h notice) | - | Yes |
| Cancel own appointment (reason required) | - | Yes |
| View own appointments (Upcoming / Past / Rescheduled / Cancelled & No-Show) | - | Yes |
| View all appointments (Master Schedule) | **Yes** | No |
| Search & filter by name, date, department, status | **Yes** | No |
| Cancel any appointment (reason required) | **Yes** | No |
| Change any appointment's status (Scheduled, Rescheduled, Completed, Cancelled, No-Show) | **Yes** | No |
| Dashboard metrics | **Yes** | No |
| Patient directory + consultation history | **Yes** | No |

The Admin role is derived from the verified JWT email claim (`auth.jwt() ->> 'email'`) inside the `is_admin()` SQL function, not from any client-side flag.

## 4. Directory Tree & File Descriptions

```
_se/homework/03/Clinic_System/
├── index.html   # Single-page app shell: loads Tailwind, Lucide, Supabase JS (CDN), style.css and app.js
├── app.js       # ES module: Supabase client, auth state, views, validation (hours/breaks/1-hour rule), realtime
├── style.css    # Minimal custom styles: inputs, buttons, slot picker, status badges, modal animation
├── schema.sql   # Supabase migration: tables, triggers, business-rule validation, RLS, realtime publication
└── README.md    # This documentation
```

Repository root (outside this folder) also needs an empty **`.nojekyll`** file - see Section 6.3.

## 5. Supabase Architecture

### 5.1 Tables

**`profiles`** - one row per auth user (created automatically by a trigger on `auth.users`)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | FK to `auth.users(id)` ON DELETE CASCADE |
| `email` | text | copy of the login email |
| `full_name`, `national_id`, `phone` | text | National ID / ARC number |
| `date_of_birth` | date | |
| `gender` | text | Male / Female / Other |
| `emergency_contact`, `emergency_phone` | text | |
| `medical_notes` | text | allergies / chronic conditions |
| `created_at`, `updated_at` | timestamptz | `updated_at` maintained by trigger |

**`appointments`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `patient_id` | uuid | FK to `profiles(id)` ON DELETE CASCADE |
| `appointment_date`, `appointment_time` | date, time | |
| `department` | text | General Medicine, Family Medicine, ENT, Pediatrics |
| `chief_complaint`, `notes` | text | |
| `status` | text | Scheduled, Rescheduled, Completed, Cancelled, No-Show |
| `cancellation_reason`, `cancelled_by` | text | `patient` or `admin` |
| `reschedule_count` | int | drives the "Rescheduled" tab |
| `created_at`, `updated_at` | timestamptz | |

Also: a partial unique index prevents double booking, and `get_taken_slots(date, dept)` (SECURITY DEFINER) lets patients see which times are taken without exposing other patients' data.

### 5.2 Row Level Security model

| Table | Policy | Rule |
|---|---|---|
| `profiles` | select / update | own row, **or** `is_admin()` |
| `profiles` | insert | own row only |
| `appointments` | select | own rows, **or** `is_admin()` |
| `appointments` | insert | `patient_id = auth.uid()` and status `Scheduled` |
| `appointments` | update (patient) | own rows that are Scheduled/Rescheduled; may only become Rescheduled or Cancelled |
| `appointments` | update (admin) | any row |
| `appointments` | delete | no policy: records are never deleted (audit trail) |

### 5.3 Realtime

`appointments` is added to the `supabase_realtime` publication (with `REPLICA IDENTITY FULL`). `app.js` subscribes to `postgres_changes`; RLS is applied to events, so patients only receive their own changes while the Admin receives all. On each event the app reloads data, re-renders the active view, and shows a toast.

## 6. Setup & Execution Guide

### 6.1 Run the SQL schema in Supabase

1. Open the [Supabase Dashboard](https://supabase.com/dashboard) and select your project (`xwchiameamzcwpbwyfea`).
2. Go to **SQL Editor -> New query**.
3. Paste the entire contents of `schema.sql` and click **Run**. It is idempotent and safe to re-run.
4. Go to **Authentication -> Providers -> Email**. For quick testing, turn **"Confirm email" off**. If it stays on, new users must click the confirmation link before signing in.
5. **Register `vionylee07@gmail.com` first** (before sharing the site), so nobody else can claim the admin address. Keep email confirmation on in production.
6. Verify under **Database -> Replication** that `appointments` is enabled for Realtime.

> The anon key in `app.js` is a *public* key and is safe in the browser **because** RLS is enabled. Never put a `service_role` key in front-end code.

### 6.2 Run locally

ES modules do not work from `file://`; use any static server:

```bash
cd _se/homework/03/Clinic_System
python3 -m http.server 8000      # or: npx serve .
# open http://localhost:8000
```

### 6.3 Deploy to GitHub Pages

**Option 1 - Deploy from a branch:** commit `_se/homework/03/Clinic_System/` to `main`, add an empty `.nojekyll` file at the **repository root** (Jekyll ignores folders starting with `_`), then **Settings -> Pages -> Source: Deploy from a branch -> `main` / `(root)`**.

**Option 2 - GitHub Actions (when the repository already uses a Pages workflow):** set **Settings -> Pages -> Source: GitHub Actions**. A repository can only have one Pages deployment, so do **not** add a second Pages workflow. Make sure your existing workflow uploads a path that contains `_se/homework/03/Clinic_System/` (for example `path: .` with `actions/upload-pages-artifact`, which does not run Jekyll, so `.nojekyll` is not needed). Each push to `main` redeploys the whole site, including this app.

After the deployment finishes (check the **Actions** tab) the site is live at:
   `https://<your-username>.github.io/<repo-name>/_se/homework/03/Clinic_System/index.html`
Then, in Supabase, open **Authentication -> URL Configuration**:
   - **Site URL:** `https://<your-username>.github.io/<repo-name>/_se/homework/03/Clinic_System/` (must point at the folder that contains `index.html`, not a parent folder, or confirmation links end in a 404).
   - **Redirect URLs:** add `https://<your-username>.github.io/<repo-name>/_se/homework/03/Clinic_System/**`.
   - If a confirmation link shows `otp_expired`, it was already used (often by an email scanner). Try signing in; if that fails, delete the user under **Authentication -> Users** and sign up again, or temporarily disable "Confirm email".

## 7. Testing & Verification Guide

Use two isolated sessions: a normal window for the Admin and an **Incognito/Private window** (or a second browser) for a Patient.

**Patient tests (Incognito window)**
1. Sign up with `patient1@example.com`. You are sent to **My Profile**; fill in every field and save.
2. **Book Appointment**: choose a department and today's date. Confirm that slots inside 12:00-13:30 and 17:00-18:00 do not exist, and that slots less than 1 hour from now are greyed out.
3. Book a future slot; it appears under **Upcoming**.
4. **Reschedule** it to another slot (the same 1-hour rule applies); it moves to the **Rescheduled** tab and shows a Rescheduled badge.
5. **Cancel** another booking: an empty reason is rejected; with a reason it moves to **No-Show / Cancelled**.
6. Try booking the same department/slot from a second patient account: the slot is disabled.

**Admin tests (normal window)**
1. Sign up / sign in as `vionylee07@gmail.com`: the header shows the **Admin** badge.
2. **Dashboard**: registered patients, today's appointments, and cancellation rate update.
3. **Master Schedule**: appointments are sorted newest first. Test search (name/email), date, department and status filters.
4. Mark an appointment **Completed** and another **No-Show**; cancel one with a reason.
5. **Patient Directory -> Details**: verify demographics, emergency contact and full appointment history.

**Realtime check:** keep both windows open, book/cancel as the patient, and watch the Admin schedule update with a toast without refreshing.

**Security check:** as a patient, open the browser console and try `select * from appointments` through the client. Only your own rows are returned. Calling an insert with a time inside a break window is rejected by the database trigger.

## 8. Behaviour Notes

- **Account name:** the sign-up form asks for a full name, stored in the Supabase account metadata and copied to `profiles.full_name` by the `handle_new_user` trigger. The name is shown in the header after login.
- **Form drafts:** the booking and profile forms are saved automatically in the browser (`localStorage`, per user), so switching tabs, minimising or reloading does not lose what was typed. Drafts are cleared after a successful submit.
- **Admin status editing:** in Master Schedule, **Change status** lets the Admin set any appointment to Scheduled, Rescheduled, Completed, Cancelled or No-Show (a reason is required for Cancelled).
- **Branding:** the clinic is called **Lele Clinic**. For confirmation emails, also update the sender name and templates in Supabase (Authentication -> Email Templates / SMTP Settings).

## 9. Limitations & Ideas

- Capacity is one appointment per department per slot; multi-doctor scheduling would need a `doctors` table.
- Email/SMS reminders could be added with Supabase Edge Functions.
- Admin identity is a single fixed email by design; a `roles` table would scale to multiple staff.

---

*Architected, designed, and generated with assistance from Claude (Anthropic). Made by Claude.*
