-- Sabi Discover customer accounts, explicit email consent, verified seller reviews and sales-ranked products.
create table if not exists public.sabi_discover_customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  email_marketing_consent boolean not null default false,
  email_consent_at timestamptz,
  email_consent_source text,
  updated_at timestamptz not null default now()
);
alter table public.sabi_discover_customer_profiles enable row level security;
revoke all on public.sabi_discover_customer_profiles from anon, public;
grant select, insert, update on public.sabi_discover_customer_profiles to authenticated;
create policy "Customers read own Discover profile" on public.sabi_discover_customer_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "Customers create own Discover profile" on public.sabi_discover_customer_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Customers update own Discover profile" on public.sabi_discover_customer_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create table if not exists public.sabi_seller_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.tenant_orders(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  review_text text check (char_length(coalesce(review_text,'')) <= 1200),
  created_at timestamptz not null default now(),
  unique (customer_user_id, order_id)
);
create index if not exists sabi_seller_reviews_tenant_idx on public.sabi_seller_reviews(tenant_id, created_at desc);
alter table public.sabi_seller_reviews enable row level security;
revoke all on public.sabi_seller_reviews from anon, authenticated, public;
grant select on public.sabi_seller_reviews to anon, authenticated;
create policy "Public read seller reviews for published stores" on public.sabi_seller_reviews for select to anon, authenticated using (
  exists (select 1 from public.sabi_marketplace_settings ms where ms.tenant_id = sabi_seller_reviews.tenant_id and ms.is_published = true)
);

