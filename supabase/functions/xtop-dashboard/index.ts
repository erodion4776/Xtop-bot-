File: "supabase/functions/xtop-dashboard/index.ts"

// Sabi by XTOP — Secure Dashboard API
// Merchant Inbox, WhatsApp replies and bot controls.
// Super Admin global handoff remains separate.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

interface AuthenticatedUser {
  id: string;
  email?: string;
}

interface MerchantContext {
  userId: string;
  tenantId: string;
  role: string;
}

// =====================================================
// MAIN HANDLER
// =====================================================

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse(
        { error: "Server configuration is incomplete" },
        500,
      );
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "";

    // Verify the actual Supabase access token.
    const auth = await authenticateUser(req);

    if (!auth.success || !auth.user) {
      return jsonResponse(
        { error: auth.error || "Authentication required" },
        auth.status,
      );
    }

    const user = auth.user;

    // =================================================
    // SUPER ADMIN GLOBAL HANDOFF
    // This is NOT the merchant pause control.
    // =================================================

    if (action === "get-handoff") {
      if (!isSuperAdmin(user.id)) {
        return jsonResponse({ error: "Forbidden" }, 403);
      }

      const { data, error } = await sb
        .from("system_settings")
        .select("value")
        .eq("key", "sabi_global_handoff")
        .maybeSingle();

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }

      return jsonResponse({
        enabled: data?.value?.enabled === true,
      });
    }

    if (action === "toggle-handoff" && req.method === "POST") {
      if (!isSuperAdmin(user.id)) {
        return jsonResponse({ error: "Forbidden" }, 403);
      }

      const body = await readJson(req);

      if (!body || typeof body.enabled !== "boolean") {
        return jsonResponse(
          { error: "A boolean enabled value is required" },
          400,
        );
      }

      const { error } = await sb
        .from("system_settings")
        .upsert({
          key: "sabi_global_handoff",
          value: { enabled: body.enabled },
          updated_at: new Date().toISOString(),
        });

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }

      return jsonResponse({
        success: true,
        enabled: body.enabled,
      });
    }

    // All remaining actions require an active merchant membership.
    const merchantResult = await resolveMerchant(user.id);

    if (!merchantResult.success || !merchantResult.context) {
      return jsonResponse(
        { error: merchantResult.error },
        merchantResult.status,
      );
    }

    const merchant = merchantResult.context;

    // =================================================
    // MERCHANT INBOX LIST
    // =================================================

    if (action === "inbox-list" && req.method === "GET") {
      const { data: contacts, error: contactsError } = await sb
        .from("contacts")
        .select(
          "id, phone, name, agent_mode, created_at, updated_at",
        )
        .eq("tenant_id", merchant.tenantId)
        .order("updated_at", { ascending: false })
        .limit(100);

      if (contactsError) {
        return jsonResponse(
          { error: contactsError.message },
          500,
        );
      }

      if (!contacts || contacts.length === 0) {
        return jsonResponse({ data: [] });
      }

      const contactIds = contacts.map((contact) => contact.id);

      const { data: messages, error: messagesError } = await sb
        .from("messages")
        .select(
          "id, contact_id, direction, message_type, body, message_text, created_at",
        )
        .eq("tenant_id", merchant.tenantId)
        .in("contact_id", contactIds)
        .order("created_at", { ascending: false })
        .limit(500);

      if (messagesError) {
        return jsonResponse(
          { error: messagesError.message },
          500,
        );
      }

      const latestMessages = new Map<string, any>();

      for (const message of messages || []) {
        if (
          message.contact_id &&
          !latestMessages.has(message.contact_id)
        ) {
          latestMessages.set(message.contact_id, message);
        }
      }

      const result = contacts.map((contact) => ({
        ...contact,
        last_message: latestMessages.get(contact.id) || null,
      }));

      return jsonResponse({ data: result });
    }

    // =================================================
    // CUSTOMER CHAT HISTORY
    // =================================================

    if (action === "chat" && req.method === "GET") {
      const contactId =
        url.searchParams.get("contact_id") || "";

      if (!isUuid(contactId)) {
        return jsonResponse(
          { error: "A valid contact_id is required" },
          400,
        );
      }

      const { data: contact, error: contactError } = await sb
        .from("contacts")
        .select("id")
        .eq("id", contactId)
        .eq("tenant_id", merchant.tenantId)
        .maybeSingle();

      if (contactError || !contact) {
        return jsonResponse(
          { error: "Customer not found" },
          404,
        );
      }

      const { data, error } = await sb
        .from("messages")
        .select("*")
        .eq("tenant_id", merchant.tenantId)
        .eq("contact_id", contactId)
        .order("created_at", { ascending: true })
        .limit(200);

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }

      return jsonResponse({ data: data || [] });
    }

    // =================================================
    // SEND WHATSAPP MESSAGE
    // Uses only this merchant's connected number.
    // =================================================

    if (action === "send-message" && req.method === "POST") {
      const body = await readJson(req);

      if (!body) {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const contactId = String(body.contact_id || "").trim();
      const message = String(body.message || "").trim();

      if (!isUuid(contactId) || !message) {
        return jsonResponse(
          {
            error: "A valid contact_id and message are required",
          },
          400,
        );
      }

      if (message.length > 4096) {
        return jsonResponse(
          { error: "Message cannot exceed 4096 characters" },
          400,
        );
      }

      // Verify that the customer belongs to this merchant.
      const { data: contact, error: contactError } = await sb
        .from("contacts")
        .select("id, phone")
        .eq("id", contactId)
        .eq("tenant_id", merchant.tenantId)
        .maybeSingle();

      if (contactError || !contact) {
        return jsonResponse(
          { error: "Customer not found" },
          404,
        );
      }

      const cleanPhone = String(contact.phone || "")
        .replace(/[^0-9]/g, "");

      if (cleanPhone.length < 10) {
        return jsonResponse(
          { error: "Customer phone number is invalid" },
          400,
        );
      }

      // Retrieve this merchant's own active WhatsApp account.
      const { data: account, error: accountError } = await sb
        .from("tenant_whatsapp_accounts")
        .select(
          "phone_number_id, encrypted_access_token, is_active",
        )
        .eq("tenant_id", merchant.tenantId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (accountError || !account) {
        return jsonResponse(
          {
            error:
              "Connect your business WhatsApp number before replying",
          },
          400,
        );
      }

      // Decrypt the merchant's token on the server.
      let accessToken: string;

      try {
        accessToken = await decryptToken(
          account.encrypted_access_token,
        );
      } catch (error) {
        console.error(
          "Merchant WhatsApp token decryption failed:",
          error,
        );

        return jsonResponse(
          {
            error:
              "Could not access your WhatsApp connection",
          },
          500,
        );
      }

      // Explicit merchant credentials.
      // Never fall back to XTOP system credentials.
      const whatsappMessageId = await sendMerchantWhatsAppMessage(
        cleanPhone,
        message,
        account.phone_number_id,
        accessToken,
      );

      if (!whatsappMessageId) {
        return jsonResponse(
          {
            error:
              "WhatsApp could not confirm the message. Please try again.",
          },
          502,
        );
      }

      const now = new Date().toISOString();

      const { data: savedMessage, error: saveError } = await sb
        .from("messages")
        .insert({
          tenant_id: merchant.tenantId,
          contact_id: contactId,
          phone_number: cleanPhone,
          direction: "OUTBOUND",
          message_type: "text",
          body: message,
          text: message,
          content: message,
          message_text: message,
          whatsapp_message_id: whatsappMessageId,
          created_at: now,
        })
        .select()
        .single();

      if (saveError) {
        console.error(
          "Could not save outbound message:",
          saveError,
        );

        return jsonResponse({
          success: true,
          stored: false,
          warning:
            "WhatsApp accepted the message, but its history could not be saved.",
          messageId: whatsappMessageId,
        });
      }

      await sb
        .from("contacts")
        .update({ updated_at: now })
        .eq("id", contactId)
        .eq("tenant_id", merchant.tenantId);

      return jsonResponse({
        success: true,
        stored: true,
        message: savedMessage,
        messageId: whatsappMessageId,
      });
    }

    // =================================================
    // INDIVIDUAL CUSTOMER TAKEOVER
    // =================================================

    if (
      action === "toggle-customer-takeover" &&
      req.method === "POST"
    ) {
      const body = await readJson(req);

      if (
        !body ||
        !isUuid(String(body.contact_id || "")) ||
        typeof body.enabled !== "boolean"
      ) {
        return jsonResponse(
          {
            error:
              "A valid contact_id and boolean enabled value are required",
          },
          400,
        );
      }

      const contactId = String(body.contact_id);

      const { data, error } = await sb
        .from("contacts")
        .update({ agent_mode: body.enabled })
        .eq("id", contactId)
        .eq("tenant_id", merchant.tenantId)
        .select("id, agent_mode")
        .maybeSingle();

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }

      if (!data) {
        return jsonResponse(
          { error: "Customer not found" },
          404,
        );
      }

      return jsonResponse({
        success: true,
        contact_id: data.id,
        agent_mode: data.agent_mode,
      });
    }

    // =================================================
    // GET MERCHANT BOT PAUSE
    // =================================================

    if (
      action === "get-merchant-pause" &&
      req.method === "GET"
    ) {
      const { data, error } = await sb
        .from("tenants")
        .select("metadata")
        .eq("id", merchant.tenantId)
        .maybeSingle();

      if (error || !data) {
        return jsonResponse(
          {
            error:
              error?.message || "Merchant workspace not found",
          },
          404,
        );
      }

      return jsonResponse({
        paused: data.metadata?.sabi_paused === true,
      });
    }

    // =================================================
    // TOGGLE MERCHANT BOT PAUSE
    // Does not change Super Admin global handoff.
    // =================================================

    if (
      action === "toggle-merchant-pause" &&
      req.method === "POST"
    ) {
      if (
        merchant.role !== "OWNER" &&
        merchant.role !== "ADMIN"
      ) {
        return jsonResponse(
          { error: "Only an owner or administrator can pause the bot" },
          403,
        );
      }

      const body = await readJson(req);

      if (!body || typeof body.paused !== "boolean") {
        return jsonResponse(
          { error: "A boolean paused value is required" },
          400,
        );
      }

      const { data: tenant, error: readError } = await sb
        .from("tenants")
        .select("metadata")
        .eq("id", merchant.tenantId)
        .maybeSingle();

      if (readError || !tenant) {
        return jsonResponse(
          {
            error:
              readError?.message || "Merchant workspace not found",
          },
          404,
        );
      }

      // Preserve all existing tenant metadata.
      const metadata = {
        ...(tenant.metadata || {}),
        sabi_paused: body.paused,
      };

      const { error: updateError } = await sb
        .from("tenants")
        .update({
          metadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", merchant.tenantId);

      if (updateError) {
        return jsonResponse(
          { error: updateError.message },
          500,
        );
      }

      return jsonResponse({
        success: true,
        paused: body.paused,
      });
    }

    // =================================================
    // MERCHANT DASHBOARD STATISTICS
    // =================================================

    if (action === "stats" && req.method === "GET") {
      const today = new Date().toISOString().split("T")[0];

      const [
        totalContacts,
        todayMessages,
        totalOrders,
        openOrders,
      ] = await Promise.all([
        sb
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", merchant.tenantId),

        sb
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", merchant.tenantId)
          .gte("created_at", `${today}T00:00:00.000Z`),

        sb
          .from("tenant_orders")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", merchant.tenantId),

        sb
          .from("tenant_orders")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", merchant.tenantId)
          .neq("status", "COMPLETED"),
      ]);

      const queryErrors = [
        totalContacts.error,
        todayMessages.error,
        totalOrders.error,
        openOrders.error,
      ].filter(Boolean);

      if (queryErrors.length > 0) {
        return jsonResponse(
          {
            error: "Could not load merchant statistics",
          },
          500,
        );
      }

      return jsonResponse({
        data: {
          totalContacts: totalContacts.count || 0,
          todayMessages: todayMessages.count || 0,
          totalOrders: totalOrders.count || 0,
          openOrders: openOrders.count || 0,
        },
      });
    }

    return jsonResponse(
      { error: "Unknown action" },
      404,
    );
  } catch (error) {
    console.error("[Dashboard API Error]:", error);

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      500,
    );
  }
});

