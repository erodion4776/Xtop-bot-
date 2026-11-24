-- WhatsApp merchant checkout: trusted server-side road-distance fee snapshot.
-- The original public cart RPC remains unchanged for existing callers.
CREATE OR REPLACE FUNCTION public.sabi_create_public_cart_order_with_delivery(
  p_items jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_delivery_address text,
  p_notes text,
  p_payment_method text,
  p_delivery_fee numeric,
  p_delivery_calculation text,
  p_delivery_distance_km numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  v_result jsonb;
  v_order_id uuid;
  v_reference text;
  v_order public.tenant_orders%ROWTYPE;
  v_intent public.tenant_order_payment_intents%ROWTYPE;
  v_base_amount numeric(14,2);
  v_commission numeric(14,2);
  v_service_fee numeric(14,2) := 50;
  v_pre_fee_amount numeric(14,2);
  v_fixed_fee_kobo numeric(14,0);
  v_processing_fee_kobo numeric(14,0);
  v_transaction_charge numeric(14,2);
  v_calculation text;
BEGIN
  IF p_delivery_fee IS NULL OR p_delivery_fee < 0 OR p_delivery_fee > 100000000 THEN
    RAISE EXCEPTION 'INVALID_DELIVERY_FEE';
  END IF;
  IF p_delivery_calculation IS NULL OR p_delivery_calculation NOT IN ('NO_DELIVERY','MERCHANT_FLAT_FALLBACK','GEOAPIFY_ROAD_DISTANCE') THEN
    RAISE EXCEPTION 'INVALID_DELIVERY_CALCULATION';
  END IF;
  IF p_delivery_calculation = 'GEOAPIFY_ROAD_DISTANCE' AND p_delivery_distance_km IS NULL THEN
    RAISE EXCEPTION 'INVALID_DELIVERY_DISTANCE';
  END IF;
  IF p_delivery_distance_km IS NOT NULL AND (p_delivery_distance_km < 0 OR p_delivery_distance_km > 1000) THEN
    RAISE EXCEPTION 'INVALID_DELIVERY_DISTANCE';
  END IF;

  v_result := public.sabi_create_public_cart_order(
    p_items, p_customer_name, p_customer_phone, p_customer_email,
    p_delivery_address, p_notes, p_payment_method
  );
  IF COALESCE((v_result->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'ORDER_CREATION_FAILED';
  END IF;

  v_order_id := (v_result->>'order_id')::uuid;
  v_reference := v_result->>'payment_reference';
  SELECT * INTO v_order FROM public.tenant_orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_CREATION_FAILED'; END IF;

  IF p_delivery_calculation = 'NO_DELIVERY' AND p_delivery_fee <> 0 THEN
    RAISE EXCEPTION 'INVALID_DELIVERY_FEE';
  END IF;
  IF p_delivery_calculation <> 'NO_DELIVERY' AND p_delivery_fee <= 0 THEN
    RAISE EXCEPTION 'INVALID_DELIVERY_FEE';
  END IF;

  UPDATE public.tenant_orders
  SET delivery_fee = p_delivery_fee,
      total = subtotal + p_delivery_fee,
      shipping_required = (p_delivery_fee > 0),
      updated_at = now()
  WHERE id = v_order_id AND tenant_id = v_order.tenant_id;

  SELECT * INTO v_intent
  FROM public.tenant_order_payment_intents
  WHERE reference = v_reference AND order_id = v_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_INTENT_NOT_FOUND'; END IF;

  IF v_intent.payment_type = 'ONLINE_ORDER' AND p_payment_method = 'ONLINE' THEN
    v_base_amount := v_order.subtotal + p_delivery_fee;
  ELSIF v_intent.payment_type = 'POD_DELIVERY' AND p_payment_method = 'POD' THEN
    IF p_delivery_fee <= 0 THEN RAISE EXCEPTION 'INVALID_DELIVERY_FEE'; END IF;
    v_base_amount := p_delivery_fee;
  ELSE
    RAISE EXCEPTION 'PAYMENT_TYPE_MISMATCH';
  END IF;

  v_commission := CASE
    WHEN COALESCE(v_order.subtotal,0) < 1000 THEN 20
    WHEN COALESCE(v_order.subtotal,0) <= 2500 THEN 70
    WHEN COALESCE(v_order.subtotal,0) <= 10000 THEN 130
    ELSE 250
  END;
  v_pre_fee_amount := v_base_amount + v_commission + v_service_fee;
  v_fixed_fee_kobo := CASE WHEN v_pre_fee_amount >= 2500 THEN 10000 ELSE 0 END;
  v_processing_fee_kobo := CEIL(((v_pre_fee_amount * 100 * 0.015) + v_fixed_fee_kobo) / 0.985);
  IF v_pre_fee_amount < 2500 AND (v_pre_fee_amount * 100 + v_processing_fee_kobo) >= 250000 THEN
    v_fixed_fee_kobo := 10000;
    v_processing_fee_kobo := CEIL(((v_pre_fee_amount * 100 * 0.015) + v_fixed_fee_kobo) / 0.985);
  END IF;
  v_processing_fee_kobo := LEAST(v_processing_fee_kobo, 200000);
  v_transaction_charge := v_commission + v_service_fee + (v_processing_fee_kobo / 100);

  UPDATE public.tenant_order_payment_intents
  SET expected_amount = v_base_amount + v_transaction_charge,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'base_payment_amount', v_base_amount,
        'commission_basis_amount', v_order.subtotal,
        'merchant_commission_amount', v_commission,
        'customer_service_fee', v_service_fee,
        'paystack_processing_fee', (v_processing_fee_kobo / 100.0),
        'xtop_transaction_charge', v_transaction_charge,
        'sabi_fee_version', 4,
        'whatsapp_delivery_calculation', p_delivery_calculation,
        'whatsapp_delivery_distance_km', p_delivery_distance_km,
        'whatsapp_delivery_fee', p_delivery_fee
      )
  WHERE id = v_intent.id;

  RETURN v_result || jsonb_build_object(
    'delivery_fee', p_delivery_fee,
    'total', v_order.subtotal + p_delivery_fee,
    'payment_amount', v_base_amount + v_transaction_charge,
    'delivery_calculation', p_delivery_calculation,
    'delivery_distance_km', p_delivery_distance_km
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sabi_create_public_cart_order_with_delivery(
  jsonb,text,text,text,text,text,text,numeric,text,numeric
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sabi_create_public_cart_order_with_delivery(
  jsonb,text,text,text,text,text,text,numeric,text,numeric
) TO service_role;
