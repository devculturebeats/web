-- Conflict checks, class notes, session series, audit log

alter table public.class_sessions
  add column if not exists series_id uuid,
  add column if not exists session_note text;

create index if not exists class_sessions_series_idx
  on public.class_sessions (series_id)
  where series_id is not null;

update public.class_sessions cs
set series_id = cs.class_id
where series_id is null
  and exists (
    select 1 from public.classes c
    where c.id = cs.class_id and c.is_recurring = true
  );

update public.class_sessions
set series_id = id
where series_id is null;

create table if not exists public.class_notes (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists class_notes_class_idx on public.class_notes (class_id, created_at desc);

drop trigger if exists class_notes_set_updated_at on public.class_notes;
create trigger class_notes_set_updated_at
  before update on public.class_notes
  for each row execute function public.set_updated_at();

alter table public.class_notes enable row level security;

drop policy if exists "Class notes: related parties read" on public.class_notes;
create policy "Class notes: related parties read"
  on public.class_notes for select to authenticated
  using (
    private.is_superadmin()
    or exists (
      select 1 from public.classes c
      where c.id = class_notes.class_id
        and (
          private.is_org_admin(c.organization_id)
          or private.owns_teacher(c.teacher_id)
          or exists (
            select 1 from public.class_enrollments e
            where e.class_id = c.id and e.student_profile_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "Class notes: teacher or org write" on public.class_notes;
create policy "Class notes: teacher or org write"
  on public.class_notes for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.classes c
      where c.id = class_id
        and (
          private.is_org_admin(c.organization_id)
          or private.owns_teacher(c.teacher_id)
          or private.is_superadmin()
        )
    )
  );

drop policy if exists "Class notes: author update/delete" on public.class_notes;
create policy "Class notes: author update/delete"
  on public.class_notes for update to authenticated
  using (author_id = auth.uid() or private.is_superadmin())
  with check (author_id = auth.uid() or private.is_superadmin());

drop policy if exists "Class notes: author delete" on public.class_notes;
create policy "Class notes: author delete"
  on public.class_notes for delete to authenticated
  using (author_id = auth.uid() or private.is_superadmin());

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  organization_id uuid references public.organizations (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_org_idx on public.audit_logs (organization_id, created_at desc);
create index if not exists audit_logs_action_idx on public.audit_logs (action);

alter table public.audit_logs enable row level security;

create or replace function private.write_audit(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_organization_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, organization_id, metadata
  ) values (
    auth.uid(), p_action, p_entity_type, p_entity_id, p_organization_id, coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

drop policy if exists "Audit: superadmin read all" on public.audit_logs;
create policy "Audit: superadmin read all"
  on public.audit_logs for select to authenticated
  using (private.is_superadmin());

drop policy if exists "Audit: org admin read own org" on public.audit_logs;
create policy "Audit: org admin read own org"
  on public.audit_logs for select to authenticated
  using (
    organization_id is not null
    and private.is_org_admin(organization_id)
  );

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
    and extract(dow from timezone('UTC', s.starts_at))::smallint = p_day_of_week
    and (timezone('UTC', s.starts_at))::time < p_end_time
    and (timezone('UTC', s.ends_at))::time > p_start_time;
$$;

revoke all on function public.find_availability_conflicts(uuid, smallint, time, time) from public, anon;
grant execute on function public.find_availability_conflicts(uuid, smallint, time, time) to authenticated;

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
  v_series uuid := gen_random_uuid();
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
    insert into public.class_sessions (class_id, starts_at, ends_at, status, series_id)
    values (p_class_id, s_at, e_at, 'scheduled', v_series)
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

  perform private.write_audit(
    'class.sessions_created',
    'class',
    p_class_id,
    cls.organization_id,
    jsonb_build_object(
      'recurring_weeks', coalesce(p_recurring_weeks, 0),
      'series_id', v_series,
      'starts_at', p_starts_at,
      'ends_at', p_ends_at
    )
  );
end;
$$;

revoke all on function public.create_class_sessions(uuid, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.create_class_sessions(uuid, timestamptz, timestamptz, integer) to authenticated;

drop function if exists public.reschedule_session(uuid, timestamptz, timestamptz, text);
drop function if exists public.reschedule_session(uuid, timestamptz, timestamptz);

create or replace function public.reschedule_session(
  p_session_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_scope text default 'one'
)
returns setof public.class_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  sess public.class_sessions;
  cls public.classes;
  delta interval;
  duration interval;
begin
  if p_scope not in ('one', 'series') then
    raise exception 'Invalid scope';
  end if;

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

  duration := p_ends_at - p_starts_at;
  delta := p_starts_at - sess.starts_at;

  if p_scope = 'one' or sess.series_id is null then
    return query
    update public.class_sessions
    set
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      status = 'scheduled'
    where id = p_session_id
    returning *;

    perform private.write_audit(
      'session.reschedule',
      'class_session',
      p_session_id,
      cls.organization_id,
      jsonb_build_object('scope', 'one', 'starts_at', p_starts_at, 'ends_at', p_ends_at)
    );
  else
    return query
    update public.class_sessions s
    set
      starts_at = s.starts_at + delta,
      ends_at = (s.starts_at + delta) + duration,
      status = 'scheduled'
    where s.series_id = sess.series_id
      and s.status in ('scheduled', 'postponed')
      and s.starts_at >= sess.starts_at
    returning *;

    perform private.write_audit(
      'session.reschedule',
      'class_session',
      p_session_id,
      cls.organization_id,
      jsonb_build_object('scope', 'series', 'series_id', sess.series_id)
    );
  end if;
end;
$$;

revoke all on function public.reschedule_session(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.reschedule_session(uuid, timestamptz, timestamptz, text) to authenticated;

create or replace function public.cancel_sessions_scoped(
  p_session_id uuid,
  p_scope text default 'one'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  sess public.class_sessions;
  cls public.classes;
  affected integer := 0;
begin
  if p_scope not in ('one', 'series') then
    raise exception 'Invalid scope';
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

  if p_scope = 'one' or sess.series_id is null then
    update public.class_sessions
    set status = 'cancelled'
    where id = p_session_id
      and status in ('scheduled', 'postponed');
    get diagnostics affected = row_count;
  else
    update public.class_sessions
    set status = 'cancelled'
    where series_id = sess.series_id
      and status in ('scheduled', 'postponed')
      and starts_at >= sess.starts_at;
    get diagnostics affected = row_count;
  end if;

  perform private.write_audit(
    'session.cancel',
    'class_session',
    p_session_id,
    cls.organization_id,
    jsonb_build_object('scope', p_scope, 'affected', affected)
  );

  return affected;
end;
$$;

revoke all on function public.cancel_sessions_scoped(uuid, text) from public, anon;
grant execute on function public.cancel_sessions_scoped(uuid, text) to authenticated;

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

  perform private.write_audit(
    'class.cancel',
    'class',
    p_class_id,
    cls.organization_id,
    jsonb_build_object('reason', p_reason, 'title', cls.title)
  );

  return cls;
end;
$$;

revoke all on function public.cancel_class(uuid, text) from public, anon;
grant execute on function public.cancel_class(uuid, text) to authenticated;

create or replace function public.audit_enrollment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid;
begin
  select organization_id into org_id from public.classes where id = new.class_id;

  perform private.write_audit(
    'enrollment.create',
    'class_enrollment',
    new.id,
    org_id,
    jsonb_build_object(
      'class_id', new.class_id,
      'student_profile_id', new.student_profile_id,
      'source', new.source
    )
  );
  return new;
end;
$$;

drop trigger if exists audit_enrollment_insert on public.class_enrollments;
create trigger audit_enrollment_insert
  after insert on public.class_enrollments
  for each row execute function public.audit_enrollment_change();

create or replace function public.audit_profile_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.approval_status is distinct from old.approval_status then
    perform private.write_audit(
      'approval.profile',
      'profile',
      new.id,
      null,
      jsonb_build_object(
        'role', new.role,
        'from', old.approval_status,
        'to', new.approval_status,
        'email', new.email,
        'full_name', new.full_name
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists audit_profile_approval on public.profiles;
create trigger audit_profile_approval
  after update on public.profiles
  for each row execute function public.audit_profile_approval();

create or replace function public.audit_org_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.approval_status is distinct from old.approval_status then
    perform private.write_audit(
      'approval.organization',
      'organization',
      new.id,
      new.id,
      jsonb_build_object(
        'name', new.name,
        'type', new.type,
        'from', old.approval_status,
        'to', new.approval_status
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists audit_org_approval on public.organizations;
create trigger audit_org_approval
  after update on public.organizations
  for each row execute function public.audit_org_approval();

revoke all on function public.audit_enrollment_change() from public, anon, authenticated;
revoke all on function public.audit_profile_approval() from public, anon, authenticated;
revoke all on function public.audit_org_approval() from public, anon, authenticated;
