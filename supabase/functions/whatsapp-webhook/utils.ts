// supabase/functions/whatsapp-webhook/utils.ts

/**
 * Sanitize user input — strip control characters, trim, limit length.
 */
export function sanitizeInput(input: string | undefined | null): string {
  if (!input) return "";
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // strip control chars (keep \n \r \t)
    .trim()
    .substring(0, 2000); // hard cap to prevent abuse
}

/**
 * Normalise a message to lowercase trimmed for comparison.
 */
export function normalise(text: string): string {
  return text.toLowerCase().trim();
}

/**
 * Check if a message matches any of the given keywords.
 */
export function matchesAny(text: string, keywords: string[]): boolean {
  const n = normalise(text);
  return keywords.some((k) => n === k || n.startsWith(k));
}

/**
 * Check if the message is a greeting / menu trigger.
 */
export function isGreeting(text: string): boolean {
  return matchesAny(text, [
    "hi",
    "hello",
    "hey",
    "start",
    "menu",
    "home",
    "main menu",
    "go home",
    "show me the menu",
    "take me home",
  ]);
}

/**
 * Check if the user wants to go back.
 */
export function isBack(text: string): boolean {
  return matchesAny(text, [
    "back",
    "go back",
    "take me back",
    "previous",
    "return",
  ]);
}

/**
 * Check if user wants help.
 */
export function isHelp(text: string): boolean {
  return matchesAny(text, ["help", "what can you do", "options"]);
}

/**
 * Check if user wants an agent.
 */
export function isAgentRequest(text: string): boolean {
  return matchesAny(text, [
    "agent",
    "talk to an agent",
    "i want an agent",
    "speak to an agent",
    "human",
    "talk to a human",
    "speak to someone",
    "customer service",
  ]);
}

/**
 * Check if user wants to exit.
 */
export function isExit(text: string): boolean {
  return matchesAny(text, ["exit", "quit", "stop", "bye", "goodbye", "end"]);
}

/**
 * Build a safe JSON error log (no secrets).
 */
export function safeErrorLog(context: string, error: unknown): void {
  const message =
    error instanceof Error ? error.message : "Unknown error";
  console.error(`[${context}]`, message);
}

/**
 * Extract a numeric selection from text like "1", "#1", "option 1" etc.
 */
export function extractSelection(text: string): number | null {
  const n = normalise(text);
  // Direct number
  const directMatch = n.match(/^#?(\d{1,2})$/);
  if (directMatch) return parseInt(directMatch[1], 10);
  // "option X" / "select X" / "choose X"
  const wordMatch = n.match(/(?:option|select|choose|number)\s*#?(\d{1,2})/);
  if (wordMatch) return parseInt(wordMatch[1], 10);
  return null;
}
