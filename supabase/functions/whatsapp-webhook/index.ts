// supabase/functions/whatsapp-webhook/index.ts
// Complete Upgraded Webhook Gateway with Background Status Filtering & Rate Limiting

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { parseWebhookPayload, markAsRead } from "./whatsapp.ts";
import { routeMessage } from "./router.ts";
import { safeErrorLog } from "./utils.ts";

/**
 * Simple in-memory rate limiter.
 * Limits each phone number to MAX_REQUESTS within WINDOW_MS.
 * Edge Functions are stateless per invocation in production,
 * so this only protects within a single instance lifetime.
 * For production, consider a database-backed rate limiter.
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 30;       // max messages
const RATE_LIMIT_WINDOW = 60000; // per 60 seconds

function isRateLimited(phone: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(phone);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(phone, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return true;
  }
  return false;
}

// Periodically clean up rate limit map (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap.entries()) {
    if (now > val.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 300000);

serve(async (req: Request): Promise<Response> => {
  try {
    const url = new URL(req.url);

    // ══════════════════════════════════════════════════
    // GET — Meta Webhook Verification
    // ══════════════════════════════════════════════════
    if (req.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      const verifyToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "xtop_verify_token";

      if (mode === "subscribe" && token === verifyToken) {
        console.log("[webhook] Verification successful");
        return new Response(challenge, {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });
      }

      console.warn("[webhook] Verification failed — token mismatch");
      return new Response("Forbidden", { status: 403 });
    }

    // ══════════════════════════════════════════════════
    // POST — Incoming WhatsApp Messages & Events
    // ══════════════════════════════════════════════════
    if (req.method === "POST") {
      // Parse body safely
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return new Response("Bad Request", { status: 400 });
      }

      // Validate this is a WhatsApp webhook event
      const objectType = body.object as string;
      if (objectType !== "whatsapp_business_account") {
        // Could be a status update or other event — acknowledge to prevent retries
        return new Response("OK", { status: 200 });
      }

      // Parse the message
      const incoming = parseWebhookPayload(body);

      // CRITICAL: Safely ignore background delivery/read receipts, status callbacks,
      // and empty events to prevent the bot from trigger-looping or sending menu links on idle!
      if (!incoming || !incoming.from) {
        return new Response("OK", { status: 200 });
      }

      // Rate limiting
      if (isRateLimited(incoming.from)) {
        console.warn(`[rate-limit] Phone ${incoming.from.slice(-4)} exceeded rate limit`);
        return new Response("OK", { status: 200 });
      }

      // Mark as read (fire and forget)
      markAsRead(incoming.messageId).catch(() => {});

      // Route the message to our main router (with priorities for classroom isolation)
      await routeMessage(incoming);

      // Always return 200 to Meta to prevent retries
      return new Response("OK", { status: 200 });
    }

    // ══════════════════════════════════════════════════
    // Other methods
    // ══════════════════════════════════════════════════
    return new Response("Method Not Allowed", { status: 405 });

  } catch (err) {
    safeErrorLog("index:toplevel", err);
    // Always return 200 to Meta to prevent retries
    return new Response("OK", { status: 200 });
  }
});
