-- Public, read-only exposure of each merchant's connected WhatsApp bot number.
-- Only the public display number is returned; credentials remain private.
create or replace function public.sabi_get_public_marketplace_products_v3(
  p_search text default null, p_category text default null,
  p_limit integer default 24, p_offset integer default 0,
  p_sort text default 'featured'
)
returns table(
  product_id uuid, product_name text, product_description text,
  product_category text, product_price numeric, product_stock integer,
  product_image_url text, business_name text, business_logo text,
  business_slug text, seller_rating numeric, seller_review_count bigint,
  sold_quantity bigint, business_whatsapp text
)
language sql stable security definer set search_path = ''
as $function$
  select p.product_id,p.product_name,p.product_description,p.product_category,
    p.product_price,p.product_stock,p.product_image_url,p.business_name,
    p.business_logo,p.business_slug,p.seller_rating,p.seller_review_count,
    p.sold_quantity,
    (select twa.display_phone_number
     from public.tenants t
     join public.tenant_whatsapp_accounts twa on twa.tenant_id=t.id
     where t.slug=p.business_slug and t.is_active=true and t.is_system=false
       and twa.is_active=true and nullif(trim(twa.display_phone_number),'') is not null
     order by twa.created_at desc limit 1)
  from public.sabi_get_public_marketplace_products_v2(p_search,p_category,p_limit,p_offset,p_sort) p;
$function$;

create or replace function public.sabi_get_public_storefront_v3(p_slug text)
returns table(
  store_id uuid,business_name text,business_slug text,business_logo text,
  brand_color text,industry text,welcome_greeting text,contact_phone text,
  product_id uuid,product_name text,product_description text,product_category text,
  product_price numeric,product_stock integer,product_image_url text,
  seller_rating numeric,seller_review_count bigint,sold_quantity bigint,
  product_updated_at timestamptz,business_whatsapp text
)
language sql stable security definer set search_path = ''
as $function$
  select s.store_id,s.business_name,s.business_slug,s.business_logo,s.brand_color,
    s.industry,s.welcome_greeting,s.contact_phone,s.product_id,s.product_name,
    s.product_description,s.product_category,s.product_price,s.product_stock,
    s.product_image_url,s.seller_rating,s.seller_review_count,s.sold_quantity,
    s.product_updated_at,
    (select twa.display_phone_number from public.tenant_whatsapp_accounts twa
     where twa.tenant_id=s.store_id and twa.is_active=true
       and nullif(trim(twa.display_phone_number),'') is not null
     order by twa.created_at desc limit 1)
  from public.sabi_get_public_storefront_v2(p_slug) s;
$function$;

revoke all on function public.sabi_get_public_marketplace_products_v3(text,text,integer,integer,text) from public;
grant execute on function public.sabi_get_public_marketplace_products_v3(text,text,integer,integer,text) to anon,authenticated;
revoke all on function public.sabi_get_public_storefront_v3(text) from public;
grant execute on function public.sabi_get_public_storefront_v3(text) to anon,authenticated;
