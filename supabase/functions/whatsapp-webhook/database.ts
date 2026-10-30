// supabase/functions/whatsapp-webhook/database.ts

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ==========================================
// 1. SUPABASE CLIENT & HELPERS
// ==========================================

let supabaseInstance: SupabaseClient | null = null;

export const SYSTEM_TENANT_ID =
  "00000000-0000-0000-0000-000000000001";

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseInstance) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_ANON_KEY") ??
      "";

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase configuration");
    }

    supabaseInstance = createClient(supabaseUrl, supabaseKey);
  }

  return supabaseInstance;
}

export function safeErrorLog(context: string, error: unknown): void {
  console.error(`[DB Error - ${context}]:`, error);
}

function toValidUUID(val?: string | null): string | null {
  if (!val || typeof val !== "string") return null;

  const clean = val.trim();

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)
    ? clean
    : null;
}

/**
 * Compatibility default for existing XTOP system modules.
 *
 * Customer-facing requests MUST pass their resolved tenant ID explicitly.
 */
export function resolveTenantId(tenantId?: string | null): string {
  if (!tenantId) return SYSTEM_TENANT_ID;

  const valid = toValidUUID(tenantId);

  if (!valid) {
    throw new Error("Invalid tenant ID supplied");
  }

  return valid;
}

// ==========================================
// 2. TYPES & INTERFACES
// ==========================================

export interface Contact {
  id?: string;
  tenant_id?: string;
  phone: string;
  name?: string | null;
  [key: string]: unknown;
}

export interface Conversation {
  id: string;
  tenant_id?: string;
  contact_id?: string | null;
  phone?: string;
  current_module?: string;
  current_state?: string;
  context_json?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface ConversationUpdate {
  current_module?: string;
  current_state?: string;
  context_json?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Product {
  id?: string;
  tenant_id?: string;
  name: string;
  slug: string;
  category: string;
  description?: string;
  target_audience?: string;
  features?: string[];
  price_text?: string;
  website_url?: string;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface Service {
  id?: string;
  tenant_id?: string;
  name: string;
  slug: string;
  description?: string;
  price_range?: string;
  features?: string[];
  category?: string;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface Demo {
  id?: string;
  title: string;
  slug: string;
  category?: string;
  description?: string;
  demo_url?: string;
  whatsapp_number?: string;
  is_active?: boolean;
  [key: string]: unknown;
}

export interface MagazineConfig {
  id?: string;
  title: string;
  description: string;
  file_url: string;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface AgentRequest {
  id: string;
  tenant_id?: string;
  contact_id?: string | null;
  request_type: string;
  message: string;
  description?: string;
  priority?: string;
  lead_id?: string | null;
  quotation_id?: string | null;
  summary?: string | null;
  status?: string;
  created_at?: string;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface PricingPackage {
  id: string;
  service_type: string;
  package_name: string;
  name?: string;
  package_code: string;
  slug?: string;
  min_price: number;
  max_price: number;
  features: string[];
  description?: string;
  delivery_timeline?: string;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface Lead {
  id: string;
  tenant_id?: string;
  contact_id?: string | null;
  service_type?: string | null;
  business_name?: string | null;
  industry?: string | null;
  features?: string[] | null;
  budget_range?: string | null;
  bot_required?: boolean | null;
  website_required?: boolean | null;
  whatsapp_number_available?: string | null;
  domain_available?: string | null;
  hosting_available?: string | null;
  estimated_min_price?: number | null;
  estimated_max_price?: number | null;
  selected_package_id?: string | null;
  status?: string | null;
  requirements_json?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface Quotation {
  id: string;
  tenant_id?: string;
  quotation_number: string;
  lead_id?: string | null;
  package_id?: string | null;
  title?: string | null;
  description?: string | null;
  deliverables?: string[] | null;
  min_price?: number | null;
  max_price?: number | null;
  status?: string | null;
  created_at?: string;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface Student {
  id: string;
  phone: string;
  name: string | null;
  matric_number: string | null;
  department: string | null;
  level: string | null;
  email: string | null;
  serial_number: string | null;
  created_at: string;
  updated_at: string | null;
}

// ==========================================
// 3. CONTACT & CONVERSATION FUNCTIONS
// ==========================================

export async function getContactByPhone(
  phone: string,
  tenantId?: string
): Promise<Contact | null> {
  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);

  const { data, error } = await sb
    .from("contacts")
    .select("*")
    .eq("tenant_id", tenant)
    .eq("phone", phone)
    .maybeSingle();

  if (error) {
    safeErrorLog("getContactByPhone", error);
    return null;
  }

  return data as Contact | null;
}

export async function getOrCreateContact(
  phone: string,
  name?: string | null,
  tenantId?: string
): Promise<Contact> {
  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);

  const existing = await getContactByPhone(phone, tenant);

  if (existing) return existing;

  const { data, error } = await sb
    .from("contacts")
    .insert({
      tenant_id: tenant,
      phone,
      name: name || null,
    })
    .select("*")
    .single();

  if (error) {
    safeErrorLog("getOrCreateContact", error);

    // Check again in case another request created the same contact.
    const retry = await getContactByPhone(phone, tenant);

    if (retry) return retry;

    throw error;
  }

  return data as Contact;
}

export async function getOrCreateConversation(
  contactId?: string,
  tenantId?: string
): Promise<Conversation> {
  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);

  if (contactId) {
    const { data: existing, error: fetchError } = await sb
      .from("conversations")
      .select("*")
      .eq("tenant_id", tenant)
      .eq("contact_id", contactId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      safeErrorLog("getOrCreateConversation.fetch", fetchError);
    }

    if (existing) return existing as Conversation;

    const { data: created, error } = await sb
      .from("conversations")
      .insert({
        tenant_id: tenant,
        contact_id: contactId,
        current_module: "MAIN_MENU",
        current_state: "IDLE",
        context_json: {},
      })
      .select("*")
      .single();

    if (error) {
      safeErrorLog("getOrCreateConversation.insert", error);
      throw error;
    }

    return created as Conversation;
  }

  throw new Error("A valid contact ID is required to create a conversation");
}

export async function updateConversation(
  conversationId: string,
  fields: ConversationUpdate,
  tenantId?: string
): Promise<Conversation | null> {
  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);

  const updatePayload: Record<string, unknown> = {
    ...fields,
    updated_at: new Date().toISOString(),
  };

  delete updatePayload.tenant_id;
  delete updatePayload.id;
  delete updatePayload.contact_id;

  const { data, error } = await sb
    .from("conversations")
    .update(updatePayload)
    .eq("tenant_id", tenant)
    .eq("id", conversationId)
    .select("*")
    .maybeSingle();

  if (error) {
    safeErrorLog("updateConversation", error);
    return null;
  }

  return data as Conversation | null;
}

// ==========================================
// 4. MESSAGE STORAGE
// ==========================================

export async function storeMessage(
  contactId?: string,
  direction: "INBOUND" | "OUTBOUND" = "INBOUND",
  messageType: string = "text",
  body?: string | null,
  whatsappMessageId?: string | null,
  tenantId?: string
): Promise<any> {
  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);

  try {
    let phone: string | null = null;
    let resolvedContactId: string | null = null;

    if (contactId) {
      const validContactId = toValidUUID(contactId);

      if (validContactId) {
        const { data: contact } = await sb
          .from("contacts")
          .select("id, phone")
          .eq("tenant_id", tenant)
          .eq("id", validContactId)
          .maybeSingle();

        if (contact) {
          resolvedContactId = contact.id;
          phone = contact.phone
            ? String(contact.phone).replace(/[^0-9]/g, "")
            : null;
        }
      } else {
        phone = contactId.replace(/[^0-9]/g, "");

        const localPhone = phone.startsWith("234")
          ? "0" + phone.slice(3)
          : phone;

        const { data: contact } = await sb
          .from("contacts")
          .select("id")
          .eq("tenant_id", tenant)
          .or(
            `phone.eq.${phone},phone.eq.+${phone},phone.eq.${localPhone}`
          )
          .maybeSingle();

        resolvedContactId = contact?.id || null;
      }
    }

    const payload: Record<string, unknown> = {
      tenant_id: tenant,
      contact_id: resolvedContactId,
      phone_number: phone,
      direction,
      message_type: messageType,
      body: body || null,
      content: body || null,
      text: body || null,
      message_text: body || null,
      whatsapp_message_id: whatsappMessageId || null,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await sb
      .from("messages")
      .insert(payload)
      .select("*")
      .maybeSingle();

    if (error) {
      safeErrorLog("storeMessage", error);
      return null;
    }

    return data;
  } catch (err) {
    safeErrorLog("storeMessage catch", err);
    return null;
  }
}

// ==========================================
// 5. PRODUCTS
// ==========================================

export async function getActiveProducts(
  tenantId?: string
): Promise<Product[]> {
  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);

  const { data, error } = await sb
    .from("products")
    .select("*")
    .eq("tenant_id", tenant)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    safeErrorLog("getActiveProducts", error);
    return [];
  }

  return (data || []) as Product[];
}

export async function getProductBySlug(
  slug: string,
  tenantId?: string
): Promise<Product | null> {
  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);

  const { data, error } = await sb
    .from("products")
    .select("*")
    .eq("tenant_id", tenant)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    safeErrorLog(`getProductBySlug(${slug})`, error);
    return null;
  }

  return data as Product | null;
}

export async function getProductById(
  productId: string,
  tenantId?: string
): Promise<Product | null> {
  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);

