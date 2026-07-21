-- School/academy roster: provision students without email invites,
-- optional username login (synthetic email under the hood).

create extension if not exists pgcrypto with schema extensions;

alter table public.profiles
  add column if not exists username text,
  add column if not exists is_provisioned boolean not null default false;

create unique index if not exists profiles_username_lower_uidx
  on public.profiles (lower(username))
  where username is not null;

comment on column public.profiles.username is
  'Optional login username (no domain). Auth still uses email under the hood.';
comment on column public.profiles.is_provisioned is
  'True when created by a school/academy roster import or provisioning.';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_synthetic_student_email(p_email text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_email, '') ~* '@students\.culturebeats\.app$';
$$;

revoke all on function public.is_synthetic_student_email(text) from public;
grant execute on function public.is_synthetic_student_email(text) to authenticated, anon;

create or replace function private.slug_username_part(p_text text, p_max int default 16)
returns text
language plpgsql
immutable
as $$
declare
  cleaned text;
begin
  cleaned := lower(trim(coalesce(p_text, '')));
  cleaned := regexp_replace(cleaned, '[^a-z0-9]+', '', 'g');
  if cleaned = '' then
    cleaned := 'student';
  end if;
  return left(cleaned, greatest(p_max, 1));
end;
$$;

revoke all on function private.slug_username_part(text, int) from public;

create or replace function private.create_auth_student(
  p_email text,
  p_full_name text,
  p_password text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  u_id uuid := gen_random_uuid();
  inst uuid;
  pwd text;
begin
  select id into inst from auth.instances limit 1;
  if inst is null then
    inst := '00000000-0000-0000-0000-000000000000';
  end if;

  pwd := extensions.crypt(p_password, extensions.gen_salt('bf'));

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) values (
    inst, u_id, 'authenticated', 'authenticated', lower(trim(p_email)), pwd,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'role', 'student',
      'full_name', coalesce(nullif(trim(p_full_name), ''), 'Student')
    ),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    u_id,
    jsonb_build_object('sub', u_id::text, 'email', lower(trim(p_email))),
    'email',
    u_id::text,
    now(), now(), now()
  );

  update public.profiles
  set
    role = 'student',
    approval_status = 'approved',
    onboarding_completed = true,
    full_name = coalesce(nullif(trim(p_full_name), ''), full_name, 'Student'),
    email = lower(trim(p_email)),
    is_provisioned = true
  where id = u_id;

  return u_id;
end;
$$;

revoke all on function private.create_auth_student(text, text, text) from public;

