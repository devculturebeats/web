-- Allow inviting students by email before they create an account.

alter table public.student_link_requests
  add column if not exists student_email text;

update public.student_link_requests r
set student_email = lower(p.email)
from public.profiles p
where r.student_profile_id = p.id
  and (r.student_email is null or r.student_email = '');

alter table public.student_link_requests
  alter column student_profile_id drop not null;

alter table public.student_link_requests
  alter column student_email set not null;

drop index if exists public.student_link_requests_pending_unique;

create unique index student_link_requests_pending_email_unique
  on public.student_link_requests (organization_id, lower(student_email))
  where status = 'requested';

drop policy if exists "Student link requests: student or org admin read" on public.student_link_requests;
create policy "Student link requests: student or org admin read"
  on public.student_link_requests for select to authenticated
  using (
    student_profile_id = auth.uid()
    or private.is_org_admin(organization_id)
    or private.is_superadmin()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'student'
        and lower(p.email) = lower(student_link_requests.student_email)
    )
  );

-- Attach open invites to the student once they have an account.
create or replace function public.claim_student_link_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  updated_count integer;
begin
  select lower(email) into v_email
  from public.profiles
  where id = auth.uid()
    and role = 'student';

  if v_email is null then
    return 0;
  end if;

  update public.student_link_requests
  set student_profile_id = auth.uid()
  where status = 'requested'
    and student_profile_id is null
    and lower(student_email) = v_email;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.claim_student_link_invites() from public, anon;
grant execute on function public.claim_student_link_invites() to authenticated;

create or replace function public.respond_to_student_link_request(
  p_request_id uuid,
  p_accept boolean
)
returns public.student_link_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  req public.student_link_requests;
  v_email text;
begin
  select lower(email) into v_email
  from public.profiles
  where id = auth.uid()
    and role = 'student';

  -- Claim email-only invites for this student first.
  if v_email is not null then
    update public.student_link_requests
    set student_profile_id = auth.uid()
    where status = 'requested'
      and student_profile_id is null
      and lower(student_email) = v_email;
  end if;

  select * into req
  from public.student_link_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request not found';
  end if;

  if req.student_profile_id is distinct from auth.uid()
     and not private.is_superadmin() then
    raise exception 'Not allowed';
  end if;

  if req.status <> 'requested' then
    raise exception 'Request already responded';
  end if;

  if p_accept then
    insert into public.student_links (
      student_profile_id,
      organization_id,
      batch_id
    )
    values (
      auth.uid(),
      req.organization_id,
      req.batch_id
    )
    on conflict (student_profile_id, organization_id) do update
      set batch_id = coalesce(excluded.batch_id, public.student_links.batch_id);

    perform public.enroll_student_into_org_assigned_classes(
      auth.uid(),
      req.organization_id
    );

    update public.student_link_requests
    set
      status = 'accepted',
      student_profile_id = auth.uid(),
      responded_at = now()
    where id = req.id
    returning * into req;
  else
    update public.student_link_requests
    set
      status = 'rejected',
      student_profile_id = coalesce(student_profile_id, auth.uid()),
      responded_at = now()
    where id = req.id
    returning * into req;
  end if;

  return req;
end;
$$;

revoke all on function public.respond_to_student_link_request(uuid, boolean) from public, anon;
grant execute on function public.respond_to_student_link_request(uuid, boolean) to authenticated;
