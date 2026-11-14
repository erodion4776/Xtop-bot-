// supabase/functions/whatsapp-webhook/modules/learning.ts
// Phase 4 — Engr. Ero Learning Centre (Dynamic Content Delivery & Practice Checks)

import {
  Contact, Conversation, updateConversation,
  getCourseByCode, getOrCreateStudent, getStudentByPhone, isStudentProfileComplete, getStudentCourseAccess,
  markLessonComplete, getStudentExamAttempts,
  getSupabaseClient,
} from "../database.ts";
import {
  sendButtonMessage as sendButtonMessageRaw,
  sendListMessage as sendListMessageRaw,
  sendTextMessage as sendTextMessageRaw,
  sendDocumentMessage as sendDocumentMessageRaw,
  sendImageMessage as sendImageMessageRaw,
  makeButton, makeListRow,
} from "../whatsapp.ts";
import { normalise, isExit } from "../utils.ts";
import { showMainMenu } from "./main-menu.ts";
import { startExamEntry } from "./exams.ts";
import { startAutomobileDiagnosis, handleAutomobileDiagnosis } from "./automobile-diagnostics.ts";
import { startVehicleDiagnosis } from "./vehicle-diagnosis.ts";
import { handleRegistration } from "./attendance.ts";

const supabase = getSupabaseClient();

const SABI_BRAND_FOOTER = "_Powered by Sabi by XTOP_";

function addSabiBrand(body?: string): string {
  const clean = String(body || "").trim();
  return /powered by sabi/i.test(clean)
    ? clean
    : `${clean}${clean ? "\\n\\n" : ""}${SABI_BRAND_FOOTER}`;
}

// Brand only Engr. Ero Learning Centre responses. Other system routes,
// including XTOP Retail and the Sabi welcome menu, keep their own identity.
async function sendTextMessage(to: string, body: string) {
  return sendTextMessageRaw(to, addSabiBrand(body));
}

async function sendImageMessage(to: string, imageUrl: string, caption?: string) {
  return sendImageMessageRaw(to, imageUrl, addSabiBrand(caption));
}

async function sendDocumentMessage(to: string, documentUrl: string, filename: string, caption?: string) {
  return sendDocumentMessageRaw(to, documentUrl, filename, addSabiBrand(caption));
}

async function sendButtonMessage(
  to: string, body: string, buttons: Parameters<typeof sendButtonMessageRaw>[2],
  header?: string, footer?: string,
) {
  const brandedFooter = footer
    ? `${footer} • Powered by Sabi by XTOP`
    : "Powered by Sabi by XTOP";
  return sendButtonMessageRaw(to, body, buttons, header, brandedFooter);
}

async function sendListMessage(
  to: string, body: string, buttonText: string,
  sections: Parameters<typeof sendListMessageRaw>[3],
  header?: string, footer?: string,
) {
  const brandedFooter = footer
    ? `${footer} • Powered by Sabi by XTOP`
    : "Powered by Sabi by XTOP";
  return sendListMessageRaw(to, body, buttonText, sections, header, brandedFooter);
}


// ═══════════════════════════════════════════════════════
// HELPER: EXTRACT NUMERIC SELECTION (e.g., "1", "1️⃣", "Option 1")
// ═══════════════════════════════════════════════════════

function extractSelection(text: string): number | null {
  if (!text) return null;
  const cleaned = text
    .replace(/1️⃣|1\uFE0F\u20E3/g, "1")
    .replace(/2️⃣|2\uFE0F\u20E3/g, "2")
    .replace(/3️⃣|3\uFE0F\u20E3/g, "3")
    .replace(/4️⃣|4\uFE0F\u20E3/g, "4")
    .replace(/5️⃣|5\uFE0F\u20E3/g, "5")
    .replace(/6️⃣|6\uFE0F\u20E3/g, "6")
    .replace(/7️⃣|7\uFE0F\u20E3/g, "7")
    .replace(/8️⃣|8\uFE0F\u20E3/g, "8")
    .replace(/9️⃣|9\uFE0F\u20E3/g, "9")
    .replace(/🔟/g, "10");

  const match = cleaned.match(/\b([1-9]|10)\b/);
  if (match) {
    const val = parseInt(match[1], 10);
    return isNaN(val) ? null : val;
  }
  return null;
}

// ═══════════════════════════════════════════════════════
// CONTEXT INTERFACE
// ═══════════════════════════════════════════════════════

export interface LearningCtx {
  step: string;
  learningUnlocked?: boolean;
  courseCode?: string;
  courseId?: string;
  courseName?: string;
  term?: string;
  studentId?: string;
  studentCourseId?: string;
  currentModuleId?: string;
  currentModuleOrder?: number;
  currentLessonId?: string;
  currentLessonOrder?: number;
  currentSectionIndex?: number;
  currentPracticeIndex?: number;
  practiceScore?: number;
  totalLessons?: number;
  labMode?: string;
  labStage?: string;
  labObservations?: number[];
  labAverage?: number;
  labRating?: number;
}

function getCtx(conv: Conversation): LearningCtx {
  return (conv.context_json || {}) as LearningCtx;
}

async function saveCtx(convId: string, ctx: LearningCtx, state?: string): Promise<void> {
  await updateConversation(convId, {
    current_module: "LEARNING",
    ...(state ? { current_state: state } : {}),
    context_json: { ...ctx, learningUnlocked: true } as unknown as Record<string, unknown>,
  });
}

// ═══════════════════════════════════════════════════════
// DYNAMIC SUPABASE FETCHERS (ORDERED SEQUENTIAL PLAYLIST)
// ═══════════════════════════════════════════════════════

async function fetchPublishedModules(courseId: string) {
  const { data } = await supabase
    .from("course_modules")
    .select("*")
    .eq("course_id", courseId)
    .eq("status", "ACTIVE")
    .order("module_order", { ascending: true });
  return data || [];
}

/**
 * Builds an ordered playlist of all published lessons across all active modules.
 */
async function fetchAllCourseLessons(courseId: string) {
  const modules = await fetchPublishedModules(courseId);
  if (modules.length === 0) return [];

  const playlist: any[] = [];
  let seq = 1;

  for (const mod of modules) {
    const { data: slides } = await supabase
      .from("module_slides")
      .select("*")
      .eq("module_id", mod.id)
      .eq("status", "ACTIVE")
      .eq("is_draft", false)
      .order("order_index", { ascending: true });

    if (slides && slides.length > 0) {
      for (const slide of slides) {
        playlist.push({
          ...slide,
          seqNumber: seq++,
          moduleTitle: mod.title,
          moduleOrder: mod.module_order,
        });
      }
    }
  }

  return playlist;
}

