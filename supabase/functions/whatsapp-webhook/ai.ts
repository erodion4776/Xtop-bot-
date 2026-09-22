// supabase/functions/whatsapp-webhook/ai.ts

import { safeErrorLog } from "./utils.ts";

/**
 * AI module — configurable provider via environment variables.
 *
 * Supports OpenAI-compatible APIs (OpenAI, Groq, Together, OpenRouter, etc.)
 * Set AI_API_KEY, AI_MODEL, and optionally AI_BASE_URL.
 */

interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface AIOptions {
  temperature?: number;
  maxTokens?: number;
}

export async function callAI(
  systemPrompt: string,
  userMessage: string,
  conversationHistory?: AIMessage[],
  options?: AIOptions
): Promise<string> {
  const apiKey = Deno.env.get("AI_API_KEY");
  const model = Deno.env.get("AI_MODEL") || "gpt-4o-mini";
  const baseUrl = Deno.env.get("AI_BASE_URL") || "https://api.openai.com/v1";

  if (!apiKey) {
    safeErrorLog("callAI", new Error("Missing AI_API_KEY"));
    return "I'm having trouble right now. Please choose an option from the menu or type AGENT to speak with our team.";
  }

  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  if (conversationHistory && conversationHistory.length > 0) {
    // Keep only last 10 exchanges to stay within token limits
    messages.push(...conversationHistory.slice(-20));
  }

  messages.push({ role: "user", content: userMessage });

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 500,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      safeErrorLog("callAI:response", new Error(`${resp.status}: ${errText}`));
      return "Sorry, I'm having trouble processing that right now. Please choose an option from the menu or type AGENT to speak with our team.";
    }

    const data = await resp.json();
    return data.choices?.[0]?.message?.content?.trim() ||
      "I couldn't generate a response. Please try again or type MENU for options.";
  } catch (err) {
    safeErrorLog("callAI", err);
    return "Sorry, I'm having trouble processing that right now. Please choose an option from the menu or type AGENT to speak with our team.";
  }
}

/**
 * Sabi system prompt — used when AI needs to interpret free-text.
 * This does NOT give AI control over business logic, only NLU.
 */
export const SABI_SYSTEM_PROMPT = `You are Sabi, the AI assistant for Xtop Retail Technologies.

Your role is ONLY to understand the user's intent and extract structured information.
You do NOT make decisions about pricing, access, payments, or business logic.

Xtop Retail Technologies offers:
- XtopEdu: WhatsApp-based school management for Nigerian schools
- NaijaShop.com: Retail/business management with WhatsApp integration
- WhatsApp AI Bots
- Business Websites
- AI & Business Automation
- Custom Software

Be professional, friendly, concise, and Nigerian-business aware.
Never invent prices, products, features, or links.
If you don't know something, say so honestly.`;
