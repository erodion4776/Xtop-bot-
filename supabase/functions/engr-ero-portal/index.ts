import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
async function sendTextMessage(to: string, body: string): Promise<string | null> {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
  if (!accessToken || !phoneNumberId) return null;
  try {
    const result = await fetch("https://graph.facebook.com/v21.0/" + encodeURIComponent(phoneNumberId) + "/messages", {
      method: "POST",
      headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to,
        type: "text", text: { preview_url: false, body } }),
    });
    if (!result.ok) return null;
    const data = await result.json();
    return data?.messages?.[0]?.id || null;
  } catch { return null; }
}

// All student access is mediated by short-lived, hashed, WhatsApp-verified tokens.\n// The browser receives neither service credentials nor CBT answer keys.\n// Session deadlines are enforced by the database timestamp, never the client clock.

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
  const isEla401Classroom = data?.payload_json?.course_mode === "ELA401_MTM_CLASSROOM";
  const completedLessonReadAllowed = isEla401Classroom && body.action === "lesson";
  if (error || !data || (data.completed_at && data.purpose !== "EXAM" && body.action !== "save_mtm_simulation" && !completedLessonReadAllowed)) throw new Error("Your secure session has expired or has already been completed. Return to WhatsApp for a new link.");
  if (new Date(data.expires_at).getTime() <= Date.now() && !(data.purpose === "EXAM" && data.attempt_id)) throw new Error("This link has expired. Return to WhatsApp to request a new link.");
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
  if (!updated) {
    const { data: latest } = await sb.from("exam_attempts").select("*").eq("id", attempt.id).maybeSingle();
    if (latest?.submitted_at) return latest;
    throw new Error("The exam could not be finalized. Please retry.");
  }
  const finalAttempt = updated;
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
function currentExamQuestion(session: any, attempt: any) {
  const questions = Array.isArray(session.payload_json?.questions) ? session.payload_json.questions : [];
  const index = Number(attempt.current_question_index || 0);
  if (attempt.submitted_at || index >= questions.length) return { completed: true, score: attempt.score, percentage: attempt.percentage, pass_status: attempt.pass_status };
  return { completed: false, index, total: questions.length, question: safeQuestion(questions[index]), expires_at: attempt.end_time || session.expires_at };
}


