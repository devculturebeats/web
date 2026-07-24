-- Session cancel reasons, no-show outcomes, and teacher replacement support.

alter table public.class_sessions
  add column if not exists cancellation_reason text;

alter table public.class_sessions
  add column if not exists outcome text;

alter table public.class_sessions
  drop constraint if exists class_sessions_outcome_check;

alter table public.class_sessions
  add constraint class_sessions_outcome_check
  check (
    outcome is null
    or outcome in ('held', 'teacher_no_show', 'student_no_show')
  );

comment on column public.class_sessions.outcome is
  'Post-session outcome: held, teacher_no_show, or student_no_show.';

comment on column public.class_sessions.cancellation_reason is
  'Optional reason when the session is cancelled or marked a no-show.';

-- Scoped session cancel with optional reason
drop function if exists public.cancel_sessions_scoped(uuid, text);

create or replace function public.cancel_sessions_scoped(
  p_session_id uuid,
  p_scope text default 'one',
  p_reason text default null
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
  reason text := nullif(trim(coalesce(p_reason, '')), '');
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
    set
      status = 'cancelled',
      cancellation_reason = coalesce(reason, cancellation_reason),
      outcome = null
    where id = p_session_id
      and status in ('scheduled', 'postponed');
    get diagnostics affected = row_count;
  else
    update public.class_sessions
    set
      status = 'cancelled',
      cancellation_reason = coalesce(reason, cancellation_reason),
      outcome = null
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
    jsonb_build_object(
      'scope', p_scope,
      'affected', affected,
      'reason', reason
    )
  );

  return affected;
end;
$$;

revoke all on function public.cancel_sessions_scoped(uuid, text, text) from public, anon;
grant execute on function public.cancel_sessions_scoped(uuid, text, text) to authenticated;

-- Propagate class cancel reason onto open sessions
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
  reason text := nullif(trim(coalesce(p_reason, '')), '');
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
    cancellation_reason = reason,
    updated_at = now()
  where id = p_class_id
  returning * into cls;

  update public.class_sessions
  set
    status = 'cancelled',
    cancellation_reason = coalesce(reason, cancellation_reason),
    outcome = null
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
    jsonb_build_object('reason', reason, 'title', cls.title)
  );

  return cls;
end;
$$;

revoke all on function public.cancel_class(uuid, text) from public, anon;
grant execute on function public.cancel_class(uuid, text) to authenticated;

-- Mark held / no-show outcomes
create or replace function public.mark_session_outcome(
  p_session_id uuid,
  p_outcome text,
  p_reason text default null
)
returns public.class_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  sess public.class_sessions;
  cls public.classes;
  reason text := nullif(trim(coalesce(p_reason, '')), '');
  next_status public.class_lifecycle;
begin
  if p_outcome not in ('held', 'teacher_no_show', 'student_no_show') then
    raise exception 'Invalid outcome';
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

  if sess.status not in ('scheduled', 'postponed', 'completed', 'cancelled') then
    raise exception 'Session cannot be updated';
  end if;

  if p_outcome = 'held' then
    next_status := 'completed';
  elsif p_outcome = 'teacher_no_show' then
    next_status := 'cancelled';
  else
    next_status := 'completed';
  end if;

  update public.class_sessions
  set
    status = next_status,
    outcome = p_outcome,
    cancellation_reason = case
      when p_outcome = 'held' then null
      else coalesce(reason, cancellation_reason)
    end
  where id = p_session_id
  returning * into sess;

  perform private.write_audit(
    'session.outcome',
    'class_session',
    p_session_id,
    cls.organization_id,
    jsonb_build_object(
      'outcome', p_outcome,
      'reason', reason,
      'starts_at', sess.starts_at
    )
  );

  return sess;
end;
$$;

revoke all on function public.mark_session_outcome(uuid, text, text) from public, anon;
grant execute on function public.mark_session_outcome(uuid, text, text) to authenticated;

-- Immediate teacher swap (superadmin, or academy org admin for linked members)
create or replace function public.replace_class_teacher(
  p_class_id uuid,
  p_new_teacher_id uuid,
  p_reason text default null,
  p_require_consent boolean default true
)
returns public.classes
language plpgsql
security definer
set search_path = ''
as $$
declare
  cls public.classes;
  org public.organizations;
  reason text := nullif(trim(coalesce(p_reason, '')), '');
  old_teacher uuid;
  req_id uuid;
  msg text;