  const { data, error } = await sb
    .from("products")
    .select("*")
    .eq("tenant_id", tenant)
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    safeErrorLog("getProductById", error);
    return null;
  }

  return data as Product | null;
}

// ==========================================
// 6. SERVICES
// ==========================================

export async function getActiveServices(
  tenantId?: string
): Promise<Service[]> {
  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);

  const { data, error } = await sb
    .from("services")
    .select("*")
    .eq("tenant_id", tenant)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true });

  if (error) {
    safeErrorLog("getActiveServices", error);
    return [];
  }

  return (data || []) as Service[];
}

export async function getServiceBySlug(
  slug: string,
  tenantId?: string
): Promise<Service | null> {
  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);

  const { data, error } = await sb
    .from("services")
    .select("*")
    .eq("tenant_id", tenant)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    safeErrorLog(`getServiceBySlug(${slug})`, error);
    return null;
  }

  return data as Service | null;
}

export async function getServiceById(
  serviceId: string,
  tenantId?: string
): Promise<Service | null> {
  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);

  const { data, error } = await sb
    .from("services")
    .select("*")
    .eq("tenant_id", tenant)
    .eq("id", serviceId)
    .maybeSingle();

  if (error) {
    safeErrorLog("getServiceById", error);
    return null;
  }

  return data as Service | null;
}

// ==========================================
// 7. SHARED DEMO CATALOGUE
// ==========================================

export async function getActiveDemos(): Promise<Demo[]> {
  const sb = getSupabaseClient();

  const { data, error } = await sb
    .from("demos")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    safeErrorLog("getActiveDemos", error);
    return [];
  }

  return (data || []) as Demo[];
}

export async function getDemoBySlug(slug: string): Promise<Demo | null> {
  const sb = getSupabaseClient();

  const { data, error } = await sb
    .from("demos")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    safeErrorLog(`getDemoBySlug(${slug})`, error);
    return null;
  }

  return data as Demo | null;
}

// ==========================================
// 8. PRICING, LEADS & QUOTATIONS
// ==========================================