async function fetchLessonSections(lessonId: string) {
  const { data } = await supabase
    .from("lesson_sections")
    .select("*")
    .eq("lesson_id", lessonId)
    .order("order_index", { ascending: true });
  return data || [];
}

async function fetchLessonMedia(lessonId: string) {
  const { data } = await supabase
    .from("lesson_media")
    .select("*")
    .eq("lesson_id", lessonId)
    .order("order_index", { ascending: true });
  return data || [];
}

/**
 * Persist the next section to read for each lesson. This is separate from
 * completed_lessons so a student can leave WhatsApp and resume mid-lecture.
 */
async function saveLessonSectionCheckpoint(
  studentCourseId: string | undefined,
  lessonId: string,
  nextSectionIndex: number,
): Promise<void> {
  if (!studentCourseId) return;
  const { data: record, error: fetchError } = await supabase
    .from("student_courses")
    .select("progress")
    .eq("id", studentCourseId)
    .maybeSingle();
  if (fetchError || !record) {
    console.error("[learning] Could not load lecture progress", fetchError);
    return;
  }
  const progress = record.progress || {};
  const lessonSections = {
    ...(progress.lesson_sections || {}),
    [lessonId]: { next_section_index: nextSectionIndex, updated_at: new Date().toISOString() },
  };
  const { error } = await supabase
    .from("student_courses")
    .update({ progress: { ...progress, lesson_sections: lessonSections } })
    .eq("id", studentCourseId);
  if (error) console.error("[learning] Could not save lecture checkpoint", error);
}

async function fetchLessonPracticeQuestions(lessonId: string) {
  const { data } = await supabase
    .from("lesson_practice_questions")
    .select("*")
    .eq("lesson_id", lessonId)
    .eq("status", "ACTIVE")
    .order("order_index", { ascending: true });
  return data || [];
}

// ═══════════════════════════════════════════════════════
// MAIN ROUTING HANDLER
// ═══════════════════════════════════════════════════════

export async function handleLearning(
  phone: string, text: string, contact: Contact, conv: Conversation
): Promise<void> {
  const n = normalise(text);
  const ctx = getCtx(conv);
  const state = conv.current_state;

  ctx.learningUnlocked = true;

  // 1. Ignore empty inputs or status receipts
  if (!text || text.trim().length === 0) {
    return;
  }

  // 2. Explicit exit command
  if (
    n === "exit learning centre" ||
    n === "exit learning center" ||
    n === "exit learning" ||
    n === "cm_exit_lc" ||
    text === "8️⃣ Exit Learning Centre"
  ) {
    await updateConversation(conv.id, { current_module: "MAIN_MENU", current_state: "IDLE", context_json: {} });
    await sendTextMessage(phone, "👋 You have exited the *Engr. Ero Learning Centre*.\n\nType *menu* to return to Xtop Retail services.\n\nType *Engr Ero* anytime to re-enter the Learning Centre.");
    return;
  }

  // 3. Collect identity details, then require Lizzy's lecturer verification.
  if (["ENTRY", "WAITING_STUDENT_NAME", "WAITING_MATRIC_NUMBER", "WAITING_SERIAL_NUMBER", "WAITING_DEPARTMENT", "WAITING_LEVEL"].includes(state)) {
    await handleRegistration(phone, text, contact, conv);
    return;
  }

  const verifiedStudent = await getStudentByPhone(phone);
  if (!verifiedStudent || !isStudentProfileComplete(verifiedStudent)) {
    await handleRegistration(phone, text, contact, { ...conv, current_state: "ENTRY" });
    return;
  }
  const verificationStatus = String(verifiedStudent.status || "ACTIVE").toUpperCase();
  if (verificationStatus !== "ACTIVE") {
    await sendTextMessage(phone, verificationStatus === "PENDING"
      ? "⏳ Your registration is awaiting Lizzy's approval. Lectures and course materials remain locked until verification is complete."
      : "❌ Your student verification was not approved. Please contact the Learning Centre administrator.");
    return;
  }

  // 4. Back / Menu navigation
  if (
    n === "lsn_menu" ||
    n === "cm_menu" ||
    n === "menu" ||
    n === "course menu" ||
    n === "back" ||
    n === "cm_exit_course" ||
    text.includes("Course Menu")
  ) {
    if (state === "WAITING_COURSE_CODE") {
      await showLearningCentreGateway(phone, conv.id, ctx);
    } else {
      await showCourseMenu(phone, conv.id, ctx);
    }
    return;
  }

  // 5. State Router
  switch (state) {
    case "WAITING_COURSE_CODE":
      await processCourseCodeAuth(phone, text, contact, conv);
      break;
    case "COURSE_MENU":
      await processCourseMenuSelection(phone, text, conv, ctx);
      break;
    case "AUTOMOBILE_DIAGNOSIS_INPUT":
    case "AUTOMOBILE_DIAGNOSIS_FOLLOWUP":
      await handleAutomobileDiagnosis(phone, text, conv);
      break;
    case "PRACTICAL_LAB_MENU":
      await processPracticalLabMenu(phone, text, conv, ctx);
      break;
    case "PRACTICAL_LAB_INPUT":
      await processPracticalLabInput(phone, text, conv, ctx);
      break;
    case "VIEWING_LESSON":
    case "VIEWING_SECTION":
      await processLessonNavigation(phone, text, conv, ctx);
      break;
    case "PRACTICE_QUESTION":
      await sendTextMessage(phone, "The lesson format has been updated. Practice questions have been removed; your lecture will continue from the saved section.");
      await deliverLesson(phone, conv.id, ctx, ctx.currentLessonOrder || 1);
      break;
    case "LESSON_COMPLETE":
      await processLessonCompleteAction(phone, text, conv, ctx);
      break;
    case "COURSE_FINAL_READY":
      await processCourseFinalAction(phone, text, conv, ctx);
      break;
    default:
      if (ctx.courseId) {
        await showCourseMenu(phone, conv.id, ctx);
      } else {
        await showLearningCentreGateway(phone, conv.id, ctx);
      }
      break;
  }
}

// ═══════════════════════════════════════════════════════
// 1. COURSE GATEWAY & AUTHENTICATION
// ═══════════════════════════════════════════════════════

async function showLearningCentreGateway(
  phone: string, conversationId: string, ctx: LearningCtx
): Promise<void> {
  await saveCtx(conversationId, { ...ctx, step: "WAITING_COURSE_CODE" }, "WAITING_COURSE_CODE");

  await sendTextMessage(phone,
    `🎓 *Engr. Ero Learning Centre*\n\n` +
    `Please enter your *Course Code* to enter the classroom.\n\n` +
    `_Examples:_ *ELA301*, *ELA302*, *ELA401*, or *ELA301*\n\n` +
    `_Type *Exit Learning Centre* to return to Xtop Retail._`
  );
}

