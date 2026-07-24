-- Pending / rejected teachers must not manage availability (URL or API bypass).
drop policy if exists "Availability: owner manage" on public.teacher_availability;

create policy "Availability: approved owner manage"
  on public.teacher_availability for all to authenticated
  using (
    private.is_superadmin()
    or (
      private.owns_teacher(teacher_id)
      and private.is_approved_onboarded_teacher(auth.uid())
    )
  )
  with check (
    private.is_superadmin()
    or (
      private.owns_teacher(teacher_id)
      and private.is_approved_onboarded_teacher(auth.uid())
    )
  );
