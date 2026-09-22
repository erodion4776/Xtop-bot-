// supabase/functions/whatsapp-webhook/modules/exams.ts
// Placeholder for Phase 5 — Examination system

import { Conversation, Contact } from "../database.ts";
import { sendTextMessage } from "../whatsapp.ts";

export async function handleExams(
  phone: string,
  _text: string,
  _contact: Contact,
  _conversation: Conversation
): Promise<void> {
  await sendTextMessage(phone, "📝 Exam system is coming soon. Type *menu* to go back.");
}
