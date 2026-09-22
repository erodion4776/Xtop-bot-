// supabase/functions/whatsapp-webhook/modules/exams.ts
// Phase 5 & 6 — Full Computer Based Test (CBT) Examination Engine
// 100% Deterministic State Machine. NO AI API. Server-side Grading.

import {
  Contact, Conversation, updateConversation,
  getCourseQuestions, createExamAttempt, submitExamAttempt, getExamAttempt, getCourseConfig,
  CourseQuestion, getSupabaseClient, safeErrorLog, Course, ExamAttempt,
} from "../database.ts";
import {
  sendButtonMessage, sendListMessage, sendTextMessage,
  makeButton, makeListRow,
} from "../whatsapp.ts";
import { normalise, isBack, extractSelection } from "../utils.ts";
import { showCourseMenu } from "./learning.ts";

// ═══════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════

export interface ExamConfig {
  question_count: number;
  pass_mark_percent: number;
  randomize_questions: boolean;
  randomize_options: boolean;
  show_answers: boolean;
  allow_retake: boolean;
  time_limit_minutes: number | null;
}

export interface ExamCtx {
  step: "EXAM_ENTRY" | "EXAM_QUESTION" | "EXAM_CONFIRM" | "EXAM_RESULT" | "EXAM_REVIEW";
  courseId: string;
  courseCode: string;
  courseName: string;
  term?: string;
  studentId: string;
  studentCourseId: string;
  examAttemptId?: string;
  shuffledIds?: string[];
  currentIndex?: number;
  answers?: Record<string, string>; // questionId -> "A" | "B" | "C" | "D"
  reviewIndex?: number;
  examConfig?: ExamConfig;
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function getCtx(conv: Conversation): ExamCtx {
  return (conv.context_json || {}) as ExamCtx;
}

// Enforces current_module = "EXAMS" on every state update
async function saveCtx(convId: string, ctx: ExamCtx, state: string): Promise<void> {
  await updateConversation(convId, {
    current_module: "EXAMS",
    current_state: state,
    context_json: ctx as unknown as Record<string, unknown>,
  });
}

/**
 * Fetches course exam configuration from Supabase with safe defaults.
 */
async function getExamConfig(courseId: string): Promise<ExamConfig> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("course_exam_config")
    .select("*")
    .eq("course_id", courseId)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      safeErrorLog("getExamConfig", error);
    }
    return {
      question_count: 10,
      pass_mark_percent: 50,
      randomize_questions: true,
      randomize_options: false,
      show_answers: true,
      allow_retake: true,
      time_limit_minutes: null,
    };
  }

  return {
    question_count: Number(data.question_count ?? 10),
    pass_mark_percent: Number(data.pass_mark_percent ?? 50),
    randomize_questions: !!data.randomize_questions,
    randomize_options: !!data.randomize_options,
    show_answers: !!data.show_answers,
    allow_retake: !!data.allow_retake,
    time_limit_minutes: data.time_limit_minutes ? Number(data.time_limit_minutes) : null,
  };
}

// ═══════════════════════════════════════════════════════
// EXAM INBOUND DISPATCHER
// ═══════════════════════════════════════════════════════

export async function handleExams(
  phone: string, text: string, contact: Contact, conv: Conversation
): Promise<void> {
  const n = normalise(text);
  const ctx = getCtx(conv);
  ctx.learningUnlocked = true;

  if (isBack(text) && ctx.step !== "EXAM_QUESTION") {
    await exitToCourseMenu(phone, conv, ctx);
    return;
  }

  switch (conv.current_state) {
    case "EXAM_ENTRY":
      await processExamEntry(phone, text, contact, conv, ctx);
      break;

    case "EXAM_QUESTION":
      await processAnswerSelection(phone, text, contact, conv, ctx);
      break;

    case "EXAM_CONFIRM":
      await processExamSubmission(phone, text, contact, conv, ctx);
      break;

    case "EXAM_RESULT":
      await processResultNavigation(phone, text, contact, conv, ctx);
      break;

    case "EXAM_REVIEW":
      await processReviewNavigation(phone, text, contact, conv, ctx);
      break;

    default:
      await startExamEntry(phone, conv.id, ctx);
      break;
  }
}

