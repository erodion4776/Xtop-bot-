// supabase/functions/whatsapp-webhook/modules/exams.ts
// Complete CBT Examination Module with timed session tracking & 3-Attempt Retake Limits

import {
  Contact, Conversation, updateConversation,
  getSupabaseClient,
} from "../database.ts";
import {
  sendButtonMessage, sendTextMessage,
  makeButton,
} from "../whatsapp.ts";
import { normalise, isBack } from "../utils.ts";
import { showCourseMenu, LearningCtx } from "./learning.ts";
import { initializeExamPayment, verifyExamPayment } from "../paystack.ts";

const supabase = getSupabaseClient();

export interface ExamCtx extends LearningCtx {
  examId?: string;
  paymentReference?: string;
  questions?: any[];
  currentExamQIndex?: number;
  examScore?: number;
  examAnswers?: Array<{ question_id: string; selected_option: string; correct_option: string; is_correct: boolean }>;
  attemptId?: string;
  examDurationMinutes?: number;
  examStartTime?: string;
  attemptsCount?: number;
  studentLevel?: string;
  examFeeNaira?: number;
}

function getExamCtx(conv: Conversation): ExamCtx {
  return (conv.context_json || {}) as ExamCtx;
}

async function saveExamCtx(convId: string, ctx: ExamCtx, state: string): Promise<void> {
  await updateConversation(convId, {
    current_module: "EXAMS",
    current_state: state,
    context_json: { ...ctx, learningUnlocked: true } as unknown as Record<string, unknown>,
  });
}

// ═══════════════════════════════════════════════════════
// 1. EXAM ENTRY, RETAKE CHECK, & ATTEMPT LIMITS
// ═══════════════════════════════════════════════════════

