create or replace function public.mark_learning_lesson_complete(
  p_student_course_id uuid,
  p_lesson_id uuid,
  p_lesson_order integer
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.student_courses
  set progress = jsonb_set(
    jsonb_set(
      coalesce(progress, '{}'::jsonb),
      '{completed_lessons}',
      case
        when coalesce(progress->'completed_lessons', '[]'::jsonb) @> jsonb_build_array(p_lesson_id::text)
          then case when jsonb_typeof(progress->'completed_lessons') = 'array'
            then progress->'completed_lessons' else '[]'::jsonb end
        else
          (case when jsonb_typeof(progress->'completed_lessons') = 'array'
            then coalesce(progress->'completed_lessons', '[]'::jsonb) else '[]'::jsonb end)
          || jsonb_build_array(p_lesson_id::text)
      end,
      true
    ),
    '{last_lesson_order}',
    to_jsonb(greatest(
      coalesce(nullif(progress->>'last_lesson_order', '')::integer, 0),
      coalesce(p_lesson_order, 0)
    )),
    true
  )
  where id = p_student_course_id;

  return found;
end;
$$;

revoke all on function public.mark_learning_lesson_complete(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.mark_learning_lesson_complete(uuid, uuid, integer) to service_role;
