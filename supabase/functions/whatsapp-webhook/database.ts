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
  contact_id?: string | null;
  request_type: string;
  message: string;
  priority?: string;
  status?: string;
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
// 3. Conversation & Contact Functions
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

export async function getContactByPhone(phone: string): Promise<Contact | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("contacts")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  if (error) {
    safeErrorLog("getContactByPhone", error);
    return null;
  }
  return data as Contact;
}

export async function getOrCreateContact(phone: string, name?: string | null): Promise<Contact> {
  const sb = getSupabaseClient();
  const existing = await getContactByPhone(phone);
  if (existing) return existing;

  const { data, error } = await sb
    .from("contacts")
    .insert({ phone, name: name || null })
    .select("*")
    .single();

  if (error) {
    safeErrorLog("getOrCreateContact", error);
    return { phone, name: name || null };
  }
  return data as Contact;
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
// 6. Magazine Functions
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
  return data as MagazineConfig;
}

// ==========================================
// 7. Agent & Support Requests
// ==========================================
export async function createAgentRequest(
  contactId?: string,
  requestType: string = "GENERAL_ENQUIRY",
  message: string = "",
  priority: string = "NORMAL"
): Promise<AgentRequest | null> {
  const sb = getSupabaseClient();
  const payload: Record<string, unknown> = {
    request_type: requestType,
    message,
    priority,
    status: "PENDING",
  };

  if (contactId) {
    payload.contact_id = contactId;
  }

  const { data, error } = await sb
    .from("agent_requests")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    safeErrorLog("createAgentRequest", error);
    // Return fallback ticket so the user receives a confirmation
    return {
      id: crypto.randomUUID ? crypto.randomUUID() : `REQ-${Date.now()}`,
      contact_id: contactId || null,
      request_type: requestType,
      message,
      priority,
      status: "PENDING",
      created_at: new Date().toISOString(),
      updated_at: null,
    };
  }
  return data as AgentRequest;
}

// ==========================================
// 8. Student & Attendance Functions
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
  return data as Student;
}

export async function getOrCreateStudent(phone: string, fallbackName?: string | null): Promise<Student> {
  const sb = getSupabaseClient();
  const existing = await getStudentByPhone(phone);
  if (existing) return existing;

  const defaultName = fallbackName?.trim() || "Student";
  const names = defaultName.split(" ");
  const firstName = names[0] || "";
  const lastName = names.slice(1).join(" ") || "";

  const { data, error } = await sb
    .from("students")
    .insert({
      phone,
      name: defaultName,
      first_name: firstName,
      last_name: lastName,
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

export async function getTodayAttendance(studentId: string): Promise<any> {
  const sb = getSupabaseClient();
  const todayStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

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
    .insert({
      student_id: studentId,
    })
    .select("*")
    .single();

  if (error) {
    safeErrorLog("recordAttendance", error);
    return null;
  }
  return data;
}

// ==========================================
// 9. Course & Exam Functions
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
    safeErrorLog("getStudentCourseAccess (fetch)", error);
    return null;
  }

  // Auto-enroll if missing
  if (!data) {
    const { data: inserted, error: insertError } = await sb
      .from("student_courses")
      .insert({
        student_id: studentId,
        course_id: courseId,
        access_status: "ACTIVE",
        progress: {
          completed_lessons: [],
          last_lesson_order: 0,
        },
      })
      .select("*")
      .single();

    if (insertError) {
      safeErrorLog("getStudentCourseAccess (insert)", insertError);
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
    .single();

  if (fetchErr || !record) {
    safeErrorLog("markLessonComplete (fetch)", fetchErr);
    return null;
  }

  const progress = record.progress || { completed_lessons: [], last_lesson_order: 0 };
  const completed = Array.isArray(progress.completed_lessons) ? progress.completed_lessons : [];

  if (!completed.includes(lessonId)) {
    completed.push(lessonId);
  }

  const updatedProgress = {
    completed_lessons: completed,
    last_lesson_order: Math.max(progress.last_lesson_order || 0, lastLessonOrder),
  };

  const { data, error } = await sb
    .from("student_courses")
    .update({
      progress: updatedProgress,
      updated_at: new Date().toISOString(),
    })
    .eq("id", studentCourseId)
    .select("*")
    .single();

  if (error) {
    safeErrorLog("markLessonComplete (update)", error);
    return null;
  }
  return data;
}

export async function getStudentExamAttempts(studentId: string, courseId: string): Promise<any[]> {
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
