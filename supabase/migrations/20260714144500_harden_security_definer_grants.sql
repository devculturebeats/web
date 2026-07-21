-- Harden function grants and search_path; tighten avatar listing

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.protect_profile_privileged_fields() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.teacher_needs_onboarding() from public, anon;
grant execute on function public.teacher_needs_onboarding() to authenticated;

drop policy if exists "Avatar images are publicly accessible" on storage.objects;

create policy "Avatar images readable by path owners and public object URLs"
  on storage.objects for select
  using (
    bucket_id = 'avatars'
    and (
      auth.role() = 'authenticated'
      and (storage.foldername(name))[1] = auth.uid()::text
      or private.is_superadmin()
    )
  );