// ═══════════════════════════════════════════════════════
// 1. EXAM ENTRY
// ═══════════════════════════════════════════════════════

export async function startExamEntry(
  phone: string, conversationId: string, ctx: any
): Promise<void> {
  const eCtx: ExamCtx = {
    step: "EXAM_ENTRY",
    courseId: ctx.courseId,
    courseCode: ctx.courseCode,
    courseName: ctx.courseName,
    term: ctx.term,
    studentId: ctx.studentId,
    studentCourseId: ctx.studentCourseId,
  };

  await saveCtx(conversationId, eCtx, "EXAM_ENTRY");

  const prompt =
    `📝 *EXAMINATION PORTAL: ${eCtx.courseCode}*\n\n` +
    `*Course:* ${eCtx.courseName}\n` +
    `*Term:* ${eCtx.term || "Semester"}\n\n` +
    `📌 *Instructions:*\n` +
    `• Complete all lessons before starting.\n` +
    `• Grading is calculated server-side.\n` +
    `• Options A-D are chosen via a selectable menu.\n` +
    `• Double submissions are prevented.\n\n` +
    `Are you ready to begin?`;

  await sendButtonMessage(
    phone,
    prompt,
    [
      makeButton("exam_begin", "🚀 Start Test"),
      makeButton("exam_cancel", "🔙 Back to Course"),
    ],
    "Computer Based Test (CBT)",
    "Engr. Ero Learning Centre"
  );
}

async function processExamEntry(
  phone: string, text: string, _contact: Contact, conv: Conversation, ctx: ExamCtx
): Promise<void> {
  const n = normalise(text);

  if (n === "exam_cancel" || isBack(text)) {
    await exitToCourseMenu(phone, conv, ctx);
    return;
  }

  if (n === "exam_begin" || n.includes("start")) {
    const config = await getExamConfig(ctx.courseId);
    const allQuestions = await getCourseQuestions(ctx.courseId);

    if (allQuestions.length === 0) {
      await sendTextMessage(
        phone,
        `⚠️ *No Questions Available*\n\n` +
        `There are currently no active questions for *${ctx.courseCode}* in the exam bank.`
      );
      await exitToCourseMenu(phone, conv, ctx);
      return;
    }

    let selectedQuestions = [...allQuestions];

    // Handle randomized question order
    if (config.randomize_questions) {
      selectedQuestions.sort(() => Math.random() - 0.5);
    }

    // Enforce configured question limit
    if (config.question_count < selectedQuestions.length) {
      selectedQuestions = selectedQuestions.slice(0, config.question_count);
    }

    const attempt = await createExamAttempt(ctx.studentId, ctx.courseId, selectedQuestions.length);
    if (!attempt) {
      await sendTextMessage(phone, "⚠️ Failed to initialize exam session. Please try again.");
      await exitToCourseMenu(phone, conv, ctx);
      return;
    }

    const shuffledIds = selectedQuestions.map((q) => q.id);

    ctx.step = "EXAM_QUESTION";
    ctx.examAttemptId = attempt.id;
    ctx.shuffledIds = shuffledIds;
    ctx.currentIndex = 0;
    ctx.answers = {};
    ctx.learningUnlocked = true;
    ctx.examConfig = config;

    await saveCtx(conv.id, ctx, "EXAM_QUESTION");
    await deliverQuestion(phone, conv.id, ctx);
  } else {
    await sendTextMessage(phone, "Please tap *Start Test* or *Back to Course* to proceed.");
  }
}

// ═══════════════════════════════════════════════════════
// 2. QUESTION DELIVERY & SELECTION
// ═══════════════════════════════════════════════════════

