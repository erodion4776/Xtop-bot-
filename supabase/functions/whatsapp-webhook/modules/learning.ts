// supabase/functions/whatsapp-webhook/modules/learning.ts

import {
  Contact, Conversation, updateConversation,
  getCourseByCode, getOrCreateStudent, getStudentCourseAccess,
  getCourseLessons, markLessonComplete, getStudentExamAttempts,
} from "../database.ts";
import {
  sendButtonMessage, sendListMessage, sendTextMessage, sendDocumentMessage,
  makeButton, makeListRow,
} from "../whatsapp.ts";
import { normalise, isBack, isExit, isGreeting, extractSelection } from "../utils.ts";
import { showMainMenu } from "./main-menu.ts";
import { startExamEntry } from "./exams.ts";
import { handleRegistration } from "./attendance.ts";

// ═══════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════

export interface LearningCtx {
  step: string;
  courseCode?: string;
  courseId?: string;
  courseName?: string;
  term?: string;
  studentId?: string;
  studentCourseId?: string;
  currentLessonOrder?: number;
  totalLessons?: number;
}

function getCtx(conv: Conversation): LearningCtx {
  return (conv.context_json || {}) as LearningCtx;
}

async function saveCtx(convId: string, ctx: LearningCtx, state?: string): Promise<void> {
  await updateConversation(convId, {
    current_module: "LEARNING",
    ...(state ? { current_state: state } : {}),
    context_json: ctx as unknown as Record<string, unknown>,
  });
}

// ═══════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════

export async function handleLearning(
  phone: string, text: string, contact: Contact, conv: Conversation
): Promise<void> {
  const n = normalise(text);
  const ctx = getCtx(conv);
  const state = conv.current_state;

  // Global interrupts
  if (isGreeting(text) && !["ENTRY", "WAITING_STUDENT_NAME", "WAITING_MATRIC_NUMBER", "WAITING_DEPARTMENT", "WAITING_LEVEL"].includes(state)) {
    await showMainMenu(phone, conv.id);
    return;
  }
  if (isExit(text) || n === "exit course" || n === "exit") {
    await updateConversation(conv.id, { current_module: "MAIN_MENU", current_state: "IDLE", context_json: {} });
    await sendTextMessage(phone, "👋 You have exited the *Engr. Ero Learning Centre*.\n\nType *menu* to return.");
    return;
  }

  // Registration states -> delegate to attendance module
  if (["ENTRY", "WAITING_STUDENT_NAME", "WAITING_MATRIC_NUMBER", "WAITING_DEPARTMENT", "WAITING_LEVEL"].includes(state)) {
    await handleRegistration(phone, text, contact, conv);
    return;
  }

  // Back handling for learning sub-states
  if (isBack(text)) {
    if (["VIEWING_LESSON", "LESSON_COMPLETE", "VIEWING_MATERIALS", "VIEWING_PROGRESS", "VIEWING_RESULTS"].includes(ctx.step)) {
      await showCourseMenu(phone, conv.id, ctx);
      return;
    }
    await showMainMenu(phone, conv.id);
    return;
  }

  switch (state) {
    case "WAITING_COURSE_CODE":
      await processCourseCodeAuth(phone, text, contact, conv);
      break;
    case "COURSE_MENU":
      await processCourseMenuSelection(phone, text, conv, ctx);
      break;
    case "VIEWING_LESSON":
      await processLessonNavigation(phone, text, conv, ctx);
      break;
    case "LESSON_COMPLETE":
      await processLessonCompleteAction(phone, text, conv, ctx);
      break;
    default:
      await handleRegistration(phone, text, contact, conv);
      break;
  }
}

// ═══════════════════════════════════════════════════════
// 1. COURSE CODE AUTHENTICATION
// ═══════════════════════════════════════════════════════

