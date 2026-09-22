// supabase/functions/whatsapp-webhook/utils.ts

export function sanitizeInput(input: string | undefined | null): string {
  if (!input) return "";
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .substring(0, 1000);
}

export function normalise(text: string): string {
  return text.toLowerCase().trim();
}

export function containsAny(text: string, keywords: string[]): boolean {
  const n = normalise(text);
  return keywords.some((k) => n.includes(k));
}

export function matchesAny(text: string, keywords: string[]): boolean {
  const n = normalise(text);
  return keywords.some((k) => n === k || n.startsWith(`${k} `));
}

export function isGreeting(text: string): boolean {
  return matchesAny(text, [
    "hi", "hello", "hey", "start", "menu", "home",
    "main menu", "go home", "show menu", "options", "sabi",
  ]);
}

export function isBack(text: string): boolean {
  return matchesAny(text, [
    "back", "go back", "take me back", "previous", "return", "0", "#0",
  ]);
}

export function isHelp(text: string): boolean {
  return matchesAny(text, ["help", "support", "what can you do", "commands"]);
}

export function isExit(text: string): boolean {
  return matchesAny(text, [
    "exit", "quit", "stop", "bye", "goodbye", "end", "close", "cancel",
  ]);
}

export function isAgentRequest(text: string): boolean {
  return containsAny(text, [
    "agent", "talk to agent", "human", "customer care",
    "customer service", "speak to someone", "representative",
    "call me", "support team",
  ]);
}

export type DetectedIntent =
  | "PRODUCTS" | "SERVICES" | "DEMOS" | "MAGAZINE"
  | "AGENT" | "LEARNING" | "SALES" | "UNKNOWN";

export function detectIntent(text: string, interactiveId?: string): DetectedIntent {
  if (interactiveId) {
    if (interactiveId === "menu_products" || interactiveId.startsWith("prod_")) return "PRODUCTS";
    if (interactiveId === "menu_services" || interactiveId.startsWith("srv_")) return "SERVICES";
    if (interactiveId === "menu_demos" || interactiveId.startsWith("demo_")) return "DEMOS";
    if (interactiveId === "menu_magazine" || interactiveId.startsWith("mag_")) return "MAGAZINE";
    if (interactiveId === "menu_agent" || interactiveId.startsWith("agt_")) return "AGENT";
    if (interactiveId === "menu_learning") return "LEARNING";
    if (interactiveId === "menu_sales" || interactiveId.startsWith("sales_")) return "SALES";
  }

  const num = extractSelection(text);
  if (num) {
    const numMap: Record<number, DetectedIntent> = {
      1: "PRODUCTS",
      2: "SERVICES",
      3: "DEMOS",
      4: "MAGAZINE",
      5: "AGENT",
      6: "LEARNING",
    };
    if (numMap[num]) return numMap[num];
  }

  const n = normalise(text);

  if (n.includes("build") || n.includes("estimate") || n.includes("quote") || n.includes("quotation") || n.includes("project")) return "SALES";
  if (n.includes("product") || n.includes("xtopedu") || n.includes("naijashop")) return "PRODUCTS";
  if (n.includes("service") || n.includes("website") || n.includes("bot") || n.includes("erp") || n.includes("automation")) return "SERVICES";
  if (n.includes("demo") || n.includes("sample") || n.includes("test")) return "DEMOS";
  if (n.includes("magazine") || n.includes("catalog") || n.includes("brochure") || n.includes("pdf")) return "MAGAZINE";
  if (isAgentRequest(text)) return "AGENT";
  if (n.includes("learn") || n.includes("course") || n.includes("engr") || n.includes("ero") || n.includes("ela301") || n.includes("ela302") || n.includes("ela401")) return "LEARNING";

  return "UNKNOWN";
}

export function extractSelection(text: string): number | null {
  const n = normalise(text);
  const directMatch = n.match(/^#?(\d{1,2})$/);
  if (directMatch) return parseInt(directMatch[1], 10);

  const wordMatch = n.match(/(?:option|select|choose|number)\s*#?(\d{1,2})/);
  if (wordMatch) return parseInt(wordMatch[1], 10);
  return null;
}

/**
 * Safe error logger.
 * Supabase returns plain JSON error objects, NOT JavaScript Error instances.
 * This function handles both formats so we always see the real error message.
 */
export function safeErrorLog(context: string, error: unknown): void {
  if (!error) return;

  if (error instanceof Error) {
    console.error(`[${context}] ${error.message}`);
  } else if (typeof error === "object") {
    // Supabase errors are plain objects: { message, details, hint, code }
    const err = error as Record<string, unknown>;
    const msg = err.message || err.details || err.hint || JSON.stringify(error);
    const code = err.code ? ` (code: ${err.code})` : "";
    console.error(`[${context}] ${msg}${code}`);
  } else {
    console.error(`[${context}] ${String(error)}`);
  }
}
