-- =====================================================================
-- Clinic System - Supabase migration (run once in SQL Editor)
-- Architected and generated with assistance from Claude (Anthropic)
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Helper: admin check (fixed admin email) ------------------
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'vionylee07@gmail.com';
$$;

-- ---------- Tables ----------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  email             text not null,
  full_name         text default '',
  national_id       text default '',
  date_of_birth     date,
  gender            text check (gender in ('Male','Female','Other')),
  phone             text default '',
  emergency_contact text default '',
  emergency_phone   text default '',
  medical_notes     text default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.appointments (
  id                  uuid primary key default gen_random_uuid(),
  patient_id          uuid not null references public.profiles(id) on delete cascade,
  appointment_date    date not null,
  appointment_time    time not null,
  department          text not null check (department in
                        ('General Medicine','Family Medicine','ENT','Pediatrics')),
  chief_complaint     text not null,
  notes               text default '',
  status              text not null default 'Scheduled' check (status in
                        ('Scheduled','Rescheduled','Completed','Cancelled','No-Show')),
  cancellation_reason text,
  cancelled_by        text check (cancelled_by in ('patient','admin')),
  reschedule_count    int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists appt_patient_idx on public.appointments(patient_id);
create index if not exists appt_date_idx    on public.appointments(appointment_date, appointment_time);

-- One active booking per department per slot (prevents double booking)
create unique index if not exists appt_unique_active_slot
  on public.appointments(appointment_date, appointment_time, department)
  where status in ('Scheduled','Rescheduled');

-- ---------- Triggers --------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_appts_touch on public.appointments;
create trigger trg_appts_touch before update on public.appointments
  for each row execute function public.touch_updated_at();

-- Auto-create a profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Back-fill profiles for users that already exist
insert into public.profiles(id, email, full_name)
select id, email, coalesce(raw_user_meta_data ->> 'full_name', '') from auth.users
on conflict (id) do nothing;

-- Fill in missing names from sign-up metadata for profiles created earlier
update public.profiles p
set full_name = u.raw_user_meta_data ->> 'full_name'
from auth.users u
where u.id = p.id and coalesce(p.full_name, '') = ''
  and coalesce(u.raw_user_meta_data ->> 'full_name', '') <> '';

-- Server-side business rules (hours, breaks, 30-min grid, 1-hour lead time)
create or replace function public.validate_appointment()
returns trigger language plpgsql as $$
declare
  mins int := extract(hour from new.appointment_time)::int * 60
            + extract(minute from new.appointment_time)::int;
  slot_ts timestamp := (new.appointment_date + new.appointment_time);
  now_tw  timestamp := (now() at time zone 'Asia/Taipei');
begin
  -- Only validate on insert or when the date/time actually changes
  if tg_op = 'UPDATE'
     and new.appointment_date = old.appointment_date
     and new.appointment_time = old.appointment_time then
    return new;
  end if;

  if mins % 30 <> 0 then
    raise exception 'Appointments must start on a 30-minute interval.';
  end if;
  if mins < 480 or mins > 1230 then
    raise exception 'Clinic hours are 08:00 to 21:00 (last slot 20:30).';
  end if;
  if mins >= 720 and mins < 810 then
    raise exception 'No appointments during the lunch break (12:00-13:30).';
  end if;
  if mins >= 1020 and mins < 1080 then
    raise exception 'No appointments during the dinner break (17:00-18:00).';
  end if;
  if not public.is_admin() and slot_ts < now_tw + interval '1 hour' then
    raise exception 'Bookings and changes must be made at least 1 hour before the slot.';
  end if;
  return new;
end $$;

drop trigger if exists trg_appts_validate on public.appointments;
create trigger trg_appts_validate before insert or update on public.appointments
  for each row execute function public.validate_appointment();

-- Lets patients see which slots are taken without exposing other patients' data
create or replace function public.get_taken_slots(p_date date, p_dept text)
returns table(appointment_time time) language sql security definer set search_path = public as $$
  select appointment_time from public.appointments
  where appointment_date = p_date and department = p_dept
    and status in ('Scheduled','Rescheduled');
$$;
grant execute on function public.get_taken_slots(date, text) to authenticated;

-- ---------- Row Level Security ---------------------------------------
alter table public.profiles     enable row level security;
alter table public.appointments enable row level security;

drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_insert" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_select" on public.profiles for select
  using (id = auth.uid() or public.is_admin());
create policy "profiles_insert" on public.profiles for insert
  with check (id = auth.uid());
create policy "profiles_update" on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists "appts_select" on public.appointments;
drop policy if exists "appts_insert" on public.appointments;
drop policy if exists "appts_update_patient" on public.appointments;
drop policy if exists "appts_update_admin" on public.appointments;
create policy "appts_select" on public.appointments for select
  using (patient_id = auth.uid() or public.is_admin());
create policy "appts_insert" on public.appointments for insert
  with check (patient_id = auth.uid() and status = 'Scheduled');
create policy "appts_update_patient" on public.appointments for update
  using (patient_id = auth.uid() and status in ('Scheduled','Rescheduled'))
  with check (patient_id = auth.uid() and status in ('Rescheduled','Cancelled'));
create policy "appts_update_admin" on public.appointments for update
  using (public.is_admin()) with check (public.is_admin());
-- No DELETE policies: records are retained for the audit trail.

-- ---------- Realtime --------------------------------------------------
alter table public.appointments replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.appointments;
exception when duplicate_object then null; end $$;
