import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWeeklyMerchantSalesReportEmail } from "../_shared/sabi-email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sabi-cron-secret",
};

function lagosWeekRange(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const todayUtc = new Date(Date.UTC(Number(value("year")), Number(value("month")) - 1, Number(value("day"))));
  const weekday = todayUtc.getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const monday = new Date(todayUtc);
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);
  const previousMonday = new Date(monday);
  previousMonday.setUTCDate(previousMonday.getUTCDate() - 7);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  // Lagos is UTC+1. Use local-midnight boundaries for the previous Monday-Sunday week.
  const start = new Date(previousMonday.getTime() - 60 * 60 * 1000);
  const end = new Date(monday.getTime() - 60 * 60 * 1000);
  const endDay = new Date(monday);
  endDay.setUTCDate(endDay.getUTCDate() - 1);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    weekStart: fmt(previousMonday),
    weekEnd: fmt(endDay),
    label: fmt(previousMonday) + " to " + fmt(endDay),
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

  const range = lagosWeekRange();
  const { data: tenants, error: tenantError } = await db.from("tenants")
    .select("id,business_name,name")
    .eq("is_active", true).eq("is_system", false);
  if (tenantError) {
    console.error("Weekly report tenant lookup failed:", tenantError);
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

      const { data: claim, error: claimError } = await db.from("sabi_merchant_weekly_reports")
        .upsert({
          tenant_id: tenant.id, week_start: range.weekStart, week_end: range.weekEnd,
          recipient_email: email, status: "PROCESSING", updated_at: new Date().toISOString(),
        }, { onConflict: "tenant_id,week_start", ignoreDuplicates: true })
        .select("id,status").maybeSingle();
      if (claimError) throw claimError;

      const { data: existing } = await db.from("sabi_merchant_weekly_reports")
        .select("id,status").eq("tenant_id", tenant.id).eq("week_start", range.weekStart).maybeSingle();
      if (existing?.status === "SENT") { skipped++; continue; }
      if (!existing?.id) throw new Error("Could not create weekly report record.");

      const { data: orders, error: orderError } = await db.from("tenant_orders")
        .select("id,status,payment_status,total")
        .eq("tenant_id", tenant.id)
        .gte("created_at", range.start).lt("created_at", range.end);
      if (orderError) throw orderError;
      const list = orders || [];
      const paid = list.filter((o: any) => String(o.payment_status || "").toUpperCase() === "PAID");
      const unpaid = list.filter((o: any) => String(o.payment_status || "").toUpperCase() !== "PAID" && String(o.status || "").toUpperCase() !== "CANCELLED");
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

      const ok = await sendWeeklyMerchantSalesReportEmail({
        email, ownerName: userResult?.user?.user_metadata?.full_name || userResult?.user?.user_metadata?.name || null,
        businessName: tenant.business_name || tenant.name || "Your business",
        weekLabel: range.label, orderCount: list.length, paidOrderCount: paid.length,
        unpaidOrderCount: unpaid.length, cancelledOrderCount: cancelled.length,
        paidRevenue, pendingValue, topProducts,
      });
      if (!ok) throw new Error("Resend did not confirm email delivery.");
      const { error: updateError } = await db.from("sabi_merchant_weekly_reports")
        .update({ status: "SENT", sent_at: new Date().toISOString(), error_message: null, updated_at: new Date().toISOString() })
        .eq("tenant_id", tenant.id).eq("week_start", range.weekStart);
      if (updateError) throw updateError;
      sent++;
    } catch (error) {
      console.error("Weekly merchant report failed for tenant:", tenant.id, error);
      await db.from("sabi_merchant_weekly_reports").upsert({
        tenant_id: tenant.id, week_start: range.weekStart, week_end: range.weekEnd,
        recipient_email: "unavailable", status: "FAILED",
        error_message: String(error).slice(0, 500), updated_at: new Date().toISOString(),
      }, { onConflict: "tenant_id,week_start" });
      failed++;
    }
  }

  return new Response(JSON.stringify({
    success: failed === 0, week: range.label, merchants: (tenants || []).length, sent, skipped, failed,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
