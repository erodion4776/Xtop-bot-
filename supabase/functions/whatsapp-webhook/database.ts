// supabase/functions/whatsapp-webhook/database.ts

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ==========================================
// 1. Supabase Client & Helper Functions
// ==========================================
let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseInstance) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_ANON_KEY") ??
      "";
    supabaseInstance = createClient(supabaseUrl, supabaseKey);
  }
  return supabaseInstance;
}

export function safeErrorLog(context: string, error: unknown): void {
  console.error(`[DB Error - ${context}]:`, error);
}

// ==========================================
// 2. Types & Interfaces
// ==========================================
export interface Contact {
  id?: string;
  phone: string;
  name?: string | null;
  [key: string]: unknown;
}

export interface Conversation {
  id: string;
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
// 3. Conversation Functions
// ==========================================
export async function updateConversation(
  conversationId: string,
  fields: ConversationUpdate
): Promise<Conversation | null> {
  const sb = getSupabaseClient();
  const updatePayload: Record<string, unknown> = {
    ...fields,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from("conversations")
    .update(updatePayload)
    .eq("id", conversationId)
    .select("*")
    .single();

  if (error) {
    safeErrorLog("updateConversation", error);
    return null;
  }
  return data as Conversation;
}

// ==========================================
// 4. Products Functions
// ==========================================
export async function getActiveProducts(): Promise<Product[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    safeErrorLog("getActiveProducts", error);
    return [];
  }
  return (data as Product[]) || [];
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("products")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error) {
    safeErrorLog(`getProductBySlug(${slug})`, error);
    return null;
  }
  return data as Product;
}

export async function getProductById(productId: string): Promise<Product | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("products")
    .select("*")
    .eq("id", productId)
    .single();

  if (error) {
    safeErrorLog("getProductById", error);
    return null;
  }
  return data as Product;
}

// ==========================================
// 5. Services Functions
// ==========================================
export async function getActiveServices(): Promise<Service[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("services")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    safeErrorLog("getActiveServices", error);
    return [];
  }
  return (data as Service[]) || [];
}

export async function getServiceBySlug(slug: string): Promise<Service | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("services")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error) {
    safeErrorLog(`getServiceBySlug(${slug})`, error);
    return null;
  }
  return data as Service;
}

export async function getServiceById(serviceId: string): Promise<Service | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("services")
    .select("*")
    .eq("id", serviceId)
    .single();

  if (error) {
    safeErrorLog("getServiceById", error);
    return null;
  }
  return data as Service;
}

// ==========================================
// 6. Student Functions
// ==========================================
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
  const firstName = names[0] || "";
  const lastName = names.slice(1).join(" ") || "";

  const { data, error } = await sb
    .from("students")
    .insert({
      phone,
      name: name.trim(),
      first_name: firstName,
      last_name: lastName,
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
    updatePayload.last_name = names.slice(1).join(" ") || "";
  }
  if (fields.matric_number) updatePayload.matric_number = fields.matric_number.trim().toUpperCase();
  if (fields.department) updatePayload.department = fields.department.trim();
  if (fields.level) updatePayload.level = fields.level.trim();
  if (fields.serial_number) updatePayload.serial_number = fields.serial_number.trim();

  const { data, error } = await sb
    .from("students")
    .update(updatePayload)
    .eq("id", studentId)
    .select("*")
    .single();

  if (error) {
    safeErrorLog("updateStudentProfile", error);
    return null;
  }
  return data as Student;
}
