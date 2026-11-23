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

    // =====================================================
    // =====================================================
    // UNIFIED SABI LIVE SUPPORT — DEMO + GENERAL CUSTOMER HANDOFFS
    // =====================================================
    if (body.action === "support-list") {
      const systemTenantId = "00000000-0000-0000-0000-000000000001";
      const { data: conversations, error: conversationError } = await sb
        .from("conversations")
        .select("id,contact_id,current_module,current_state,context_json,last_message_at,updated_at,agent_mode")
        .eq("tenant_id", systemTenantId)
        .order("last_message_at", { ascending: false })
        .limit(200);
      if (conversationError) return response({ error: "Could not load Sabi support conversations." }, 500);
      const active = (conversations || []).filter((c: any) =>
        (c.current_module === "SABI_SHOP_DEMO" && (c.agent_mode === true || c.context_json?.demo_agent_handoff === true)) ||
        (c.current_module === "SABI_GATEWAY" && c.current_state === "SUPPORT")
      );
      const contactIds = [...new Set(active.map((c: any) => c.contact_id).filter(Boolean))];
      if (!contactIds.length) return response({ data: [] });
      const [{ data: contacts, error: contactError }, { data: messages, error: messageError }] = await Promise.all([
        sb.from("contacts").select("id,phone,name,agent_mode,updated_at").eq("tenant_id", systemTenantId).in("id", contactIds),
        sb.from("messages").select("id,contact_id,direction,message_type,message_text,body,created_at").eq("tenant_id", systemTenantId).in("contact_id", contactIds).order("created_at", { ascending: true }).limit(2000),
      ]);
      if (contactError || messageError) return response({ error: "Could not load Sabi support messages." }, 500);
      const contactMap = new Map((contacts || []).map((c: any) => [c.id, c]));
      return response({ data: active.map((c: any) => ({
        conversation_id: c.id, contact_id: c.contact_id, state: c.current_state,
        kind: c.current_module === "SABI_SHOP_DEMO" ? "DEMO" : "SABI",
        last_message_at: c.last_message_at || c.updated_at,
        contact: contactMap.get(c.contact_id) || null,
        messages: (messages || []).filter((m: any) => m.contact_id === c.contact_id).map((m: any) => ({
          id: m.id, direction: m.direction, type: m.message_type,
          text: m.message_text || m.body || "", created_at: m.created_at,
        })),
      })).filter((c: any) => c.contact).sort((a: any, b: any) =>
        new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()
      ) });
    }

    if (body.action === "support-reply") {
      const contactId = String(body.contact_id || "");
      const conversationId = String(body.conversation_id || "");
      const message = String(body.message || "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(contactId) || !/^[0-9a-f-]{36}$/i.test(conversationId) || !message || message.length > 4000) {
        return response({ error: "Select a customer and enter a message of up to 4,000 characters." }, 400);
      }
      const systemTenantId = "00000000-0000-0000-0000-000000000001";
      const [{ data: contact, error: contactError }, { data: conversation, error: convError }] = await Promise.all([
        sb.from("contacts").select("id,phone").eq("id", contactId).eq("tenant_id", systemTenantId).maybeSingle(),
        sb.from("conversations").select("id,current_module,current_state,context_json").eq("id", conversationId).eq("contact_id", contactId).eq("tenant_id", systemTenantId).maybeSingle(),
      ]);
      const isDemo = conversation?.current_module === "SABI_SHOP_DEMO" && conversation?.context_json?.demo_agent_handoff === true;
      const isGeneral = conversation?.current_module === "SABI_GATEWAY" && conversation?.current_state === "SUPPORT";
      if (contactError || convError || !contact || !conversation || (!isDemo && !isGeneral)) {
        return response({ error: "This customer no longer has an active Sabi support handoff. Refresh the inbox." }, 409);
      }
      const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
      const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
      if (!token || !phoneNumberId) return response({ error: "System WhatsApp sending credentials are not configured." }, 500);
      const waResponse = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: contact.phone, type: "text", text: { preview_url: false, body: message } }),
      });
      const waResult = await waResponse.json().catch(() => ({}));
      if (!waResponse.ok) return response({ error: waResult?.error?.message || "WhatsApp could not send your reply." }, 502);
      const messageId = waResult?.messages?.[0]?.id || null;
      const { error: saveError } = await sb.from("messages").insert({
        contact_id: contactId, tenant_id: systemTenantId, direction: "OUTBOUND",
        message_type: "text", message_text: message, body: message, whatsapp_message_id: messageId,
      });
      if (saveError) return response({ error: "WhatsApp sent the reply, but conversation history could not be saved. Refresh before sending again." }, 500);
      return response({ success: true, whatsapp_message_id: messageId });
    }

    if (body.action === "support-resume") {
      const contactId = String(body.contact_id || "");
      const conversationId = String(body.conversation_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(contactId) || !/^[0-9a-f-]{36}$/i.test(conversationId)) return response({ error: "Select a valid support conversation." }, 400);
      const systemTenantId = "00000000-0000-0000-0000-000000000001";
      const [{ data: contact, error: contactError }, { data: conversation, error: convError }] = await Promise.all([
        sb.from("contacts").select("id,phone").eq("id", contactId).eq("tenant_id", systemTenantId).maybeSingle(),
        sb.from("conversations").select("id,current_module,current_state,context_json").eq("id", conversationId).eq("contact_id", contactId).eq("tenant_id", systemTenantId).maybeSingle(),
      ]);
      const isDemo = conversation?.current_module === "SABI_SHOP_DEMO" && conversation?.context_json?.demo_agent_handoff === true;
      const isGeneral = conversation?.current_module === "SABI_GATEWAY" && conversation?.current_state === "SUPPORT";
      if (contactError || convError || !contact || !conversation || (!isDemo && !isGeneral)) return response({ error: "The active support handoff could not be found." }, 404);
      const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
      const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
      if (!token || !phoneNumberId) return response({ error: "System WhatsApp sending credentials are not configured." }, 500);
      const resumeText = isDemo
        ? "🤖 Human support has ended. Welcome back to the Sabi Demo Shop! Your shopping session is saved. Reply *menu* to continue browsing, or tell me what product you are looking for."
        : "🤖 Thank you for contacting Sabi Support. Your support session has ended. You can continue using Sabi by typing *menu*.";
      const waResponse = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: contact.phone, type: "text", text: { body: resumeText } }),
      });
      const waResult = await waResponse.json().catch(() => ({}));
      if (!waResponse.ok) return response({ error: waResult?.error?.message || "WhatsApp could not send the return-to-bot message. The support session remains open." }, 502);
      const nextContext: Record<string, any> = isDemo ? { ...(conversation.context_json || {}) } : { sabi_gateway: true };
      delete nextContext.demo_agent_handoff;
      delete nextContext.agent_mode;
      const [{ error: contactUpdateError }, { error: conversationUpdateError }] = await Promise.all([
        sb.from("contacts").update({ agent_mode: false, updated_at: new Date().toISOString() }).eq("id", contactId).eq("tenant_id", systemTenantId),
        sb.from("conversations").update({
          current_module: isDemo ? "SABI_SHOP_DEMO" : "SABI_GATEWAY",
          current_state: isDemo ? "SHOPPING" : "MENU",
          context_json: nextContext, agent_mode: false, updated_at: new Date().toISOString(),
        }).eq("id", conversationId).eq("tenant_id", systemTenantId),
      ]);
      if (contactUpdateError || conversationUpdateError) return response({ error: "The customer received the message, but bot state could not be restored. Please refresh and check the conversation." }, 500);
      await sb.from("messages").insert({ contact_id: contactId, tenant_id: systemTenantId, direction: "OUTBOUND", message_type: "text", message_text: resumeText, body: resumeText, whatsapp_message_id: waResult?.messages?.[0]?.id || null });
      return response({ success: true, kind: isDemo ? "DEMO" : "SABI" });
    }

    // SABI DEMO LIVE SUPPORT — SUPER ADMIN ONLY
    // =====================================================
    if (body.action === "demo-support-list") {
      const systemTenantId = "00000000-0000-0000-0000-000000000001";
      const { data: conversations, error: conversationError } = await sb
        .from("conversations")
        .select("id,contact_id,current_module,current_state,context_json,last_message_at,agent_mode")
        .eq("tenant_id", systemTenantId)
        .eq("current_module", "SABI_SHOP_DEMO")
        .order("last_message_at", { ascending: false })
        .limit(100);
      if (conversationError) return response({ error: "Could not load demo conversations." }, 500);
      const active = (conversations || []).filter((c: any) =>
        c.agent_mode === true || c.context_json?.demo_agent_handoff === true
      );
      const contactIds = active.map((c: any) => c.contact_id).filter(Boolean);
      if (!contactIds.length) return response({ data: [] });
      const [{ data: contacts, error: contactError }, { data: messages, error: messageError }] = await Promise.all([
        sb.from("contacts").select("id,phone,name,agent_mode,updated_at").eq("tenant_id", systemTenantId).in("id", contactIds),
        sb.from("messages").select("id,contact_id,direction,message_type,message_text,body,created_at").eq("tenant_id", systemTenantId).in("contact_id", contactIds).order("created_at", { ascending: true }).limit(1000),
      ]);
      if (contactError || messageError) return response({ error: "Could not load demo support messages." }, 500);
      const contactMap = new Map((contacts || []).map((c: any) => [c.id, c]));
      return response({ data: active.map((c: any) => ({
        conversation_id: c.id, contact_id: c.contact_id, state: c.current_state,
        last_message_at: c.last_message_at, contact: contactMap.get(c.contact_id) || null,
        messages: (messages || []).filter((m: any) => m.contact_id === c.contact_id).map((m: any) => ({
          id: m.id, direction: m.direction, type: m.message_type,
          text: m.message_text || m.body || "", created_at: m.created_at,
        })),
      })).filter((c: any) => c.contact) });
    }

    if (body.action === "demo-support-reply") {
      const contactId = String(body.contact_id || "");
      const message = String(body.message || "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(contactId) || !message || message.length > 4000) {
        return response({ error: "Select a customer and enter a message of up to 4,000 characters." }, 400);
      }
      const systemTenantId = "00000000-0000-0000-0000-000000000001";
      const { data: contact, error: contactError } = await sb.from("contacts")
        .select("id,phone,agent_mode").eq("id", contactId).eq("tenant_id", systemTenantId).maybeSingle();
      if (contactError || !contact) return response({ error: "Demo customer not found." }, 404);
      const { data: conversation, error: convError } = await sb.from("conversations")
        .select("id,current_module,context_json,agent_mode").eq("contact_id", contactId)
        .eq("tenant_id", systemTenantId).eq("current_module", "SABI_SHOP_DEMO").maybeSingle();
      if (convError || !conversation || conversation.context_json?.demo_agent_handoff !== true) {
        return response({ error: "This customer is not currently waiting for a live demo agent." }, 409);
      }
      const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
      const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
      if (!token || !phoneNumberId) return response({ error: "System WhatsApp sending credentials are not configured." }, 500);
      const waResponse = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: contact.phone, type: "text", text: { preview_url: false, body: message } }),
      });
      const waResult = await waResponse.json().catch(() => ({}));
      if (!waResponse.ok) {
        console.error("[Sabi demo support send]", waResponse.status, waResult);
        return response({ error: waResult?.error?.message || "WhatsApp could not send your reply." }, 502);
      }
      const messageId = waResult?.messages?.[0]?.id || null;
      const { error: saveError } = await sb.from("messages").insert({
        contact_id: contactId, tenant_id: systemTenantId, direction: "OUTBOUND",
        message_type: "text", message_text: message, body: message, whatsapp_message_id: messageId,
      });
      if (saveError) {
        console.error("[Sabi demo support message save]", saveError);
        return response({ error: "WhatsApp sent the reply, but the conversation history could not be saved. Refresh before sending again." }, 500);
      }
      return response({ success: true, whatsapp_message_id: messageId });
    }

    if (body.action === "demo-support-resume") {
      const contactId = String(body.contact_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(contactId)) return response({ error: "Select a valid demo customer." }, 400);
      const systemTenantId = "00000000-0000-0000-0000-000000000001";
      const { data: contact, error: contactError } = await sb.from("contacts")
        .select("id,phone").eq("id", contactId).eq("tenant_id", systemTenantId).maybeSingle();
      const { data: conversation, error: convError } = await sb.from("conversations")
        .select("id,current_state,context_json").eq("contact_id", contactId).eq("tenant_id", systemTenantId)
        .eq("current_module", "SABI_SHOP_DEMO").maybeSingle();
      if (contactError || convError || !contact || !conversation || conversation.context_json?.demo_agent_handoff !== true) {
        return response({ error: "The live demo handoff could not be found." }, 404);
      }
      const nextContext = { ...(conversation.context_json || {}) };
      delete nextContext.demo_agent_handoff;
      delete nextContext.agent_mode;
      const [{ error: contactUpdateError }, { error: conversationUpdateError }] = await Promise.all([
        sb.from("contacts").update({ agent_mode: false, updated_at: new Date().toISOString() }).eq("id", contactId).eq("tenant_id", systemTenantId),
        sb.from("conversations").update({ current_module: "SABI_SHOP_DEMO", current_state: "SHOPPING", context_json: nextContext, agent_mode: false, updated_at: new Date().toISOString() }).eq("id", conversation.id).eq("tenant_id", systemTenantId),
      ]);
      if (contactUpdateError || conversationUpdateError) return response({ error: "Could not restore the demo bot. Please retry." }, 500);
      const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
      const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
      if (!token || !phoneNumberId) return response({ error: "System WhatsApp sending credentials are not configured." }, 500);
      const resumeText = "🤖 Human support has ended. Welcome back to the Sabi Demo Shop! Your shopping session is saved. Reply *menu* to continue browsing, or tell me what product you are looking for.";
      const waResponse = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: contact.phone, type: "text", text: { body: resumeText } }),
      });
      const waResult = await waResponse.json().catch(() => ({}));
      if (!waResponse.ok) return response({ error: waResult?.error?.message || "Bot mode was restored, but WhatsApp could not send the confirmation." }, 502);
      await sb.from("messages").insert({ contact_id: contactId, tenant_id: systemTenantId, direction: "OUTBOUND", message_type: "text", message_text: resumeText, body: resumeText, whatsapp_message_id: waResult?.messages?.[0]?.id || null });
      return response({ success: true });
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


    if (body.action === "email-campaign-data") {
      const [{ data: owners, error: ownersError }, { count: customerCount, error: customersError }, { data: campaigns, error: campaignsError }] = await Promise.all([
        sb.from("tenant_members").select("tenant_id,user_id").eq("role", "OWNER").eq("is_active", true).limit(1000),
        sb.from("sabi_platform_email_subscribers").select("id", { count: "exact", head: true }).eq("status", "SUBSCRIBED"),
        sb.from("sabi_platform_email_campaigns").select("id,subject,audience,recipient_count,sent_count,failed_count,status,created_at,completed_at").order("created_at", { ascending: false }).limit(30),
      ]);
      if (ownersError || customersError || campaignsError) return response({ error: "Could not load platform email campaign data." }, 500);
      const uniqueOwners = new Map<string, { email: string; name: string }>();
      for (const owner of owners || []) {
        const { data: userResult } = await sb.auth.admin.getUserById(owner.user_id);
        const email = String(userResult?.user?.email || "").trim().toLowerCase();
        if (email && !uniqueOwners.has(email)) uniqueOwners.set(email, {
          email, name: String(userResult?.user?.user_metadata?.full_name || userResult?.user?.user_metadata?.name || "Sabi merchant"),
        });
      }
      return response({ data: {
        merchant_count: uniqueOwners.size, customer_count: customerCount || 0,
        campaigns: campaigns || [],
      } });
    }

    if (body.action === "email-campaign-send") {
      const audience = String(body.audience || "");
      const subject = String(body.subject || "").trim();
      const content = String(body.content || "").trim();
      if (!["MERCHANTS", "CUSTOMERS", "ALL"].includes(audience)) return response({ error: "Choose a valid email audience." }, 400);
      if (subject.length < 3 || subject.length > 120 || content.length < 10 || content.length > 12000) {
        return response({ error: "Enter a subject (3–120 characters) and message (10–12,000 characters)." }, 400);
      }
      const apiKey = Deno.env.get("RESEND_API_KEY") || "";
      if (!apiKey) return response({ error: "The Sabi email service is not configured (RESEND_API_KEY)." }, 500);
      const recipients: Array<{ email: string; type: "MERCHANT" | "CUSTOMER"; name: string }> = [];
      if (audience === "MERCHANTS" || audience === "ALL") {
        const { data: owners, error: ownersError } = await sb.from("tenant_members")
          .select("tenant_id,user_id").eq("role", "OWNER").eq("is_active", true).limit(1000);
        if (ownersError) return response({ error: "Could not retrieve merchant email recipients." }, 500);
        const seen = new Set<string>();
        for (const owner of owners || []) {
          const [{ data: userResult }, { data: tenant }] = await Promise.all([
            sb.auth.admin.getUserById(owner.user_id),
            sb.from("tenants").select("business_name,name").eq("id", owner.tenant_id).maybeSingle(),
          ]);
          const email = String(userResult?.user?.email || "").trim().toLowerCase();
          if (email && !seen.has(email)) {
            seen.add(email);
            recipients.push({ email, type: "MERCHANT", name: String(userResult?.user?.user_metadata?.full_name || tenant?.business_name || tenant?.name || "Sabi merchant") });
          }
        }
      }
      if (audience === "CUSTOMERS" || audience === "ALL") {
        const { data: customers, error: customerError } = await sb.from("sabi_platform_email_subscribers")
          .select("email,full_name").eq("status", "SUBSCRIBED").limit(1000);
        if (customerError) return response({ error: "Could not retrieve opted-in platform customer emails." }, 500);
        const seen = new Set(recipients.map((r) => r.email));
        for (const customer of customers || []) {
          const email = String(customer.email || "").trim().toLowerCase();
          if (email && !seen.has(email)) {
            seen.add(email);
            recipients.push({ email, type: "CUSTOMER", name: String(customer.full_name || "there") });
          }
        }
      }
      if (!recipients.length) return response({ error: "There are no eligible recipients in this audience yet. Customers must explicitly subscribe to Sabi platform updates." }, 400);
      if (recipients.length > 500) return response({ error: "This campaign has more than 500 eligible recipients. Narrow the audience before sending." }, 400);

      const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
      const paragraphs = content.split(/\n{2,}/).map((part) => "<p style=\"margin:0 0 14px;line-height:1.7\">" + escapeHtml(part).replace(/\n/g, "<br>") + "</p>").join("");
      const html = '<!doctype html><html><body style="margin:0;background:#f3f7f4;font-family:Arial,sans-serif;color:#26372d;padding:24px 12px"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:auto;background:#fff;border-radius:14px;overflow:hidden"><tr><td align="center" style="background:#145b3b;padding:24px"><img src="https://i.ibb.co/N2b6rJnY/Untitled-design-20261030-044935-0000.png" alt="Sabi by XTOP" width="145" style="display:block;max-width:100%;height:auto"><p style="color:#dceee3;font-size:12px;margin:10px 0 0">Sell smarter. Serve better.</p></td></tr><tr><td style="padding:28px"><h1 style="font-size:22px;color:#183d2b;margin:0 0 20px">' + escapeHtml(subject) + '</h1>' + paragraphs + '<p style="font-size:12px;color:#68776e;margin-top:26px">You are receiving this email as a Sabi merchant or because you subscribed to Sabi platform updates. For help, visit <a href="https://sabibyxtop.com.ng">sabibyxtop.com.ng</a>.</p></td></tr><tr><td style="padding:16px 28px;background:#f7faf8;color:#7b8981;font-size:11px">© ' + new Date().getFullYear() + ' XTOP Retail Technologies · Sabi by XTOP</td></tr></table></body></html>';
      const plain = content + "\n\nSabi by XTOP · XTOP Retail Technologies\nhttps://sabibyxtop.com.ng";
      const { data: campaign, error: campaignError } = await sb.from("sabi_platform_email_campaigns").insert({
        subject, html_content: html, text_content: plain, audience, recipient_count: recipients.length,
        created_by: authData.user.id, status: "SENDING",
      }).select("id").single();
      if (campaignError || !campaign) return response({ error: "Could not create the email campaign record." }, 500);
      const rows = recipients.map((r) => ({ campaign_id: campaign.id, email: r.email, recipient_type: r.type, recipient_name: r.name }));
      const { error: rowsError } = await sb.from("sabi_platform_email_campaign_recipients").insert(rows);
      if (rowsError) {
        await sb.from("sabi_platform_email_campaigns").update({ status: "FAILED", failed_count: recipients.length, completed_at: new Date().toISOString() }).eq("id", campaign.id);
        return response({ error: "Could not prepare campaign recipients. No emails were sent." }, 500);
      }

      let sent = 0;
      let failed = 0;
      for (let i = 0; i < recipients.length; i += 10) {
        const batch = recipients.slice(i, i + 10);
        const results = await Promise.all(batch.map(async (recipient) => {
          try {
            const res = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
              body: JSON.stringify({ from: "Sabi by XTOP <noreply@mail.sabibyxtop.com.ng>", to: [recipient.email], subject, html, text: plain }),
            });
            const data = await res.json().catch(() => ({}));
            return { email: recipient.email, ok: res.ok, id: data?.id || null, error: res.ok ? null : String(data?.message || data?.error || "Email provider rejected the message").slice(0, 500) };
          } catch (e) {
            return { email: recipient.email, ok: false, id: null, error: String(e).slice(0, 500) };
          }
        }));
        for (const result of results) {
          if (result.ok) sent++; else failed++;
          await sb.from("sabi_platform_email_campaign_recipients").update({
            status: result.ok ? "SENT" : "FAILED", provider_message_id: result.id,
            error_message: result.error, sent_at: result.ok ? new Date().toISOString() : null,
          }).eq("campaign_id", campaign.id).eq("email", result.email);
        }
      }
      const status = sent === recipients.length ? "SENT" : sent > 0 ? "PARTIAL" : "FAILED";
      await sb.from("sabi_platform_email_campaigns").update({
        sent_count: sent, failed_count: failed, status, completed_at: new Date().toISOString(),
      }).eq("id", campaign.id);
      await sb.from("audit_logs").insert({
        admin_user: authData.user.email || authData.user.id, action: "SABI_PLATFORM_EMAIL_CAMPAIGN_SENT",
        entity: "email_campaign", entity_id: campaign.id,
        metadata: { audience, subject, recipient_count: recipients.length, sent_count: sent, failed_count: failed, source: "SABI_SUPER_ADMIN" },
      });
      return response({ success: true, campaign_id: campaign.id, recipient_count: recipients.length, sent_count: sent, failed_count: failed, status });
    }

    return response({ error: "Unknown Super Admin action" }, 404);
  } catch (error) {
    console.error("[Sabi Super Admin]", error);
    return response({ error: "An unexpected Super Admin error occurred" }, 500);
  }
});
