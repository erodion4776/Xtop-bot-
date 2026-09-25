// supabase/functions/whatsapp-webhook/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { routeMessage } from "./router.ts";
import { IncomingMessage } from "./whatsapp.ts";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "xtop_webhook_secret";

serve(async (req: Request) => {
  // 1. Webhook Verification (GET)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // 2. Incoming Messages & Events (POST)
  if (req.method === "POST") {
    try {
      const body = await req.json();

      // Ignore WhatsApp read/delivery status updates completely (prevents infinite loop!)
      const entry = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (value?.statuses && !value?.messages) {
        return new Response(JSON.stringify({ status: "ignored_status_event" }), {
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

      // Extract message details
      const from = messageObj.from;
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
        from,
        messageId: messageObj.id,
        type: messageObj.type,
        text,
        interactiveId,
        profileName: contactObj?.profile?.name || "Customer",
        timestamp: messageObj.timestamp,
      };

      // Process message in the background and respond 200 OK immediately
      // This stops Meta from retrying the webhook
      routeMessage(incoming).catch((err) => {
        console.error("[RouteMessage Error]:", err);
      });

      return new Response(JSON.stringify({ status: "success" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("[Webhook POST Error]:", err);
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 200, // Return 200 to prevent Meta retry storm
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
