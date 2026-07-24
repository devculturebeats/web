-- Threaded messages on class teaching requests and academy membership invites.

create table if not exists public.class_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.class_requests (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0 and char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists class_request_messages_request_idx
  on public.class_request_messages (request_id, created_at);

alter table public.class_request_messages enable row level security;

create or replace function private.can_access_class_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.class_requests cr
    join public.classes c on c.id = cr.class_id
    join public.teachers t on t.id = cr.teacher_id
    where cr.id = p_request_id
      and (
        t.profile_id = auth.uid()
        or private.is_org_admin(c.organization_id)
        or private.is_superadmin()
        or c.created_by = auth.uid()
      )
  );
$$;

create or replace function private.class_request_is_open(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.class_requests cr
    where cr.id = p_request_id
      and cr.status = 'requested'
  );
$$;

create policy "Class request messages: parties read"
  on public.class_request_messages for select to authenticated
  using (private.can_access_class_request(request_id));

create policy "Class request messages: parties insert while open"
  on public.class_request_messages for insert to authenticated
  with check (
    author_id = auth.uid()
    and private.can_access_class_request(request_id)
    and private.class_request_is_open(request_id)
  );

create table if not exists public.teacher_link_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.teacher_link_requests (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0 and char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists teacher_link_request_messages_request_idx
  on public.teacher_link_request_messages (request_id, created_at);

alter table public.teacher_link_request_messages enable row level security;

create or replace function private.can_access_teacher_link_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.teacher_link_requests r
    left join public.profiles p on p.id = auth.uid()
    where r.id = p_request_id
      and (
        r.teacher_profile_id = auth.uid()
        or lower(r.teacher_email) = lower(coalesce(p.email, ''))
        or private.is_org_admin(r.organization_id)
        or private.is_superadmin()
      )
  );
$$;

create or replace function private.teacher_link_request_is_open(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.teacher_link_requests r
    where r.id = p_request_id
      and r.status = 'requested'
  );
$$;

create policy "Teacher link messages: parties read"
  on public.teacher_link_request_messages for select to authenticated
  using (private.can_access_teacher_link_request(request_id));

create policy "Teacher link messages: parties insert while open"
  on public.teacher_link_request_messages for insert to authenticated
  with check (
    author_id = auth.uid()
    and private.can_access_teacher_link_request(request_id)
    and private.teacher_link_request_is_open(request_id)
  );

revoke all on function private.can_access_class_request(uuid) from public, anon, authenticated;
revoke all on function private.class_request_is_open(uuid) from public, anon, authenticated;
revoke all on function private.can_access_teacher_link_request(uuid) from public, anon, authenticated;
revoke all on function private.teacher_link_request_is_open(uuid) from public, anon, authenticated;
