-- These tables are backend-only. Keep student/payment records and the
-- question-bank backup inaccessible to public API roles; Edge Functions use service_role.
do $$
declare t text;
begin
  foreach t in array array[
    'payment_transactions',
    'engr_ero_portal_sessions',
    'engr_ero_video_progress',
    'engr_ero_lecture_presentations',
    'ela401_experiment_submissions',
    'ela301_old_questions_backup_20261124'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

revoke all privileges on table
  public.payment_transactions,
  public.engr_ero_portal_sessions,
  public.engr_ero_video_progress,
  public.engr_ero_lecture_presentations,
  public.ela401_experiment_submissions,
  public.ela301_old_questions_backup_20261124
from public, anon, authenticated;

grant all privileges on table
  public.payment_transactions,
  public.engr_ero_portal_sessions,
  public.engr_ero_video_progress,
  public.engr_ero_lecture_presentations,
  public.ela401_experiment_submissions,
  public.ela301_old_questions_backup_20261124
to service_role;