// =====================================================
// AUTHENTICATION
// =====================================================

async function authenticateUser(
  req: Request,
): Promise<{
  success: boolean;
  status: number;
  error?: string;
  user?: AuthenticatedUser;
}> {
  const authorization =
    req.headers.get("Authorization") || "";

  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return {
      success: false,
      status: 401,
      error: "Authentication required",
    };
  }

  const accessToken = match[1];

  const {
    data: { user },
    error,
  } = await sb.auth.getUser(accessToken);

  if (error || !user) {
    return {
      success: false,
      status: 401,
      error: "Invalid or expired login session",
    };
  }

  return {
    success: true,
    status: 200,
    user: {
      id: user.id,
      email: user.email,
    },
  };
}

// =====================================================
// MERCHANT MEMBERSHIP
// Never accept tenant_id from the browser.
// =====================================================

async function resolveMerchant(
  userId: string,
): Promise<{
  success: boolean;
  status: number;
  error?: string;
  context?: MerchantContext;
}> {
  const { data: memberships, error } = await sb
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(2);

  if (error) {
    console.error("Membership lookup failed:", error);

    return {
      success: false,
      status: 500,
      error: "Could not verify merchant membership",
    };
  }

  if (!memberships || memberships.length === 0) {
    return {
      success: false,
      status: 403,
      error: "No active merchant membership found",
    };
  }

  if (memberships.length > 1) {
    return {
      success: false,
      status: 409,
      error:
        "Multiple merchant workspaces found. Workspace selection is required.",
    };
  }

  const membership = memberships[0];

  const { data: tenant, error: tenantError } = await sb
    .from("tenants")
    .select("id, is_active")
    .eq("id", membership.tenant_id)
    .maybeSingle();

  if (
    tenantError ||
    !tenant ||
    tenant.is_active === false
  ) {
    return {
      success: false,
      status: 403,
      error: "Merchant workspace is unavailable",
    };
  }

  return {
    success: true,
    status: 200,
    context: {
      userId,
      tenantId: membership.tenant_id,
      role: membership.role,
    },
  };
}

