// supabase/functions/whatsapp-webhook/modules/demos.ts
// Placeholder for Phase 2 — Demo Centre

import { Conversation, Contact } from "../database.ts";
import { sendTextMessage } from "../whatsapp.ts";

export async function handleDemos(
  phone: string,
  _text: string,
  _contact: Contact,
  _conversation: Conversation
): Promise<void> {
  await sendTextMessage(phone, "🎮 Demo Centre is coming soon. Type *menu* to go back.");
}