export async function startExamEntry(
  phone: string, conversationId: string, learningCtx: LearningCtx
): Promise<void> {
  const studentId = learningCtx.studentId;
  const courseId = learningCtx.courseId;
  const courseCode = learningCtx.courseCode || "Course";

  if (!studentId || !courseId) {
    await sendTextMessage(phone, "⚠️ Unable to load exam. Please enter your course code again.");
    await showCourseMenu(phone, conversationId, learningCtx);
    return;
  }

  // Resolve the verified student's academic level before creating any payment.
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("level")
    .eq("id", studentId)
    .maybeSingle();
  if (studentError || !student?.level) {
    await sendTextMessage(phone, "⚠️ We could not confirm your registered level. Please contact the Learning Centre administrator before paying.");
    return;
  }
  const levelDigits = String(student.level).match(/\d{3}/)?.[0];
  const examFeeNaira = levelDigits === "400" ? 1000 : levelDigits === "300" ? 500 : 0;
  if (!examFeeNaira) {
    await sendTextMessage(phone, `❌ CBT payment is currently configured for 300 Level (₦500) and 400 Level (₦1,000). Your registered level is *${student.level}*. Please contact the administrator.`);
    return;
  }

  // 1. Fetch CBT Questions
  const { data: questions } = await supabase
    .from("course_questions")
    .select("*")
    .eq("course_id", courseId)
    .eq("status", "ACTIVE")
    .order("question_order", { ascending: true });

  if (!questions || questions.length === 0) {
    await sendTextMessage(phone, `📝 No CBT exam questions have been published for *${courseCode}* yet.`);
    await showCourseMenu(phone, conversationId, learningCtx);
    return;
  }

  // 2. Fetch completed attempts and exclude every question used in prior attempts.
  const { data: attempts } = await supabase
    .from("exam_attempts")
    .select("id, question_ids, answers_json, submitted_at")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .not("submitted_at", "is", null);

  const attemptsCount = attempts?.length || 0;
  const previouslyUsed = new Set<string>();
  for (const prior of attempts || []) {
    for (const id of (prior as any).question_ids || []) previouslyUsed.add(String(id));
    const priorAnswers = (prior as any).answers_json;
    if (Array.isArray(priorAnswers)) {
      for (const answer of priorAnswers) {
        if (answer?.question_id) previouslyUsed.add(String(answer.question_id));
      }
    }
  }

  const eligibleQuestions = (questions || []).filter((question: any) => !previouslyUsed.has(String(question.id)));
  const shuffledPool = [...eligibleQuestions];
  for (let i = shuffledPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledPool[i], shuffledPool[j]] = [shuffledPool[j], shuffledPool[i]];
  }
  if (shuffledPool.length < 50) {
    await sendTextMessage(phone, `⚠️ Only ${shuffledPool.length} unused questions remain for this student. Please contact the lecturer to replenish the ELA401 question bank before starting another attempt.`);
    return;
  }
  const selectedQuestions = shuffledPool.slice(0, 50).map((question: any) => shuffleExamOptions(question));

  // Rule: Strict 3 Attempt Maximum Limit
  if (attemptsCount >= 3) {
    const limitMessage =
      `⚠️ *EXAM ATTEMPT LIMIT REACHED*\n\n` +
      `Course: *${courseCode}*\n` +
      `You have already attempted this exam *3 times* (the maximum allowable limit).\n\n` +
      `To request an additional attempt override, please contact *Engr. Ero* directly:\n\n` +
      `📞 *Call/WhatsApp:* +2348073158887\n` +
      `👉 *Direct Link:* https://wa.me/2348073158887?text=Hi%20Engr%20Ero,%20I%20have%20reached%20my%20CBT%20limit%20for%20${courseCode}`;

    await sendTextMessage(phone, limitMessage);
    await showCourseMenu(phone, conversationId, learningCtx);
    return;
  }

  const examCtx: ExamCtx = {
    ...learningCtx,
    questions: selectedQuestions,
    attemptsCount,
    studentLevel: String(student.level),
    examFeeNaira,
    examDurationMinutes: 60 // 60-minute exam timer
  };

  // 3. Handle Retake Warning (Attempt 2 or 3)
  if (attemptsCount > 0) {
    await saveExamCtx(conversationId, examCtx, "WAITING_RETAKE_CONFIRMATION");

    const retakeWarning =
      `⚠️ *EXAM RETAKE WARNING (Attempt ${attemptsCount + 1} of 3)*\n\n` +
      `Retaking this exam will *CANCEL & OVERWRITE* your current score. Only your most recent score will stand.\n\n` +
      `Each new attempt requires a new *₦${examFeeNaira.toLocaleString("en-NG")}* access fee payment.\n\n` +
      `Are you sure you want to proceed and generate a new payment link?`;

    await sendButtonMessage(
      phone,
      retakeWarning,
      [
        makeButton("cbt_accept_retake", "Yes, I Accept"),
        makeButton("cbt_cancel_pay", "No, Cancel")
      ],
      "Retake Confirmation"
    );
    return;
  }

  // First attempt flow (no retake warning)
  await handlePaywallGate(phone, conversationId, examCtx);
}

// ═══════════════════════════════════════════════════════
// 2. INCREMENTAL ATTEMPT PAYWALL GATE
// ═══════════════════════════════════════════════════════

