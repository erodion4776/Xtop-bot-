// supabase/functions/whatsapp-webhook/modules/learning.ts
// Phase 4 — Engr. Ero Learning Centre Academic Portal
// 100% Deterministic State Machine. NO AI API.
//
// Fixes applied:
// #1 Lesson completion only on explicit "Complete" action
// #2 Atomic progress updates (fetch-then-merge in DB layer)
// #3 Course status checked before auto-enrollment
// #4 Explicit "✅ Complete Lesson" button added
// #5 All states (VIEWING_LESSON, VIEWING_MATERIALS, etc.) set consistently
// #6 PDFs delivered via sendDocumentMessage, not raw URLs
// #7 Exam attempts numbered chronologically (oldest = Attempt 1)

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

// ═══════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════

interface LearningCtx {
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

  // Global interrupts
  if (isGreeting(text)) { await showMainMenu(phone, conv.id); return; }
  if (isExit(text) || n === "exit course" || n === "exit") {
    await updateConversation(conv.id, { current_module: "MAIN_MENU", current_state: "IDLE", context_json: {} });
    await sendTextMessage(phone, "👋 You have exited the *Engr. Ero Learning Centre*.\n\nType *menu* to return.");
    return;
  }

  // FIX #5: Consistent back handling for all sub-states
  if (isBack(text)) {
    if (["VIEWING_LESSON", "LESSON_COMPLETE", "VIEWING_MATERIALS", "VIEWING_PROGRESS", "VIEWING_RESULTS"].includes(ctx.step)) {
      await showCourseMenu(phone, conv.id, ctx);
      return;
    }
    await showMainMenu(phone, conv.id);
    return;
  }

  switch (conv.current_state) {
    case "ENTRY":
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
      await promptCourseCode(phone, conv.id);
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
    `Welcome to the academic course portal.\n\n` +
    `Please enter your *Course Code* to continue.\n\n` +
    `_Examples:_ *ELA301*, *ELA302*, or *ELA401*\n\n` +
    `_(Type your course code below)_`
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
      `Please check your course code and try again.\n` +
      `_Available courses:_ *ELA301*, *ELA302*, *ELA401*\n\n` +
      `Type *menu* to exit.`
    );
    return;
  }

  // Access Control: BLOCKED courses
  if (course.status === "BLOCKED") {
    await sendTextMessage(phone,
      `🔒 *Course Unavailable*\n\n` +
      `*${course.course_code} — ${course.course_name}* is currently blocked.\n\n` +
      `Please contact the department or check back later.`
    );
    return;
  }

  // Student Authentication
  const student = await getOrCreateStudent(phone, contact.name);

  // FIX #3: Pass course status to prevent auto-enrollment in BLOCKED courses
  const enrollment = await getStudentCourseAccess(student.id, course.id, course.status);

  if (!enrollment) {
    await sendTextMessage(phone, "⚠️ Unable to enroll you in this course. It may be restricted.");
    return;
  }

  if (enrollment.status === "SUSPENDED") {
    await sendTextMessage(phone,
      `⚠️ *Access Suspended*\n\n` +
      `Your access to *${course.course_code}* has been suspended.\n\n` +
      `Please contact the administrator for clearance.`
    );
    return;
  }

  const lessons = await getCourseLessons(course.id);

  const ctx: LearningCtx = {
    step: "COURSE_MENU",
    courseCode: course.course_code,
    courseId: course.id,
    courseName: course.course_name,
    term: course.term || "General",
    studentId: student.id,
    studentCourseId: enrollment.id,
    totalLessons: lessons.length,
    currentLessonOrder: (enrollment.progress?.last_lesson_order || 0) + 1,
  };

  await saveCtx(conv.id, ctx, "COURSE_MENU");
  await showCourseMenu(phone, conv.id, ctx);
}

// ═══════════════════════════════════════════════════════
// 2. COURSE MENU
// ═══════════════════════════════════════════════════════

