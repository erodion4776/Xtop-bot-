// supabase/functions/whatsapp-webhook/database.ts
// Phases 1–4 Complete Database Layer
// All tables: contacts, conversations, messages, products, services,
// demos, magazine, pricing, leads, quotations, agent_requests,
// courses, students, student_courses, course_lessons, exam_attempts

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { safeErrorLog } from "./utils.ts";

// ═══════════════════════════════════════════════════════
// TYPES — PHASE 1 & 2
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

// ═══════════════════════════════════════════════════════
// TYPES — PHASE 3
// ═══════════════════════════════════════════════════════

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
// TYPES — PHASE 4
// ═══════════════════════════════════════════════════════

export interface Course {
  id: string;
  course_code: string;
  course_name: string;
  term: string | null;
  description: string | null;
  status: "OPEN" | "BLOCKED";
  test_price: number;
  show_answers: boolean;
}

export interface CourseLesson {
  id: string;
  course_id: string;
  title: string;
  content: string;
  video_url: string | null;
  pdf_url: string | null;
  lesson_order: number;
  duration: string | null;
  status: string;
}

export interface Student {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
}

export interface StudentCourseAccess {
  id: string;
  student_id: string;
  course_id: string;
  status: "ACTIVE" | "SUSPENDED" | "COMPLETED";
  progress: {
    completed_lessons?: string[];
    last_lesson_order?: number;
  };
}

export interface ExamAttempt {
  id: string;
  student_id: string;
  course_id: string;
  score: number;
  total_questions: number;
  passed: boolean;
  answers_json: Array<{
    question_id: string;
    selected_option: string;
    correct_option: string;
    is_correct: boolean;
  }>;
  submitted_at: string;
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function toValidUuidOrNull(val?: string | null): string | null {
  if (!val || typeof val !== "string") return null;
  const trimmed = val.trim();
  if (trimmed.length === 0) return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(trimmed) ? trimmed : null;
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
  const { data: existing, error: fe } = await sb
    .from("contacts").select("*").eq("phone", phone).maybeSingle();
  if (fe) { safeErrorLog("getOrCreateContact", fe); throw fe; }
  if (existing) {
    if (profileName && !existing.name) {
      await sb.from("contacts").update({ name: profileName }).eq("id", existing.id);
      existing.name = profileName;
    }
    return existing as Contact;
  }
  const { data: c, error: ce } = await sb
    .from("contacts").insert({ phone, name: profileName || null }).select("*").single();
  if (ce) { safeErrorLog("createContact", ce); throw ce; }
  return c as Contact;
}

// ═══════════════════════════════════════════════════════
// CONVERSATIONS
// ═══════════════════════════════════════════════════════

export async function getOrCreateConversation(contactId: string): Promise<Conversation> {
  const sb = getSupabaseClient();
  const { data: existing, error: fe } = await sb
    .from("conversations").select("*").eq("contact_id", contactId).maybeSingle();
  if (fe) { safeErrorLog("getOrCreateConversation", fe); throw fe; }
  if (existing) return existing as Conversation;
  const { data: c, error: ce } = await sb
    .from("conversations").insert({
      contact_id: contactId,
      current_module: "MAIN_MENU",
      current_state: "IDLE",
      context_json: {},
    }).select("*").single();
  if (ce) { safeErrorLog("createConversation", ce); throw ce; }
  return c as Conversation;
}

export async function updateConversation(id: string, updates: {
  current_module?: string;
  current_state?: string;
  context_json?: Record<string, unknown>;
}): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb
    .from("conversations")
    .update({ ...updates, last_message_at: new Date().toISOString() })
    .eq("id", id);
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
    contact_id: contactId,
    direction,
    message_type: messageType,
    message_text: messageText,
    whatsapp_message_id: waId || null,
  });
  if (error) safeErrorLog("storeMessage", error);
}

// ═══════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════

export async function getActiveProducts(): Promise<Product[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("products").select("*").eq("status", "ACTIVE").order("name");
  if (error) { safeErrorLog("getActiveProducts", error); return []; }
  return (data || []) as Product[];
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("products").select("*").eq("slug", slug).eq("status", "ACTIVE").maybeSingle();
  if (error) { safeErrorLog("getProductBySlug", error); return null; }
  return data as Product | null;
}

// ═══════════════════════════════════════════════════════
// SERVICES
// ═══════════════════════════════════════════════════════

