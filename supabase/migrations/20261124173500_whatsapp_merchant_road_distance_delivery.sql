CREATE OR REPLACE FUNCTION public.sabi_create_public_cart_order_with_delivery(p_items jsonb, p_customer_name text, p_customer_phone text, p_customer_email text, p_delivery_address text, p_notes text, p_payment_method text, p_delivery_fee numeric, p_delivery_calculation text, p_delivery_distance_km numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item jsonb;
  v_product public.products%ROWTYPE;
  v_tenant public.tenants%ROWTYPE;
  v_tenant_id uuid := NULL;
  v_order_id uuid := gen_random_uuid();
  v_order_number text;
  v_reference text;
  v_subtotal numeric(14,2) := 0;
  v_shipping_fee numeric(14,2) := 0;
  v_total numeric(14,2);
  v_payment_amount numeric(14,2);
  v_payment_type text;
  v_shipping_payment_required boolean := false;
  v_shipping_status text := 'NOT_REQUIRED';
  v_customer_token text;
  v_customer_token_hash text;
  v_product_id uuid;
  v_quantity integer;
  v_seen uuid[] := ARRAY[]::uuid[];
BEGIN
  IF jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) < 1
     OR jsonb_array_length(p_items) > 30 THEN
    RAISE EXCEPTION 'Cart must contain between 1 and 30 products';
  END IF;

  IF COALESCE(trim(p_customer_name), '') = ''
     OR COALESCE(trim(p_customer_phone), '') = ''
     OR COALESCE(trim(p_customer_email), '') = ''
     OR COALESCE(trim(p_delivery_address), '') = '' THEN
    RAISE EXCEPTION 'Complete customer details are required';
  END IF;

  IF p_payment_method NOT IN ('ONLINE', 'POD') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  IF p_customer_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
    RAISE EXCEPTION 'A valid customer email is required';
  END IF;

  -- Resolve and lock one merchant for the entire cart.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity < 1 OR v_quantity > 100 THEN
      RAISE EXCEPTION 'Invalid product or quantity in cart';
    END IF;
    IF v_product_id = ANY(v_seen) THEN
      RAISE EXCEPTION 'Duplicate product rows are not allowed in cart';
    END IF;
    v_seen := array_append(v_seen, v_product_id);

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_product_id AND status = 'ACTIVE' AND is_active = true
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'A cart product is unavailable'; END IF;

    IF v_tenant_id IS NULL THEN
      v_tenant_id := v_product.tenant_id;
      SELECT * INTO v_tenant FROM public.tenants
      WHERE id = v_tenant_id AND is_active = true AND is_system = false
      FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Merchant is unavailable'; END IF;
    ELSIF v_product.tenant_id <> v_tenant_id THEN
      RAISE EXCEPTION 'A cart cannot contain products from different shops';
    END IF;

    IF v_product.stock_quantity < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for %', v_product.name;
    END IF;
    v_subtotal := v_subtotal + round(v_product.price * v_quantity, 2);
  END LOOP;

  IF p_delivery_fee IS NULL OR p_delivery_fee < 0 OR p_delivery_fee > 100000000 THEN
    RAISE EXCEPTION 'INVALID_DELIVERY_FEE';
  END IF;
  IF p_delivery_calculation IS NULL OR p_delivery_calculation NOT IN
    ('NO_DELIVERY', 'MERCHANT_FLAT_FALLBACK', 'GEOAPIFY_ROAD_DISTANCE') THEN
    RAISE EXCEPTION 'INVALID_DELIVERY_CALCULATION';
  END IF;
  IF p_delivery_distance_km IS NOT NULL AND
    (p_delivery_distance_km < 0 OR p_delivery_distance_km > 1000) THEN
    RAISE EXCEPTION 'INVALID_DELIVERY_DISTANCE';
  END IF;
  IF p_delivery_calculation = 'GEOAPIFY_ROAD_DISTANCE' AND p_delivery_distance_km IS NULL THEN
    RAISE EXCEPTION 'INVALID_DELIVERY_DISTANCE';
  END IF;

  IF v_tenant.shipping_enabled IS TRUE THEN
    IF p_delivery_calculation = 'NO_DELIVERY' OR p_delivery_fee <= 0 THEN
      RAISE EXCEPTION 'INVALID_DELIVERY_FEE';
    END IF;
    v_shipping_fee := p_delivery_fee;
  ELSE
    IF p_delivery_calculation <> 'NO_DELIVERY' OR p_delivery_fee <> 0 THEN
      RAISE EXCEPTION 'DELIVERY_DISABLED_FOR_MERCHANT';
    END IF;
    v_shipping_fee := 0;
  END IF;
  v_total := v_subtotal + v_shipping_fee;

  IF p_payment_method = 'POD' THEN
    IF v_tenant.pod_enabled IS DISTINCT FROM true
       OR v_tenant.shipping_enabled IS DISTINCT FROM true
       OR v_shipping_fee <= 0
       OR v_tenant.require_shipping_payment_before_dispatch IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Pay on Delivery is not available for this shop';
    END IF;
    v_shipping_payment_required := true;
    v_shipping_status := 'UNPAID';
    v_payment_type := 'POD_DELIVERY';
    v_payment_amount := v_shipping_fee;
  ELSE
    v_payment_type := 'ONLINE_ORDER';
    v_payment_amount := v_total;
  END IF;

  v_order_number := 'SABI-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(v_order_id::text, '-', ''), 1, 8));
  v_reference := 'SABI-ORDER-' || replace(gen_random_uuid()::text, '-', '');
  v_customer_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_customer_token_hash := encode(
    extensions.digest(convert_to(v_customer_token, 'UTF8'), 'sha256'), 'hex'
  );

  INSERT INTO public.tenant_orders (
    id, tenant_id, customer_name, customer_phone, order_number, status,
    payment_status, subtotal, delivery_fee, total, currency, delivery_address,
    notes, source, shipping_required, shipping_payment_required,
    shipping_payment_status, payment_method, customer_confirmation_token_hash
  ) VALUES (
    v_order_id, v_tenant_id, trim(p_customer_name), trim(p_customer_phone),
    v_order_number, 'PENDING', 'UNPAID', v_subtotal, v_shipping_fee, v_total,
    'NGN', trim(p_delivery_address), NULLIF(trim(COALESCE(p_notes, '')), ''),
    'WHATSAPP', v_shipping_fee > 0, v_shipping_payment_required,
    v_shipping_status, p_payment_method, v_customer_token_hash
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    SELECT * INTO v_product FROM public.products
    WHERE id = v_product_id AND tenant_id = v_tenant_id;
    UPDATE public.products SET stock_quantity = stock_quantity - v_quantity
    WHERE id = v_product_id AND tenant_id = v_tenant_id;
    INSERT INTO public.tenant_order_items (
      tenant_id, order_id, product_id, product_name, quantity, unit_price, line_total
    ) VALUES (
      v_tenant_id, v_order_id, v_product.id, v_product.name, v_quantity,
      v_product.price, round(v_product.price * v_quantity, 2)
    );
  END LOOP;

  INSERT INTO public.tenant_order_payment_intents (
    tenant_id, order_id, payment_type, reference, expected_amount, currency,
    customer_email, status, metadata
  ) VALUES (
    v_tenant_id, v_order_id, v_payment_type, v_reference, v_payment_amount,
    'NGN', lower(trim(p_customer_email)), 'PENDING',
    jsonb_build_object('purpose', 'SABI_PUBLIC_ORDER', 'order_number', v_order_number,
      'payment_method', p_payment_method, 'source', 'WHATSAPP',
      'delivery_calculation', p_delivery_calculation,
      'delivery_distance_km', p_delivery_distance_km,
      'delivery_fee', v_shipping_fee)
  );

  RETURN jsonb_build_object(
    'success', true, 'order_id', v_order_id, 'order_number', v_order_number,
    'payment_reference', v_reference, 'payment_type', v_payment_type,
    'payment_method', p_payment_method, 'subtotal', v_subtotal,
    'delivery_fee', v_shipping_fee, 'total', v_total,
    'payment_amount', v_payment_amount, 'currency', 'NGN',
    'shipping_payment_required', v_shipping_payment_required,
    'customer_confirmation_token', v_customer_token,
    'tenant_id', v_tenant_id,
    'delivery_calculation', p_delivery_calculation,
    'delivery_distance_km', p_delivery_distance_km
  );
END;
$function$
;

REVOKE ALL ON FUNCTION public.sabi_create_public_cart_order_with_delivery(jsonb,text,text,text,text,text,text,numeric,text,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sabi_create_public_cart_order_with_delivery(jsonb,text,text,text,text,text,text,numeric,text,numeric) TO service_role;
