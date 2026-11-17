alter table public.engr_ero_portal_sessions
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null;