const ADMIN_EMAIL = "eroeliza1234@gmail.com";
async function requireAdmin(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error("Admin sign-in is required.");
  const { data, error } = await sb.auth.getUser(match[1]);
  if (error || !data?.user || String(data.user.email || "").toLowerCase() !== ADMIN_EMAIL) {
    throw new Error("This account is not authorized for lecturer preview.");
  }
  return data.user;
}
async function adminPreview(action: string, body: any) {
  if (action === "admin_courses") {
    const { data, error } = await sb.from("courses")
      .select("id,course_code,course_name,status").order("course_code", { ascending: true });
    if (error) throw error;
    return response({ courses: data || [] });
  }
  if (action === "admin_lessons") {
    const courseId = String(body.course_id || "");
    if (!courseId) return response({ error: "Select a course." }, 400);
    const lessons = await loadLessons(courseId);
    return response({ lessons: lessons.map((item, index) => ({
      id: item.id, title: item.title, order: index + 1,
      module_title: item.moduleTitle, duration: item.duration,
    })) });
  }
  if (action === "admin_preview") {
    const courseId = String(body.course_id || "");
    const lessonId = String(body.lesson_id || "");
    if (!courseId || !lessonId) return response({ error: "Select a lecture to preview." }, 400);
    const lessons = await loadLessons(courseId);
    const order = lessons.findIndex((item) => String(item.id) === lessonId);
    if (order < 0) return response({ error: "Lecture not found in this course." }, 404);
    const lesson = lessons[order];
    const [{ data: sections, error: sectionError }, { data: media, error: mediaError },
      { data: course, error: courseError }, { data: presentation, error: presentationError }] = await Promise.all([
      sb.from("lesson_sections").select("id,title,content,order_index").eq("lesson_id", lesson.id).order("order_index", { ascending: true }),
      sb.from("lesson_media").select("id,file_url,caption,description,order_index").eq("lesson_id", lesson.id).order("order_index", { ascending: true }),
      sb.from("courses").select("course_code,course_name").eq("id", courseId).maybeSingle(),
      sb.from("engr_ero_lecture_presentations").select("title,html_content").eq("lesson_id", lesson.id).maybeSingle(),
    ]);
    if (sectionError || mediaError || courseError || presentationError) throw sectionError || mediaError || courseError || presentationError;
    return response({
      course, order: order + 1, total: lessons.length,
      lesson: { id: lesson.id, title: presentation?.title || lesson.title,
        objectives: lesson.objectives, duration: presentation ? "70 minutes" : lesson.duration,
        image_url: lesson.image_url, module_title: lesson.moduleTitle },
      sections: sections || [], media: media || [],
      ...(presentation ? { presentation_html: presentation.html_content } : {}),
      preview_only: true,
    });
  }
  return response({ error: "Unsupported admin action." }, 400);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "POST required" }, 405);
  const origin = req.headers.get("Origin") || "";
  if (origin && origin !== "https://xtopbot.netlify.app") return response({ error: "Origin not allowed" }, 403);
  try {
    const body = await req.json();
    const action = String(body.action || "");

    if (action.startsWith("admin_")) {
      await requireAdmin(req);
      return await adminPreview(action, body);
    }

    if (action === "sweep_expired_exams") {
      const cronSecret = Deno.env.get("ENGR_ERO_CRON_SECRET") || "";
      if (!cronSecret || req.headers.get("x-portal-cron-secret") !== cronSecret) {
        return response({ error: "Not authorized." }, 401);
      }
      const now = new Date().toISOString();
      const { data: expiredAttempts, error: expiredError } = await sb.from("exam_attempts")
        .select("*").is("submitted_at", null).not("started_at", "is", null)
        .lte("end_time", now).order("end_time", { ascending: true }).limit(100);
      if (expiredError) throw expiredError;
      let submitted = 0;
      for (const attempt of expiredAttempts || []) {
        const { data: session } = await sb.from("engr_ero_portal_sessions").select("*")
          .eq("attempt_id", attempt.id).eq("purpose", "EXAM").maybeSingle();
        if (!session || session.completed_at) continue;
        await finishExam(session, attempt);
        submitted += 1;
      }
      return response({ success: true, submitted, checked_at: now });
    }

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
    const [{ data: currentStudent, error: studentStatusError }, { data: courseAccess, error: accessError }] = await Promise.all([
      sb.from("students").select("status").eq("id", session.student_id).maybeSingle(),
      sb.from("student_course_access").select("access_status")
        .eq("student_id", session.student_id).eq("course_id", session.course_id).maybeSingle(),
    ]);
    if (studentStatusError || accessError) throw studentStatusError || accessError;
    if (!currentStudent || String(currentStudent.status || "ACTIVE").toUpperCase() !== "ACTIVE") {
      return response({ error: "Your student registration is not active. Contact the Learning Centre." }, 403);
    }
    if (String(courseAccess?.access_status || "").toUpperCase() === "BLOCKED") {
      return response({ error: "Your access to this course has been blocked by the lecturer." }, 403);
    }

    if (session.purpose === "LESSON" && action === "save_mtm_simulation") {
      const { data: course, error: courseError } = await sb.from("courses")
        .select("course_code").eq("id", session.course_id).maybeSingle();
      if (courseError) throw courseError;
      if (String(course?.course_code || "").toUpperCase() !== "ELA401") {
        return response({ error: "This practical simulation is only available for the 400 Level course." }, 403);
      }
      const result = body.result && typeof body.result === "object" ? body.result : {};
      const steps = Array.isArray(result.steps) ? result.steps.slice(0, 20) : [];
      // The current 2D workbench records each completed operation by its operation name.
      // Accept the legacy label field as well so previously issued classroom links remain compatible.
      const validCompletedSteps = steps.length === 12 && steps.every((step: any) =>
        step && step.correct === true &&
        (typeof step.operation === "string" || typeof step.label === "string")
      );
      if (!validCompletedSteps) {
        return response({ error: "The server could not verify all 12 completed plug assembly operations. Please refresh the classroom and repeat the simulation." }, 400);
      }
      const elapsed = Math.max(0, Math.min(86400, Number(result.elapsed_seconds || 0)));
      const accuracy = Math.max(0, Math.min(100, Number(result.accuracy_percent || 0)));
      const payload = {
        ...(session.payload_json && typeof session.payload_json === "object" ? session.payload_json : {}),
        mtm_simulation_result: {
          ...result, elapsed_seconds: elapsed, accuracy_percent: accuracy,
          saved_at: new Date().toISOString(),
        },
      };
      const { error: saveError } = await sb.from("engr_ero_portal_sessions")
        .update({ payload_json: payload }).eq("id", session.id);
      if (saveError) throw saveError;
      if (session.conversation_id) {
        const { data: conversation, error: conversationError } = await sb.from("conversations")
          .select("context_json").eq("id", session.conversation_id).maybeSingle();
        if (conversationError) throw conversationError;
        await sb.from("conversations").update({
          current_module: "LEARNING",
          current_state: "COURSE_FINAL_READY",
          context_json: {
            ...(conversation?.context_json || {}),
            step: "COURSE_FINAL_READY",
            learningUnlocked: true,
            mtmSimulationCompleted: true
          }
        }).eq("id", session.conversation_id);
      }
      return response({ success: true, saved_at: payload.mtm_simulation_result.saved_at });
    }

    if (session.purpose === "LESSON" && action === "lesson") {
      const { data: enrollment, error: enrollmentError } = await sb.from("student_courses").select("id,progress,status")
        .eq("student_id", session.student_id).eq("course_id", session.course_id).eq("status", "ACTIVE").maybeSingle();
      if (enrollmentError || !enrollment) return response({ error: "Your course access is not active. Contact the Learning Centre." }, 403);
      if (session.payload_json?.course_mode === "ELA401_MTM_CLASSROOM") {
        const { data: course, error: courseError } = await sb.from("courses")
          .select("course_code,course_name").eq("id", session.course_id).maybeSingle();
        if (courseError) throw courseError;
        if (String(course?.course_code || "").toUpperCase() !== "ELA401") {
          return response({ error: "This classroom link is not valid for ELA401." }, 403);
        }
        return response({
          course, order: 1, total: 1,
          lesson: {
            id: "ELA401-EXP17",
            title: "Determination of Normal Time Using the Method-Time Measurement (MTM) Technique",
            duration: "Experiment 17",
            objectives: "Determine normal time for the assembly of a three-point electric plug by applying the MTM technique."
          },
          sections: [
            {
              title: "Aim and apparatus",
              content: "Aim: To determine normal time for assembling a three-point electric plug using the Method-Time Measurement (MTM) technique.\n\nApparatus: Three-point electric plug, screwdriver and the official MTM tables."
            },
            {
              title: "Experimental arrangement",
              content: "Place the plug and screwdriver on the desk before the operation begins. The student's hands start resting on the desk. The operation ends when both hands return to the resting position. Use the supplied laboratory manual and official MTM tables for the motion symbols and time values."
            },
            {
              title: "Procedure",
              content: "1. Observe the complete plug-assembly task.\n2. Break the task into individual motions and record the left-hand and right-hand activities.\n3. Identify the applicable MTM motion elements and symbols using the official MTM tables.\n4. Read the time value for each motion from those tables.\n5. Record the limiting time and add the applicable values to obtain the total TMU.\n6. Convert the total TMU to normal time using the stated conversion.\n7. Compare the result with Experiment Sixteen and discuss difficulties encountered when applying MTM."
            },
            {
              title: "Results to record",
              content: "Use the result-table headings in your laboratory manual: Left-hand description; LH symbol; Limiting time (TMU); RH symbol; Right-hand description. Record each observed motion in its correct row. Do not guess missing motion symbols or TMU values; obtain them from the official MTM tables supplied for the experiment."
            },
            {
              title: "Calculation and conclusion",
              content: "Conversion: 1 TMU = 0.0006 minute = 0.036 second.\n\nTime in minutes = Total TMU × 0.0006.\nTime in seconds = Total TMU × 0.036.\n\nAdd the applicable MTM limiting-time values to obtain total TMU before converting. In your discussion, state the difficulties encountered and compare your findings with Experiment Sixteen. Conclude from the values you actually recorded."
            }
          ],
          media: [],
          classroom_mode: "ELA401_MTM_CLASSROOM"
        });
      }
      const lessons = await loadLessons(session.course_id);
      const completed = Array.isArray(enrollment.progress?.completed_lessons) ? enrollment.progress.completed_lessons : [];
      const highestCompletedOrder = lessons.reduce((highest, item, index) => completed.includes(item.id) ? Math.max(highest, index + 1) : highest, 0);
      const highWater = Math.min(lessons.length, Math.max(Number(enrollment.progress?.last_lesson_order || 0), highestCompletedOrder));
      if (highWater >= lessons.length) {
        const { data: completedCourse } = await sb.from("courses").select("course_code,course_name")
          .eq("id", session.course_id).maybeSingle();
        return response({ course_complete: true, total: lessons.length, course: completedCourse });
      }
      const order = Number(session.lesson_order || 1);
      if (order > highWater + 1 || order < 1 || order > lessons.length) return response({ error: "Complete the previous lecture before opening this one." }, 403);
      const lesson = lessons[order - 1];
      const [{ data: sections, error: sectionError }, { data: media, error: mediaError }, { data: course }, { data: presentation, error: presentationError }] = await Promise.all([
        sb.from("lesson_sections").select("id,title,content,order_index").eq("lesson_id", lesson.id).order("order_index", { ascending: true }),
        sb.from("lesson_media").select("id,file_url,caption,description,order_index").eq("lesson_id", lesson.id).order("order_index", { ascending: true }),
        sb.from("courses").select("course_code,course_name").eq("id", session.course_id).maybeSingle(),
        sb.from("engr_ero_lecture_presentations").select("title,html_content").eq("lesson_id", lesson.id).maybeSingle(),
      ]);
      if (sectionError || mediaError || presentationError) throw sectionError || mediaError || presentationError;
      return response({
        course, order, total: lessons.length,
        lesson: { id: lesson.id, title: presentation?.title || lesson.title, objectives: lesson.objectives, duration: presentation ? "70 minutes" : lesson.duration, image_url: lesson.image_url, module_title: lesson.moduleTitle },
        sections: sections || [], media: media || [],
        ...(presentation ? { presentation_html: presentation.html_content } : {}),
        completed_count: highWater,
      });
    }

    if (session.purpose === "LESSON" && action === "complete_lesson") {
      const { data: enrollment } = await sb.from("student_courses").select("id,progress,status")
        .eq("student_id", session.student_id).eq("course_id", session.course_id).eq("status", "ACTIVE").maybeSingle();
      if (!enrollment) return response({ error: "Your course access is not active." }, 403);
      if (session.payload_json?.course_mode === "ELA401_MTM_CLASSROOM") {
        const { data: course, error: courseError } = await sb.from("courses")
          .select("course_code,course_name").eq("id", session.course_id).maybeSingle();
        if (courseError) throw courseError;
        if (String(course?.course_code || "").toUpperCase() !== "ELA401") {
          return response({ error: "This classroom link is not valid for ELA401." }, 403);
        }
        const completedAt = new Date().toISOString();
        const progress = enrollment.progress && typeof enrollment.progress === "object" ? enrollment.progress : {};
        const { error: progressError } = await sb.from("student_courses")
          .update({ progress: { ...progress, ela401_lecture_completed_at: completedAt } })
          .eq("id", enrollment.id);
        if (progressError) throw progressError;
        const payload = {
          ...(session.payload_json && typeof session.payload_json === "object" ? session.payload_json : {}),
          lecture_completed_at: completedAt
        };
        const { error: sessionError } = await sb.from("engr_ero_portal_sessions")
          .update({ completed_at: completedAt, payload_json: payload }).eq("id", session.id);
        if (sessionError) throw sessionError;
        return response({ course_complete: true, total: 1 });
      }
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
      const { data: startLock } = await sb.from("engr_ero_portal_sessions").update({
        started_at: start.toISOString(),
      }).eq("id", session.id).is("started_at", null).is("attempt_id", null).select("id").maybeSingle();
      if (!startLock) return response({ error: "Your exam is already starting in this browser. Refresh the page in a moment." }, 409);
      const { data: attempt, error } = await sb.from("exam_attempts").insert({
        student_id: session.student_id, course_id: session.course_id, score: 0,
        total_questions: questions.length, question_ids: questions.map((q: any) => q.id),
        questions_snapshot: questions,
        total_marks: questions.reduce((sum: number, q: any) => sum + Number(q.marks || 1), 0),
        percentage: 0, pass_status: "PENDING", is_locked: false,
        started_at: start.toISOString(), start_time: start.toISOString(), end_time: end.toISOString(),
        answers_json: [], current_question_index: 0,
      }).select("*").single();
      if (error) {
        await sb.from("engr_ero_portal_sessions").update({ started_at: null }).eq("id", session.id).is("attempt_id", null);
        throw error;
      }
      const { error: sessionUpdateError } = await sb.from("engr_ero_portal_sessions")
        .update({ attempt_id: attempt.id, started_at: start.toISOString(), expires_at: end.toISOString() }).eq("id", session.id);
      if (sessionUpdateError) throw sessionUpdateError;
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
