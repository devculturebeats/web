-- Parent role + parent↔student linking (school attach, mutual consent requests).

-- 1) Role
alter type public.app_role add value if not exists 'parent';

-- 2) Student public lookup codes (for parent search) on profiles
alter table public.profiles
  add column if not exists lookup_code text;

do $$
declare
  r record;
  code text;
  used boolean;
begin
  for r in
    select id from public.profiles
    where role = 'student' and lookup_code is null
  loop
    loop
      code := lpad((100000 + floor(random() * 900000)::int)::text, 6, '0');
      select exists (
        select 1 from public.profiles where lookup_code = code
      ) into used;
      exit when not used;
    end loop;
    update public.profiles set lookup_code = code where id = r.id;
  end loop;
end;
$$;

create or replace function public.profiles_set_student_lookup_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text;
  attempts integer := 0;
begin
  if new.role is distinct from 'student'::public.app_role then
    return new;
  end if;

  if new.lookup_code is not null and new.lookup_code ~ '^[0-9]{6}$' then
    return new;
  end if;

  loop
    attempts := attempts + 1;
    candidate := lpad((100000 + floor(random() * 900000)::int)::text, 6, '0');
    exit when not exists (
      select 1 from public.profiles p where p.lookup_code = candidate
    );
    if attempts > 50 then
      raise exception 'Could not allocate a unique student lookup code';
    end if;
  end loop;

  new.lookup_code := candidate;
  return new;
end;
$$;

drop trigger if exists profiles_set_student_lookup_code_bi on public.profiles;
create trigger profiles_set_student_lookup_code_bi
  before insert on public.profiles
  for each row
  execute function public.profiles_set_student_lookup_code();

drop trigger if exists profiles_set_student_lookup_code_bu on public.profiles;
create trigger profiles_set_student_lookup_code_bu
  before update of role on public.profiles
  for each row
  when (new.role = 'student'::public.app_role and old.role is distinct from 'student'::public.app_role)
  execute function public.profiles_set_student_lookup_code();

create unique index if not exists profiles_lookup_code_uidx
  on public.profiles (lookup_code)
  where lookup_code is not null;

alter table public.profiles
  drop constraint if exists profiles_lookup_code_format;
alter table public.profiles
  add constraint profiles_lookup_code_format
  check (lookup_code is null or lookup_code ~ '^[0-9]{6}$');

-- 3) Link tables
create table if not exists public.parent_student_links (
  id uuid primary key default gen_random_uuid(),
  parent_profile_id uuid not null references public.profiles(id) on delete cascade,
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (parent_profile_id, student_profile_id)
);

create index if not exists parent_student_links_parent_idx
  on public.parent_student_links (parent_profile_id);
create index if not exists parent_student_links_student_idx
  on public.parent_student_links (student_profile_id);

create table if not exists public.parent_link_requests (
  id uuid primary key default gen_random_uuid(),
  initiator text not null
    check (initiator in ('parent', 'student', 'school')),
  parent_profile_id uuid references public.profiles(id) on delete cascade,
  parent_email text,
  student_profile_id uuid references public.profiles(id) on delete cascade,
  student_email text,
  organization_id uuid references public.organizations(id) on delete cascade,
  status public.class_lifecycle not null default 'requested',
  message text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint parent_link_requests_status_check
    check (status in ('requested', 'accepted', 'rejected')),
  constraint parent_link_requests_party_check
    check (
      parent_profile_id is not null
      or nullif(trim(parent_email), '') is not null
    ),
  constraint parent_link_requests_student_party_check
    check (
      student_profile_id is not null
      or nullif(trim(student_email), '') is not null
    )
);

create index if not exists parent_link_requests_parent_idx
  on public.parent_link_requests (parent_profile_id)
  where status = 'requested';
create index if not exists parent_link_requests_student_idx
  on public.parent_link_requests (student_profile_id)
  where status = 'requested';
create index if not exists parent_link_requests_parent_email_idx
  on public.parent_link_requests (lower(parent_email))
  where status = 'requested' and parent_email is not null;