async function handlePaywallGate(
  phone: string, conversationId: string, ctx: ExamCtx
): Promise<void> {
  const studentId = ctx.studentId!;
  const courseId = ctx.courseId!;
  const courseCode = ctx.courseCode || "Course";
  const attemptsCount = ctx.attemptsCount || 0;

  // Count successful payment transactions
  const { data: payments } = await supabase
    .from("payment_transactions")
    .select("id, amount")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .eq("status", "SUCCESSFUL");

  const examFeeNaira = ctx.examFeeNaira || 0;
  const paymentsCount = (payments || []).filter((payment: any) => Number(payment.amount) === examFeeNaira).length;

  // If paymentsCount <= attemptsCount, a new payment is required for this attempt
  if (paymentsCount <= attemptsCount) {
    const examFeeNaira = ctx.examFeeNaira || (String(ctx.studentLevel || "").includes("400") ? 1000 : 500);
    const payment = await initializeExamPayment(studentId, courseId, courseCode, phone, examFeeNaira);

    if (!payment) {
      await sendTextMessage(phone, "⚠️ Payment gateway is temporarily busy. Please try again shortly.");
      await showCourseMenu(phone, conversationId, ctx);
      return;
    }

    const updatedCtx = {
      ...ctx,
      step: "WAITING_PAYMENT_VERIFICATION",
      paymentReference: payment.reference
    };

    await saveExamCtx(conversationId, updatedCtx, "WAITING_PAYMENT_VERIFICATION");

    const payMessage =
      `💳 *CBT EXAM ACCESS FEE (Attempt ${attemptsCount + 1}/3)*\n\n` +
      `Course: *${courseCode} — ${ctx.courseName || ""}*\n` +
      `Level: *${ctx.studentLevel || "Unconfirmed"}*\nAccess Fee: *₦${examFeeNaira.toLocaleString("en-NG")}.00*\n\n` +
      `👇 *Click the secure link below to make payment:* \n` +
      `${payment.paymentUrl}\n\n` +
      `_After completing payment, tap *Verify Payment* below to unlock your exam immediately:_`;

    await sendButtonMessage(
      phone,
      payMessage,
      [
        makeButton("cbt_verify_pay", "✅ Verify Payment"),
        makeButton("cbt_cancel_pay", "📋 Back to Course")
      ],
      "Paystack Secure Checkout"
    );
    return;
  }

  // Already paid for this current attempt -> proceed
  await launchExam(phone, conversationId, ctx);
}

// ═══════════════════════════════════════════════════════
// 3. EXAM MODULE EVENT ROUTER
// ═══════════════════════════════════════════════════════

export async function handleExams(
  phone: string, text: string, contact: Contact, conv: Conversation
): Promise<void> {
  const n = normalise(text);
  const state = conv.current_state;
  const ctx = getExamCtx(conv);

  // Global cancel/back handlers
  if (n === "cbt_cancel_pay" || isBack(text)) {
    await updateConversation(conv.id, { current_module: "LEARNING", current_state: "COURSE_MENU" });
    await showCourseMenu(phone, conv.id, ctx);
    return;
  }

  switch (state) {
    case "WAITING_RETAKE_CONFIRMATION":
      if (n === "cbt_accept_retake" || n.includes("accept") || n.includes("yes")) {
        await handlePaywallGate(phone, conv.id, ctx);
      } else {
        await showCourseMenu(phone, conv.id, ctx);
      }
      break;

    case "WAITING_PAYMENT_VERIFICATION":
      await handlePaymentVerification(phone, text, conv, ctx);
      break;

    case "IN_EXAM":
      await handleExamAnswer(phone, text, conv, ctx);
      break;

    default:
      await showCourseMenu(phone, conv.id, ctx);
      break;
  }
}

// ═══════════════════════════════════════════════════════
// 4. PAYMENT VERIFICATION HANDLER
// ═══════════════════════════════════════════════════════

async function handlePaymentVerification(
  phone: string, text: string, conv: Conversation, ctx: ExamCtx
): Promise<void> {
  const n = normalise(text);
  const ref = ctx.paymentReference;

  if (n === "cbt_verify_pay" || n.includes("verify") || n.includes("paid") || n.includes("retry")) {
    if (!ref) {
      await sendTextMessage(phone, "No active payment session found. Restarting exam entry...");
      await startExamEntry(phone, conv.id, ctx);
      return;
    }

    await sendTextMessage(phone, "⏳ Verifying payment with Paystack, please wait...");
    const verified = await verifyExamPayment(ref, ctx.examFeeNaira || 0);

    if (verified) {
      await sendTextMessage(phone, "🎉 *Payment Confirmed!* Access unlocked.");
      await launchExam(phone, conv.id, ctx);
    } else {
      await sendButtonMessage(
        phone,
        "⚠️ *Payment Not Confirmed*\n\nIf you just completed the payment, please wait 5 seconds and tap *Verify Payment* again.",
        [
          makeButton("cbt_verify_pay", "🔄 Retry Verification"),
          makeButton("cbt_cancel_pay", "📋 Back to Course")
        ],
        "Paystack Verification"
      );
    }
    return;
  }

  await sendTextMessage(phone, "Please tap *Verify Payment* once your displayed CBT access-fee checkout is completed.");
}