export async function promptCourseCode(phone: string, conversationId: string): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "LEARNING",
    current_state: "WAITING_COURSE_CODE",
    context_json: { step: "WAITING_COURSE_CODE", learningUnlocked: true },
  });
  await sendTextMessage(phone,
    `🎓 *Engr. Ero Learning Centre*\n\n` +
    `Please enter your *Course Code* to continue.\n\n` +
    `_Examples:_ *ELA301*, *ELA302*, *ELA401*, or *ELA301*`
  );
}

async function processCourseCodeAuth(
  phone: string, text: string, contact: Contact, conv: Conversation
): Promise<void> {
  const rawCode = text.trim();
  if (rawCode.length < 3) {
    await sendTextMessage(phone, "⚠️ Please enter a valid course code (e.g. *ELA301*):");
    return;
  }

  const course = await getCourseByCode(rawCode);
  if (!course || course.status === "DRAFT" || course.is_archived) {
    await sendTextMessage(phone,
      `❌ *Course Not Available: "${rawCode}"*\n\n` +
      `This course is not currently active in the Learning Hub.\n\nType *Exit Learning Centre* to leave.`
    );
    return;
  }

  if (course.status === "BLOCKED") {
    await sendTextMessage(phone,
      `🔒 *Course Blocked*\n\n*${course.course_code} — ${course.course_name}* is currently locked by the instructor.`
    );
    return;
  }

  const student = await getOrCreateStudent(phone, contact.name);
  
  const { data: access } = await supabase
    .from("student_course_access")
    .select("*")
    .eq("student_id", student.id)
    .eq("course_id", course.id)
    .maybeSingle();

  if (access && access.access_status === "BLOCKED") {
    await sendTextMessage(phone, `🔒 *Access Blocked*\nYour access to *${course.course_code}* has been blocked by the instructor.`);
    return;
  }

  try {
    const today = new Date().toISOString().split("T")[0];
    await supabase.from("attendance").upsert({
      student_id: student.id,
      course_id: course.id,
      session_date: today,
      phone
    });
  } catch (_) {}

  const lessons = await fetchAllCourseLessons(course.id);
  const enrollment = await getStudentCourseAccess(student.id, course.id, course.status);

  // Filter completed lessons against only valid published lesson IDs
  const publishedIds = new Set(lessons.map((l: any) => l.id));
  const rawCompleted = enrollment?.progress?.completed_lessons || [];
  const validCompleted = rawCompleted.filter((id: string) => publishedIds.has(id));
  const nextLessonOrder = validCompleted.length >= lessons.length ? 1 : validCompleted.length + 1;

  const ctx: LearningCtx = {
    step: "COURSE_MENU",
    learningUnlocked: true,
    courseCode: course.course_code,
    courseId: course.id,
    courseName: course.course_name,
    term: course.term || "General",
    studentId: student.id,
    studentCourseId: enrollment?.id,
    totalLessons: lessons.length,
    currentLessonOrder: nextLessonOrder,
    currentSectionIndex: 0,
    currentPracticeIndex: 0
  };

  await saveCtx(conv.id, ctx, "COURSE_MENU");
  await showCourseMenu(phone, conv.id, ctx);
}

// ═══════════════════════════════════════════════════════
// 2. COURSE HUB MENU
// ═══════════════════════════════════════════════════════

export async function showCourseMenu(
  phone: string, conversationId: string, ctx: LearningCtx
): Promise<void> {
  ctx.learningUnlocked = true;
  await saveCtx(conversationId, { ...ctx, step: "COURSE_MENU" }, "COURSE_MENU");
  await sendListMessage(phone,
    `🎓 *${ctx.courseCode} — ${ctx.courseName?.toUpperCase()}*\n_${ctx.term}_\n\nSelect an option:`,
    "Course Options",
    [
      { title: "Lectures & Studies", rows: [
        makeListRow("cm_lecture", "1️⃣ Lecture / Classroom", "Start or continue"),
        makeListRow("cm_materials", "2️⃣ Course Materials", "Handouts, diagrams & PDFs"),
        makeListRow("cm_progress", "3️⃣ My Progress", "Lesson completion status"),
        ...(ctx.courseCode === "ELA401" ? [makeListRow("cm_lab", "🧪 Practical Lab & Simulations", "12 physical guides + phone calculators")] : []),
        ...(ctx.courseCode === "ELA301" ? [makeListRow("cm_auto_diag", "🚗 Vehicle Fault Diagnosis", "Guided vehicle troubleshooting")] : []),
      ]},
      { title: "Assessments & Exit", rows: [
        makeListRow("cm_test", "4️⃣ Final CBT Exam", "Take course test"),
        makeListRow("cm_result", "5️⃣ My Results", "View exam scores"),
        makeListRow("cm_switch", "6️⃣ Switch Course", "Enter another code"),
        makeListRow("cm_exit_course", "7️⃣ Exit Course", "Back to Learning Centre"),
        makeListRow("cm_exit_lc", "8️⃣ Exit Learning Centre", "Return to Xtop"),
      ]},
    ],
    ctx.courseCode || "Learning Centre", "Engr. Ero Learning Centre"
  );
}

async function processCourseMenuSelection(
  phone: string, text: string, conv: Conversation, ctx: LearningCtx
): Promise<void> {
  const n = normalise(text);
  const num = extractSelection(text);

  if (n === "cm_lecture" || num === 1 || n.includes("lecture") || n.includes("classroom")) {
    await deliverLesson(phone, conv.id, ctx, ctx.currentLessonOrder || 1);
    return;
  }
  if (n === "cm_lab" || n.includes("practical lab")) {
    if (ctx.courseCode !== "ELA401") { await sendTextMessage(phone, "The practical simulation tools are currently configured for ELA401."); await showCourseMenu(phone, conv.id, ctx); return; }
    await showPracticalLabMenu(phone, conv.id, ctx);
    return;
  }
  if (n === "cm_auto_diag" || n.includes("vehicle fault diagnosis") || n.includes("automobile diagnosis")) {
    if (ctx.courseCode !== "ELA301") { await showCourseMenu(phone, conv.id, ctx); return; }
    await startVehicleDiagnosis(phone, conv);
    return;
  }
  if (n === "cm_materials" || num === 2 || n.includes("materials")) {
    await showCourseMaterials(phone, conv.id, ctx);
    return;
  }
  if (n === "cm_progress" || num === 3 || n.includes("progress")) {
    await showStudentProgress(phone, conv.id, ctx);
    return;
  }
  if (n === "cm_test" || num === 4 || n.includes("exam") || n.includes("test")) {
    await startExamEntry(phone, conv.id, ctx);
    return;
  }
  if (n === "cm_result" || num === 5 || n.includes("results")) {
    await showStudentResults(phone, conv.id, ctx);
    return;
  }
  if (n === "cm_switch" || num === 6 || n.includes("switch")) {
    await showLearningCentreGateway(phone, conv.id, ctx);
    return;
  }
  if (n === "cm_exit_course" || num === 7 || n.includes("exit course")) {
    await showLearningCentreGateway(phone, conv.id, ctx);
    return;
  }

  await sendTextMessage(phone, "⚠️ Please select a valid course option (1–8):");
  await showCourseMenu(phone, conv.id, ctx);
}


