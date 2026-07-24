-- 6-digit public lookup codes for teachers and organizations.
-- Assigned on insert (before approval) so admins/academies can search by ID.

alter table public.teachers
  add column if not exists lookup_code text;

alter table public.organizations
  add column if not exists lookup_code text;

-- Backfill existing rows
do $$
declare
  r record;
  code text;
  used boolean;
begin
  for r in select id from public.teachers where lookup_code is null loop
    loop
      code := lpad((100000 + floor(random() * 900000)::int)::text, 6, '0');
      select exists (
        select 1 from public.teachers where lookup_code = code
      ) into used;
      exit when not used;
    end loop;
    update public.teachers set lookup_code = code where id = r.id;
  end loop;

  for r in select id from public.organizations where lookup_code is null loop
    loop
      code := lpad((100000 + floor(random() * 900000)::int)::text, 6, '0');
      select exists (
        select 1 from public.organizations where lookup_code = code
      ) into used;
      exit when not used;
    end loop;
    update public.organizations set lookup_code = code where id = r.id;
  end loop;
end;
$$;

alter table public.teachers
  alter column lookup_code set not null;

alter table public.organizations
  alter column lookup_code set not null;

alter table public.teachers
  drop constraint if exists teachers_lookup_code_format;
alter table public.teachers
  add constraint teachers_lookup_code_format check (lookup_code ~ '^[0-9]{6}$');

alter table public.organizations
  drop constraint if exists organizations_lookup_code_format;
alter table public.organizations
  add constraint organizations_lookup_code_format check (lookup_code ~ '^[0-9]{6}$');

create unique index if not exists teachers_lookup_code_uidx
  on public.teachers (lookup_code);

create unique index if not exists organizations_lookup_code_uidx
  on public.organizations (lookup_code);

create or replace function public.teachers_set_lookup_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text;
  attempts integer := 0;
begin
  if new.lookup_code is not null and new.lookup_code ~ '^[0-9]{6}$' then
    return new;
  end if;

  loop
    attempts := attempts + 1;
    candidate := lpad((100000 + floor(random() * 900000)::int)::text, 6, '0');
    exit when not exists (
      select 1 from public.teachers t where t.lookup_code = candidate
    );
    if attempts > 50 then
      raise exception 'Could not allocate a unique teacher lookup code';
    end if;
  end loop;

  new.lookup_code := candidate;
  return new;
end;
$$;

drop trigger if exists teachers_set_lookup_code_bi on public.teachers;
create trigger teachers_set_lookup_code_bi
  before insert on public.teachers
  for each row
  execute function public.teachers_set_lookup_code();

create or replace function public.organizations_set_lookup_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text;
  attempts integer := 0;
begin
  if new.lookup_code is not null and new.lookup_code ~ '^[0-9]{6}$' then
    return new;
  end if;

  loop
    attempts := attempts + 1;
    candidate := lpad((100000 + floor(random() * 900000)::int)::text, 6, '0');
    exit when not exists (
      select 1 from public.organizations o where o.lookup_code = candidate
    );
    if attempts > 50 then
      raise exception 'Could not allocate a unique organization lookup code';
    end if;
  end loop;

  new.lookup_code := candidate;
  return new;
end;
$$;

drop trigger if exists organizations_set_lookup_code_bi on public.organizations;
create trigger organizations_set_lookup_code_bi
  before insert on public.organizations
  for each row
  execute function public.organizations_set_lookup_code();

-- Discover: exact email OR exact 6-digit teacher ID
drop function if exists public.search_discoverable_teachers_for_academy(uuid, text);

create or replace function public.search_discoverable_teachers_for_academy(
  p_organization_id uuid,
  p_email text default null,
  p_lookup_code text default null
)
returns table (
  teacher_id uuid,
  profile_id uuid,
  full_name text,
  email text,
  phone text,
  lookup_code text,
  primary_skill text,
  secondary_skills text[],
  city text,
  years_of_experience integer,
  already_linked boolean,
  invite_pending boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  email_q text := lower(trim(coalesce(p_email, '')));
  code_q text := trim(coalesce(p_lookup_code, ''));
begin
  if not private.is_org_admin(p_organization_id)
     and not private.is_superadmin() then
    raise exception 'Not allowed';
  end if;

  if not exists (
    select 1
    from public.organizations o
    where o.id = p_organization_id
      and o.type = 'academy'
      and o.approval_status = 'approved'
  ) then
    raise exception 'Only approved academies can discover teachers';
  end if;

  if (email_q is null or email_q = '') and (code_q is null or code_q = '') then
    raise exception 'Enter a teacher email or 6-digit teacher ID';
  end if;

  if email_q is not null and email_q <> '' and position('@' in email_q) = 0 then
    raise exception 'Enter the teacher''s full email address';
  end if;

  if code_q is not null and code_q <> '' and code_q !~ '^[0-9]{6}$' then
    raise exception 'Teacher ID must be exactly 6 digits';
  end if;

  return query
  select
    t.id as teacher_id,
    t.profile_id,
    p.full_name,
    p.email,
    p.phone,
    t.lookup_code,
    t.primary_skill,
    t.secondary_skills,
    t.city,
    t.years_of_experience,
    exists (
      select 1
      from public.teacher_links tl
      where tl.organization_id = p_organization_id
        and tl.teacher_id = t.id
    ) as already_linked,
    exists (
      select 1
      from public.teacher_link_requests r
      where r.organization_id = p_organization_id
        and r.status = 'requested'
        and (
          r.teacher_id = t.id
          or lower(r.teacher_email) = lower(p.email)
        )
    ) as invite_pending
  from public.teachers t
  join public.profiles p on p.id = t.profile_id
  where t.discoverable_by_academies = true
    and p.role = 'teacher'
    and p.approval_status = 'approved'
    and p.onboarding_completed = true
    and (
      (email_q <> '' and lower(p.email) = email_q)
      or (code_q <> '' and t.lookup_code = code_q)
    )
  order by p.full_name
  limit 10;
end;
$$;

revoke all on function public.search_discoverable_teachers_for_academy(uuid, text, text)
  from public, anon;
grant execute on function public.search_discoverable_teachers_for_academy(uuid, text, text)
  to authenticated;

-- Also allow pending teachers to be found by lookup code for admin tooling via RLS-safe select;
-- admins already can read profiles. Include lookup_code in member search return optionally later.