// ═══════════════════════════════════════════════════════
// 5. CBT EXAM ENGINE WITH TIMER VALIDATION
// ═══════════════════════════════════════════════════════

function shuffleExamOptions(question: any): any {
  const options = [
    { value: question.option_a, key: "A" },
    { value: question.option_b, key: "B" },
    { value: question.option_c, key: "C" },
    { value: question.option_d, key: "D" },
  ];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  const correctIndex = options.findIndex(option => option.key === String(question.correct_answer).toUpperCase());
  return {
    ...question,
    option_a: options[0].value,
    option_b: options[1].value,
    option_c: options[2].value,
    option_d: options[3].value,
    correct_answer: ["A", "B", "C", "D"][correctIndex],
  };
}

async function sendExamQuestionPrompt(phone: string, question: any, index: number, total: number): Promise<void> {
  await sendTextMessage(
    phone,
    `📝 *ELA401 CBT — Question ${index + 1} of ${total}*\n\n` +
    `${question.question}\n\n` +
    `A. ${question.option_a}\nB. ${question.option_b}\nC. ${question.option_c}\nD. ${question.option_d}\n\n` +
    `Reply with A, B, C or D.\n_Time remaining is checked when you submit each answer._`
  );
}

async function launchExam(
  phone: string, conversationId: string, ctx: ExamCtx
): Promise<void> {
  const studentId = ctx.studentId!;
  const courseId = ctx.courseId!;
  const questions = ctx.questions || [];
  const attemptsCount = ctx.attemptsCount || 0;

  // Insert Attempt Record with Start Time
  const startTime = new Date().toISOString();
  const { data: attempt } = await supabase.from("exam_attempts").insert({
    student_id: studentId,
    course_id: courseId,
    score: 0,
    total_questions: questions.length,\n    question_ids: questions.map((question: any) => question.id),\n    total_marks: questions.reduce((sum: number, question: any) => sum + Number(question.marks || 1), 0),
    percentage: 0,
    pass_status: "PENDING",
    is_locked: false,
    started_at: startTime
  }).select().single();

  const examCtx: ExamCtx = {
    ...ctx,
    step: "IN_EXAM",
    attemptId: attempt?.id,
    currentExamQIndex: 0,
    examScore: 0,
    examAnswers: [],
    examStartTime: startTime
  };

  await saveExamCtx(conversationId, examCtx, "IN_EXAM");

  await sendTextMessage(
    phone,
    `⏱️ *CBT EXAMINATION STARTED: ${ctx.courseCode}*\n` +
    `Attempt: *${attemptsCount + 1} of 3*\n` +
    `Time Limit: *${ctx.examDurationMinutes} Minutes*\n` +
    `Total Questions: *${questions.length}*\n\n` +
    `_Answer carefully. If the timer exceeds ${ctx.examDurationMinutes} minutes, your exam will auto-submit._`
  );

  await sendExamQuestionPrompt(phone, questions[0], 0, questions.length);
}

