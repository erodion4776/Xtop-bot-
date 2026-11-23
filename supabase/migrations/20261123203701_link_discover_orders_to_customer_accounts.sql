-- Securely associate customer-initiated public orders with the signed-in Discover account.
create table if not exists public.sabi_discover_customer_orders (
  order_id uuid primary key references public.tenant_orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  linked_at timestamptz not null default now()
);
create index if not exists sabi_discover_customer_orders_user_idx
  on public.sabi_discover_customer_orders(user_id, linked_at desc);
alter table public.sabi_discover_customer_orders enable row level security;
revoke all on public.sabi_discover_customer_orders from anon, authenticated, public;

create or replace function public.sabi_link_discover_customer_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_email text;
begin
  if v_uid is null then raise exception 'Please sign in first'; end if;
  select lower(email) into v_email from auth.users where id=v_uid;
  if v_email is null then raise exception 'Your account email could not be verified'; end if;
  if not exists (
    select 1 from public.tenant_orders o
    join public.tenant_order_payment_intents pi on pi.order_id=o.id and pi.tenant_id=o.tenant_id
    where o.id=p_order_id and o.source='PUBLIC_STORE'
      and lower(coalesce(pi.customer_email,''))=v_email
  ) then raise exception 'This order does not match your customer account email'; end if;
  insert into public.sabi_discover_customer_orders(order_id,user_id)
  values(p_order_id,v_uid) on conflict(order_id) do nothing;
  if not exists(select 1 from public.sabi_discover_customer_orders where order_id=p_order_id and user_id=v_uid) then
    raise exception 'This order is already linked to another customer account';
  end if;
end; $$;
revoke all on function public.sabi_link_discover_customer_order(uuid) from public,anon;
grant execute on function public.sabi_link_discover_customer_order(uuid) to authenticated;

create or replace function public.sabi_get_my_reviewable_orders()
returns table(order_id uuid,order_number text,business_name text,ordered_at timestamptz,rating smallint,review_text text)
language sql stable security definer set search_path = '' as $$
  select o.id,o.order_number,coalesce(t.business_name,t.name),o.created_at,r.rating,r.review_text
  from public.tenant_orders o
  join public.sabi_discover_customer_orders co on co.order_id=o.id and co.user_id=auth.uid()
  join public.tenants t on t.id=o.tenant_id
  join public.sabi_marketplace_settings ms on ms.tenant_id=o.tenant_id and ms.is_published=true
  left join public.sabi_seller_reviews r on r.order_id=o.id and r.customer_user_id=auth.uid()
  where o.payment_status='PAID' and o.status='COMPLETED'
  order by o.created_at desc limit 50;
$$;
revoke all on function public.sabi_get_my_reviewable_orders() from public,anon;
grant execute on function public.sabi_get_my_reviewable_orders() to authenticated;

create or replace function public.sabi_submit_seller_review(p_order_id uuid,p_rating smallint,p_review_text text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Please sign in first'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'Rating must be between 1 and 5'; end if;
  if not exists (
    select 1 from public.tenant_orders o
    join public.sabi_discover_customer_orders co on co.order_id=o.id and co.user_id=v_uid
    join public.sabi_marketplace_settings ms on ms.tenant_id=o.tenant_id and ms.is_published=true
    where o.id=p_order_id and o.payment_status='PAID' and o.status='COMPLETED'
  ) then raise exception 'A completed paid order linked to your account is required before reviewing this seller'; end if;
  insert into public.sabi_seller_reviews(tenant_id,customer_user_id,order_id,rating,review_text)
  select o.tenant_id,v_uid,o.id,p_rating,nullif(trim(coalesce(p_review_text,'')),'')
  from public.tenant_orders o where o.id=p_order_id
  on conflict(customer_user_id,order_id) do update
    set rating=excluded.rating,review_text=excluded.review_text,created_at=now();
end; $$;
revoke all on function public.sabi_submit_seller_review(uuid,smallint,text) from public,anon;
grant execute on function public.sabi_submit_seller_review(uuid,smallint,text) to authenticated;