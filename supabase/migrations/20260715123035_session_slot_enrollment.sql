-- Per-session enrollment for personal / open classes (slot picking)

create table public.class_session_enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  student_profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (session_id, student_profile_id)
);

create index class_session_enrollments_student_idx
  on public.class_session_enrollments (student_profile_id);

create index class_session_enrollments_class_idx
  on public.class_session_enrollments (class_id);

create index class_session_enrollments_session_idx
  on public.class_session_enrollments (session_id);

alter table public.class_session_enrollments enable row level security;

create policy class_session_enrollments_select
  on public.class_session_enrollments for select to authenticated
  using (
    student_profile_id = auth.uid()
    or private.is_superadmin()
    or exists (
      select 1
      from public.classes c
      where c.id = class_session_enrollments.class_id
        and (
          private.owns_teacher(c.teacher_id)
          or private.is_org_admin(c.organization_id)
        )
    )
  );

create policy class_session_enrollments_student_delete
  on public.class_session_enrollments for delete to authenticated
  using (student_profile_id = auth.uid());

-- Replace enroll: home studio requires selected session ids
drop function if exists public.enroll_in_open_class(uuid);

create or replace function public.enroll_in_open_class(
  p_class_id uuid,
  p_session_ids uuid[] default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cls public.classes%rowtype;
  enrolled_count integer;
  org_ok boolean := false;
  sess_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'student'
  ) then
    raise exception 'Only students can enroll';
  end if;

  select * into cls
  from public.classes
  where id = p_class_id
  for update;

  if not found then
    raise exception 'Class not found';
  end if;

  if cls.enrollment_mode <> 'self_enroll' then
    raise exception 'This class is not open for self-enrollment';
  end if;

  if cls.status in ('cancelled', 'completed', 'rejected', 'requested') then
    raise exception 'This class is not open for enrollment';
  end if;

  if cls.is_home_studio then
    org_ok := true;
  elsif cls.organization_id is not null then
    select exists (
      select 1
      from public.organizations o
      where o.id = cls.organization_id
        and o.approval_status = 'approved'
    ) into org_ok;
  end if;

  if not org_ok then
    raise exception 'This class is not available in the marketplace';
  end if;

  if cls.is_home_studio then
    if p_session_ids is null or coalesce(cardinality(p_session_ids), 0) = 0 then
      raise exception 'Choose at least one class slot to join';
    end if;

    select count(*)::integer into sess_count
    from public.class_sessions s
    where s.class_id = p_class_id
      and s.id = any (p_session_ids)
      and s.status in ('scheduled', 'postponed');

    if sess_count <> cardinality(p_session_ids) then
      raise exception 'One or more selected slots are invalid';
    end if;
  end if;

  if not exists (
    select 1
    from public.class_enrollments e
    where e.class_id = p_class_id
      and e.student_profile_id = auth.uid()
  ) then
    select count(*)::integer into enrolled_count
    from public.class_enrollments e
    where e.class_id = p_class_id;

    if cls.max_students is not null and enrolled_count >= cls.max_students then
      raise exception 'This class is full';
    end if;

    insert into public.class_enrollments (class_id, student_profile_id, source)
    values (p_class_id, auth.uid(), 'self');
  end if;

  if p_session_ids is not null and cardinality(p_session_ids) > 0 then
    insert into public.class_session_enrollments (
      class_id,
      session_id,
      student_profile_id
    )
    select
      p_class_id,
      s.id,
      auth.uid()
    from public.class_sessions s
    where s.class_id = p_class_id
      and s.id = any (p_session_ids)
      and s.status in ('scheduled', 'postponed')
    on conflict (session_id, student_profile_id) do nothing;
  end if;
end;
$$;

create or replace function public.unenroll_from_open_class(p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cls public.classes%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into cls from public.classes where id = p_class_id;
  if not found then
    raise exception 'Class not found';
  end if;

  if cls.enrollment_mode <> 'self_enroll' then
    raise exception 'Assigned classes cannot be left this way';
  end if;

  delete from public.class_session_enrollments e
  where e.class_id = p_class_id
    and e.student_profile_id = auth.uid();

  delete from public.class_enrollments e
  where e.class_id = p_class_id
    and e.student_profile_id = auth.uid();
end;
$$;

revoke all on function public.enroll_in_open_class(uuid, uuid[]) from public, anon;
grant execute on function public.enroll_in_open_class(uuid, uuid[]) to authenticated;

revoke all on function public.unenroll_from_open_class(uuid) from public, anon;
grant execute on function public.unenroll_from_open_class(uuid) to authenticated;
