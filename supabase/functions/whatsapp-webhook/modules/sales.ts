// supabase/functions/whatsapp-webhook/modules/sales.ts
// Placeholder for Phase 3 — Sales/Lead qualification

import { Conversation, Contact } from "../database.ts";
import { sendTextMessage } from "../whatsapp.ts";

export async function handleSalesBot(
  phone: string,
  _text: string,
  _contact: Contact,
  _conversation: Conversation
): Promise<void> {
  await sendTextMessage(phone, "🤖 WhatsApp Bot project builder is coming soon. Type *menu* to go back.");
}

export async function handleSalesWebsite(
  phone: string,
  _text: string,
  _contact: Contact,
  _conversation: Conversation
): Promise<void> {
  await sendTextMessage(phone, "🌐 Website project builder is coming soon. Type *menu* to go back.");
}

export async function handleSalesBotWebsite(
  phone: string,
  _text: string,
  _contact: Contact,
  _conversation: Conversation
): Promise<void> {
  await sendTextMessage(phone, "📦 Bot + Website package builder is coming soon. Type *menu* to go back.");
}

export async function handleSalesAutomation(
  phone: string,
  _text: string,
  _contact: Contact,
  _conversation: Conversation
): Promise<void> {
  await sendTextMessage(phone, "⚙️ AI & Automation project builder is coming soon. Type *menu* to go back.");
}