/* ═══════════════════════════════════════════════════════
   ELA401 PHONE-BASED PRACTICAL SIMULATIONS
   Physical experiment procedures remain in the course practical guides.
   Phone results are learning simulations, not certified measurements.
═══════════════════════════════════════════════════════ */

async function showPracticalLabMenu(phone: string, convId: string, ctx: LearningCtx): Promise<void> {
  ctx.labMode = undefined;
  ctx.labStage = undefined;
  ctx.labObservations = undefined;
  ctx.labAverage = undefined;
  ctx.labRating = undefined;
  await saveCtx(convId, ctx, "PRACTICAL_LAB_MENU");
  await sendListMessage(phone,
    "🧪 *ELA401 Practical Lab & Simulations*\n\nChoose a precision time measurement experiment. Enter readings in the phone simulator and compare them with the physical laboratory procedure in the matching practical guide.\n\n_Simulated results are for learning and are not calibration certificates._",
    "Choose a simulation",
    [
      { title: "Precision Time Measurement Experiments", rows: [
        makeListRow("lab_pendulum", "1. Pendulum Experiment", "Repeated readings, period, frequency & error"),
        makeListRow("lab_quartz", "2. Quartz Clock Drift", "Signed ppm, elapsed time & drift"),
        makeListRow("lab_frequency", "3. Frequency & Period", "Cycle count, gate time & period"),
        makeListRow("lab_calibration", "4. Instrument Calibration", "Reference readings, error & correction"),
        makeListRow("lab_uncertainty", "5. Measurement Uncertainty", "Repeated readings & uncertainty budget"),
      ]},
      { title: "Navigation", rows: [
        makeListRow("lab_back", "Course Menu", "Return to ELA401 options")
      ]}
    ],
    "ELA401 Lab", "Engr. Ero Learning Centre"
  );
}

async function processPracticalLabMenu(phone: string, text: string, conv: Conversation, ctx: LearningCtx): Promise<void> {
  const n = normalise(text);
  const num = extractSelection(text);
  if (n === "lab_back" || n.includes("course menu") || n === "back") {
    await showCourseMenu(phone, conv.id, ctx);
    return;
  }
  const selected = n === "lab_pendulum" || num === 1 ? "pendulum"
    : n === "lab_quartz" || num === 2 ? "quartz"
    : n === "lab_frequency" || num === 3 ? "frequency"
    : n === "lab_calibration" || num === 4 ? "calibration"
    : n === "lab_uncertainty" || num === 5 ? "uncertainty" : "";
  if (!selected) {
    await sendTextMessage(phone, "Please choose one of the listed simulations, or select Course Menu.");
    return;
  }
  ctx.labMode = selected;
  if (selected === "work_time") {
    ctx.labStage = "observations";
    await saveCtx(conv.id, ctx, "PRACTICAL_LAB_INPUT");
    await sendTextMessage(phone, "⏱️ *Work Time Calculator — Step 1 of 3*\n\nEnter at least two observed cycle times in seconds, separated by commas.\nExample: 12.4, 12.8, 12.6, 12.2, 12.5");
  } else if (selected === "work_sample") {
    ctx.labStage = "sample";
    await saveCtx(conv.id, ctx, "PRACTICAL_LAB_INPUT");
    await sendTextMessage(phone, "📊 *Work Sampling Calculator*\n\nEnter the number of observations in the activity, followed by the total observations, separated by a comma.\nExample: 35, 100");
  } else if (selected === "pendulum") {
    ctx.labStage = "length";
    await saveCtx(conv.id, ctx, "PRACTICAL_LAB_INPUT");
    await sendTextMessage(phone, "🔔 *Pendulum Period Simulator*\n\nEnter pendulum length in metres (from pivot to the centre of the bob). Example: 0.50");
  } else if (selected === "quartz") {
    ctx.labStage = "ppm";
    await saveCtx(conv.id, ctx, "PRACTICAL_LAB_INPUT");
    await sendTextMessage(phone, "⌚ *Quartz Drift Simulator*\n\nEnter the signed frequency offset in ppm. Example: 10 for a clock running fast by +10 ppm, or -10 for slow.");
  } else if (selected === "frequency") {
    ctx.labStage = "hz";
    await saveCtx(conv.id, ctx, "PRACTICAL_LAB_INPUT");
    await sendTextMessage(phone, "〰️ *Frequency Converter*\n\nEnter frequency in hertz (Hz). Example: 32768");
  } else if (selected === "calibration") {
    ctx.labStage = "comparison";
    await saveCtx(conv.id, ctx, "PRACTICAL_LAB_INPUT");
    await sendTextMessage(phone, "🎯 *Timing Instrument Comparison*\n\nEnter instrument indication and reference value in the same unit, separated by a comma. Example: 5.02, 5.00");
  } else {
    ctx.labStage = "uncertainty";
    await saveCtx(conv.id, ctx, "PRACTICAL_LAB_INPUT");
    await sendTextMessage(phone, "📐 *Uncertainty Calculator*\n\nEnter independent standard uncertainty components in the same unit, separated by commas. Example: 0.01, 0.02, 0.015");
  }
}

function parseLabNumbers(value: string): number[] {
  return value.split(/[;,\s]+/).map(v => Number(v.trim())).filter(v => Number.isFinite(v));
}

