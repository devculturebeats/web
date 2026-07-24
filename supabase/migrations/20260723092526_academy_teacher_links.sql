-- Academy teacher membership: invite → accept → find only among members.
-- Also tighten is_org_admin so membership rows never grant admin by accident.

create or replace function private.is_org_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org_id
      and m.profile_id = auth.uid()
      and m.member_role = 'admin'
  );
$$;

-- Accepted teacher ↔ academy links
create table if not exists public.teacher_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  teacher_profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (organization_id, teacher_id),
  unique (organization_id, teacher_profile_id)
);

create index if not exists teacher_links_org_idx
  on public.teacher_links (organization_id);

create index if not exists teacher_links_teacher_idx
  on public.teacher_links (teacher_id);

create index if not exists teacher_links_profile_idx
  on public.teacher_links (teacher_profile_id);

alter table public.teacher_links enable row level security;

create policy "Teacher links: teacher, org admin, or superadmin read"
  on public.teacher_links for select to authenticated
  using (
    teacher_profile_id = auth.uid()
    or private.is_org_admin(organization_id)
    or private.is_superadmin()
  );

create policy "Teacher links: org admin manage"
  on public.teacher_links for all to authenticated
  using (
    private.is_org_admin(organization_id)
    or private.is_superadmin()
  )
  with check (
    private.is_org_admin(organization_id)
    or private.is_superadmin()
  );

