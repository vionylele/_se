# Supabase setup (one-time, ~10 minutes)

## 1. Run the database script
Supabase Dashboard -> **SQL Editor** -> New query -> paste all of `supabase/schema.sql` -> **Run**.
It creates the tables, Row Level Security policies, server-side enrollment rules, Realtime publication and seed data. It is safe to re-run.

## 2. Authentication settings (Dashboard -> Authentication)
- **Providers -> Email**: enabled.
- **Confirm email**: choose one.
  - **OFF** (easiest for a demo): sign-up logs the user straight in.
  - **ON** (recommended): users must click the emailed link first. The app shows a notice after sign-up.
- **URL Configuration -> Site URL**: your GitHub Pages URL, e.g. `https://<user>.github.io/<repo>/`.

## 3. Create the administrator account FIRST
Open the deployed site -> Register with `vionylee07@gmail.com`. The database trigger gives that email the `ADMIN` role, and the policies treat it as the only account allowed to write announcements and courses.
Do this before sharing the link: the admin email is public in the repo, so whoever registers it first owns it.

## 4. Environment variables
Local: `cp .env.example .env.local`, then set `VITE_SUPABASE_URL` (Dashboard -> Project Settings -> API).
GitHub Pages: repo -> Settings -> Secrets and variables -> Actions -> **Variables** -> add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Re-run the deploy workflow.
Only ever use the publishable/anon key in the browser. Never the `service_role` / secret key.

## 5. Verify
1. Admin tab: publish an announcement. 2. Student in another browser/incognito window: it appears on the Dashboard with no refresh.
3. Edit a course as admin: the student's catalogue updates live. 4. Student enrolls: the admin's seat counter (`n / capacity`) changes live.

## 6. Department-based required / elective courses
Each course has a **Department** (same names as the student profile list, or `All Departments` for campus-wide courses such as General Education / PE) and a **Category** (Required, Elective, General Education, Physical Education).
- A **Required** course is Required for students of its department. Students of other departments see the same course as an **Elective** and can still take it.
- Campus-wide (`All Departments`) courses look the same to everyone.

On an existing database run `supabase/migrations/20261015_department_required_electives.sql` once in the SQL Editor (before using the new site build). It renames the old seed departments and adds the server-side check.
