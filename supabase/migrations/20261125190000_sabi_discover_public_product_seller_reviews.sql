-- Public, read-only seller review feed for Sabi Discover product pages.
-- Reviews are seller-level and only visible while the seller has a published storefront.
create or replace function public.sabi_get_public_product_seller_reviews(p_product_id uuid)
returns table(rating smallint, review_text text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $function$
  select r.rating, r.review_text, r.created_at
  from public.sabi_seller_reviews r
  join public.products p on p.tenant_id = r.tenant_id
  join public.sabi_marketplace_settings ms on ms.tenant_id = r.tenant_id and ms.is_published = true
  join public.tenants t on t.id = r.tenant_id and t.is_active = true and t.is_system = false
  where p.id = p_product_id
    and p.status = 'ACTIVE'
    and p.is_active = true
    and p.price is not null
    and p.stock_quantity > 0
  order by r.created_at desc
  limit 20;
$function$;

revoke all on function public.sabi_get_public_product_seller_reviews(uuid) from public;
grant execute on function public.sabi_get_public_product_seller_reviews(uuid) to anon, authenticated;