export async function getPricingPackages(
  serviceType?: string
): Promise<PricingPackage[]> {
  const sb = getSupabaseClient();

  let query = sb
    .from("pricing_packages")
    .select("*")
    .eq("is_active", true);

  if (serviceType) {
    query = query.ilike("service_type", `%${serviceType}%`);
  }

  const { data, error } = await query.order("min_price", {
    ascending: true,
  });

  if (error) {
    safeErrorLog("getPricingPackages", error);
    return [];
  }

  return ((data || []).map((pkg: any) => ({
    ...pkg,
    package_name: pkg.package_name || pkg.name || "Standard Package",
    package_code:
      pkg.package_code || pkg.slug?.toUpperCase() || "PKG-STD",
  })) as PricingPackage[]);
}

export async function createLead(
  contactId?: string,
  serviceType?: string,
  fields: Partial<Lead> = {},
  tenantId?: string
): Promise<Lead | null> {
  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);

  const payload: Record<string, unknown> = {
    contact_id: contactId || null,
    service_type: serviceType || null,
    status: "QUALIFYING",
    ...fields,
    tenant_id: tenant,
    created_at: new Date().toISOString(),
  };

  delete payload.id;

  const { data, error } = await sb
    .from("leads")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    safeErrorLog("createLead", error);
    return null;
  }

  return data as Lead;
}

export async function updateLead(
  leadId: string,
  fields: Partial<Lead>,
  tenantId?: string
): Promise<Lead | null> {
  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);

  const payload: Record<string, unknown> = {
    ...fields,
    updated_at: new Date().toISOString(),
  };

  delete payload.id;
  delete payload.tenant_id;
  delete payload.contact_id;

  const { data, error } = await sb
    .from("leads")
    .update(payload)
    .eq("tenant_id", tenant)
    .eq("id", leadId)
    .select("*")
    .maybeSingle();

  if (error) {
    safeErrorLog("updateLead", error);
    return null;
  }

  return data as Lead | null;
}

export async function getActiveLeadForContact(
  contactId?: string,
  serviceType?: string,
  tenantId?: string
): Promise<Lead | null> {
  if (!contactId) return null;

  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);

  let query = sb
    .from("leads")
    .select("*")
    .eq("tenant_id", tenant)
    .eq("contact_id", contactId)
    .in("status", ["QUALIFYING", "QUOTED", "PACKAGE_SELECTED"]);

  if (serviceType) {
    query = query.eq("service_type", serviceType);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    safeErrorLog("getActiveLeadForContact", error);
    return null;
  }

  return data as Lead | null;
}

export async function createQuotation(
  leadId: string,
  packageId?: string,
  title?: string,
  description?: string,
  deliverables?: string[],
  minPrice?: number,
  maxPrice?: number,
  tenantId?: string
): Promise<Quotation | null> {
  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);

  // Confirm the lead belongs to this tenant before creating its quotation.
  const { data: lead, error: leadError } = await sb
    .from("leads")
    .select("id")
    .eq("tenant_id", tenant)
    .eq("id", leadId)
    .maybeSingle();

  if (leadError || !lead) {
    if (leadError) safeErrorLog("createQuotation.leadCheck", leadError);
    return null;
  }

  const quoteNumber = `XTR-${Date.now().toString().slice(-6)}`;

  const payload = {
    tenant_id: tenant,
    quotation_number: quoteNumber,
    lead_id: leadId,
    package_id: packageId || null,
    title: title || null,
    description: description || null,
    deliverables: deliverables || [],
    min_price: minPrice ?? null,
    max_price: maxPrice ?? null,
    status: "DRAFT",
    created_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from("quotations")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    safeErrorLog("createQuotation", error);
    return null;
  }

  return data as Quotation;
}

export async function updateQuotation(
  quotationId: string,
  fields: Partial<Quotation>,
  tenantId?: string
): Promise<Quotation | null> {
  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);

  const payload: Record<string, unknown> = {
    ...fields,
    updated_at: new Date().toISOString(),
  };

  delete payload.id;
  delete payload.tenant_id;
  delete payload.lead_id;

  const { data, error } = await sb
    .from("quotations")
    .update(payload)
    .eq("tenant_id", tenant)
    .eq("id", quotationId)
    .select("*")
    .maybeSingle();

  if (error) {
    safeErrorLog("updateQuotation", error);
    return null;
  }

  return data as Quotation | null;
}

// ==========================================
// 9. SHARED MAGAZINE CONFIGURATION
// ==========================================

export async function getActiveMagazineConfig(): Promise<MagazineConfig | null> {
  const sb = getSupabaseClient();

  const { data, error } = await sb
    .from("magazine_config")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    safeErrorLog("getActiveMagazineConfig", error);
    return null;
  }

  return data as MagazineConfig | null;
}

// ==========================================
// 10. AGENT & SUPPORT REQUESTS
// ==========================================

export async function createAgentRequest(
  contactId?: string,
  requestType: string = "QUOTATION",
  message: string = "",
  priority: string = "HIGH",
  leadId?: string,
  quotationId?: string,
  summary?: string,
  tenantId?: string
): Promise<AgentRequest | null> {
  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);
  const msgText = message || summary || "Customer Agent Request";

  const payload: Record<string, unknown> = {
    tenant_id: tenant,
    request_type: requestType || "QUOTATION",
    message: msgText,
    description: msgText,
    priority: priority || "NORMAL",
    status: "PENDING",
  };

  const validContactId = toValidUUID(contactId);
  const validLeadId = toValidUUID(leadId);
  const validQuotationId = toValidUUID(quotationId);

  if (validContactId) {
    const { data } = await sb
      .from("contacts")
      .select("id")
      .eq("tenant_id", tenant)
      .eq("id", validContactId)
      .maybeSingle();

    if (data) payload.contact_id = validContactId;
  }

  if (validLeadId) {
    const { data } = await sb
      .from("leads")
      .select("id")
      .eq("tenant_id", tenant)
      .eq("id", validLeadId)
      .maybeSingle();

    if (data) payload.lead_id = validLeadId;
  }

  if (validQuotationId) {
    const { data } = await sb
      .from("quotations")
      .select("id")
      .eq("tenant_id", tenant)
      .eq("id", validQuotationId)
      .maybeSingle();

    if (data) payload.quotation_id = validQuotationId;
  }

  if (summary) payload.summary = summary;

  try {
    const { data, error } = await sb
      .from("agent_requests")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      safeErrorLog("createAgentRequest", error);
      return null;
    }

    return data as AgentRequest;
  } catch (err) {
    safeErrorLog("createAgentRequest.catch", err);
    return null;
  }
}

