// supabase/functions/whatsapp-webhook/modules/learning.ts

import { Conversation, Contact, updateConversation } from "../database.ts";
import { sendTextMessage } from "../whatsapp.ts";

export async function handleLearning(
  phone: string,
  _text: string,
  _contact: Contact,
  conversation: Conversation
): Promise<void> {
  await updateConversation(conversation.id, {
    current_module: "LEARNING",
    current_state: "WAITING_COURSE_CODE",
    context_json: {},
  });

  await sendTextMessage(
    phone,
    "🎓 *Engr. Ero Learning Centre*\n\n" +
    "Welcome to the academic portal.\n\n" +
    "Please enter your course code to continue (e.g. *ELA301*, *ELA302*, or *ELA401*):\n\n" +
    "_Type *menu* to return to the main menu._"
  );
}