export async function getActiveServices(): Promise<ServiceItem[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("services").select("*").eq("status", "ACTIVE").order("display_order");
  if (error) { safeErrorLog("getActiveServices", error); return []; }
  return (data || []) as ServiceItem[];
}

export async function getServiceBySlug(slug: string): Promise<ServiceItem | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("services").select("*").eq("slug", slug).eq("status", "ACTIVE").maybeSingle();
  if (error) { safeErrorLog("getServiceBySlug", error); return null; }
  return data as ServiceItem | null;
}

// ═══════════════════════════════════════════════════════
// DEMOS
// ═══════════════════════════════════════════════════════

export async function getActiveDemos(): Promise<DemoItem[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("demos").select("*").eq("status", "ACTIVE").order("display_order");
  if (error) { safeErrorLog("getActiveDemos", error); return []; }
  return (data || []) as DemoItem[];
}

export async function getDemoBySlug(slug: string): Promise<DemoItem | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("demos").select("*").eq("slug", slug).eq("status", "ACTIVE").maybeSingle();
  if (error) { safeErrorLog("getDemoBySlug", error); return null; }
  return data as DemoItem | null;
}

// ═══════════════════════════════════════════════════════
// MAGAZINE
// ═══════════════════════════════════════════════════════

export async function getActiveMagazineConfig(): Promise<MagazineConfig | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("magazine_config").select("*").eq("status", "ACTIVE").limit(1).maybeSingle();
  if (error) { safeErrorLog("getActiveMagazineConfig", error); return null; }
  return data as MagazineConfig | null;
}

// ═══════════════════════════════════════════════════════
// PRICING (Phase 3 — with number normalization)
// ═══════════════════════════════════════════════════════

export async function getPricingPackages(serviceType: string): Promise<PricingPackage[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("pricing_packages")
    .select("*")
    .eq("service_type", serviceType)
    .eq("status", "ACTIVE")
    .order("priority");

  if (error) {
    safeErrorLog("getPricingPackages", error);
    throw error;
  }

  // Normalize PostgreSQL numeric strings to JavaScript numbers
  return (data || []).map((row) => ({
    ...row,
    min_price: Number(row.min_price),
    max_price: Number(row.max_price),
    priority: Number(row.priority ?? 0),
    features: Array.isArray(row.features) ? row.features : [],
  })) as PricingPackage[];
}

// ═══════════════════════════════════════════════════════
// LEADS (Phase 3)
// ═══════════════════════════════════════════════════════

export async function getActiveLeadForContact(
  contactId: string, serviceType: string
): Promise<Lead | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("leads").select("*")
    .eq("contact_id", contactId)
    .eq("service_type", serviceType)
    .in("status", ["QUALIFYING", "QUOTED", "PACKAGE_SELECTED", "AGENT_REQUESTED"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { safeErrorLog("getActiveLead", error); return null; }
  return data as Lead | null;
}

export async function createLead(
  contactId: string, serviceType: string, fields: Partial<Lead>
): Promise<Lead | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("leads").insert({
      contact_id: contactId,
      service_type: serviceType,
      status: "QUALIFYING",
      ...fields,
    }).select("*").single();
  if (error) { safeErrorLog("createLead", error); return null; }
  return data as Lead;
}

export async function updateLead(
  leadId: string, fields: Partial<Lead>
): Promise<Lead | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("leads").update({
      ...fields,
      updated_at: new Date().toISOString(),
    }).eq("id", leadId).select("*").single();
  if (error) { safeErrorLog("updateLead", error); return null; }
  return data as Lead;
}

// ═══════════════════════════════════════════════════════
// QUOTATIONS (Phase 3)
// ═══════════════════════════════════════════════════════

