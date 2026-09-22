// supabase/functions/whatsapp-webhook/modules/learning.ts
// Placeholder for Phase 4 — Engr. Ero Learning Centre

import { Conversation, Contact } from "../database.ts";
import { sendTextMessage } from "../whatsapp.ts";

export async function handleLearning(
  phone: string,
  _text: string,
  _contact: Contact,
  _conversation: Conversation
): Promise<void> {
  await sendTextMessage(
    phone,
    "🎓 *Engr. Ero Learning Centre*\n\nThe Learning Centre is coming soon. Type *menu* to go back."
  );
}