// ==========================================
// 11. STUDENT & ATTENDANCE FUNCTIONS
// These tables currently have no tenant_id.
// ==========================================

export function isStudentProfileComplete(student: Student): boolean {
  return !!(
    student.name &&
    student.matric_number &&
    student.department &&
    student.level &&
    student.serial_number
  );
}

export async function getStudentByPhone(phone: string): Promise<Student | null> {
  const sb = getSupabaseClient();

  const { data, error } = await sb
    .from("students")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  if (error) {
    safeErrorLog("getStudentByPhone", error);
    return null;
  }

  return data as Student | null;
}

export async function getOrCreateStudent(
  phone: string,
  fallbackName?: string | null
): Promise<Student> {
  const sb = getSupabaseClient();

  const existing = await getStudentByPhone(phone);
  if (existing) return existing;

  const defaultName = fallbackName?.trim() || "Student";
  const names = defaultName.split(" ");

  const { data, error } = await sb
    .from("students")
    .insert({
      phone,
      name: defaultName,
      first_name: names[0] || "",
      last_name: names.slice(1).join(" ") || "",
      status: "ACTIVE",
    })
    .select("*")
    .single();

  if (error) {
    safeErrorLog("getOrCreateStudent", error);
    throw error;
  }

  return data as Student;
}

export async function createStudentProfile(
  phone: string,
  name: string,
  matricNumber: string,
  department: string,
  level: string,
  serialNumber: string
): Promise<Student | null> {
  const sb = getSupabaseClient();
  const names = name.trim().split(" ");

  const { data, error } = await sb
    .from("students")
    .insert({
      phone,
      name: name.trim(),
      first_name: names[0] || "",
      last_name: names.slice(1).join(" ") || "",
      matric_number: matricNumber.trim().toUpperCase(),
      department: department.trim(),
      level: level.trim(),
      serial_number: serialNumber.trim(),
      status: "ACTIVE",
    })
    .select("*")
    .single();

  if (error) {
    safeErrorLog("createStudentProfile", error);
    return null;
  }

  return data as Student;
}

export async function updateStudentProfile(
  studentId: string,
  fields: {
    name?: string;
    matric_number?: string;
    department?: string;
    level?: string;
    serial_number?: string;
  }
): Promise<Student | null> {
  const sb = getSupabaseClient();

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (fields.name) {
    updatePayload.name = fields.name.trim();
    const names = fields.name.trim().split(" ");
    updatePayload.first_name = names[0] || "";
    updatePayload.last_name = names.slice(1).join(" ");
  }

  if (fields.matric_number) {
    updatePayload.matric_number = fields.matric_number.trim().toUpperCase();
  }

  if (fields.department) updatePayload.department = fields.department.trim();
  if (fields.level) updatePayload.level = fields.level.trim();
  if (fields.serial_number) updatePayload.serial_number = fields.serial_number.trim();

  const { data, error } = await sb
    .from("students")
    .update(updatePayload)
    .eq("id", studentId)
    .select("*")
    .maybeSingle();

  if (error) {
    safeErrorLog("updateStudentProfile", error);
    return null;
  }

  return data as Student | null;
}

export async function getTodayAttendance(studentId: string): Promise<any> {
  const sb = getSupabaseClient();
  const todayStr = new Date().toISOString().split("T")[0];

  const { data, error } = await sb
    .from("attendance")
    .select("*")
    .eq("student_id", studentId)
    .gte("created_at", `${todayStr}T00:00:00.000Z`)
    .lte("created_at", `${todayStr}T23:59:59.999Z`)
    .maybeSingle();

  if (error) {
    safeErrorLog("getTodayAttendance", error);
    return null;
  }

  return data;
}

export async function recordAttendance(studentId: string): Promise<any> {
  const sb = getSupabaseClient();

  const { data, error } = await sb
    .from("attendance")
    .insert({ student_id: studentId })
    .select("*")
    .single();

  if (error) {
    safeErrorLog("recordAttendance", error);
    return null;
  }

  return data;
}

// ==========================================
// 12. COURSE & EXAM FUNCTIONS
// These tables currently have no tenant_id.
// ==========================================

export async function getCourseByCode(courseCode: string): Promise<any> {
  const sb = getSupabaseClient();

  const { data, error } = await sb
    .from("courses")
    .select("*")
    .eq("course_code", courseCode.trim().toUpperCase())
    .maybeSingle();

  if (error) {
    safeErrorLog("getCourseByCode", error);
    return null;
  }

  return data;
}

export async function getStudentCourseAccess(
  studentId: string,
  courseId: string,
  courseStatus?: string
): Promise<any> {
  const sb = getSupabaseClient();

  let { data, error } = await sb
    .from("student_courses")
    .select("*")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .maybeSingle();

  if (error) {
    safeErrorLog("getStudentCourseAccess.fetch", error);
    return null;
  }

  if (!data) {
    const { data: inserted, error: insertError } = await sb
      .from("student_courses")
      .insert({
        student_id: studentId,
        course_id: courseId,
        access_status: courseStatus || "ACTIVE",
        progress: {
          completed_lessons: [],
          last_lesson_order: 0,
        },
      })
      .select("*")
      .single();

    if (insertError) {
      safeErrorLog("getStudentCourseAccess.insert", insertError);
      return null;
    }

    data = inserted;
  }

  return data;
}