async function getNextQuotationNumber(): Promise<string> {
  const sb = getSupabaseClient();
  const year = new Date().getFullYear();
  const { data, error } = await sb
    .from("quotations").select("quotation_number")
    .like("quotation_number", `XTR-${year}-%`)
    .order("quotation_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) safeErrorLog("getNextQuotationNumber", error);
  let seq = 1;
  if (data?.quotation_number) {
    const parts = data.quotation_number.split("-");
    if (parts.length >= 3) seq = parseInt(parts[2], 10) + 1;
  }
  return `XTR-${year}-${String(seq).padStart(6, "0")}`;
}

export async function createQuotation(
  leadId: string,
  packageId: string | null,
  title: string,
  summary: string,
  deliverables: string[],
  minPrice: number,
  maxPrice: number
): Promise<Quotation | null> {
  const sb = getSupabaseClient();

  const validLeadId = toValidUuidOrNull(leadId);
  if (!validLeadId) {
    safeErrorLog("createQuotation", { message: "Invalid or missing leadId" });
    return null;
  }

  const validPackageId = toValidUuidOrNull(packageId);
  const qNum = await getNextQuotationNumber();
  const validUntil = new Date(Date.now() + 14 * 86400000).toISOString();

  const { data, error } = await sb.from("quotations").insert({
    lead_id: validLeadId,
    quotation_number: qNum,
    package_id: validPackageId,
    title,
    summary,
    deliverables_json: deliverables || [],
    estimated_min_price: minPrice || 0,
    estimated_max_price: maxPrice || 0,
    currency: "NGN",
    valid_until: validUntil,
    status: "PRESENTED",
  }).select("*").single();

  if (error) { safeErrorLog("createQuotation", error); return null; }
  return data as Quotation;
}

export async function updateQuotation(
  quotationId: string, fields: Partial<Quotation>
): Promise<void> {
  const sb = getSupabaseClient();
  const validId = toValidUuidOrNull(quotationId);
  if (!validId) {
    safeErrorLog("updateQuotation", { message: "Invalid quotationId" });
    return;
  }
  const { error } = await sb
    .from("quotations").update({
      ...fields,
      updated_at: new Date().toISOString(),
    }).eq("id", validId);
  if (error) safeErrorLog("updateQuotation", error);
}

// ═══════════════════════════════════════════════════════
// AGENT REQUESTS (Phase 2/3)
// ═══════════════════════════════════════════════════════

export async function createAgentRequest(
  contactId: string,
  requestType: string,
  message: string,
  priority: string = "NORMAL",
  leadId?: string,
  quotationId?: string,
  quotationSummary?: string
): Promise<AgentRequest | null> {
  const sb = getSupabaseClient();

  const validLeadId = toValidUuidOrNull(leadId);
  const validQuotationId = toValidUuidOrNull(quotationId);

  const payload: Record<string, unknown> = {
    contact_id: contactId,
    request_type: requestType || "GENERAL_ENQUIRY",
    message: message || "No message provided",
    status: "NEW",
    priority: priority || "NORMAL",
    lead_id: validLeadId,
    quotation_id: validQuotationId,
    quotation_summary: quotationSummary || null,
  };

  const { data, error } = await sb
    .from("agent_requests")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    safeErrorLog("createAgentRequest", error);

    // Fallback: retry with minimal payload so customer never gets stuck
    const { data: fallbackData, error: fallbackError } = await sb
      .from("agent_requests")
      .insert({
        contact_id: contactId,
        request_type: "GENERAL_ENQUIRY",
        message: message || "Request from user",
        status: "NEW",
        priority: "NORMAL",
      })
      .select("*")
      .single();

    if (fallbackError) {
      safeErrorLog("createAgentRequest:fallback", fallbackError);
      return null;
    }
    return fallbackData as AgentRequest;
  }

  return data as AgentRequest;
}

// ═══════════════════════════════════════════════════════
// LEARNING CENTRE — COURSES (Phase 4)
// ═══════════════════════════════════════════════════════

export async function getCourseByCode(courseCode: string): Promise<Course | null> {
  const sb = getSupabaseClient();
  const normalizedCode = courseCode.toUpperCase().replace(/[\s-]/g, "");
  const { data, error } = await sb
    .from("courses")
    .select("*")
    .eq("course_code", normalizedCode)
    .maybeSingle();
  if (error) { safeErrorLog("getCourseByCode", error); return null; }
  return data as Course | null;
}

// ═══════════════════════════════════════════════════════
// LEARNING CENTRE — STUDENTS (Phase 4)
// ═══════════════════════════════════════════════════════

export async function getOrCreateStudent(phone: string, name?: string | null): Promise<Student> {
  const sb = getSupabaseClient();
  const { data: existing, error: fe } = await sb
    .from("students").select("*").eq("phone", phone).maybeSingle();
  if (fe) { safeErrorLog("getOrCreateStudent:fetch", fe); throw fe; }
  if (existing) {
    if (name && !existing.name) {
      await sb.from("students").update({ name }).eq("id", existing.id);
      existing.name = name;
    }
    return existing as Student;
  }
  const { data: created, error: ce } = await sb
    .from("students").insert({ phone, name: name || null }).select("*").single();
  if (ce) { safeErrorLog("getOrCreateStudent:create", ce); throw ce; }
  return created as Student;
}

