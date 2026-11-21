-- Lock down platform audit history. Trusted Edge Functions use service_role.
drop policy if exists allow_audit_all on public.audit_logs;
drop policy if exists audit_logs_admin_read on public.audit_logs;
revoke all on table public.audit_logs from anon;
revoke insert, update, delete, truncate, references, trigger on table public.audit_logs from authenticated;
grant select on table public.audit_logs to authenticated;
create policy audit_logs_admin_read
on public.audit_logs
for select
to authenticated
using (
  exists (
    select 1 from public.admin_memberships am
    where am.user_id = (select auth.uid())
      and am.is_active = true
      and am.role in ('SUPER_ADMIN', 'ADMIN')
  )
);
