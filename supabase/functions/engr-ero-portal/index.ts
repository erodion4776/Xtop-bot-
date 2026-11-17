import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTextMessage } from "../whatsapp-webhook/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://xtopbot.netlify.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!supabaseUrl || !serviceKey) throw new Error("Missing Supabase service configuration");
const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function randomSecret(bytes = 32): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const byte of raw) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
function normalPhone(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}
function safeQuestion(question: any) {
  return {
    id: String(question.id),
    question: String(question.question || ""),
    option_a: String(question.option_a || ""),
    option_b: String(question.option_b || ""),
    option_c: String(question.option_c || ""),
    option_d: String(question.option_d || ""),
    marks: Number(question.marks || 1),
  };
}
async function loadLessons(courseId: string) {
  const { data: modules, error: moduleError } = await sb.from("course_modules")
    .select("id,title,module_order").eq("course_id", courseId).eq("status", "ACTIVE")
    .order("module_order", { ascending: true });
  if (moduleError) throw moduleError;
  const playlist: any[] = [];
  for (const module of modules || []) {
    const { data: slides, error } = await sb.from("module_slides").select("*")
      .eq("module_id", module.id).eq("status", "ACTIVE").eq("is_draft", false)
      .order("order_index", { ascending: true });
    if (error) throw error;
    for (const slide of slides || []) playlist.push({ ...slide, moduleTitle: module.title, moduleOrder: module.module_order });
  }
  return playlist;
}
async function requireSession(body: any) {
  const sessionToken = String(body.session_token || "");
  const deviceId = String(body.device_id || "");
  if (sessionToken.length < 30 || deviceId.length < 12) throw new Error("This browser session is not valid. Reopen your WhatsApp link.");
  const [sessionHash, deviceHash] = await Promise.all([hash(sessionToken), hash(deviceId)]);
  const { data, error } = await sb.from("engr_ero_portal_sessions").select("*")
    .eq("session_token_hash", sessionHash).eq("device_hash", deviceHash).maybeSingle();
  if (error || !data || (data.completed_at && data.purpose !== "EXAM")) throw new Error("Your secure session has expired or has already been completed. Return to WhatsApp for a new link.");
  if (new Date(data.expires_at).getTime() <= Date.now() && !(data.purpose === "EXAM" && data.attempt_id && !data.completed_at)) throw new Error("This link has expired. Return to WhatsApp to request a new link.");
  return data;
}
async function finishExam(session: any, attempt: any) {
  if (attempt.submitted_at) return attempt;
  const questions = Array.isArray(session.payload_json?.questions) ? session.payload_json.questions : [];
  const totalMarks = questions.reduce((sum: number, q: any) => sum + Number(q.marks || 1), 0) || questions.length || 1;
  const score = Number(attempt.score || 0);
  const percentage = Math.max(0, Math.min(100, Math.round((score / totalMarks) * 100)));
  const submittedAt = new Date().toISOString();
  const { data: updated, error } = await sb.from("exam_attempts").update({
    score, percentage, pass_status: percentage >= 50 ? "PASS" : "FAIL",
    submitted_at: submittedAt,
    answers_json: Array.isArray(attempt.answers_json) ? attempt.answers_json : [],
    current_question_index: Number(attempt.current_question_index || 0),
  }).eq("id", attempt.id).is("submitted_at", null).select("*").maybeSingle();
  if (error) throw error;
  const finalAttempt = updated || attempt;
  await sb.from("results").upsert({
    student_id: session.student_id, course_id: session.course_id,
    cbt_score: percentage, total_score: percentage, percentage,
    status: "RELEASED", released_at: submittedAt,
  });
  await sb.from("engr_ero_portal_sessions").update({ completed_at: submittedAt }).eq("id", session.id);
  if (session.conversation_id) {
    await sb.from("conversations").update({ current_module: "LEARNING", current_state: "COURSE_MENU" })
      .eq("id", session.conversation_id);
  }
  const [{ data: student }, { data: course }] = await Promise.all([
    sb.from("students").select("phone").eq("id", session.student_id).maybeSingle(),
    sb.from("courses").select("course_code,course_name").eq("id", session.course_id).maybeSingle(),
  ]);
  if (student?.phone) {
    await sendTextMessage(student.phone,
      `🏁 *CBT EXAM COMPLETED*\n\nCourse: *${course?.course_code || "CBT"} — ${course?.course_name || ""}*\nScore: *${score}/${questions.length || attempt.total_questions || 50}*\nPercentage: *${percentage}%*\nResult: *${percentage >= 50 ? "PASSED" : "FAILED"}*\n\nYour result has been saved by Engr. Ero Learning Centre.`);
  }
  return finalAttempt;
}
async function currentExamQuestion(session: any, attempt: any) {
  const questions = Array.isArray(session.payload_json?.questions) ? session.payload_json.questions : [];
  const index = Number(attempt.current_question_index || 0);
  if (attempt.submitted_at || index >= questions.length) return { completed: true, score: attempt.score, percentage: attempt.percentage, pass_status: attempt.pass_status };
  return { completed: false, index, total: questions.length, question: safeQuestion(questions[index]), expires_at: attempt.end_time || session.expires_at };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "POST required" }, 405);
  const origin = req.headers.get("Origin") || "";
  if (origin && origin !== "https://xtopbot.netlify.app") return response({ error: "Origin not allowed" }, 403);
  try {
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "request_otp") {
      const token = String(body.token || "");
      if (token.length < 30) return response({ error: "Invalid access link." }, 400);
      const { data: session, error } = await sb.from("engr_ero_portal_sessions").select("*")
        .eq("access_token_hash", await hash(token)).maybeSingle();
      if (error || !session || session.redeemed_at || new Date(session.expires_at).getTime() <= Date.now()) {
        return response({ error: "This link is invalid, expired, or already used. Return to WhatsApp for a fresh link." }, 403);
      }
      if (session.otp_sent_at && Date.now() - new Date(session.otp_sent_at).getTime() < 60_000) {
        return response({ error: "A code was sent recently. Check WhatsApp and wait one minute before requesting another." }, 429);
      }
      const { data: student } = await sb.from("students").select("phone").eq("id", session.student_id).maybeSingle();
      if (!student?.phone) return response({ error: "The registered WhatsApp number could not be found. Contact the Learning Centre." }, 404);
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
      const sent = await sendTextMessage(student.phone,
        `🔐 *Engr. Ero Portal Verification*\n\nYour one-time code is: *${code}*\n\nEnter this code on the classroom page. It expires in 5 minutes. Do not share it with anyone.`);
      if (!sent) return response({ error: "WhatsApp could not deliver your verification code. Please try again shortly." }, 502);
      const { error: updateError } = await sb.from("engr_ero_portal_sessions").update({
        otp_hash: await hash(code), otp_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
        otp_sent_at: new Date().toISOString(), otp_attempts: 0,
      }).eq("id", session.id).is("redeemed_at", null);
      if (updateError) throw updateError;
      return response({ success: true, message: "A verification code has been sent to your registered WhatsApp number." });
    }

    if (action === "verify_otp") {
      const token = String(body.token || "");
      const code = String(body.code || "").replace(/\D/g, "");
      const deviceId = String(body.device_id || "");
      if (code.length !== 6 || deviceId.length < 12) return response({ error: "Enter the six-digit code on the same device where you requested it." }, 400);
      const { data: session } = await sb.from("engr_ero_portal_sessions").select("*")
        .eq("access_token_hash", await hash(token)).maybeSingle();
      if (!session || session.redeemed_at || !session.otp_hash || !session.otp_expires_at) return response({ error: "Request a new verification code from WhatsApp." }, 403);
      if (Number(session.otp_attempts || 0) >= 5) return response({ error: "Too many incorrect codes. Request a new link from WhatsApp." }, 429);
      if (new Date(session.otp_expires_at).getTime() <= Date.now() || session.otp_hash !== await hash(code)) {
        await sb.from("engr_ero_portal_sessions").update({ otp_attempts: Number(session.otp_attempts || 0) + 1 }).eq("id", session.id);
        return response({ error: "The code is incorrect or has expired." }, 403);
      }
      const sessionToken = randomSecret();
      const lessonExpiry = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
      const { error } = await sb.from("engr_ero_portal_sessions").update({
        session_token_hash: await hash(sessionToken), device_hash: await hash(deviceId),
        redeemed_at: new Date().toISOString(), otp_hash: null, otp_expires_at: null,
        expires_at: lessonExpiry,
      }).eq("id", session.id).is("redeemed_at", null);
      if (error) throw error;
      return response({ success: true, session_token: sessionToken, purpose: session.purpose });
    }

    const session = await requireSession(body);
    if (session.purpose === "LESSON" && action === "lesson") {
      const { data: enrollment, error: enrollmentError } = await sb.from("student_courses").select("id,progress,status")
        .eq("student_id", session.student_id).eq("course_id", session.course_id).eq("status", "ACTIVE").maybeSingle();
      if (enrollmentError || !enrollment) return response({ error: "Your course access is not active. Contact the Learning Centre." }, 403);
      const lessons = await loadLessons(session.course_id);
      const completed = Array.isArray(enrollment.progress?.completed_lessons) ? enrollment.progress.completed_lessons : [];
      const highestCompletedOrder = lessons.reduce((highest, item, index) => completed.includes(item.id) ? Math.max(highest, index + 1) : highest, 0);
      const highWater = Math.min(lessons.length, Math.max(Number(enrollment.progress?.last_lesson_order || 0), highestCompletedOrder));
      if (highWater >= lessons.length) return response({ course_complete: true, total: lessons.length });
      const order = Number(session.lesson_order || 1);
      if (order > highWater + 1 || order < 1 || order > lessons.length) return response({ error: "Complete the previous lecture before opening this one." }, 403);
      const lesson = lessons[order - 1];
      const [{ data: sections, error: sectionError }, { data: media, error: mediaError }, { data: course }] = await Promise.all([
        sb.from("lesson_sections").select("id,title,content,order_index").eq("lesson_id", lesson.id).order("order_index", { ascending: true }),
        sb.from("lesson_media").select("id,file_url,caption,description,order_index").eq("lesson_id", lesson.id).order("order_index", { ascending: true }),
        sb.from("courses").select("course_code,course_name").eq("id", session.course_id).maybeSingle(),
      ]);
      if (sectionError || mediaError) throw sectionError || mediaError;
      return response({
        course, order, total: lessons.length,
        lesson: { id: lesson.id, title: lesson.title, objectives: lesson.objectives, duration: lesson.duration, image_url: lesson.image_url, module_title: lesson.moduleTitle },
        sections: sections || [], media: media || [],
        completed_count: highWater,
      });
    }

    if (session.purpose === "LESSON" && action === "complete_lesson") {
      const { data: enrollment } = await sb.from("student_courses").select("id,progress,status")
        .eq("student_id", session.student_id).eq("course_id", session.course_id).eq("status", "ACTIVE").maybeSingle();
      if (!enrollment) return response({ error: "Your course access is not active." }, 403);
      const lessons = await loadLessons(session.course_id);
      const order = Number(session.lesson_order || 1);
      const completed = Array.isArray(enrollment.progress?.completed_lessons) ? enrollment.progress.completed_lessons : [];
      const highestCompletedOrder = lessons.reduce((highest, item, index) => completed.includes(item.id) ? Math.max(highest, index + 1) : highest, 0);
      const highWater = Math.min(lessons.length, Math.max(Number(enrollment.progress?.last_lesson_order || 0), highestCompletedOrder));
      const lesson = lessons[order - 1];
      if (order > highWater + 1 || !lesson || String(body.lesson_id || "") !== String(lesson.id)) return response({ error: "This lecture is not the current lesson for your account." }, 409);
      const { error } = await sb.rpc("mark_learning_lesson_complete", {
        p_student_course_id: enrollment.id, p_lesson_id: lesson.id, p_lesson_order: order,
      });
      if (error) throw error;
      const nextOrder = order + 1;
      if (nextOrder > lessons.length) {
        await sb.from("engr_ero_portal_sessions").update({ completed_at: new Date().toISOString() }).eq("id", session.id);
        const [{ data: student }, { data: course }] = await Promise.all([
          sb.from("students").select("phone").eq("id", session.student_id).maybeSingle(),
          sb.from("courses").select("course_code").eq("id", session.course_id).maybeSingle(),
        ]);
        if (session.conversation_id) {
          const { data: conversation } = await sb.from("conversations").select("context_json").eq("id", session.conversation_id).maybeSingle();
          await sb.from("conversations").update({
            current_module: "LEARNING",
            current_state: "COURSE_FINAL_READY",
            context_json: { ...(conversation?.context_json || {}), step: "COURSE_FINAL_READY", learningUnlocked: true },
          }).eq("id", session.conversation_id);
        }
        if (student?.phone) await sendTextMessage(student.phone,
          `🎉 You have completed all the online lectures for *${course?.course_code || "your course"}*. Return to this WhatsApp chat and choose *Final CBT Exam* when you are ready. CBT payment and exam access remain managed here on WhatsApp.`);
        return response({ course_complete: true, total: lessons.length });
      }
      await sb.from("engr_ero_portal_sessions").update({ lesson_order: nextOrder }).eq("id", session.id);
      return response({ course_complete: false, next_order: nextOrder });
    }

    if (session.purpose === "EXAM" && action === "exam_status") {
      if (!session.attempt_id) return response({ ready: true });
      const { data: existing, error } = await sb.from("exam_attempts").select("*").eq("id", session.attempt_id).maybeSingle();
      if (error || !existing) return response({ error: "Exam attempt not found." }, 404);
      if (existing.submitted_at) return response({ completed: true, score: existing.score, percentage: existing.percentage, pass_status: existing.pass_status });
      if (new Date(existing.end_time || session.expires_at).getTime() <= Date.now()) {
        const final = await finishExam(session, existing);
        return response({ completed: true, expired: true, score: final.score, percentage: final.percentage, pass_status: final.pass_status });
      }
      return response(await currentExamQuestion(session, existing));
    }

    if (session.purpose === "EXAM" && action === "start_exam") {
      if (session.attempt_id) {
        const { data: existing } = await sb.from("exam_attempts").select("*").eq("id", session.attempt_id).maybeSingle();
        if (existing) return response(await currentExamQuestion(session, existing));
      }
      const questions = Array.isArray(session.payload_json?.questions) ? session.payload_json.questions : [];
      if (questions.length !== 50 || !session.payment_reference) return response({ error: "The exam question set or confirmed payment reference is missing. Contact the Learning Centre." }, 409);
      const { data: payment } = await sb.from("payment_transactions").select("reference,status,student_id,course_id")
        .eq("reference", session.payment_reference).eq("student_id", session.student_id)
        .eq("course_id", session.course_id).eq("status", "SUCCESSFUL").maybeSingle();
      if (!payment) return response({ error: "A successful CBT payment could not be verified for this link." }, 403);
      const { count, error: countError } = await sb.from("exam_attempts").select("id", { count: "exact", head: true })
        .eq("student_id", session.student_id).eq("course_id", session.course_id);
      if (countError) throw countError;
      if (Number(count || 0) >= 3) return response({ error: "You have reached the three-attempt limit. Contact Engr. Ero for assistance." }, 403);
      const start = new Date();
      const end = new Date(start.getTime() + 30 * 60_000);
      const { data: attempt, error } = await sb.from("exam_attempts").insert({
        student_id: session.student_id, course_id: session.course_id, score: 0,
        total_questions: questions.length, question_ids: questions.map((q: any) => q.id),
        questions_snapshot: questions,
        total_marks: questions.reduce((sum: number, q: any) => sum + Number(q.marks || 1), 0),
        percentage: 0, pass_status: "PENDING", is_locked: false,
        started_at: start.toISOString(), start_time: start.toISOString(), end_time: end.toISOString(),
        answers_json: [], current_question_index: 0,
      }).select("*").single();
      if (error) throw error;
      await sb.from("engr_ero_portal_sessions").update({ attempt_id: attempt.id, started_at: start.toISOString(), expires_at: end.toISOString() }).eq("id", session.id);
      return response(await currentExamQuestion({ ...session, attempt_id: attempt.id }, attempt));
    }

    if (session.purpose === "EXAM" && (action === "exam_state" || action === "submit_answer")) {
      if (!session.attempt_id) return response({ error: "Tap Start Exam to begin your CBT." }, 409);
      const { data: attempt, error } = await sb.from("exam_attempts").select("*").eq("id", session.attempt_id).maybeSingle();
      if (error || !attempt) return response({ error: "Exam attempt not found." }, 404);
      if (attempt.submitted_at) return response({ completed: true, score: attempt.score, percentage: attempt.percentage, pass_status: attempt.pass_status });
      if (new Date(attempt.end_time || session.expires_at).getTime() <= Date.now()) {
        const final = await finishExam(session, attempt);
        return response({ completed: true, expired: true, score: final.score, percentage: final.percentage, pass_status: final.pass_status });
      }
      if (action === "submit_answer") {
        const questions = Array.isArray(session.payload_json?.questions) ? session.payload_json.questions : [];
        const index = Number(body.index);
        const selected = String(body.answer || "").toUpperCase();
        const currentIndex = Number(attempt.current_question_index || 0);
        if (index !== currentIndex || !["A", "B", "C", "D"].includes(selected)) return response({ error: "That answer does not match the current question. Refresh your exam." }, 409);
        const question = questions[currentIndex];
        if (!question) return response({ error: "No active question." }, 409);
        const answers = Array.isArray(attempt.answers_json) ? [...attempt.answers_json] : [];
        if (answers.some((answer: any) => String(answer.question_id) === String(question.id))) return response(await currentExamQuestion(session, attempt));
        const correct = selected === String(question.correct_answer || "").trim().toUpperCase();
        answers.push({ question_id: question.id, selected_option: selected, correct_option: question.correct_answer, is_correct: correct });
        const score = Number(attempt.score || 0) + (correct ? Number(question.marks || 1) : 0);
        const nextIndex = currentIndex + 1;
        const { data: updated, error: saveError } = await sb.from("exam_attempts").update({
          answers_json: answers, score, current_question_index: nextIndex,
        }).eq("id", attempt.id).is("submitted_at", null).select("*").single();
        if (saveError) throw saveError;
        if (nextIndex >= questions.length) {
          const final = await finishExam(session, updated);
          return response({ completed: true, score: final.score, percentage: final.percentage, pass_status: final.pass_status });
        }
        return response(await currentExamQuestion(session, updated));
      }
      return response(await currentExamQuestion(session, attempt));
    }

    return response({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("[engr-ero-portal]", error);
    return response({ error: error instanceof Error ? error.message : "Unexpected portal error." }, 400);
  }
});
