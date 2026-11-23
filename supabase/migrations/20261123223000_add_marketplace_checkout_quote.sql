create or replace function public.sabi_quote_marketplace_checkout(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_item_count integer;
  v_valid_count integer;
  v_subtotal numeric(14,2);
  v_delivery numeric(14,2);
  v_commission numeric(14,2);
  v_service numeric(14,2):=50;
  v_pre_fee numeric(14,2);
  v_fixed_fee_kobo numeric(14,0);
  v_processing_fee_kobo numeric(14,0);
  v_processing numeric(14,2);
  v_total numeric(14,2);
  v_sellers jsonb;
begin
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>30 then
    raise exception 'Cart must contain between 1 and 30 products';
  end if;
  select count(*) into v_item_count from jsonb_array_elements(p_items);
  if (select count(distinct (value->>'product_id')::uuid) from jsonb_array_elements(p_items))<>v_item_count then
    raise exception 'Duplicate product rows are not allowed in cart';
  end if;
  if exists(select 1 from jsonb_array_elements(p_items) j
    where coalesce(j.value->>'product_id','')='' or
      coalesce(j.value->>'quantity','') !~ '^[0-9]+$' or
      (j.value->>'quantity')::integer not between 1 and 100) then
    raise exception 'Invalid product or quantity in cart';
  end if;

  with requested as (
    select (value->>'product_id')::uuid product_id,(value->>'quantity')::integer quantity
    from jsonb_array_elements(p_items)
  )
  select count(*) into v_valid_count
  from requested r
  join public.products p on p.id=r.product_id
  join public.tenants t on t.id=p.tenant_id
  join public.sabi_marketplace_settings ms on ms.tenant_id=t.id and ms.is_published=true
  where p.status='ACTIVE' and p.is_active=true and p.price is not null and p.price>0
    and p.stock_quantity>=r.quantity and t.is_active=true and t.is_system=false
    and nullif(t.paystack_subaccount_code,'') is not null
    and t.paystack_subaccount_status='VERIFIED' and t.paystack_subaccount_verified_at is not null;
  if v_valid_count<>v_item_count then
    raise exception 'A product is unavailable or one of its sellers is not ready for marketplace checkout';
  end if;

  with requested as (
    select (value->>'product_id')::uuid product_id,(value->>'quantity')::integer quantity
    from jsonb_array_elements(p_items)
  ), seller_totals as (
    select t.id tenant_id,coalesce(t.business_name,t.name,'Merchant') merchant_name,
      sum(round(p.price*r.quantity,2))::numeric(14,2) item_subtotal,
      (case when t.shipping_enabled then coalesce(t.shipping_fee,0) else 0 end)::numeric(14,2) delivery_fee,
      case when sum(round(p.price*r.quantity,2))<1000 then 20
        when sum(round(p.price*r.quantity,2))<=2500 then 70
        when sum(round(p.price*r.quantity,2))<=10000 then 130 else 250 end::numeric(14,2) commission_amount
    from requested r join public.products p on p.id=r.product_id
    join public.tenants t on t.id=p.tenant_id
    group by t.id,t.business_name,t.name,t.shipping_enabled,t.shipping_fee
  )
  select coalesce(sum(item_subtotal),0),coalesce(sum(delivery_fee),0),
    coalesce(sum(commission_amount),0),
    coalesce(jsonb_agg(jsonb_build_object(
      'tenant_id',tenant_id,'merchant_name',merchant_name,'item_subtotal',item_subtotal,
      'delivery_fee',delivery_fee,'commission_amount',commission_amount,
      'merchant_payout_amount',item_subtotal+delivery_fee
    ) order by merchant_name),'[]'::jsonb)
  into v_subtotal,v_delivery,v_commission,v_sellers
  from seller_totals;

  v_pre_fee:=v_subtotal+v_delivery+v_commission+v_service;
  v_fixed_fee_kobo:=case when v_pre_fee>=2500 then 10000 else 0 end;
  v_processing_fee_kobo:=ceil(((v_pre_fee*100*0.015)+v_fixed_fee_kobo)/0.985);
  if v_pre_fee<2500 and (v_pre_fee*100+v_processing_fee_kobo)>=250000 then
    v_fixed_fee_kobo:=10000;
    v_processing_fee_kobo:=ceil(((v_pre_fee*100*0.015)+v_fixed_fee_kobo)/0.985);
  end if;
  v_processing_fee_kobo:=least(v_processing_fee_kobo,200000);
  v_processing:=v_processing_fee_kobo/100.0;
  v_total:=v_subtotal+v_delivery+v_commission+v_service+v_processing;

  return jsonb_build_object(
    'success',true,'currency','NGN','seller_count',jsonb_array_length(v_sellers),
    'sellers',v_sellers,'item_subtotal',v_subtotal,'delivery_total',v_delivery,
    'commission_total',v_commission,'customer_service_fee',v_service,
    'marketplace_fee_total',v_commission+v_service,
    'paystack_processing_fee',v_processing,'expected_amount',v_total
  );
end;
$function$;
revoke all on function public.sabi_quote_marketplace_checkout(jsonb) from public,anon,authenticated;
grant execute on function public.sabi_quote_marketplace_checkout(jsonb) to service_role;