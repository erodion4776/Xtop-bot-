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
  // 1. ADMIN API ROUTES
  // ══════════════════════════════════════════════════════

  // ── A. GET / SET GLOBAL SABI PAUSE ──
  if (action === "get-handoff" && req.method === "GET") {
    const { data } = await sb.from("system_settings").select("value").eq("key", "sabi_global_handoff").maybeSingle();
    return jsonResponse({ enabled: data?.value?.enabled ?? false });
  }

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

  // ── B. INDIVIDUAL CONVERSATION AGENT TAKEOVER (PAUSE BOT FOR 1 CLIENT) ──
  if (action === "toggle-takeover" && req.method === "POST") {
    try {
      const body = await req.json();
      const rawPhone = (body.phone || "").trim();
      const contactId = (body.contact_id || "").trim();
      const enabled = !!body.enabled;

      let targetContactId = contactId;

      if (!targetContactId && rawPhone) {
        const clean = normalizePhone(rawPhone);
        const { data: c } = await sb.from("contacts").select("id").or(`phone.eq.${clean},phone.eq.+${clean}`).maybeSingle();
        targetContactId = c?.id || "";
      }

      if (targetContactId) {
        // 1. Set agent_mode on contacts table
        await sb.from("contacts").update({ agent_mode: enabled }).eq("id", targetContactId);

        // 2. Set agent_takeover in conversation context_json
        const { data: conv } = await sb.from("conversations").select("id, context_json").eq("contact_id", targetContactId).maybeSingle();
        if (conv) {
          const updatedCtx = { ...(conv.context_json || {}), agent_takeover: enabled, agent_mode: enabled };
          await sb.from("conversations").update({
            context_json: updatedCtx,
            updated_at: new Date().toISOString(),
          }).eq("id", conv.id);
        }
      }

      return jsonResponse({ success: true, agent_takeover: enabled, contact_id: targetContactId });
    } catch (e: any) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ── C. SEND DIRECT WHATSAPP MESSAGE TO CLIENT AS SABI ──
  if (action === "send-message" && req.method === "POST") {
    try {
      const body = await req.json();
      let rawPhone = (body.phone || "").trim();
      const message = (body.message || "").trim();
      let contactId = body.contact_id || null;

      if (!rawPhone || !message) {
        return jsonResponse({ error: "Phone number and message text are required" }, 400);
      }

      // If a UUID was passed instead of phone, resolve from contacts
      if (rawPhone.includes("-") && rawPhone.length > 20) {
        const { data: c } = await sb.from("contacts").select("id, phone").eq("id", rawPhone).maybeSingle();
        if (c?.phone) {
          rawPhone = c.phone;
          contactId = c.id;
        }
      }

      const cleanPhone = normalizePhone(rawPhone);

      if (cleanPhone.length < 10) {
        return jsonResponse({ error: `Invalid phone format: "${rawPhone}". Expected e.g. 2348073158887` }, 400);
      }

      // Check all possible secret names
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
          error: "WhatsApp API credentials not set in Supabase Secrets (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID missing).",
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
          userFriendly = "24-Hour customer service window expired. The client must text your bot first.";
        } else if (errorCode === 190) {
          userFriendly = "Meta WhatsApp Access Token has expired. Please update it in Supabase Secrets.";
        } else if (errorCode === 131030) {
          userFriendly = "Recipient phone number is not on WhatsApp or not whitelisted in Meta test sandbox.";
        }

        return jsonResponse({ error: userFriendly, raw: waData.error }, 400);
      }

      const waMsgId = waData.messages?.[0]?.id || null;

      // Find contact if not resolved
      if (!contactId) {
        const localPhone = cleanPhone.startsWith("234") ? "0" + cleanPhone.slice(3) : cleanPhone;
        const { data: contact } = await sb
          .from("contacts")
          .select("id")
          .or(`phone.eq.${cleanPhone},phone.eq.+${cleanPhone},phone.eq.${localPhone}`)
          .maybeSingle();
        contactId = contact?.id || null;
      }

      // Store in messages table so Android App Chat updates immediately
      await sb.from("messages").insert({
        contact_id: contactId,
        phone_number: cleanPhone,
        direction: "OUTBOUND",
        message_type: "text",
        body: message,
        text: message,
        content: message,
        message_text: message,
        whatsapp_message_id: waMsgId,
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

      return jsonResponse({ success: true, messageId: waMsgId }, 200);
    } catch (e: any) {
      console.error("[send-message error]:", e);
      return jsonResponse({ error: e.message || "Failed to deliver message" }, 500);
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
  // 2. WHATSAPP WEBHOOK VERIFICATION (GET)
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
  // 3. INCOMING MESSAGES (POST)
  // ══════════════════════════════════════════════════════
  if (req.method === "POST") {
    try {
      const body = await req.json();

      const entry = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

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
