// supabase/functions/whatsapp-webhook/sabi-ai-whatsapp.ts
//
// Arena-powered conversational assistant for the XTOP Sabi WhatsApp line.
// This module is called only by the Sabi fallback route. Engr Ero learning,
// CBT, exam, admin and handoff routes are resolved before it is reached.

import {
  Conversation,
  SYSTEM_TENANT_ID,
  logBotActivity,
  storeMessage,
  updateConversation,
} from "./database.ts";
import { IncomingMessage, sendTextMessage } from "./whatsapp.ts";

interface SabiAIHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

interface SabiAIContact {
  id: string;
  name?: string | null;
}

const SABI_AI_SYSTEM_PROMPT = [
  "You are Sabi AI, the official conversational WhatsApp assistant for Sabi by XTOP, a Nigerian commerce platform.",
  "You are speaking on the main Sabi by XTOP WhatsApp line. Be warm, practical, concise and helpful. Use clear Nigerian English and naturally mirror Nigerian Pidgin when the user uses it.",
  "Help people understand Sabi, discover shops, use the marketplace, onboard merchants, and understand how the Sabi merchant app works.",
  "Known public links: Sabi website https://sabibyxtop.com.ng ; Sabi Discover marketplace https://discover.sabibyxtop.com.ng ; merchant dashboard https://app.sabibyxtop.com.ng .",
  "Sabi Discover is a marketplace for discovering and buying from independent merchants. Merchants manage their own fulfilment and delivery arrangements; do not claim Sabi has its own riders.",
  "Merchants should connect a dedicated business WhatsApp number, not their personal line, because Sabi automation handles messages sent to the connected business number.",
  "You do not have live commerce tools in this WhatsApp release. You cannot look up or change a customer's order, product, stock, delivery fee, payment, refund, wallet, merchant account, or settings. Never pretend that you can.",
  "Never invent product prices, stock availability, delivery charges, order status, payment confirmation, policies, or merchant details. If a fact is not in the conversation or the known information above, say you cannot verify it.",
  "For shopping or merchant account actions that require live records, guide the person to the relevant merchant or Sabi dashboard. For human assistance, tell them to type MENU and choose Talk to Support.",
  "The existing Engr Ero Learning Centre assistant is also available on this shared number. If someone wants it, tell them to type ENGR ERO. Do not answer course, lecture, attendance, CBT or student-result questions as Sabi AI.",
  "Users can type MENU at any time to open the Sabi WhatsApp menu.",
  "Never request passwords, one-time codes, API keys, card numbers, payment PINs, or other authentication secrets.",
  "Do not claim to have submitted an order, made a payment, changed a setting, contacted a human, or completed any action unless an existing system explicitly confirms it.",
].join("\n");

function cleanHistory(value: unknown): SabiAIHistoryMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> =>
      !!item && typeof item === "object" &&
      (item.role === "user" || item.role === "assistant") &&
      typeof item.content === "string"
    )
    .map((item) => ({
      role: item.role as "user" | "assistant",
      content: String(item.content).slice(0, 1800),
    }))
    .slice(-12);
}

export async function handleSabiWhatsAppAI(
  incoming: IncomingMessage,
  message: string,
  contact: SabiAIContact,
  conversation: Conversation,
): Promise<void> {
  const apiKey = Deno.env.get("ARENA_API_KEY") || "";
  const model = Deno.env.get("ARENA_MODEL") || "gpt-6-luna";

  if (!apiKey) {
    const notice = "Sabi AI is not available at the moment. Please type MENU to use the Sabi options or try again shortly.";
    const messageId = await sendTextMessage(incoming.from, notice);
    if (messageId) {
      await storeMessage(contact.id, "OUTBOUND", "text", notice, messageId, SYSTEM_TENANT_ID);
      await logBotActivity(incoming.from, "OUTBOUND", "text", "SABI_AI", notice, contact.name || "WhatsApp customer", "", messageId, SYSTEM_TENANT_ID);
    }
    return;
  }

  const existingContext = (conversation.context_json || {}) as Record<string, unknown>;
  const previousHistory = cleanHistory(existingContext.sabi_ai_history);
  const safeMessage = String(message || "").trim().slice(0, 3000);
  if (!safeMessage) return;

  const requestMessages = [
    { role: "system", content: SABI_AI_SYSTEM_PROMPT },
    ...previousHistory,
    { role: "user", content: safeMessage },
  ];

  let reply = "";
  try {
    const response = await fetch("https://api.arena.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      // Keep the Arena request minimal; this is the working Sabi AI format.
      body: JSON.stringify({ model, messages: requestMessages }),
    });

    if (!response.ok) {
      const providerError = await response.text();
      console.error("[SABI_AI_WHATSAPP] Arena error:", response.status, providerError.slice(0, 350));
      reply = response.status === 429
        ? "I'm receiving many messages right now. Please give me a moment and try again. You can type MENU for the Sabi options."
        : "Sorry, Sabi AI is having a temporary issue. Please try again shortly or type MENU for the Sabi options.";
    } else {
      const result = await response.json();
      const content = result?.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.trim()) {
        reply = content.trim().slice(0, 3500);
      } else {
        reply = "Sorry, I couldn't prepare a response just now. Please try again or type MENU for the Sabi options.";
      }
    }
  } catch (error) {
    console.error("[SABI_AI_WHATSAPP] Request failed:", error instanceof Error ? error.message : "unknown error");
    reply = "Sorry, Sabi AI is temporarily unavailable. Please try again shortly or type MENU for the Sabi options.";
  }

  const whatsappMessageId = await sendTextMessage(incoming.from, reply);
  if (!whatsappMessageId) {
    console.error("[SABI_AI_WHATSAPP] WhatsApp delivery failed; reply was not saved as delivered.");
    return;
  }

  await storeMessage(
    contact.id,
    "OUTBOUND",
    "text",
    reply,
    whatsappMessageId,
    SYSTEM_TENANT_ID,
  );
  await logBotActivity(
    incoming.from,
    "OUTBOUND",
    "text",
    "SABI_AI",
    reply,
    contact.name || "WhatsApp customer",
    "",
    whatsappMessageId,
    SYSTEM_TENANT_ID,
  );

  const nextHistory: SabiAIHistoryMessage[] = [
    ...previousHistory,
    { role: "user", content: safeMessage },
    { role: "assistant", content: reply },
  ].slice(-12);

  const updated = await updateConversation(
    conversation.id,
    {
      current_module: "SABI_AI",
      current_state: "ACTIVE",
      context_json: {
        ...existingContext,
        sabi_ai_active: true,
        sabi_ai_history: nextHistory,
      },
    },
    SYSTEM_TENANT_ID,
  );

  if (!updated) {
    console.error("[SABI_AI_WHATSAPP] Reply sent but conversation history could not be updated.");
  }
}