export async function markLessonComplete(
  studentCourseId: string,
  lessonId: string,
  lastLessonOrder: number
): Promise<any> {
  const sb = getSupabaseClient();

  const { data: record, error: fetchErr } = await sb
    .from("student_courses")
    .select("progress")
    .eq("id", studentCourseId)
    .maybeSingle();

  if (fetchErr || !record) {
    safeErrorLog("markLessonComplete.fetch", fetchErr);
    return null;
  }

  const progress = record.progress || {
    completed_lessons: [],
    last_lesson_order: 0,
  };

  const completed = Array.isArray(progress.completed_lessons)
    ? [...progress.completed_lessons]
    : [];

  if (!completed.includes(lessonId)) completed.push(lessonId);

  const updatedProgress = {
    completed_lessons: completed,
    last_lesson_order: Math.max(
      progress.last_lesson_order || 0,
      lastLessonOrder
    ),
  };

  const { data, error } = await sb
    .from("student_courses")
    .update({
      progress: updatedProgress,
      updated_at: new Date().toISOString(),
    })
    .eq("id", studentCourseId)
    .select("*")
    .maybeSingle();

  if (error) {
    safeErrorLog("markLessonComplete.update", error);
    return null;
  }

  return data;
}

export async function getStudentExamAttempts(
  studentId: string,
  courseId: string
): Promise<any[]> {
  const sb = getSupabaseClient();

  const { data, error } = await sb
    .from("exam_attempts")
    .select("*")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .order("created_at", { ascending: true });

  if (error) {
    safeErrorLog("getStudentExamAttempts", error);
    return [];
  }

  return data || [];
}

// ==========================================
// 13. GAMES ENGINE
// Current game tables do not have tenant_id.
// ==========================================

export interface GameSession {
  id: string;
  user_id?: string | null;
  phone_number: string;
  game_type: string;
  difficulty: string;
  current_question: number;
  current_round: number;
  score: number;
  correct_answers: number;
  wrong_answers: number;
  streak: number;
  max_streak: number;
  lives: number;
  status: "ACTIVE" | "COMPLETED" | "ABANDONED" | "EXPIRED";
  metadata: Record<string, any>;
  started_at: string;
  expires_at: string;
  completed_at?: string | null;
}

export interface GameQuestion {
  id: string;
  game_type: string;
  category: string;
  difficulty: string;
  question: string;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  correct_answer: string;
  explanation?: string;
  is_active: boolean;
}

export async function getActiveGameSession(phone: string): Promise<GameSession | null> {
  const sb = getSupabaseClient();

  const { data, error } = await sb
    .from("game_sessions")
    .select("*")
    .eq("phone_number", phone)
    .eq("status", "ACTIVE")
    .gt("expires_at", new Date().toISOString())
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    safeErrorLog("getActiveGameSession", error);
    return null;
  }

  return data as GameSession | null;
}

export async function createGameSession(
  phone: string,
  gameType: string,
  difficulty: string = "EASY",
  metadata: Record<string, any> = {},
  lives: number = 3
): Promise<GameSession | null> {
  const sb = getSupabaseClient();

  await abandonActiveSessions(phone);

  const { data, error } = await sb
    .from("game_sessions")
    .insert({
      phone_number: phone,
      game_type: gameType,
      difficulty,
      lives,
      metadata,
      status: "ACTIVE",
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    safeErrorLog("createGameSession", error);
    return null;
  }

  return data as GameSession;
}

export async function updateGameSession(
  sessionId: string,
  fields: Partial<GameSession>
): Promise<GameSession | null> {
  const sb = getSupabaseClient();

  const { data, error } = await sb
    .from("game_sessions")
    .update(fields)
    .eq("id", sessionId)
    .select("*")
    .maybeSingle();

  if (error) {
    safeErrorLog("updateGameSession", error);
    return null;
  }

  return data as GameSession | null;
}

export async function abandonActiveSessions(phone: string): Promise<void> {
  const sb = getSupabaseClient();

  await sb
    .from("game_sessions")
    .update({
      status: "ABANDONED",
      completed_at: new Date().toISOString(),
    })
    .eq("phone_number", phone)
    .eq("status", "ACTIVE");
}

export async function completeGameSession(
  sessionId: string
): Promise<GameSession | null> {
  return await updateGameSession(sessionId, {
    status: "COMPLETED",
    completed_at: new Date().toISOString(),
  } as any);
}

export async function getRandomQuestions(
  gameType: string,
  difficulty: string,
  count: number
): Promise<GameQuestion[]> {
  const sb = getSupabaseClient();

  const { data, error } = await sb
    .from("game_questions")
    .select("*")
    .eq("game_type", gameType)
    .eq("difficulty", difficulty)
    .eq("is_active", true);

  if (error) {
    safeErrorLog("getRandomQuestions", error);
    return [];
  }

  const shuffled = (data || []).sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count) as GameQuestion[];
}

export async function logGameAnswer(
  sessionId: string,
  questionId: string | null,
  questionIndex: number,
  selected: string,
  correct: string,
  isCorrect: boolean,
  points: number
): Promise<void> {
  const sb = getSupabaseClient();

  const { error } = await sb.from("game_answers").insert({
    session_id: sessionId,
    question_id: questionId,
    question_index: questionIndex,
    selected_answer: selected,
    correct_answer: correct,
    is_correct: isCorrect,
    points_awarded: points,
  });

  if (error) safeErrorLog("logGameAnswer", error);
}

export async function recordGameScore(
  session: GameSession,
  xp: number
): Promise<void> {
  const sb = getSupabaseClient();

  const { error } = await sb.from("game_scores").insert({
    session_id: session.id,
    phone_number: session.phone_number,
    user_id: session.user_id,
    game_type: session.game_type,
    difficulty: session.difficulty,
    score: session.score,
    correct_answers: session.correct_answers,
    wrong_answers: session.wrong_answers,
    max_streak: session.max_streak,
    xp_earned: xp,
  });

  if (error) safeErrorLog("recordGameScore", error);
}

