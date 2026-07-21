-- When a teacher accepts a school request, create calendar sessions from the
-- requested weekly slot(s) so schools are not asked to schedule again.

create or replace function private.next_weekly_occurrence(
  p_day_of_week smallint,
  p_start_time time,
  p_end_time time
)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
set search_path = ''
as $$
declare
  now_ist timestamp := timezone('Asia/Kolkata', now());
  days_until integer;
  target_date date;
begin
  days_until := (p_day_of_week - extract(dow from now_ist)::integer + 7) % 7;
  if days_until = 0 and now_ist::time >= p_start_time then
    days_until := 7;
  end if;

  target_date := now_ist::date + days_until;

  starts_at := (target_date + p_start_time) at time zone 'Asia/Kolkata';
  ends_at := (target_date + p_end_time) at time zone 'Asia/Kolkata';
  return next;
end;
$$;

create or replace function private.create_sessions_from_proposed_slots(
  p_class_id uuid
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
  slot_count integer := 0;
  existing_count integer;
begin
  select * into cls from public.classes where id = p_class_id;
  if not found then
    raise exception 'Class not found';
  end if;

  select count(*) into existing_count
  from public.class_sessions
  where class_id = p_class_id;

  if existing_count > 0 then
    return;
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

    select * into occ
    from private.next_weekly_occurrence(slot_day, slot_start, slot_end);

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
      gen_random_uuid()
    );

    if first_starts is null then
      first_starts := occ.starts_at;
      first_ends := occ.ends_at;
    end if;

    slot_count := slot_count + 1;
  end loop;

  if slot_count = 0 then
    return;
  end if;

  update public.classes
  set
    status = 'scheduled',
    is_recurring = slot_count > 1,
    starts_at = first_starts,
    ends_at = first_ends,
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
      'slot_count', slot_count,
      'starts_at', first_starts,
      'ends_at', first_ends
    )
  );
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
    where id = req.class_id;

    update public.class_requests
    set status = 'rejected', responded_at = now()
    where class_id = req.class_id
      and id <> req.id
      and status = 'requested';

    perform private.enroll_linked_students_for_class(req.class_id);
    perform private.create_sessions_from_proposed_slots(req.class_id);
  else
    update public.class_requests
    set status = 'rejected', responded_at = now()
    where id = req.id
    returning * into req;

    select count(*) into open_count
    from public.class_requests
    where class_id = req.class_id
      and status = 'requested';

    if open_count = 0 then
      update public.classes
      set status = 'rejected', updated_at = now()
      where id = req.class_id
        and status = 'requested';
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

  perform private.create_sessions_from_proposed_slots(p_class_id);
end;
$$;

revoke all on function public.create_sessions_from_proposed_slots(uuid) from public, anon;
grant execute on function public.create_sessions_from_proposed_slots(uuid) to authenticated;

-- Backfill: accepted classes that still have proposed timings but no sessions.
do $$
declare
  cls record;
begin
  for cls in
    select c.id
    from public.classes c
    where c.status = 'accepted'
      and not exists (
        select 1 from public.class_sessions s where s.class_id = c.id
      )
      and (
        (
          c.proposed_slots is not null
          and jsonb_typeof(c.proposed_slots) = 'array'
          and jsonb_array_length(c.proposed_slots) > 0
        )
        or (
          c.proposed_day_of_week is not null
          and c.proposed_start_time is not null
          and c.proposed_end_time is not null
        )
      )
  loop
    perform private.create_sessions_from_proposed_slots(cls.id);
  end loop;
end;
$$;
