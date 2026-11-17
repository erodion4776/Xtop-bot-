// Shared ENGR ERO portal link issuer. Only called from the trusted WhatsApp webhook.
import { getSupabaseClient } from "../database.ts";
import { sendTextMessage } from "../whatsapp.ts";

const supabase = getSupabaseClient();

function randomToken(bytes = 32): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const value of data) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function portalUrl(token: string): string {
  return `https://xtopbot.netlify.app/engr-ero-portal.html?token=${encodeURIComponent(token)}`;
}

export async function issueLessonPortalLink(
  phone: string,
  conversationId: string,
  ctx: { studentId?: string; courseId?: string; courseCode?: string; courseName?: string },
  lessonOrder: number,
): Promise<boolean> {
  if (!conversationId || !ctx.studentId || !ctx.courseId || !Number.isInteger(lessonOrder) || lessonOrder < 1) return false;
  const token = randomToken();
  const { error } = await supabase.from("engr_ero_portal_sessions").insert({
    access_token_hash: await sha256(token),
    purpose: "LESSON",
    conversation_id: conversationId,
    student_id: ctx.studentId,
    course_id: ctx.courseId,
    lesson_order: lessonOrder,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    payload_json: {},
  });
  if (error) {
    console.error("[engr-ero-portal] lesson token insert failed", error);
    return false;
  }
  const sent = await sendTextMessage(
    phone,
    `🎓 *Engr. Ero Learning Centre — Online Classroom*\n\nYour next lecture for *${ctx.courseCode || "your course"}* is ready.\n\nOpen your personal classroom link:\n${portalUrl(token)}\n\nFor security, open it on your phone and request the verification code. The code will be sent to this registered WhatsApp number. Do not share it.\n\n_This link expires in 24 hours._`,
  );
  return !!sent;
}

export async function issueExamPortalLink(
  phone: string,
  conversationId: string,
  ctx: {
    studentId?: string; courseId?: string; courseCode?: string; courseName?: string;
    questions?: any[]; attemptsCount?: number; examFeeNaira?: number; paymentReference?: string;
  },
): Promise<boolean> {
  if (!conversationId || !ctx.studentId || !ctx.courseId || !ctx.paymentReference || !Array.isArray(ctx.questions) || ctx.questions.length !== 50) return false;
  const token = randomToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const payload = {
      course_code: ctx.courseCode || "CBT",
      course_name: ctx.courseName || "",
      questions: ctx.questions,
      attempts_count: Number(ctx.attemptsCount || 0),
      duration_minutes: 30,
    };
  const { data: existing } = await supabase.from("engr_ero_portal_sessions")
    .select("id,attempt_id,started_at,completed_at")
    .eq("payment_reference", ctx.paymentReference).maybeSingle();
  if (existing?.attempt_id || existing?.started_at || existing?.completed_at) {
    await sendTextMessage(phone, "Your CBT link for this payment has already been opened or used. Continue on the same verified phone/browser. If you have lost access to that device, contact the Learning Centre before making another payment.");
    return true;
  }
  const write = existing
    ? await supabase.from("engr_ero_portal_sessions").update({
        access_token_hash: tokenHash, conversation_id: conversationId, expires_at: expiresAt, payload_json: payload,
        otp_hash: null, otp_expires_at: null, otp_sent_at: null, otp_attempts: 0,
        session_token_hash: null, device_hash: null, redeemed_at: null,
      }).eq("id", existing.id)
    : await supabase.from("engr_ero_portal_sessions").insert({
        access_token_hash: tokenHash, purpose: "EXAM", conversation_id: conversationId, student_id: ctx.studentId,
        course_id: ctx.courseId, payment_reference: ctx.paymentReference,
        expires_at: expiresAt, payload_json: payload,
      });
  if (write.error) {
    console.error("[engr-ero-portal] exam token insert failed", write.error);
    return false;
  }
  const sent = await sendTextMessage(
    phone,
    `🎉 *CBT payment confirmed — ${ctx.courseCode || "Course"}*\n\nYour personal CBT link is ready:\n${portalUrl(token)}\n\nOpen the link on your phone, request the verification code sent to this registered WhatsApp number, then start when you are ready.\n\n⏱️ Duration: *30 minutes*\n🔒 One student, one verified browser session. Do not forward the link or code.\n\n_The timer begins only when you tap Start Exam._`,
  );
  return !!sent;
}

/** Re-issues access to an already-started web CBT without changing its timer or attempt. */
export async function resendActiveExamPortalLink(phone: string, attemptId: string): Promise<boolean> {
  const { data: session, error } = await supabase.from("engr_ero_portal_sessions")
    .select("id,attempt_id,completed_at").eq("attempt_id", attemptId).eq("purpose", "EXAM").maybeSingle();
  if (error || !session || session.completed_at) return false;
  const token = randomToken();
  const { error: updateError } = await supabase.from("engr_ero_portal_sessions").update({
    access_token_hash: await sha256(token),
    session_token_hash: null,
    device_hash: null,
    otp_hash: null,
    otp_expires_at: null,
    otp_sent_at: null,
    otp_attempts: 0,
    redeemed_at: null,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }).eq("id", session.id);
  if (updateError) {
    console.error("[engr-ero-portal] active CBT link recovery failed", updateError);
    return false;
  }
  const sent = await sendTextMessage(phone,
    `🔄 *Resume your existing CBT*\n\nYour examination is already in progress. Open this refreshed personal link and verify with the code sent to your registered WhatsApp number:\n${portalUrl(token)}\n\n⏱️ Your original 30-minute timer has NOT been reset. Only your access link has been refreshed.`);
  return !!sent;
}