create or replace function private.ensure_batch(
  p_org_id uuid,
  p_batch_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  bid uuid;
  cleaned text := trim(coalesce(p_batch_name, ''));
begin
  if cleaned = '' then
    return null;
  end if;

  select b.id into bid
  from public.batches b
  where b.organization_id = p_org_id
    and lower(b.name) = lower(cleaned)
  limit 1;

  if bid is not null then
    return bid;
  end if;

  insert into public.batches (organization_id, name)
  values (p_org_id, cleaned)
  returning id into bid;

  return bid;
end;
$$;

revoke all on function private.ensure_batch(uuid, text) from public;

create or replace function private.next_username(
  p_org_id uuid,
  p_full_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_name text;
  prefix text;
  base text;
  candidate text;
  n int := 0;
begin
  select o.name into org_name
  from public.organizations o
  where o.id = p_org_id;

  prefix := private.slug_username_part(org_name, 4);
  base := private.slug_username_part(p_full_name, 12);
  candidate := prefix || '.' || base;

  while exists (
    select 1 from public.profiles p where lower(p.username) = lower(candidate)
  ) loop
    n := n + 1;
    candidate := prefix || '.' || base || n::text;
    if n > 500 then
      candidate := prefix || '.' || base || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
      exit;
    end if;
  end loop;

  return candidate;
end;
$$;

revoke all on function private.next_username(uuid, text) from public;

create or replace function private.random_temp_password()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  result text := '';
  i int;
begin
  for i in 1..10 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return substr(result, 1, 4) || '-' || substr(result, 5, 3) || '-' || substr(result, 8, 3);
end;
$$;

revoke all on function private.random_temp_password() from public;

-- ---------------------------------------------------------------------------
-- Resolve username → email for login (anon allowed)
-- ---------------------------------------------------------------------------
create or replace function public.resolve_login_email(p_identifier text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  ident text := lower(trim(coalesce(p_identifier, '')));
  found text;
begin
  if ident = '' then
    return null;
  end if;

  if position('@' in ident) > 0 then
    return ident;
  end if;

  select lower(p.email) into found
  from public.profiles p
  where p.username is not null
    and lower(p.username) = ident
    and p.role = 'student'
  limit 1;

  return found;
end;
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Provision one student into an org (+ optional batch)
-- ---------------------------------------------------------------------------
create or replace function public.provision_org_student(
  p_organization_id uuid,
  p_full_name text,
  p_email text default null,
  p_batch_name text default null,
  p_batch_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text := trim(coalesce(p_full_name, ''));
  email_in text := lower(trim(coalesce(p_email, '')));
  student_id uuid;
  batch_id uuid := p_batch_id;
  synth text;
  junk_password text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not private.is_org_admin(p_organization_id) and not private.is_superadmin() then
    raise exception 'Not allowed';
  end if;

  if not exists (
    select 1 from public.organizations o
    where o.id = p_organization_id
      and o.approval_status = 'approved'
  ) and not private.is_superadmin() then
    raise exception 'Organization is not approved';
  end if;

  if v_full_name = '' then
    raise exception 'Student name is required';
  end if;

  if batch_id is null then
    batch_id := private.ensure_batch(p_organization_id, p_batch_name);
  elsif not exists (
    select 1 from public.batches b
    where b.id = batch_id and b.organization_id = p_organization_id
  ) then
    raise exception 'Batch not found';
  end if;

  if email_in <> '' then
    if public.is_synthetic_student_email(email_in) then
      raise exception 'Invalid email';
    end if;

    select p.id into student_id
    from public.profiles p
    where lower(p.email) = email_in
    limit 1;

    if student_id is not null then
      if exists (
        select 1 from public.profiles p
        where p.id = student_id and p.role <> 'student'
      ) then
        raise exception 'Email belongs to a non-student account';
      end if;
    else
      junk_password := encode(extensions.gen_random_bytes(24), 'hex');
      student_id := private.create_auth_student(email_in, v_full_name, junk_password);
    end if;

    -- Supersede pending invites for this email at this org
    update public.student_link_requests
    set
      status = 'accepted',
      student_profile_id = coalesce(student_profile_id, student_id),
      responded_at = now()
    where organization_id = p_organization_id
      and status = 'requested'
      and lower(student_email) = email_in;
  else
    junk_password := encode(extensions.gen_random_bytes(24), 'hex');
    synth := replace(gen_random_uuid()::text, '-', '') || '@students.culturebeats.app';
    student_id := private.create_auth_student(synth, v_full_name, junk_password);
  end if;

  insert into public.student_links (
    student_profile_id,
    organization_id,
    batch_id
  )
  values (student_id, p_organization_id, batch_id)
  on conflict (student_profile_id, organization_id) do update
    set batch_id = coalesce(excluded.batch_id, public.student_links.batch_id);

  update public.profiles
  set
    full_name = v_full_name,
    is_provisioned = true,
    onboarding_completed = true
  where id = student_id;

  perform public.enroll_student_into_org_assigned_classes(
    student_id,
    p_organization_id
  );

  return student_id;
end;
$$;

revoke all on function public.provision_org_student(uuid, text, text, text, uuid) from public;
grant execute on function public.provision_org_student(uuid, text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Bulk import
-- ---------------------------------------------------------------------------
create or replace function public.import_org_students(
  p_organization_id uuid,
  p_students jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  created int := 0;
  updated int := 0;
  failed int := 0;
  errors jsonb := '[]'::jsonb;
  idx int := 0;
  sid uuid;
  before_link boolean;
  v_full_name text;
  v_email text;
  v_batch_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not private.is_org_admin(p_organization_id) and not private.is_superadmin() then
    raise exception 'Not allowed';
  end if;

  if jsonb_typeof(p_students) <> 'array' then
    raise exception 'Students payload must be an array';
  end if;

  if jsonb_array_length(p_students) > 500 then
    raise exception 'Import is limited to 500 students at a time';
  end if;

  for item in select * from jsonb_array_elements(p_students)
  loop
    idx := idx + 1;
    begin
      v_full_name := trim(coalesce(item ->> 'full_name', ''));
      v_email := nullif(lower(trim(coalesce(item ->> 'email', ''))), '');
      v_batch_name := nullif(trim(coalesce(item ->> 'batch_name', '')), '');

      select exists (
        select 1
        from public.student_links sl
        join public.profiles p on p.id = sl.student_profile_id
        where sl.organization_id = p_organization_id
          and (
            (v_email is not null and lower(p.email) = v_email)
            or (
              v_email is null
              and lower(p.full_name) = lower(v_full_name)
              and public.is_synthetic_student_email(p.email)
            )
          )
      ) into before_link;

      sid := public.provision_org_student(
        p_organization_id,
        v_full_name,
        v_email,
        v_batch_name,
        null
      );

      if before_link then
        updated := updated + 1;
      else
        created := created + 1;
      end if;
    exception when others then
      failed := failed + 1;
      errors := errors || jsonb_build_array(
        jsonb_build_object(
          'row', idx,
          'name', coalesce(item ->> 'full_name', ''),
          'error', SQLERRM
        )
      );
    end;
  end loop;

  return jsonb_build_object(
    'created', created,
    'updated', updated,
    'failed', failed,
    'errors', errors
  );
end;
$$;

revoke all on function public.import_org_students(uuid, jsonb) from public;
grant execute on function public.import_org_students(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Issue / reset username + password (optional; not for every student)
-- ---------------------------------------------------------------------------
create or replace function public.issue_student_login(
  p_organization_id uuid,
  p_student_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uname text;
  pwd text;
  student record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not private.is_org_admin(p_organization_id) and not private.is_superadmin() then
    raise exception 'Not allowed';
  end if;

  if not exists (
    select 1 from public.student_links sl
    where sl.organization_id = p_organization_id
      and sl.student_profile_id = p_student_profile_id
  ) then
    raise exception 'Student is not linked to this organization';
  end if;

  select p.id, p.full_name, p.username, p.email, p.role
  into student
  from public.profiles p
  where p.id = p_student_profile_id;

  if student.id is null or student.role <> 'student' then
    raise exception 'Student not found';
  end if;

  uname := student.username;
  if uname is null or trim(uname) = '' then
    uname := private.next_username(p_organization_id, student.full_name);
  end if;

  pwd := private.random_temp_password();

  update public.profiles
  set username = uname
  where id = p_student_profile_id;

  update auth.users
  set
    encrypted_password = extensions.crypt(pwd, extensions.gen_salt('bf')),
    updated_at = now()
  where id = p_student_profile_id;

  return jsonb_build_object(
    'username', uname,
    'password', pwd,
    'full_name', student.full_name
  );
end;
$$;

revoke all on function public.issue_student_login(uuid, uuid) from public;
grant execute on function public.issue_student_login(uuid, uuid) to authenticated;
