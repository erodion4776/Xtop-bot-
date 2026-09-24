// supabase/functions/whatsapp-webhook/modules/learning.ts
// Phase 4 — Engr. Ero Learning Centre (Dynamic Content Delivery & Practice Checks)

import {
  Contact, Conversation, updateConversation,
  getCourseByCode, getOrCreateStudent, getStudentCourseAccess,
  markLessonComplete, getStudentExamAttempts,
  getSupabaseClient,
} from "../database.ts";
import {
  sendButtonMessage, sendListMessage, sendTextMessage, sendDocumentMessage, sendImageMessage,
  makeButton, makeListRow,
} from "../whatsapp.ts";
import { normalise, isExit } from "../utils.ts";
import { showMainMenu } from "./main-menu.ts";
import { startExamEntry } from "./exams.ts";
import { handleRegistration } from "./attendance.ts";

const supabase = getSupabaseClient();

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

  // 3. Registration flow
  if (["ENTRY", "WAITING_STUDENT_NAME", "WAITING_MATRIC_NUMBER", "WAITING_DEPARTMENT", "WAITING_LEVEL"].includes(state)) {
    await handleRegistration(phone, text, contact, conv);
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
    case "VIEWING_LESSON":
    case "VIEWING_SECTION":
      await processLessonNavigation(phone, text, conv, ctx);
      break;
    case "PRACTICE_QUESTION":
      await processPracticeAnswer(phone, text, conv, ctx);
      break;
    case "LESSON_COMPLETE":
      await processLessonCompleteAction(phone, text, conv, ctx);
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
    `_Examples:_ *ELA301*, *ELA302*, or *ELA401*\n\n` +
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
    `_Examples:_ *ELA301*, *ELA302*, or *ELA401*`
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

  ctx.step = "VIEWING_LESSON";
  ctx.currentLessonId = currentLesson.id;
  ctx.currentLessonOrder = activeOrder;
  ctx.currentSectionIndex = 0;
  ctx.currentPracticeIndex = 0;
  ctx.practiceScore = 0;
  ctx.totalLessons = allLessons.length;
  await saveCtx(conversationId, ctx, "VIEWING_LESSON");

  const sections = await fetchLessonSections(currentLesson.id);
  const mediaList = await fetchLessonMedia(currentLesson.id);

  let message =
    `🎓 *${ctx.courseCode} — LECTURE HALL*\n` +
    `📖 *Lesson ${activeOrder}: ${currentLesson.title}*\n` +
    `⏱️ _Duration: ${currentLesson.duration || "15 mins"} | Lesson ${activeOrder} of ${allLessons.length}_\n\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `${currentLesson.content || "_Lecture notes in progress._"}\n\n` +
    `━━━━━━━━━━━━━━━━`;

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
  if (sections.length > 0) {
    buttons.push(makeButton("lsn_section_next", "📖 Read Sections ➡️"));
  } else {
    buttons.push(makeButton("lsn_practice_start", "✍️ Practice Check"));
  }
  if (!isFirst) buttons.push(makeButton("lsn_prev", "⬅️ Prev Lesson"));
  buttons.push(makeButton("lsn_menu", "📋 Course Menu"));

  await sendButtonMessage(phone, "Select your next action:", buttons, `${ctx.courseCode} Classroom`, `Lesson ${activeOrder}/${allLessons.length}`);
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

  if (n === "lsn_menu" || n.includes("course menu")) {
    await showCourseMenu(phone, conv.id, ctx);
    return;
  }

  if (n === "lsn_prev" || n.includes("prev lesson")) {
    await deliverLesson(phone, conv.id, ctx, Math.max(1, currentOrder - 1));
    return;
  }

  if (
    n === "lsn_section_next" ||
    n.includes("read section") ||
    n.includes("next section") ||
    n === "next" ||
    n === "section"
  ) {
    if (!lessonId) { await showCourseMenu(phone, conv.id, ctx); return; }
    const sections = await fetchLessonSections(lessonId);
    const secIdx = ctx.currentSectionIndex || 0;

    if (secIdx < sections.length) {
      const activeSection = sections[secIdx];
      ctx.currentSectionIndex = secIdx + 1;
      ctx.step = "VIEWING_SECTION";
      await saveCtx(conv.id, ctx, "VIEWING_SECTION");

      let secMsg = `*${activeSection.title}*\n\n${activeSection.content}`;
      await sendTextMessage(phone, secMsg);

      const isLastSec = (secIdx + 1) >= sections.length;
      const nextButtons = [
        makeButton(isLastSec ? "lsn_practice_start" : "lsn_section_next", isLastSec ? "✍️ Start Practice" : "Next Section ➡️"),
        makeButton("lsn_menu", "📋 Menu")
      ];
      await sendButtonMessage(phone, `Section ${secIdx + 1} of ${sections.length} completed.`, nextButtons, "Section Guide");
      return;
    }
  }

  if (
    n === "lsn_practice_start" ||
    n.includes("practice") ||
    n.includes("start practice")
  ) {
    if (!lessonId) { await showCourseMenu(phone, conv.id, ctx); return; }
    const questions = await fetchLessonPracticeQuestions(lessonId);

    if (questions.length === 0) {
      await completeAndAdvanceLesson(phone, conv.id, ctx);
      return;
    }

    ctx.step = "PRACTICE_QUESTION";
    ctx.currentPracticeIndex = 0;
    ctx.practiceScore = 0;
    await saveCtx(conv.id, ctx, "PRACTICE_QUESTION");
    await sendPracticeQuestionPrompt(phone, questions[0], 0, questions.length);
    return;
  }

  await deliverLesson(phone, conv.id, ctx, currentOrder);
}

async function sendPracticeQuestionPrompt(phone: string, q: any, index: number, total: number) {
  let body = `✍️ *Practice Question ${index + 1}/${total}*\n\n${q.question}\n\n`;
  body += `*A)* ${q.option_a}\n`;
  body += `*B)* ${q.option_b}\n`;
  if (q.option_c) body += `*C)* ${q.option_c}\n`;
  if (q.option_d) body += `*D)* ${q.option_d}\n\n`;
  body += `_Reply with the correct letter: *A*, *B*, *C*, or *D*_`;

  await sendTextMessage(phone, body);
}

async function processPracticeAnswer(
  phone: string, text: string, conv: Conversation, ctx: LearningCtx
): Promise<void> {
  const lessonId = ctx.currentLessonId;
  if (!lessonId) { await showCourseMenu(phone, conv.id, ctx); return; }

  const questions = await fetchLessonPracticeQuestions(lessonId);
  const qIdx = ctx.currentPracticeIndex || 0;
  const activeQ = questions[qIdx];

  if (!activeQ) {
    await completeAndAdvanceLesson(phone, conv.id, ctx);
    return;
  }

  const rawLetter = text.trim().toUpperCase().replace(/[^A-D]/g, "");
  const ans = rawLetter.length > 0 ? rawLetter.charAt(0) : text.trim().toUpperCase().charAt(0);
  const isCorrect = ans === activeQ.correct_answer.trim().toUpperCase();

  if (isCorrect) {
    ctx.practiceScore = (ctx.practiceScore || 0) + 1;
    await sendTextMessage(phone, `✅ *Correct!*\n\n${activeQ.explanation || ""}`);
  } else {
    await sendTextMessage(phone, `❌ *Incorrect.*\n*Correct Answer:* Option ${activeQ.correct_answer}\n\n${activeQ.explanation || ""}`);
  }

  const nextIdx = qIdx + 1;
  if (nextIdx < questions.length) {
    ctx.currentPracticeIndex = nextIdx;
    await saveCtx(conv.id, ctx, "PRACTICE_QUESTION");
    await sendPracticeQuestionPrompt(phone, questions[nextIdx], nextIdx, questions.length);
  } else {
    const finalScore = ctx.practiceScore || 0;
    await sendTextMessage(phone, `🎯 *Practice Complete!*\nScore: *${finalScore}/${questions.length}*`);
    await completeAndAdvanceLesson(phone, conv.id, ctx);
  }
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
    await sendTextMessage(phone, `🎉 *Congratulations!* You have completed all *${total}* lessons in *${ctx.courseCode}*. You are now ready to take the Final Exam.`);
    await showCourseMenu(phone, convId, ctx);
    return;
  }

  ctx.currentLessonOrder = nextOrder;
  ctx.step = "LESSON_COMPLETE";
  await saveCtx(convId, ctx, "LESSON_COMPLETE");

  await sendButtonMessage(phone,
    `✅ *Lesson ${currentOrder} Complete!*\n\nReady to start Lesson ${nextOrder}?`,
    [makeButton("lsn_next_go", `Lesson ${nextOrder} ➡️`), makeButton("lsn_menu", "📋 Course Menu")],
    `${ctx.courseCode} Progress`, `${currentOrder}/${total} completed`
  );
}

async function processLessonCompleteAction(
  phone: string, text: string, conv: Conversation, ctx: LearningCtx
): Promise<void> {
  const n = normalise(text);
  if (n === "lsn_next_go" || n.includes("lesson") || n.includes("next")) {
    const nextOrder = ctx.currentLessonOrder || 1;
    await deliverLesson(phone, conv.id, ctx, nextOrder);
    return;
  }
  await showCourseMenu(phone, conv.id, ctx);
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
