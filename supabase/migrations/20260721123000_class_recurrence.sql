-- Weekly recurrence for school/academy class requests:
-- once | until_date | ongoing (+ optional until date).
-- Schedule-change requests after a teacher has already accepted.

do $$ begin
  create type public.recurrence_mode as enum ('once', 'until_date', 'ongoing');
exception
  when duplicate_object then null;
end $$;

alter table public.classes
  add column if not exists recurrence_mode public.recurrence_mode not null default 'once';

alter table public.classes
  add column if not exists recurrence_until date;

alter table public.class_requests
  add column if not exists recurrence_mode public.recurrence_mode not null default 'once';

alter table public.class_requests
  add column if not exists recurrence_until date;

alter table public.class_requests
  add column if not exists request_kind text not null default 'assign';

alter table public.class_requests
  drop constraint if exists class_requests_request_kind_check;

alter table public.class_requests
  add constraint class_requests_request_kind_check
  check (request_kind in ('assign', 'schedule'));

comment on column public.classes.recurrence_mode is
  'once = next occurrence only; until_date = weekly through recurrence_until; ongoing = weekly rolling horizon';
comment on column public.class_requests.request_kind is
  'assign = new teacher assignment; schedule = change days/times/recurrence on an existing accepted class';

-- Occurrences for one weekly slot across the requested horizon.
create or replace function private.weekly_occurrences(
  p_day_of_week smallint,
  p_start_time time,
  p_end_time time,
  p_mode public.recurrence_mode,
  p_until date
)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
set search_path = ''
as $$
declare
  first_occ record;
  cursor_start timestamptz;
  cursor_end timestamptz;
  horizon date;
  occ_date date;
  weeks integer := 0;
  max_weeks integer := 52;
begin
  select * into first_occ
  from private.next_weekly_occurrence(p_day_of_week, p_start_time, p_end_time);

  if p_mode = 'once' then
    starts_at := first_occ.starts_at;
    ends_at := first_occ.ends_at;
    return next;
    return;
  end if;

  if p_mode = 'until_date' then
    if p_until is null then
      starts_at := first_occ.starts_at;
      ends_at := first_occ.ends_at;
      return next;
      return;
    end if;
    horizon := p_until;
  else
    -- ongoing: materialize ~16 weeks ahead
    horizon := (timezone('Asia/Kolkata', now()))::date + (16 * 7);
  end if;

  cursor_start := first_occ.starts_at;
  cursor_end := first_occ.ends_at;

  while weeks < max_weeks loop
    occ_date := (timezone('Asia/Kolkata', cursor_start))::date;
    exit when occ_date > horizon;

    starts_at := cursor_start;
    ends_at := cursor_end;
    return next;

    weeks := weeks + 1;
    cursor_start := cursor_start + interval '7 days';
    cursor_end := cursor_end + interval '7 days';
  end loop;
end;
$$;

