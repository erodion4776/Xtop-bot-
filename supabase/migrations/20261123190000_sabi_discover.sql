-- Sabi Discover: merchant-controlled public product marketplace.
-- Public browsing is served only through the narrow SECURITY DEFINER RPC below.
-- Direct table access remains protected by RLS.

create table if not exists public.sabi_marketplace_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  is_published boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.sabi_marketplace_settings enable row level security;

create or replace function public.sabi_get_public_marketplace_products(
  p_search text default null,
  p_category text default null,
  p_limit integer default 60,
  p_offset integer default 0
)
returns table (
  product_id uuid,
  product_name text,
  product_description text,
  product_category text,
  product_price numeric,
  product_stock integer,
  product_image_url text,
  business_name text,
  business_logo text,
  business_slug text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.name, p.description, p.category, p.price,
         p.stock_quantity, p.image_url,
         coalesce(t.business_name, t.name), t.logo_url, t.slug
  from public.products p
  join public.tenants t on t.id = p.tenant_id
  join public.sabi_marketplace_settings ms on ms.tenant_id = t.id
  where ms.is_published = true
    and p.status = 'ACTIVE'
    and p.is_active = true
    and p.stock_quantity > 0
    and p.tenant_id is not null
    and t.is_active = true
    and t.is_system = false
    and (nullif(trim(coalesce(p_search, '')), '') is null
         or p.name ilike '%' || trim(p_search) || '%'
         or coalesce(p.description, '') ilike '%' || trim(p_search) || '%'
         or coalesce(p.category, '') ilike '%' || trim(p_search) || '%'
         or coalesce(t.business_name, t.name, '') ilike '%' || trim(p_search) || '%')
    and (nullif(trim(coalesce(p_category, '')), '') is null
         or lower(coalesce(p.category, '')) = lower(trim(p_category)))
  order by p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 60), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.sabi_get_merchant_marketplace_status(p_tenant_id uuid)
returns table(is_published boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.sabi_is_active_tenant_member(p_tenant_id) then
    raise exception 'Not authorised to view this merchant marketplace setting';
  end if;
  return query
    select coalesce(ms.is_published, false)
    from (select p_tenant_id as tenant_id) x
    left join public.sabi_marketplace_settings ms on ms.tenant_id = x.tenant_id;
end;
$$;

create or replace function public.sabi_set_merchant_marketplace_visibility(
  p_tenant_id uuid,
  p_is_published boolean
)
returns table(is_published boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.sabi_is_active_tenant_member(p_tenant_id) then
    raise exception 'Not authorised to change this merchant marketplace setting';
  end if;
  if not exists (
    select 1 from public.tenants t
    where t.id = p_tenant_id and t.is_active = true and t.is_system = false
  ) then
    raise exception 'This business cannot be published on Sabi Discover';
  end if;
  insert into public.sabi_marketplace_settings(tenant_id, is_published, updated_at)
  values (p_tenant_id, coalesce(p_is_published, false), now())
  on conflict (tenant_id) do update
    set is_published = excluded.is_published, updated_at = now();
  return query select ms.is_published
    from public.sabi_marketplace_settings ms
    where ms.tenant_id = p_tenant_id;
end;
$$;

revoke all on function public.sabi_get_public_marketplace_products(text,text,integer,integer) from public;
grant execute on function public.sabi_get_public_marketplace_products(text,text,integer,integer) to anon, authenticated;

revoke all on function public.sabi_get_merchant_marketplace_status(uuid) from public, anon;
grant execute on function public.sabi_get_merchant_marketplace_status(uuid) to authenticated;

revoke all on function public.sabi_set_merchant_marketplace_visibility(uuid,boolean) from public, anon;
grant execute on function public.sabi_set_merchant_marketplace_visibility(uuid,boolean) to authenticated;
