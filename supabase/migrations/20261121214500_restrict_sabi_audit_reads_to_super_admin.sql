
drop policy if exists audit_logs_admin_read on public.audit_logs;
create policy audit_logs_super_admin_read
on public.audit_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_memberships am
    where am.user_id = (select auth.uid())
      and am.is_active = true
      and am.role = 'SUPER_ADMIN'
  )
);
