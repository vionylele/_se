-- =============================================================================
-- NQU Academic Portal: Supabase schema, RLS, triggers, realtime, seed data
-- Run the WHOLE script once in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Admin helper
--    The admin is identified by a CONFIRMED auth email, read from auth.users
--    (not from a client-editable field). SECURITY DEFINER so RLS policies can call it.
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and lower(u.email) = 'vionylee07@gmail.com'
      and u.email_confirmed_at is not null
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Tables
-- -----------------------------------------------------------------------------

-- profiles: one row per auth user (created automatically by a trigger below)
create table if not exists public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  email                text not null,
  role                 text not null default 'STUDENT' check (role in ('ADMIN', 'STUDENT')),
  full_name            text not null default '',
  student_id           text unique,
  department           text,
  academic_year        text,
  year_level           int  check (year_level between 1 and 6),
  age                  int  check (age between 0 and 120),
  origin               text,
  nationality          text,
  address              text,
  photo_url            text,            -- resized JPEG data URL (or a Storage URL later)
  date_of_birth        date,
  emergency_contact    text,            -- contact person's name
  emergency_phone      text,
  is_profile_completed boolean not null default false,
  created_at           timestamptz not null default now()
);

-- courses: schedule is stored as jsonb "slots" (authoritative), e.g.
--   [{"day":"Mon","period":"2"},{"day":"Mon","period":"3"},{"day":"Wed","period":"1"}]
-- day_of_week / periods are human-readable summaries filled by a trigger.
create table if not exists public.courses (
  id             uuid primary key default gen_random_uuid(),
  course_code    text not null,
  title          text not null,
  description    text not null default 'No description provided.',
  instructor     text not null,
  college        text not null default '',
  department     text not null,
  type           text not null default 'Elective'
                 check (type in ('Required', 'Elective', 'General Education', 'Physical Education')),
  credits        int  not null check (credits between 1 and 6),
  classroom      text not null,
  capacity       int  not null check (capacity >= 1),
  enrolled_count int  not null default 0 check (enrolled_count >= 0),
  semester       text not null default '2026 Fall',
  slots          jsonb not null default '[]'::jsonb check (jsonb_typeof(slots) = 'array'),
  day_of_week    text,
  periods        text,
  created_at     timestamptz not null default now(),
  unique (semester, course_code)
);

create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) >= 3),
  content     text not null check (char_length(content) >= 10),
  category    text not null default 'General' check (category in ('Academic', 'General', 'Urgent')),
  pinned      boolean not null default false,
  author_name text not null default '',
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.enrollments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles (id) on delete cascade,
  course_id   uuid not null references public.courses (id) on delete cascade,
  semester    text not null default '',
  enrolled_at timestamptz not null default now(),
  unique (student_id, course_id)
);

create index if not exists enrollments_student_idx on public.enrollments (student_id);
create index if not exists enrollments_course_idx  on public.enrollments (course_id);
create index if not exists announcements_created_idx on public.announcements (created_at desc);

-- -----------------------------------------------------------------------------
-- 3. Triggers
-- -----------------------------------------------------------------------------