async function deliverQuestion(phone: string, convId: string, ctx: ExamCtx): Promise<void> {
  const questions = await getCourseQuestions(ctx.courseId);
  const qId = ctx.shuffledIds![ctx.currentIndex || 0];
  const q = questions.find((item) => item.id === qId);

  if (!q) {
    await sendTextMessage(phone, "⚠️ Error loading question. Aborting.");
    await exitToCourseMenu(phone, { id: convId } as Conversation, ctx);
    return;
  }

  const qNum = (ctx.currentIndex || 0) + 1;
  const total = ctx.shuffledIds!.length;

  const body =
    `📝 *QUESTION ${qNum} of ${total}*\n\n` +
    `${q.question}\n\n` +
    `🅰️ ${q.option_a}\n` +
    `饰 ${q.option_b}\n` +
    `🆃 ${q.option_c}\n` +
    `🅳 ${q.option_d}\n\n` +
    `_Select your answer using the menu below:_`;

  await sendListMessage(
    phone,
    body,
    "Select Answer",
    [
      {
        title: "Options",
        rows: [
          makeListRow("ans_a", "Option A", q.option_a.substring(0, 50)),
          makeListRow("ans_b", "Option B", q.option_b.substring(0, 50)),
          makeListRow("ans_c", "Option C", q.option_c.substring(0, 50)),
          makeListRow("ans_d", "Option D", q.option_d.substring(0, 50)),
        ],
      },
    ],
    `Question ${qNum}/${total}`,
    `Subject: ${ctx.courseCode}`
  );
}

async function processAnswerSelection(
  phone: string, text: string, _contact: Contact, conv: Conversation, ctx: ExamCtx
): Promise<void> {
  const idx = ctx.currentIndex || 0;
  const qId = ctx.shuffledIds![idx];

  const resolved = resolveAnswerOption(text);

  if (!resolved) {
    await sendTextMessage(phone, "⚠️ Invalid input. Please select Option A, B, C, or D using the menu.");
    await deliverQuestion(phone, conv.id, ctx);
    return;
  }

  ctx.answers![qId] = resolved;
  const nextIndex = idx + 1;

  if (nextIndex < ctx.shuffledIds!.length) {
    ctx.currentIndex = nextIndex;
    await saveCtx(conv.id, ctx, "EXAM_QUESTION");
    await deliverQuestion(phone, conv.id, ctx);
  } else {
    ctx.step = "EXAM_CONFIRM";
    await saveCtx(conv.id, ctx, "EXAM_CONFIRM");

    await sendButtonMessage(
      phone,
      `📝 *EXAM COMPLETE*\n\n` +
      `You have answered all *${ctx.shuffledIds!.length}* questions.\n\n` +
      `Are you ready to submit your exam for grading?`,
      [
        makeButton("exam_submit", "✅ Submit Exam"),
        makeButton("exam_cancel", "🔄 Cancel & Exit"),
      ],
      "Submit Assessment",
      "No corrections allowed after submission"
    );
  }
}

function resolveAnswerOption(text: string): "A" | "B" | "C" | "D" | null {
  const n = normalise(text);
  if (n === "ans_a" || n === "a" || n === "1") return "A";
  if (n === "ans_b" || n === "b" || n === "2") return "B";
  if (n === "ans_c" || n === "c" || n === "3") return "C";
  if (n === "ans_d" || n === "d" || n === "4") return "D";

  const num = extractSelection(text);
  if (num === 1) return "A";
  if (num === 2) return "B";
  if (num === 3) return "C";
  if (num === 4) return "D";

  return null;
}

// ═══════════════════════════════════════════════════════
// 3. SERVER-SIDE GRADING & SUBMISSION
// ═══════════════════════════════════════════════════════

