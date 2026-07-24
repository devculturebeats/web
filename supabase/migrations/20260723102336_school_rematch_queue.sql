-- School rematch queue: schools flag, CultureBeats admin matches (same as first-time needs).

alter table public.classes
  add column if not exists needs_rematch boolean not null default false;

alter table public.classes
  add column if not exists rematch_reason text;

comment on column public.classes.needs_rematch is
  'School asked CultureBeats to rematch a teacher (same queue as new needs).';

create or replace function public.request_school_rematch(
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
  org public.organizations;
  reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into cls from public.classes where id = p_class_id for update;
  if not found then
    raise exception 'Class not found';
  end if;

  select * into org from public.organizations where id = cls.organization_id;
  if not found or org.type <> 'school' then
    raise exception 'Only school classes can request a rematch this way';
  end if;

  if not (
    private.is_superadmin()
    or private.is_org_admin(cls.organization_id)
  ) then
    raise exception 'Not allowed';
  end if;

  if cls.status in ('cancelled', 'rejected', 'requested') then
    raise exception 'This class cannot request a rematch';
  end if;

  update public.classes
  set
    needs_rematch = true,
    rematch_reason = reason,
    updated_at = now()
  where id = p_class_id
  returning * into cls;

  perform private.write_audit(
    'class.rematch_requested',
    'class',
    p_class_id,
    cls.organization_id,
    jsonb_build_object(
      'reason', reason,
      'title', cls.title,
      'from_teacher_id', cls.teacher_id
    )
  );

  return cls;
end;
$$;

revoke all on function public.request_school_rematch(uuid, text) from public, anon;
grant execute on function public.request_school_rematch(uuid, text) to authenticated;

-- Clear rematch flag when a replacement request is created or direct swap happens
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

  -- Schools: only CultureBeats admin rematches (same as first-time matching).
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

    update public.classes
    set
      needs_rematch = false,
      rematch_reason = null,
      updated_at = now()
    where id = p_class_id
    returning * into cls;

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

  if not private.is_superadmin() then
    raise exception 'Direct replacement requires CultureBeats admin';
  end if;

  update public.classes
  set
    teacher_id = p_new_teacher_id,
    needs_rematch = false,
    rematch_reason = null,
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
