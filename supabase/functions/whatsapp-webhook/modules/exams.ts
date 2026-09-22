// supabase/functions/whatsapp-webhook/modules/exams.ts
// Phase 4/5 — Examination Engine Entry & Access Control

import {
  Contact, Conversation, updateConversation,
} from "../database.ts";
import {
  sendButtonMessage, sendTextMessage, makeButton,
} from "../whatsapp.ts";
import { normalise, isBack } from "../utils.ts";

export interface ExamContext {
  courseId?: string;
  courseCode?: string;
  courseName?: string;
  studentId?: string;
  step?: string;
}

export async function startExamEntry(
  phone: string,
  conversationId: string,
  ctx: ExamContext
): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "EXAMS",
    current_state: "EXAM_ENTRY",
    context_json: { ...ctx, step: "EXAM_ENTRY" },
  });

  await sendButtonMessage(
    phone,
    `📝 *EXAMINATION PORTAL: ${ctx.courseCode || "COURSE"}*\n\n` +
    `*Course:* ${ctx.courseName || "Academic Test"}\n\n` +
    `📌 *Instructions:*\n` +
    `• Questions are graded automatically server-side.\n` +
    `• Select your answer using the buttons provided.\n` +
    `• Your score will be saved to your student record.\n\n` +
    `Are you ready to begin?`,
    [
      makeButton("exam_begin", "🚀 Start Test"),
      makeButton("exam_cancel", "🔙 Back to Course"),
    ],
    "CBT Examination",
    "Engr. Ero Learning Centre"
  );
}

export async function handleExams(
  phone: string,
  text: string,
  contact: Contact,
  conv: Conversation
): Promise<void> {
  const n = normalise(text);
  const ctx = (conv.context_json || {}) as ExamContext;

  if (n === "exam_cancel" || isBack(text)) {
    await updateConversation(conv.id, {
      current_module: "LEARNING",
      current_state: "COURSE_MENU",
      context_json: { ...ctx, step: "COURSE_MENU" },
    });
    const { handleLearning } = await import("./learning.ts");
    await handleLearning(phone, "menu", contact, conv);
    return;
  }

  if (n === "exam_begin" || n.includes("start")) {
    await sendTextMessage(
      phone,
      `📝 *Exam Engine Initializing...*\n\n` +
      `The full CBT question engine is being finalized in Phase 5.\n\n` +
      `Type *back* to return to the course menu.`
    );
    return;
  }

  await sendTextMessage(phone, "Please choose an option to proceed with your exam.");
}
