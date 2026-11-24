-- Protect Sabi Discover multi-merchant checkout from sellers without delivery configured.
-- Merchant-set fees (including an intentional zero/free-delivery fee) remain supported.
-- Live courier quotes are not advertised here; they require an active provider integration.

alter function public.sabi_quote_marketplace_checkout(jsonb)
  rename to sabi_quote_marketplace_checkout_legacy_20261124;

alter function public.sabi_create_marketplace_checkout(jsonb,text,text,text,text,text)
  rename to sabi_create_marketplace_checkout_legacy_20261124;

create function public.sabi_quote_marketplace_checkout(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_result jsonb;
  v_sellers jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'Cart must contain between 1 and 30 products';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    join public.products p on p.id = (item.value->>'product_id')::uuid
    join public.tenants t on t.id = p.tenant_id
    where t.shipping_enabled is distinct from true
  ) then
    raise exception 'A seller has not enabled delivery in their Sabi settings. Remove that seller''s products or ask the seller to configure delivery before checkout.';
  end if;

  v_result := public.sabi_quote_marketplace_checkout_legacy_20261124(p_items);
  v_sellers := coalesce(v_result->'sellers', '[]'::jsonb);

  select coalesce(
    jsonb_agg(
      seller.value || jsonb_build_object(
        'delivery_type', 'MERCHANT_SET_FEE',
        'delivery_label',
          case when coalesce((seller.value->>'delivery_fee')::numeric, 0) = 0
            then 'Free delivery set by seller'
            else 'Merchant-set delivery fee'
          end
      )
      order by seller.value->>'merchant_name'
    ),
    '[]'::jsonb
  )
  into v_sellers
  from jsonb_array_elements(v_sellers) seller(value);

  return jsonb_set(v_result, '{sellers}', v_sellers, true);
end;
$function$;

create function public.sabi_create_marketplace_checkout(
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
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'Cart must contain between 1 and 30 products';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    join public.products p on p.id = (item.value->>'product_id')::uuid
    join public.tenants t on t.id = p.tenant_id
    where t.shipping_enabled is distinct from true
  ) then
    raise exception 'A seller has not enabled delivery in their Sabi settings. Remove that seller''s products or ask the seller to configure delivery before checkout.';
  end if;

  return public.sabi_create_marketplace_checkout_legacy_20261124(
    p_items,
    p_customer_name,
    p_customer_phone,
    p_customer_email,
    p_delivery_address,
    p_notes
  );
end;
$function$;

revoke all on function public.sabi_quote_marketplace_checkout(jsonb) from public, anon, authenticated;
grant execute on function public.sabi_quote_marketplace_checkout(jsonb) to service_role;
revoke all on function public.sabi_create_marketplace_checkout(jsonb,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.sabi_create_marketplace_checkout(jsonb,text,text,text,text,text) to service_role;
