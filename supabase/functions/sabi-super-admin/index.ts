import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const url = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isSuperAdmin(userId: string) {
  return (Deno.env.get("SUPER_ADMIN_USER_IDS") || "")
    .split(",").map((id) => id.trim()).filter(Boolean).includes(userId);
}

async function readBody(req: Request) {
  try {
    const value = await req.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);
  if (!url || !serviceKey) return response({ error: "Server configuration is incomplete" }, 500);

  try {
    const authorization = req.headers.get("Authorization") || "";
    const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
    if (!tokenMatch) return response({ error: "Authentication required" }, 401);

    const { data: authData, error: authError } = await sb.auth.getUser(tokenMatch[1]);
    if (authError || !authData.user) return response({ error: "Invalid or expired login session" }, 401);
    if (!isSuperAdmin(authData.user.id)) return response({ error: "You are not authorized to access the Sabi Super Admin dashboard." }, 403);

    const body = await readBody(req);
    if (!body || typeof body.action !== "string") return response({ error: "A valid action is required" }, 400);

    if (body.action === "overview") {
      const merchantQuery = () => sb.from("tenants").select("id", { count: "exact", head: true }).eq("is_system", false);
      const results = await Promise.all([
        merchantQuery().eq("is_active", true),
        merchantQuery().eq("is_active", false),
        sb.from("products").select("id", { count: "exact", head: true }),
        sb.from("tenant_orders").select("id", { count: "exact", head: true }),
        sb.from("tenant_orders").select("id", { count: "exact", head: true }).eq("payment_status", "PAID"),
        sb.from("tenant_whatsapp_accounts").select("id", { count: "exact", head: true }).eq("is_active", true),
        merchantQuery().in("paystack_subaccount_status", ["PENDING", "PENDING_VERIFICATION"]),
        merchantQuery().eq("paystack_subaccount_status", "VERIFIED"),
        sb.from("tenant_orders").select("id,total,sales_fee_amount,sales_fee_status,payment_status").eq("payment_status", "PAID").limit(10000),
        sb.from("system_settings").select("value").eq("key", "sabi_global_handoff").maybeSingle(),
      ]);
      const errors = results.map((r: any) => r.error).filter(Boolean);
      if (errors.length) return response({ error: "Some platform metrics could not be loaded. Refresh to retry." }, 500);
      const paidRows = results[8].data || [];
      const revenue = paidRows.reduce((sum: number, row: any) => sum + (Number(row.total) || 0), 0);
      // Paystack charge records are the authoritative record of the platform
      // fee split. tenant_orders.sales_fee_amount may remain zero for online
      // orders whose fee was recorded in sabi_order_paystack_charges.
      const paidOrderIds = paidRows.map((row: any) => row.id).filter(Boolean);
      let fees = paidRows.reduce((sum: number, row: any) => sum + (Number(row.sales_fee_amount) || 0), 0);
      if (paidOrderIds.length) {
        const { data: chargeRows, error: chargeError } = await sb
          .from("sabi_order_paystack_charges")
          .select("order_id,xtop_transaction_charge,created_at,settlement_status")
          .in("order_id", paidOrderIds)
          .neq("settlement_status", "REFUNDED")
          .order("created_at", { ascending: false })
          .limit(10000);
        if (chargeError) return response({ error: "Could not load recorded Paystack platform charges." }, 500);
        const latestChargeByOrder = new Map<string, any>();
        for (const charge of chargeRows || []) {
          if (charge.order_id && !latestChargeByOrder.has(charge.order_id)) {
            latestChargeByOrder.set(charge.order_id, charge);
          }
        }
        fees = paidRows.reduce((sum: number, row: any) => {
          const charge = latestChargeByOrder.get(row.id);
          return sum + (charge ? Number(charge.xtop_transaction_charge) || 0 : Number(row.sales_fee_amount) || 0);
        }, 0);
      }
      return response({
        data: {
          activeMerchants: results[0].count || 0,
          inactiveMerchants: results[1].count || 0,
          products: results[2].count || 0,
          orders: results[3].count || 0,
          paidOrders: results[4].count || 0,
          whatsappConnections: results[5].count || 0,
          pendingPayouts: results[6].count || 0,
          verifiedPayouts: results[7].count || 0,
          paidOrderRevenue: revenue,
          recordedSalesFees: fees,
          globalHandoff: results[9].data?.value?.enabled === true,
        },
      });
    }

    if (body.action === "merchants") {
      const [merchantResult, orderResult, productResult, whatsappResult] = await Promise.all([
        sb.from("tenants").select("id,name,business_name,industry,contact_name,contact_email,contact_phone,is_active,created_at,paystack_subaccount_status").eq("is_system", false).order("created_at", { ascending: false }).limit(250),
        sb.from("tenant_orders").select("tenant_id,id,total,payment_status").limit(10000),
        sb.from("products").select("tenant_id,id").limit(10000),
        sb.from("tenant_whatsapp_accounts").select("tenant_id,id,is_active").eq("is_active", true).limit(1000),
      ]);
      if (merchantResult.error || orderResult.error || productResult.error || whatsappResult.error) {
        return response({ error: "Could not load merchant directory" }, 500);
      }
      const orders = orderResult.data || [];
      const products = productResult.data || [];
      const whatsapp = whatsappResult.data || [];
      const merchants = (merchantResult.data || []).map((merchant: any) => {
        const merchantOrders = orders.filter((row: any) => row.tenant_id === merchant.id);
        return {
          ...merchant,
          order_count: merchantOrders.length,
          paid_order_count: merchantOrders.filter((row: any) => row.payment_status === "PAID").length,
          product_count: products.filter((row: any) => row.tenant_id === merchant.id).length,
          whatsapp_connected: whatsapp.some((row: any) => row.tenant_id === merchant.id),
        };
      });
      return response({ data: merchants });
    }

    if (body.action === "orders") {
      const { data: orders, error } = await sb.from("tenant_orders")
        .select("id,tenant_id,order_number,customer_name,status,payment_status,subtotal,delivery_fee,total,sales_fee_amount,sales_fee_status,created_at")
        .order("created_at", { ascending: false }).limit(100);
      if (error) return response({ error: "Could not load platform orders" }, 500);
      const orderIds = (orders || []).map((o: any) => o.id).filter(Boolean);
      const tenantIds = [...new Set((orders || []).map((o: any) => o.tenant_id).filter(Boolean))];
      const [tenantResult, chargeResult] = await Promise.all([
        tenantIds.length
          ? sb.from("tenants").select("id,name,business_name").in("id", tenantIds)
          : Promise.resolve({ data: [], error: null }),
        orderIds.length
          ? sb.from("sabi_order_paystack_charges")
              .select("order_id,xtop_transaction_charge,settlement_status,created_at")
              .in("order_id", orderIds)
              .neq("settlement_status", "REFUNDED")
              .order("created_at", { ascending: false })
              .limit(10000)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (tenantResult.error) return response({ error: "Could not load merchant names for orders" }, 500);
      if (chargeResult.error) return response({ error: "Could not load recorded Paystack charges for orders" }, 500);
      const names = new Map((tenantResult.data || []).map((t: any) => [t.id, t.business_name || t.name || "Merchant"]));
      const latestChargeByOrder = new Map<string, any>();
      for (const charge of chargeResult.data || []) {
        if (charge.order_id && !latestChargeByOrder.has(charge.order_id)) {
          latestChargeByOrder.set(charge.order_id, charge);
        }
      }
      return response({ data: (orders || []).map((o: any) => {
        const charge = latestChargeByOrder.get(o.id);
        return {
          ...o,
          merchant_name: names.get(o.tenant_id) || "Merchant",
          sabi_fee_amount: charge
            ? Number(charge.xtop_transaction_charge) || 0
            : Number(o.sales_fee_amount) || 0,
          sabi_fee_status: charge
            ? (charge.settlement_status || "RECORDED")
            : (o.sales_fee_status || "NOT_CHARGED"),
          sabi_fee_source: charge ? "PAYSTACK_CHARGE_RECORD" : "ORDER_RECORD",
        };
      }) });
    }

    if (body.action === "activity") {
      const { data, error } = await sb.from("audit_logs")
        .select("id,admin_user,action,entity,entity_id,metadata,created_at")
        .order("created_at", { ascending: false }).limit(75);
      if (error) return response({ error: "Could not load the admin activity log" }, 500);
      return response({ data: data || [] });
    }

    if (body.action === "whatsapp-usage") {
      const [usageResult, settingsResult] = await Promise.all([
        sb.from("whatsapp_usage_monthly").select("*").order("billing_month", { ascending: false }).limit(100),
        sb.from("whatsapp_usage_settings").select("*").order("created_at", { ascending: true }),
      ]);
      if (usageResult.error || settingsResult.error) {
        console.error("[WhatsApp Usage]", usageResult.error || settingsResult.error);
        return response({ error: "Could not load WhatsApp usage data." }, 500);
      }
      return response({ data: { monthly: usageResult.data || [], settings: settingsResult.data || [] } });
    }

    if (body.action === "toggle-global-handoff") {
      const reason = String(body.reason || "").trim().slice(0, 500);
      if (typeof body.enabled !== "boolean" || typeof body.expected_enabled !== "boolean" || reason.length < 3) {
        return response({ error: "A target setting, expected current setting and reason (at least 3 characters) are required." }, 400);
      }
      const { data: currentSetting, error: readSettingError } = await sb
        .from("system_settings").select("value").eq("key", "sabi_global_handoff").maybeSingle();
      if (readSettingError) return response({ error: "Could not verify the current global handoff setting." }, 500);
      const previousEnabled = currentSetting?.value?.enabled === true;
      if (previousEnabled !== body.expected_enabled) {
        return response({ error: "The global handoff setting changed elsewhere. Refresh and try again." }, 409);
      }
      if (previousEnabled === body.enabled) return response({ success: true, unchanged: true, enabled: previousEnabled });
      const { error: updateError } = await sb.from("system_settings").upsert({
        key: "sabi_global_handoff",
        value: { enabled: body.enabled },
        updated_at: new Date().toISOString(),
      });
      if (updateError) return response({ error: "Could not update global handoff." }, 500);
      const { error: auditError } = await sb.from("audit_logs").insert({
        admin_user: authData.user.email || authData.user.id,
        action: "SABI_GLOBAL_HANDOFF_CHANGED",
        entity: "system_settings",
        entity_id: "sabi_global_handoff",
        metadata: {
          previous_enabled: previousEnabled,
          new_enabled: body.enabled,
          reason,
          source: "SABI_SUPER_ADMIN",
        },
      });
      if (auditError) {
        await sb.from("system_settings").upsert({
          key: "sabi_global_handoff",
          value: { enabled: previousEnabled },
          updated_at: new Date().toISOString(),
        });
        console.error("[Sabi Super Admin] Audit write failed; handoff change reverted.", auditError);
        return response({ error: "The audit record could not be saved. The handoff change was reverted." }, 500);
      }
      return response({ success: true, enabled: body.enabled, audit_recorded: true });
    }

    if (body.action === "set-merchant-status") {
      const tenantId = String(body.tenant_id || "");
      const reason = String(body.reason || "").trim().slice(0, 500);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId) || typeof body.is_active !== "boolean" || reason.length < 3) {
        return response({ error: "A valid merchant, status and reason are required" }, 400);
      }
      const { data: tenant, error: readError } = await sb.from("tenants")
        .select("id,name,business_name,is_active").eq("id", tenantId).eq("is_system", false).maybeSingle();
      if (readError || !tenant) return response({ error: "Merchant not found" }, 404);
      if (tenant.is_active === body.is_active) return response({ success: true, unchanged: true, is_active: tenant.is_active });
      const { error: updateError } = await sb.from("tenants")
        .update({ is_active: body.is_active, updated_at: new Date().toISOString() }).eq("id", tenantId).eq("is_system", false);
      if (updateError) return response({ error: "Could not update merchant status" }, 500);
      const { error: auditError } = await sb.from("audit_logs").insert({
        admin_user: authData.user.email || authData.user.id,
        action: body.is_active ? "SABI_MERCHANT_REACTIVATED" : "SABI_MERCHANT_SUSPENDED",
        entity: "tenant",
        entity_id: tenantId,
        metadata: {
          previous_is_active: tenant.is_active,
          new_is_active: body.is_active,
          reason,
          merchant_name: tenant.business_name || tenant.name || "Merchant",
          source: "SABI_SUPER_ADMIN",
        },
      });
      if (auditError) {
        await sb.from("tenants").update({ is_active: tenant.is_active, updated_at: new Date().toISOString() })
          .eq("id", tenantId).eq("is_system", false);
        console.error("[Sabi Super Admin] Audit write failed; merchant status change reverted.", auditError);
        return response({ error: "The audit record could not be saved. The merchant status change was reverted." }, 500);
      }
      return response({ success: true, is_active: body.is_active, audit_recorded: true });
    }

    return response({ error: "Unknown Super Admin action" }, 404);
  } catch (error) {
    console.error("[Sabi Super Admin]", error);
    return response({ error: "An unexpected Super Admin error occurred" }, 500);
  }
});