create index if not exists parent_link_requests_student_email_idx
  on public.parent_link_requests (lower(student_email))
  where status = 'requested' and student_email is not null;

create unique index if not exists parent_link_requests_pending_pair_uidx
  on public.parent_link_requests (
    coalesce(parent_profile_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(coalesce(parent_email, '')),
    coalesce(student_profile_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(coalesce(student_email, ''))
  )
  where status = 'requested';

alter table public.parent_student_links enable row level security;
alter table public.parent_link_requests enable row level security;

-- Helpers
create or replace function private.is_linked_parent_of(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.parent_student_links l
    where l.parent_profile_id = auth.uid()
      and l.student_profile_id = p_student_id
  );
$$;

create or replace function private.current_is_parent()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'parent'
  );
$$;

-- RLS
create policy "Parent links: parties read"
  on public.parent_student_links for select to authenticated
  using (
    private.is_superadmin()
    or parent_profile_id = auth.uid()
    or student_profile_id = auth.uid()
    or private.is_org_admin(organization_id)
  );

create policy "Parent links: school insert"
  on public.parent_student_links for insert to authenticated
  with check (
    private.is_superadmin()
    or private.is_org_admin(organization_id)
  );

create policy "Parent links: parties delete"
  on public.parent_student_links for delete to authenticated
  using (
    private.is_superadmin()
    or parent_profile_id = auth.uid()
    or student_profile_id = auth.uid()
    or private.is_org_admin(organization_id)
  );

create policy "Parent requests: parties read"
  on public.parent_link_requests for select to authenticated
  using (
    private.is_superadmin()
    or parent_profile_id = auth.uid()
    or student_profile_id = auth.uid()
    or private.is_org_admin(organization_id)
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          (parent_email is not null and lower(p.email) = lower(parent_email))
          or (student_email is not null and lower(p.email) = lower(student_email))
        )
    )
  );

create policy "Parent requests: create"
  on public.parent_link_requests for insert to authenticated
  with check (
    private.is_superadmin()
    or created_by = auth.uid()
    or private.is_org_admin(organization_id)
  );

create policy "Parent requests: respond update"
  on public.parent_link_requests for update to authenticated
  using (
    private.is_superadmin()
    or parent_profile_id = auth.uid()
    or student_profile_id = auth.uid()
    or private.is_org_admin(organization_id)
  )
  with check (
    private.is_superadmin()
    or parent_profile_id = auth.uid()
    or student_profile_id = auth.uid()
    or private.is_org_admin(organization_id)
  );

-- Allow parents to read linked student profiles (name/email/code)
create policy "Profiles: linked parent read student"
  on public.profiles for select to authenticated
  using (
    private.is_linked_parent_of(id)
  );

-- Parents can read enrollments / sessions for linked students
create policy "Enrollments: linked parent read"
  on public.class_enrollments for select to authenticated
  using (private.is_linked_parent_of(student_profile_id));

create policy "Session enrollments: linked parent read"
  on public.class_session_enrollments for select to authenticated
  using (private.is_linked_parent_of(student_profile_id));

-- Signup: allow parent role
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data ->> 'role', 'student');
  resolved_role public.app_role;
  needs_approval boolean := false;
begin
  if requested_role in ('teacher', 'student', 'school_admin', 'academy_admin', 'parent') then
    resolved_role := requested_role::public.app_role;
  else
    resolved_role := 'student';
  end if;

  if resolved_role in ('teacher', 'school_admin', 'academy_admin') then
    needs_approval := true;
  end if;

  insert into public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    role,
    approval_status,
    onboarding_completed
  ) values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    resolved_role,
    case when needs_approval then 'pending'::public.approval_status else 'approved'::public.approval_status end,
    -- Parents need no form; mark onboarding complete immediately.
    case when resolved_role = 'parent'::public.app_role then true else false end
  );

  if resolved_role = 'teacher' then
    insert into public.teachers (profile_id) values (new.id);
  end if;

  return new;
end;
$$;