async function processExamSubmission(
  phone: string, text: string, _contact: Contact, conv: Conversation, ctx: ExamCtx
): Promise<void> {
  const n = normalise(text);

  if (n === "exam_cancel" || n.includes("cancel")) {
    await exitToCourseMenu(phone, conv, ctx);
    return;
  }

  if (n === "exam_submit" || n.includes("submit")) {
    const questions = await getCourseQuestions(ctx.courseId);
    let score = 0;
    const answersJson: Array<any> = [];

    ctx.shuffledIds!.forEach((qId) => {
      const q = questions.find((item) => item.id === qId);
      if (q) {
        const studentAns = ctx.answers![qId] || "UNANSWERED";
        const isCorrect = studentAns === q.correct_answer;
        if (isCorrect) score++;

        answersJson.push({
          question_id: qId,
          selected_option: studentAns,
          correct_option: q.correct_answer,
          is_correct: isCorrect,
        });
      }
    });

    // Handle pass mark validation dynamically using config percent
    const passMarkPercent = ctx.examConfig?.pass_mark_percent || 50;
    const passRatio = passMarkPercent / 100;
    const passed = (score / ctx.shuffledIds!.length) >= passRatio;

    if (ctx.examAttemptId) {
      await submitExamAttempt(ctx.examAttemptId, score, passed, answersJson);
    }

    ctx.step = "EXAM_RESULT";
    await saveCtx(conv.id, ctx, "EXAM_RESULT");

    const pct = Math.round((score / ctx.shuffledIds!.length) * 100);
    const resultMsg =
      `📊 *EXAMINATION RESULTS: ${ctx.courseCode}*\n\n` +
      `*Course:* ${ctx.courseName}\n` +
      `*Score:* *${score}/${ctx.shuffledIds!.length}* (${pct}%)\n` +
      `*Grade:* ${passed ? "✅ PASSED" : "❌ FAILED"}\n\n` +
      `The results have been recorded on your academic transcript.\n\n` +
      `_What would you like to do next?_`;

    const config = ctx.examConfig || await getExamConfig(ctx.courseId);
    const buttons = [];

    if (config.show_answers) {
      buttons.push(makeButton("exam_review", "🔍 Review Questions"));
    }
    if (config.allow_retake) {
      buttons.push(makeButton("exam_retake", "🔄 Retake Exam"));
    }
    buttons.push(makeButton("exam_menu", "📋 Course Menu"));

    await sendButtonMessage(
      phone,
      resultMsg,
      buttons,
      "Official CBT Transcript",
      "Engr. Ero Learning Centre"
    );
  } else {
    await sendTextMessage(phone, "Please select *Submit Exam* or *Cancel & Exit*.");
  }
}

// ═══════════════════════════════════════════════════════
// 4. RESULTS NAVIGATION
// ═══════════════════════════════════════════════════════

async function processResultNavigation(
  phone: string, text: string, _contact: Contact, conv: Conversation, ctx: ExamCtx
): Promise<void> {
  const n = normalise(text);

  if (n === "exam_menu" || n.includes("menu")) {
    await exitToCourseMenu(phone, conv, ctx);
    return;
  }

  if (n === "exam_retake" || n.includes("retake")) {
    const config = ctx.examConfig || await getExamConfig(ctx.courseId);
    if (!config.allow_retake) {
      await sendTextMessage(phone, "🔒 Retakes are currently disabled for this exam.");
      await exitToCourseMenu(phone, conv, ctx);
      return;
    }

    ctx.step = "EXAM_ENTRY";
    await saveCtx(conv.id, ctx, "EXAM_ENTRY");
    await startExamEntry(phone, conv.id, ctx);
    return;
  }

  if (n === "exam_review" || n.includes("review")) {
    const config = ctx.examConfig || await getExamConfig(ctx.courseId);

    if (!config.show_answers) {
      await sendTextMessage(phone, "🔒 Answer review is currently unavailable for this course.");
      await exitToCourseMenu(phone, conv, ctx);
      return;
    }

    ctx.step = "EXAM_REVIEW";
    ctx.reviewIndex = 0;
    await saveCtx(conv.id, ctx, "EXAM_REVIEW");
    await deliverReviewQuestion(phone, conv.id, ctx);
    return;
  }

  await exitToCourseMenu(phone, conv, ctx);
}

// ═══════════════════════════════════════════════════════
// 5. DETERMINISTIC QUESTION-BY-QUESTION REVIEW
// ═══════════════════════════════════════════════════════