async function processPracticalLabInput(phone: string, text: string, conv: Conversation, ctx: LearningCtx): Promise<void> {
  const values = parseLabNumbers(text);
  if (values.length === 0 || values.some(v => !Number.isFinite(v))) {
    await sendTextMessage(phone, "⚠️ Please enter numeric values only, using commas between multiple values.");
    return;
  }
  const onePositive = values.length === 1 && values[0] > 0;
  const finish = async (message: string) => {
    // Preserve the student's submitted readings so the lecturer can review the
    // experiment and the practical-based CBT can draw on the student's own data.
    if (ctx.studentId && ctx.courseId && ctx.labMode) {
      const experimentNames: Record<string, string> = {
        work_time: "Industrial Work Measurement",
        work_sample: "Work Sampling",
        pendulum: "Pendulum Period",
        quartz: "Quartz Clock Drift",
        frequency: "Frequency and Period",
        calibration: "Timing Instrument Comparison",
        uncertainty: "Measurement Uncertainty",
      };
      const rawData = {
        entered_values: values,
        observed_cycle_times: ctx.labObservations || [],
        average_observed_time: ctx.labAverage ?? null,
        performance_rating_percent: ctx.labRating ?? null,
        allowance_input_percent: ctx.labMode === "work_time" ? values[0] : null,
        entry_method: "WhatsApp student-submitted readings",
      };
      const resultData: Record<string, unknown> = { result_text: message };
      if (ctx.labMode === "work_time" && ctx.labAverage !== undefined) {
        const ratingFactor = (ctx.labRating || 100) / 100;
        const normalTime = ctx.labAverage * ratingFactor;
        const allowanceFraction = values[0] / 100;
        resultData.average_observed_time_s = ctx.labAverage;
        resultData.rating_factor = ratingFactor;
        resultData.normal_time_s = normalTime;
        resultData.allowance_fraction = allowanceFraction;
        resultData.standard_time_s = normalTime / (1 - allowanceFraction);
      } else if (ctx.labMode === "work_sample") {
        resultData.activity_percentage = values[0] / values[1] * 100;
      } else if (ctx.labMode === "pendulum") {
        resultData.period_s = 2 * Math.PI * Math.sqrt(values[0] / 9.80665);
      } else if (ctx.labMode === "quartz") {
        resultData.daily_error_s = values[0] * 1e-6 * 86400;
      } else if (ctx.labMode === "frequency") {
        resultData.period_s = 1 / values[0];
      } else if (ctx.labMode === "calibration") {
        resultData.indication_error = values[0] - values[1];
        resultData.correction = values[1] - values[0];
      } else if (ctx.labMode === "uncertainty") {
        resultData.combined_standard_uncertainty = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
      }
      const { error: saveError } = await supabase.from("ela401_experiment_submissions").insert({
        student_id: ctx.studentId,
        course_id: ctx.courseId,
        experiment_code: ctx.labMode,
        experiment_name: experimentNames[ctx.labMode] || ctx.labMode,
        data_source: "STUDENT_REPORTED",
        raw_data: rawData,
        result_data: resultData,
        result_text: message,
        status: "SUBMITTED",
      });
      if (saveError) console.error("[ELA401_LAB_SAVE]", saveError.message);
    }
    await sendTextMessage(phone, message + "\n\n✅ Your experiment readings have been submitted for lecturer review.\n\nChoose another experiment from the menu below, or select *Course Menu* to return.");
    ctx.labMode = undefined;
    ctx.labStage = undefined;
    await saveCtx(conv.id, ctx, "PRACTICAL_LAB_MENU");
    await showPracticalLabMenu(phone, conv.id, ctx);
  };
  const retry = async (message: string) => {
    await sendTextMessage(phone, "⚠️ " + message);
  };

  if (ctx.labMode === "work_time") {
    if (ctx.labStage === "observations") {
      if (values.length < 2 || values.some(v => v <= 0)) { await retry("Enter at least two positive time observations, separated by commas."); return; }
      ctx.labObservations = values;
      ctx.labAverage = values.reduce((a,b) => a+b,0) / values.length;
      ctx.labStage = "rating";
      await saveCtx(conv.id, ctx, "PRACTICAL_LAB_INPUT");
      await sendTextMessage(phone, "Average observed time: *" + ctx.labAverage.toFixed(4) + " s*\n\n*Step 2 of 3:* Enter performance rating as a percentage. Example: 110");
      return;
    }
    if (ctx.labStage === "rating") {
      if (!onePositive || values[0] > 200) { await retry("Enter one rating percentage greater than 0 and not above 200. Example: 110"); return; }
      ctx.labRating = values[0];
      ctx.labStage = "allowance";
      await saveCtx(conv.id, ctx, "PRACTICAL_LAB_INPUT");
      await sendTextMessage(phone, "Rating factor: *" + (values[0]/100).toFixed(4) + "*\n\n*Step 3 of 3:* Enter allowance percentage as a fraction of total standard time. Example: 15. Enter 0 if no allowance is being applied.");
      return;
    }
    if (ctx.labStage === "allowance") {
      if (values.length !== 1 || values[0] < 0 || values[0] >= 100) { await retry("Enter one allowance percentage from 0 up to (but not including) 100."); return; }
      const avg = ctx.labAverage || 0;
      const rating = ctx.labRating || 100;
      const normal = avg * rating / 100;
      const allowance = values[0] / 100;
      const standard = normal / (1 - allowance);
      await finish("🧮 *Work Measurement Result*\nObservations: " + (ctx.labObservations || []).length + "\nAverage observed time: " + avg.toFixed(4) + " s\nRating: " + rating.toFixed(2) + "%\nNormal time: " + normal.toFixed(4) + " s\nAllowance: " + values[0].toFixed(2) + "% of standard time\n*Standard time: " + standard.toFixed(4) + " s*\n\nFormula: NT = average × rating factor; ST = NT ÷ (1 − allowance).");
      return;
    }
  }

  if (ctx.labMode === "work_sample") {
    if (values.length !== 2 || values[0] < 0 || values[1] <= 0 || values[0] > values[1]) { await retry("Enter activity count,total count. Both must be non-negative, total must be positive, and activity count cannot exceed total. Example: 35,100"); return; }
    const p = values[0] / values[1] * 100;
    await finish("📊 *Work Sampling Result*\nActivity observations: " + values[0] + "\nTotal observations: " + values[1] + "\n*Estimated activity proportion: " + p.toFixed(2) + "%*\n\nThis is a sample estimate. Its precision depends on the sampling design and sample size.");
    return;
  }
  if (ctx.labMode === "pendulum") {
    if (!onePositive || values[0] > 10) { await retry("Enter one pendulum length in metres greater than 0 and no more than 10. Example: 0.50"); return; }
    const period = 2 * Math.PI * Math.sqrt(values[0] / 9.80665);
    await finish("🔔 *Pendulum Simulation Result*\nLength: " + values[0].toFixed(4) + " m\nTheoretical period: *" + period.toFixed(6) + " s*\nFrequency: " + (1/period).toFixed(6) + " Hz\n\nFormula: T = 2π√(L/g), using g = 9.80665 m/s² and the small-angle approximation.");
    return;
  }
  if (ctx.labMode === "quartz") {
    if (values.length !== 1 || Math.abs(values[0]) > 100000) { await retry("Enter one signed frequency offset in ppm. Example: +10 or -10."); return; }
    const daily = values[0] * 1e-6 * 86400;
    await finish("⌚ *Quartz Drift Result*\nFrequency offset: " + values[0] + " ppm\nDaily time error: *" + daily.toFixed(6) + " s/day*\nWeekly time error: " + (daily*7).toFixed(6) + " s/week\n\nPositive means the clock gains time; negative means it loses time. Assumes a constant frequency offset.");
    return;
  }
  if (ctx.labMode === "frequency") {
    if (!onePositive || values[0] > 1e12) { await retry("Enter one positive frequency in hertz. Example: 32768"); return; }
    const period = 1 / values[0];
    await finish("〰️ *Frequency Conversion Result*\nFrequency: " + values[0] + " Hz\nPeriod: *" + period.toExponential(6) + " s*\nPeriod: " + (period*1000).toExponential(6) + " ms\n\nFormula: T = 1/f.");
    return;
  }
  if (ctx.labMode === "calibration") {
    if (values.length !== 2) { await retry("Enter exactly two numbers: instrument indication, reference value. Example: 5.02, 5.00"); return; }
    const error = values[0] - values[1];
    await finish("🎯 *Timing Comparison Result*\nInstrument indication: " + values[0] + "\nReference value: " + values[1] + "\nIndication error: *" + error.toFixed(6) + "*\nCorrection (negative of error): " + (-error).toFixed(6) + "\n\nThis is a numerical comparison only. Formal calibration requires a suitable documented reference and uncertainty statement.");
    return;
  }
  if (ctx.labMode === "uncertainty") {
    if (values.length < 2 || values.some(v => v < 0)) { await retry("Enter at least two non-negative uncertainty components in the same unit. Example: 0.01, 0.02, 0.015"); return; }
    const combined = Math.sqrt(values.reduce((sum,v) => sum + v*v,0));
    await finish("📐 *Combined Standard Uncertainty*\nComponents: " + values.length + "\nCombined value (RSS): *" + combined.toFixed(6) + "*\n\nFormula: u_c = √(u₁² + u₂² + …). Use this only when the components are independent and expressed in the same unit.");
    return;
  }
  await showPracticalLabMenu(phone, conv.id, ctx);
}

