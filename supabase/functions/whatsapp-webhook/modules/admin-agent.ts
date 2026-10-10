
 // supabase/functions/whatsapp-webhook/modules/admin-agent.ts

import {
  getSupabaseClient,
  updateConversation,
} from "../database.ts";

import { sendTextMessage } from "../whatsapp.ts";
import { callAI } from "../ai.ts";

const supabase = getSupabaseClient();

function normalizePhone(raw: string): string {
  let phone = (raw || "").replace(/\D/g, "");

  if (phone.startsWith("0") && phone.length === 11) {
    phone = "234" + phone.slice(1);
  }

  return phone;
}

/**
 * The admin number must be configured as a Supabase secret.
 * Never trust a phone number supplied in the message body.
 */
export function isAdminPhone(phone: string): boolean {
  const configured = Deno.env.get("XTOP_ADMIN_PHONE") || "";

  if (!configured) {
    console.error("[AdminAgent] XTOP_ADMIN_PHONE is not configured.");
    return false;
  }

  return normalizePhone(phone) === normalizePhone(configured);
}

/**
 * Only the exact word "Lizzy" opens the private assistant.
 * Interactive buttons may use the dedicated internal ID.
 */
export function isAdminAgentTrigger(
  text: string,
  interactiveId = "",
): boolean {
  return (
    text.trim().toLowerCase() === "lizzy" ||
    interactiveId === "admin_agent_open"
  );
}

export async function showAdminAgentMenu(phone: string): Promise<void> {
  const message = [
    "🔐 *XTOP PRIVATE ADMIN AGENT*",
    "",
    "Welcome, Admin.",
    "",
    "Choose a command:",
    "",
    "1️⃣ *Status* — check database connectivity",
    "2️⃣ *Stats* — view available bot statistics",
    "3️⃣ *Advice* — ask the AI for technical or business guidance",
    "4️⃣ *Exit* — close the private assistant",
    "",
    "You can also type a command directly:",
    "• `status`",
    "• `stats`",
    "• `advice How can I debug my webhook?`",
    "",
    "🔒 Diagnostic tools are read-only in this version.",
  ].join("\n");

  await sendTextMessage(phone, message);
}

async function checkBotStatus(): Promise<string> {
  try {
    const { count, error } = await supabase
      .from("contacts")
      .select("id", { count: "exact", head: true });

    if (error) {
      console.error("[AdminAgent] Status check failed:", error.message);

      return [
        "⚠️ *DATABASE CHECK FAILED*",
        "",
        "The contacts query returned an error.",
        `Details: ${error.message.slice(0, 300)}`,
        "",
        "This does not necessarily mean the entire Supabase project is down.",
      ].join("\n");
    }

    return [
      "🟢 *DATABASE CONNECTION CHECK PASSED*",
      "",
      "Supabase responded successfully to the contacts query.",
      `Contact records: ${count ?? "Not reported"}`,
      `Checked: ${new Date().toISOString()}`,
      "",
      "Note: this tests database access only. It does not prove that every webhook or WhatsApp API request is working.",
    ].join("\n");
  } catch (error) {
    console.error("[AdminAgent] Status exception:", error);

    return [
      "🔴 *STATUS CHECK ERROR*",
      "",
      "The diagnostic could not complete.",
      "Check the Supabase Edge Function logs for details.",
    ].join("\n");
  }
}

async function getBotStats(): Promise<string> {
  const checks = await Promise.all([
    supabase.from("contacts").select("id", {
      count: "exact",
      head: true,
    }),
    supabase.from("messages").select("id", {
      count: "exact",
      head: true,
    }),
    supabase.from("bot_orders").select("id", {
      count: "exact",
      head: true,
    }),
    supabase.from("agent_requests").select("id", {
      count: "exact",
      head: true,
    }).eq("status", "NEW"),
  ]);

  const labels = [
    "Contacts",
    "Messages",
    "Bot orders",
    "New agent requests",
  ];

  const lines = checks.map((result, index) => {
    if (result.error) {
      console.error(
        `[AdminAgent] Stats error (${labels[index]}):`,
        result.error.message,
      );

      return `${labels[index]}: unavailable — query failed`;
    }

    return `${labels[index]}: ${result.count ?? 0}`;
  });

  return [
    "📊 *XTOP BOT STATISTICS*",
    "",
    ...lines,
    "",
    `Checked: ${new Date().toISOString()}`,
    "",
    "These figures come from the connected database. They are not a financial report.",
  ].join("\n");
}