-- Pending invites
create table if not exists public.teacher_link_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  teacher_id uuid references public.teachers (id) on delete cascade,
  teacher_profile_id uuid references public.profiles (id) on delete cascade,
  teacher_email text not null,
  status text not null default 'requested'
    check (status in ('requested', 'accepted', 'rejected')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create unique index if not exists teacher_link_requests_pending_email_unique
  on public.teacher_link_requests (organization_id, lower(teacher_email))
  where status = 'requested';

create unique index if not exists teacher_link_requests_pending_teacher_unique
  on public.teacher_link_requests (organization_id, teacher_id)
  where status = 'requested' and teacher_id is not null;

create index if not exists teacher_link_requests_teacher_idx
  on public.teacher_link_requests (teacher_profile_id, status);

create index if not exists teacher_link_requests_org_idx
  on public.teacher_link_requests (organization_id, status);

alter table public.teacher_link_requests enable row level security;

create policy "Teacher link requests: teacher or org admin read"
  on public.teacher_link_requests for select to authenticated
  using (
    teacher_profile_id = auth.uid()
    or lower(teacher_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or private.is_org_admin(organization_id)
    or private.is_superadmin()
  );

create policy "Teacher link requests: org admin create"
  on public.teacher_link_requests for insert to authenticated
  with check (
    private.is_org_admin(organization_id)
    or private.is_superadmin()
  );

create policy "Teacher link requests: org admin update pending"
  on public.teacher_link_requests for update to authenticated
  using (
    private.is_org_admin(organization_id)
    or private.is_superadmin()
  )
  with check (
    private.is_org_admin(organization_id)
    or private.is_superadmin()
  );

create or replace function public.respond_to_teacher_link_request(
  p_request_id uuid,
  p_accept boolean
)
returns public.teacher_link_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  req public.teacher_link_requests;
  teacher_row public.teachers;
  profile_email text;
begin
  select * into req
  from public.teacher_link_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request not found';
  end if;

  select email into profile_email
  from public.profiles
  where id = auth.uid();

  if req.teacher_profile_id is distinct from auth.uid()
     and lower(req.teacher_email) is distinct from lower(coalesce(profile_email, ''))
     and not private.is_superadmin() then
    raise exception 'Not allowed';
  end if;

  if req.status <> 'requested' then
    raise exception 'Request already responded';
  end if;

  if p_accept then
    select * into teacher_row
    from public.teachers
    where profile_id = auth.uid()
    limit 1;

    if not found then
      -- Resolve by invite email if profile_id was null at invite time
      select t.* into teacher_row
      from public.teachers t
      join public.profiles p on p.id = t.profile_id
      where lower(p.email) = lower(req.teacher_email)
        and p.role = 'teacher'
      limit 1;
    end if;

    if teacher_row.id is null then
      raise exception 'Complete your teacher profile before joining an academy';
    end if;

    insert into public.teacher_links (
      organization_id,
      teacher_id,
      teacher_profile_id
    )
    values (
      req.organization_id,
      teacher_row.id,
      teacher_row.profile_id
    )
    on conflict (organization_id, teacher_id) do nothing;

    update public.teacher_link_requests
    set
      status = 'accepted',
      responded_at = now(),
      teacher_id = teacher_row.id,
      teacher_profile_id = teacher_row.profile_id
    where id = req.id
    returning * into req;
  else
    update public.teacher_link_requests
    set status = 'rejected', responded_at = now()
    where id = req.id
    returning * into req;
  end if;

  return req;
end;
$$;

revoke all on function public.respond_to_teacher_link_request(uuid, boolean) from public, anon;
grant execute on function public.respond_to_teacher_link_request(uuid, boolean) to authenticated;

-- Claim pending invites when a teacher signs in (email match)
create or replace function public.claim_teacher_link_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed integer := 0;
  profile_email text;
  teacher_row public.teachers;
begin
  select email into profile_email
  from public.profiles
  where id = auth.uid()
    and role = 'teacher';

  if profile_email is null then
    return 0;
  end if;

  select * into teacher_row
  from public.teachers
  where profile_id = auth.uid()
  limit 1;

  update public.teacher_link_requests
  set teacher_profile_id = auth.uid(),
      teacher_id = teacher_row.id
  where status = 'requested'
    and lower(teacher_email) = lower(profile_email)
    and (teacher_profile_id is null or teacher_profile_id = auth.uid());

  get diagnostics claimed = row_count;
  return claimed;
end;
$$;

revoke all on function public.claim_teacher_link_invites() from public, anon;
grant execute on function public.claim_teacher_link_invites() to authenticated;

-- Search only teachers linked to this academy
create or replace function public.search_academy_member_teachers(
  p_organization_id uuid,
  p_name text default null,
  p_skill text default null,
  p_email text default null,
  p_phone text default null,
  p_day_of_week smallint default null,
  p_start_time time default null,
  p_end_time time default null
)
returns table (
  teacher_id uuid,
  profile_id uuid,
  full_name text,
  email text,
  phone text,
  primary_skill text,
  secondary_skills text[],
  city text,
  years_of_experience integer,
  slot_start time,
  slot_end time
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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
  ) then
    raise exception 'Only academies can search member teachers';
  end if;

  return query
  select distinct on (t.id)
    t.id as teacher_id,
    t.profile_id,
    p.full_name,
    p.email,
    p.phone,
    t.primary_skill,
    t.secondary_skills,
    t.city,
    t.years_of_experience,
    case
      when p_day_of_week is not null then a.start_time
      else null::time
    end as slot_start,
    case
      when p_day_of_week is not null then a.end_time
      else null::time
    end as slot_end
  from public.teacher_links tl
  join public.teachers t on t.id = tl.teacher_id
  join public.profiles p on p.id = t.profile_id
  left join public.teacher_availability a
    on a.teacher_id = t.id
    and p_day_of_week is not null
    and a.day_of_week = p_day_of_week
    and (
      p_start_time is null
      or p_end_time is null
      or (
        a.start_time <= p_start_time
        and a.end_time >= p_end_time
      )
    )
  where tl.organization_id = p_organization_id
    and p.role = 'teacher'
    and p.approval_status = 'approved'
    and p.onboarding_completed = true
    and (
      p_name is null
      or p_name = ''
      or p.full_name ilike '%' || p_name || '%'
    )
    and (
      p_skill is null
      or p_skill = ''
      or t.primary_skill ilike p_skill
      or p_skill = any (t.secondary_skills)
    )
    and (
      p_email is null
      or p_email = ''
      or p.email ilike '%' || p_email || '%'
    )
    and (
      p_phone is null
      or p_phone = ''
      or coalesce(p.phone, '') ilike '%' || p_phone || '%'
      or coalesce(p.whatsapp, '') ilike '%' || p_phone || '%'
    )
    and (
      p_day_of_week is null
      or (
        a.id is not null
        and (
          p_start_time is null
          or p_end_time is null
          or not exists (
            select 1
            from public.find_availability_conflicts(
              t.id,
              p_day_of_week,
              p_start_time,
              p_end_time
            )
          )
        )
      )
    )
  order by t.id, t.years_of_experience desc nulls last, p.full_name;
end;
$$;

revoke all on function public.search_academy_member_teachers(
  uuid, text, text, text, text, smallint, time, time
) from public, anon;
grant execute on function public.search_academy_member_teachers(
  uuid, text, text, text, text, smallint, time, time
) to authenticated;

-- Demo: link Ananya (teacher1) to Nritya Studio Academy so Find teachers works
insert into public.teacher_links (organization_id, teacher_id, teacher_profile_id)
select
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2'::uuid,
  t.id,
  t.profile_id
from public.teachers t
join public.profiles p on p.id = t.profile_id
where p.email = 'teacher1@culturebeats.test'
on conflict do nothing;
