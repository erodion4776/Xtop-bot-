-- Restrict direct Data API access to tables that intentionally have no
-- client-facing RLS policies. Edge Functions using service_role and
-- SECURITY DEFINER routines owned by the database owner retain their access.
--
-- These tables were already fail-closed by RLS (no policies). This migration
-- removes unnecessary grants as an additional least-privilege safeguard.

REVOKE ALL PRIVILEGES ON TABLE
  public.demo_features,
  public.demo_industries,
  public.demo_template_features,
  public.magazine_sections,
  public.pricing_package_features,
  public.sabi_demo_faqs,
  public.sabi_demo_orders,
  public.sabi_demo_products,
  public.sabi_demo_sessions,
  public.tenant_faqs,
  public.tenant_packages
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE
  public.order_delivery_verifications,
  public.tenant_order_payment_intents,
  public.wallet_topup_intents
FROM authenticated;