export async function promptCourseCode(phone: string, conversationId: string): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "LEARNING",
    current_state: "WAITING_COURSE_CODE",
    context_json: { step: "WAITING_COURSE_CODE" },
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
  if (!course) {
    await sendTextMessage(phone,
      `❌ *Course Not Found: "${rawCode}"*\n\n` +
      `_Available courses:_ *ELA301*, *ELA302*, *ELA401*\n\nType *menu* to exit.`
    );
    return;
  }

  if (course.status === "BLOCKED") {
    await sendTextMessage(phone,
      `🔒 *Course Unavailable*\n\n*${course.course_code} — ${course.course_name}* is currently blocked.`
    );
    return;
  }

  const student = await getOrCreateStudent(phone, contact.name);
  const enrollment = await getStudentCourseAccess(student.id, course.id, course.status);
  if (!enrollment) {
    await sendTextMessage(phone, "⚠️ Unable to enroll you in this course.");
    return;
  }
  if (enrollment.status === "SUSPENDED") {
    await sendTextMessage(phone, `⚠️ *Access Suspended* for *${course.course_code}*.`);
    return;
  }

  const lessons = await getCourseLessons(course.id);
  const ctx: LearningCtx = {
    step: "COURSE_MENU",
    courseCode: course.course_code, courseId: course.id,
    courseName: course.course_name, term: course.term || "General",
    studentId: student.id, studentCourseId: enrollment.id,
    totalLessons: lessons.length,
    currentLessonOrder: (enrollment.progress?.last_lesson_order || 0) + 1,
  };

  await saveCtx(conv.id, ctx, "COURSE_MENU");
  await showCourseMenu(phone, conv.id, ctx);
}

// ═══════════════════════════════════════════════════════
// 2. EXPORTED COURSE MENU
// ═══════════════════════════════════════════════════════

