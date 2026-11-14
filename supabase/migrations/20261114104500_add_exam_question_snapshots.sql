alter table public.exam_attempts
  add column if not exists questions_snapshot jsonb;
