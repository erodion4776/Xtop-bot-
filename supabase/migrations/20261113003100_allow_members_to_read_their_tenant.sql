grant select on table public.tenants to authenticated;

drop policy if exists "Members view own tenant and active system tenant" on public.tenants;

create policy "Members view own tenant and active system tenant"
on public.tenants
for select
to authenticated
using (
  (is_system = true and is_active = true)
  or public.sabi_is_active_tenant_member(id)
);