// ═══════════════════════════════════════════════════════
// 3. LESSON DELIVERY
// ═══════════════════════════════════════════════════════

async function deliverLesson(
  phone: string, conversationId: string, ctx: LearningCtx, targetOrder: number
): Promise<void> {
  if (!ctx.courseId) { await promptCourseCode(phone, conversationId); return; }
  
  const allLessons = await fetchAllCourseLessons(ctx.courseId);
  if (allLessons.length === 0) {
    await sendTextMessage(phone, `📚 No published lessons are currently available for *${ctx.courseCode}*.`);
    await showCourseMenu(phone, conversationId, ctx);
    return;
  }

  const safeIndex = Math.max(0, Math.min(targetOrder - 1, allLessons.length - 1));
  const currentLesson = allLessons[safeIndex];
  const activeOrder = safeIndex + 1;
  const isFirst = activeOrder <= 1;
  const sections = await fetchLessonSections(currentLesson.id);
  const mediaList = await fetchLessonMedia(currentLesson.id);

  // Restore the last saved lecture position instead of restarting at Slide 1.
  let savedSectionIndex = 0;
  if (ctx.studentId && ctx.courseId) {
    const enrollment = await getStudentCourseAccess(ctx.studentId, ctx.courseId);
    ctx.studentCourseId = enrollment?.id || ctx.studentCourseId;
    const saved = enrollment?.progress?.lesson_sections?.[currentLesson.id]?.next_section_index;
    if (Number.isInteger(saved) && saved >= 0) savedSectionIndex = Math.min(saved, sections.length);
  }

  ctx.step = "VIEWING_LESSON";
  ctx.currentLessonId = currentLesson.id;
  ctx.currentLessonOrder = activeOrder;
  ctx.currentSectionIndex = savedSectionIndex;
  ctx.currentPracticeIndex = 0;
  ctx.practiceScore = 0;
  ctx.totalLessons = allLessons.length;
  await saveCtx(conversationId, ctx, "VIEWING_LESSON");

  const slideCount = sections.length;
  const objectives = currentLesson.objectives
    ? `\n\n🎯 *Learning outcomes*\n${currentLesson.objectives}`
    : "";
  const message =
    `🎓 *${ctx.courseCode} — WHATSAPP LECTURE ROOM*\n` +
    `📘 *${currentLesson.title}*\n` +
    `📚 Lesson ${activeOrder} of ${allLessons.length}\n` +
    `⏱️ Estimated duration: ${currentLesson.duration || "15 mins"}\n` +
    (slideCount > 0 ? `🖥️ Teaching slides: ${slideCount}\n` : "") +
    objectives +
    `\n\nThis lesson is presented one teaching slide at a time. Read each slide carefully, study its diagram and worked examples, then continue to the next slide.`;

  await sendTextMessage(phone, message);

  if (currentLesson.image_url) {
    try {
      await sendImageMessage(phone, currentLesson.image_url, currentLesson.title);
    } catch (_) {}
  }

  for (const m of mediaList) {
    if (m.file_url) {
      try {
        await sendImageMessage(phone, m.file_url, m.caption || m.description || "Technical Diagram");
      } catch (_) {}
    }
  }

  const buttons = [];
  if (sections.length > 0 && savedSectionIndex < sections.length) {
    buttons.push(makeButton("lsn_section_next", savedSectionIndex > 0 ? "▶️ Continue Lecture" : "▶️ Start Lecture"));
  }
  if (!isFirst) buttons.push(makeButton("lsn_prev", "⬅️ Prev Lesson"));
  buttons.push(makeButton("lsn_menu", "📋 Course Menu"));

  if (sections.length === 0) {
    await sendTextMessage(phone, "This lesson does not have any published lecture sections yet. Your course progress has been preserved.");
    await showCourseMenu(phone, conversationId, ctx);
    return;
  }
  if (savedSectionIndex >= sections.length) {
    await completeAndAdvanceLesson(phone, conversationId, ctx);
    return;
  }

  await sendButtonMessage(
    phone,
    savedSectionIndex > 0
      ? `Your lecture is saved at Section ${savedSectionIndex + 1} of ${sections.length}. Select Continue Lecture to resume from where you stopped.`
      : "Your lecture sections are ready. Select Start Lecture to begin.",
    buttons,
    `${ctx.courseCode} Classroom`,
    `Lesson ${activeOrder}/${allLessons.length}`
  );
}