async function askAdminAI(
  phone: string,
  question: string,
): Promise<void> {
  if (!Deno.env.get("AI_API_KEY")) {
    await sendTextMessage(
      phone,
      "AI advice is not configured yet. Set the AI_API_KEY secret in Supabase before using this feature. Status and stats do not require an AI key.",
    );
    return;
  }

  const systemPrompt = `
You are Lizzy, the private technical and business adviser
for the administrator of Xtop Retail Technologies.

Be practical, concise, honest, and security-conscious.

You may advise on TypeScript, Deno, Supabase, WhatsApp Cloud API,
GitHub, debugging, and business operations.

IMPORTANT LIMITATIONS:
- You cannot inspect live logs, GitHub repositories, databases,
  or deployments unless their contents are explicitly provided.
- Never claim to have run a test, checked a system, edited a file,
  or deployed code when you have not.
- Do not invent credentials, configuration values, or test results.
- Prefer small changes that preserve existing bot features.
- Never ask the administrator to share secret API keys in chat.
- Require human approval before destructive or production changes.
- Clearly distinguish verified facts from suggestions.

This assistant currently has read-only status and statistics tools.
It cannot independently change production systems.
`.trim();

  try {
    const answer = await callAI(
      systemPrompt,
      question,
      [],
      { temperature: 0.2, maxTokens: 500 },
    );

    await sendTextMessage(
      phone,
      `🤖 *LIZZY — ADMIN ADVISER*\n\n${answer}`,
    );
  } catch (error) {
    console.error("[AdminAgent] AI error:", error);

    await sendTextMessage(
      phone,
      "I couldn't complete that advice request. Please try again later.",
    );
  }
}

/**
 * Handles commands only after the parent router has authorised
 * the sender and entered ADMIN_AGENT mode.
 */
export async function handleAdminAgent(
  phone: string,
  text: string,
  interactiveId: string,
  conversationId: string,
): Promise<void> {
  const command = (interactiveId || text).trim().toLowerCase();

  // Leave the private assistant.
  if (
    ["4", "exit", "quit", "close", "admin_agent_exit"].includes(command)
  ) {
    await updateConversation(conversationId, {
      current_module: "MAIN_MENU",
      current_state: "IDLE",
      context_json: {},
    });

    await sendTextMessage(
      phone,
      "🔒 Private admin assistant closed.\n\nType *menu* to return to the public Xtop menu.",
    );

    return;
  }

  // Reopen the private menu.
  if (
    ["menu", "help", "admin_agent_open", "0"].includes(command)
  ) {
    await showAdminAgentMenu(phone);
    return;
  }

  // Database status.
  if (
    ["1", "status", "health", "check status", "admin_agent_status"].includes(command)
  ) {
    await sendTextMessage(phone, "Checking database connectivity...");
    await sendTextMessage(phone, await checkBotStatus());
    return;
  }

  // Database statistics.
  if (
    ["2", "stats", "statistics", "admin_agent_stats"].includes(command)
  ) {
    await sendTextMessage(phone, "Reading available bot statistics...");
    await sendTextMessage(phone, await getBotStats());
    return;
  }

  // AI adviser.
  if (
    ["3", "advice", "admin_agent_advice"].includes(command)
  ) {
    await sendTextMessage(
      phone,
      "Type your question after the word advice.\n\nExample: advice Explain how to diagnose a failing webhook.",
    );
    return;
  }

  if (command.startsWith("advice ")) {
    const question = (interactiveId ? text : text.slice(7)).trim();

    if (!question) {
      await sendTextMessage(phone, "Please include a question after `advice`.");
      return;
    }

    await askAdminAI(phone, question);
    return;
  }

  // Any other admin message is treated as an advice request.
  // The AI must not claim to have executed tools it cannot access.
  await askAdminAI(phone, text);
}
