-- Targeted CBT query-plan cleanup and integrity for the retained ELA301 question backup.
create index if not exists idx_ela401_experiment_submissions_course
  on public.ela401_experiment_submissions (course_id);

alter table public.ela301_old_questions_backup_20261124
  add constraint ela301_old_questions_backup_20261124_pkey primary key (id);

-- Remove only exact duplicate single-column indexes; retain the useful
-- course/status and student/course/created composite indexes.
drop index if exists public.idx_course_questions_course_id;
drop index if exists public.idx_exam_attempts_course_id;
drop index if exists public.idx_exam_attempts_student;
drop index if exists public.idx_exam_attempts_student_id;
drop index if exists public.idx_student_courses_course_id;
drop index if exists public.idx_student_courses_student_id;