export async function updateUserGameStats(
  phone: string,
  scoreDelta: number,
  xpDelta: number,
  isWin: boolean,
  maxStreak: number,
  displayName?: string
): Promise<void> {
  const sb = getSupabaseClient();

  const { data: existing, error: fetchError } = await sb
    .from("user_game_stats")
    .select("*")
    .eq("phone_number", phone)
    .maybeSingle();

  if (fetchError) {
    safeErrorLog("updateUserGameStats.fetch", fetchError);
    return;
  }

  if (existing) {
    const newXp = (existing.total_xp || 0) + xpDelta;
    const newLevel = Math.max(1, Math.floor(newXp / 500) + 1);

    const { error } = await sb
      .from("user_game_stats")
      .update({
        total_games: (existing.total_games || 0) + 1,
        total_wins: (existing.total_wins || 0) + (isWin ? 1 : 0),
        total_score: (existing.total_score || 0) + scoreDelta,
        total_xp: newXp,
        current_level: newLevel,
        best_streak: Math.max(existing.best_streak || 0, maxStreak),
        last_played_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("phone_number", phone);

    if (error) safeErrorLog("updateUserGameStats.update", error);
  } else {
    const { error } = await sb.from("user_game_stats").insert({
      phone_number: phone,
      display_name: displayName || null,
      total_games: 1,
      total_wins: isWin ? 1 : 0,
      total_score: scoreDelta,
      total_xp: xpDelta,
      current_level: Math.max(1, Math.floor(xpDelta / 500) + 1),
      best_streak: maxStreak,
      last_played_at: new Date().toISOString(),
    });

    if (error) safeErrorLog("updateUserGameStats.insert", error);
  }
}

export async function getUserGameStats(phone: string): Promise<any> {
  const sb = getSupabaseClient();

  const { data, error } = await sb
    .from("user_game_stats")
    .select("*")
    .eq("phone_number", phone)
    .maybeSingle();

  if (error) safeErrorLog("getUserGameStats", error);

  return data;
}

export async function awardAchievement(
  phone: string,
  code: string,
  name: string,
  icon: string = "🏆"
): Promise<boolean> {
  const sb = getSupabaseClient();

  const { error } = await sb
    .from("game_achievements")
    .insert({
      phone_number: phone,
      achievement_code: code,
      name,
      icon,
    });

  if (error) safeErrorLog("awardAchievement", error);

  return !error;
}

// ==========================================
// 14. DEMO CENTRE
// ==========================================

export interface DemoSession {
  id: string;
  tenant_id?: string;
  phone_number: string;
  contact_id?: string | null;
  demo_id: string;
  demo_category?: string | null;
  current_step: string;
  session_data: Record<string, any>;
  status: "ACTIVE" | "COMPLETED" | "ABANDONED" | "EXPIRED";
  started_at: string;
  expires_at: string;
  completed_at?: string | null;
}

export async function getActiveDemoSession(
  phone: string,
  tenantId?: string
): Promise<DemoSession | null> {
  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);

  const { data, error } = await sb
    .from("demo_sessions")
    .select("*")
    .eq("tenant_id", tenant)
    .eq("phone_number", phone)
    .eq("status", "ACTIVE")
    .gt("expires_at", new Date().toISOString())
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    safeErrorLog("getActiveDemoSession", error);
    return null;
  }

  return data as DemoSession | null;
}

export async function createDemoSession(
  phone: string,
  demoId: string,
  category?: string,
  initialData: Record<string, any> = {},
  tenantId?: string
): Promise<DemoSession | null> {
  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);

  const { error: abandonError } = await sb
    .from("demo_sessions")
    .update({
      status: "ABANDONED",
      completed_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenant)
    .eq("phone_number", phone)
    .eq("status", "ACTIVE");

  if (abandonError) {
    safeErrorLog("createDemoSession.abandon", abandonError);
  }

  const { data, error } = await sb
    .from("demo_sessions")
    .insert({
      tenant_id: tenant,
      phone_number: phone,
      demo_id: demoId,
      demo_category: category || null,
      current_step: "ENTRY",
      session_data: initialData,
      status: "ACTIVE",
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    safeErrorLog("createDemoSession", error);
    return null;
  }

  return data as DemoSession;
}

export async function updateDemoSession(
  sessionId: string,
  fields: Partial<DemoSession>,
  tenantId?: string
): Promise<DemoSession | null> {
  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);

  const payload: Record<string, unknown> = { ...fields };

  delete payload.id;
  delete payload.tenant_id;
  delete payload.phone_number;

  const { data, error } = await sb
    .from("demo_sessions")
    .update(payload)
    .eq("tenant_id", tenant)
    .eq("id", sessionId)
    .select("*")
    .maybeSingle();

  if (error) {
    safeErrorLog("updateDemoSession", error);
    return null;
  }

  return data as DemoSession | null;
}

export async function completeDemoSession(
  sessionId: string,
  tenantId?: string
): Promise<void> {
  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);

  const { error } = await sb
    .from("demo_sessions")
    .update({
      status: "COMPLETED",
      completed_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenant)
    .eq("id", sessionId);

  if (error) safeErrorLog("completeDemoSession", error);
}

export async function createDemoLead(
  phone: string,
  contactName: string,
  businessName: string,
  industry: string,
  demoId: string,
  demoName: string,
  requirements: string,
  tenantId?: string
): Promise<any> {
  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);

  const { data, error } = await sb
    .from("demo_leads")
    .insert({
      tenant_id: tenant,
      phone_number: phone,
      contact_name: contactName,
      business_name: businessName,
      industry,
      demo_id: demoId,
      demo_name: demoName,
      requirements,
      status: "NEW",
      source: "DEMO_CENTRE",
    })
    .select("*")
    .single();

  if (error) {
    safeErrorLog("createDemoLead", error);
    return null;
  }

  const { error: leadError } = await sb.from("leads").insert({
    tenant_id: tenant,
    contact_id: null,
    service_type: "DEMO_CONVERSION",
    business_name: businessName,
    industry,
    status: "QUALIFYING",
    requirements_json: {
      source: "DEMO_CENTRE",
      demo_id: demoId,
      demo_name: demoName,
      requirements,
      contact_name: contactName,
      phone,
    },
  });

  if (leadError) {
    safeErrorLog("createDemoLead.createLead", leadError);
  }

  return data;
}

