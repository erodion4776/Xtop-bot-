// supabase/functions/whatsapp-webhook/database.ts

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { safeErrorLog } from "./utils.ts";

// ── Types ──────────────────────────────────────────────

export interface Contact {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  business_name: string | null;
  business_type: string | null;
}

export interface Conversation {
  id: string;
  contact_id: string;
  current_module: string;
  current_state: string;
  context_json: Record<string, unknown>;
  last_message_at: string;
}

// ── Client ─────────────────────────────────────────────

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  _client = createClient(url, key);
  return _client;
}

// ── Contacts ───────────────────────────────────────────

export async function getOrCreateContact(phone: string, profileName?: string): Promise<Contact> {
  const sb = getSupabaseClient();

  // Try to find existing contact
  const { data: existing, error: fetchErr } = await sb
    .from("contacts")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  if (fetchErr) {
    safeErrorLog("getOrCreateContact:fetch", fetchErr);
    throw fetchErr;
  }

  if (existing) {
    // Update name if we have a profile name and contact has none
    if (profileName && !existing.name) {
      await sb
        .from("contacts")
        .update({ name: profileName })
        .eq("id", existing.id);
      existing.name = profileName;
    }
    return existing as Contact;
  }

  // Create new contact
  const { data: created, error: createErr } = await sb
    .from("contacts")
    .insert({ phone, name: profileName || null })
    .select("*")
    .single();

  if (createErr) {
    safeErrorLog("getOrCreateContact:create", createErr);
    throw createErr;
  }

  return created as Contact;
}

// ── Conversations ──────────────────────────────────────

export async function getOrCreateConversation(contactId: string): Promise<Conversation> {
  const sb = getSupabaseClient();

  const { data: existing, error: fetchErr } = await sb
    .from("conversations")
    .select("*")
    .eq("contact_id", contactId)
    .maybeSingle();

  if (fetchErr) {
    safeErrorLog("getOrCreateConversation:fetch", fetchErr);
    throw fetchErr;
  }

  if (existing) return existing as Conversation;

  const { data: created, error: createErr } = await sb
    .from("conversations")
    .insert({
      contact_id: contactId,
      current_module: "MAIN_MENU",
      current_state: "IDLE",
      context_json: {},
    })
    .select("*")
    .single();

  if (createErr) {
    safeErrorLog("getOrCreateConversation:create", createErr);
    throw createErr;
  }

  return created as Conversation;
}

export async function updateConversation(
  conversationId: string,
  updates: {
    current_module?: string;
    current_state?: string;
    context_json?: Record<string, unknown>;
  }
): Promise<void> {
  const sb = getSupabaseClient();

  const { error } = await sb
    .from("conversations")
    .update({
      ...updates,
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  if (error) {
    safeErrorLog("updateConversation", error);
    throw error;
  }
}

// ── Messages ───────────────────────────────────────────

export async function storeMessage(
  contactId: string,
  direction: "INBOUND" | "OUTBOUND",
  messageType: string,
  messageText: string | null,
  whatsappMessageId?: string
): Promise<void> {
  const sb = getSupabaseClient();

  const { error } = await sb.from("messages").insert({
    contact_id: contactId,
    direction,
    message_type: messageType,
    message_text: messageText,
    whatsapp_message_id: whatsappMessageId || null,
  });

  if (error) {
    safeErrorLog("storeMessage", error);
    // Non-critical — log but don't crash
  }
}