// =====================================================
// SUPER ADMIN AUTHORIZATION
//
// Configure SUPER_ADMIN_USER_IDS as a comma-separated
// list of trusted Supabase Auth user UUIDs.
// =====================================================

function isSuperAdmin(userId: string): boolean {
  const allowedIds = (
    Deno.env.get("SUPER_ADMIN_USER_IDS") || ""
  )
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  return allowedIds.includes(userId);
}

// =====================================================
// AES-256-GCM TOKEN DECRYPTION
// Compatible with whatsapp-webhook/lib/encryption.ts
// =====================================================

function getEncryptionKey(): Uint8Array {
  const keyHex = Deno.env.get("ENCRYPTION_KEY") || "";

  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error(
      "ENCRYPTION_KEY must contain exactly 64 hexadecimal characters",
    );
  }

  const bytes = new Uint8Array(32);

  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(
      keyHex.substring(i * 2, i * 2 + 2),
      16,
    );
  }

  return bytes;
}

async function decryptToken(
  cipherText: string,
): Promise<string> {
  if (!cipherText) {
    throw new Error("Encrypted WhatsApp token is missing");
  }

  const combined = Uint8Array.from(
    atob(cipherText),
    (character) => character.charCodeAt(0),
  );

  if (combined.length <= 12) {
    throw new Error("Encrypted WhatsApp token is invalid");
  }

  const iv = combined.slice(0, 12);
  const encryptedData = combined.slice(12);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    getEncryptionKey(),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encryptedData,
  );

  return new TextDecoder().decode(decrypted);
}

// =====================================================
// MERCHANT WHATSAPP SENDER
// No system credential fallback.
// =====================================================

async function sendMerchantWhatsAppMessage(
  recipient: string,
  message: string,
  phoneNumberId: string,
  accessToken: string,
): Promise<string | null> {
  if (!phoneNumberId?.trim() || !accessToken?.trim()) {
    console.error("Merchant WhatsApp credentials are incomplete");
    return null;
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipient,
          type: "text",
          text: {
            preview_url: false,
            body: message,
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        "Merchant WhatsApp API rejected message:",
        response.status,
        errorText,
      );

      return null;
    }

    const result = await response.json();

    return result?.messages?.[0]?.id || null;
  } catch (error) {
    console.error("Merchant WhatsApp send failed:", error);
    return null;
  }
}

// =====================================================
// HELPERS
// =====================================================

async function readJson(
  req: Request,
): Promise<Record<string, any> | null> {
  try {
    const value = await req.json();

    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      return null;
    }

    return value as Record<string, any>;
  } catch {
    return null;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    .test(value);
}

function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