// ==========================================
// 15. DASHBOARD ACTIVITY & PHONE LOGGING
// ==========================================

export async function logBotActivity(
  phone: string,
  direction: "INBOUND" | "OUTBOUND",
  messageType: string,
  module: string,
  body: string,
  contactName?: string,
  interactiveId?: string,
  whatsappMessageId?: string,
  tenantId?: string
): Promise<void> {
  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);

  try {
    const { error: activityError } = await sb
      .from("bot_activity_log")
      .insert({
        tenant_id: tenant,
        phone_number: phone,
        contact_name: contactName || null,
        direction,
        message_type: messageType,
        module,
        message_body: body ? body.substring(0, 500) : null,
        interactive_id: interactiveId || null,
        whatsapp_message_id: whatsappMessageId || null,
      });

    if (activityError) {
      safeErrorLog("logBotActivity.activity", activityError);
    }

    const { data: existing, error: fetchError } = await sb
      .from("phone_log")
      .select("id, total_messages, modules_used")
      .eq("tenant_id", tenant)
      .eq("phone_number", phone)
      .maybeSingle();

    if (fetchError) {
      safeErrorLog("logBotActivity.phoneLog.fetch", fetchError);
      return;
    }

    if (existing) {
      const modules = Array.isArray(existing.modules_used)
        ? [...existing.modules_used]
        : [];

      if (module && !modules.includes(module)) modules.push(module);

      const { error } = await sb
        .from("phone_log")
        .update({
          last_seen: new Date().toISOString(),
          total_messages: (existing.total_messages || 0) + 1,
          modules_used: modules,
        })
        .eq("tenant_id", tenant)
        .eq("id", existing.id);

      if (error) safeErrorLog("logBotActivity.phoneLog.update", error);
    } else {
      const { error } = await sb.from("phone_log").insert({
        tenant_id: tenant,
        phone_number: phone,
        contact_name: contactName || null,
        total_messages: 1,
        modules_used: module ? [module] : [],
      });

      if (error) safeErrorLog("logBotActivity.phoneLog.insert", error);
    }
  } catch (err) {
    safeErrorLog("logBotActivity", err);
  }
}

// ==========================================
// 16. WEBSITE & DOMAIN TOOL LOGGING
// These tables currently have no tenant_id.
// ==========================================

export async function logDomainSearch(
  phone: string,
  domain: string,
  tld: string,
  status: string,
  available: boolean | null,
  price?: number | null,
  currency?: string | null
): Promise<void> {
  const sb = getSupabaseClient();

  try {
    const { error } = await sb.from("domain_searches").insert({
      phone,
      domain,
      tld,
      status,
      available,
      registrar_price: price || null,
      currency: currency || null,
    });

    if (error) safeErrorLog("logDomainSearch", error);
  } catch (e) {
    safeErrorLog("logDomainSearch", e);
  }
}

export async function logWebsiteCheck(
  phone: string,
  url: string,
  reachable: boolean,
  statusCode: number | null,
  https: boolean,
  responseTimeMs: number | null,
  finalUrl: string,
  sslValid?: boolean | null,
  sslExpiry?: string | null
): Promise<void> {
  const sb = getSupabaseClient();

  try {
    const { error } = await sb.from("website_checks").insert({
      phone,
      url,
      reachable,
      status_code: statusCode,
      https,
      response_time_ms: responseTimeMs,
      final_url: finalUrl,
      ssl_valid: sslValid ?? null,
      ssl_expiry: sslExpiry ?? null,
    });

    if (error) safeErrorLog("logWebsiteCheck", error);
  } catch (e) {
    safeErrorLog("logWebsiteCheck", e);
  }
}

export async function logDnsCheck(
  phone: string,
  domain: string,
  recordType: string,
  records: any[]
): Promise<void> {
  const sb = getSupabaseClient();

  try {
    const { error } = await sb.from("dns_checks").insert({
      phone,
      domain,
      record_type: recordType,
      records,
    });

    if (error) safeErrorLog("logDnsCheck", error);
  } catch (e) {
    safeErrorLog("logDnsCheck", e);
  }
}

export const logWebsiteDomainCheck = logDnsCheck;

// ==========================================
// 17. FLIGHT CHECKER LOGGING
// This table currently has no tenant_id.
// ==========================================

export async function logFlightSearch(
  phone: string,
  searchType: string,
  flightNumber?: string | null,
  airportCode?: string | null,
  resultStatus?: string
): Promise<void> {
  const sb = getSupabaseClient();

  try {
    const { error } = await sb.from("flight_searches").insert({
      phone,
      search_type: searchType,
      flight_number: flightNumber || null,
      airport_code: airportCode || null,
      result_status: resultStatus || "unknown",
    });

    if (error) safeErrorLog("logFlightSearch", error);
  } catch (err) {
    safeErrorLog("logFlightSearch", err);
  }
}

// ==========================================
// 18. MAGAZINE STUDIO
// These tables currently have no tenant_id.
// ==========================================

export async function createMagazineDraft(
  phone: string,
  data: Record<string, any>
): Promise<any> {
  const sb = getSupabaseClient();

  const { data: row, error } = await sb
    .from("magazines")
    .insert({
      phone,
      ...data,
      status: data.status || "draft",
    })
    .select("*")
    .single();

  if (error) {
    safeErrorLog("createMagazineDraft", error);
    return null;
  }

  return row;
}