create or replace function private.materialize_proposed_sessions(
  p_class_id uuid,
  p_replace_future boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cls public.classes;
  slots jsonb := '[]'::jsonb;
  slot jsonb;
  slot_day smallint;
  slot_start time;
  slot_end time;
  occ record;
  first_starts timestamptz;
  first_ends timestamptz;
  session_count integer := 0;
  existing_future integer;
  series uuid;
  mode public.recurrence_mode;
begin
  select * into cls from public.classes where id = p_class_id;
  if not found then
    raise exception 'Class not found';
  end if;

  mode := coalesce(cls.recurrence_mode, 'once'::public.recurrence_mode);

  if p_replace_future then
    update public.class_sessions
    set status = 'cancelled'
    where class_id = p_class_id
      and status in ('scheduled', 'postponed')
      and starts_at > now();
  else
    select count(*) into existing_future
    from public.class_sessions
    where class_id = p_class_id
      and status in ('scheduled', 'postponed');

    if existing_future > 0 then
      return;
    end if;
  end if;

  if cls.proposed_slots is not null
     and jsonb_typeof(cls.proposed_slots) = 'array'
     and jsonb_array_length(cls.proposed_slots) > 0 then
    slots := cls.proposed_slots;
  elsif cls.proposed_day_of_week is not null
     and cls.proposed_start_time is not null
     and cls.proposed_end_time is not null then
    slots := jsonb_build_array(
      jsonb_build_object(
        'day', cls.proposed_day_of_week,
        'start', cls.proposed_start_time::text,
        'end', cls.proposed_end_time::text
      )
    );
  end if;

  if jsonb_array_length(slots) = 0 then
    return;
  end if;

  for slot in
    select value from jsonb_array_elements(slots)
  loop
    begin
      slot_day := (slot ->> 'day')::smallint;
      slot_start := (slot ->> 'start')::time;
      slot_end := (slot ->> 'end')::time;
    exception
      when others then
        continue;
    end;

    if slot_day is null or slot_start is null or slot_end is null then
      continue;
    end if;
    if slot_end <= slot_start then
      continue;
    end if;

    series := gen_random_uuid();

    for occ in
      select *
      from private.weekly_occurrences(
        slot_day,
        slot_start,
        slot_end,
        mode,
        cls.recurrence_until
      )
    loop
      -- Skip if an active session already exists at this start.
      if exists (
        select 1
        from public.class_sessions s
        where s.class_id = p_class_id
          and s.starts_at = occ.starts_at
          and s.status in ('scheduled', 'postponed')
      ) then
        continue;
      end if;

      insert into public.class_sessions (
        class_id,
        starts_at,
        ends_at,
        status,
        series_id
      )
      values (
        p_class_id,
        occ.starts_at,
        occ.ends_at,
        'scheduled',
        series
      );

      if first_starts is null then
        first_starts := occ.starts_at;
        first_ends := occ.ends_at;
      end if;

      session_count := session_count + 1;
    end loop;
  end loop;

  if session_count = 0 and not p_replace_future then
    return;
  end if;

  update public.classes
  set
    status = 'scheduled',
    is_recurring = mode <> 'once' or jsonb_array_length(slots) > 1,
    starts_at = coalesce(first_starts, starts_at),
    ends_at = coalesce(first_ends, ends_at),
    updated_at = now()
  where id = p_class_id;

  perform private.enroll_linked_students_for_class(p_class_id);

  perform private.write_audit(
    'class.sessions_created',
    'class',
    p_class_id,
    cls.organization_id,
    jsonb_build_object(
      'source', 'proposed_slots',
      'session_count', session_count,
      'recurrence_mode', mode,
      'recurrence_until', cls.recurrence_until,
      'replace_future', p_replace_future
    )
  );
end;
$$;

-- Keep old helper name as a thin wrapper for callers/backfill.
create or replace function private.create_sessions_from_proposed_slots(
  p_class_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.materialize_proposed_sessions(p_class_id, false);
end;
$$;

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
  open_count integer;
  kind text;
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

  kind := coalesce(req.request_kind, 'assign');

  if p_accept then
    update public.class_requests
    set status = 'accepted', responded_at = now()
    where id = req.id
    returning * into req;

    if kind = 'schedule' then
      update public.classes
      set
        proposed_day_of_week = req.proposed_day_of_week,
        proposed_start_time = req.proposed_start_time,
        proposed_end_time = req.proposed_end_time,
        proposed_slots = req.proposed_slots,
        recurrence_mode = coalesce(req.recurrence_mode, 'once'::public.recurrence_mode),
        recurrence_until = req.recurrence_until,
        is_recurring = coalesce(req.recurrence_mode, 'once'::public.recurrence_mode) <> 'once'
          or (
            req.proposed_slots is not null
            and jsonb_typeof(req.proposed_slots) = 'array'
            and jsonb_array_length(req.proposed_slots) > 1
          ),
        updated_at = now()
      where id = req.class_id;

      perform private.materialize_proposed_sessions(req.class_id, true);
    else
      update public.classes
      set
        teacher_id = req.teacher_id,
        status = 'accepted',
        recurrence_mode = coalesce(req.recurrence_mode, recurrence_mode),
        recurrence_until = coalesce(req.recurrence_until, recurrence_until),
        proposed_day_of_week = coalesce(req.proposed_day_of_week, proposed_day_of_week),
        proposed_start_time = coalesce(req.proposed_start_time, proposed_start_time),
        proposed_end_time = coalesce(req.proposed_end_time, proposed_end_time),
        proposed_slots = coalesce(req.proposed_slots, proposed_slots),
        updated_at = now()
      where id = req.class_id;

      update public.class_requests
      set status = 'rejected', responded_at = now()
      where class_id = req.class_id
        and id <> req.id
        and status = 'requested'
        and coalesce(request_kind, 'assign') = 'assign';

      perform private.enroll_linked_students_for_class(req.class_id);
      perform private.materialize_proposed_sessions(req.class_id, false);
    end if;
  else
    update public.class_requests
    set status = 'rejected', responded_at = now()
    where id = req.id
    returning * into req;

    if kind = 'assign' then
      select count(*) into open_count
      from public.class_requests
      where class_id = req.class_id
        and status = 'requested'
        and coalesce(request_kind, 'assign') = 'assign';

      if open_count = 0 then
        update public.classes
        set status = 'rejected', updated_at = now()
        where id = req.class_id
          and status = 'requested';
      end if;
    end if;
  end if;

  return req;
end;
$$;

revoke all on function public.respond_to_class_request(uuid, boolean) from public, anon;
grant execute on function public.respond_to_class_request(uuid, boolean) to authenticated;

create or replace function public.create_sessions_from_proposed_slots(
  p_class_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cls public.classes;
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

  perform private.materialize_proposed_sessions(p_class_id, false);
end;
$$;

revoke all on function public.create_sessions_from_proposed_slots(uuid) from public, anon;
grant execute on function public.create_sessions_from_proposed_slots(uuid) to authenticated;
