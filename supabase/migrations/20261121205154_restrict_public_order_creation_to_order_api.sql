-- Stock-mutating public order RPCs are called by the order-api Edge Function
-- through its service_role client. Browser clients must not call these RPCs
-- directly, which would bypass the Edge Function's checkout controls.
REVOKE EXECUTE ON FUNCTION
  public.sabi_create_public_cart_order(jsonb, text, text, text, text, text, text),
  public.sabi_create_public_order(uuid, integer, text, text, text, text, text, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.sabi_create_public_cart_order(jsonb, text, text, text, text, text, text),
  public.sabi_create_public_order(uuid, integer, text, text, text, text, text, text)
TO service_role;
