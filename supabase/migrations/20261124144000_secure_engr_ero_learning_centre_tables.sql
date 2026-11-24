-- Extend the active-admin boundary to the complete Learning Centre content,
-- examination configuration, attendance and teaching-material tables.
-- Student and WhatsApp flows read these through service-role Edge Functions.
do $$
declare
  t text;
  p record;
begin
  foreach t in array array['attendance','bot_activity','bot_activity_log','course_exam_config','course_lessons','course_materials','course_revisions','course_settings','courses','exam_answers','exams','lesson_materials','lesson_media','lesson_practice_questions','lesson_sections'] loop
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

revoke all privileges on table public.attendance,
  public.bot_activity,
  public.bot_activity_log,
  public.course_exam_config,
  public.course_lessons,
  public.course_materials,
  public.course_revisions,
  public.course_settings,
  public.courses,
  public.exam_answers,
  public.exams,
  public.lesson_materials,
  public.lesson_media,
  public.lesson_practice_questions,
  public.lesson_sections
from public, anon, authenticated;

grant select, insert, update, delete on table public.attendance,
  public.bot_activity,
  public.bot_activity_log,
  public.course_exam_config,
  public.course_lessons,
  public.course_materials,
  public.course_revisions,
  public.course_settings,
  public.courses,
  public.exam_answers,
  public.exams,
  public.lesson_materials,
  public.lesson_media,
  public.lesson_practice_questions,
  public.lesson_sections
to authenticated;

grant all privileges on table public.attendance,
  public.bot_activity,
  public.bot_activity_log,
  public.course_exam_config,
  public.course_lessons,
  public.course_materials,
  public.course_revisions,
  public.course_settings,
  public.courses,
  public.exam_answers,
  public.exams,
  public.lesson_materials,
  public.lesson_media,
  public.lesson_practice_questions,
  public.lesson_sections
to service_role;