async function showCourseMenu(phone: string, conversationId: string, ctx: LearningCtx): Promise<void> {
  await saveCtx(conversationId, { ...ctx, step: "COURSE_MENU" }, "COURSE_MENU");

  const body =
    `🎓 *${ctx.courseCode} — ${ctx.courseName?.toUpperCase()}*\n` +
    `_${ctx.term}_\n\n` +
    `Welcome, scholar. Select an option:`;

  await sendListMessage(phone, body, "Course Options", [
    {
      title: "Lectures & Studies",
      rows: [
        makeListRow("cm_lecture", "1️⃣ Lecture / Classroom", "Start or continue reading"),
        makeListRow("cm_materials", "2️⃣ Course Materials", "Handouts & notes"),
        makeListRow("cm_progress", "3️⃣ My Progress", "Completion percentage"),
      ],
    },
    {
      title: "Assessments & Exit",
      rows: [
        makeListRow("cm_test", "4️⃣ Take Test / Exam", "Course test & quiz"),
        makeListRow("cm_result", "5️⃣ My Results", "View test scores"),
        makeListRow("cm_switch", "6️⃣ Switch Course", "Enter another code"),
        makeListRow("cm_exit", "7️⃣ Exit Course", "Return to main menu"),
      ],
    },
  ], ctx.courseCode || "Learning Centre", "Engr. Ero Learning Centre");
}

async function processCourseMenuSelection(
  phone: string, text: string, conv: Conversation, ctx: LearningCtx
): Promise<void> {
  const n = normalise(text);
  const num = extractSelection(text);

  if (n === "cm_lecture" || num === 1 || n.includes("lecture") || n.includes("start")) {
    await deliverLesson(phone, conv.id, ctx, ctx.currentLessonOrder || 1);
    return;
  }
  if (n === "cm_materials" || num === 2 || n.includes("material")) {
    await showCourseMaterials(phone, conv.id, ctx);
    return;
  }
  if (n === "cm_progress" || num === 3 || n.includes("progress")) {
    await showStudentProgress(phone, conv.id, ctx);
    return;
  }
  if (n === "cm_test" || num === 4 || n.includes("test") || n.includes("exam")) {
    await enterCourseExam(phone, conv.id, ctx);
    return;
  }
  if (n === "cm_result" || num === 5 || n.includes("result") || n.includes("score")) {
    await showStudentResults(phone, conv.id, ctx);
    return;
  }
  if (n === "cm_switch" || num === 6 || n.includes("switch")) {
    await promptCourseCode(phone, conv.id);
    return;
  }
  if (n === "cm_exit" || num === 7 || n.includes("exit")) {
    await updateConversation(conv.id, { current_module: "MAIN_MENU", current_state: "IDLE", context_json: {} });
    await showMainMenu(phone, conv.id);
    return;
  }

  await sendTextMessage(phone, "⚠️ Please select a valid option from the course menu (1–7):");
  await showCourseMenu(phone, conv.id, ctx);
}

// ═══════════════════════════════════════════════════════
// 3. LESSON DELIVERY (FIX #1 & #4)
// ═══════════════════════════════════════════════════════