create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_superadmin() then
    return new;
  end if;

  if old.onboarding_completed = false
     and old.created_at > now() - interval '15 minutes'
     and old.role = 'student'::public.app_role
     and new.role in (
       'teacher'::public.app_role,
       'student'::public.app_role,
       'school_admin'::public.app_role,
       'academy_admin'::public.app_role,
       'parent'::public.app_role
     )
  then
    if new.approval_status is distinct from old.approval_status then
      if new.role in (
           'teacher'::public.app_role,
           'school_admin'::public.app_role,
           'academy_admin'::public.app_role
         )
         and new.approval_status = 'pending'::public.approval_status
      then
        return new;
      end if;
      if new.role in ('student'::public.app_role, 'parent'::public.app_role)
         and new.approval_status = 'approved'::public.approval_status
      then
        return new;
      end if;
      raise exception 'Cannot change approval status';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Cannot change role';
  end if;

  if new.approval_status is distinct from old.approval_status then
    raise exception 'Cannot change approval status';
  end if;

  return new;
end;
$$;

-- Resolve student by exact email or 6-digit lookup code
create or replace function private.find_student_profile(
  p_email text default null,
  p_lookup_code text default null
)
returns public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  row public.profiles;
  email_norm text := lower(nullif(trim(coalesce(p_email, '')), ''));
  code_norm text := nullif(trim(coalesce(p_lookup_code, '')), '');
begin
  if code_norm is not null then
    if code_norm !~ '^[0-9]{6}$' then
      raise exception 'Student ID must be 6 digits';
    end if;
    select * into row
    from public.profiles
    where role = 'student'
      and lookup_code = code_norm
    limit 1;
    if found then
      return row;
    end if;
  end if;

  if email_norm is not null then
    select * into row
    from public.profiles
    where role = 'student'
      and lower(email) = email_norm
    limit 1;
    if found then
      return row;
    end if;
  end if;

  return null;
end;
$$;

create or replace function private.ensure_parent_link(
  p_parent_id uuid,
  p_student_id uuid,
  p_organization_id uuid default null,
  p_created_by uuid default null
)
returns public.parent_student_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  link public.parent_student_links;
begin
  insert into public.parent_student_links (
    parent_profile_id,
    student_profile_id,
    organization_id,
    created_by
  )
  values (
    p_parent_id,
    p_student_id,
    p_organization_id,
    p_created_by
  )
  on conflict (parent_profile_id, student_profile_id) do update
    set organization_id = coalesce(
      excluded.organization_id,
      public.parent_student_links.organization_id
    )
  returning * into link;

  return link;
end;
$$;

-- Claim email invites for the current user (parent or student)
create or replace function public.claim_parent_link_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
  claimed integer := 0;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found then
    return 0;
  end if;

  if me.role = 'parent' then
    update public.parent_link_requests
    set parent_profile_id = me.id
    where status = 'requested'
      and parent_profile_id is null
      and parent_email is not null
      and lower(parent_email) = lower(me.email);
    get diagnostics claimed = row_count;
  elsif me.role = 'student' then
    update public.parent_link_requests
    set student_profile_id = me.id
    where status = 'requested'
      and student_profile_id is null
      and student_email is not null
      and lower(student_email) = lower(me.email);
    get diagnostics claimed = row_count;
  end if;

  return claimed;
end;
$$;

revoke all on function public.claim_parent_link_invites() from public, anon;
grant execute on function public.claim_parent_link_invites() to authenticated;

create or replace function public.respond_to_parent_link_request(
  p_request_id uuid,
  p_accept boolean
)
returns public.parent_link_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  req public.parent_link_requests;
  me uuid := auth.uid();
  parent_id uuid;
  student_id uuid;
