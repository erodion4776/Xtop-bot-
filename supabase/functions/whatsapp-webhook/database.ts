// supabase/functions/whatsapp-webhook/database.ts

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { safeErrorLog } from "./utils.ts";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

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
  steps_json: Array<{ step: number; title: string; bot_message: string; options: string[] }>;
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

export interface PricingPackage {
  id: string;
  service_type: string;
  package_code: string;
  package_name: string;
  description: string;
  min_price: number;
  max_price: number;
  currency: string;
  features: string[];
  priority: number;
  status: string;
}

export interface Lead {
  id: string;
  contact_id: string;
  service_type: string;
  business_name: string | null;
  industry: string | null;
  requirements_json: Record<string, unknown>;
  features: string[];
  website_required: boolean;
  bot_required: boolean;
  whatsapp_number_available: string | null;
  domain_available: string | null;
  hosting_available: string | null;
  budget_range: string | null;
  estimated_min_price: number | null;
  estimated_max_price: number | null;
  selected_package_id: string | null;
  status: string;
  created_at: string;
}

export interface Quotation {
  id: string;
  lead_id: string;
  quotation_number: string;
  package_id: string | null;
  title: string;
  summary: string | null;
  deliverables_json: string[];
  estimated_min_price: number;
  estimated_max_price: number;
  currency: string;
  valid_until: string | null;
  status: string;
  created_at: string;
}

export interface AgentRequest {
  id: string;
  contact_id: string;
  lead_id: string | null;
  quotation_id: string | null;
  request_type: string;
  message: string;
  quotation_summary: string | null;
  status: string;
  priority: string;
  created_at: string;
}

// ═══════════════════════════════════════════════════════
// CLIENT SINGLETON
// ═══════════════════════════════════════════════════════

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  _client = createClient(url, key);
  return _client;
}

// ═══════════════════════════════════════════════════════
// CONTACTS
// ═══════════════════════════════════════════════════════

export async function getOrCreateContact(phone: string, profileName?: string): Promise<Contact> {
  const sb = getSupabaseClient();
  const { data: existing, error: fe } = await sb.from("contacts").select("*").eq("phone", phone).maybeSingle();
  if (fe) { safeErrorLog("getOrCreateContact", fe); throw fe; }
  if (existing) {
    if (profileName && !existing.name) {
      await sb.from("contacts").update({ name: profileName }).eq("id", existing.id);
      existing.name = profileName;
    }
    return existing as Contact;
  }
  const { data: c, error: ce } = await sb.from("contacts").insert({ phone, name: profileName || null }).select("*").single();
  if (ce) { safeErrorLog("createContact", ce); throw ce; }
  return c as Contact;
}

// ═══════════════════════════════════════════════════════
// CONVERSATIONS
// ═══════════════════════════════════════════════════════

export async function getOrCreateConversation(contactId: string): Promise<Conversation> {
  const sb = getSupabaseClient();
  const { data: existing, error: fe } = await sb.from("conversations").select("*").eq("contact_id", contactId).maybeSingle();
  if (fe) { safeErrorLog("getOrCreateConversation", fe); throw fe; }
  if (existing) return existing as Conversation;
  const { data: c, error: ce } = await sb.from("conversations").insert({
    contact_id: contactId, current_module: "MAIN_MENU", current_state: "IDLE", context_json: {},
  }).select("*").single();
  if (ce) { safeErrorLog("createConversation", ce); throw ce; }
  return c as Conversation;
}

export async function updateConversation(id: string, updates: {
  current_module?: string; current_state?: string; context_json?: Record<string, unknown>;
}): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb.from("conversations").update({ ...updates, last_message_at: new Date().toISOString() }).eq("id", id);
  if (error) safeErrorLog("updateConversation", error);
}

export async function storeMessage(
  contactId: string,
  direction: "INBOUND" | "OUTBOUND",
  messageType: string,
  messageText: string | null,
  waId?: string
): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb.from("messages").insert({
    contact_id: contactId, direction, message_type: messageType,
    message_text: messageText, whatsapp_message_id: waId || null,
  });
  if (error) safeErrorLog("storeMessage", error);
}

// ═══════════════════════════════════════════════════════
// PRODUCTS / SERVICES / DEMOS / MAGAZINE
// ═══════════════════════════════════════════════════════

export async function getActiveProducts(): Promise<Product[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from("products").select("*").eq("status", "ACTIVE").order("name");
  if (error) { safeErrorLog("getActiveProducts", error); return []; }
  return (data || []) as Product[];
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from("products").select("*").eq("slug", slug).eq("status", "ACTIVE").maybeSingle();
  if (error) { safeErrorLog("getProductBySlug", error); return null; }
  return data as Product | null;
}

export async function getActiveServices(): Promise<ServiceItem[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from("services").select("*").eq("status", "ACTIVE").order("display_order");
  if (error) { safeErrorLog("getActiveServices", error); return []; }
  return (data || []) as ServiceItem[];
}