// ═══════════════════════════════════════════════════════
// 4. SECTION-BY-SECTION & PRACTICE NAVIGATION
// ═══════════════════════════════════════════════════════

async function processLessonNavigation(
  phone: string, text: string, conv: Conversation, ctx: LearningCtx
): Promise<void> {
  const n = normalise(text);
  const currentOrder = ctx.currentLessonOrder || 1;
  const lessonId = ctx.currentLessonId;

  if (n === "lsn_menu" || n.includes("course menu") || n === "menu") {
    await showCourseMenu(phone, conv.id, ctx);
    return;
  }
  if (n === "lsn_prev" || n.includes("prev lesson")) {
    await deliverLesson(phone, conv.id, ctx, Math.max(1, currentOrder - 1));
    return;
  }

  // Legacy practice buttons and old PRACTICE_QUESTION sessions now return
  // to lecture delivery; practice questions are no longer part of lessons.
  if (!lessonId) {
    await deliverLesson(phone, conv.id, ctx, currentOrder);
    return;
  }

  if (
    n === "lsn_section_next" ||
    n.includes("continue lecture") ||
    n.includes("start lecture") ||
    n.includes("next section") ||
    n === "next" ||
    n === "section" ||
    n === "lsn_practice_start" ||
    n.includes("practice")
  ) {
    // Ensure this student has an enrollment row before saving section progress.
    // Older rows may be missing because the previous insert used a non-existent
    // access_status column; getStudentCourseAccess now writes the real status column.
    if (ctx.studentId && ctx.courseId && !ctx.studentCourseId) {
      const enrollment = await getStudentCourseAccess(ctx.studentId, ctx.courseId);
      ctx.studentCourseId = enrollment?.id;
    }

    const sections = await fetchLessonSections(lessonId);
    const secIdx = ctx.currentSectionIndex || 0;

    if (secIdx >= sections.length) {
      await completeAndAdvanceLesson(phone, conv.id, ctx);
      return;
    }

    const activeSection = sections[secIdx];
    const nextSectionIndex = secIdx + 1;
    ctx.currentSectionIndex = nextSectionIndex;
    ctx.step = "VIEWING_SECTION";

    // Save to the database before sending the content, so the checkpoint
    // survives a restart or a student returning with a new WhatsApp session.
    await saveLessonSectionCheckpoint(ctx.studentCourseId, lessonId, nextSectionIndex);
    await saveCtx(conv.id, ctx, "VIEWING_SECTION");

    await sendTextMessage(phone, `📖 *Section ${secIdx + 1} of ${sections.length}*\n\n*${activeSection.title}*\n\n${activeSection.content}`);

    if (nextSectionIndex >= sections.length) {
      await completeAndAdvanceLesson(phone, conv.id, ctx);
      return;
    }

    await sendButtonMessage(
      phone,
      `Section ${nextSectionIndex} of ${sections.length} saved. You can continue now or return later; your next section will be remembered.`,
      [
        makeButton("lsn_section_next", "Next Section ➡️"),
        makeButton("lsn_menu", "📋 Course Menu")
      ],
      "Lecture Progress",
      `Saved: ${nextSectionIndex}/${sections.length}`
    );
    return;
  }

  await deliverLesson(phone, conv.id, ctx, currentOrder);
}

async function completeAndAdvanceLesson(
  phone: string, convId: string, ctx: LearningCtx
) {
  const currentOrder = ctx.currentLessonOrder || 1;
  const allLessons = await fetchAllCourseLessons(ctx.courseId || "");
  const safeIndex = currentOrder - 1;
  const cl = allLessons[safeIndex];

  if (ctx.studentCourseId && cl) {
    await markLessonComplete(ctx.studentCourseId, cl.id, currentOrder);
  }

  const nextOrder = currentOrder + 1;
  const total = allLessons.length;

  if (currentOrder >= total) {
    ctx.step = "COURSE_FINAL_READY";
    await saveCtx(convId, ctx, "COURSE_FINAL_READY");
    await sendButtonMessage(
      phone,
      `🎉 *Course Topics Completed!*

You have completed all *${total}* published topics in *${ctx.courseCode} — ${ctx.courseName}*.

Would you like to open another available course, or take the CBT examination for this course?`,
      [
        makeButton("lsn_next_course", "Yes, Next Course"),
        makeButton("lsn_final_exam", "📝 Start CBT Exam"),
        makeButton("lsn_menu", "📋 Course Menu")
      ],
      "Course Completed",
      "Choose what to do next"
    );
    return;
  }

  ctx.currentLessonOrder = nextOrder;
  ctx.step = "LESSON_COMPLETE";
  await saveCtx(convId, ctx, "LESSON_COMPLETE");

  await sendButtonMessage(phone,
    `✅ *Lesson ${currentOrder} Complete!*\n\nReady to start Lesson ${nextOrder}?`,
    [makeButton("lsn_next_go", `Next Topic ${nextOrder} ➡️`), makeButton("lsn_menu", "📋 Course Menu")],
    `${ctx.courseCode} Progress`, `${currentOrder}/${total} completed`
  );
}

async function processLessonCompleteAction(
  phone: string, text: string, conv: Conversation, ctx: LearningCtx
): Promise<void> {
  const n = normalise(text);
  if (n === "lsn_next_go" || n.includes("lesson") || n.includes("next") || n === "yes") {
    const nextOrder = ctx.currentLessonOrder || 1;
    await deliverLesson(phone, conv.id, ctx, nextOrder);
    return;
  }
  if (n === "lsn_menu" || n.includes("course menu") || n === "menu" || n === "no" || n === "back") {
    await showCourseMenu(phone, conv.id, ctx);
    return;
  }

  // A repeated A-D answer can arrive after the final practice answer has
  // already advanced the conversation. Do not treat it as a new selection.
  await sendButtonMessage(
    phone,
    "Your practice for this lesson has already been completed. Please choose whether to continue to the next lesson or return to the course menu.",
    [
      makeButton("lsn_next_go", `Next Topic ${ctx.currentLessonOrder || 1} ➡️`),
      makeButton("lsn_menu", "📋 Course Menu")
    ],
    `${ctx.courseCode} Progress`
  );
}