create or replace function public.sabi_save_discover_customer_profile(p_full_name text,p_phone text default null,p_email_marketing_consent boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_email text; v_name text;
begin
  if v_uid is null then raise exception 'Please sign in first'; end if;
  select lower(email) into v_email from auth.users where id=v_uid;
  if v_email is null then raise exception 'Your account email could not be verified'; end if;
  v_name := left(trim(coalesce(p_full_name,'')),120);
  insert into public.sabi_discover_customer_profiles(user_id,full_name,phone,email_marketing_consent,email_consent_at,email_consent_source,updated_at)
  values(v_uid,v_name,nullif(trim(coalesce(p_phone,'')),''),coalesce(p_email_marketing_consent,false),
    case when coalesce(p_email_marketing_consent,false) then now() else null end,
    case when coalesce(p_email_marketing_consent,false) then 'discover_account_signup' else null end,now())
  on conflict(user_id) do update set full_name=excluded.full_name,phone=excluded.phone,
    email_marketing_consent=excluded.email_marketing_consent,
    email_consent_at=case when excluded.email_marketing_consent and not public.sabi_discover_customer_profiles.email_marketing_consent then now()
      when not excluded.email_marketing_consent then null else public.sabi_discover_customer_profiles.email_consent_at end,
    email_consent_source=case when excluded.email_marketing_consent then 'discover_account_settings' else null end,updated_at=now();
  if coalesce(p_email_marketing_consent,false) then
    insert into public.sabi_platform_email_subscribers(email,full_name,status,consent_at,consent_source,created_at,updated_at)
    values(v_email,v_name,'SUBSCRIBED',now(),'sabi_discover_customer_signup',now(),now())
    on conflict(email) do update set full_name=excluded.full_name,status='SUBSCRIBED',
      consent_at=now(),consent_source='sabi_discover_customer_preferences',updated_at=now();
  else
    update public.sabi_platform_email_subscribers set status='UNSUBSCRIBED',updated_at=now()
    where email=v_email and status='SUBSCRIBED';
  end if;
end; $$;
revoke all on function public.sabi_save_discover_customer_profile(text,text,boolean) from public,anon;
grant execute on function public.sabi_save_discover_customer_profile(text,text,boolean) to authenticated;

create or replace function public.sabi_submit_seller_review(p_order_id uuid,p_rating smallint,p_review_text text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_email text;
begin
  if v_uid is null then raise exception 'Please sign in first'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'Rating must be between 1 and 5'; end if;
  select lower(email) into v_email from auth.users where id=v_uid;
  if v_email is null then raise exception 'Your account email could not be verified'; end if;
  if not exists(select 1 from public.tenant_orders o join public.contacts c on c.id=o.contact_id
    where o.id=p_order_id and o.payment_status='PAID' and o.status='COMPLETED' and lower(coalesce(c.email,''))=v_email
    and exists(select 1 from public.sabi_marketplace_settings ms where ms.tenant_id=o.tenant_id and ms.is_published=true))
    then raise exception 'A completed paid order linked to your account is required before reviewing this seller'; end if;
  insert into public.sabi_seller_reviews(tenant_id,customer_user_id,order_id,rating,review_text)
  select o.tenant_id,v_uid,o.id,p_rating,nullif(trim(coalesce(p_review_text,'')),'') from public.tenant_orders o where o.id=p_order_id
  on conflict(customer_user_id,order_id) do update set rating=excluded.rating,review_text=excluded.review_text,created_at=now();
end; $$;
revoke all on function public.sabi_submit_seller_review(uuid,smallint,text) from public,anon;
grant execute on function public.sabi_submit_seller_review(uuid,smallint,text) to authenticated;

create or replace function public.sabi_get_my_reviewable_orders()
returns table(order_id uuid, order_number text, business_name text, ordered_at timestamptz, rating smallint, review_text text)
language sql stable security definer set search_path = '' as $
  select o.id,o.order_number,coalesce(t.business_name,t.name),o.created_at,r.rating,r.review_text
  from public.tenant_orders o
  join public.contacts c on c.id=o.contact_id
  join public.tenants t on t.id=o.tenant_id
  join auth.users u on u.id=auth.uid()
  left join public.sabi_seller_reviews r on r.order_id=o.id and r.customer_user_id=auth.uid()
  where o.payment_status='PAID' and o.status='COMPLETED'
    and lower(coalesce(c.email,''))=lower(coalesce(u.email,''))
  order by o.created_at desc limit 50;
$;
revoke all on function public.sabi_get_my_reviewable_orders() from public,anon;
grant execute on function public.sabi_get_my_reviewable_orders() to authenticated;

drop function if exists public.sabi_get_public_marketplace_products(text,text,integer,integer);
create function public.sabi_get_public_marketplace_products(p_search text default null,p_category text default null,p_limit integer default 60,p_offset integer default 0)
returns table(product_id uuid,product_name text,product_description text,product_category text,product_price numeric,product_stock integer,product_image_url text,business_name text,business_logo text,business_slug text,seller_rating numeric,seller_review_count bigint,sold_quantity bigint)
language sql stable security definer set search_path = '' as $$
  select p.id,p.name,p.description,p.category,p.price,p.stock_quantity,p.image_url,coalesce(t.business_name,t.name),t.logo_url,t.slug,
    coalesce(rv.avg_rating,0)::numeric(3,2),coalesce(rv.review_count,0)::bigint,coalesce(sales.sold_quantity,0)::bigint
  from public.products p join public.tenants t on t.id=p.tenant_id
  join public.sabi_marketplace_settings ms on ms.tenant_id=t.id and ms.is_published=true
  left join lateral(select avg(r.rating)::numeric(3,2) avg_rating,count(*)::bigint review_count from public.sabi_seller_reviews r where r.tenant_id=t.id) rv on true
  left join lateral(select sum(oi.quantity)::bigint sold_quantity from public.tenant_order_items oi
    join public.tenant_orders o on o.id=oi.order_id and o.tenant_id=oi.tenant_id
    where oi.product_id=p.id and o.payment_status='PAID' and o.status='COMPLETED') sales on true
  where p.status='ACTIVE' and p.is_active=true and p.price is not null and p.stock_quantity>0 and p.tenant_id is not null
    and t.is_active=true and t.is_system=false
    and (nullif(trim(coalesce(p_search,'')),'') is null or p.name ilike '%'||trim(p_search)||'%'
      or coalesce(p.description,'') ilike '%'||trim(p_search)||'%' or coalesce(p.category,'') ilike '%'||trim(p_search)||'%'
      or coalesce(t.business_name,t.name,'') ilike '%'||trim(p_search)||'%')
    and (nullif(trim(coalesce(p_category,'')),'') is null or lower(coalesce(p.category,''))=lower(trim(p_category)))
  order by coalesce(sales.sold_quantity,0) desc,p.created_at desc limit greatest(1,least(coalesce(p_limit,60),100)) offset greatest(0,coalesce(p_offset,0));
$$;
revoke all on function public.sabi_get_public_marketplace_products(text,text,integer,integer) from public;
grant execute on function public.sabi_get_public_marketplace_products(text,text,integer,integer) to anon,authenticated;