export async function getServiceBySlug(slug: string): Promise<ServiceItem | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from("services").select("*").eq("slug", slug).eq("status", "ACTIVE").maybeSingle();
  if (error) { safeErrorLog("getServiceBySlug", error); return null; }
  return data as ServiceItem | null;
}

export async function getActiveDemos(): Promise<DemoItem[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from("demos").select("*").eq("status", "ACTIVE").order("display_order");
  if (error) { safeErrorLog("getActiveDemos", error); return []; }
  return (data || []) as DemoItem[];
}

export async function getDemoBySlug(slug: string): Promise<DemoItem | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from("demos").select("*").eq("slug", slug).eq("status", "ACTIVE").maybeSingle();
  if (error) { safeErrorLog("getDemoBySlug", error); return null; }
  return data as DemoItem | null;
}

export async function getActiveMagazineConfig(): Promise<MagazineConfig | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from("magazine_config").select("*").eq("status", "ACTIVE").limit(1).maybeSingle();
  if (error) { safeErrorLog("getActiveMagazineConfig", error); return null; }
  return data as MagazineConfig | null;
}

// ═══════════════════════════════════════════════════════
// PRICING
// ═══════════════════════════════════════════════════════

export async function getPricingPackages(serviceType: string): Promise<PricingPackage[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from("pricing_packages").select("*")
    .eq("service_type", serviceType).eq("status", "ACTIVE").order("priority");
  if (error) { safeErrorLog("getPricingPackages", error); return []; }
  return (data || []) as PricingPackage[];
}

// ═══════════════════════════════════════════════════════
// LEADS
// ═══════════════════════════════════════════════════════

export async function getActiveLeadForContact(contactId: string, serviceType: string): Promise<Lead | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from("leads").select("*")
    .eq("contact_id", contactId).eq("service_type", serviceType)
    .in("status", ["QUALIFYING", "QUOTED", "PACKAGE_SELECTED", "AGENT_REQUESTED"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) { safeErrorLog("getActiveLead", error); return null; }
  return data as Lead | null;
}

export async function createLead(contactId: string, serviceType: string, fields: Partial<Lead>): Promise<Lead | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from("leads").insert({
    contact_id: contactId, service_type: serviceType, status: "QUALIFYING", ...fields,
  }).select("*").single();
  if (error) { safeErrorLog("createLead", error); return null; }
  return data as Lead;
}

export async function updateLead(leadId: string, fields: Partial<Lead>): Promise<Lead | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from("leads").update({
    ...fields, updated_at: new Date().toISOString(),
  }).eq("id", leadId).select("*").single();
  if (error) { safeErrorLog("updateLead", error); return null; }
  return data as Lead;
}

// ═══════════════════════════════════════════════════════
// QUOTATIONS
// ═══════════════════════════════════════════════════════

async function getNextQuotationNumber(): Promise<string> {
  const sb = getSupabaseClient();
  const year = new Date().getFullYear();
  const { data, error } = await sb.from("quotations").select("quotation_number")
    .like("quotation_number", `XTR-${year}-%`)
    .order("quotation_number", { ascending: false }).limit(1).maybeSingle();
  if (error) safeErrorLog("getNextQuotationNumber", error);
  let seq = 1;
  if (data?.quotation_number) {
    const parts = data.quotation_number.split("-");
    if (parts.length >= 3) seq = parseInt(parts[2], 10) + 1;
  }
  return `XTR-${year}-${String(seq).padStart(6, "0")}`;
}

export async function createQuotation(
  leadId: string, packageId: string | null,
  title: string, summary: string, deliverables: string[],
  minPrice: number, maxPrice: number
): Promise<Quotation | null> {
  const sb = getSupabaseClient();
  const qNum = await getNextQuotationNumber();
  const validUntil = new Date(Date.now() + 14 * 86400000).toISOString();
  const { data, error } = await sb.from("quotations").insert({
    lead_id: leadId, quotation_number: qNum, package_id: packageId,
    title, summary, deliverables_json: deliverables,
    estimated_min_price: minPrice, estimated_max_price: maxPrice,
    currency: "NGN", valid_until: validUntil, status: "PRESENTED",
  }).select("*").single();
  if (error) { safeErrorLog("createQuotation", error); return null; }
  return data as Quotation;
}

export async function updateQuotation(quotationId: string, fields: Partial<Quotation>): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb.from("quotations").update({
    ...fields, updated_at: new Date().toISOString(),
  }).eq("id", quotationId);
  if (error) safeErrorLog("updateQuotation", error);
}

// ═══════════════════════════════════════════════════════
// AGENT REQUESTS
// ═══════════════════════════════════════════════════════

export async function createAgentRequest(
  contactId: string, requestType: string, message: string,
  priority: string = "NORMAL",
  leadId?: string, quotationId?: string, quotationSummary?: string
): Promise<AgentRequest | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from("agent_requests").insert({
    contact_id: contactId, request_type: requestType, message,
    status: "NEW", priority,
    lead_id: leadId || null, quotation_id: quotationId || null,
    quotation_summary: quotationSummary || null,
  }).select("*").single();
  if (error) { safeErrorLog("createAgentRequest", error); return null; }
  return data as AgentRequest;
}
