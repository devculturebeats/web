-- CultureBeats initial schema: roles, profiles, teachers, availability, orgs, classes, RLS

create extension if not exists "pgcrypto";

create schema if not exists private;

create type public.app_role as enum (
  'teacher',
  'student',
  'school_admin',
  'academy_admin',
  'superadmin'
);

create type public.approval_status as enum (
  'pending',
  'approved',
  'rejected'
);

create type public.org_type as enum (
  'school',
  'academy'
);

create type public.class_lifecycle as enum (
  'requested',
  'accepted',
  'rejected',
  'scheduled',
  'postponed',
  'completed',
  'cancelled'
);

create type public.preferred_class_type as enum (
  'school',
  'academy',
  'both'
);

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users) — source of truth for role / approval
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  phone text,
  avatar_url text,
  role public.app_role not null default 'student',
  approval_status public.approval_status not null default 'approved',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);
create index profiles_approval_idx on public.profiles (approval_status);

-- ---------------------------------------------------------------------------
-- Teachers
-- ---------------------------------------------------------------------------
create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  primary_skill text,
  secondary_skills text[] not null default '{}',
  years_of_experience integer check (years_of_experience is null or years_of_experience >= 0),
  bio text,
  qualifications text,
  city text,
  area text,
  preferred_class_types public.preferred_class_type default 'both',
  travel_preference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index teachers_primary_skill_idx on public.teachers (primary_skill);
create index teachers_city_idx on public.teachers (city);

create table public.teacher_documents (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  document_type text not null default 'certificate',
  created_at timestamptz not null default now()
);

create table public.teacher_availability (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_availability_valid_range check (end_time > start_time)
);

create index teacher_availability_teacher_day_idx
  on public.teacher_availability (teacher_id, day_of_week);

-- ---------------------------------------------------------------------------
-- Organizations (schools & academies)
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  type public.org_type not null,
  name text not null,
  description text,
  city text,
  area text,
  logo_url text,
  approval_status public.approval_status not null default 'pending',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  member_role text not null default 'admin',
  created_at timestamptz not null default now(),
  unique (organization_id, profile_id)
);

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.student_links (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  batch_id uuid references public.batches (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (student_profile_id, organization_id)
);

-- ---------------------------------------------------------------------------
-- Classes / requests (MVP skeleton for matching later)
-- ---------------------------------------------------------------------------
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  batch_id uuid references public.batches (id) on delete set null,
  teacher_id uuid references public.teachers (id) on delete set null,
  title text not null,
  skill text,
  status public.class_lifecycle not null default 'requested',
  is_recurring boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  recurrence_rule text,
  enrollment_mode text not null default 'assigned'
    check (enrollment_mode in ('assigned', 'self_enroll')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.class_requests (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  status public.class_lifecycle not null default 'requested',
  message text,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (class_id, teacher_id)
);

create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.class_lifecycle not null default 'scheduled',
  created_at timestamptz not null default now()
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  student_profile_id uuid not null references public.profiles (id) on delete cascade,
  present boolean not null default false,
  marked_by uuid references public.profiles (id) on delete set null,
  marked_at timestamptz not null default now(),
  unique (session_id, student_profile_id)
);

create table public.class_enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  student_profile_id uuid not null references public.profiles (id) on delete cascade,
  source text not null default 'school'
    check (source in ('school', 'academy', 'self')),
  created_at timestamptz not null default now(),
  unique (class_id, student_profile_id)
);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger teachers_set_updated_at
  before update on public.teachers
  for each row execute function public.set_updated_at();

create trigger teacher_availability_set_updated_at
  before update on public.teacher_availability
  for each row execute function public.set_updated_at();

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create trigger batches_set_updated_at
  before update on public.batches
  for each row execute function public.set_updated_at();

create trigger classes_set_updated_at
  before update on public.classes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auth helpers (private schema, security definer)
-- ---------------------------------------------------------------------------
create or replace function private.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid();
$$;

create or replace function private.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'superadmin'
      and p.approval_status = 'approved'
  );
$$;

create or replace function private.owns_teacher(p_teacher_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.teachers t
    where t.id = p_teacher_id
      and t.profile_id = auth.uid()
  );
$$;

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
  );
$$;

-- ---------------------------------------------------------------------------
-- Handle new auth user → profile (+ empty teacher row when applicable)
-- Role from raw_user_meta_data is only used at insert; RLS never trusts JWT meta.
-- ---------------------------------------------------------------------------
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
  if requested_role in ('teacher', 'student', 'school_admin', 'academy_admin') then
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
    false
  );

  if resolved_role = 'teacher' then
    insert into public.teachers (profile_id) values (new.id);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Teacher onboarding gate helper (public, read-only claim for app routing)
