-- Allow one-time role claim during signup window (OAuth callback with ?role=...)
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

  -- One-time role selection within 15 minutes of account creation
  if old.onboarding_completed = false
     and old.created_at > now() - interval '15 minutes'
     and old.role = 'student'::public.app_role
     and new.role in (
       'teacher'::public.app_role,
       'student'::public.app_role,
       'school_admin'::public.app_role,
       'academy_admin'::public.app_role
     )
  then
    -- Allow matching pending approval when claiming institution/teacher roles
    if new.approval_status is distinct from old.approval_status then
      if new.role in (
           'teacher'::public.app_role,
           'school_admin'::public.app_role,
           'academy_admin'::public.app_role
         )
         and new.approval_status = 'pending'::public.approval_status
      then
        return new;
      end if;
      if new.role = 'student'::public.app_role
         and new.approval_status = 'approved'::public.approval_status
      then
        return new;
      end if;
      raise exception 'Cannot change approval status';
    end if;
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

revoke all on function public.protect_profile_privileged_fields() from public, anon, authenticated;
