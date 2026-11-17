create table if not exists public.engr_ero_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  access_token_hash text not null unique,
  session_token_hash text unique,
  purpose text not null check (purpose in ('LESSON', 'EXAM')),
  student_id uuid not null references public.students(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  lesson_order integer,
  payload_json jsonb not null default '{}'::jsonb,
  otp_hash text,
  otp_expires_at timestamptz,
  otp_sent_at timestamptz,
  otp_attempts integer not null default 0,
  redeemed_at timestamptz,
  device_hash text,
  attempt_id uuid references public.exam_attempts(id) on delete set null,
  started_at timestamptz,
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists engr_ero_portal_sessions_student_course_idx
  on public.engr_ero_portal_sessions (student_id, course_id, created_at desc);

create index if not exists engr_ero_portal_sessions_expiry_idx
  on public.engr_ero_portal_sessions (expires_at);

alter table public.engr_ero_portal_sessions enable row level security;
revoke all on table public.engr_ero_portal_sessions from public, anon, authenticated;
grant all on table public.engr_ero_portal_sessions to service_role;
