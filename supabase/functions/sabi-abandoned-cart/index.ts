import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendAbandonedCartEmail } from "../_shared/sabi-email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ success: false, message: "Service configuration is incomplete." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const cronSecret = req.headers.get("x-sabi-cron-secret") || "";
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authorized, error: authError } = await db.rpc(
    "sabi_is_abandoned_cart_cron_secret",
    { p_secret: cronSecret },
  );
  if (authError || authorized !== true) {
    return new Response(JSON.stringify({ success: false, message: "Unauthorized." }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: carts, error: claimError } = await db.rpc(
    "sabi_claim_abandoned_cart_reminders",
    { p_limit: 25 },
  );

  if (claimError) {
    console.error("Could not claim abandoned carts:", claimError);
    return new Response(JSON.stringify({ success: false, message: "Could not load reminder queue." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  let failed = 0;

  for (const cart of carts || []) {
    const snapshot = (cart.cart_snapshot || {}) as Record<string, unknown>;
    const success = await sendAbandonedCartEmail({
      email: String(cart.customer_email),
      customerName: cart.customer_name,
      businessName: String(snapshot.business_name || "the store"),
      productName: String(snapshot.product_name || "the item you viewed"),
      productPrice: snapshot.product_price as number | string | null,
      quantity: Number(cart.quantity || 1),
      checkoutUrl: String(cart.checkout_url),
    });

    if (success) {
      const { error: sentError } = await db.from("sabi_abandoned_carts")
        .update({ reminder_sent_at: new Date().toISOString(), reminder_claimed_at: null, updated_at: new Date().toISOString() })
        .eq("id", cart.id)
        .is("reminder_sent_at", null);
      if (sentError) {
        console.error("Reminder sent but status update failed for cart:", cart.id, sentError);
        failed++;
      } else {
        sent++;
      }
    } else {
      await db.from("sabi_abandoned_carts")
        .update({ reminder_claimed_at: null, updated_at: new Date().toISOString() })
        .eq("id", cart.id)
        .is("reminder_sent_at", null);
      failed++;
    }
  }

  return new Response(JSON.stringify({ success: true, claimed: (carts || []).length, sent, failed }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
