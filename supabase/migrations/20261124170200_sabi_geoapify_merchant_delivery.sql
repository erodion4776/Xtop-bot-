-- Geoapify road-distance quotes for merchant-managed delivery.
-- No courier booking, rider dispatch, or third-party delivery partner is used.

alter table public.tenant_delivery_preferences
  add column if not exists pickup_lat numeric(10,7),
  add column if not exists pickup_lon numeric(10,7),
  add column if not exists base_fee numeric(12,2) not null default 0,
  add column if not exists per_km_fee numeric(12,2) not null default 0,
  add column if not exists minimum_fee numeric(12,2) not null default 0,
  add column if not exists max_delivery_km numeric(8,2) not null default 100,
  add column if not exists pricing_enabled boolean not null default false,
  add column if not exists geocoded_label text,
  add column if not exists location_verified_at timestamptz;

alter table public.tenant_delivery_preferences
  drop constraint if exists tenant_delivery_partner_mode_check;
alter table public.tenant_delivery_preferences
  alter column delivery_mode set default 'MERCHANT';

alter table public.tenant_delivery_preferences
  add constraint tenant_delivery_geo_pricing_check check (
    base_fee >= 0 and per_km_fee >= 0 and minimum_fee >= 0
    and max_delivery_km > 0 and max_delivery_km <= 1000
    and (pickup_lat is null or pickup_lat between -90 and 90)
    and (pickup_lon is null or pickup_lon between -180 and 180)
  );

