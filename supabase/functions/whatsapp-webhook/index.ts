// supabase/functions/whatsapp-webhook/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { routeMessage } from "./router.ts";
import { IncomingMessage, sendTextMessage } from "./whatsapp.ts";

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

  // ── A. GET / SET GLOBAL SABI HANDOFF ──
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

  // ── B. INDIVIDUAL CONVERSATION AGENT TAKEOVER ──
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
        await sb.from("contacts").update({ agent_mode: enabled }).eq("id", targetContactId);

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

  // ── C. SEND DIRECT WHATSAPP MESSAGE (LINKED PROPERLY TO CONTACT) ──
  if (action === "send-message" && req.method === "POST") {
    try {
      const body = await req.json();
      let rawPhone = (body.phone || "").trim();
      const message = (body.message || "").trim();
      let contactId = body.contact_id || null;

      if (!rawPhone || !message) {
        return jsonResponse({ error: "Phone number and message text are required" }, 400);
      }

      // If a UUID was passed as phone, resolve from contacts
      if (rawPhone.includes("-") && rawPhone.length > 20) {
        const { data: c } = await sb.from("contacts").select("id, phone").eq("id", rawPhone).maybeSingle();
        if (c?.phone) {
          rawPhone = c.phone;
          contactId = c.id;
        }
      }

      const cleanPhone = normalizePhone(rawPhone);

      if (cleanPhone.length < 10) {
        return jsonResponse({ error: `Invalid phone format: "${rawPhone}"` }, 400);
      }

      // Ensure Contact Record exists so message is ALWAYS linked
      if (!contactId) {
        const localPhone = cleanPhone.startsWith("234") ? "0" + cleanPhone.slice(3) : cleanPhone;
        const { data: existingContact } = await sb
          .from("contacts")
          .select("id")
          .or(`phone.eq.${cleanPhone},phone.eq.+${cleanPhone},phone.eq.${localPhone}`)
          .maybeSingle();

        if (existingContact) {
          contactId = existingContact.id;
        } else {
          const { data: newContact } = await sb
            .from("contacts")
            .insert({ phone: cleanPhone, name: "WhatsApp Client" })
            .select("id")
            .single();
          contactId = newContact?.id || null;
        }
      }

      // Send to WhatsApp Cloud API via tested helper
      console.log(`[Admin Chat Outbound] Dispatching to: ${cleanPhone}`);
      const sendResult = await sendTextMessage(cleanPhone, message);

      if (sendResult && (sendResult.error || sendResult.status >= 400)) {
        const errObj = sendResult.error || sendResult;
        return jsonResponse({
          error: errObj.message || "Meta WhatsApp API rejected the message",
          details: errObj,
        }, 400);
      }

      const waMsgId = sendResult?.messages?.[0]?.id || null;

      // Insert message with all possible column mappings
      const msgRecord = {
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
      };

      const { data: savedMsg } = await sb.from("messages").insert(msgRecord).select("*").maybeSingle();

      // Also record in client_chat_log
      await sb.from("client_chat_log").insert({
        phone_number: cleanPhone,
        direction: "ADMIN_TO_CLIENT",
        message_body: message,
        sent_by: "ADMIN",
        status: "SENT",
      });

      return jsonResponse({ success: true, messageId: waMsgId, data: savedMsg }, 200);
    } catch (e: any) {
      console.error("[send-message error]:", e);
      return jsonResponse({ error: e.message || "Failed to deliver message" }, 500);
    }
  }

  // ── D. GET CHAT MESSAGES BY PHONE OR CONTACT ID ──
  if (action === "chat" && req.method === "GET") {
    const rawParam = (url.searchParams.get("phone") || url.searchParams.get("contact_id") || "").trim();
    if (!rawParam) return jsonResponse({ data: [] }, 200);

    let query = sb.from("messages").select("*");
    if (rawParam.includes("-") && rawParam.length > 20) {
      query = query.eq("contact_id", rawParam);
    } else {
      const clean = normalizePhone(rawParam);
      query = query.or(`phone_number.eq.${clean},phone_number.eq.+${clean}`);
    }

    const { data } = await query.order("created_at", { ascending: true }).limit(100);
    return jsonResponse({ data: data || [] });
  }

  // ── E. GET STATS ──
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
