// supabase/functions/whatsapp-webhook/modules/products.ts
// Placeholder for Phase 2 — Products module

import { Conversation, Contact } from "../database.ts";
import { sendTextMessage } from "../whatsapp.ts";

export async function handleProducts(
  _phone: string,
  _text: string,
  _contact: Contact,
  _conversation: Conversation
): Promise<void> {
  // Phase 2 implementation
  await sendTextMessage(_phone, "📦 Our Products section is coming soon. Type *menu* to go back.");
}