async function deliverReviewQuestion(phone: string, convId: string, ctx: ExamCtx): Promise<void> {
  const attempt = await getExamAttempt(ctx.examAttemptId || "");
  const questions = await getCourseQuestions(ctx.courseId);

  if (!attempt || !attempt.answers_json || attempt.answers_json.length === 0) {
    await sendTextMessage(phone, "⚠️ Unable to load review logs.");
    await exitToCourseMenu(phone, { id: convId } as Conversation, ctx);
    return;
  }

  const idx = ctx.reviewIndex || 0;
  const auditItem = attempt.answers_json[idx];
  const q = questions.find((item) => item.id === auditItem.question_id);

  if (!q) {
    await sendTextMessage(phone, "⚠️ Error displaying review step.");
    await exitToCourseMenu(phone, { id: convId } as Conversation, ctx);
    return;
  }

  const optionTexts: Record<string, string> = {
    A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d,
  };

  const isCorrect = auditItem.is_correct;
  const statusLine = isCorrect
    ? `✅ *Your Answer:* ${auditItem.selected_option} — ${optionTexts[auditItem.selected_option]} (Correct)`
    : `❌ *Your Answer:* ${auditItem.selected_option} — ${optionTexts[auditItem.selected_option] || "None"}\n` +
      `👉 *Correct Answer:* ${auditItem.correct_option} — ${optionTexts[auditItem.correct_option]}`;

  const message =
    `🔍 *REVIEW: QUESTION ${idx + 1} of ${attempt.total_questions}*\n\n` +
    `*Question:*\n${q.question}\n\n` +
    `${statusLine}\n\n` +
    (q.explanation ? `💡 *Explanation:*\n${q.explanation}\n\n` : "") +
    `_Use the buttons below to browse through the questions:_`;

  const buttons = [];
  if (idx + 1 < attempt.total_questions) {
    buttons.push(makeButton("rev_next", "Next Question ➡️"));
  }
  if (idx > 0) {
    buttons.push(makeButton("rev_prev", "⬅️ Previous"));
  }
  buttons.push(makeButton("rev_menu", "📋 Course Menu"));

  await sendButtonMessage(
    phone,
    message,
    buttons,
    `Grade Review: ${idx + 1}/${attempt.total_questions}`,
    "Engr. Ero Learning Centre"
  );
}

async function processReviewNavigation(
  phone: string, text: string, _contact: Contact, conv: Conversation, ctx: ExamCtx
): Promise<void> {
  const n = normalise(text);
  const idx = ctx.reviewIndex || 0;
  const total = ctx.shuffledIds?.length || 1;

  if (n === "rev_next" || n.includes("next")) {
    if (idx + 1 < total) {
      ctx.reviewIndex = idx + 1;
      await saveCtx(conv.id, ctx, "EXAM_REVIEW");
      await deliverReviewQuestion(phone, conv.id, ctx);
    } else {
      await exitToCourseMenu(phone, conv, ctx);
    }
    return;
  }

  if (n === "rev_prev" || n.includes("prev")) {
    ctx.reviewIndex = Math.max(0, idx - 1);
    await saveCtx(conv.id, ctx, "EXAM_REVIEW");
    await deliverReviewQuestion(phone, conv.id, ctx);
    return;
  }

  if (n === "rev_menu" || n.includes("menu")) {
    await exitToCourseMenu(phone, conv, ctx);
    return;
  }

  await exitToCourseMenu(phone, conv, ctx);
}

// ═══════════════════════════════════════════════════════
// HANDOFF HELPER
// ═══════════════════════════════════════════════════════

async function exitToCourseMenu(
  phone: string, conv: Conversation, ctx: ExamCtx
): Promise<void> {
  await showCourseMenu(phone, conv.id, {
    step: "COURSE_MENU",
    learningUnlocked: true,
    courseCode: ctx.courseCode,
    courseId: ctx.courseId,
    courseName: ctx.courseName,
    term: ctx.term,
    studentId: ctx.studentId,
    studentCourseId: ctx.studentCourseId,
  });
}
