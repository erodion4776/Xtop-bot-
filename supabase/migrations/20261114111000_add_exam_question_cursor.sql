alter table public.exam_attempts
  add column if not exists current_question_index integer not null default 0;

update public.exam_attempts
set current_question_index = coalesce(jsonb_array_length(answers_json), 0)
where current_question_index = 0
  and answers_json is not null
  and jsonb_typeof(answers_json) = 'array';