async function deliverLesson(
  phone: string, conversationId: string, ctx: LearningCtx, lessonOrder: number
): Promise<void> {
  if (!ctx.courseId) { await promptCourseCode(phone, conversationId); return; }

  const lessons = await getCourseLessons(ctx.courseId);

  if (lessons.length === 0) {
    await sendTextMessage(phone,
      `📚 *No Lessons Uploaded Yet*\n\n` +
      `Lessons for *${ctx.courseCode}* are being prepared.`
    );
    await showCourseMenu(phone, conversationId, ctx);
    return;
  }

  const currentLesson = lessons.find((l) => l.lesson_order === lessonOrder) || lessons[0];
  const currentOrder = currentLesson.lesson_order;
  const isFirst = currentOrder <= 1;
  const isLast = currentOrder >= lessons.length;

  // FIX #1: Do NOT mark complete here. Only deliver content.
  // Completion happens when student presses "✅ Complete Lesson".

  ctx.step = "VIEWING_LESSON";
  ctx.currentLessonOrder = currentOrder;
  ctx.totalLessons = lessons.length;
  await saveCtx(conversationId, ctx, "VIEWING_LESSON");

  let message =
    `🎓 *${ctx.courseCode} — LECTURE HALL*\n` +
    `📖 *${currentLesson.title}*\n` +
    `⏱️ _Duration: ${currentLesson.duration || "15 mins"} | Lesson ${currentOrder} of ${lessons.length}_\n\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `${currentLesson.content}\n\n` +
    `━━━━━━━━━━━━━━━━`;

  if (currentLesson.video_url) {
    message += `\n\n🎥 *Video Lecture:* ${currentLesson.video_url}`;
  }

  // FIX #6: Deliver PDF via document message, not raw URL
  if (currentLesson.pdf_url && currentLesson.pdf_url.startsWith("http")) {
    await sendDocumentMessage(
      phone,
      currentLesson.pdf_url,
      `${ctx.courseCode}_Lesson_${currentOrder}.pdf`,
      currentLesson.title
    );
  }

  // FIX #4: Explicit "Complete Lesson" button
  const buttons = [makeButton("lsn_complete", "✅ Complete Lesson")];
  if (!isFirst) buttons.push(makeButton("lsn_prev", "⬅️ Previous"));
  buttons.push(makeButton("lsn_menu", "📋 Course Menu"));

  await sendButtonMessage(phone, message, buttons,
    `${ctx.courseCode} Classroom`,
    `Lesson ${currentOrder}/${lessons.length} — Read then mark complete`
  );
}

// ═══════════════════════════════════════════════════════
// 4. LESSON COMPLETION ACTION (FIX #1 & #4)
// ═══════════════════════════════════════════════════════

async function processLessonNavigation(
  phone: string, text: string, conv: Conversation, ctx: LearningCtx
): Promise<void> {
  const n = normalise(text);
  const currentOrder = ctx.currentLessonOrder || 1;

  // FIX #4: Student explicitly marks lesson as complete
  if (n === "lsn_complete" || n.includes("complete") || n.includes("done") || n.includes("next")) {
    // Now mark the lesson complete in the database
    if (ctx.studentCourseId && ctx.courseId) {
      const lessons = await getCourseLessons(ctx.courseId);
      const currentLesson = lessons.find((l) => l.lesson_order === currentOrder);
      if (currentLesson) {
        // FIX #2: markLessonComplete now fetches existing progress atomically
        await markLessonComplete(ctx.studentCourseId, currentLesson.id, currentOrder);
      }
    }

    const isLast = currentOrder >= (ctx.totalLessons || 1);

    if (isLast) {
      // All lessons done
      await sendTextMessage(phone,
        `🎉 *Congratulations!*\n\n` +
        `You have completed all *${ctx.totalLessons}* lessons in *${ctx.courseCode}*.\n\n` +
        `You are now ready to take your examination.`
      );
      await showCourseMenu(phone, conv.id, ctx);
      return;
    }

    // Move to next lesson
    ctx.currentLessonOrder = currentOrder + 1;
    ctx.step = "LESSON_COMPLETE";
    await saveCtx(conv.id, ctx, "LESSON_COMPLETE");

    await sendButtonMessage(phone,
      `✅ *Lesson ${currentOrder} Complete!*\n\n` +
      `Progress saved. Ready for the next lesson?`,
      [
        makeButton("lsn_next_go", "Next Lesson ➡️"),
        makeButton("lsn_menu", "📋 Course Menu"),
      ],
      `${ctx.courseCode} Progress`,
      `${currentOrder}/${ctx.totalLessons} lessons completed`
    );
    return;
  }

  if (n === "lsn_prev" || n.includes("prev") || n.includes("previous")) {
    await deliverLesson(phone, conv.id, ctx, Math.max(1, currentOrder - 1));
    return;
  }

  if (n === "lsn_menu" || n.includes("menu") || isBack(text)) {
    await showCourseMenu(phone, conv.id, ctx);
    return;
  }

  const num = extractSelection(text);
  if (num && num >= 1 && num <= (ctx.totalLessons || 10)) {
    await deliverLesson(phone, conv.id, ctx, num);
    return;
  }

  await showCourseMenu(phone, conv.id, ctx);
}

async function processLessonCompleteAction(
  phone: string, text: string, conv: Conversation, ctx: LearningCtx
): Promise<void> {
  const n = normalise(text);

  if (n === "lsn_next_go" || n.includes("next")) {
    await deliverLesson(phone, conv.id, ctx, (ctx.currentLessonOrder || 1));
    return;
  }

  if (n === "lsn_menu" || n.includes("menu") || isBack(text)) {
    await showCourseMenu(phone, conv.id, ctx);
    return;
  }

  await showCourseMenu(phone, conv.id, ctx);
}

// ═══════════════════════════════════════════════════════
// 5. COURSE MATERIALS (FIX #5 & #6)
// ═══════════════════════════════════════════════════════

async function showCourseMaterials(
  phone: string, conversationId: string, ctx: LearningCtx
): Promise<void> {
  if (!ctx.courseId) { await promptCourseCode(phone, conversationId); return; }

  // FIX #5: Set state consistently
  ctx.step = "VIEWING_MATERIALS";
  await saveCtx(conversationId, ctx, "COURSE_MENU");

  const lessons = await getCourseLessons(ctx.courseId);
  const withMaterials = lessons.filter((l) => l.pdf_url || l.video_url);

  if (withMaterials.length === 0) {
    await sendTextMessage(phone,
      `📂 *Course Materials: ${ctx.courseCode}*\n\n` +
      `No additional PDF handouts or video links have been uploaded yet.\n\n` +
      `All core lecture texts are available in the Classroom.`
    );
    await showCourseMenu(phone, conversationId, ctx);
    return;
  }

  // FIX #6: Deliver PDFs directly, show clean list for videos
  let listText = `📂 *Course Materials — ${ctx.courseCode}*\n\n`;
  let pdfCount = 0;

  for (const m of withMaterials) {
    listText += `*${m.title}*\n`;
    if (m.pdf_url && m.pdf_url.startsWith("http")) {
      pdfCount++;
      listText += `   📄 PDF attached below\n`;
    }
    if (m.video_url) {
      listText += `   🎥 Video: ${m.video_url}\n`;
    }
    listText += `\n`;
  }

  await sendTextMessage(phone, listText);

  // Send all PDFs as document attachments
  for (const m of withMaterials) {
    if (m.pdf_url && m.pdf_url.startsWith("http")) {
      await sendDocumentMessage(
        phone, m.pdf_url,
        `${ctx.courseCode}_${m.title.replace(/\s+/g, "_")}.pdf`,
        m.title
      );
    }
  }

  await sendButtonMessage(phone,
    `📂 *${pdfCount} document(s) sent above.*\n\nWhat would you like to do next?`,
    [
      makeButton("cm_lecture", "📖 Go to Class"),
      makeButton("cm_menu", "📋 Course Menu"),
    ],
    "Materials Delivered", "Engr. Ero Learning Centre"
  );
}

// ═══════════════════════════════════════════════════════
// 6. PROGRESS TRACKING (FIX #5)
// ═══════════════════════════════════════════════════════

async function showStudentProgress(
  phone: string, conversationId: string, ctx: LearningCtx
): Promise<void> {
  if (!ctx.studentId || !ctx.courseId) { await promptCourseCode(phone, conversationId); return; }

  // FIX #5: Set state consistently
  ctx.step = "VIEWING_PROGRESS";
  await saveCtx(conversationId, ctx, "COURSE_MENU");

  const access = await getStudentCourseAccess(ctx.studentId, ctx.courseId);
  const lessons = await getCourseLessons(ctx.courseId);

  const completedCount = access?.progress?.completed_lessons?.length || 0;
  const totalCount = lessons.length || 1;
  const percentage = Math.min(100, Math.round((completedCount / totalCount) * 100));
  const progressBar = makeProgressBar(percentage);

  const msg =
    `📊 *ACADEMIC PROGRESS REPORT*\n\n` +
    `*Course:* ${ctx.courseCode} — ${ctx.courseName}\n` +
    `*Status:* ${access?.status || "ACTIVE"}\n\n` +
    `*Completed:* ${completedCount} of ${totalCount} Lessons\n` +
    `*Progress:* ${percentage}%\n` +
    `${progressBar}\n\n` +
    (percentage >= 100
      ? `🎉 *Congratulations!* All lectures completed. You are ready for your exam!`
      : `Continue reading to complete your syllabus.`);

  await sendButtonMessage(phone, msg,
    [
      makeButton("cm_lecture", "📖 Continue Lecture"),
      makeButton("cm_test", "📝 Take Test"),
      makeButton("cm_menu", "📋 Course Menu"),
    ],
    "Academic Progress", "Engr. Ero Learning Centre"
  );
}

function makeProgressBar(percent: number): string {
  const filled = Math.round((percent / 100) * 10);
  const empty = 10 - filled;
  return `[${"🟩".repeat(filled)}${"⬜".repeat(empty)}]`;
}

// ═══════════════════════════════════════════════════════
// 7. EXAM ENTRY & RESULTS (FIX #5 & #7)
// ═══════════════════════════════════════════════════════

async function enterCourseExam(
  phone: string, conversationId: string, ctx: LearningCtx
): Promise<void> {
  const { startExamEntry } = await import("./exams.ts");
  await startExamEntry(phone, conversationId, ctx);
}

async function showStudentResults(
  phone: string, conversationId: string, ctx: LearningCtx
): Promise<void> {
  if (!ctx.studentId || !ctx.courseId) { await promptCourseCode(phone, conversationId); return; }

  // FIX #5: Set state consistently
  ctx.step = "VIEWING_RESULTS";
  await saveCtx(conversationId, ctx, "COURSE_MENU");

  // FIX #7: Query now returns oldest first, so index + 1 = correct attempt number
  const attempts = await getStudentExamAttempts(ctx.studentId, ctx.courseId);

  if (attempts.length === 0) {
    await sendTextMessage(phone,
      `📊 *My Results — ${ctx.courseCode}*\n\n` +
      `You have not taken any tests yet.\n\n` +
      `Select *Take Test* from the course menu when ready.`
    );
    await showCourseMenu(phone, conversationId, ctx);
    return;
  }

  let resultMsg = `📊 *EXAMINATION RESULTS: ${ctx.courseCode}*\n\n`;

  // FIX #7: Show newest first for display, but number chronologically
  const reversed = [...attempts].reverse();
  reversed.forEach((att, displayIdx) => {
    const attemptNum = attempts.length - displayIdx; // chronological number
    const dateStr = att.submitted_at ? new Date(att.submitted_at).toLocaleDateString("en-GB") : "Recent";
    const statusIcon = att.passed ? "✅ PASSED" : "❌ FAILED";
    const pct = att.total_questions > 0 ? Math.round((att.score / att.total_questions) * 100) : 0;
    resultMsg += `*Attempt ${attemptNum}* (${dateStr}):\n`;
    resultMsg += `  Score: *${att.score}/${att.total_questions}* (${pct}%)\n`;
    resultMsg += `  Grade: *${statusIcon}*\n\n`;
  });

  await sendButtonMessage(phone, resultMsg,
    [
      makeButton("cm_test", "📝 Retake Test"),
      makeButton("cm_menu", "📋 Course Menu"),
    ],
    "Academic Transcript", "Engr. Ero Learning Centre"
  );
}
