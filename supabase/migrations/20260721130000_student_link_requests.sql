-- School/academy invite a student; student must accept before linking.

create table if not exists public.student_link_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  student_profile_id uuid not null references public.profiles (id) on delete cascade,
  batch_id uuid references public.batches (id) on delete set null,
  status text not null default 'requested'
    check (status in ('requested', 'accepted', 'rejected')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create unique index if not exists student_link_requests_pending_unique
  on public.student_link_requests (student_profile_id, organization_id)
  where status = 'requested';

create index if not exists student_link_requests_student_idx
  on public.student_link_requests (student_profile_id, status);

create index if not exists student_link_requests_org_idx
  on public.student_link_requests (organization_id, status);

alter table public.student_link_requests enable row level security;

create policy "Student link requests: student or org admin read"
  on public.student_link_requests for select to authenticated
  using (
    student_profile_id = auth.uid()
    or private.is_org_admin(organization_id)
    or private.is_superadmin()
  );

create policy "Student link requests: org admin create"
  on public.student_link_requests for insert to authenticated
  with check (
    private.is_org_admin(organization_id)
    or private.is_superadmin()
  );

create policy "Student link requests: org admin cancel pending"
  on public.student_link_requests for update to authenticated
  using (
    private.is_org_admin(organization_id)
    or private.is_superadmin()
  )
  with check (
    private.is_org_admin(organization_id)
    or private.is_superadmin()
  );

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
begin
  select * into req
  from public.student_link_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request not found';
  end if;

  if req.student_profile_id <> auth.uid() and not private.is_superadmin() then
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
      req.student_profile_id,
      req.organization_id,
      req.batch_id
    )
    on conflict (student_profile_id, organization_id) do update
      set batch_id = coalesce(excluded.batch_id, public.student_links.batch_id);

    perform public.enroll_student_into_org_assigned_classes(
      req.student_profile_id,
      req.organization_id
    );

    update public.student_link_requests
    set status = 'accepted', responded_at = now()
    where id = req.id
    returning * into req;
  else
    update public.student_link_requests
    set status = 'rejected', responded_at = now()
    where id = req.id
    returning * into req;
  end if;

  return req;
end;
$$;

revoke all on function public.respond_to_student_link_request(uuid, boolean) from public, anon;
grant execute on function public.respond_to_student_link_request(uuid, boolean) to authenticated;