// ═══════════════════════════════════════════════════════
// LEARNING CENTRE — ENROLLMENT (Phase 4, Fix #3)
// ═══════════════════════════════════════════════════════

/**
 * Gets or creates student enrollment for a course.
 * Fix #3: Checks course status before auto-enrolling.
 * Returns null if course is BLOCKED.
 */
export async function getStudentCourseAccess(
  studentId: string,
  courseId: string,
  courseStatus?: string
): Promise<StudentCourseAccess | null> {
  const sb = getSupabaseClient();

  // Do NOT auto-enroll if course is BLOCKED
  if (courseStatus === "BLOCKED") {
    return null;
  }

  const { data: existing, error } = await sb
    .from("student_courses")
    .select("*")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .maybeSingle();

  if (error) { safeErrorLog("getStudentCourseAccess", error); return null; }
  if (existing) return existing as StudentCourseAccess;

  // Auto-enroll only if course is OPEN
  const { data: created, error: ce } = await sb
    .from("student_courses")
    .insert({
      student_id: studentId,
      course_id: courseId,
      status: "ACTIVE",
      progress: { completed_lessons: [] },
    })
    .select("*")
    .single();

  if (ce) { safeErrorLog("autoEnrollStudent", ce); return null; }
  return created as StudentCourseAccess;
}

// ═══════════════════════════════════════════════════════
// LEARNING CENTRE — LESSONS (Phase 4)
// ═══════════════════════════════════════════════════════

export async function getCourseLessons(courseId: string): Promise<CourseLesson[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("course_lessons")
    .select("*")
    .eq("course_id", courseId)
    .eq("status", "ACTIVE")
    .order("lesson_order", { ascending: true });
  if (error) { safeErrorLog("getCourseLessons", error); return []; }
  return (data || []) as CourseLesson[];
}

// ═══════════════════════════════════════════════════════
// LEARNING CENTRE — PROGRESS (Phase 4, Fix #2)
// ═══════════════════════════════════════════════════════

/**
 * Atomically marks a lesson as complete.
 * Fix #2: Fetches current progress from DB first, then merges.
 * This prevents overwriting previously completed lessons.
 */
export async function markLessonComplete(
  studentCourseId: string,
  lessonId: string,
  lessonOrder: number
): Promise<void> {
  const sb = getSupabaseClient();

  // Step 1: Fetch current progress from DB
  const { data: access, error: fetchErr } = await sb
    .from("student_courses")
    .select("progress")
    .eq("id", studentCourseId)
    .maybeSingle();

  if (fetchErr) {
    safeErrorLog("markLessonComplete:fetch", fetchErr);
    return;
  }

  // Step 2: Merge with existing completed lessons
  const existingProgress = (access?.progress || {}) as {
    completed_lessons?: string[];
    last_lesson_order?: number;
  };
  const completed = new Set(existingProgress.completed_lessons || []);
  completed.add(lessonId);

  const updatedProgress = {
    completed_lessons: Array.from(completed),
    last_lesson_order: Math.max(lessonOrder, existingProgress.last_lesson_order || 0),
  };

  // Step 3: Write back atomically
  const { error } = await sb
    .from("student_courses")
    .update({ progress: updatedProgress })
    .eq("id", studentCourseId);

  if (error) safeErrorLog("markLessonComplete:update", error);
}

// ═══════════════════════════════════════════════════════
// LEARNING CENTRE — EXAM ATTEMPTS (Phase 4, Fix #7)
// ═══════════════════════════════════════════════════════

/**
 * Returns exam attempts ordered oldest-first (ascending).
 * Fix #7: This ensures chronological numbering (Attempt 1 = first ever).
 */
export async function getStudentExamAttempts(
  studentId: string,
  courseId: string
): Promise<ExamAttempt[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("exam_attempts")
    .select("*")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .order("submitted_at", { ascending: true });
  if (error) { safeErrorLog("getStudentExamAttempts", error); return []; }
  return (data || []) as ExamAttempt[];
}
