// supabase/functions/xtop-dashboard/index.ts
// Xtop Admin Dashboard API — With Sabi Handoff & WhatsApp Delivery

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
    const sb = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "";

    // ── 1. GET / SET SABI HANDOFF STATUS (PAUSE/RESUME) ──
    if (action === "get-handoff") {
      const { data } = await sb.from("system_settings").select("value").eq("key", "sabi_global_handoff").maybeSingle();
      const enabled = data?.value?.enabled ?? false;
      return jsonResponse({ enabled }, 200);
    }

    if (action === "toggle-handoff" && req.method === "POST") {
      const body = await req.json();
      const enabled = !!body.enabled;
      await sb.from("system_settings").upsert({
        key: "sabi_global_handoff",
        value: { enabled },
        updated_at: new Date().toISOString(),
      });
      return jsonResponse({ success: true, enabled }, 200);
    }

    // ── 2. SEND MESSAGE VIA WHATSAPP (FIXED) ──
    if (action === "send-message" && req.method === "POST") {
      const body = await req.json();
      let rawPhone = (body.phone || "").trim();
      const message = (body.message || "").trim();

      if (!rawPhone || !message) {
        return jsonResponse({ error: "Phone number and message are required" }, 400);
      }

      // If a UUID was passed instead of a phone number, resolve it from DB
      if (rawPhone.includes("-") && rawPhone.length > 20) {
        // Try looking up in contacts
        const { data: c } = await sb.from("contacts").select("phone").eq("id", rawPhone).maybeSingle();
        if (c?.phone) {
          rawPhone = c.phone;
        } else {
          // Try looking up in leads
          const { data: l } = await sb.from("leads").select("contact_id, requirements_json").eq("id", rawPhone).maybeSingle();
          if (l?.contact_id) {
            const { data: c2 } = await sb.from("contacts").select("phone").eq("id", l.contact_id).maybeSingle();
            if (c2?.phone) rawPhone = c2.phone;
          }
        }
      }

      // Clean phone number: remove +, spaces, hyphens
      const cleanPhone = rawPhone.replace(/[^0-9]/g, "");

      if (cleanPhone.length < 10) {
        return jsonResponse({ error: `Invalid recipient phone number: ${rawPhone}` }, 400);
      }

      // Check all common Meta WhatsApp secret names
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
        console.error("Missing WhatsApp credentials. WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID not found in Supabase secrets.");
        return jsonResponse({ error: "WhatsApp API credentials not set in Supabase Secrets" }, 500);
      }

      // Send message to WhatsApp Cloud API
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
        console.error("[WhatsApp Cloud API Error]:", JSON.stringify(waData));
        return jsonResponse({ error: waData.error?.message || "Meta API rejected message", details: waData }, 400);
      }

      // Find or create contact to link message
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

      // Also store in client_chat_log
      await sb.from("client_chat_log").insert({
        phone_number: cleanPhone,
        direction: "ADMIN_TO_CLIENT",
        message_body: message,
        sent_by: "ADMIN",
        status: "SENT",
      });

      return jsonResponse({ success: true, messageId: waData.messages?.[0]?.id }, 200);
    }

    // ── 3. GET STATS ──
    if (action === "stats") {
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
      }, 200);
    }

    // ── 4. GET CHAT HISTORY ──
    if (action === "chat") {
      let phone = (url.searchParams.get("phone") || "").trim();
      if (!phone) return jsonResponse({ data: [] }, 200);

      // Clean phone or resolve contact
      const cleanPhone = phone.replace(/[^0-9]/g, "");
      const { data: contact } = await sb.from("contacts").select("id").eq("phone", cleanPhone).maybeSingle();

      let query = sb.from("messages").select("*");
      if (contact?.id) {
        query = query.or(`contact_id.eq.${contact.id},phone_number.eq.${cleanPhone}`);
      } else {
        query = query.eq("phone_number", cleanPhone);
      }

      const { data, error } = await query.order("created_at", { ascending: true }).limit(100);
      return jsonResponse({ data: data || [], error }, 200);
    }

    return jsonResponse({ error: "Unknown action" }, 404);
  } catch (err: any) {
    console.error("[Dashboard API Error]:", err);
    return jsonResponse({ error: err.message || "Internal server error" }, 500);
  }
});

function jsonResponse(body: any, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
