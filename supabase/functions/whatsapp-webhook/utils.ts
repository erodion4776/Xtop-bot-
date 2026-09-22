// supabase/functions/whatsapp-webhook/utils.ts

/**
 * Sanitize user input — strip control characters, trim, limit length.
 */
export function sanitizeInput(input: string | undefined | null): string {
  if (!input) return "";
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .substring(0, 1000);
}

/**
 * Normalise a message to lowercase trimmed for matching.
 */
export function normalise(text: string): string {
  return text.toLowerCase().trim();
}

/**
 * Check if text contains any of the target keywords.
 */
export function containsAny(text: string, keywords: string[]): boolean {
  const n = normalise(text);
  return keywords.some((k) => n.includes(k));
}

/**
 * Check if text matches exact commands or starts with them.
 */
export function matchesAny(text: string, keywords: string[]): boolean {
  const n = normalise(text);
  return keywords.some((k) => n === k || n.startsWith(`${k} `));
}

// ── Global Command Detectors ──────────────────────────

export function isGreeting(text: string): boolean {
  return matchesAny(text, [
    "hi", "hello", "hey", "start", "menu", "home",
    "main menu", "go home", "show menu", "options", "sabi"
  ]);
}

export function isBack(text: string): boolean {
  return matchesAny(text, [
    "back", "go back", "take me back", "previous", "return", "0", "#0"
  ]);
}

export function isHelp(text: string): boolean {
  return matchesAny(text, ["help", "support", "what can you do", "commands"]);
}

export function isExit(text: string): boolean {
  return matchesAny(text, ["exit", "quit", "stop", "bye", "goodbye", "end", "close"]);
}

export function isAgentRequest(text: string): boolean {
  return containsAny(text, [
    "agent", "talk to agent", "human", "customer care", "customer service",
    "speak to someone", "representative", "call me", "support team"
  ]);
}

// ── Deterministic Intent Recognition ──────────────────

export type DetectedIntent =
  | "MENU"
  | "PRODUCTS"
  | "SALES_BOT"
  | "SALES_WEBSITE"
  | "SALES_BOT_WEBSITE"
  | "SALES_AUTOMATION"
  | "DEMOS"
  | "MAGAZINE"
  | "AGENT"
  | "LEARNING"
  | "UNKNOWN";

export function detectIntent(text: string, interactiveId?: string): DetectedIntent {
  if (interactiveId) {
    const idMap: Record<string, DetectedIntent> = {
      menu_products: "PRODUCTS",
      menu_bot: "SALES_BOT",
      menu_website: "SALES_WEBSITE",
      menu_bot_website: "SALES_BOT_WEBSITE",
      menu_automation: "SALES_AUTOMATION",
      menu_demos: "DEMOS",
      menu_magazine: "MAGAZINE",
      menu_agent: "AGENT",
      menu_learning: "LEARNING",
    };
    if (idMap[interactiveId]) return idMap[interactiveId];
  }

  const num = extractSelection(text);
  if (num) {
    const numMap: Record<number, DetectedIntent> = {
      1: "PRODUCTS",
      2: "SALES_BOT",
      3: "SALES_WEBSITE",
      4: "SALES_BOT_WEBSITE",
      5: "SALES_AUTOMATION",
      6: "DEMOS",
      7: "MAGAZINE",
      8: "AGENT",
      9: "LEARNING",
    };
    if (numMap[num]) return numMap[num];
  }

  const n = normalise(text);

  // Bot + Website combos
  if ((n.includes("bot") && n.includes("website")) || n.includes("combo") || n.includes("both")) {
    return "SALES_BOT_WEBSITE";
  }

  // Products
  if (n.includes("product") || n.includes("xtopedu") || n.includes("naijashop") || n.includes("school software") || n.includes("retail system")) {
    return "PRODUCTS";
  }

  // WhatsApp Bots
  if (n.includes("bot") || n.includes("whatsapp") || n.includes("chatbot") || n.includes("auto reply")) {
    return "SALES_BOT";
  }

  // Websites
  if (n.includes("website") || n.includes("web page") || n.includes("landing page") || n.includes("web app") || n.includes("domain")) {
    return "SALES_WEBSITE";
  }

  // Automation / Custom
  if (n.includes("automat") || n.includes("workflow") || n.includes("custom software") || n.includes("ai system") || n.includes("crm")) {
    return "SALES_AUTOMATION";
  }

  // Demos
  if (n.includes("demo") || n.includes("sample") || n.includes("test bot") || n.includes("try it") || n.includes("see example")) {
    return "DEMOS";
  }

  // Magazine
  if (n.includes("magazine") || n.includes("catalog") || n.includes("catalogue") || n.includes("brochure") || n.includes("pdf")) {
    return "MAGAZINE";
  }

  // Agent
  if (isAgentRequest(text)) {
    return "AGENT";
  }

  // Learning Centre / Courses
  if (n.includes("learning") || n.includes("course") || n.includes("engr") || n.includes("ero") || n.includes("lecture") || n.includes("exam") || n.includes("ela301") || n.includes("ela302") || n.includes("ela401")) {
    return "LEARNING";
  }

  if (isGreeting(text)) {
    return "MENU";
  }

  return "UNKNOWN";
}

/**
 * Extract a numeric selection from text like "1", "#1", "option 1" etc.
 */
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
 */
export function safeErrorLog(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`[${context}]`, message);
}
