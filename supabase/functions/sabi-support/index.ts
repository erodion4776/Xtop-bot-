import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return respond({ error: "Sign in to use Sabi Support." }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error: authError } = await userClient.auth.getUser(token);
    if (authError || !auth.user) return respond({ error: "Your session has expired. Sign in again." }, 401);

    const body = await req.json().catch(() => ({}));
    const tenantId = typeof body.tenant_id === "string" ? body.tenant_id : "";
    const action = body.action === "send" ? "send" : "history";
    if (!tenantId) return respond({ error: "Merchant workspace is required." }, 400);

    const { data: member } = await admin.from("tenant_members")
      .select("tenant_id").eq("tenant_id", tenantId).eq("user_id", auth.user.id)
      .eq("is_active", true).maybeSingle();
    if (!member) return respond({ error: "You do not have access to this merchant workspace." }, 403);

    const { data: tenant } = await admin.from("tenants")
      .select("id, business_name, name, industry, is_active").eq("id", tenantId).maybeSingle();
    if (!tenant || tenant.is_active === false) return respond({ error: "This merchant workspace is unavailable." }, 403);

    let { data: conversation } = await admin.from("sabi_support_conversations")
      .select("id, status, subject, last_message_at").eq("tenant_id", tenantId)
      .eq("user_id", auth.user.id).in("status", ["open", "waiting_human"])
      .order("last_message_at", { ascending: false }).limit(1).maybeSingle();

    if (!conversation) {
      const { data, error } = await admin.from("sabi_support_conversations")
        .insert({ tenant_id: tenantId, user_id: auth.user.id })
        .select("id, status, subject, last_message_at").single();
      if (error || !data) return respond({ error: "Unable to start a support conversation." }, 500);
      conversation = data;
    }

    if (action === "history") {
      const { data, error } = await admin.from("sabi_support_messages")
        .select("id, sender_role, content, created_at").eq("conversation_id", conversation.id)
        .eq("tenant_id", tenantId).order("created_at", { ascending: true }).limit(50);
      if (error) return respond({ error: "Unable to load support messages." }, 500);
      return respond({ success: true, conversation, messages: data || [] });
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 3000) return respond({ error: "Enter a message of up to 3,000 characters." }, 400);
    const { error: saveError } = await admin.from("sabi_support_messages").insert({
      conversation_id: conversation.id, tenant_id: tenantId, sender_role: "merchant", content: message,
    });
    if (saveError) return respond({ error: "Unable to save your message." }, 500);

    if (conversation.status === "waiting_human") {
      const waiting = "Your message has been added to your support request. A Sabi support team member will follow up here.";
      const { data } = await admin.from("sabi_support_messages").insert({
        conversation_id: conversation.id, tenant_id: tenantId, sender_role: "assistant", content: waiting,
      }).select("id, sender_role, content, created_at").single();
      return respond({ success: true, conversation, reply: data || { sender_role: "assistant", content: waiting } });
    }

    const [products, orders, recent] = await Promise.all([
      admin.from("products").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      admin.from("tenant_orders").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      admin.from("tenant_orders").select("order_number, status, payment_status, total, created_at")
        .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(5),
    ]);
    const context = {
      business: tenant.business_name || tenant.name,
      industry: tenant.industry || "Not specified",
      products_listed: products.count ?? 0,
      total_orders: orders.count ?? 0,
      recent_orders: recent.data || [],
    };

    const prompt = `You are Sabi Support, a warm and practical platform-support assistant for Sabi by XTOP, a WhatsApp commerce platform for Nigerian merchants. You are speaking to a merchant, not their shoppers. Give concise, clear instructions suitable for mobile users.

Use only the verified facts below. Never invent payment, settlement, WhatsApp, order, or account status. Never expose another merchant's information. If you cannot verify an answer, say so plainly. Never ask for passwords, OTPs, API tokens, bank PINs, or full card details. Do not promise or execute refunds, payouts, account changes, or financial actions. A successful Paystack transaction alone does not prove bank settlement.

Sabi guidance:
- Merchant dashboard: https://app.sabibyxtop.com.ng
- Manage products in Products; manage orders in Orders.
- Customer Service is for the merchant's own shoppers. This chat is for help with the Sabi platform.
- WhatsApp onboarding/connection: https://connect.sabibyxtop.com.ng
- Sabi does not require subscriptions or trials.
- Sabi sales commission is based on product subtotal; delivery fee is excluded.
- For payment or settlement disputes, explain that a human investigation may be needed. Do not claim a settlement is complete without authoritative evidence.

Verified facts for this merchant only:
${JSON.stringify(context)}

Merchant message:
${message}

Answer as Sabi Support. If unsure, state what cannot be verified and recommend contacting Sabi support for a human review.`;

    const account = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
    const apiToken = Deno.env.get("CLOUDFLARE_API_TOKEN");
    if (!account || !apiToken) return respond({ error: "Sabi AI is not configured. Your message was saved; try again shortly." }, 503);

    const ai = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/@cf/meta/llama-3.1-8b-instruct`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, max_tokens: 650 }),
    });
    const payload = await ai.json().catch(() => ({}));
    const answer = payload?.result?.response;
    if (!ai.ok || typeof answer !== "string" || !answer.trim()) {
      console.error("Workers AI request failed", ai.status, JSON.stringify(payload).slice(0, 1000));
      return respond({ error: "Sabi AI is temporarily unavailable. Your message was saved; please try again shortly." }, 502);
    }

    const { data: reply, error: replyError } = await admin.from("sabi_support_messages").insert({
      conversation_id: conversation.id, tenant_id: tenantId, sender_role: "assistant",
      content: answer.trim().slice(0, 6000),
    }).select("id, sender_role, content, created_at").single();
    if (replyError || !reply) return respond({ error: "Your message was received, but the reply could not be saved." }, 500);
    const now = new Date().toISOString();
    await admin.from("sabi_support_conversations").update({ last_message_at: now, updated_at: now })
      .eq("id", conversation.id).eq("tenant_id", tenantId);
    return respond({ success: true, conversation, reply });
  } catch (error) {
    console.error("sabi-support error", error);
    return respond({ error: "Sabi Support is temporarily unavailable. Please try again." }, 500);
  }
});