import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendMonthlyMerchantSalesReportEmail } from "../_shared/sabi-email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sabi-cron-secret",
};

function lagosPreviousMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos", year: "numeric", month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value || "0");
  const month = Number(parts.find((p) => p.type === "month")?.value || "1");
  const currentMonthStart = new Date(Date.UTC(year, month - 1, 1));
  const previousMonthStart = new Date(Date.UTC(year, month - 2, 1));
  const previousMonthEnd = new Date(currentMonthStart);
  previousMonthEnd.setUTCDate(0);
  const utcStart = new Date(previousMonthStart.getTime() - 60 * 60 * 1000);
  const utcEnd = new Date(currentMonthStart.getTime() - 60 * 60 * 1000);
  const monthLabel = new Intl.DateTimeFormat("en-NG", {
    timeZone: "Africa/Lagos", month: "long", year: "numeric",
  }).format(new Date(utcStart.getTime() + 60 * 60 * 1000));
  return {
    start: utcStart.toISOString(),
    end: utcEnd.toISOString(),
    monthStart: previousMonthStart.toISOString().slice(0, 10),
    monthEnd: previousMonthEnd.toISOString().slice(0, 10),
    label: monthLabel,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ success: false, message: "Service configuration is incomplete." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const cronSecret = req.headers.get("x-sabi-cron-secret") || "";
  const { data: authorized, error: authError } = await db.rpc(
    "sabi_is_abandoned_cart_cron_secret", { p_secret: cronSecret },
  );
  if (authError || authorized !== true) {
    return new Response(JSON.stringify({ success: false, message: "Unauthorized." }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const period = lagosPreviousMonth();
  const { data: tenants, error: tenantError } = await db.from("tenants")
    .select("id,business_name,name").eq("is_active", true).eq("is_system", false);
  if (tenantError) {
    console.error("Monthly report tenant lookup failed:", tenantError);
    return new Response(JSON.stringify({ success: false, message: "Could not load merchants." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const tenant of tenants || []) {
    try {
      const { data: owner } = await db.from("tenant_members").select("user_id")
        .eq("tenant_id", tenant.id).eq("role", "OWNER").eq("is_active", true)
        .limit(1).maybeSingle();
      if (!owner?.user_id) { skipped++; continue; }
      const { data: userResult, error: userError } = await db.auth.admin.getUserById(owner.user_id);
      const email = userResult?.user?.email;
      if (userError || !email) { skipped++; continue; }

      const { error: claimError } = await db.from("sabi_merchant_monthly_reports").upsert({
        tenant_id: tenant.id, month_start: period.monthStart, month_end: period.monthEnd,
        recipient_email: email, status: "PROCESSING", updated_at: new Date().toISOString(),
      }, { onConflict: "tenant_id,month_start", ignoreDuplicates: true });
      if (claimError) throw claimError;

      const { data: existing, error: existingError } = await db.from("sabi_merchant_monthly_reports")
        .select("id,status").eq("tenant_id", tenant.id).eq("month_start", period.monthStart).maybeSingle();
      if (existingError) throw existingError;
      if (existing?.status === "SENT") { skipped++; continue; }
      if (!existing?.id) throw new Error("Could not create monthly report record.");

      const { data: orders, error: orderError } = await db.from("tenant_orders")
        .select("id,status,payment_status,total").eq("tenant_id", tenant.id)
        .gte("created_at", period.start).lt("created_at", period.end);
      if (orderError) throw orderError;
      const list = orders || [];
      const paid = list.filter((o: any) => String(o.payment_status || "").toUpperCase() === "PAID");
      const unpaid = list.filter((o: any) =>
        String(o.payment_status || "").toUpperCase() !== "PAID" &&
        String(o.status || "").toUpperCase() !== "CANCELLED"
      );
      const cancelled = list.filter((o: any) => String(o.status || "").toUpperCase() === "CANCELLED");
      const paidRevenue = paid.reduce((sum: number, o: any) => sum + Number(o.total || 0), 0);
      const pendingValue = unpaid.reduce((sum: number, o: any) => sum + Number(o.total || 0), 0);

      const paidIds = paid.map((o: any) => o.id);
      let topProducts: Array<{name:string;quantity:number;revenue:number}> = [];
      if (paidIds.length) {
        const { data: items, error: itemError } = await db.from("tenant_order_items")
          .select("product_name,quantity,line_total,unit_price")
          .eq("tenant_id", tenant.id).in("order_id", paidIds);
        if (itemError) throw itemError;
        const aggregate = new Map<string, {name:string;quantity:number;revenue:number}>();
        for (const item of items || []) {
          const name = String(item.product_name || "Product");
          const row = aggregate.get(name) || { name, quantity: 0, revenue: 0 };
          row.quantity += Number(item.quantity || 0);
          row.revenue += Number(item.line_total ?? Number(item.unit_price || 0) * Number(item.quantity || 0));
          aggregate.set(name, row);
        }
        topProducts = [...aggregate.values()].sort((a,b) => b.quantity - a.quantity).slice(0,5);
      }

      const ok = await sendMonthlyMerchantSalesReportEmail({
        email,
        ownerName: userResult?.user?.user_metadata?.full_name || userResult?.user?.user_metadata?.name || null,
        businessName: tenant.business_name || tenant.name || "Your business",
        monthLabel: period.label, orderCount: list.length, paidOrderCount: paid.length,
        unpaidOrderCount: unpaid.length, cancelledOrderCount: cancelled.length,
        paidRevenue, pendingValue, topProducts,
      });
      if (!ok) throw new Error("Resend did not confirm email delivery.");
      const { error: updateError } = await db.from("sabi_merchant_monthly_reports")
        .update({ status: "SENT", sent_at: new Date().toISOString(), error_message: null, updated_at: new Date().toISOString() })
        .eq("tenant_id", tenant.id).eq("month_start", period.monthStart);
      if (updateError) throw updateError;
      sent++;
    } catch (error) {
      console.error("Monthly merchant report failed for tenant:", tenant.id, error);
      await db.from("sabi_merchant_monthly_reports").upsert({
        tenant_id: tenant.id, month_start: period.monthStart, month_end: period.monthEnd,
        recipient_email: "unavailable", status: "FAILED",
        error_message: String(error).slice(0, 500), updated_at: new Date().toISOString(),
      }, { onConflict: "tenant_id,month_start" });
      failed++;
    }
  }

  return new Response(JSON.stringify({
    success: failed === 0, month: period.label, merchants: (tenants || []).length, sent, skipped, failed,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
