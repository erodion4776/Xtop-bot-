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
  phone: string, conversationId: string, learningCtx: LearningCtx, resumePaidPayment = false
): Promise<void> {
  const studentId = learningCtx.studentId;
  const courseId = learningCtx.courseId;
  const courseCode = learningCtx.courseCode || "Course";

  if (!studentId || !courseId) {
    await sendTextMessage(phone, "⚠️ Unable to load exam. Please enter your course code again.");
    await showCourseMenu(phone, conversationId, learningCtx);
    return;
  }

  // The fee and displayed level must come from the course being examined,
  // not the student's personal level (a 400-level student may take a 300-level course).
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("level")
    .eq("id", courseId)
    .maybeSingle();
  if (courseError || !course?.level) {
    await sendTextMessage(phone, "⚠️ We could not confirm this course's academic level. Please contact the Learning Centre administrator before paying.");
    return;
  }
  const courseLevel = String(course.level);
  const levelDigits = courseLevel.match(/\d{3}/)?.[0];
  const examFeeNaira = levelDigits === "400" ? 1000 : levelDigits === "300" ? 500 : 0;
  if (!examFeeNaira) {
    await sendTextMessage(phone, `❌ CBT payment is currently configured for 300 Level (₦500) and 400 Level (₦1,000). This course is recorded as *${courseLevel}*. Please contact the administrator.`);
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

  // Use up to five questions calculated from this student's own submitted practical readings.
  const { data: practicalSubmissions, error: practicalError } = await supabase
    .from("ela401_experiment_submissions")
    .select("id, experiment_code, raw_data, result_data, submitted_at")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .eq("status", "SUBMITTED")
    .order("submitted_at", { ascending: false })
    .limit(20);
  if (practicalError) console.error("[ELA401_CBT_PRACTICAL_FETCH]", practicalError.message);

  const practicalQuestions = await buildStudentPracticalQuestions(practicalSubmissions || []);
  const unusedPractical = practicalQuestions.filter(question => !previouslyUsed.has(String(question.id)));
  for (let i = unusedPractical.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unusedPractical[i], unusedPractical[j]] = [unusedPractical[j], unusedPractical[i]];
  }
  const selectedPractical = unusedPractical.slice(0, 5);

  const eligibleQuestions = (questions || []).filter((question: any) => !previouslyUsed.has(String(question.id)));
  const shuffledPool = [...eligibleQuestions];
  for (let i = shuffledPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledPool[i], shuffledPool[j]] = [shuffledPool[j], shuffledPool[i]];
  }
  const bankNeeded = 50 - selectedPractical.length;
  if (shuffledPool.length < bankNeeded) {
    await sendTextMessage(phone, `⚠️ Only ${shuffledPool.length} unused question-bank items remain. Please contact the lecturer before starting another attempt.`);
    return;
  }
  const selectedQuestions = [...selectedPractical, ...shuffledPool.slice(0, bankNeeded)]
    .map((question: any) => shuffleExamOptions(question));
  for (let i = selectedQuestions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [selectedQuestions[i], selectedQuestions[j]] = [selectedQuestions[j], selectedQuestions[i]];
  }

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
    studentLevel: courseLevel,
    examFeeNaira,
    examDurationMinutes: 60 // 60-minute exam timer
  };

  // 3. Handle Retake Warning (Attempt 2 or 3)
  if (attemptsCount > 0 && !resumePaidPayment) {
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

/**
 * Recovers a student's CBT payment when the general Sabi menu has replaced
 * the WhatsApp conversation context. The payment transaction is the durable
 * source of the course and student identity; the student must match the
 * WhatsApp sender before Paystack is verified.
 */
/**
 * Restores an in-progress paid exam even when another Sabi workflow has
 * overwritten the conversation context. The active attempt row is durable.
 */
export async function handleActiveExamRecovery(
  phone: string, text: string, contact: Contact, conv: Conversation
): Promise<boolean> {
  const normalizedPhone = String(phone || "").replace(/\D/g, "");
  const { data: student } = await supabase.from("students").select("id")
    .eq("phone", normalizedPhone).maybeSingle();
  if (!student) return false;

  const { data: attempt } = await supabase.from("exam_attempts")
    .select("id,student_id,course_id,exam_id,question_ids,answers_json,questions_snapshot,current_question_index,started_at,submitted_at,total_questions")
    .eq("student_id", student.id).is("submitted_at", null)
    .order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (!attempt || !attempt.started_at) return false;

  const elapsed = Date.now() - new Date(attempt.started_at).getTime();
  if (!Number.isFinite(elapsed) || elapsed > 60 * 60 * 1000) return false;

  const [{ data: course }, { data: enrollment }, { data: questionRows }, { count: attemptCount }] = await Promise.all([
    supabase.from("courses").select("id,course_code,course_name,level").eq("id", attempt.course_id).maybeSingle(),
    supabase.from("student_courses").select("id").eq("student_id", student.id).eq("course_id", attempt.course_id).eq("status", "ACTIVE").maybeSingle(),
    supabase.from("course_questions").select("*").in("id", attempt.question_ids || []),
    supabase.from("exam_attempts").select("id", { count: "exact", head: true }).eq("student_id", student.id).eq("course_id", attempt.course_id),
  ]);
  if (!course || !enrollment || !questionRows?.length) return false;

  const byId = new Map(questionRows.map((q: any) => [String(q.id), q]));
  const rawQuestions = (attempt.question_ids || []).map((id: string) => byId.get(String(id))).filter(Boolean);
  if (!rawQuestions.length) return false;
  const questions = Array.isArray(attempt.questions_snapshot) && attempt.questions_snapshot.length
    ? attempt.questions_snapshot
    : rawQuestions.map((question: any) => shuffleExamOptions(question));
  if (!Array.isArray(attempt.questions_snapshot) || !attempt.questions_snapshot.length) {
    await supabase.from("exam_attempts").update({ questions_snapshot: questions }).eq("id", attempt.id);
  }

  const savedAnswers = Array.isArray(attempt.answers_json) ? attempt.answers_json : [];
  const examAnswers = savedAnswers.map((a: any) => ({
    question_id: String(a.question_id),
    selected_option: String(a.selected_option || ""),
    correct_option: String(a.correct_option || ""),
    is_correct: Boolean(a.is_correct),
  }));
  const recoveredCtx: ExamCtx = {
    step: "IN_EXAM",
    learningUnlocked: true,
    studentId: student.id,
    studentCourseId: enrollment.id,
    courseId: course.id,
    courseCode: course.course_code,
    courseName: course.course_name,
    totalLessons: 16,
    studentLevel: String(course.level || ""),
    examId: attempt.exam_id || undefined,
    attemptId: attempt.id,
    questions,
    currentExamQIndex: Number.isInteger(attempt.current_question_index) ? Number(attempt.current_question_index) : examAnswers.length,
    examScore: examAnswers.reduce((sum: number, a: any) => sum + (a.is_correct ? Number(questions.find((q: any) => q.id === a.question_id)?.marks || 1) : 0), 0),
    examAnswers,
    examStartTime: attempt.started_at,
    examDurationMinutes: 60,
    attemptsCount: Math.max(0, Number(attemptCount || 1) - 1),
  };

  await saveExamCtx(conv.id, recoveredCtx, "IN_EXAM");
  await sendTextMessage(phone, `🔄 *ELA CBT session restored: ${course.course_code}*\\nYour paid attempt is still active. Continuing from Question ${Math.min(examAnswers.length + 1, questions.length)} of ${questions.length}.`);
  const restoredConversation = {
    ...conv,
    current_module: "EXAMS",
    current_state: "IN_EXAM",
    context_json: recoveredCtx,
  } as Conversation;
  if (/^resume exam$/i.test(String(text || "").trim())) {
    const qIndex = recoveredCtx.currentExamQIndex || 0;
    const nextQuestion = questions[qIndex];
    if (nextQuestion) {
      await sendExamQuestionPrompt(phone, nextQuestion, qIndex, questions.length, course.course_code || "CBT");
    } else {
      await completeAndSubmitExam(phone, conv.id, recoveredCtx);
    }
    return true;
  }
  await handleExams(phone, text, contact, restoredConversation);
  return true;
}

export async function handleExamPaymentRecovery(
  phone: string, text: string, contact: Contact, conv: Conversation
): Promise<void> {
  const existing = getExamCtx(conv);
  if (conv.current_module === "EXAMS" && existing.paymentReference) {
    await handleExams(phone, text, contact, conv);
    return;
  }

  const normalizedPhone = String(phone || "").replace(/\\D/g, "");
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id")
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (studentError || !student) {
    await sendTextMessage(phone, "⚠️ I could not match this WhatsApp number to the student record. Please contact the Learning Centre administrator. Do not make another payment.");
    return;
  }

  const { data: payment, error: paymentError } = await supabase
    .from("payment_transactions")
    .select("reference,amount,status,course_id,created_at")
    .eq("student_id", student.id)
    .in("status", ["PENDING", "SUCCESSFUL"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (paymentError || !payment || ![500, 1000].includes(Number(payment.amount))) {
    await sendTextMessage(phone, "⚠️ I could not find a valid CBT payment for this WhatsApp number. Please contact the Learning Centre administrator before making another payment.");
    return;
  }

  const [{ data: course, error: courseError }, { data: enrollment, error: enrollmentError }] = await Promise.all([
    supabase.from("courses").select("id,course_code,course_name,level").eq("id", payment.course_id).maybeSingle(),
    supabase.from("student_courses").select("id,status").eq("student_id", student.id).eq("course_id", payment.course_id).eq("status", "ACTIVE").maybeSingle(),
  ]);

  if (courseError || enrollmentError || !course || !enrollment) {
    await sendTextMessage(phone, "⚠️ Your payment record was found, but the course enrolment could not be restored. Your payment has not been discarded. Please contact the Learning Centre administrator.");
    return;
  }

  const recoveredCtx: ExamCtx = {
    step: "ENTRY",
    learningUnlocked: true,
    studentId: student.id,
    studentCourseId: enrollment.id,
    courseId: course.id,
    courseCode: course.course_code,
    courseName: course.course_name,
    totalLessons: 16,
    studentLevel: String(course.level || ""),
    examFeeNaira: Number(payment.amount),
    paymentReference: payment.reference,
    examDurationMinutes: 60,
  };

  if (payment.status === "PENDING") {
    await saveExamCtx(conv.id, recoveredCtx, "WAITING_PAYMENT_VERIFICATION");
    await sendTextMessage(phone, "⏳ I found your ELA/CBT checkout. I am checking the ₦" + Number(payment.amount).toLocaleString("en-NG") + " payment with Paystack now. You do not need to pay again.");
    const verified = await verifyExamPayment(payment.reference, Number(payment.amount));
    if (!verified) {
      await sendButtonMessage(
        phone,
        "⚠️ *Payment is not yet confirmed by Paystack.*\n\nIf your bank has debited you, do not pay again. Wait briefly and tap Verify Payment again.",
        [
          makeButton("cbt_verify_pay", "🔄 Verify Payment"),
          makeButton("cbt_cancel_pay", "📋 Course Menu")
        ],
        "CBT Payment Verification"
      );
      return;
    }
  }

  await sendTextMessage(phone, "🎉 *CBT payment confirmed.* Restoring your ELA301 exam session now.");
  await startExamEntry(phone, conv.id, recoveredCtx, true);
}

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

const PRACTICAL_MODULES: Record<string, string> = {
  pendulum: "b7a8f733-ee22-4152-9fa8-718dc47920a8",
  quartz: "d22fc595-a9f1-42b9-b11d-77ac1967c5b2",
  frequency: "504468b5-936e-4ccc-a958-624a71cf9d94",
  calibration: "d75041bb-c6cd-4232-9ea1-39c67734d759",
  uncertainty: "70f94739-baf0-4e0e-9a9f-a71d80b513d8",
};

async function stablePracticalQuestionId(seed: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function makePracticalQuestion(id: string, moduleId: string, prompt: string, answer: number, unit: string, explanation: string): any {
  const rounded = Number(answer.toFixed(3));
  const delta = Math.max(Math.abs(rounded) * 0.08, 0.01);
  const correctIndex = Math.floor(Math.random() * 4);
  const choices = [rounded, rounded + delta, rounded - delta, rounded + 2 * delta].map(v => Number(v.toFixed(3)));
  const correctValue = choices.shift()!;
  choices.splice(correctIndex, 0, correctValue);
  return {
    id, module_id: moduleId, question: prompt,
    option_a: choices[0].toFixed(3) + " " + unit,
    option_b: choices[1].toFixed(3) + " " + unit,
    option_c: choices[2].toFixed(3) + " " + unit,
    option_d: choices[3].toFixed(3) + " " + unit,
    correct_answer: ["A", "B", "C", "D"][correctIndex],
    explanation, marks: 1, status: "ACTIVE", personalized: true,
  };
}

async function buildStudentPracticalQuestions(submissions: any[]): Promise<any[]> {
  const generated: any[] = [];
  for (const submission of submissions || []) {
    const raw = submission.raw_data || {};
    const values = Array.isArray(raw.entered_values) ? raw.entered_values.map(Number) : [];
    const code = String(submission.experiment_code || "");
    let prompt = "", unit = "s", explanation = "";
    let answer = NaN;

    if (code === "pendulum" && values[0] > 0) {
      prompt = `Using your submitted pendulum length of ${values[0].toFixed(3)} m and g = 9.80665 m/s², calculate theoretical period.`;
      answer = 2 * Math.PI * Math.sqrt(values[0] / 9.80665);
      explanation = "For a simple pendulum, T = 2π√(L/g).";
    } else if (code === "quartz" && Number.isFinite(values[0])) {
      prompt = `Your quartz practical used a frequency offset of ${values[0]} ppm. Calculate clock error in seconds per day.`;
      answer = values[0] * 1e-6 * 86400; unit = "s/day";
      explanation = "Daily error = ppm × 10⁻⁶ × 86,400 seconds.";
    } else if (code === "frequency" && values[0] > 0) {
      prompt = `Your frequency practical used ${values[0]} Hz. Calculate its period.`;
      answer = 1 / values[0];
      explanation = "Period and frequency are reciprocals: T = 1/f.";
    } else if (code === "calibration" && values.length >= 2) {
      prompt = `Your instrument indicated ${values[0]} s against a reference of ${values[1]} s. Calculate indication error.`;
      answer = values[0] - values[1];
      explanation = "Indication error = indication − reference.";
    } else if (code === "uncertainty" && values.length >= 2) {
      prompt = `Using your submitted uncertainty components (${values.join(", ")}), calculate combined standard uncertainty.`;
      answer = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
      explanation = "Combined standard uncertainty = square root of the sum of squared components.";
    }

    if (!prompt || !Number.isFinite(answer) || !PRACTICAL_MODULES[code]) continue;
    const id = await stablePracticalQuestionId(`${submission.id}:${code}:ela401-precision-time-v2`);
    generated.push(makePracticalQuestion(id, PRACTICAL_MODULES[code], prompt, answer, unit, explanation));
  }
  return generated;
}

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

async function sendExamQuestionPrompt(phone: string, question: any, index: number, total: number, courseCode: string): Promise<void> {
  await sendTextMessage(
    phone,
    `📝 *${courseCode || "CBT"} CBT — Question ${index + 1} of ${total}*\n\n` +
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
    total_questions: questions.length,
    question_ids: questions.map((question: any) => question.id),
    questions_snapshot: questions,
    total_marks: questions.reduce((sum: number, question: any) => sum + Number(question.marks || 1), 0),
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

  await sendExamQuestionPrompt(phone, questions[0], 0, questions.length, ctx.courseCode || "CBT");
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
  const answersList = [...(ctx.examAnswers || [])];
  const alreadyAnswered = answersList.some((answer: any) => String(answer.question_id) === String(activeQ.id));
  if (alreadyAnswered) {
    const nextIdx = Math.max(qIdx + 1, answersList.length);
    const nextQuestion = questions[nextIdx];
    if (nextQuestion) {
      const nextCtx = { ...ctx, currentExamQIndex: nextIdx };
      await saveExamCtx(conv.id, nextCtx, "IN_EXAM");
      await sendExamQuestionPrompt(phone, nextQuestion, nextIdx, questions.length, ctx.courseCode || "CBT");
    }
    return;
  }

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

  // Persist every answer immediately. Conversation context alone is not durable
  // because the Sabi gateway can replace it between WhatsApp messages.
  if (ctx.attemptId) {
    const { error } = await supabase.from("exam_attempts").update({
      answers_json: answersList,
      score: currentScore,
      current_question_index: nextQIdx
    }).eq("id", ctx.attemptId).is("submitted_at", null);
    if (error) {
      await sendTextMessage(phone, "⚠️ Your answer could not be safely saved. Please send the same option again; your exam will not be advanced until it is saved.");
      return;
    }
  }

  if (nextQIdx < questions.length) {
    await saveExamCtx(conv.id, updatedCtx, "IN_EXAM");
    await sendExamQuestionPrompt(phone, questions[nextQIdx], nextQIdx, questions.length, ctx.courseCode || "CBT");
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
