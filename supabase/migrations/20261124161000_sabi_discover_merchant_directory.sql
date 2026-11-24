-- Public directory of merchants who have published a Sabi Discover storefront.
-- Returns public shop details and the connected WhatsApp display number only.
create or replace function public.sabi_get_public_marketplace_merchants(
  p_search text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table(
  merchant_id uuid,
  business_name text,
  business_slug text,
  business_logo text,
  industry text,
  seller_rating numeric,
  seller_review_count bigint,
  product_count bigint,
  business_whatsapp text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    t.id,
    coalesce(t.business_name,t.name),
    t.slug,
    t.logo_url,
    t.industry,
    coalesce(rv.avg_rating,0)::numeric(3,2),
    coalesce(rv.review_count,0)::bigint,
    coalesce(pc.product_count,0)::bigint,
    (
      select twa.display_phone_number
      from public.tenant_whatsapp_accounts twa
      where twa.tenant_id=t.id
        and twa.is_active=true
        and nullif(trim(twa.display_phone_number),'') is not null
      order by twa.created_at desc
      limit 1
    )
  from public.tenants t
  join public.sabi_marketplace_settings ms
    on ms.tenant_id=t.id and ms.is_published=true
  left join lateral (
    select avg(r.rating)::numeric(3,2) avg_rating,count(*)::bigint review_count
    from public.sabi_seller_reviews r where r.tenant_id=t.id
  ) rv on true
  left join lateral (
    select count(*)::bigint product_count
    from public.products p
    where p.tenant_id=t.id and p.status='ACTIVE'
      and p.is_active=true and p.price is not null and p.stock_quantity>0
  ) pc on true
  where t.is_active=true and t.is_system=false and t.slug is not null
    and coalesce(pc.product_count,0)>0
    and (
      nullif(trim(coalesce(p_search,'')),'') is null
      or coalesce(t.business_name,t.name,'') ilike '%'||trim(p_search)||'%'
      or coalesce(t.industry,'') ilike '%'||trim(p_search)||'%'
    )
  order by coalesce(pc.product_count,0) desc,coalesce(rv.avg_rating,0) desc,t.created_at desc
  limit greatest(1,least(coalesce(p_limit,24),50))
  offset greatest(0,coalesce(p_offset,0));
$function$;

revoke all on function public.sabi_get_public_marketplace_merchants(text,integer,integer) from public;
grant execute on function public.sabi_get_public_marketplace_merchants(text,integer,integer) to anon,authenticated;
