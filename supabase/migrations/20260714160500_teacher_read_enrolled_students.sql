-- Allow teachers to read basic profile info for enrolled students (attendance UI)
create policy "Profiles: teachers read enrolled students"
  on public.profiles for select to authenticated
  using (
    exists (
      select 1
      from public.class_enrollments e
      join public.classes c on c.id = e.class_id
      join public.teachers t on t.id = c.teacher_id
      where e.student_profile_id = profiles.id
        and t.profile_id = auth.uid()
    )
  );

-- Allow org admins to look up students by reading student-role profiles (email link)
create policy "Profiles: org admins read students"
  on public.profiles for select to authenticated
  using (
    role = 'student'
    and private.current_role() in ('school_admin', 'academy_admin', 'superadmin')
  );
