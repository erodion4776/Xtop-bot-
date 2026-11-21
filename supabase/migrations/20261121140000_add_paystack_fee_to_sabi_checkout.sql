-- Sabi Paystack processing-fee pass-through (fee version 4).
-- Customer pays a grossed-up local Paystack processing allowance.
-- Merchant allocation and agreed Sabi commission/service fee remain unchanged.

CREATE OR REPLACE FUNCTION public.sabi_prepare_order_paystack_charge()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 v_order public.tenant_orders%ROWTYPE; v_base_amount numeric(14,2); v_basis numeric(14,2);
 v_commission numeric(14,2); v_service_fee numeric(14,2):=50; v_pre_fee_amount numeric(14,2);
 v_processing_fee_kobo numeric(14,0); v_fixed_fee_kobo numeric(14,0); v_transaction_charge numeric(14,2);
BEGIN
 IF COALESCE(NEW.metadata->>'purpose','') NOT IN ('SABI_PUBLIC_ORDER','SABI_MERCHANT_ORDER') THEN RETURN NEW; END IF;
 SELECT * INTO v_order FROM public.tenant_orders WHERE id=NEW.order_id AND tenant_id=NEW.tenant_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sabi order not found for payment intent'; END IF;
 IF NEW.payment_type='ONLINE_ORDER' AND v_order.payment_method='ONLINE' THEN
   v_base_amount:=v_order.subtotal+v_order.delivery_fee;
 ELSIF NEW.payment_type='POD_DELIVERY' AND v_order.payment_method='POD' THEN
   v_base_amount:=v_order.delivery_fee;
 ELSE RAISE EXCEPTION 'Payment type does not match order method'; END IF;
 IF v_base_amount IS NULL OR v_base_amount<=0 THEN RAISE EXCEPTION 'Invalid Sabi payment amount'; END IF;
 v_basis:=COALESCE(v_order.subtotal,0);
 IF v_basis<0 THEN RAISE EXCEPTION 'Invalid Sabi product subtotal'; END IF;
 v_commission:=CASE WHEN v_basis<1000 THEN 20 WHEN v_basis<=2500 THEN 70 WHEN v_basis<=10000 THEN 130 ELSE 250 END;
 v_pre_fee_amount:=v_base_amount+v_commission+v_service_fee;
 v_fixed_fee_kobo:=CASE WHEN v_pre_fee_amount>=2500 THEN 10000 ELSE 0 END;
 v_processing_fee_kobo:=CEIL(((v_pre_fee_amount*100*0.015)+v_fixed_fee_kobo)/0.985);
 IF v_pre_fee_amount<2500 AND (v_pre_fee_amount*100+v_processing_fee_kobo)>=250000 THEN
   v_fixed_fee_kobo:=10000;
   v_processing_fee_kobo:=CEIL(((v_pre_fee_amount*100*0.015)+v_fixed_fee_kobo)/0.985);
 END IF;
 v_processing_fee_kobo:=LEAST(v_processing_fee_kobo,200000);
 v_transaction_charge:=v_commission+v_service_fee+(v_processing_fee_kobo/100);
 NEW.expected_amount:=v_base_amount+v_transaction_charge;
 NEW.metadata:=COALESCE(NEW.metadata,'{}'::jsonb)||jsonb_build_object(
  'base_payment_amount',v_base_amount,'commission_basis_amount',v_basis,
  'merchant_commission_amount',v_commission,'customer_service_fee',v_service_fee,
  'paystack_processing_fee',(v_processing_fee_kobo/100.0),
  'xtop_transaction_charge',v_transaction_charge,'sabi_fee_version',4);
 RETURN NEW;
END;
$function$;

-- Extend the existing atomic payment confirmation checks to validate and record
-- the Paystack allowance as part of the platform split charge.
DO $patch$
DECLARE v_definition text;
BEGIN
 v_definition:=pg_get_functiondef('public.sabi_confirm_order_payment(text,text,numeric,text)'::regprocedure);
 v_definition:=replace(v_definition,'    v_service_fee numeric(14,2);','    v_service_fee numeric(14,2);' || chr(10) || '    v_paystack_fee numeric(14,2);');
 v_definition:=replace(v_definition,'    v_service_fee := (v_intent.metadata->>''customer_service_fee'')::numeric;','    v_service_fee := (v_intent.metadata->>''customer_service_fee'')::numeric;' || chr(10) || '    v_paystack_fee := (v_intent.metadata->>''paystack_processing_fee'')::numeric;');
 v_definition:=replace(v_definition,'       OR v_transaction_charge IS NULL OR v_snapshot_base_amount IS NULL THEN','       OR v_paystack_fee IS NULL OR v_transaction_charge IS NULL OR v_snapshot_base_amount IS NULL THEN');
 v_definition:=replace(v_definition,'       OR v_transaction_charge <> v_commission + v_service_fee','       OR v_paystack_fee < 0' || chr(10) || '       OR v_transaction_charge <> v_commission + v_service_fee + v_paystack_fee');
 v_definition:=replace(v_definition,'            ''base_payment_amount'', v_intent.metadata->>''base_payment_amount'',' || chr(10) || '            ''settlement_method'', ''PAYSTACK_SPLIT''','            ''base_payment_amount'', v_intent.metadata->>''base_payment_amount'',' || chr(10) || '            ''paystack_processing_fee'', v_paystack_fee,' || chr(10) || '            ''settlement_method'', ''PAYSTACK_SPLIT''');
 v_definition:=replace(v_definition,'        ''customer_service_fee'', v_service_fee,' || chr(10) || '        ''xtop_transaction_charge'', v_transaction_charge,','        ''customer_service_fee'', v_service_fee,' || chr(10) || '        ''paystack_processing_fee'', v_paystack_fee,' || chr(10) || '        ''xtop_transaction_charge'', v_transaction_charge,');
 IF position('v_paystack_fee' in v_definition)=0 THEN RAISE EXCEPTION 'Failed to patch payment confirmation'; END IF;
 EXECUTE v_definition;
END;
$patch$;
