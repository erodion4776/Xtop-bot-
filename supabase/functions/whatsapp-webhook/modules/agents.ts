// supabase/functions/whatsapp-webhook/modules/agents.ts
// Placeholder for Phase 2 — Talk to an Agent

import { Conversation, Contact, updateConversation } from "../database.ts";
import { sendTextMessage, sendListMessage, makeListRow } from "../whatsapp.ts";

export async function handleAgent(
  phone: string,
  text: string,
  contact: Contact,
  conversation: Conversation
): Promise<void> {
  // For Phase 1, show a simple message
  await updateConversation(conversation.id, {
    current_module: "AGENT",
    current_state: "REQUESTED",
    context_json: { agent_requested: true },
  });

  await sendTextMessage(
    phone,
    `👤 *Talk to an Agent*\n\nThank you for reaching out, ${contact.name || "there"}.\n\nAn Xtop Retail Technologies team member will follow up with you shortly.\n\nIn the meantime, you can type *menu* to explore other options.`
  );
}