async function handleExamAnswer(
  phone: string, text: string, conv: Conversation, ctx: ExamCtx
): Promise<void> {
  const questions = ctx.questions || [];
  const qIdx = ctx.currentExamQIndex || 0;
  const activeQ = questions[qIdx];

  if (!activeQ) {
    await completeAndSubmitExam(phone, conv.id, ctx);
    return;
  }

  // 1. ENFORCE THE 60-MINUTE EXAM TIME LIMIT
  if (ctx.examStartTime) {
    const startTimeMs = new Date(ctx.examStartTime).getTime();
    const nowMs = Date.now();
    const limitMs = (ctx.examDurationMinutes || 60) * 60 * 1000;

    if (nowMs > startTimeMs + limitMs) {
      await sendTextMessage(phone, "⏳ *TIME EXPIRED!*\nThe 60-minute exam time limit has been exceeded. Grading what you have completed...");
      await completeAndSubmitExam(phone, conv.id, ctx);
      return;
    }
  }

  // 2. Evaluate Answer
  const rawLetter = text.trim().toUpperCase().replace(/[^A-D]/g, "");
  const selectedAns = rawLetter.length > 0 ? rawLetter.charAt(0) : text.trim().toUpperCase().charAt(0);

  if (!["A", "B", "C", "D"].includes(selectedAns)) {
    await sendTextMessage(phone, "⚠️ Please reply with a valid option letter: *A*, *B*, *C*, or *D*");
    return;
  }

  const isCorrect = selectedAns === activeQ.correct_answer.trim().toUpperCase();
  const currentScore = (ctx.examScore || 0) + (isCorrect ? (activeQ.marks || 1) : 0);
  const answersList = ctx.examAnswers || [];

  answersList.push({
    question_id: activeQ.id,
    selected_option: selectedAns,
    correct_option: activeQ.correct_answer,
    is_correct: isCorrect
  });

  const nextQIdx = qIdx + 1;
  const updatedCtx: ExamCtx = {
    ...ctx,
    currentExamQIndex: nextQIdx,
    examScore: currentScore,
    examAnswers: answersList
  };

  if (nextQIdx < questions.length) {
    await saveExamCtx(conv.id, updatedCtx, "IN_EXAM");
    await sendExamQuestionPrompt(phone, questions[nextQIdx], nextQIdx, questions.length);
  } else {
    await completeAndSubmitExam(phone, conv.id, updatedCtx);
  }
}

async function completeAndSubmitExam(
  phone: string, conversationId: string, ctx: ExamCtx
): Promise<void> {
  const score = ctx.examScore || 0;
  const totalQuestions = ctx.questions?.length || 1;
  const totalMarks = (ctx.questions || []).reduce((sum: number, question: any) => sum + Number(question.marks || 1), 0) || totalQuestions;
  const percentage = Math.max(0, Math.min(100, Math.round((score / totalMarks) * 100)));
  const passed = percentage >= 50;
  const attemptsCount = ctx.attemptsCount || 0;

  // 1. Submit Attempt to database
  if (ctx.attemptId) {
    try {
      await supabase.from("exam_attempts").update({
        score,
        percentage,
        pass_status: passed ? "PASS" : "FAIL",
        submitted_at: new Date().toISOString(),
        answers_json: ctx.examAnswers
      }).eq("id", ctx.attemptId);
    } catch (_) {}
  }

  // 2. Overwrite / Upsert final Results table (always keeps the most recent attempt)
  if (ctx.studentId && ctx.courseId) {
    try {
      await supabase.from("results").upsert({
        student_id: ctx.studentId,
        course_id: ctx.courseId,
        cbt_score: percentage,
        total_score: percentage,
        percentage,
        status: "RELEASED",
        released_at: new Date().toISOString()
      });
    } catch (_) {}
  }

  // 3. Move back to Learning context
  await updateConversation(conversationId, {
    current_module: "LEARNING",
    current_state: "COURSE_MENU"
  });

  const resultMsg =
    `🏁 *CBT EXAM COMPLETED*\n\n` +
    `Course: *${ctx.courseCode} — ${ctx.courseName || ""}*\n` +
    `Attempt: *${attemptsCount + 1} of 3*\n` +
    `Score: *${score} / ${totalQuestions}*\n` +
    `Percentage: *${percentage}%*\n` +
    `Grade Status: *${passed ? "✅ PASSED" : "❌ FAILED"}*\n\n` +
    (attemptsCount + 1 < 3
      ? `_If you are unsatisfied with this score, you can retake the exam from the Course Menu (up to 3 attempts total)._`
      : `_You have completed all 3 available attempts. For assistance, contact Engr. Ero._`);

  await sendButtonMessage(
    phone,
    resultMsg,
    [
      makeButton("cm_result", "📊 View Results"),
      makeButton("cm_menu", "📋 Course Menu")
    ],
    "Official CBT Results"
  );
}