-- 3a. Create a profile whenever someone signs up. The reserved email becomes ADMIN.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, full_name, is_profile_completed)
  values (
    new.id,
    lower(new.email),
    case when lower(new.email) = 'vionylee07@gmail.com' then 'ADMIN' else 'STUDENT' end,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    lower(new.email) = 'vionylee07@gmail.com'   -- admins have no student profile form
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3b. Fill the human-readable schedule summary on courses
create or replace function public.courses_before_write()
returns trigger
language plpgsql
as $$
declare
  days    text;
  periods text;
begin
  select string_agg(d, ', ' order by o)
    into days
    from (select s ->> 'day' as d, min(ord) as o
            from jsonb_array_elements(new.slots) with ordinality as t(s, ord)
           group by s ->> 'day') x;

  select string_agg(d || ': ' || p, ' | ' order by o)
    into periods
    from (select s ->> 'day' as d,
                 string_agg(s ->> 'period', ',' order by ord) as p,
                 min(ord) as o
            from jsonb_array_elements(new.slots) with ordinality as t(s, ord)
           group by s ->> 'day') y;

  new.day_of_week := days;
  new.periods     := periods;
  new.course_code := upper(trim(new.course_code));

  -- enrolled_count is maintained ONLY by the enrollment triggers (trigger depth > 1)
  if pg_trigger_depth() = 1 then
    if tg_op = 'INSERT' then
      new.enrolled_count := 0;
    else
      new.enrolled_count := old.enrolled_count;
    end if;
  end if;

  if new.capacity < new.enrolled_count then
    raise exception 'VALIDATION|Capacity cannot be lower than the % student(s) already enrolled.', new.enrolled_count;
  end if;
  return new;
end;
$$;

drop trigger if exists courses_before_write on public.courses;
create trigger courses_before_write
  before insert or update on public.courses
  for each row execute function public.courses_before_write();

-- 3c. Server-side enrollment rules (the browser also checks, but this is the real gate).
--     Error text is "CODE|message" so the client can show a friendly message.
create or replace function public.enrollments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c            public.courses%rowtype;
  completed    boolean;
  cur_credits  int;
  clash        text;
begin
  select is_profile_completed into completed from public.profiles where id = new.student_id;
  if not coalesce(completed, false) then
    raise exception 'PROFILE_INCOMPLETE|Please complete your student profile before selecting courses.';
  end if;

  -- Lock the course row so two students cannot take the last seat at the same time
  select * into c from public.courses where id = new.course_id for update;
  if not found then
    raise exception 'COURSE_NOT_FOUND|This course is not available for the current semester.';
  end if;
  new.semester := c.semester;

  if c.enrolled_count >= c.capacity then
    raise exception 'COURSE_FULL|% has reached its capacity of % students.', c.course_code, c.capacity;
  end if;

  select coalesce(sum(co.credits), 0) into cur_credits
    from public.enrollments e join public.courses co on co.id = e.course_id
   where e.student_id = new.student_id and e.semester = c.semester;

  if cur_credits + c.credits > 25 then
    raise exception 'CREDIT_LIMIT|Cannot add % (% credits). You have % credits; adding it would exceed the 25-credit maximum.',
      c.course_code, c.credits, cur_credits;
  end if;

  select co.course_code into clash
    from public.enrollments e join public.courses co on co.id = e.course_id
   where e.student_id = new.student_id and e.semester = c.semester
     and exists (
       select 1
         from jsonb_array_elements(co.slots) as a(slot),
              jsonb_array_elements(c.slots)  as b(slot)
        where a.slot ->> 'day' = b.slot ->> 'day'
          and a.slot ->> 'period' = b.slot ->> 'period'
     )
   limit 1;

  if clash is not null then
    raise exception 'TIME_CONFLICT|% conflicts with % on your timetable.', c.course_code, clash;
  end if;

  return new;
end;
$$;

drop trigger if exists enrollments_before_insert on public.enrollments;
create trigger enrollments_before_insert
  before insert on public.enrollments
  for each row execute function public.enrollments_before_insert();

-- 3d. Keep courses.enrolled_count in sync (SECURITY DEFINER bypasses RLS on courses)
create or replace function public.enrollments_sync_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.courses set enrolled_count = enrolled_count + 1 where id = new.course_id;
  elsif tg_op = 'DELETE' then
    update public.courses set enrolled_count = greatest(enrolled_count - 1, 0) where id = old.course_id;
  end if;
  return null;
end;
$$;

drop trigger if exists enrollments_sync_count on public.enrollments;
create trigger enrollments_sync_count
  after insert or delete on public.enrollments
  for each row execute function public.enrollments_sync_count();

-- -----------------------------------------------------------------------------
-- 4. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.courses       enable row level security;
alter table public.announcements enable row level security;
alter table public.enrollments   enable row level security;

-- announcements: everyone reads, only the admin writes
drop policy if exists "announcements_read"  on public.announcements;
drop policy if exists "announcements_admin_insert" on public.announcements;
drop policy if exists "announcements_admin_update" on public.announcements;
drop policy if exists "announcements_admin_delete" on public.announcements;
create policy "announcements_read" on public.announcements
  for select to anon, authenticated using (true);
create policy "announcements_admin_insert" on public.announcements
  for insert to authenticated with check (public.is_admin());
create policy "announcements_admin_update" on public.announcements
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "announcements_admin_delete" on public.announcements
  for delete to authenticated using (public.is_admin());

-- courses: everyone reads, only the admin writes
drop policy if exists "courses_read"  on public.courses;
drop policy if exists "courses_admin_insert" on public.courses;
drop policy if exists "courses_admin_update" on public.courses;
drop policy if exists "courses_admin_delete" on public.courses;
create policy "courses_read" on public.courses
  for select to anon, authenticated using (true);
create policy "courses_admin_insert" on public.courses
  for insert to authenticated with check (public.is_admin());
create policy "courses_admin_update" on public.courses
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "courses_admin_delete" on public.courses
  for delete to authenticated using (public.is_admin());

-- profiles: a user reads/updates their own row; the admin can read every row
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Column-level lock: users may NOT change id / email / role / created_at
revoke update on public.profiles from authenticated, anon;
grant update (
  full_name, student_id, department, academic_year, year_level, age, origin, nationality,
  address, photo_url, date_of_birth, emergency_contact, emergency_phone, is_profile_completed
) on public.profiles to authenticated;

-- enrollments: students manage their own; the admin can read all
drop policy if exists "enrollments_select_own_or_admin" on public.enrollments;
drop policy if exists "enrollments_insert_own" on public.enrollments;
drop policy if exists "enrollments_delete_own_or_admin" on public.enrollments;
create policy "enrollments_select_own_or_admin" on public.enrollments
  for select to authenticated using (student_id = auth.uid() or public.is_admin());
create policy "enrollments_insert_own" on public.enrollments
  for insert to authenticated with check (student_id = auth.uid());
create policy "enrollments_delete_own_or_admin" on public.enrollments
  for delete to authenticated using (student_id = auth.uid() or public.is_admin());

-- -----------------------------------------------------------------------------
-- 5. Realtime (RLS is respected: clients only receive rows they are allowed to read)
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['announcements', 'courses', 'enrollments', 'profiles'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Seed data (only inserts when the tables are empty)
-- -----------------------------------------------------------------------------
insert into public.courses (course_code, title, description, instructor, college, department, type, credits, classroom, capacity, semester, slots)
select * from (values
 ('CSIE1101','Introduction to Computer Science','Foundations of computing: algorithms, number systems, basic programming in Python, and computational thinking.','Prof. Wei-Lin Chen','College of Engineering','Department of Computer Science and Information Engineering','Required',3,'Engineering Bldg E301',60,'2026 Fall','[{"day":"Mon","period":"2"},{"day":"Mon","period":"3"},{"day":"Mon","period":"4"}]'::jsonb),
 ('CSIE2203','Data Structures','Arrays, linked lists, stacks, queues, trees, graphs, hashing, and complexity analysis.','Prof. Hsiu-Ping Lin','College of Engineering','Department of Computer Science and Information Engineering','Required',3,'Engineering Bldg E305',50,'2026 Fall','[{"day":"Tue","period":"5"},{"day":"Tue","period":"6"},{"day":"Tue","period":"7"}]'::jsonb),
 ('CSIE2305','Database Systems','Relational model, SQL, normalization, transactions, and an introduction to NoSQL stores.','Prof. Jason Wu','College of Engineering','Department of Computer Science and Information Engineering','Required',3,'Engineering Bldg E302',50,'2026 Fall','[{"day":"Wed","period":"2"},{"day":"Wed","period":"3"},{"day":"Wed","period":"4"}]'::jsonb),
 ('CSIE3401','Web Application Development','Modern front-end and back-end web development: HTTP, REST APIs, React, and deployment.','Prof. Mei-Hua Tsai','College of Engineering','Department of Computer Science and Information Engineering','Elective',3,'Computer Lab C204',40,'2026 Fall','[{"day":"Thu","period":"5"},{"day":"Thu","period":"6"},{"day":"Thu","period":"7"}]'::jsonb),
 ('CSIE3502','Machine Learning Fundamentals','Supervised and unsupervised learning, model evaluation, and practical projects with Python.','Prof. Kevin Huang','College of Engineering','Department of Computer Science and Information Engineering','Elective',3,'Engineering Bldg E401',45,'2026 Fall','[{"day":"Fri","period":"2"},{"day":"Fri","period":"3"},{"day":"Fri","period":"4"}]'::jsonb),
 ('MATH1101','Calculus I','Limits, derivatives, integrals, and their applications in science and engineering.','Prof. Yu-Ting Liu','College of Engineering','Department of Applied Mathematics','Required',3,'Science Bldg S102',80,'2026 Fall','[{"day":"Mon","period":"3"},{"day":"Mon","period":"4"},{"day":"Wed","period":"1"}]'::jsonb),
 ('MATH2101','Linear Algebra','Vector spaces, matrices, determinants, eigenvalues, and linear transformations.','Prof. Chun-Yi Peng','College of Engineering','Department of Applied Mathematics','Required',3,'Science Bldg S104',60,'2026 Fall','[{"day":"Tue","period":"2"},{"day":"Tue","period":"3"},{"day":"Tue","period":"4"}]'::jsonb),
 ('EE2201','Digital Logic Design','Boolean algebra, combinational and sequential circuits, and hardware description basics.','Prof. Chia-Hao Lee','College of Engineering','Department of Electrical Engineering','Required',3,'Engineering Bldg E204',50,'2026 Fall','[{"day":"Wed","period":"5"},{"day":"Wed","period":"6"},{"day":"Wed","period":"7"}]'::jsonb),
 ('BA1101','Principles of Management','Core management functions: planning, organizing, leading, and controlling in modern organizations.','Prof. Shu-Fen Wang','College of Management','Department of Business Administration','Required',3,'Management Bldg M201',70,'2026 Fall','[{"day":"Mon","period":"6"},{"day":"Mon","period":"7"},{"day":"Mon","period":"8"}]'::jsonb),
 ('BA2301','Marketing Management','Market analysis, segmentation, branding, pricing, and digital marketing strategy.','Prof. Daniel Yeh','College of Management','Department of Business Administration','Required',3,'Management Bldg M305',60,'2026 Fall','[{"day":"Thu","period":"2"},{"day":"Thu","period":"3"},{"day":"Thu","period":"4"}]'::jsonb),
 ('HM1201','Introduction to Hospitality Management','Overview of the hotel, restaurant, and tourism industries and service-quality management.','Prof. Grace Lin','College of Hospitality and Tourism','Department of Hospitality Management','Elective',3,'Hospitality Bldg H102',45,'2026 Fall','[{"day":"Thu","period":"6"},{"day":"Thu","period":"7"},{"day":"Thu","period":"8"}]'::jsonb),
 ('ENG1101','English Composition and Reading','Academic reading strategies and paragraph-to-essay writing for university study.','Prof. Emily Carter','Center for General Education','Center for General Education','General Education',2,'Language Bldg L105',35,'2026 Fall','[{"day":"Fri","period":"6"},{"day":"Fri","period":"7"}]'::jsonb),
 ('GE1001','Taiwan Society and Culture','An interdisciplinary introduction to the history, society, and cultural landscape of Taiwan and Kinmen.','Prof. Ming-Chieh Hsu','Center for General Education','Center for General Education','General Education',2,'General Education Hall G201',90,'2026 Fall','[{"day":"Tue","period":"8"},{"day":"Tue","period":"9"}]'::jsonb),
 ('GE1105','Introduction to Philosophy','Key questions in ethics, knowledge, and reasoning, with an emphasis on critical thinking.','Prof. Anna Kuo','Center for General Education','Center for General Education','General Education',2,'General Education Hall G202',90,'2026 Fall','[{"day":"Wed","period":"8"},{"day":"Wed","period":"9"}]'::jsonb),
 ('PE1101','Physical Education I','Fitness fundamentals and a choice of team or individual sports modules.','Coach Brian Tsai','Center for General Education','Office of Physical Education','Physical Education',1,'Main Gymnasium',40,'2026 Fall','[{"day":"Fri","period":"8"}]'::jsonb),
 ('CDS1001','Career Planning Seminar','Noon-hour seminar series on career exploration, resume writing, and interview skills.','Dr. Jenny Hsieh','Office of Student Affairs','Career Development Center','Elective',1,'Student Center Auditorium',100,'2026 Fall','[{"day":"Wed","period":"Z"}]'::jsonb)
) as v(course_code, title, description, instructor, college, department, type, credits, classroom, capacity, semester, slots)
where not exists (select 1 from public.courses);

insert into public.announcements (title, content, category, pinned, author_name, created_at)
select * from (values
 ('Fall 2026 Course Selection Is Now Open','Online course selection for the Fall 2026 semester is open. Complete your student profile first, then browse the course catalogue and add courses to your timetable. The add/drop period ends at the close of Week 2.','Academic',true,'Office of Academic Affairs','2026-09-07T09:00:00+08:00'::timestamptz),
 ('Reminder: Maximum Credit Load Is 25 Credits','Students may register for a maximum of 25 credits per semester. The portal will block any selection that exceeds this limit or overlaps with a course already on your timetable.','Academic',true,'Office of Academic Affairs','2026-09-08T10:30:00+08:00'::timestamptz),
 ('Typhoon Warning Procedure: Class Suspension Notices','If a typhoon warning is issued for Kinmen, class suspension decisions will be posted on this board and on the university website by 06:00 on the affected day. Please check before leaving for campus. Make-up classes will be announced by each instructor.','Urgent',true,'Office of General Affairs','2026-10-02T08:00:00+08:00'::timestamptz),
 ('Mid-Term Examination Period','Mid-term examinations will be held during Weeks 9 and 10. Please check with each instructor for exam format and location, and bring your student ID card.','Academic',false,'Office of Academic Affairs','2026-09-29T09:15:00+08:00'::timestamptz),
 ('Campus Wi-Fi Maintenance This Weekend','The Computer and Network Center will upgrade campus Wi-Fi access points on Saturday from 22:00 to 02:00. Brief outages may occur in the library and dormitories.','General',false,'Computer and Network Center','2026-09-25T14:00:00+08:00'::timestamptz),
 ('Campus Cultural Festival and Club Fair','Join us on the main plaza for live performances, food stalls, and student club booths. All students and staff are welcome.','General',false,'Office of Student Affairs','2026-10-01T11:00:00+08:00'::timestamptz)
) as v(title, content, category, pinned, author_name, created_at)
where not exists (select 1 from public.announcements);