-- ---------------------------------------------------------------------------
create or replace function public.teacher_needs_onboarding()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.teachers t on t.profile_id = p.id
    where p.id = auth.uid()
      and p.role = 'teacher'
      and (
        p.onboarding_completed = false
        or coalesce(trim(p.full_name), '') = ''
        or coalesce(trim(p.phone), '') = ''
        or coalesce(trim(t.primary_skill), '') = ''
      )
  );
$$;

grant execute on function public.teacher_needs_onboarding() to authenticated;

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'avatars',
    'avatars',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  ),
  (
    'certificates',
    'certificates',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.teachers enable row level security;
alter table public.teacher_documents enable row level security;
alter table public.teacher_availability enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.batches enable row level security;
alter table public.student_links enable row level security;
alter table public.classes enable row level security;
alter table public.class_requests enable row level security;
alter table public.class_sessions enable row level security;
alter table public.attendance enable row level security;
alter table public.class_enrollments enable row level security;

-- Profiles
create policy "Profiles: users can read own"
  on public.profiles for select to authenticated
  using (id = auth.uid() or private.is_superadmin());

create policy "Profiles: approved teachers visible to authenticated"
  on public.profiles for select to authenticated
  using (
    role = 'teacher'
    and approval_status = 'approved'
    and onboarding_completed = true
  );

create policy "Profiles: users can update own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Lock role / approval_status changes to superadmin only (avoids JWT metadata trust)
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

  if new.role is distinct from old.role then
    raise exception 'Cannot change role';
  end if;

  if new.approval_status is distinct from old.approval_status then
    raise exception 'Cannot change approval status';
  end if;

  return new;
end;
$$;

create trigger profiles_protect_privileged
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_fields();

create policy "Profiles: superadmin full access"
  on public.profiles for all to authenticated
  using (private.is_superadmin())
  with check (private.is_superadmin());

-- Teachers
create policy "Teachers: own read/write"
  on public.teachers for select to authenticated
  using (profile_id = auth.uid() or private.is_superadmin());

create policy "Teachers: approved visible"
  on public.teachers for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = teachers.profile_id
        and p.role = 'teacher'
        and p.approval_status = 'approved'
        and p.onboarding_completed = true
    )
  );

create policy "Teachers: own update"
  on public.teachers for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "Teachers: own insert"
  on public.teachers for insert to authenticated
  with check (profile_id = auth.uid());

create policy "Teachers: superadmin all"
  on public.teachers for all to authenticated
  using (private.is_superadmin())
  with check (private.is_superadmin());

-- Teacher documents
create policy "Teacher docs: owner manage"
  on public.teacher_documents for all to authenticated
  using (private.owns_teacher(teacher_id) or private.is_superadmin())
  with check (private.owns_teacher(teacher_id) or private.is_superadmin());

-- Availability (CRITICAL)
create policy "Availability: owner manage"
  on public.teacher_availability for all to authenticated
  using (private.owns_teacher(teacher_id) or private.is_superadmin())
  with check (private.owns_teacher(teacher_id) or private.is_superadmin());

create policy "Availability: approved teachers readable"
  on public.teacher_availability for select to authenticated
  using (
    exists (
      select 1
      from public.teachers t
      join public.profiles p on p.id = t.profile_id
      where t.id = teacher_availability.teacher_id
        and p.approval_status = 'approved'
        and p.onboarding_completed = true
    )
  );

-- Organizations
create policy "Orgs: members and superadmin read"
  on public.organizations for select to authenticated
  using (
    private.is_superadmin()
    or private.is_org_admin(id)
    or approval_status = 'approved'
  );

create policy "Orgs: creator insert"
  on public.organizations for insert to authenticated
  with check (created_by = auth.uid());

create policy "Orgs: admins update"
  on public.organizations for update to authenticated
  using (private.is_org_admin(id) or private.is_superadmin())
  with check (private.is_org_admin(id) or private.is_superadmin());

create policy "Orgs: superadmin delete"
  on public.organizations for delete to authenticated
  using (private.is_superadmin());

-- Org members
create policy "Org members: read if member or superadmin"
  on public.organization_members for select to authenticated
  using (private.is_org_admin(organization_id) or profile_id = auth.uid() or private.is_superadmin());

create policy "Org members: manage by admin"
  on public.organization_members for all to authenticated
  using (private.is_org_admin(organization_id) or private.is_superadmin())
  with check (private.is_org_admin(organization_id) or private.is_superadmin());

create policy "Org members: self insert on create"
  on public.organization_members for insert to authenticated
  with check (profile_id = auth.uid());

-- Batches
create policy "Batches: org visibility"
  on public.batches for select to authenticated
  using (private.is_org_admin(organization_id) or private.is_superadmin() or true);

create policy "Batches: org admin manage"
  on public.batches for all to authenticated
  using (private.is_org_admin(organization_id) or private.is_superadmin())
  with check (private.is_org_admin(organization_id) or private.is_superadmin());

