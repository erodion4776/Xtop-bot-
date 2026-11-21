ALTER TABLE public.sabi_order_paystack_charges
  DROP CONSTRAINT IF EXISTS sabi_order_paystack_charges_settlement_status_check;

ALTER TABLE public.sabi_order_paystack_charges
  ADD CONSTRAINT sabi_order_paystack_charges_settlement_status_check
  CHECK (settlement_status IN (
    'RECORDED',
    'PENDING',
    'SETTLED',
    'FAILED',
    'REFUNDED'
  ));

DO $patch$
DECLARE
  v_definition text;
  v_old text := '''settlement_status'', c.settlement_status,';
  v_new text := '''settlement_status'', c.settlement_status,
                                    ''settlement_id'', c.metadata->>''paystack_settlement_id'',
                                    ''settlement_date'', c.metadata->>''paystack_settlement_date'',';
BEGIN
  v_definition := pg_get_functiondef(
    'public.sabi_get_merchant_orders(uuid,integer,integer)'::regprocedure
  );

  IF position(v_old in v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate settlement status field in sabi_get_merchant_orders';
  END IF;

  v_definition := replace(v_definition, v_old, v_new);
  EXECUTE v_definition;
END;
$patch$;