export async function showCourseMenu(
  phone: string, conversationId: string, ctx: LearningCtx
): Promise<void> {
  await saveCtx(conversationId, { ...ctx, step: "COURSE_MENU" }, "COURSE_MENU");
  await sendListMessage(phone,
    `🎓 *${ctx.courseCode} — ${ctx.courseName?.toUpperCase()}*\n_${ctx.term}_\n\nSelect an option:`,
    "Course Options",
    [
      { title: "Lectures & Studies", rows: [
        makeListRow("cm_lecture", "1️⃣ Lecture / Classroom", "Start or continue"),
        makeListRow("cm_materials", "2️⃣ Course Materials", "Handouts & notes"),
        makeListRow("cm_progress", "3️⃣ My Progress", "Completion %"),
      ]},
      { title: "Assessments & Exit", rows: [
        makeListRow("cm_test", "4️⃣ Take Test / Exam", "Course test"),
        makeListRow("cm_result", "5️⃣ My Results", "View scores"),
        makeListRow("cm_switch", "6️⃣ Switch Course", "Another code"),
        makeListRow("cm_exit", "7️⃣ Exit Course", "Main menu"),
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

  if (n === "cm_lecture" || num === 1) { await deliverLesson(phone, conv.id, ctx, ctx.currentLessonOrder || 1); return; }
  if (n === "cm_materials" || num === 2) { await showCourseMaterials(phone, conv.id, ctx); return; }
  if (n === "cm_progress" || num === 3) { await showStudentProgress(phone, conv.id, ctx); return; }
  if (n === "cm_test" || num === 4) { await startExamEntry(phone, conv.id, ctx); return; }
  if (n === "cm_result" || num === 5) { await showStudentResults(phone, conv.id, ctx); return; }
  if (n === "cm_switch" || num === 6) { await promptCourseCode(phone, conv.id); return; }
  if (n === "cm_exit" || num === 7) {
    await updateConversation(conv.id, { current_module: "MAIN_MENU", current_state: "IDLE", context_json: {} });
    await showMainMenu(phone, conv.id);
    return;
  }
  await sendTextMessage(phone, "⚠️ Please select a valid option (1–7):");
  await showCourseMenu(phone, conv.id, ctx);
}

// ═══════════════════════════════════════════════════════
// 3. LESSON DELIVERY
// ═══════════════════════════════════════════════════════

async function deliverLesson(
  phone: string, conversationId: string, ctx: LearningCtx, lessonOrder: number
): Promise<void> {
  if (!ctx.courseId) { await promptCourseCode(phone, conversationId); return; }
  const lessons = await getCourseLessons(ctx.courseId);
  if (lessons.length === 0) {
    await sendTextMessage(phone, `📚 No lessons uploaded yet for *${ctx.courseCode}*.`);
    await showCourseMenu(phone, conversationId, ctx);
    return;
  }
  const currentLesson = lessons.find((l) => l.lesson_order === lessonOrder) || lessons[0];
  const currentOrder = currentLesson.lesson_order;
  const isFirst = currentOrder <= 1;

  ctx.step = "VIEWING_LESSON";
  ctx.currentLessonOrder = currentOrder;
  ctx.totalLessons = lessons.length;
  await saveCtx(conversationId, ctx, "VIEWING_LESSON");

  let message =
    `🎓 *${ctx.courseCode} — LECTURE HALL*\n📖 *${currentLesson.title}*\n` +
    `⏱️ _Duration: ${currentLesson.duration || "15 mins"} | Lesson ${currentOrder} of ${lessons.length}_\n\n` +
    `━━━━━━━━━━━━━━━━\n\n${currentLesson.content}\n\n━━━━━━━━━━━━━━━━`;

  if (currentLesson.video_url) message += `\n\n🎥 *Video:* ${currentLesson.video_url}`;
  if (currentLesson.pdf_url && currentLesson.pdf_url.startsWith("http")) {
    await sendDocumentMessage(phone, currentLesson.pdf_url, `${ctx.courseCode}_L${currentOrder}.pdf`, currentLesson.title);
  }

  const buttons = [makeButton("lsn_complete", "✅ Complete Lesson")];
  if (!isFirst) buttons.push(makeButton("lsn_prev", "⬅️ Previous"));
  buttons.push(makeButton("lsn_menu", "📋 Course Menu"));

  await sendButtonMessage(phone, message, buttons, `${ctx.courseCode} Classroom`, `Lesson ${currentOrder}/${lessons.length}`);
}

async function processLessonNavigation(
  phone: string, text: string, conv: Conversation, ctx: LearningCtx
): Promise<void> {
  const n = normalise(text);
  const currentOrder = ctx.currentLessonOrder || 1;

  if (n === "lsn_complete" || n.includes("complete") || n.includes("done") || n.includes("next")) {
    if (ctx.studentCourseId && ctx.courseId) {
      const lessons = await getCourseLessons(ctx.courseId);
      const cl = lessons.find((l) => l.lesson_order === currentOrder);
      if (cl) await markLessonComplete(ctx.studentCourseId, cl.id, currentOrder);
    }
    if (currentOrder >= (ctx.totalLessons || 1)) {
      await sendTextMessage(phone, `🎉 *Congratulations!* All *${ctx.totalLessons}* lessons completed in *${ctx.courseCode}*. You are ready for your exam.`);
      await showCourseMenu(phone, conv.id, ctx);
      return;
    }
    ctx.currentLessonOrder = currentOrder + 1;
    ctx.step = "LESSON_COMPLETE";
    await saveCtx(conv.id, ctx, "LESSON_COMPLETE");
    await sendButtonMessage(phone,
      `✅ *Lesson ${currentOrder} Complete!*\n\nReady for the next lesson?`,
      [makeButton("lsn_next_go", "Next Lesson ➡️"), makeButton("lsn_menu", "📋 Course Menu")],
      `${ctx.courseCode} Progress`, `${currentOrder}/${ctx.totalLessons} completed`
    );
    return;
  }
  if (n === "lsn_prev" || n.includes("prev")) { await deliverLesson(phone, conv.id, ctx, Math.max(1, currentOrder - 1)); return; }
  if (n === "lsn_menu" || isBack(text)) { await showCourseMenu(phone, conv.id, ctx); return; }
  const num = extractSelection(text);
  if (num && num >= 1 && num <= (ctx.totalLessons || 10)) { await deliverLesson(phone, conv.id, ctx, num); return; }
  await showCourseMenu(phone, conv.id, ctx);
}

async function processLessonCompleteAction(
  phone: string, text: string, conv: Conversation, ctx: LearningCtx
): Promise<void> {
  const n = normalise(text);
  if (n === "lsn_next_go" || n.includes("next")) { await deliverLesson(phone, conv.id, ctx, ctx.currentLessonOrder || 1); return; }
  if (n === "lsn_menu" || isBack(text)) { await showCourseMenu(phone, conv.id, ctx); return; }
  await showCourseMenu(phone, conv.id, ctx);
}

// ═══════════════════════════════════════════════════════
// 4. MATERIALS / PROGRESS / RESULTS
// ═══════════════════════════════════════════════════════

async function showCourseMaterials(phone: string, conversationId: string, ctx: LearningCtx): Promise<void> {
  if (!ctx.courseId) { await promptCourseCode(phone, conversationId); return; }
  ctx.step = "VIEWING_MATERIALS";
  await saveCtx(conversationId, ctx, "COURSE_MENU");
  const lessons = await getCourseLessons(ctx.courseId);
  const withMats = lessons.filter((l) => l.pdf_url || l.video_url);
  if (withMats.length === 0) {
    await sendTextMessage(phone, `📂 No additional materials for *${ctx.courseCode}* yet.`);
    await showCourseMenu(phone, conversationId, ctx);
    return;
  }
  let txt = `📂 *Course Materials — ${ctx.courseCode}*\n\n`;
  for (const m of withMats) {
    txt += `*${m.title}*\n`;
    if (m.pdf_url) txt += `   📄 PDF attached\n`;
    if (m.video_url) txt += `   🎥 ${m.video_url}\n`;
    txt += `\n`;
  }
  await sendTextMessage(phone, txt);
  for (const m of withMats) {
    if (m.pdf_url && m.pdf_url.startsWith("http")) {
      await sendDocumentMessage(phone, m.pdf_url, `${ctx.courseCode}_${m.title.replace(/\s+/g, "_")}.pdf`, m.title);
    }
  }
  await sendButtonMessage(phone, "📂 Materials sent above.",
    [makeButton("cm_lecture", "📖 Go to Class"), makeButton("cm_menu", "📋 Course Menu")],
    "Materials", "Engr. Ero Learning Centre"
  );
}

async function showStudentProgress(phone: string, conversationId: string, ctx: LearningCtx): Promise<void> {
  if (!ctx.studentId || !ctx.courseId) { await promptCourseCode(phone, conversationId); return; }
  ctx.step = "VIEWING_PROGRESS";
  await saveCtx(conversationId, ctx, "COURSE_MENU");
  const access = await getStudentCourseAccess(ctx.studentId, ctx.courseId);
  const lessons = await getCourseLessons(ctx.courseId);
  const done = access?.progress?.completed_lessons?.length || 0;
  const total = lessons.length || 1;
  const pct = Math.min(100, Math.round((done / total) * 100));
  const bar = `[${"🟩".repeat(Math.round(pct / 10))}${"⬜".repeat(10 - Math.round(pct / 10))}]`;
  await sendButtonMessage(phone,
    `📊 *PROGRESS: ${ctx.courseCode}*\n\n*Completed:* ${done}/${total} (${pct}%)\n${bar}\n\n${pct >= 100 ? "🎉 All done! Take your exam." : "Keep reading."}`,
    [makeButton("cm_lecture", "📖 Continue"), makeButton("cm_test", "📝 Take Test"), makeButton("cm_menu", "📋 Menu")],
    "Progress", "Engr. Ero Learning Centre"
  );
}

async function showStudentResults(phone: string, conversationId: string, ctx: LearningCtx): Promise<void> {
  if (!ctx.studentId || !ctx.courseId) { await promptCourseCode(phone, conversationId); return; }
  ctx.step = "VIEWING_RESULTS";
  await saveCtx(conversationId, ctx, "COURSE_MENU");
  const attempts = await getStudentExamAttempts(ctx.studentId, ctx.courseId);
  if (attempts.length === 0) {
    await sendTextMessage(phone, `📊 No test results yet for *${ctx.courseCode}*. Take a test first.`);
    await showCourseMenu(phone, conversationId, ctx);
    return;
  }
  let msg = `📊 *RESULTS: ${ctx.courseCode}*\n\n`;
  [...attempts].reverse().forEach((att, i) => {
    const num = attempts.length - i;
    const d = att.submitted_at ? new Date(att.submitted_at).toLocaleDateString("en-GB") : "Recent";
    const p = att.total_questions > 0 ? Math.round((att.score / att.total_questions) * 100) : 0;
    msg += `*Attempt ${num}* (${d}): ${att.score}/${att.total_questions} (${p}%) ${att.passed ? "✅" : "❌"}\n\n`;
  });
  await sendButtonMessage(phone, msg,
    [makeButton("cm_test", "📝 Retake"), makeButton("cm_menu", "📋 Menu")],
    "Transcript", "Engr. Ero Learning Centre"
  );
}
