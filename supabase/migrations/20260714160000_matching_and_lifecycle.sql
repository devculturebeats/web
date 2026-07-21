-- Matching helpers, org onboarding gate, and demo seed accounts

create or replace function public.org_admin_needs_onboarding()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('school_admin', 'academy_admin')
      and (
        p.onboarding_completed = false
        or not exists (
          select 1
          from public.organization_members m
          where m.profile_id = p.id
        )
      )
  );
$$;

revoke all on function public.org_admin_needs_onboarding() from public, anon;
grant execute on function public.org_admin_needs_onboarding() to authenticated;

-- Suggest teachers whose weekly availability covers a requested slot
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
  order by t.years_of_experience desc nulls last, p.full_name;
$$;

revoke all on function public.match_teachers_for_slot(text, smallint, time, time, text) from public, anon;
grant execute on function public.match_teachers_for_slot(text, smallint, time, time, text) to authenticated;

-- Accept/reject class request atomically
create or replace function public.respond_to_class_request(
  p_request_id uuid,
  p_accept boolean
)
returns public.class_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  req public.class_requests;
  cls public.classes;
begin
  select * into req
  from public.class_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request not found';
  end if;

  if not private.owns_teacher(req.teacher_id) and not private.is_superadmin() then
    raise exception 'Not allowed';
  end if;

  if req.status <> 'requested' then
    raise exception 'Request already responded';
  end if;

  if p_accept then
    update public.class_requests
    set status = 'accepted', responded_at = now()
    where id = req.id
    returning * into req;

    update public.classes
    set
      teacher_id = req.teacher_id,
      status = 'accepted',
      updated_at = now()
    where id = req.class_id
    returning * into cls;

    -- Reject sibling open requests for the same class
    update public.class_requests
    set status = 'rejected', responded_at = now()
    where class_id = req.class_id
      and id <> req.id
      and status = 'requested';
  else
    update public.class_requests
    set status = 'rejected', responded_at = now()
    where id = req.id
    returning * into req;
  end if;

  return req;
end;
$$;

revoke all on function public.respond_to_class_request(uuid, boolean) from public, anon;
grant execute on function public.respond_to_class_request(uuid, boolean) to authenticated;

-- Create one or more sessions for an accepted class
create or replace function public.create_class_sessions(
  p_class_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_recurring_weeks integer default 0
)
returns setof public.class_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  cls public.classes;
  i integer;
  s_at timestamptz;
  e_at timestamptz;
begin
  select * into cls from public.classes where id = p_class_id;
  if not found then
    raise exception 'Class not found';
  end if;

  if not (
    private.is_superadmin()
    or private.is_org_admin(cls.organization_id)
    or private.owns_teacher(cls.teacher_id)
  ) then
    raise exception 'Not allowed';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception 'Invalid session range';
  end if;

  for i in 0..greatest(coalesce(p_recurring_weeks, 0), 0) loop
    s_at := p_starts_at + make_interval(weeks => i);
    e_at := p_ends_at + make_interval(weeks => i);

    return query
    insert into public.class_sessions (class_id, starts_at, ends_at, status)
    values (p_class_id, s_at, e_at, 'scheduled')
    returning *;
  end loop;

  update public.classes
  set
    status = 'scheduled',
    is_recurring = coalesce(p_recurring_weeks, 0) > 0,
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    updated_at = now()
  where id = p_class_id;
end;
$$;

revoke all on function public.create_class_sessions(uuid, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.create_class_sessions(uuid, timestamptz, timestamptz, integer) to authenticated;

create or replace function public.update_session_status(
  p_session_id uuid,
  p_status public.class_lifecycle
)
returns public.class_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  sess public.class_sessions;
  cls public.classes;
begin
  if p_status not in ('scheduled', 'postponed', 'completed', 'cancelled') then
    raise exception 'Invalid session status';
  end if;

  select * into sess from public.class_sessions where id = p_session_id;
  if not found then
    raise exception 'Session not found';
  end if;

  select * into cls from public.classes where id = sess.class_id;

  if not (
    private.is_superadmin()
    or private.is_org_admin(cls.organization_id)
    or private.owns_teacher(cls.teacher_id)
  ) then
    raise exception 'Not allowed';
  end if;

  update public.class_sessions
  set status = p_status
  where id = p_session_id
  returning * into sess;

  return sess;
end;
$$;

revoke all on function public.update_session_status(uuid, public.class_lifecycle) from public, anon;
grant execute on function public.update_session_status(uuid, public.class_lifecycle) to authenticated;