begin
  select * into cls from public.classes where id = p_class_id for update;
  if not found then
    raise exception 'Class not found';
  end if;

  select * into org from public.organizations where id = cls.organization_id;

  if not (
    private.is_superadmin()
    or private.is_org_admin(cls.organization_id)
  ) then
    raise exception 'Not allowed';
  end if;

  if cls.status in ('cancelled', 'rejected') then
    raise exception 'Class is closed';
  end if;

  if p_new_teacher_id is null then
    raise exception 'Teacher is required';
  end if;

  if cls.teacher_id is not distinct from p_new_teacher_id then
    raise exception 'Teacher is already assigned';
  end if;

  if not exists (select 1 from public.teachers where id = p_new_teacher_id) then
    raise exception 'Teacher not found';
  end if;

  -- Academies may only assign linked members unless superadmin forces.
  if org.type = 'academy' and not private.is_superadmin() then
    if not exists (
      select 1
      from public.teacher_links tl
      where tl.organization_id = org.id
        and tl.teacher_id = p_new_teacher_id
    ) then
      raise exception 'Teacher is not linked to this academy';
    end if;
  end if;

  -- Schools: only superadmin rematches.
  if org.type = 'school' and not private.is_superadmin() then
    raise exception 'School rematches require CultureBeats admin';
  end if;

  old_teacher := cls.teacher_id;
  msg := coalesce(
    reason,
    case
      when old_teacher is null then 'Teacher assignment request.'
      else 'Replacement teacher request.'
    end
  );

  if p_require_consent then
    if exists (
      select 1
      from public.class_requests
      where class_id = p_class_id
        and teacher_id = p_new_teacher_id
        and status = 'requested'
        and coalesce(request_kind, 'assign') = 'assign'
    ) then
      raise exception 'A request is already open for this teacher';
    end if;

    insert into public.class_requests (
      class_id,
      teacher_id,
      status,
      request_kind,
      message,
      proposed_day_of_week,
      proposed_start_time,
      proposed_end_time,
      proposed_slots,
      recurrence_mode,
      recurrence_until
    )
    values (
      p_class_id,
      p_new_teacher_id,
      'requested',
      'assign',
      msg,
      cls.proposed_day_of_week,
      cls.proposed_start_time,
      cls.proposed_end_time,
      cls.proposed_slots,
      cls.recurrence_mode,
      cls.recurrence_until
    )
    returning id into req_id;

    if auth.uid() is not null then
      insert into public.class_request_messages (request_id, author_id, body)
      values (req_id, auth.uid(), msg);
    end if;

    perform private.write_audit(
      'class.teacher_replace_request',
      'class',
      p_class_id,
      cls.organization_id,
      jsonb_build_object(
        'from_teacher_id', old_teacher,
        'to_teacher_id', p_new_teacher_id,
        'reason', reason,
        'request_id', req_id
      )
    );

    return cls;
  end if;

  -- Direct swap (no consent) — superadmin only.
  if not private.is_superadmin() then
    raise exception 'Direct replacement requires CultureBeats admin';
  end if;

  update public.classes
  set
    teacher_id = p_new_teacher_id,
    status = case
      when status = 'requested' then 'accepted'::public.class_lifecycle
      else status
    end,
    updated_at = now()
  where id = p_class_id
  returning * into cls;

  update public.class_requests
  set status = 'rejected', responded_at = coalesce(responded_at, now())
  where class_id = p_class_id
    and status = 'requested'
    and coalesce(request_kind, 'assign') = 'assign'
    and teacher_id is distinct from p_new_teacher_id;

  perform private.write_audit(
    'class.teacher_replace',
    'class',
    p_class_id,
    cls.organization_id,
    jsonb_build_object(
      'from_teacher_id', old_teacher,
      'to_teacher_id', p_new_teacher_id,
      'reason', reason,
      'direct', true
    )
  );

  return cls;
end;
$$;

revoke all on function public.replace_class_teacher(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.replace_class_teacher(uuid, uuid, text, boolean) to authenticated;

-- Audit teacher swaps that happen via request accept
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
  open_count integer;
  kind text;
  old_teacher uuid;
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
      select * into cls from public.classes where id = req.class_id for update;
      old_teacher := cls.teacher_id;

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
      where id = req.class_id
      returning * into cls;

      update public.class_requests
      set status = 'rejected', responded_at = now()
      where class_id = req.class_id
        and id <> req.id
        and status = 'requested'
        and coalesce(request_kind, 'assign') = 'assign';

      if old_teacher is distinct from req.teacher_id then
        perform private.write_audit(
          'class.teacher_replace',
          'class',
          req.class_id,
          cls.organization_id,
          jsonb_build_object(
            'from_teacher_id', old_teacher,
            'to_teacher_id', req.teacher_id,
            'request_id', req.id,
            'direct', false
          )
        );
      end if;

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
