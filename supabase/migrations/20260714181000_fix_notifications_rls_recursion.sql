-- Fix notifications RLS recursion when joining recipients ↔ notifications
create or replace function private.is_notification_recipient(p_notification_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.notification_recipients nr
    where nr.notification_id = p_notification_id
      and nr.student_profile_id = auth.uid()
  );
$$;

drop policy if exists "Notifications: recipients can read parent" on public.notifications;
create policy "Notifications: recipients can read parent"
  on public.notifications for select to authenticated
  using (
    private.is_notification_recipient(id)
    or private.is_org_admin(organization_id)
    or private.is_superadmin()
  );
