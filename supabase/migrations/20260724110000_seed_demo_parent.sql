-- Demo parent account linked to student@culturebeats.test (Meera)
-- Password: Test1234!
-- Email: parent@culturebeats.test

do $$
declare
  pwd text := extensions.crypt('Test1234!', extensions.gen_salt('bf'));
  u_parent uuid := 'dddddddd-dddd-dddd-dddd-ddddddddddd1';
  u_student uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  inst uuid;
begin
  select id into inst from auth.instances limit 1;
  if inst is null then
    inst := '00000000-0000-0000-0000-000000000000';
  end if;

  delete from public.parent_student_links where parent_profile_id = u_parent;
  delete from public.parent_link_requests
    where parent_profile_id = u_parent
       or lower(coalesce(parent_email, '')) = 'parent@culturebeats.test';
  delete from auth.identities where user_id = u_parent;
  delete from auth.users where id = u_parent or email = 'parent@culturebeats.test';

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) values (
    inst, u_parent, 'authenticated', 'authenticated', 'parent@culturebeats.test', pwd,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"parent","full_name":"Asha Parent"}'::jsonb,
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    u_parent,
    jsonb_build_object('sub', u_parent::text, 'email', 'parent@culturebeats.test'),
    'email',
    u_parent::text,
    now(), now(), now()
  );

  update public.profiles
  set
    role = 'parent',
    approval_status = 'approved',
    onboarding_completed = true,
    full_name = 'Asha Parent',
    email = 'parent@culturebeats.test'
  where id = u_parent;

  if not found then
    insert into public.profiles (
      id, email, full_name, role, approval_status, onboarding_completed
    ) values (
      u_parent, 'parent@culturebeats.test', 'Asha Parent', 'parent', 'approved', true
    );
  end if;

  insert into public.parent_student_links (
    parent_profile_id, student_profile_id, created_by
  ) values (
    u_parent, u_student, u_parent
  )
  on conflict do nothing;
end $$;