begin
  perform public.claim_parent_link_invites();

  select * into req
  from public.parent_link_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request not found';
  end if;

  if req.status <> 'requested' then
    raise exception 'Request already responded';
  end if;

  parent_id := req.parent_profile_id;
  student_id := req.student_profile_id;

  if parent_id is null and req.parent_email is not null then
    select id into parent_id
    from public.profiles
    where role = 'parent' and lower(email) = lower(req.parent_email)
    limit 1;
  end if;

  if student_id is null and req.student_email is not null then
    select id into student_id
    from public.profiles
    where role = 'student' and lower(email) = lower(req.student_email)
    limit 1;
  end if;

  if not (
    private.is_superadmin()
    or private.is_org_admin(req.organization_id)
    or me = parent_id
    or me = student_id
  ) then
    raise exception 'Not allowed';
  end if;

  -- The other party accepts (initiator already agreed by creating).
  -- School-initiated: student or parent can accept; school admin can force-accept.
  if p_accept then
    if parent_id is null or student_id is null then
      raise exception 'Both parent and student accounts must exist before accepting';
    end if;

    update public.parent_link_requests
    set
      status = 'accepted',
      responded_at = now(),
      parent_profile_id = parent_id,
      student_profile_id = student_id
    where id = req.id
    returning * into req;

    perform private.ensure_parent_link(
      parent_id,
      student_id,
      req.organization_id,
      me
    );

    perform private.write_audit(
      'parent.link_accept',
      'parent_student_link',
      req.id,
      req.organization_id,
      jsonb_build_object(
        'parent_profile_id', parent_id,
        'student_profile_id', student_id
      )
    );
  else
    update public.parent_link_requests
    set status = 'rejected', responded_at = now()
    where id = req.id
    returning * into req;
  end if;

  return req;
end;
$$;

revoke all on function public.respond_to_parent_link_request(uuid, boolean) from public, anon;
grant execute on function public.respond_to_parent_link_request(uuid, boolean) to authenticated;

-- Parent or student creates a consent request
create or replace function public.request_parent_student_link(
  p_as text,
  p_counterpart_email text default null,
  p_counterpart_lookup_code text default null,
  p_message text default null
)
returns public.parent_link_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
  student_row public.profiles;
  parent_row public.profiles;
  email_norm text := lower(nullif(trim(coalesce(p_counterpart_email, '')), ''));
  msg text := nullif(trim(coalesce(p_message, '')), '');
  req public.parent_link_requests;
begin
  if p_as not in ('parent', 'student') then
    raise exception 'Invalid initiator';
  end if;

  select * into me from public.profiles where id = auth.uid();
  if not found then
    raise exception 'Not authenticated';
  end if;

  if p_as = 'parent' then
    if me.role <> 'parent' then
      raise exception 'Only parents can request as parent';
    end if;

    student_row := private.find_student_profile(email_norm, p_counterpart_lookup_code);
    if student_row is null then
      if email_norm is null then
        raise exception 'Student not found. Use their exact email or 6-digit ID.';
      end if;
      -- Invite by email before student account exists
      insert into public.parent_link_requests (
        initiator,
        parent_profile_id,
        parent_email,
        student_email,
        status,
        message,
        created_by
      ) values (
        'parent',
        me.id,
        me.email,
        email_norm,
        'requested',
        msg,
        me.id
      )
      returning * into req;
      return req;
    end if;

    if exists (
      select 1 from public.parent_student_links
      where parent_profile_id = me.id and student_profile_id = student_row.id
    ) then
      raise exception 'Already linked to this student';
    end if;

    insert into public.parent_link_requests (
      initiator,
      parent_profile_id,
      parent_email,
      student_profile_id,
      student_email,
      status,
      message,
      created_by
    ) values (
      'parent',
      me.id,
      me.email,
      student_row.id,
      student_row.email,
      'requested',
      msg,
      me.id
    )
    returning * into req;

  else
    if me.role <> 'student' then
      raise exception 'Only students can request as student';
    end if;

    if email_norm is null then
      raise exception 'Parent email is required';
    end if;

    select * into parent_row
    from public.profiles
    where role = 'parent' and lower(email) = email_norm
    limit 1;

    if parent_row.id is not null then
      if exists (
        select 1 from public.parent_student_links
        where parent_profile_id = parent_row.id and student_profile_id = me.id
      ) then
        raise exception 'Already linked to this parent';
      end if;

      insert into public.parent_link_requests (
        initiator,
        parent_profile_id,
        parent_email,
        student_profile_id,
        student_email,
        status,
        message,
        created_by
      ) values (
        'student',
        parent_row.id,
        parent_row.email,
        me.id,
        me.email,
        'requested',
        msg,
        me.id
      )
      returning * into req;
    else
      insert into public.parent_link_requests (
        initiator,
        parent_email,
        student_profile_id,
        student_email,
        status,
        message,
        created_by
      ) values (
        'student',
        email_norm,
        me.id,
        me.email,
        'requested',
        msg,
        me.id
      )
      returning * into req;
    end if;
  end if;

  perform private.write_audit(
    'parent.link_request',
    'parent_link_request',
    req.id,
    null,
    jsonb_build_object('initiator', p_as, 'message', msg)
  );

  return req;
