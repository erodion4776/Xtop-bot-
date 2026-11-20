create table if not exists public.engr_ero_mtm_simulation_results (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  portal_session_id uuid not null references public.engr_ero_portal_sessions(id) on delete cascade,
  experiment_code text not null default 'ELA401-EXP17',
  result_json jsonb not null default '{}'::jsonb,
  elapsed_seconds numeric(10,2) not null default 0,
  accuracy_percent numeric(5,2) not null default 0,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(portal_session_id)
);
create index if not exists engr_ero_mtm_results_student_idx
  on public.engr_ero_mtm_simulation_results(student_id, course_id, completed_at desc);
alter table public.engr_ero_mtm_simulation_results enable row level security;
revoke all on table public.engr_ero_mtm_simulation_results from public, anon, authenticated;
grant all on table public.engr_ero_mtm_simulation_results to service_role;