-- Home studio classes: teacher-hosted listings, rates, capacity, enroll helpers

alter table public.classes
  add column if not exists description text,
  add column if not exists location_type text,
  add column if not exists location_note text,
  add column if not exists rate_amount numeric(10, 2),
  add column if not exists rate_currency text not null default 'INR',
  add column if not exists rate_unit text not null default 'hour',
  add column if not exists max_students integer,
  add column if not exists is_home_studio boolean not null default false;

alter table public.classes
  drop constraint if exists classes_location_type_check;
alter table public.classes
  add constraint classes_location_type_check
  check (
    location_type is null
    or location_type in ('home_studio', 'online', 'venue', 'at_org')
  );

alter table public.classes
  drop constraint if exists classes_rate_amount_check;
alter table public.classes
  add constraint classes_rate_amount_check
  check (rate_amount is null or rate_amount >= 0);

alter table public.classes
  drop constraint if exists classes_rate_unit_check;
alter table public.classes
  add constraint classes_rate_unit_check
  check (rate_unit in ('hour', 'session', 'course'));

alter table public.classes
  drop constraint if exists classes_max_students_check;
alter table public.classes
  add constraint classes_max_students_check
  check (max_students is null or max_students > 0);

alter table public.classes
  drop constraint if exists classes_home_studio_shape;
alter table public.classes
  add constraint classes_home_studio_shape
  check (
    not is_home_studio
    or (
      organization_id is null
      and teacher_id is not null
      and enrollment_mode = 'self_enroll'
    )
  );

create index if not exists classes_home_studio_open_idx
  on public.classes (is_home_studio, status)
  where is_home_studio = true and enrollment_mode = 'self_enroll';

-- Tighten insert: only approved teachers can create org-less home studios
drop policy if exists "Classes: org admin create" on public.classes;
create policy "Classes: create by org or home studio teacher"
  on public.classes for insert to authenticated
  with check (
    private.is_superadmin()
    or private.is_org_admin(organization_id)
    or (
      is_home_studio = true
      and organization_id is null
      and enrollment_mode = 'self_enroll'
      and teacher_id is not null
      and private.owns_teacher(teacher_id)
      and private.is_approved_onboarded_teacher(auth.uid())
    )
  );

create or replace function public.enroll_in_open_class(p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cls public.classes%rowtype;
  enrolled_count integer;
  org_ok boolean := false;
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

  if exists (
    select 1
    from public.class_enrollments e
    where e.class_id = p_class_id
      and e.student_profile_id = auth.uid()
  ) then
    return;
  end if;

  select count(*)::integer into enrolled_count
  from public.class_enrollments e
  where e.class_id = p_class_id;

  if cls.max_students is not null and enrolled_count >= cls.max_students then
    raise exception 'This class is full';
  end if;

  insert into public.class_enrollments (class_id, student_profile_id, source)
  values (p_class_id, auth.uid(), 'self');
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

  delete from public.class_enrollments e
  where e.class_id = p_class_id
    and e.student_profile_id = auth.uid();
end;
$$;

revoke all on function public.enroll_in_open_class(uuid) from public, anon;
grant execute on function public.enroll_in_open_class(uuid) to authenticated;

revoke all on function public.unenroll_from_open_class(uuid) from public, anon;
grant execute on function public.unenroll_from_open_class(uuid) to authenticated;

-- Demo home studio class for teacher1
do $$
declare
  t1 uuid;
  student uuid := 'dddddddd-dddd-dddd-dddd-ddddddddddd1';
begin
  select id into t1
  from public.teachers
  where profile_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';

  if t1 is null then
    return;
  end if;

  insert into public.classes (
    id,
    organization_id,
    teacher_id,
    title,
    skill,
    description,
    status,
    is_recurring,
    starts_at,
    ends_at,
    enrollment_mode,
    is_home_studio,
    location_type,
    location_note,
    rate_amount,
    rate_currency,
    rate_unit,
    max_students,
    created_by
  )
  values (
    'ffffffff-ffff-ffff-ffff-fffffffffff4',
    null,
    t1,
    'Carnatic Vocals at Home Studio',
    'Singing',
    'Weekly Carnatic vocal practice for beginners at the teacher''s home studio. Bring a notebook.',
    'scheduled',
    true,
    timestamptz '2026-07-16 10:00:00+05:30',
    timestamptz '2026-07-16 11:00:00+05:30',
    'self_enroll',
    true,
    'home_studio',
    'Indiranagar, Bengaluru — exact address shared after enrollment',
    800,
    'INR',
    'hour',
    6,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'
  )
  on conflict (id) do update set
    description = excluded.description,
    is_home_studio = true,
    location_type = excluded.location_type,
    location_note = excluded.location_note,
    rate_amount = excluded.rate_amount,
    rate_unit = excluded.rate_unit,
    max_students = excluded.max_students,
    status = 'scheduled';

  if not exists (
    select 1 from public.class_sessions
    where class_id = 'ffffffff-ffff-ffff-ffff-fffffffffff4'
  ) then
    insert into public.class_sessions (class_id, starts_at, ends_at, status, series_id)
    select
      'ffffffff-ffff-ffff-ffff-fffffffffff4',
      timestamptz '2026-07-16 10:00:00+05:30' + make_interval(weeks => g),
      timestamptz '2026-07-16 11:00:00+05:30' + make_interval(weeks => g),
      'scheduled',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4'
    from generate_series(0, 3) as g;
  end if;

  -- Set a sample rate on the academy marketplace class too
  update public.classes
  set
    rate_amount = coalesce(rate_amount, 600),
    rate_currency = 'INR',
    rate_unit = 'session',
    description = coalesce(
      description,
      'Open folk dance lab — join any time space allows.'
    ),
    location_type = coalesce(location_type, 'at_org'),
    max_students = coalesce(max_students, 12)
  where id = 'ffffffff-ffff-ffff-ffff-fffffffffff2';
end;
$$;
