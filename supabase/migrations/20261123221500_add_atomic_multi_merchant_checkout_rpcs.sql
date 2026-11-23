-- Atomic multi-merchant Sabi Discover checkout.
create or replace function public.sabi_create_marketplace_checkout(
  p_items jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_delivery_address text,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_item jsonb;
  v_product public.products%rowtype;
  v_tenant public.tenants%rowtype;
  v_checkout_id uuid := gen_random_uuid();
  v_checkout_reference text := 'SABI-MKT-' || replace(gen_random_uuid()::text,'-','');
  v_customer_name text := left(trim(coalesce(p_customer_name,'')),160);
  v_customer_phone text := left(trim(coalesce(p_customer_phone,'')),40);
  v_customer_email text := lower(trim(coalesce(p_customer_email,'')));
  v_delivery_address text := left(trim(coalesce(p_delivery_address,'')),1000);
  v_product_id uuid;
  v_quantity integer;
  v_seen uuid[] := array[]::uuid[];
  v_tenant_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_child_reference text;
  v_token text;
  v_token_hash text;
  v_subtotal numeric(14,2);
  v_delivery numeric(14,2);
  v_commission numeric(14,2);
  v_payout numeric(14,2);
  v_total_subtotal numeric(14,2) := 0;
  v_total_delivery numeric(14,2) := 0;
  v_total_commission numeric(14,2) := 0;
  v_service_fee numeric(14,2) := 50;
  v_pre_fee numeric(14,2);
  v_fixed_fee_kobo numeric(14,0);
  v_processing_fee_kobo numeric(14,0);
  v_processing_fee numeric(14,2);
  v_expected numeric(14,2);
  v_orders jsonb := '[]'::jsonb;
  v_items_for_tenant jsonb;
  v_merchant_name text;
  v_subaccount text;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'Cart must contain between 1 and 30 products';
  end if;
  if v_customer_name='' or v_customer_phone='' or v_customer_email='' or v_delivery_address='' then
    raise exception 'Complete customer details are required';
  end if;
  if v_customer_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'A valid customer email is required';
  end if;

  -- Validate cart shape and reject duplicate products before reserving stock.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(v_item->>'product_id','')::uuid;
    v_quantity := nullif(v_item->>'quantity','')::integer;
    if v_product_id is null or v_quantity is null or v_quantity < 1 or v_quantity > 100 then
      raise exception 'Invalid product or quantity in cart';
    end if;
    if v_product_id = any(v_seen) then raise exception 'Duplicate product rows are not allowed in cart'; end if;
    v_seen := array_append(v_seen,v_product_id);
  end loop;

  -- Lock all selected products in stable UUID order to reduce checkout deadlocks.
  for v_product_id in
    select (value->>'product_id')::uuid
    from jsonb_array_elements(p_items)
    order by (value->>'product_id')::uuid
  loop
    select * into v_product from public.products
    where id=v_product_id and status='ACTIVE' and is_active=true
    for update;
    if not found or v_product.price is null or v_product.price <= 0 then
      raise exception 'A selected product is unavailable';
    end if;
    select (value->>'quantity')::integer into v_quantity
    from jsonb_array_elements(p_items) where (value->>'product_id')::uuid=v_product_id;
    if v_product.stock_quantity < v_quantity then
      raise exception 'Insufficient stock for %',v_product.name;
    end if;
  end loop;

  -- Validate and lock every seller in stable order. Only published stores with
  -- verified Paystack subaccounts can participate in a combined online checkout.
  for v_tenant_id in
    select distinct p.tenant_id
    from public.products p
    where p.id = any(v_seen)
    order by p.tenant_id
  loop
    select * into v_tenant from public.tenants
    where id=v_tenant_id and is_active=true and is_system=false
    for update;
    if not found then raise exception 'A seller is unavailable'; end if;
    if not exists(select 1 from public.sabi_marketplace_settings ms where ms.tenant_id=v_tenant_id and ms.is_published=true) then
      raise exception 'A seller is no longer published on Sabi Discover';
    end if;
    if coalesce(v_tenant.paystack_subaccount_code,'')='' or
       v_tenant.paystack_subaccount_status <> 'VERIFIED' or
       v_tenant.paystack_subaccount_verified_at is null then
      raise exception 'A seller has not completed Paystack verification';
    end if;
  end loop;

  insert into public.sabi_marketplace_checkouts(
    id,reference,customer_name,customer_phone,customer_email,delivery_address,notes,currency,status,payment_status
  ) values (
    v_checkout_id,v_checkout_reference,v_customer_name,v_customer_phone,v_customer_email,v_delivery_address,
    nullif(trim(coalesce(p_notes,'')),''),'NGN','PENDING','UNPAID'
  );

  -- One child order per merchant; each remains a normal tenant order in that seller's workspace.
  for v_tenant_id in
    select distinct p.tenant_id
    from public.products p
    where p.id = any(v_seen)
    order by p.tenant_id
  loop
    select * into v_tenant from public.tenants where id=v_tenant_id;
    v_subtotal := 0;
    v_items_for_tenant := '[]'::jsonb;

    for v_item in
      select value from jsonb_array_elements(p_items) j
      join public.products p on p.id=(j.value->>'product_id')::uuid
      where p.tenant_id=v_tenant_id
      order by p.id
    loop
      v_product_id := (v_item->>'product_id')::uuid;
      v_quantity := (v_item->>'quantity')::integer;
      select * into v_product from public.products where id=v_product_id and tenant_id=v_tenant_id;
      v_subtotal := v_subtotal + round(v_product.price*v_quantity,2);
      v_items_for_tenant := v_items_for_tenant || jsonb_build_array(jsonb_build_object(
        'product_id',v_product_id,'quantity',v_quantity
      ));
    end loop;

    v_delivery := case when v_tenant.shipping_enabled then coalesce(v_tenant.shipping_fee,0) else 0 end;
    v_commission := case when v_subtotal<1000 then 20 when v_subtotal<=2500 then 70 when v_subtotal<=10000 then 130 else 250 end;
    v_payout := v_subtotal + v_delivery - v_commission;
    if v_payout < 0 then raise exception 'Invalid merchant settlement calculation'; end if;

    v_order_id := gen_random_uuid();
    v_order_number := 'SABI-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(replace(v_order_id::text,'-',''),1,8));
    v_token := encode(extensions.gen_random_bytes(32),'hex');
    v_token_hash := encode(extensions.digest(convert_to(v_token,'UTF8'),'sha256'),'hex');

    insert into public.tenant_orders(
      id,tenant_id,customer_name,customer_phone,order_number,status,payment_status,
      subtotal,delivery_fee,total,currency,delivery_address,notes,source,
      shipping_required,shipping_payment_required,shipping_payment_status,payment_method,
      customer_confirmation_token_hash
    ) values (
      v_order_id,v_tenant_id,v_customer_name,v_customer_phone,v_order_number,'PENDING','UNPAID',
      v_subtotal,v_delivery,v_subtotal+v_delivery,'NGN',v_delivery_address,
      nullif(trim(coalesce(p_notes,'')),''),'PUBLIC_STORE',v_delivery>0,false,'NOT_REQUIRED',
      'ONLINE',v_token_hash
    );

    for v_item in select value from jsonb_array_elements(v_items_for_tenant)
    loop
      v_product_id := (v_item->>'product_id')::uuid;
      v_quantity := (v_item->>'quantity')::integer;
      select * into v_product from public.products where id=v_product_id and tenant_id=v_tenant_id;
      update public.products set stock_quantity=stock_quantity-v_quantity,updated_at=now()
      where id=v_product_id and tenant_id=v_tenant_id;
      insert into public.tenant_order_items(tenant_id,order_id,product_id,product_name,quantity,unit_price,line_total)
      values(v_tenant_id,v_order_id,v_product_id,v_product.name,v_quantity,v_product.price,round(v_product.price*v_quantity,2));
    end loop;

    -- A child intent links the order to the customer account and merchant workflows.
    -- It is not a second Paystack charge; the single parent checkout reference is charged.
    v_child_reference := 'SABI-MKT-CHILD-' || replace(gen_random_uuid()::text,'-','');
    insert into public.tenant_order_payment_intents(
      tenant_id,order_id,payment_type,reference,expected_amount,currency,customer_email,status,metadata
    ) values (
      v_tenant_id,v_order_id,'ONLINE_ORDER',v_child_reference,v_subtotal+v_delivery,'NGN',
      v_customer_email,'PENDING',jsonb_build_object(
        'purpose','SABI_MARKETPLACE_CHILD_ORDER','checkout_id',v_checkout_id,
        'checkout_reference',v_checkout_reference,'payment_method','ONLINE'
      )
    );

    v_merchant_name := coalesce(v_tenant.business_name,v_tenant.name,'Merchant');
    v_subaccount := v_tenant.paystack_subaccount_code;
    insert into public.sabi_marketplace_checkout_orders(
      checkout_id,tenant_id,order_id,merchant_name,subaccount_code,
      item_subtotal,delivery_fee,commission_amount,merchant_payout_amount
    ) values (
      v_checkout_id,v_tenant_id,v_order_id,v_merchant_name,v_subaccount,
      v_subtotal,v_delivery,v_commission,v_payout
    );

    v_total_subtotal := v_total_subtotal+v_subtotal;
    v_total_delivery := v_total_delivery+v_delivery;
    v_total_commission := v_total_commission+v_commission;
    v_orders := v_orders || jsonb_build_array(jsonb_build_object(
      'tenant_id',v_tenant_id,'order_id',v_order_id,'order_number',v_order_number,
      'merchant_name',v_merchant_name,'subtotal',v_subtotal,'delivery_fee',v_delivery,
      'commission',v_commission,'merchant_payout',v_payout,'customer_confirmation_token',v_token
    ));
  end loop;

  -- Paystack processing fee uses the same Sabi v4 calculation as the existing
  -- single-order trigger, but is calculated once over the combined checkout.
  v_pre_fee := v_total_subtotal+v_total_delivery+v_total_commission+v_service_fee;
  v_fixed_fee_kobo := case when v_pre_fee>=2500 then 10000 else 0 end;
  v_processing_fee_kobo := ceil(((v_pre_fee*100*0.015)+v_fixed_fee_kobo)/0.985);
  if v_pre_fee<2500 and (v_pre_fee*100+v_processing_fee_kobo)>=250000 then
    v_fixed_fee_kobo:=10000;
    v_processing_fee_kobo:=ceil(((v_pre_fee*100*0.015)+v_fixed_fee_kobo)/0.985);
  end if;
  v_processing_fee_kobo := least(v_processing_fee_kobo,200000);
  v_processing_fee := v_processing_fee_kobo/100.0;
  v_expected := v_total_subtotal+v_total_delivery+v_total_commission+v_service_fee+v_processing_fee;

  update public.sabi_marketplace_checkouts set
    item_subtotal=v_total_subtotal,delivery_total=v_total_delivery,
    commission_total=v_total_commission,customer_service_fee=v_service_fee,
    paystack_processing_fee=v_processing_fee,expected_amount=v_expected,
    metadata=jsonb_build_object('fee_version',4,'settlement_method','PAYSTACK_DYNAMIC_SPLIT','seller_count',jsonb_array_length(v_orders)),
    updated_at=now()
  where id=v_checkout_id;

  return jsonb_build_object(
    'success',true,'checkout_id',v_checkout_id,'checkout_reference',v_checkout_reference,
    'currency','NGN','item_subtotal',v_total_subtotal,'delivery_total',v_total_delivery,
    'commission_total',v_total_commission,'customer_service_fee',v_service_fee,
    'paystack_processing_fee',v_processing_fee,'expected_amount',v_expected,
    'seller_count',jsonb_array_length(v_orders),'orders',v_orders
  );
end;
$function$;

create or replace function public.sabi_confirm_marketplace_checkout_payment(
  p_reference text,
  p_paystack_transaction_id text,
  p_paid_amount numeric,
  p_currency text default 'NGN'
) returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_checkout public.sabi_marketplace_checkouts%rowtype;
  v_child record;
  v_count integer := 0;
begin
  if coalesce(trim(p_reference),'')='' or coalesce(trim(p_paystack_transaction_id),'')='' or p_paid_amount is null or p_paid_amount<=0 then
    raise exception 'Invalid marketplace payment confirmation';
  end if;
  select * into v_checkout from public.sabi_marketplace_checkouts
  where reference=p_reference for update;
  if not found then raise exception 'Marketplace checkout reference not found'; end if;
  if upper(coalesce(p_currency,''))<>upper(v_checkout.currency) then raise exception 'Marketplace payment currency mismatch'; end if;
  if round(p_paid_amount,2)<>round(v_checkout.expected_amount,2) then raise exception 'Marketplace payment amount mismatch'; end if;
  if v_checkout.status='CANCELLED' or v_checkout.status='EXPIRED' then raise exception 'This marketplace checkout is no longer payable'; end if;
  if v_checkout.status='PAID' then
    if v_checkout.paystack_transaction_id is distinct from p_paystack_transaction_id then
      raise exception 'Checkout already confirmed with another transaction';
    end if;
    return jsonb_build_object('success',true,'payment_confirmed',true,'already_confirmed',true,'checkout_id',v_checkout.id);
  end if;
  if v_checkout.status<>'PENDING' then raise exception 'Marketplace checkout is not pending'; end if;

  for v_child in
    select co.checkout_id,co.tenant_id,co.order_id,co.item_subtotal,co.delivery_fee,
      co.commission_amount,co.merchant_payout_amount,co.merchant_name,
      o.status as order_status,pi.id as intent_id,pi.reference as child_reference
    from public.sabi_marketplace_checkout_orders co
    join public.tenant_orders o on o.id=co.order_id and o.tenant_id=co.tenant_id
    join public.tenant_order_payment_intents pi on pi.order_id=o.id and pi.tenant_id=o.tenant_id
      and pi.metadata->>'checkout_id'=v_checkout.id::text
    where co.checkout_id=v_checkout.id
    order by co.tenant_id
    for update of o,pi
  loop
    if v_child.order_status='CANCELLED' then raise exception 'A seller order has been cancelled'; end if;
    update public.tenant_orders set payment_status='PAID',payment_reference=p_reference,
      paid_at=coalesce(paid_at,now()),updated_at=now()
    where id=v_child.order_id and tenant_id=v_child.tenant_id;
    update public.tenant_order_payment_intents set status='COMPLETED',
      paystack_transaction_id=p_paystack_transaction_id,paystack_status='success',
      completed_at=coalesce(completed_at,now()),updated_at=now()
    where id=v_child.intent_id;
    insert into public.sabi_marketplace_paystack_allocations(
      checkout_id,tenant_id,order_id,payment_reference,paystack_transaction_id,
      commission_basis_amount,merchant_commission_amount,delivery_fee,
      merchant_payout_amount,currency,settlement_status,metadata
    ) values (
      v_checkout.id,v_child.tenant_id,v_child.order_id,p_reference,p_paystack_transaction_id,
      v_child.item_subtotal,v_child.commission_amount,v_child.delivery_fee,
      v_child.merchant_payout_amount,v_checkout.currency,'PENDING',
      jsonb_build_object('merchant_name',v_child.merchant_name,'settlement_method','PAYSTACK_DYNAMIC_SPLIT')
    ) on conflict(order_id) do nothing;
    v_count:=v_count+1;
  end loop;

  if v_count=0 or v_count<>(select count(*) from public.sabi_marketplace_checkout_orders where checkout_id=v_checkout.id) then
    raise exception 'Marketplace checkout seller orders are incomplete';
  end if;

  update public.sabi_marketplace_checkouts set status='PAID',payment_status='PAID',
    paystack_transaction_id=p_paystack_transaction_id,paystack_status='success',
    paid_at=coalesce(paid_at,now()),updated_at=now()
  where id=v_checkout.id;

  return jsonb_build_object('success',true,'payment_confirmed',true,'checkout_id',v_checkout.id,'seller_orders_confirmed',v_count);
end;
$function$;

revoke all on function public.sabi_create_marketplace_checkout(jsonb,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.sabi_create_marketplace_checkout(jsonb,text,text,text,text,text) to service_role;
revoke all on function public.sabi_confirm_marketplace_checkout_payment(text,text,numeric,text) from public, anon, authenticated;
grant execute on function public.sabi_confirm_marketplace_checkout_payment(text,text,numeric,text) to service_role;
