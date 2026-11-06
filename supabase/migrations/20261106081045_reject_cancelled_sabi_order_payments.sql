-- Applied to Supabase production as migration 20261106081045.
-- A cancelled order must never be confirmed as paid from an old Paystack reference.

CREATE OR REPLACE FUNCTION public.sabi_confirm_order_payment(p_reference text, p_paystack_transaction_id text, p_paid_amount numeric, p_currency text DEFAULT 'NGN'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_intent public.tenant_order_payment_intents%ROWTYPE;
    v_order public.tenant_orders%ROWTYPE;
    v_existing public.sabi_order_paystack_charges%ROWTYPE;
    v_commission numeric(14,2);
    v_service_fee numeric(14,2);
    v_basis numeric(14,2);
    v_transaction_charge numeric(14,2);
    v_base_amount numeric(14,2);
    v_snapshot_base_amount numeric(14,2);
    v_expected_commission numeric(14,2);
BEGIN
    IF p_reference IS NULL OR trim(p_reference) = ''
       OR p_paystack_transaction_id IS NULL
       OR trim(p_paystack_transaction_id) = ''
       OR p_paid_amount IS NULL OR p_paid_amount <= 0 THEN
        RAISE EXCEPTION 'Invalid payment confirmation details';
    END IF;

    SELECT * INTO v_intent
    FROM public.tenant_order_payment_intents
    WHERE reference = p_reference
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Payment reference not found'; END IF;
    IF p_paid_amount <> v_intent.expected_amount THEN
        RAISE EXCEPTION 'Payment amount does not match expected amount';
    END IF;
    IF upper(COALESCE(p_currency, '')) <> upper(v_intent.currency) THEN
        RAISE EXCEPTION 'Payment currency mismatch';
    END IF;

    SELECT * INTO v_order
    FROM public.tenant_orders
    WHERE id = v_intent.order_id AND tenant_id = v_intent.tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Associated order not found'; END IF;

    IF v_order.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'Cancelled orders cannot receive payments';
    END IF;
    IF v_intent.status = 'FAILED' THEN
        RAISE EXCEPTION 'This payment intent has failed';
    END IF;

    v_commission := (v_intent.metadata->>'merchant_commission_amount')::numeric;
    v_service_fee := (v_intent.metadata->>'customer_service_fee')::numeric;
    v_basis := (v_intent.metadata->>'commission_basis_amount')::numeric;
    v_transaction_charge := (v_intent.metadata->>'xtop_transaction_charge')::numeric;
    v_snapshot_base_amount := (v_intent.metadata->>'base_payment_amount')::numeric;

    IF v_commission IS NULL OR v_service_fee IS NULL OR v_basis IS NULL
       OR v_transaction_charge IS NULL OR v_snapshot_base_amount IS NULL THEN
        RAISE EXCEPTION 'Paystack fee calculation snapshot is missing';
    END IF;

    IF v_intent.payment_type = 'ONLINE_ORDER'
       AND v_order.payment_method = 'ONLINE' THEN
        v_base_amount := v_order.subtotal + v_order.delivery_fee;
    ELSIF v_intent.payment_type = 'POD_DELIVERY'
       AND v_order.payment_method = 'POD' THEN
        v_base_amount := v_order.delivery_fee;
    ELSE
        RAISE EXCEPTION 'Payment type does not match order method';
    END IF;

    v_expected_commission := CASE
        WHEN COALESCE(v_order.subtotal, 0) < 1000 THEN 20
        WHEN v_order.subtotal <= 2500 THEN 70
        WHEN v_order.subtotal <= 10000 THEN 130
        ELSE 250
    END;

    IF v_service_fee <> 50
       OR v_basis <> v_order.subtotal
       OR v_commission <> v_expected_commission
       OR v_transaction_charge <> v_commission + v_service_fee
       OR v_snapshot_base_amount <> v_base_amount
       OR round(v_intent.expected_amount, 2) <>
            round(v_base_amount + v_transaction_charge, 2) THEN
        RAISE EXCEPTION 'Invalid Sabi Paystack fee calculation or payment amount';
    END IF;

    IF v_intent.payment_type = 'ONLINE_ORDER' THEN
        IF v_order.payment_status NOT IN ('UNPAID', 'PAID') THEN
            RAISE EXCEPTION 'Invalid order payment status';
        END IF;
        IF v_order.payment_status = 'PAID'
           AND v_order.payment_reference IS DISTINCT FROM p_reference THEN
            RAISE EXCEPTION 'Order already has a different payment reference';
        END IF;
        IF v_intent.status = 'COMPLETED'
           AND v_intent.paystack_transaction_id IS DISTINCT FROM p_paystack_transaction_id THEN
            RAISE EXCEPTION 'Payment reference already used by another transaction';
        END IF;

        UPDATE public.tenant_orders
        SET payment_status = 'PAID',
            payment_reference = p_reference,
            paid_at = COALESCE(paid_at, now()),
            updated_at = now()
        WHERE id = v_order.id;

    ELSIF v_intent.payment_type = 'POD_DELIVERY' THEN
        IF v_order.shipping_payment_required IS DISTINCT FROM true THEN
            RAISE EXCEPTION 'Shipping payment is not required for this order';
        END IF;
        IF v_order.shipping_payment_status NOT IN ('UNPAID', 'PAID') THEN
            RAISE EXCEPTION 'Invalid shipping payment status';
        END IF;
        IF v_order.shipping_payment_status = 'PAID'
           AND v_order.shipping_payment_reference IS DISTINCT FROM p_reference THEN
            RAISE EXCEPTION 'Shipping already has a different payment reference';
        END IF;
        IF v_intent.status = 'COMPLETED'
           AND v_intent.paystack_transaction_id IS DISTINCT FROM p_paystack_transaction_id THEN
            RAISE EXCEPTION 'Payment reference already used by another transaction';
        END IF;

        UPDATE public.tenant_orders
        SET shipping_payment_status = 'PAID',
            shipping_payment_reference = p_reference,
            shipping_paid_at = COALESCE(shipping_paid_at, now()),
            updated_at = now()
        WHERE id = v_order.id;
    ELSE
        RAISE EXCEPTION 'Unsupported payment type';
    END IF;

    UPDATE public.tenant_order_payment_intents
    SET status = 'COMPLETED',
        paystack_transaction_id = p_paystack_transaction_id,
        paystack_status = 'success',
        completed_at = COALESCE(completed_at, now()),
        updated_at = now()
    WHERE id = v_intent.id;

    INSERT INTO public.sabi_order_paystack_charges (
        tenant_id, order_id, payment_intent_id, payment_reference,
        paystack_transaction_id, payment_type, commission_basis_amount,
        merchant_commission_amount, customer_service_fee,
        xtop_transaction_charge, currency, metadata
    )
    VALUES (
        v_intent.tenant_id, v_order.id, v_intent.id, p_reference,
        p_paystack_transaction_id, v_intent.payment_type, v_basis,
        v_commission, v_service_fee, v_transaction_charge,
        upper(v_intent.currency),
        jsonb_build_object(
            'purpose', v_intent.metadata->>'purpose',
            'fee_version', v_intent.metadata->>'sabi_fee_version',
            'base_payment_amount', v_intent.metadata->>'base_payment_amount',
            'settlement_method', 'PAYSTACK_SPLIT'
        )
    )
    ON CONFLICT (order_id) DO NOTHING;

    SELECT * INTO v_existing
    FROM public.sabi_order_paystack_charges
    WHERE order_id = v_order.id;

    IF NOT FOUND
       OR v_existing.tenant_id <> v_intent.tenant_id
       OR v_existing.payment_intent_id <> v_intent.id
       OR v_existing.payment_reference <> p_reference
       OR v_existing.paystack_transaction_id <> p_paystack_transaction_id
       OR v_existing.merchant_commission_amount <> v_commission
       OR v_existing.customer_service_fee <> v_service_fee
       OR v_existing.xtop_transaction_charge <> v_transaction_charge THEN
        RAISE EXCEPTION 'Paystack settlement record conflicts with this payment';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'payment_confirmed', true,
        'payment_type', v_intent.payment_type,
        'order_id', v_order.id,
        'payment_reference', p_reference,
        'commission', v_commission,
        'customer_service_fee', v_service_fee,
        'xtop_transaction_charge', v_transaction_charge,
        'settlement_method', 'PAYSTACK_SPLIT',
        'fulfillment_allowed', true,
        'dispatch_allowed',
            CASE WHEN v_intent.payment_type = 'POD_DELIVERY' THEN true ELSE NULL END
    );
END;
$function$

