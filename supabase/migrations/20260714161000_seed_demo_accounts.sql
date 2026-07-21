-- Seed demo users + sample ecosystem data
-- Password for all accounts: Test1234!

create extension if not exists pgcrypto with schema extensions;

-- Fixed UUIDs for demo accounts
-- admin:    aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- teacher1: bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1
-- teacher2: bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2
-- school:   cccccccc-cccc-cccc-cccc-ccccccccccc1
-- academy:  cccccccc-cccc-cccc-cccc-ccccccccccc2
-- student:  dddddddd-dddd-dddd-dddd-dddddddddddd

do $$
declare
  pwd text := extensions.crypt('Test1234!', extensions.gen_salt('bf'));
  u_admin uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  u_t1 uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
  u_t2 uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2';
  u_school uuid := 'cccccccc-cccc-cccc-cccc-ccccccccccc1';
  u_academy uuid := 'cccccccc-cccc-cccc-cccc-ccccccccccc2';
  u_student uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  inst uuid;
  t1_id uuid;
  t2_id uuid;
  school_org uuid := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1';
  academy_org uuid := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2';
  batch_id uuid;
  class_req_id uuid;
  class_market_id uuid;
  class_assigned_id uuid;
  sess_id uuid;
begin
  select id into inst from auth.instances limit 1;
  if inst is null then
    inst := '00000000-0000-0000-0000-000000000000';
  end if;

  -- Clean prior seed (idempotent-ish)
  delete from auth.users where id in (u_admin, u_t1, u_t2, u_school, u_academy, u_student);

  -- Helper local function via repeated inserts
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) values
    (inst, u_admin, 'authenticated', 'authenticated', 'admin@culturebeats.test', pwd,
      now(), '{"provider":"email","providers":["email"]}',
      '{"role":"student","full_name":"Platform Admin"}', now(), now(), '', '', '', ''),
    (inst, u_t1, 'authenticated', 'authenticated', 'teacher1@culturebeats.test', pwd,
      now(), '{"provider":"email","providers":["email"]}',
      '{"role":"teacher","full_name":"Ananya Rao"}', now(), now(), '', '', '', ''),
    (inst, u_t2, 'authenticated', 'authenticated', 'teacher2@culturebeats.test', pwd,
      now(), '{"provider":"email","providers":["email"]}',
      '{"role":"teacher","full_name":"Kabir Mehta"}', now(), now(), '', '', '', ''),
    (inst, u_school, 'authenticated', 'authenticated', 'school@culturebeats.test', pwd,
      now(), '{"provider":"email","providers":["email"]}',
      '{"role":"school_admin","full_name":"Priya School Admin"}', now(), now(), '', '', '', ''),
    (inst, u_academy, 'authenticated', 'authenticated', 'academy@culturebeats.test', pwd,
      now(), '{"provider":"email","providers":["email"]}',
      '{"role":"academy_admin","full_name":"Rohan Academy Admin"}', now(), now(), '', '', '', ''),
    (inst, u_student, 'authenticated', 'authenticated', 'student@culturebeats.test', pwd,
      now(), '{"provider":"email","providers":["email"]}',
      '{"role":"student","full_name":"Meera Student"}', now(), now(), '', '', '', '');

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  )
  select
    gen_random_uuid(),
    u.id,
    jsonb_build_object('sub', u.id::text, 'email', u.email),
    'email',
    u.id::text,
    now(),
    now(),
    now()
  from auth.users u
  where u.id in (u_admin, u_t1, u_t2, u_school, u_academy, u_student);

  -- Bypass privileged-field trigger (auth.uid() is null in seed context)
  alter table public.profiles disable trigger profiles_protect_privileged;

  -- Promote / complete profiles created by trigger
  update public.profiles set
    role = 'superadmin',
    approval_status = 'approved',
    onboarding_completed = true,
    full_name = 'Platform Admin',
    phone = '9000000001'
  where id = u_admin;

  update public.profiles set
    role = 'teacher',
    approval_status = 'approved',
    onboarding_completed = true,
    full_name = 'Ananya Rao',
    phone = '9000000002'
  where id = u_t1;

  update public.profiles set
    role = 'teacher',
    approval_status = 'pending',
    onboarding_completed = true,
    full_name = 'Kabir Mehta',
    phone = '9000000003'
  where id = u_t2;

  update public.profiles set
    role = 'school_admin',
    approval_status = 'approved',
    onboarding_completed = true,
    full_name = 'Priya School Admin',
    phone = '9000000004'
  where id = u_school;

  update public.profiles set
    role = 'academy_admin',
    approval_status = 'approved',
    onboarding_completed = true,
    full_name = 'Rohan Academy Admin',
    phone = '9000000005'
  where id = u_academy;

  update public.profiles set
    role = 'student',
    approval_status = 'approved',
    onboarding_completed = true,
    full_name = 'Meera Student',
    phone = '9000000006'
  where id = u_student;

  alter table public.profiles enable trigger profiles_protect_privileged;

  -- Ensure teacher rows (trigger may have created for t1/t2)
  insert into public.teachers (profile_id, primary_skill, secondary_skills, years_of_experience, bio, city, area)
  values
    (u_t1, 'Dance', array['Folk Arts'], 8, 'Bharatanatyam and contemporary folk fusion.', 'Bengaluru', 'Indiranagar'),
    (u_t2, 'Singing', array['Instrument'], 5, 'Classical vocal coach.', 'Bengaluru', 'Jayanagar')
  on conflict (profile_id) do update set
    primary_skill = excluded.primary_skill,
    secondary_skills = excluded.secondary_skills,
    years_of_experience = excluded.years_of_experience,
    bio = excluded.bio,
    city = excluded.city,
    area = excluded.area;

  select id into t1_id from public.teachers where profile_id = u_t1;
  select id into t2_id from public.teachers where profile_id = u_t2;

  delete from public.teacher_availability where teacher_id in (t1_id, t2_id);
  insert into public.teacher_availability (teacher_id, day_of_week, start_time, end_time) values
    (t1_id, 1, '16:00', '19:00'), -- Mon
    (t1_id, 3, '16:00', '19:00'), -- Wed
    (t1_id, 5, '10:00', '12:00'), -- Fri
    (t2_id, 2, '17:00', '20:00'),
    (t2_id, 4, '17:00', '20:00');

  -- Organizations
  insert into public.organizations (id, type, name, description, city, area, approval_status, created_by)
  values
    (school_org, 'school', 'Horizon Public School', 'K-12 school with strong arts program.', 'Bengaluru', 'Koramangala', 'approved', u_school),
    (academy_org, 'academy', 'Nritya Studio Academy', 'Open cultural arts academy.', 'Bengaluru', 'HSR Layout', 'approved', u_academy)
  on conflict (id) do update set
    approval_status = 'approved',
    name = excluded.name;

  insert into public.organization_members (organization_id, profile_id, member_role)
  values
    (school_org, u_school, 'admin'),
    (academy_org, u_academy, 'admin')
  on conflict (organization_id, profile_id) do nothing;

  insert into public.batches (organization_id, name, description)
  values (school_org, 'Grade 7 Arts', 'Weekly cultural arts for grade 7')
  returning id into batch_id;

  insert into public.student_links (student_profile_id, organization_id, batch_id)
  values (u_student, school_org, batch_id)
  on conflict (student_profile_id, organization_id) do update set batch_id = excluded.batch_id;

  insert into public.student_links (student_profile_id, organization_id)
  values (u_student, academy_org)
  on conflict (student_profile_id, organization_id) do nothing;

  -- Pending class request for teacher1 (school initiated)
  insert into public.classes (
    id, organization_id, batch_id, title, skill, status, enrollment_mode, created_by, starts_at, ends_at
  ) values (
    'ffffffff-ffff-ffff-ffff-fffffffffff1',
    school_org, batch_id, 'Bharatanatyam Foundations', 'Dance', 'requested', 'assigned', u_school,
    null, null
  )
  on conflict (id) do nothing;

  insert into public.class_requests (class_id, teacher_id, status, message)
  values (
    'ffffffff-ffff-ffff-ffff-fffffffffff1',
    t1_id,
    'requested',
    'Looking for a Monday 5–7 PM dance teacher for Grade 7.'
  )
  on conflict (class_id, teacher_id) do update set status = 'requested', message = excluded.message;

  -- Marketplace academy class already scheduled with teacher1
  insert into public.classes (
    id, organization_id, teacher_id, title, skill, status, enrollment_mode, created_by,
    is_recurring, starts_at, ends_at
  ) values (
    'ffffffff-ffff-ffff-ffff-fffffffffff2',
    academy_org, t1_id, 'Evening Folk Dance Lab', 'Dance', 'scheduled', 'self_enroll', u_academy,
    true,
    date_trunc('week', now()) + interval '1 day' + interval '18 hours',
    date_trunc('week', now()) + interval '1 day' + interval '19 hours 30 minutes'
  )
  on conflict (id) do update set teacher_id = excluded.teacher_id, status = 'scheduled';

  insert into public.class_sessions (class_id, starts_at, ends_at, status)
  select
    'ffffffff-ffff-ffff-ffff-fffffffffff2',
    date_trunc('week', now()) + interval '1 day' + interval '18 hours' + make_interval(weeks => g),
    date_trunc('week', now()) + interval '1 day' + interval '19 hours 30 minutes' + make_interval(weeks => g),
    'scheduled'
  from generate_series(0, 3) as g
  where not exists (
    select 1 from public.class_sessions cs
    where cs.class_id = 'ffffffff-ffff-ffff-ffff-fffffffffff2'
  );

  -- Assigned school class already accepted for history
  insert into public.classes (
    id, organization_id, batch_id, teacher_id, title, skill, status, enrollment_mode, created_by,
    starts_at, ends_at
  ) values (
    'ffffffff-ffff-ffff-ffff-fffffffffff3',
    school_org, batch_id, t1_id, 'Music Appreciation', 'Singing', 'scheduled', 'assigned', u_school,
    date_trunc('week', now()) + interval '3 days' + interval '16 hours',
    date_trunc('week', now()) + interval '3 days' + interval '17 hours'
  )
  on conflict (id) do update set teacher_id = excluded.teacher_id, status = 'scheduled';

  insert into public.class_enrollments (class_id, student_profile_id, source)
  values
    ('ffffffff-ffff-ffff-ffff-fffffffffff3', u_student, 'school'),
    ('ffffffff-ffff-ffff-ffff-fffffffffff2', u_student, 'self')
  on conflict (class_id, student_profile_id) do nothing;

  insert into public.class_sessions (class_id, starts_at, ends_at, status)
  select
    'ffffffff-ffff-ffff-ffff-fffffffffff3',
    date_trunc('week', now()) + interval '3 days' + interval '16 hours',
    date_trunc('week', now()) + interval '3 days' + interval '17 hours',
    'scheduled'
  where not exists (
    select 1 from public.class_sessions where class_id = 'ffffffff-ffff-ffff-ffff-fffffffffff3'
  );

end $$;
