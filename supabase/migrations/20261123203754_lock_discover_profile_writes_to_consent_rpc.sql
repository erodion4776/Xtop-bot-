-- Profile writes must go through the consent-auditing RPC, not direct client table updates.
revoke insert, update, delete on public.sabi_discover_customer_profiles from anon, authenticated, public;
grant select on public.sabi_discover_customer_profiles to authenticated;
drop policy if exists "Customers create own Discover profile" on public.sabi_discover_customer_profiles;
drop policy if exists "Customers update own Discover profile" on public.sabi_discover_customer_profiles;