async function processCourseFinalAction(
  phone: string, text: string, conv: Conversation, ctx: LearningCtx
): Promise<void> {
  const n = normalise(text);
  if (n === "lsn_final_exam" || n.includes("cbt") || n.includes("final exam") || n.includes("start exam")) {
    await startExamEntry(phone, conv.id, ctx);
    return;
  }
  if (n === "lsn_next_course" || n === "yes" || n.includes("next course") || n.includes("another course")) {
    await showLearningCentreGateway(phone, conv.id, {
      learningUnlocked: true,
      step: "WAITING_COURSE_CODE",
    });
    return;
  }
  if (n === "lsn_menu" || n.includes("course menu") || n === "menu" || n === "back" || n === "no") {
    await showCourseMenu(phone, conv.id, ctx);
    return;
  }
  await sendButtonMessage(
    phone,
    "All course topics are complete. Would you like to open another available course, take the CBT examination, or return to the course menu?",
    [
      makeButton("lsn_next_course", "Yes, Next Course"),
      makeButton("lsn_final_exam", "📝 Start CBT Exam"),
      makeButton("lsn_menu", "📋 Course Menu")
    ],
    "Course Completed",
    "Choose what to do next"
  );
}

// ═══════════════════════════════════════════════════════
// 5. ACCURATE PROGRESS REPORTING & CLEANUP
// ═══════════════════════════════════════════════════════

async function showStudentProgress(phone: string, conversationId: string, ctx: LearningCtx): Promise<void> {
  if (!ctx.studentId || !ctx.courseId) { await promptCourseCode(phone, conversationId); return; }
  ctx.step = "VIEWING_PROGRESS";
  await saveCtx(conversationId, ctx, "COURSE_MENU");

  const access = await getStudentCourseAccess(ctx.studentId, ctx.courseId);
  const lessons = await fetchAllCourseLessons(ctx.courseId);
  
  if (lessons.length === 0) {
    await sendTextMessage(phone, `📊 No published lessons in *${ctx.courseCode}* yet.`);
    await showCourseMenu(phone, conversationId, ctx);
    return;
  }

  // Filter completed lessons to only count published lessons (removes old/stale test IDs)
  const publishedIds = new Set(lessons.map((l: any) => l.id));
  const rawCompleted = access?.progress?.completed_lessons || [];
  const validCompleted = rawCompleted.filter((id: string) => publishedIds.has(id));

  // Sync back to database if there were stale IDs
  if (access?.id && validCompleted.length !== rawCompleted.length) {
    try {
      await supabase.from("student_courses").update({
        progress: {
          ...(access.progress || {}),
          completed_lessons: validCompleted,
          last_lesson_order: validCompleted.length
        }
      }).eq("id", access.id);
    } catch (_) {}
  }

  const done = validCompleted.length;
  const total = lessons.length;
  const pct = Math.min(100, Math.round((done / total) * 100));
  const bar = `[${"🟩".repeat(Math.round(pct / 10))}${"⬜".repeat(10 - Math.round(pct / 10))}]`;

  await sendButtonMessage(phone,
    `📊 *PROGRESS: ${ctx.courseCode}*\n\n*Completed Lessons:* ${done}/${total} (${pct}%)\n${bar}\n\n${pct >= 100 ? "🎉 All lessons completed! You are eligible for the exam." : "Keep studying!"}`,
    [makeButton("cm_lecture", "📖 Continue"), makeButton("cm_test", "📝 Take Test"), makeButton("cm_menu", "📋 Menu")],
    "Academic Progress"
  );
}

// ═══════════════════════════════════════════════════════
// 6. MATERIALS & RESULTS
// ═══════════════════════════════════════════════════════

async function showCourseMaterials(phone: string, conversationId: string, ctx: LearningCtx): Promise<void> {
  if (!ctx.courseId) { await promptCourseCode(phone, conversationId); return; }
  ctx.step = "VIEWING_MATERIALS";
  await saveCtx(conversationId, ctx, "COURSE_MENU");

  const { data: materials } = await supabase
    .from("course_materials")
    .select("*")
    .eq("course_id", ctx.courseId);

  const lessons = await fetchAllCourseLessons(ctx.courseId);
  const pdfLessons = lessons.filter((l: any) => l.pdf_url);

  if ((!materials || materials.length === 0) && pdfLessons.length === 0) {
    await sendTextMessage(phone, `📂 No downloadable materials uploaded for *${ctx.courseCode}* yet.`);
    await showCourseMenu(phone, conversationId, ctx);
    return;
  }

  let txt = `📂 *Course Materials & Handouts — ${ctx.courseCode}*\n\n`;
  materials?.forEach((m: any) => {
    txt += `• *${m.file_name}* (${m.file_type.toUpperCase()})\n`;
  });
  pdfLessons.forEach((l: any) => {
    txt += `• *${l.title} Handout* (PDF)\n`;
  });

  await sendTextMessage(phone, txt);

  for (const m of (materials || [])) {
    if (m.file_url?.startsWith("http")) {
      await sendDocumentMessage(phone, m.file_url, m.file_name, ctx.courseCode || "Document");
    }
  }
  for (const l of pdfLessons) {
    if (l.pdf_url?.startsWith("http")) {
      await sendDocumentMessage(phone, l.pdf_url, `${ctx.courseCode}_L${l.seqNumber || 1}.pdf`, l.title);
    }
  }

  await sendButtonMessage(phone, "All materials sent above.",
    [makeButton("cm_lecture", "📖 Go to Class"), makeButton("cm_menu", "📋 Course Menu")],
    "Materials Library"
  );
}

async function showStudentResults(phone: string, conversationId: string, ctx: LearningCtx): Promise<void> {
  if (!ctx.studentId || !ctx.courseId) { await promptCourseCode(phone, conversationId); return; }
  ctx.step = "VIEWING_RESULTS";
  await saveCtx(conversationId, ctx, "COURSE_MENU");

  const attempts = await getStudentExamAttempts(ctx.studentId, ctx.courseId);
  if (attempts.length === 0) {
    await sendTextMessage(phone, `📊 No CBT attempts recorded yet for *${ctx.courseCode}*. Take your exam first.`);
    await showCourseMenu(phone, conversationId, ctx);
    return;
  }

  let msg = `📊 *EXAM TRANSCRIPT: ${ctx.courseCode}*\n\n`;
  [...attempts].reverse().forEach((att: any, i: number) => {
    const num = attempts.length - i;
    const d = att.submitted_at ? new Date(att.submitted_at).toLocaleDateString("en-GB") : "Recent";
    const p = att.total_questions > 0 ? Math.round((att.score / att.total_questions) * 100) : 0;
    msg += `*Attempt ${num}* (${d}): ${att.score}/${att.total_questions} (${p}%) ${att.passed ? "✅ PASS" : "❌ FAIL"}\n\n`;
  });

  await sendButtonMessage(phone, msg,
    [makeButton("cm_test", "📝 Retake Exam"), makeButton("cm_menu", "📋 Course Menu")],
    "Transcript Record"
  );
}
