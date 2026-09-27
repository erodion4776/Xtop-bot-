// supabase/functions/whatsapp-webhook/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { routeMessage } from "./router.ts";
import { IncomingMessage } from "./whatsapp.ts";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "xtop_webhook_secret";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
};

// Helper: Normalize phone numbers to international standard (e.g. 2348012345678)
function normalizePhone(raw: string): string {
  let clean = raw.replace(/[^0-9]/g, "");
  if (clean.startsWith("0") && clean.length === 11) {
    clean = "234" + clean.substring(1);
  }
  return clean;
}

function jsonResponse(body: any, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  // Handle CORS preflight for Android / Web
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_ANON_KEY") ||
    "";
  const sb = createClient(supabaseUrl, supabaseKey);

  // ══════════════════════════════════════════════════════
  // 1. ADMIN API ROUTES (Called by Android App)
  // ══════════════════════════════════════════════════════

  // ── A. GET SABI HANDOFF STATUS ──
  if (action === "get-handoff" && req.method === "GET") {
    const { data } = await sb.from("system_settings").select("value").eq("key", "sabi_global_handoff").maybeSingle();
    return jsonResponse({ enabled: data?.value?.enabled ?? false });
  }

  // ── B. TOGGLE SABI HANDOFF (PAUSE / RESUME) ──
  if (action === "toggle-handoff" && req.method === "POST") {
    try {
      const body = await req.json();
      const enabled = !!body.enabled;
      await sb.from("system_settings").upsert({
        key: "sabi_global_handoff",
        value: { enabled },
        updated_at: new Date().toISOString(),
      });
      return jsonResponse({ success: true, enabled });
    } catch (e: any) {
      return jsonResponse({ error: e.message }, 400);
    }
  }

  // ── C. SEND DIRECT WHATSAPP MESSAGE TO CLIENT AS SABI ──
  if (action === "send-message" && req.method === "POST") {
    try {
      const body = await req.json();
      let rawPhone = (body.phone || "").trim();
      const message = (body.message || "").trim();

      if (!rawPhone || !message) {
        return jsonResponse({ error: "Phone number and message text are required" }, 400);
      }

      // If a UUID was passed instead of phone, resolve from contacts/leads
      if (rawPhone.includes("-") && rawPhone.length > 20) {
        const { data: c } = await sb.from("contacts").select("phone").eq("id", rawPhone).maybeSingle();
        if (c?.phone) {
          rawPhone = c.phone;
        } else {
          const { data: l } = await sb.from("leads").select("contact_id").eq("id", rawPhone).maybeSingle();
          if (l?.contact_id) {
            const { data: c2 } = await sb.from("contacts").select("phone").eq("id", l.contact_id).maybeSingle();
            if (c2?.phone) rawPhone = c2.phone;
          }
        }
      }

      const cleanPhone = normalizePhone(rawPhone);

      if (cleanPhone.length < 10) {
        return jsonResponse({ error: `Invalid phone format: "${rawPhone}". Expected e.g. 2348073158887` }, 400);
      }

      // Read WhatsApp secrets
      const waToken =
        Deno.env.get("WHATSAPP_ACCESS_TOKEN") ||
        Deno.env.get("WHATSAPP_TOKEN") ||
        Deno.env.get("META_ACCESS_TOKEN") ||
        "";

      const waPhoneId =
        Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ||
        Deno.env.get("WHATSAPP_PHONE_ID") ||
        Deno.env.get("PHONE_NUMBER_ID") ||
        "";

      if (!waToken || !waPhoneId) {
        return jsonResponse({
          error: "WhatsApp API credentials not found in Supabase Secrets. Please verify WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.",
        }, 500);
      }

      // Send to Meta WhatsApp Cloud API
      const waResp = await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${waToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: cleanPhone,
          type: "text",
          text: { preview_url: false, body: message },
        }),
      });

      const waData = await waResp.json();

      if (!waResp.ok || waData.error) {
        const errorMsg = waData.error?.message || "Meta API rejected message";
        const errorCode = waData.error?.code;
        console.error(`[WhatsApp API Error (${errorCode})]:`, JSON.stringify(waData));

        let userFriendly = errorMsg;
        if (errorCode === 131047) {
          userFriendly = "24-Hour customer service window expired. The client must text your bot first before you can reply.";
        } else if (errorCode === 190) {
          userFriendly = "Meta WhatsApp Access Token has expired. Please refresh it in Supabase Secrets.";
        } else if (errorCode === 100) {
          userFriendly = "Invalid WhatsApp Phone ID or invalid phone format.";
        }

        return jsonResponse({ error: userFriendly, raw: waData.error }, 400);
      }

      // Find or create contact
      const { data: contact } = await sb.from("contacts").select("id").eq("phone", cleanPhone).maybeSingle();

      // Store in messages table
      await sb.from("messages").insert({
        contact_id: contact?.id || null,
        phone_number: cleanPhone,
        direction: "OUTBOUND",
        message_type: "text",
        body: message,
        text: message,
        content: message,
        message_text: message,
        whatsapp_message_id: waData.messages?.[0]?.id || null,
        created_at: new Date().toISOString(),
      });

      // Store in client_chat_log
      await sb.from("client_chat_log").insert({
        phone_number: cleanPhone,
        direction: "ADMIN_TO_CLIENT",
        message_body: message,
        sent_by: "ADMIN",
        status: "SENT",
      });

      return jsonResponse({ success: true, messageId: waData.messages?.[0]?.id }, 200);
    } catch (e: any) {
      console.error("[send-message error]:", e);
      return jsonResponse({ error: e.message || "Failed to send message" }, 500);
    }
  }

  // ── D. GET STATS ──
  if (action === "stats" && req.method === "GET") {
    const today = new Date().toISOString().split("T")[0];
    const [totalContacts, todayMessages, totalOrders, openOrders] = await Promise.all([
      sb.from("contacts").select("id", { count: "exact", head: true }),
      sb.from("messages").select("id", { count: "exact", head: true }).gte("created_at", `${today}T00:00:00Z`),
      sb.from("bot_orders").select("id", { count: "exact", head: true }),
      sb.from("agent_requests").select("id", { count: "exact", head: true }).eq("status", "NEW"),
    ]);

    return jsonResponse({
      data: {
        totalContacts: totalContacts.count || 0,
        todayMessages: todayMessages.count || 0,
        totalOrders: totalOrders.count || 0,
        openOrders: openOrders.count || 0,
      },
    });
  }

  // ══════════════════════════════════════════════════════
  // 2. WHATSAPP WEBHOOK VERIFICATION (GET from Meta)
  // ══════════════════════════════════════════════════════
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // ══════════════════════════════════════════════════════
  // 3. INCOMING MESSAGES & WEBHOOK EVENTS (POST from Meta)
  // ══════════════════════════════════════════════════════
  if (req.method === "POST") {
    try {
      const body = await req.json();

      const entry = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      // Ignore delivery/read receipts immediately
      if (value?.statuses && !value?.messages) {
        return new Response(JSON.stringify({ status: "ignored_status" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const messageObj = value?.messages?.[0];
      const contactObj = value?.contacts?.[0];

      if (!messageObj) {
        return new Response(JSON.stringify({ status: "no_message" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      let text = "";
      let interactiveId = "";

      if (messageObj.type === "text") {
        text = messageObj.text?.body || "";
      } else if (messageObj.type === "interactive") {
        if (messageObj.interactive?.type === "button_reply") {
          interactiveId = messageObj.interactive.button_reply?.id || "";
          text = messageObj.interactive.button_reply?.title || "";
        } else if (messageObj.interactive?.type === "list_reply") {
          interactiveId = messageObj.interactive.list_reply?.id || "";
          text = messageObj.interactive.list_reply?.title || "";
        }
      } else if (messageObj.type === "button") {
        interactiveId = messageObj.button?.payload || "";
        text = messageObj.button?.text || "";
      }

      const incoming: IncomingMessage = {
        from: messageObj.from,
        messageId: messageObj.id,
        type: messageObj.type,
        text,
        interactiveId,
        profileName: contactObj?.profile?.name || "Customer",
        timestamp: messageObj.timestamp,
      };

      // Process message in background
      routeMessage(incoming).catch((err) => {
        console.error("[RouteMessage Error]:", err);
      });

      return new Response(JSON.stringify({ status: "received" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("[Webhook Error]:", err);
      return new Response(JSON.stringify({ error: "error_handled" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
