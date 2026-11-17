alter table public.engr_ero_portal_sessions
  add column if not exists payment_reference text;

create unique index if not exists engr_ero_portal_sessions_payment_reference_uidx
  on public.engr_ero_portal_sessions (payment_reference)
  where payment_reference is not null;