create table if not exists public.sabi_marketplace_delivery_quotes (
  id uuid primary key default gen_random_uuid(),
  cart_signature text not null,
  delivery_address text not null,
  delivery_fees jsonb not null,
  request_fingerprint text,
  route_summary jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sabi_marketplace_delivery_quotes_expiry_idx
  on public.sabi_marketplace_delivery_quotes(expires_at) where used_at is null;
create index if not exists sabi_marketplace_delivery_quotes_rate_idx
  on public.sabi_marketplace_delivery_quotes(request_fingerprint,created_at desc) where request_fingerprint is not null;
alter table public.sabi_marketplace_delivery_quotes enable row level security;
revoke all on public.sabi_marketplace_delivery_quotes from anon, authenticated;
grant all on public.sabi_marketplace_delivery_quotes to service_role;
create policy "service role only delivery quotes" on public.sabi_marketplace_delivery_quotes
  for all to service_role using (true) with check (true);

create table if not exists public.sabi_delivery_quote_attempts (
  id uuid primary key default gen_random_uuid(),
  request_fingerprint text not null,
  created_at timestamptz not null default now()
);
create index if not exists sabi_delivery_quote_attempts_rate_idx
  on public.sabi_delivery_quote_attempts(request_fingerprint,created_at desc);
alter table public.sabi_delivery_quote_attempts enable row level security;
revoke all on public.sabi_delivery_quote_attempts from anon,authenticated;
grant all on public.sabi_delivery_quote_attempts to service_role;
create policy "service role only delivery quote attempts" on public.sabi_delivery_quote_attempts
  for all to service_role using (true) with check (true);

-- The existing six-argument RPC remains available for the legacy internal path.
-- Marketplace web checkout uses this quote-bound overload so the exact road-distance
-- fees shown to the customer are the fees saved on each seller order and Paystack split.
create or replace function public.sabi_create_marketplace_checkout(
  p_items jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_delivery_address text,
  p_notes text,
  p_delivery_quote_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_quote public.sabi_marketplace_delivery_quotes%rowtype;
  v_result jsonb;
  v_signature text;
  v_checkout_id uuid;
  v_seller record;
  v_fee numeric(14,2);
  v_delivery_total numeric(14,2) := 0;
  v_subtotal numeric(14,2) := 0;
  v_commission numeric(14,2) := 0;
  v_service numeric(14,2) := 50;
  v_pre_fee numeric(14,2);
  v_fixed_fee_kobo numeric(14,0);
  v_processing_fee_kobo numeric(14,0);
  v_processing numeric(14,2);
  v_expected numeric(14,2);
  v_orders jsonb;
begin
  if p_delivery_quote_id is null then raise exception 'DELIVERY_QUOTE_REQUIRED'; end if;
  select * into v_quote
  from public.sabi_marketplace_delivery_quotes
  where id=p_delivery_quote_id
  for update;
  if not found or v_quote.used_at is not null or v_quote.expires_at <= now()
     or v_quote.delivery_address <> left(trim(coalesce(p_delivery_address,'')),1000) then
    raise exception 'DELIVERY_QUOTE_EXPIRED';
  end if;

  select encode(extensions.digest(convert_to(
    (select string_agg((value->>'product_id') || ':' || (value->>'quantity'), '|' order by value->>'product_id')
     from jsonb_array_elements(p_items)), 'UTF8'), 'sha256'),'hex')
  into v_signature;
  if v_signature is distinct from v_quote.cart_signature then
    raise exception 'DELIVERY_QUOTE_CART_MISMATCH';
  end if;

  v_result := public.sabi_create_marketplace_checkout(
    p_items,p_customer_name,p_customer_phone,p_customer_email,p_delivery_address,p_notes
  );
  v_checkout_id := (v_result->>'checkout_id')::uuid;

  for v_seller in
    select co.tenant_id,co.order_id,co.item_subtotal,co.commission_amount
    from public.sabi_marketplace_checkout_orders co
    where co.checkout_id=v_checkout_id
    order by co.tenant_id
  loop
    select (entry->>'delivery_fee')::numeric into v_fee
    from jsonb_array_elements(v_quote.delivery_fees) entry
    where entry->>'tenant_id'=v_seller.tenant_id::text;
    if v_fee is null or v_fee < 0 or v_fee > 100000000 then
      raise exception 'DELIVERY_QUOTE_SELLER_MISSING';
    end if;

    update public.sabi_marketplace_checkout_orders
      set delivery_fee=v_fee, merchant_payout_amount=v_seller.item_subtotal+v_fee
      where checkout_id=v_checkout_id and tenant_id=v_seller.tenant_id;

    update public.tenant_orders
      set delivery_fee=v_fee,total=subtotal+v_fee,shipping_required=(v_fee>0),
          shipping_payment_required=false,shipping_payment_status='NOT_REQUIRED',
          updated_at=now()
      where id=v_seller.order_id and tenant_id=v_seller.tenant_id;

    update public.tenant_order_payment_intents
      set expected_amount=v_seller.item_subtotal+v_fee,
          metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('delivery_quote_id',p_delivery_quote_id)
      where order_id=v_seller.order_id and tenant_id=v_seller.tenant_id
        and metadata->>'purpose'='SABI_MARKETPLACE_CHILD_ORDER';

    v_delivery_total:=v_delivery_total+v_fee;
    v_subtotal:=v_subtotal+v_seller.item_subtotal;
    v_commission:=v_commission+v_seller.commission_amount;
  end loop;

  v_pre_fee:=v_subtotal+v_delivery_total+v_commission+v_service;
  v_fixed_fee_kobo:=case when v_pre_fee>=2500 then 10000 else 0 end;
  v_processing_fee_kobo:=ceil(((v_pre_fee*100*0.015)+v_fixed_fee_kobo)/0.985);
  if v_pre_fee<2500 and (v_pre_fee*100+v_processing_fee_kobo)>=250000 then
    v_fixed_fee_kobo:=10000;
    v_processing_fee_kobo:=ceil(((v_pre_fee*100*0.015)+v_fixed_fee_kobo)/0.985);
  end if;
  v_processing_fee_kobo:=least(v_processing_fee_kobo,200000);
  v_processing:=v_processing_fee_kobo/100.0;
  v_expected:=v_subtotal+v_delivery_total+v_commission+v_service+v_processing;

  update public.sabi_marketplace_checkouts set
    item_subtotal=v_subtotal,delivery_total=v_delivery_total,commission_total=v_commission,customer_service_fee=v_service,
    paystack_processing_fee=v_processing,expected_amount=v_expected,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'delivery_quote_id',p_delivery_quote_id,'delivery_calculation','GEOAPIFY_ROAD_DISTANCE'
    ),updated_at=now()
  where id=v_checkout_id;

  select coalesce(jsonb_agg(
    entry || jsonb_build_object(
      'subtotal',co.item_subtotal,
      'delivery_fee',co.delivery_fee,
      'commission',co.commission_amount,
      'merchant_payout',co.merchant_payout_amount
    )
  ),'[]'::jsonb)
  into v_orders
  from jsonb_array_elements(coalesce(v_result->'orders','[]'::jsonb)) entry
  join public.sabi_marketplace_checkout_orders co
    on co.checkout_id=v_checkout_id and co.tenant_id=(entry->>'tenant_id')::uuid;

  update public.sabi_marketplace_delivery_quotes set used_at=now()
  where id=p_delivery_quote_id and used_at is null;

  return jsonb_set(v_result,'{orders}',v_orders,true) || jsonb_build_object(
    'item_subtotal',v_subtotal,'delivery_total',v_delivery_total,
    'commission_total',v_commission,'customer_service_fee',v_service,
    'paystack_processing_fee',v_processing,'expected_amount',v_expected,
    'delivery_quote_id',p_delivery_quote_id
  );
end;
$function$;

revoke all on function public.sabi_create_marketplace_checkout(jsonb,text,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.sabi_create_marketplace_checkout(jsonb,text,text,text,text,text,uuid) to service_role;
