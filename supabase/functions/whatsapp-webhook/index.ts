// supabase/functions/whatsapp-webhook/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { routeMessage } from "./router.ts";
import { IncomingMessage, sendTextMessage } from "./whatsapp.ts";
import { handleOnboardingCallback, jsonResponse } from "./modules/onboarding.ts";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "xtop_webhook_secret";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
};

function normalizePhone(raw: string): string {
  let clean = raw.replace(/[^0-9]/g, "");
  if (clean.startsWith("0") && clean.length === 11) {
    clean = "234" + clean.substring(1);
  }
  return clean;
}

/**
 * The Meta webhook must remain publicly callable, but legacy admin API
 * actions on this same function must require a valid Supabase session and
 * an explicitly allowlisted Super Admin user ID.
 */
async function authorizeSuperAdminApi(
  req: Request,
  client: ReturnType<typeof createClient>,
): Promise<{ authorized: boolean; status: number; userId: string | null }> {
  const authorization = req.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return { authorized: false, status: 401, userId: null };

  const { data: { user }, error } = await client.auth.getUser(match[1]);
  if (error || !user) return { authorized: false, status: 401, userId: null };

  const allowedIds = (Deno.env.get("SUPER_ADMIN_USER_IDS") || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (!allowedIds.includes(user.id)) {
    return { authorized: false, status: 403, userId: user.id };
  }

  return { authorized: true, status: 200, userId: user.id };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // ══════════════════════════════════════════════════════
  // 1. ONBOARDING API (Receives Meta code from Netlify frontend)
  // ══════════════════════════════════════════════════════
  if (action === "onboard" && req.method === "POST") {
    return await handleOnboardingCallback(req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_ANON_KEY") ||
    "";
  const sb = createClient(supabaseUrl, supabaseKey);

  // ══════════════════════════════════════════════════════
  // 2. ADMIN API ROUTES
  // ══════════════════════════════════════════════════════

  // These legacy admin endpoints share the public Meta webhook URL.
  // Keep Meta webhook delivery and the signed onboarding callback public,
  // but never expose service-role admin operations without Super Admin auth.
  const protectedAdminActions = new Set([
    "get-handoff",
    "toggle-handoff",
    "toggle-takeover",
    "send-message",
    "chat",
    "stats",
  ]);
  if (protectedAdminActions.has(action || "")) {
    const auth = await authorizeSuperAdminApi(req, sb);
    if (!auth.authorized) {
      return jsonResponse(
        { error: auth.status === 401 ? "Authentication required" : "Forbidden" },
        auth.status,
      );
    }
  }

  // ── A. GET / SET GLOBAL SABI HANDOFF ──
  if (action === "get-handoff" && req.method === "GET") {
    const { data } = await sb.from("system_settings").select("value").eq("key", "sabi_global_handoff").maybeSingle();
    return jsonResponse({ enabled: data?.value?.enabled ?? false });
  }

  if (action === "toggle-handoff" && req.method === "POST") {
    // Retired legacy mutation path. Keep the read-only GET endpoint for
    // compatibility, but route all writes through sabi-super-admin where
    // reason, expected state, audit logging and rollback are enforced.
    return jsonResponse({
      error: "This control has moved. Use the Sabi Super Admin Platform Controls page.",
      code: "USE_SABI_SUPER_ADMIN",
    }, 410);
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

      if (!targetContactId) {
        return jsonResponse({ error: "Customer contact not found" }, 404);
      }

      const { data: updatedContact, error: contactError } = await sb.from("contacts")
        .update({ agent_mode: enabled })
        .eq("id", targetContactId)
        .select("id")
        .maybeSingle();
      if (contactError) throw contactError;
      if (!updatedContact) return jsonResponse({ error: "Customer contact not found" }, 404);

      const { data: conv, error: conversationReadError } = await sb.from("conversations")
        .select("id, context_json")
        .eq("contact_id", targetContactId)
        .maybeSingle();
      if (conversationReadError) throw conversationReadError;
      if (conv) {
        const updatedCtx = { ...(conv.context_json || {}), agent_takeover: enabled, agent_mode: enabled };
        const { error: conversationUpdateError } = await sb.from("conversations").update({
          context_json: updatedCtx,
          updated_at: new Date().toISOString(),
        }).eq("id", conv.id);
        if (conversationUpdateError) throw conversationUpdateError;
      }

      const auth = await authorizeSuperAdminApi(req, sb);
      const { error: auditError } = await sb.from("audit_logs").insert({
        admin_user: auth.userId,
        action: "SABI_CUSTOMER_TAKEOVER_CHANGED",
        entity: "contacts",
        entity_id: targetContactId,
        metadata: { source: "LEGACY_SUPER_ADMIN_API", enabled, changed_at: new Date().toISOString() },
      });
      if (auditError) {
        console.error("[Admin API] Customer takeover changed but audit insert failed:", auditError.message);
        return jsonResponse({ success: true, agent_takeover: enabled, contact_id: targetContactId, audit_logged: false, warning: "Activity log could not be saved" }, 200);
      }

      return jsonResponse({ success: true, agent_takeover: enabled, contact_id: targetContactId, audit_logged: true });
    } catch (e: any) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ── C. SEND DIRECT WHATSAPP MESSAGE ──
  if (action === "send-message" && req.method === "POST") {
    try {
      const body = await req.json();
      let rawPhone = (body.phone || "").trim();
      const message = (body.message || "").trim();
      let contactId = body.contact_id || null;

      if (!rawPhone || !message) {
        return jsonResponse({ error: "Phone number and message text are required" }, 400);
      }

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

  // ── D. GET CHAT HISTORY ──
  if (action === "chat" && req.method === "GET") {
    const rawParam = (url.searchParams.get("contact_id") || url.searchParams.get("phone") || "").trim();
    if (!rawParam) return jsonResponse({ data: [] }, 200);

    let phone = rawParam;
    let contactId: string | null = null;

    if (rawParam.includes("-") && rawParam.length > 20) {
      contactId = rawParam;
      const { data: c } = await sb.from("contacts").select("id, phone").eq("id", rawParam).maybeSingle();
      if (c?.phone) phone = c.phone;
    }

    const cleanPhone = normalizePhone(phone);
    const localPhone = cleanPhone.startsWith("234") ? "0" + cleanPhone.slice(3) : cleanPhone;

    const orClauses = [
      `phone_number.eq.${cleanPhone}`,
      `phone_number.eq.+${cleanPhone}`,
      `phone_number.eq.${localPhone}`,
    ];

    if (contactId) {
      orClauses.push(`contact_id.eq.${contactId}`);
    } else if (cleanPhone) {
      const { data: c } = await sb.from("contacts").select("id").or(`phone.eq.${cleanPhone},phone.eq.+${cleanPhone}`).maybeSingle();
      if (c?.id) orClauses.push(`contact_id.eq.${c.id}`);
    }

    const { data, error } = await sb
      .from("messages")
      .select("*")
      .or(orClauses.join(","))
      .order("created_at", { ascending: true })
      .limit(100);

    return jsonResponse({ data: data || [], error: error?.message });
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
  // 3. WHATSAPP WEBHOOK VERIFICATION (GET from Meta)
  // ══════════════════════════════════════════════════════
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // ══════════════════════════════════════════════════════
  // 4. INCOMING MESSAGES (POST from Meta)
  // ══════════════════════════════════════════════════════
  if (req.method === "POST") {
    try {
      const body = await req.json();

      const entry = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (Array.isArray(value?.statuses) && value.statuses.length) {
        const phoneNumberId = String(value?.metadata?.phone_number_id || "");
        if (phoneNumberId) {
          const { error: settingsError } = await sb.from("whatsapp_usage_settings").upsert({
            phone_number_id: phoneNumberId,
            display_phone_number: value?.metadata?.display_phone_number || null,
          }, { onConflict: "phone_number_id", ignoreDuplicates: true });
          if (settingsError) console.error("[WhatsApp Usage] Could not register phone number:", settingsError.message);
        }
        for (const statusEvent of value.statuses) {
          const messageId = String(statusEvent?.id || "");
          if (!messageId || !phoneNumberId) continue;
          const pricing = statusEvent?.pricing || {};
          let { data: activity } = await sb.from("bot_activity_log")
            .select("module")
            .eq("whatsapp_message_id", messageId)
            .maybeSingle();
          if (!activity && statusEvent?.recipient_id) {
            const recentSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data: recentActivity } = await sb.from("bot_activity_log")
              .select("module")
              .eq("phone_number", String(statusEvent.recipient_id))
              .eq("direction", "INBOUND")
              .gte("created_at", recentSince)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            activity = recentActivity;
          }
          const moduleName = String(activity?.module || "").toLowerCase();
          const sourceApp = /sabi|shop|merchant|product|order/.test(moduleName)
            ? "SABI"
            : /learning|course|exam|student|lecture/.test(moduleName)
              ? "ENGR_ERO"
              : "UNKNOWN";
          const providerStatus = String(statusEvent?.status || "").toLowerCase();
          const deliveryStatus = providerStatus === "delivered" ? "DELIVERED"
            : providerStatus === "read" ? "READ"
            : providerStatus === "failed" ? "FAILED"
            : providerStatus === "sent" ? "SENT"
            : "ACCEPTED";
          const eventSeconds = Number(statusEvent?.timestamp || 0);
          const eventAt = eventSeconds > 0 ? new Date(eventSeconds * 1000).toISOString() : new Date().toISOString();
          const eventRow = {
            phone_number_id: phoneNumberId,
            whatsapp_message_id: messageId,
            source_app: sourceApp,
            direction: "OUTBOUND",
            delivery_status: deliveryStatus,
            pricing_category: pricing?.category || null,
            pricing_model: pricing?.pricing_model || null,
            meta_billable: typeof pricing?.billable === "boolean" ? pricing.billable : null,
            recipient_phone: statusEvent?.recipient_id || null,
            event_at: eventAt,
            delivered_at: ["DELIVERED", "READ"].includes(deliveryStatus) ? eventAt : null,
            raw_pricing: pricing,
            updated_at: new Date().toISOString(),
          };
          const { error: usageError } = await sb.from("whatsapp_usage_events")
            .upsert(eventRow, { onConflict: "whatsapp_message_id" });
          if (usageError) console.error("[WhatsApp Usage] Could not save status:", usageError.message);
        }
        if (!value?.messages?.length) {
          return new Response(JSON.stringify({ status: "usage_status_recorded" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
      }

      const messageObj = value?.messages?.[0];
      const contactObj = value?.contacts?.[0];

      if (!messageObj) {
        return new Response(JSON.stringify({ status: "no_message" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      const metadata = value?.metadata;
      const phoneNumberId = metadata?.phone_number_id || "";

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

      if (phoneNumberId && messageObj?.id) {
        const { error: inboundUsageError } = await sb.from("whatsapp_usage_events").upsert({
          phone_number_id: phoneNumberId,
          whatsapp_message_id: String(messageObj.id),
          source_app: "UNKNOWN",
          direction: "INBOUND",
          delivery_status: "RECEIVED",
          recipient_phone: String(messageObj.from || ""),
          event_at: messageObj.timestamp
            ? new Date(Number(messageObj.timestamp) * 1000).toISOString()
            : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "whatsapp_message_id" });
        if (inboundUsageError) console.error("[WhatsApp Usage] Could not save inbound message:", inboundUsageError.message);
      }

      const incoming: IncomingMessage = {
        from: messageObj.from,
        messageId: messageObj.id,
        type: messageObj.type,
        text,
        interactiveId,
        profileName: contactObj?.profile?.name || "Customer",
        timestamp: messageObj.timestamp,
        phoneNumberId,
      };

      routeMessage(incoming).catch((err) => {
        console.error("[RouteMessage Error]:", err);
      });

      return new Response(JSON.stringify({ status: "received" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch (err) {
      console.error("[Webhook Error]:", err);
      return new Response(JSON.stringify({ error: "error_handled" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
