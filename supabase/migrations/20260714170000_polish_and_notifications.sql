-- Must-fix polish: request slots, cancel class, reschedule, auto-enroll, notifications

-- ---------------------------------------------------------------------------
-- Proposed slot on class requests
-- ---------------------------------------------------------------------------
alter table public.class_requests
  add column if not exists proposed_day_of_week smallint
    check (proposed_day_of_week is null or proposed_day_of_week between 0 and 6),
  add column if not exists proposed_start_time time,
  add column if not exists proposed_end_time time;

alter table public.classes
  add column if not exists proposed_day_of_week smallint
    check (proposed_day_of_week is null or proposed_day_of_week between 0 and 6),
  add column if not exists proposed_start_time time,
  add column if not exists proposed_end_time time,
  add column if not exists cancellation_reason text;

-- ---------------------------------------------------------------------------
-- Auto-enroll linked students into assigned classes
-- ---------------------------------------------------------------------------
create or replace function private.enroll_linked_students_for_class(p_class_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cls public.classes;
  inserted integer := 0;
begin
  select * into cls from public.classes where id = p_class_id;
  if not found then
    return 0;
  end if;

  if cls.enrollment_mode <> 'assigned' or cls.organization_id is null then
    return 0;
  end if;

  if cls.status not in ('accepted', 'scheduled') then
    return 0;
  end if;

  with candidates as (
    select sl.student_profile_id
    from public.student_links sl
    where sl.organization_id = cls.organization_id
      and (
        cls.batch_id is null
        or sl.batch_id is null
        or sl.batch_id = cls.batch_id
      )
  ),
  ins as (
    insert into public.class_enrollments (class_id, student_profile_id, source)
    select p_class_id, c.student_profile_id, 'school'
    from candidates c
    on conflict (class_id, student_profile_id) do nothing
    returning 1
  )
  select count(*)::integer into inserted from ins;

  return coalesce(inserted, 0);
end;
$$;

create or replace function public.enroll_student_into_org_assigned_classes(
  p_student_id uuid,
  p_organization_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted integer := 0;
begin
  with candidates as (
    select c.id as class_id
    from public.classes c
    join public.student_links sl
      on sl.organization_id = c.organization_id
     and sl.student_profile_id = p_student_id
    where c.organization_id = p_organization_id
      and c.enrollment_mode = 'assigned'
      and c.status in ('accepted', 'scheduled')
      and (
        c.batch_id is null
        or sl.batch_id is null
        or sl.batch_id = c.batch_id
      )
  ),
  ins as (
    insert into public.class_enrollments (class_id, student_profile_id, source)
    select candidates.class_id, p_student_id, 'school'
    from candidates
    on conflict (class_id, student_profile_id) do nothing
    returning 1
  )
  select count(*)::integer into inserted from ins;

  return coalesce(inserted, 0);
end;
$$;

revoke all on function public.enroll_student_into_org_assigned_classes(uuid, uuid) from public, anon;
grant execute on function public.enroll_student_into_org_assigned_classes(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Improve respond_to_class_request: reject orphans + enroll on accept
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Cancel class + cancel open request from org
-- ---------------------------------------------------------------------------
create or replace function public.cancel_class(
  p_class_id uuid,
  p_reason text default null
)
returns public.classes
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

  update public.classes
  set
    status = 'cancelled',
    cancellation_reason = p_reason,
    updated_at = now()
  where id = p_class_id
  returning * into cls;

  update public.class_sessions
  set status = 'cancelled'
  where class_id = p_class_id
    and status in ('scheduled', 'postponed');

  update public.class_requests
  set status = 'rejected', responded_at = coalesce(responded_at, now())
  where class_id = p_class_id
    and status = 'requested';

  return cls;
end;
$$;

revoke all on function public.cancel_class(uuid, text) from public, anon;
grant execute on function public.cancel_class(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Reschedule a session to new start/end (sets status scheduled)
-- ---------------------------------------------------------------------------
create or replace function public.reschedule_session(
  p_session_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
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
  if p_ends_at <= p_starts_at then
    raise exception 'Invalid session range';
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
  set
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    status = 'scheduled'
  where id = p_session_id
  returning * into sess;

  return sess;
end;
$$;

revoke all on function public.reschedule_session(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.reschedule_session(uuid, timestamptz, timestamptz) to authenticated;

-- After create_class_sessions, auto-enroll linked students when class becomes scheduled
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

  perform private.enroll_linked_students_for_class(p_class_id);
end;
$$;

revoke all on function public.create_class_sessions(uuid, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.create_class_sessions(uuid, timestamptz, timestamptz, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  body text not null,
  audience text not null default 'all_enrolled'
    check (audience in ('all_enrolled', 'specific_classes')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.notification_classes (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  primary key (notification_id, class_id)
);

create table public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  student_profile_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (notification_id, student_profile_id)
);

create index notification_recipients_student_idx
  on public.notification_recipients (student_profile_id, read_at);

alter table public.notifications enable row level security;
alter table public.notification_classes enable row level security;
alter table public.notification_recipients enable row level security;

create policy "Notifications: org admin manage"
  on public.notifications for all to authenticated
  using (private.is_org_admin(organization_id) or private.is_superadmin())
  with check (private.is_org_admin(organization_id) or private.is_superadmin());

create policy "Notifications: recipients can read parent"
  on public.notifications for select to authenticated
  using (
    exists (
      select 1 from public.notification_recipients nr
      where nr.notification_id = notifications.id
        and nr.student_profile_id = auth.uid()
    )
    or private.is_org_admin(organization_id)
    or private.is_superadmin()
  );

create policy "Notification classes: org admin"
  on public.notification_classes for all to authenticated
  using (
    exists (
      select 1 from public.notifications n
      where n.id = notification_id
        and (private.is_org_admin(n.organization_id) or private.is_superadmin())
    )
  )
  with check (
    exists (
      select 1 from public.notifications n
      where n.id = notification_id
        and (private.is_org_admin(n.organization_id) or private.is_superadmin())
    )
  );

create policy "Notification recipients: student read own"
  on public.notification_recipients for select to authenticated
  using (
    student_profile_id = auth.uid()
    or private.is_superadmin()
    or exists (
      select 1 from public.notifications n
      where n.id = notification_id
        and private.is_org_admin(n.organization_id)
    )
  );

create policy "Notification recipients: student update own read"
  on public.notification_recipients for update to authenticated
  using (student_profile_id = auth.uid())
  with check (student_profile_id = auth.uid());

create policy "Notification recipients: org admin insert"
  on public.notification_recipients for insert to authenticated
  with check (
    exists (
      select 1 from public.notifications n
      where n.id = notification_id
        and (private.is_org_admin(n.organization_id) or private.is_superadmin())
    )
  );

-- Push notification to all enrolled students at org, or specific classes
create or replace function public.send_org_notification(
  p_organization_id uuid,
  p_title text,
  p_body text,
  p_class_ids uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  notif_id uuid;
  audience text;
  class_id uuid;
begin
  if not (private.is_org_admin(p_organization_id) or private.is_superadmin()) then
    raise exception 'Not allowed';
  end if;

  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_body), '') = '' then
    raise exception 'Title and body are required';
  end if;

  if not exists (
    select 1 from public.organizations o
    where o.id = p_organization_id
      and o.approval_status = 'approved'
  ) then
    raise exception 'Organization must be approved';
  end if;

  audience := case
    when p_class_ids is null or array_length(p_class_ids, 1) is null then 'all_enrolled'
    else 'specific_classes'
  end;

  insert into public.notifications (
    organization_id, title, body, audience, created_by
  ) values (
    p_organization_id, trim(p_title), trim(p_body), audience, auth.uid()
  )
  returning id into notif_id;

  if audience = 'specific_classes' then
    foreach class_id in array p_class_ids loop
      if not exists (
        select 1 from public.classes c
        where c.id = class_id
          and c.organization_id = p_organization_id
      ) then
        raise exception 'Invalid class for organization';
      end if;

      insert into public.notification_classes (notification_id, class_id)
      values (notif_id, class_id);
    end loop;

    insert into public.notification_recipients (notification_id, student_profile_id)
    select distinct notif_id, e.student_profile_id
    from public.class_enrollments e
    where e.class_id = any (p_class_ids)
    on conflict do nothing;
  else
    insert into public.notification_recipients (notification_id, student_profile_id)
    select distinct notif_id, e.student_profile_id
    from public.class_enrollments e
    join public.classes c on c.id = e.class_id
    where c.organization_id = p_organization_id
    on conflict do nothing;
  end if;

  return notif_id;
end;
$$;

revoke all on function public.send_org_notification(uuid, text, text, uuid[]) from public, anon;
grant execute on function public.send_org_notification(uuid, text, text, uuid[]) to authenticated;

create or replace function public.mark_notification_read(p_recipient_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_recipients
  set read_at = now()
  where id = p_recipient_id
    and student_profile_id = auth.uid()
    and read_at is null;
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
