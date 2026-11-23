create or replace function public.sabi_get_public_marketplace_categories()
returns table(category_name text,product_count bigint)
language sql stable security definer set search_path = '' as $$
  select case
      when lower(coalesce(p.category,'')) like any(array['%fashion%','%cloth%','%wear%','%shoe%','%footwear%','%bag%','%jewel%','%accessor%','%textile%']) then 'Fashion'
      when lower(coalesce(p.category,'')) like any(array['%phone%','%mobile%','%electronic%','%computer%','%laptop%','%tablet%','%camera%','%audio%','%tv%','%gadget%']) then 'Phones & Electronics'
      when lower(coalesce(p.category,'')) like any(array['%home%','%furniture%','%kitchen%','%bedding%','%decor%','%appliance%','%household%','%garden%']) then 'Home & Living'
      when lower(coalesce(p.category,'')) like any(array['%beauty%','%cosmetic%','%makeup%','%skin%','%hair%','%personal care%','%perfume%','%fragrance%']) then 'Beauty & Personal Care'
      when lower(coalesce(p.category,'')) like any(array['%food%','%grocery%','%drink%','%beverage%','%snack%','%farm%','%produce%','%fruit%','%vegetable%']) then 'Food & Groceries'
      when lower(coalesce(p.category,'')) like any(array['%health%','%wellness%','%medical%','%fitness%','%supplement%','%pharmacy%']) then 'Health & Wellness'
      when lower(coalesce(p.category,'')) like any(array['%baby%','%kids%','%children%','%toy%','%maternity%','%school%']) then 'Baby, Kids & Toys'
      when lower(coalesce(p.category,'')) like any(array['%sport%','%outdoor%','%gym%','%camping%']) then 'Sports & Outdoors'
      when lower(coalesce(p.category,'')) like any(array['%auto%','%car%','%vehicle%','%motor%','%spare part%']) then 'Automotive'
      when lower(coalesce(p.category,'')) like any(array['%book%','%education%','%learning%','%stationery%','%course%']) then 'Books & Learning'
      when lower(coalesce(p.category,'')) like any(array['%real estate%','%property%','%land%','%building%','%house for sale%']) then 'Real Estate'
      else 'Other'
    end as category_name,count(*)::bigint
  from public.products p join public.tenants t on t.id=p.tenant_id
  join public.sabi_marketplace_settings ms on ms.tenant_id=t.id and ms.is_published=true
  where p.status='ACTIVE' and p.is_active=true and p.price is not null and p.stock_quantity>0
    and t.is_active=true and t.is_system=false
  group by 1 order by 2 desc,1 asc;
$$;

create or replace function public.sabi_get_public_marketplace_products(p_search text default null,p_category text default null,p_limit integer default 60,p_offset integer default 0)
returns table(product_id uuid,product_name text,product_description text,product_category text,product_price numeric,product_stock integer,product_image_url text,business_name text,business_logo text,business_slug text,seller_rating numeric,seller_review_count bigint,sold_quantity bigint)
language sql stable security definer set search_path = '' as $$
  select p.id,p.name,p.description,p.category,p.price,p.stock_quantity,p.image_url,
    coalesce(t.business_name,t.name),t.logo_url,t.slug,
    coalesce(rv.avg_rating,0)::numeric(3,2),coalesce(rv.review_count,0)::bigint,coalesce(sales.sold_quantity,0)::bigint
  from public.products p join public.tenants t on t.id=p.tenant_id
  join public.sabi_marketplace_settings ms on ms.tenant_id=t.id and ms.is_published=true
  left join lateral(select avg(r.rating)::numeric(3,2) avg_rating,count(*)::bigint review_count from public.sabi_seller_reviews r where r.tenant_id=t.id) rv on true
  left join lateral(select sum(oi.quantity)::bigint sold_quantity from public.tenant_order_items oi
    join public.tenant_orders o on o.id=oi.order_id and o.tenant_id=oi.tenant_id
    where oi.product_id=p.id and o.payment_status='PAID' and o.status='COMPLETED') sales on true
  where p.status='ACTIVE' and p.is_active=true and p.price is not null and p.stock_quantity>0
    and t.is_active=true and t.is_system=false
    and (nullif(trim(coalesce(p_search,'')),'') is null or p.name ilike '%'||trim(p_search)||'%'
      or coalesce(p.description,'') ilike '%'||trim(p_search)||'%' or coalesce(p.category,'') ilike '%'||trim(p_search)||'%'
      or coalesce(t.business_name,t.name,'') ilike '%'||trim(p_search)||'%')
    and (nullif(trim(coalesce(p_category,'')),'') is null or
      (case
        when lower(coalesce(p.category,'')) like any(array['%fashion%','%cloth%','%wear%','%shoe%','%footwear%','%bag%','%jewel%','%accessor%','%textile%']) then 'Fashion'
        when lower(coalesce(p.category,'')) like any(array['%phone%','%mobile%','%electronic%','%computer%','%laptop%','%tablet%','%camera%','%audio%','%tv%','%gadget%']) then 'Phones & Electronics'
        when lower(coalesce(p.category,'')) like any(array['%home%','%furniture%','%kitchen%','%bedding%','%decor%','%appliance%','%household%','%garden%']) then 'Home & Living'
        when lower(coalesce(p.category,'')) like any(array['%beauty%','%cosmetic%','%makeup%','%skin%','%hair%','%personal care%','%perfume%','%fragrance%']) then 'Beauty & Personal Care'
        when lower(coalesce(p.category,'')) like any(array['%food%','%grocery%','%drink%','%beverage%','%snack%','%farm%','%produce%','%fruit%','%vegetable%']) then 'Food & Groceries'
        when lower(coalesce(p.category,'')) like any(array['%health%','%wellness%','%medical%','%fitness%','%supplement%','%pharmacy%']) then 'Health & Wellness'
        when lower(coalesce(p.category,'')) like any(array['%baby%','%kids%','%children%','%toy%','%maternity%','%school%']) then 'Baby, Kids & Toys'
        when lower(coalesce(p.category,'')) like any(array['%sport%','%outdoor%','%gym%','%camping%']) then 'Sports & Outdoors'
        when lower(coalesce(p.category,'')) like any(array['%auto%','%car%','%vehicle%','%motor%','%spare part%']) then 'Automotive'
        when lower(coalesce(p.category,'')) like any(array['%book%','%education%','%learning%','%stationery%','%course%']) then 'Books & Learning'
        when lower(coalesce(p.category,'')) like any(array['%real estate%','%property%','%land%','%building%','%house for sale%']) then 'Real Estate'
        else 'Other'
      end)=trim(p_category))
  order by coalesce(sales.sold_quantity,0) desc,p.created_at desc
  limit greatest(1,least(coalesce(p_limit,60),100)) offset greatest(0,coalesce(p_offset,0));
$$;
revoke all on function public.sabi_get_public_marketplace_categories() from public;
grant execute on function public.sabi_get_public_marketplace_categories() to anon,authenticated;
revoke all on function public.sabi_get_public_marketplace_products(text,text,integer,integer) from public;
grant execute on function public.sabi_get_public_marketplace_products(text,text,integer,integer) to anon,authenticated;