-- Student links
create policy "Student links: own or org admin"
  on public.student_links for select to authenticated
  using (
    student_profile_id = auth.uid()
    or private.is_org_admin(organization_id)
    or private.is_superadmin()
  );

create policy "Student links: self manage or org admin"
  on public.student_links for all to authenticated
  using (
    student_profile_id = auth.uid()
    or private.is_org_admin(organization_id)
    or private.is_superadmin()
  )
  with check (
    student_profile_id = auth.uid()
    or private.is_org_admin(organization_id)
    or private.is_superadmin()
  );

-- Classes
create policy "Classes: authenticated read approved ecosystem"
  on public.classes for select to authenticated
  using (true);

create policy "Classes: org admin create"
  on public.classes for insert to authenticated
  with check (
    private.is_superadmin()
    or organization_id is null
    or private.is_org_admin(organization_id)
  );

create policy "Classes: org admin or assigned teacher update"
  on public.classes for update to authenticated
  using (
    private.is_superadmin()
    or private.is_org_admin(organization_id)
    or private.owns_teacher(teacher_id)
  )
  with check (
    private.is_superadmin()
    or private.is_org_admin(organization_id)
    or private.owns_teacher(teacher_id)
  );

-- Class requests
create policy "Class requests: teacher or org related"
  on public.class_requests for select to authenticated
  using (
    private.owns_teacher(teacher_id)
    or private.is_superadmin()
    or exists (
      select 1 from public.classes c
      where c.id = class_requests.class_id
        and (private.is_org_admin(c.organization_id) or c.created_by = auth.uid())
    )
  );

create policy "Class requests: create by org"
  on public.class_requests for insert to authenticated
  with check (
    private.is_superadmin()
    or exists (
      select 1 from public.classes c
      where c.id = class_id
        and (private.is_org_admin(c.organization_id) or c.created_by = auth.uid())
    )
  );

create policy "Class requests: teacher respond"
  on public.class_requests for update to authenticated
  using (private.owns_teacher(teacher_id) or private.is_superadmin())
  with check (private.owns_teacher(teacher_id) or private.is_superadmin());

-- Sessions
create policy "Sessions: authenticated read"
  on public.class_sessions for select to authenticated
  using (true);

create policy "Sessions: manage by org or teacher"
  on public.class_sessions for all to authenticated
  using (
    private.is_superadmin()
    or exists (
      select 1 from public.classes c
      where c.id = class_sessions.class_id
        and (private.is_org_admin(c.organization_id) or private.owns_teacher(c.teacher_id))
    )
  )
  with check (
    private.is_superadmin()
    or exists (
      select 1 from public.classes c
      where c.id = class_id
        and (private.is_org_admin(c.organization_id) or private.owns_teacher(c.teacher_id))
    )
  );

-- Attendance
create policy "Attendance: related parties"
  on public.attendance for select to authenticated
  using (
    student_profile_id = auth.uid()
    or private.is_superadmin()
    or exists (
      select 1
      from public.class_sessions s
      join public.classes c on c.id = s.class_id
      where s.id = attendance.session_id
        and (private.owns_teacher(c.teacher_id) or private.is_org_admin(c.organization_id))
    )
  );

create policy "Attendance: teacher mark"
  on public.attendance for all to authenticated
  using (
    private.is_superadmin()
    or exists (
      select 1
      from public.class_sessions s
      join public.classes c on c.id = s.class_id
      where s.id = attendance.session_id
        and private.owns_teacher(c.teacher_id)
    )
  )
  with check (
    private.is_superadmin()
    or exists (
      select 1
      from public.class_sessions s
      join public.classes c on c.id = s.class_id
      where s.id = session_id
        and private.owns_teacher(c.teacher_id)
    )
  );

-- Enrollments
create policy "Enrollments: related parties"
  on public.class_enrollments for select to authenticated
  using (
    student_profile_id = auth.uid()
    or private.is_superadmin()
    or exists (
      select 1 from public.classes c
      where c.id = class_enrollments.class_id
        and (private.is_org_admin(c.organization_id) or private.owns_teacher(c.teacher_id))
    )
  );

create policy "Enrollments: self or org manage"
  on public.class_enrollments for all to authenticated
  using (
    student_profile_id = auth.uid()
    or private.is_superadmin()
    or exists (
      select 1 from public.classes c
      where c.id = class_enrollments.class_id
        and private.is_org_admin(c.organization_id)
    )
  )
  with check (
    student_profile_id = auth.uid()
    or private.is_superadmin()
    or exists (
      select 1 from public.classes c
      where c.id = class_id
        and private.is_org_admin(c.organization_id)
    )
  );

-- Storage policies
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users can upload own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete own avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Certificates: owner read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'certificates'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or private.is_superadmin()
    )
  );

create policy "Certificates: owner upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'certificates'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Certificates: owner update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'certificates'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'certificates'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Certificates: owner delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'certificates'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
