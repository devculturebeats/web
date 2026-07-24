-- Discover teachers by exact email only (no phone / partial match).

drop function if exists public.search_discoverable_teachers_for_academy(uuid, text, text, text);

create or replace function public.search_discoverable_teachers_for_academy(
  p_organization_id uuid,
  p_email text
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

  if email_q is null or email_q = '' or position('@' in email_q) = 0 then
    raise exception 'Enter the teacher''s full email address';
  end if;

  return query
  select
    t.id as teacher_id,
    t.profile_id,
    p.full_name,
    p.email,
    p.phone,
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
    and lower(p.email) = email_q
  order by p.full_name
  limit 10;
end;
$$;

revoke all on function public.search_discoverable_teachers_for_academy(uuid, text)
  from public, anon;
grant execute on function public.search_discoverable_teachers_for_academy(uuid, text)
  to authenticated;

comment on column public.teachers.discoverable_by_academies is
  'When true, approved academies can find this teacher by exact email to send a join invite.';
