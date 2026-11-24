-- Secure the Engr. Ero Learning Centre administrative tables.
-- Student-facing access remains through the service-role-backed portal Edge Function.
-- The Android admin app signs in with Supabase Auth and checks admin_memberships.

do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'students','course_questions','exam_attempts','results',
    'student_courses','student_course_access','course_modules','module_slides'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    for p in
      select policyname from pg_policies
      where schemaname='public' and tablename=t
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
    execute format(
      'create policy xtop_admin_only on public.%I for all to authenticated using (
        exists (
          select 1 from public.admin_memberships m
          where m.user_id = (select auth.uid()) and m.is_active = true
        )
      ) with check (
        exists (
          select 1 from public.admin_memberships m
          where m.user_id = (select auth.uid()) and m.is_active = true
        )
      )', t
    );
  end loop;
end $$;

revoke all privileges on table
  public.students,
  public.course_questions,
  public.exam_attempts,
  public.results,
  public.student_courses,
  public.student_course_access,
  public.course_modules,
  public.module_slides
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.students,
  public.course_questions,
  public.exam_attempts,
  public.results,
  public.student_courses,
  public.student_course_access,
  public.course_modules,
  public.module_slides
to authenticated;

grant all privileges on table
  public.students,
  public.course_questions,
  public.exam_attempts,
  public.results,
  public.student_courses,
  public.student_course_access,
  public.course_modules,
  public.module_slides
to service_role;