export async function updateMagazine(
  magId: string,
  phone: string,
  data: Record<string, any>
): Promise<any> {
  const sb = getSupabaseClient();

  const { data: row, error } = await sb
    .from("magazines")
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", magId)
    .eq("phone", phone)
    .select("*")
    .maybeSingle();

  if (error) {
    safeErrorLog("updateMagazine", error);
    return null;
  }

  return row;
}

export async function getMagazine(
  magId: string,
  phone: string
): Promise<any> {
  const sb = getSupabaseClient();

  const { data, error } = await sb
    .from("magazines")
    .select("*")
    .eq("id", magId)
    .eq("phone", phone)
    .maybeSingle();

  if (error) safeErrorLog("getMagazine", error);

  return data;
}

export async function getUserMagazines(
  phone: string,
  limit = 20
): Promise<any[]> {
  const sb = getSupabaseClient();

  const { data, error } = await sb
    .from("magazines")
    .select("*")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) safeErrorLog("getUserMagazines", error);

  return data || [];
}

export async function saveMagazinePage(
  magId: string,
  page: Record<string, any>
): Promise<any> {
  const sb = getSupabaseClient();

  const { data, error } = await sb
    .from("magazine_pages")
    .insert({
      magazine_id: magId,
      ...page,
    })
    .select("*")
    .single();

  if (error) {
    safeErrorLog("saveMagazinePage", error);
    return null;
  }

  return data;
}

export async function getMagazinePages(magId: string): Promise<any[]> {
  const sb = getSupabaseClient();

  const { data, error } = await sb
    .from("magazine_pages")
    .select("*")
    .eq("magazine_id", magId)
    .order("page_number", { ascending: true });

  if (error) safeErrorLog("getMagazinePages", error);

  return data || [];
}

export async function updateMagazinePage(
  pageId: string,
  data: Record<string, any>
): Promise<any> {
  const sb = getSupabaseClient();

  const { data: row, error } = await sb
    .from("magazine_pages")
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pageId)
    .select("*")
    .maybeSingle();

  if (error) safeErrorLog("updateMagazinePage", error);

  return row;
}

export async function saveMagazineAsset(
  magId: string,
  pageId: string | null,
  asset: Record<string, any>
): Promise<any> {
  const sb = getSupabaseClient();

  const { data, error } = await sb
    .from("magazine_assets")
    .insert({
      magazine_id: magId,
      page_id: pageId,
      ...asset,
    })
    .select("*")
    .single();

  if (error) safeErrorLog("saveMagazineAsset", error);

  return data;
}

export async function deleteMagazine(
  magId: string,
  phone: string
): Promise<boolean> {
  const sb = getSupabaseClient();

  const { error } = await sb
    .from("magazines")
    .delete()
    .eq("id", magId)
    .eq("phone", phone);

  if (error) safeErrorLog("deleteMagazine", error);

  return !error;
}

export async function uploadMagazinePdf(
  magId: string,
  pdfBytes: Uint8Array
): Promise<string | null> {
  const sb = getSupabaseClient();
  const path = `${magId}/magazine_${Date.now()}.pdf`;

  try {
    const { error } = await sb.storage
      .from("magazines")
      .upload(path, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (error) {
      safeErrorLog("uploadMagazinePdf", error);
      return null;
    }

    const { data } = sb.storage.from("magazines").getPublicUrl(path);

    return data.publicUrl;
  } catch (e) {
    safeErrorLog("uploadMagazinePdf.catch", e);
    return null;
  }
}

// ==========================================
// 19. BUSINESS DEMO ENGINE
// ==========================================

export interface BusinessDemoConfig {
  id: string;
  business_slug: string;
  business_name: string;
  business_category: string;
  business_website?: string;
  business_phone?: string;
  demo_template: string;
  demo_config: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function getBusinessDemoConfig(
  configId: string
): Promise<BusinessDemoConfig | null> {
  const sb = getSupabaseClient();

  const { data, error } = await sb
    .from("business_demo_configs")
    .select("*")
    .eq("id", configId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    safeErrorLog("getBusinessDemoConfig", error);
    return null;
  }

  return data as BusinessDemoConfig | null;
}

export async function logSalesEvent(
  phone: string,
  eventType: string,
  leadId?: string | null,
  eventData?: Record<string, any>,
  tenantId?: string
): Promise<void> {
  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);

  try {
    let validLeadId: string | null = null;

    if (leadId) {
      const candidate = toValidUUID(leadId);

      if (candidate) {
        const { data } = await sb
          .from("leads")
          .select("id")
          .eq("tenant_id", tenant)
          .eq("id", candidate)
          .maybeSingle();

        validLeadId = data?.id || null;
      }
    }

    const { error } = await sb.from("sales_events").insert({
      tenant_id: tenant,
      phone_number: phone,
      lead_id: validLeadId,
      event_type: eventType,
      event_data: eventData || {},
    });

    if (error) safeErrorLog("logSalesEvent", error);
  } catch (err) {
    safeErrorLog("logSalesEvent", err);
  }
}

export async function getDemoLeadsForAdmin(
  limit: number = 50,
  status?: string,
  tenantId?: string
): Promise<any[]> {
  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);

  let query = sb
    .from("demo_leads")
    .select("*")
    .eq("tenant_id", tenant)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));

  if (status) query = query.eq("status", status);

  const { data, error } = await query;

  if (error) {
    safeErrorLog("getDemoLeadsForAdmin", error);
    return [];
  }

  return data || [];
}

export async function updateDemoLeadStatus(
  leadId: string,
  status: string,
  tenantId?: string
): Promise<boolean> {
  const sb = getSupabaseClient();
  const tenant = resolveTenantId(tenantId);

  const { error } = await sb
    .from("demo_leads")
    .update({
      status,
      lead_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenant)
    .eq("id", leadId);

  if (error) {
    safeErrorLog("updateDemoLeadStatus", error);
    return false;
  }

  return true;
}