end;
$$;

revoke all on function public.request_parent_student_link(text, text, text, text) from public, anon;
grant execute on function public.request_parent_student_link(text, text, text, text) to authenticated;

-- School attaches a parent to a linked student (invite or immediate if parent exists)
create or replace function public.school_attach_parent(
  p_organization_id uuid,
  p_student_profile_id uuid,
  p_parent_email text,
  p_parent_full_name text default null,
  p_auto_accept boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_row public.profiles;
  email_norm text := lower(nullif(trim(coalesce(p_parent_email, '')), ''));
  name_norm text := nullif(trim(coalesce(p_parent_full_name, '')), '');
  req public.parent_link_requests;
  link public.parent_student_links;
  student_ok boolean;
begin
  if not (private.is_superadmin() or private.is_org_admin(p_organization_id)) then
    raise exception 'Not allowed';
  end if;

  if email_norm is null or email_norm !~ '^[^@]+@[^@]+$' then
    raise exception 'Parent email is required';
  end if;

  select exists (
    select 1 from public.student_links sl
    where sl.organization_id = p_organization_id
      and sl.student_profile_id = p_student_profile_id
  ) into student_ok;

  if not student_ok then
    raise exception 'Student is not linked to this organization';
  end if;

  select * into parent_row
  from public.profiles
  where lower(email) = email_norm
  limit 1;

  if parent_row.id is not null and parent_row.role <> 'parent' then
    raise exception 'That email belongs to a non-parent account';
  end if;

  if parent_row.id is not null and p_auto_accept then
    link := private.ensure_parent_link(
      parent_row.id,
      p_student_profile_id,
      p_organization_id,
      auth.uid()
    );
    perform private.write_audit(
      'parent.school_attach',
      'parent_student_link',
      link.id,
      p_organization_id,
      jsonb_build_object(
        'parent_profile_id', parent_row.id,
        'student_profile_id', p_student_profile_id,
        'auto', true
      )
    );
    return jsonb_build_object(
      'mode', 'linked',
      'link_id', link.id,
      'parent_profile_id', parent_row.id
    );
  end if;

  insert into public.parent_link_requests (
    initiator,
    parent_profile_id,
    parent_email,
    student_profile_id,
    organization_id,
    status,
    message,
    created_by
  ) values (
    'school',
    parent_row.id,
    email_norm,
    p_student_profile_id,
    p_organization_id,
    'requested',
    case
      when name_norm is not null then 'School linked parent: ' || name_norm
      else 'School invited you as a parent.'
    end,
    auth.uid()
  )
  returning * into req;

  -- If parent already exists and school chooses auto, we already returned.
  -- If parent exists, they can accept; also allow school to force-accept.
  if parent_row.id is not null and p_auto_accept then
    null; -- unreachable
  end if;

  perform private.write_audit(
    'parent.school_invite',
    'parent_link_request',
    req.id,
    p_organization_id,
    jsonb_build_object(
      'parent_email', email_norm,
      'student_profile_id', p_student_profile_id
    )
  );

  return jsonb_build_object(
    'mode', 'invited',
    'request_id', req.id,
    'parent_profile_id', parent_row.id,
    'parent_email', email_norm
  );
end;
$$;

revoke all on function public.school_attach_parent(uuid, uuid, text, text, boolean) from public, anon;
grant execute on function public.school_attach_parent(uuid, uuid, text, text, boolean) to authenticated;

-- Provision a parent login (synthetic or real email) and link to student
create or replace function private.create_auth_parent(
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
      'role', 'parent',
      'full_name', coalesce(nullif(trim(p_full_name), ''), 'Parent')
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
    role = 'parent',
    approval_status = 'approved',
    onboarding_completed = true,
    full_name = coalesce(nullif(trim(p_full_name), ''), full_name, 'Parent'),
    email = lower(trim(p_email)),
    is_provisioned = true
  where id = u_id;

  return u_id;
end;
$$;

revoke all on function private.create_auth_parent(text, text, text) from public;

create or replace function public.provision_org_parent(
  p_organization_id uuid,
  p_student_profile_id uuid,
  p_full_name text,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  email_norm text := lower(nullif(trim(coalesce(p_email, '')), ''));
  name_norm text := nullif(trim(coalesce(p_full_name, '')), '');
  parent_id uuid;
  existing public.profiles;
  link public.parent_student_links;
  synthetic boolean := false;
  junk_password text;
begin
  if not (private.is_superadmin() or private.is_org_admin(p_organization_id)) then
    raise exception 'Not allowed';
  end if;

  if name_norm is null then
    raise exception 'Parent name is required';
  end if;

  if not exists (
    select 1 from public.student_links
    where organization_id = p_organization_id
      and student_profile_id = p_student_profile_id
  ) then
    raise exception 'Student is not linked to this organization';
  end if;

  if email_norm is null then
    synthetic := true;
    email_norm := gen_random_uuid()::text || '@parents.culturebeats.app';
  end if;

  select * into existing
  from public.profiles
  where lower(email) = email_norm
  limit 1;

  if existing.id is not null then
    if existing.role <> 'parent' then
      raise exception 'That email belongs to a non-parent account';
    end if;
    parent_id := existing.id;
  else
    junk_password := private.random_temp_password();
    parent_id := private.create_auth_parent(email_norm, name_norm, junk_password);
  end if;

  link := private.ensure_parent_link(
    parent_id,
    p_student_profile_id,
    p_organization_id,
    auth.uid()
  );

  perform private.write_audit(
    'parent.provision',
    'parent_student_link',
    link.id,
    p_organization_id,
    jsonb_build_object(
      'parent_profile_id', parent_id,
      'student_profile_id', p_student_profile_id,
      'synthetic', synthetic
    )
  );

  return jsonb_build_object(
    'parent_profile_id', parent_id,
    'link_id', link.id,
    'email', email_norm,
    'synthetic', synthetic
  );
end;
$$;

revoke all on function public.provision_org_parent(uuid, uuid, text, text) from public, anon;
grant execute on function public.provision_org_parent(uuid, uuid, text, text) to authenticated;

create or replace function public.issue_parent_login(
  p_organization_id uuid,
  p_parent_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_row public.profiles;
  uname text;
  temp_pw text;
begin
  if not (private.is_superadmin() or private.is_org_admin(p_organization_id)) then
    raise exception 'Not allowed';
  end if;

  if not exists (
    select 1
    from public.parent_student_links l
    join public.student_links sl
      on sl.student_profile_id = l.student_profile_id
     and sl.organization_id = p_organization_id
    where l.parent_profile_id = p_parent_profile_id
  ) then
    raise exception 'Parent is not linked to a student in this organization';
  end if;

  select * into parent_row
  from public.profiles
  where id = p_parent_profile_id and role = 'parent';

  if not found then
    raise exception 'Parent not found';
  end if;

  uname := private.next_username(p_organization_id, parent_row.full_name);
  temp_pw := private.random_temp_password();

  update public.profiles
  set username = uname
  where id = p_parent_profile_id;

  update auth.users
  set
    encrypted_password = extensions.crypt(temp_pw, extensions.gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
  where id = p_parent_profile_id;

  return jsonb_build_object(
    'username', uname,
    'password', temp_pw,
    'full_name', parent_row.full_name,
    'email', parent_row.email
  );
end;
$$;

revoke all on function public.issue_parent_login(uuid, uuid) from public, anon;
grant execute on function public.issue_parent_login(uuid, uuid) to authenticated;
