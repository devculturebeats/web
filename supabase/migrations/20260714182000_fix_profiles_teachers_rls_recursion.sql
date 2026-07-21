-- Break RLS cycles profiles <-> teachers via security definer helpers

create or replace function private.is_approved_onboarded_teacher(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.role = 'teacher'
      and p.approval_status = 'approved'
      and p.onboarding_completed = true
  );
$$;

create or replace function private.teacher_teaches_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.class_enrollments e
    join public.classes c on c.id = e.class_id
    join public.teachers t on t.id = c.teacher_id
    where e.student_profile_id = p_student_id
      and t.profile_id = auth.uid()
  );
$$;

drop policy if exists "Profiles: teachers read enrolled students" on public.profiles;
create policy "Profiles: teachers read enrolled students"
  on public.profiles for select to authenticated
  using (private.teacher_teaches_student(id));

drop policy if exists "Teachers: approved visible" on public.teachers;
create policy "Teachers: approved visible"
  on public.teachers for select to authenticated
  using (private.is_approved_onboarded_teacher(profile_id));

drop policy if exists "Availability: approved teachers readable" on public.teacher_availability;
create policy "Availability: approved teachers readable"
  on public.teacher_availability for select to authenticated
  using (
    private.is_approved_onboarded_teacher(
      (select t.profile_id from public.teachers t where t.id = teacher_availability.teacher_id)
    )
  );
