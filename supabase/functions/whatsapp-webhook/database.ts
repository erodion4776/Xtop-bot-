// supabase/functions/whatsapp-webhook/database.ts

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { safeErrorLog } from "./utils.ts";

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

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  features: string[];
  target_audience: string;
  price: number | null;
  price_text: string | null;
  website_url: string | null;
  demo_url: string | null;
  whatsapp_demo_text: string | null;
  status: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  features: string[];
  base_price: number | null;
  price_range: string | null;
  display_order: number;
  status: string;
}

export interface DemoItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  demo_type: string;
  steps_json: Array<{
    step: number;
    title: string;
    bot_message: string;
    options: string[];
  }>;
  display_order: number;
  status: string;
}

export interface MagazineConfig {
  id: string;
  title: string;
  description: string;
  file_url: string | null;
  status: string;
}

export interface AgentRequest {
  id: string;
  contact_id: string;
  request_type: "START_PROJECT" | "QUOTATION" | "PRODUCT_QUESTION" | "TECH_SUPPORT" | "GENERAL_ENQUIRY";
  message: string;
  status: "NEW" | "IN_PROGRESS" | "RESOLVED";
  priority: "NORMAL" | "HIGH" | "URGENT";
  created_at: string;
}

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

// ── Contacts & Conversations ───────────────────────────

export async function getOrCreateContact(phone: string, profileName?: string): Promise<Contact> {
  const sb = getSupabaseClient();
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
    if (profileName && !existing.name) {
      await sb.from("contacts").update({ name: profileName }).eq("id", existing.id);
      existing.name = profileName;
    }
    return existing as Contact;
  }

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

  if (error) safeErrorLog("storeMessage", error);
}

// ── Products ───────────────────────────────────────────

export async function getActiveProducts(): Promise<Product[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("products")
    .select("*")
    .eq("status", "ACTIVE")
    .order("name", { ascending: true });

  if (error) {
    safeErrorLog("getActiveProducts", error);
    return [];
  }
  return (data || []) as Product[];
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("products")
    .select("*")
    .eq("slug", slug)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (error) {
    safeErrorLog("getProductBySlug", error);
    return null;
  }
  return data as Product | null;
}

// ── Services ───────────────────────────────────────────

export async function getActiveServices(): Promise<ServiceItem[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("services")
    .select("*")
    .eq("status", "ACTIVE")
    .order("display_order", { ascending: true });

  if (error) {
    safeErrorLog("getActiveServices", error);
    return [];
  }
  return (data || []) as ServiceItem[];
}

export async function getServiceBySlug(slug: string): Promise<ServiceItem | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("services")
    .select("*")
    .eq("slug", slug)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (error) {
    safeErrorLog("getServiceBySlug", error);
    return null;
  }
  return data as ServiceItem | null;
}

// ── Demos ──────────────────────────────────────────────

export async function getActiveDemos(): Promise<DemoItem[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("demos")
    .select("*")
    .eq("status", "ACTIVE")
    .order("display_order", { ascending: true });

  if (error) {
    safeErrorLog("getActiveDemos", error);
    return [];
  }
  return (data || []) as DemoItem[];
}

export async function getDemoBySlug(slug: string): Promise<DemoItem | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("demos")
    .select("*")
    .eq("slug", slug)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (error) {
    safeErrorLog("getDemoBySlug", error);
    return null;
  }
  return data as DemoItem | null;
}

// ── Magazine ───────────────────────────────────────────

export async function getActiveMagazineConfig(): Promise<MagazineConfig | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("magazine_config")
    .select("*")
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    safeErrorLog("getActiveMagazineConfig", error);
    return null;
  }
  return data as MagazineConfig | null;
}

// ── Agent Requests ─────────────────────────────────────

export async function createAgentRequest(
  contactId: string,
  requestType: AgentRequest["request_type"],
  message: string,
  priority: AgentRequest["priority"] = "NORMAL"
): Promise<AgentRequest | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("agent_requests")
    .insert({
      contact_id: contactId,
      request_type: requestType,
      message,
      status: "NEW",
      priority,
    })
    .select("*")
    .single();

  if (error) {
    safeErrorLog("createAgentRequest", error);
    return null;
  }
  return data as AgentRequest;
}
