-- Department-based required / elective courses
-- Run ONCE in Supabase Dashboard -> SQL Editor (safe to re-run).
--
-- 1) Course departments must use the same names as student profiles
--    (see DEPARTMENTS in src/lib/academic.ts). 'All Departments' = campus-wide.
-- 2) Required is relative: a Required course is Required for its own department and shown as an
--    Elective to everyone else. Any student can enroll in any course, so this script also
--    restores the plain enrollment trigger (re-run it even if you ran an earlier version).

update public.courses set department = case department
  when 'Department of Computer Science and Information Engineering' then 'Computer Science'
  when 'Department of Applied Mathematics'      then 'Applied Mathematics'
  when 'Department of Electrical Engineering'   then 'Electrical Engineering'
  when 'Department of Business Administration'  then 'Business Administration'
  when 'Department of Hospitality Management'   then 'Hospitality Management'
  when 'Center for General Education'           then 'All Departments'
  when 'Office of Physical Education'           then 'All Departments'
  when 'Career Development Center'              then 'All Departments'
  else department
end;

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

-- Check: every row should now show a student department or 'All Departments'.
-- select department, type, count(*) from public.courses group by 1, 2 order by 1, 2;
