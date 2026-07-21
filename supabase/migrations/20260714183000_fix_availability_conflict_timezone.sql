-- Use Asia/Kolkata for DOW/time overlap so IST sessions match weekly slots
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
    and c.proposed_day_of_week = p_day_of_week
    and c.proposed_start_time is not null
    and c.proposed_end_time is not null
    and c.proposed_start_time < p_end_time
    and c.proposed_end_time > p_start_time

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
