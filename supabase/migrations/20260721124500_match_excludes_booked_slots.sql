-- Exclude teachers who already have an overlapping accepted/scheduled
-- class (proposed weekly slot or future session) from slot matching.

create or replace function public.find_availability_conflicts(
  p_teacher_id uuid,
  p_day_of_week smallint,
  p_start_time time,
  p_end_time time
)
returns table (
  class_id uuid,
  class_title text,
  class_status public.class_lifecycle,
  conflict_source text,
  session_id uuid,
  starts_at timestamptz,
  ends_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  -- Weekly proposed slots that still commit the teacher on this day/time.
  select
    c.id as class_id,
    c.title as class_title,
    c.status as class_status,
    'proposed_slot'::text as conflict_source,
    null::uuid as session_id,
    null::timestamptz as starts_at,
    null::timestamptz as ends_at
  from public.classes c
  where c.teacher_id = p_teacher_id
    and c.status in ('accepted', 'scheduled')
    and (
      coalesce(c.recurrence_mode, 'once'::public.recurrence_mode) = 'ongoing'
      or (
        coalesce(c.recurrence_mode, 'once'::public.recurrence_mode) = 'until_date'
        and (
          c.recurrence_until is null
          or c.recurrence_until >= (timezone('Asia/Kolkata', now()))::date
        )
      )
      or exists (
        select 1
        from public.class_sessions s
        where s.class_id = c.id
          and s.status in ('scheduled', 'postponed')
          and s.starts_at >= now()
      )
      or not exists (
        select 1
        from public.class_sessions s
        where s.class_id = c.id
          and s.status in ('scheduled', 'postponed')
      )
    )
    and (
      (
        c.proposed_slots is not null
        and jsonb_typeof(c.proposed_slots) = 'array'
        and exists (
          select 1
          from jsonb_array_elements(c.proposed_slots) as slot(value)
          where (slot.value ->> 'day')::smallint = p_day_of_week
            and (slot.value ->> 'start')::time < p_end_time
            and (slot.value ->> 'end')::time > p_start_time
        )
      )
      or (
        (
          c.proposed_slots is null
          or jsonb_typeof(c.proposed_slots) <> 'array'
          or jsonb_array_length(c.proposed_slots) = 0
        )
        and c.proposed_day_of_week = p_day_of_week
        and c.proposed_start_time is not null
        and c.proposed_end_time is not null
        and c.proposed_start_time < p_end_time
        and c.proposed_end_time > p_start_time
      )
    )

  union

  select
    c.id,
    c.title,
    c.status,
    'session'::text,
    s.id,
    s.starts_at,
    s.ends_at
  from public.class_sessions s
  join public.classes c on c.id = s.class_id
  where c.teacher_id = p_teacher_id
    and c.status in ('accepted', 'scheduled')
    and s.status in ('scheduled', 'postponed')
    and s.starts_at >= now()
    and extract(dow from timezone('Asia/Kolkata', s.starts_at))::smallint = p_day_of_week
    and (timezone('Asia/Kolkata', s.starts_at))::time < p_end_time
    and (timezone('Asia/Kolkata', s.ends_at))::time > p_start_time;
$$;

revoke all on function public.find_availability_conflicts(uuid, smallint, time, time) from public, anon;
grant execute on function public.find_availability_conflicts(uuid, smallint, time, time) to authenticated;

create or replace function public.match_teachers_for_slot(
  p_skill text,
  p_day_of_week smallint,
  p_start_time time,
  p_end_time time,
  p_city text default null
)
returns table (
  teacher_id uuid,
  profile_id uuid,
  full_name text,
  primary_skill text,
  city text,
  years_of_experience integer,
  slot_start time,
  slot_end time
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.id as teacher_id,
    t.profile_id,
    p.full_name,
    t.primary_skill,
    t.city,
    t.years_of_experience,
    a.start_time as slot_start,
    a.end_time as slot_end
  from public.teachers t
  join public.profiles p on p.id = t.profile_id
  join public.teacher_availability a on a.teacher_id = t.id
  where p.role = 'teacher'
    and p.approval_status = 'approved'
    and p.onboarding_completed = true
    and a.day_of_week = p_day_of_week
    and a.start_time <= p_start_time
    and a.end_time >= p_end_time
    and (
      p_skill is null
      or t.primary_skill ilike p_skill
      or p_skill = any (t.secondary_skills)
    )
    and (
      p_city is null
      or p_city = ''
      or t.city ilike p_city
    )
    and not exists (
      select 1
      from public.find_availability_conflicts(
        t.id,
        p_day_of_week,
        p_start_time,
        p_end_time
      )
    )
  order by t.years_of_experience desc nulls last, p.full_name;
$$;

revoke all on function public.match_teachers_for_slot(text, smallint, time, time, text) from public, anon;
grant execute on function public.match_teachers_for_slot(text, smallint, time, time, text) to authenticated;
