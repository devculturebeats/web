-- Teachers can opt in/out of academy discovery.
-- Academies discover any searchable teacher to invite;
-- class assignment stays limited to linked members.

alter table public.teachers
  add column if not exists discoverable_by_academies boolean not null default true;

comment on column public.teachers.discoverable_by_academies is
  'When true, approved academies can find this teacher by phone/email/name to send a join invite.';

create or replace function public.search_discoverable_teachers_for_academy(
  p_organization_id uuid,
  p_phone text default null,
  p_email text default null,
  p_name text default null
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
  phone_q text := nullif(trim(coalesce(p_phone, '')), '');
  email_q text := nullif(trim(coalesce(p_email, '')), '');
  name_q text := nullif(trim(coalesce(p_name, '')), '');
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

  if phone_q is null and email_q is null and name_q is null then
    raise exception 'Enter a phone number, email, or name to search';
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
    and (
      (
        phone_q is not null
        and (
          coalesce(p.phone, '') ilike '%' || phone_q || '%'
          or coalesce(p.whatsapp, '') ilike '%' || phone_q || '%'
        )
      )
      or (
        email_q is not null
        and p.email ilike '%' || email_q || '%'
      )
      or (
        name_q is not null
        and p.full_name ilike '%' || name_q || '%'
      )
    )
  order by p.full_name
  limit 50;
end;
$$;

revoke all on function public.search_discoverable_teachers_for_academy(
  uuid, text, text, text
) from public, anon;
grant execute on function public.search_discoverable_teachers_for_academy(
  uuid, text, text, text
) to authenticated;
