// supabase/functions/whatsapp-webhook/modules/magazine.ts
// Placeholder for Phase 2 — Product Magazine

import { Conversation, Contact } from "../database.ts";
import { sendTextMessage } from "../whatsapp.ts";

export async function handleMagazine(
  phone: string,
  _text: string,
  _contact: Contact,
  _conversation: Conversation
): Promise<void> {
  await sendTextMessage(phone, "📖 Product Magazine is coming soon. Type *menu* to go back.");
}
