// supabase/functions/whatsapp-webhook/utils.ts
// Complete Utility Layer (Phases 1–5)
// Deterministic NLU, sanitization, private keyword detection, safe logging

// ═══════════════════════════════════════════════════════
// STRING SANITIZATION & NORMALIZATION
// ═══════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════
// GLOBAL COMMAND DETECTORS
// ═══════════════════════════════════════════════════════

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

/**
 * Detects the private Learning Centre access keyword.
 * Recognises: "engr ero", "engr. ero", "engr.ero", "engrero"
 */
export function isLearningKeyword(text: string): boolean {
  const n = normalise(text).replace(/\./g, "").replace(/\s+/g, " ").trim();
  return n === "engr ero" || n === "engrero";
}

// ═══════════════════════════════════════════════════════
// INTENT DETECTION & SELECTION EXTRACTION
// ═══════════════════════════════════════════════════════

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
    };
    if (numMap[num]) return numMap[num];
  }

  const n = normalise(text);

  if (isLearningKeyword(text)) return "LEARNING";
  if (n.includes("build") || n.includes("estimate") || n.includes("quote") || n.includes("quotation") || n.includes("project")) return "SALES";
  if (n.includes("product") || n.includes("xtopedu") || n.includes("naijashop")) return "PRODUCTS";
  if (n.includes("service") || n.includes("website") || n.includes("bot") || n.includes("erp") || n.includes("automation")) return "SERVICES";
  if (n.includes("demo") || n.includes("sample") || n.includes("test")) return "DEMOS";
  if (n.includes("magazine") || n.includes("catalog") || n.includes("brochure") || n.includes("pdf")) return "MAGAZINE";
  if (isAgentRequest(text)) return "AGENT";

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

// ═══════════════════════════════════════════════════════
// SAFE ERROR LOGGING
// ═══════════════════════════════════════════════════════

export function safeErrorLog(context: string, error: unknown): void {
  if (!error) return;

  if (error instanceof Error) {
    console.error(`[${context}] ${error.message}`);
  } else if (typeof error === "object") {
    const err = error as Record<string, unknown>;
    const msg = err.message || err.details || err.hint || JSON.stringify(error);
    const code = err.code ? ` (code: ${err.code})` : "";
    console.error(`[${context}] ${msg}${code}`);
  } else {
    console.error(`[${context}] ${String(error)}`);
  }
}

// ═══════════════════════════════════════════════════════
// NATURAL LANGUAGE → STRUCTURED OPTION MAPPERS
// ═══════════════════════════════════════════════════════

export function mapBusinessType(text: string): string | null {
  const n = normalise(text);
  if (containsAny(n, ["retail", "shop", "store", "supermarket", "boutique", "wholesale", "ecommerce", "e-commerce"])) return "Retail";
  if (containsAny(n, ["school", "education", "academy", "tutorial", "college", "university", "nursery", "primary", "secondary"])) return "School/Education";
  if (containsAny(n, ["real estate", "property", "housing", "apartment", "land", "realtor"])) return "Real Estate";
  if (containsAny(n, ["restaurant", "food", "catering", "hotel", "hospitality", "cafe", "bar", "lounge"])) return "Restaurant/Food";
  if (containsAny(n, ["law", "legal", "accounting", "consulting", "consultant", "professional", "agency", "marketing", "design"])) return "Professional Services";
  if (containsAny(n, ["church", "ngo", "organisation", "organization", "foundation", "ministry", "charity", "non-profit"])) return "Church/NGO/Organisation";
  if (containsAny(n, ["health", "hospital", "clinic", "pharmacy", "medical", "dental", "doctor", "patient"])) return "Healthcare";
  return null;
}

export function mapBotPurposes(text: string): string[] {
  const n = normalise(text);
  const purposes: string[] = [];
  if (containsAny(n, ["question", "faq", "answer", "enquir", "inquir"])) purposes.push("Answer customer questions");
  if (containsAny(n, ["order", "purchase", "buy", "cart", "checkout"])) purposes.push("Receive orders");
  if (containsAny(n, ["lead", "contact", "sign up", "register", "intake"])) purposes.push("Collect customer leads");
  if (containsAny(n, ["recommend", "suggest", "product", "catalogue", "catalog"])) purposes.push("Recommend products");
  if (containsAny(n, ["book", "appointment", "schedule", "reservation"])) purposes.push("Book appointments");
  if (containsAny(n, ["payment", "pay", "invoice", "receipt", "bank"])) purposes.push("Send payment information");
  if (containsAny(n, ["quotation", "quote", "estimate", "pricing", "price"])) purposes.push("Generate quotations");
  if (containsAny(n, ["notification", "alert", "broadcast", "remind", "announce"])) purposes.push("Send notifications");
  if (containsAny(n, ["support", "help", "complaint", "issue", "ticket"])) purposes.push("Customer support");
  if (containsAny(n, ["fee", "fees", "attendance", "result", "report card", "parent"])) {
    purposes.push("Answer customer questions");
    purposes.push("Send notifications");
  }
  return [...new Set(purposes)];
}

export function mapWebFeatures(text: string): string[] {
  const n = normalise(text);
  const features: string[] = [];
  if (containsAny(n, ["whatsapp", "wa "])) features.push("WhatsApp integration");
  if (containsAny(n, ["payment", "paystack", "monnify", "pay"])) features.push("Online payment");
  if (containsAny(n, ["login", "account", "sign in", "user"])) features.push("Customer accounts/login");
  if (containsAny(n, ["form", "contact", "enquiry", "enquir"])) features.push("Contact/enquiry forms");
  if (containsAny(n, ["book", "appointment", "schedule"])) features.push("Booking/appointments");
  if (containsAny(n, ["admin", "dashboard", "cms", "manage"])) features.push("Admin dashboard");
  if (containsAny(n, ["catalogue", "catalog", "product", "inventory"])) features.push("Product catalogue");
  if (containsAny(n, ["database", "sql", "data"])) features.push("Database");
  if (containsAny(n, ["report", "analytics", "chart"])) features.push("Reports");
  return [...new Set(features)];
}

export function mapAutoActivities(text: string): string[] {
  const n = normalise(text);
  const acts: string[] = [];
  if (containsAny(n, ["customer", "client", "crm"])) acts.push("Customer management");
  if (containsAny(n, ["sale", "sell", "revenue"])) acts.push("Sales");
  if (containsAny(n, ["invoic", "bill", "receipt"])) acts.push("Invoicing");
  if (containsAny(n, ["whatsapp", "wa "])) acts.push("WhatsApp messages");
  if (containsAny(n, ["email", "mail"])) acts.push("Email");
  if (containsAny(n, ["report", "analytics"])) acts.push("Reports");
  if (containsAny(n, ["follow", "remind", "nurture"])) acts.push("Customer follow-up");
  if (containsAny(n, ["sheet", "excel", "data entry", "spreadsheet"])) acts.push("Google Sheets/data entry");
  if (containsAny(n, ["pdf", "document", "generate"])) acts.push("PDF generation");
  return [...new Set(acts)];
}

export function mapExistingResources(text: string): string[] {
  const n = normalise(text);
  const res: string[] = [];
  if (containsAny(n, ["whatsapp business", "wa business"])) res.push("WhatsApp Business number");
  if (containsAny(n, ["website", "site", "domain"])) res.push("Website");
  if (containsAny(n, ["catalogue", "catalog", "product list", "inventory"])) res.push("Product/service catalogue");
  if (containsAny(n, ["database", "customer list", "crm", "contact list"])) res.push("Customer database");
  if (containsAny(n, ["none", "nothing", "no", "don't have", "dont have"])) res.push("None");
  return [...new Set(res)];
}

export function mapCurrentTools(text: string): string[] {
  const n = normalise(text);
  const tools: string[] = [];
  if (containsAny(n, ["whatsapp"])) tools.push("WhatsApp");
  if (containsAny(n, ["google sheet", "gsheet"])) tools.push("Google Sheets");
  if (containsAny(n, ["excel", "spreadsheet"])) tools.push("Excel");
  if (containsAny(n, ["website", "site"])) tools.push("Website");
  if (containsAny(n, ["crm", "hubspot", "salesforce", "zoho"])) tools.push("CRM");
  if (containsAny(n, ["accounting", "quickbook", "sage", "xero"])) tools.push("Accounting software");
  if (containsAny(n, ["none", "nothing", "no"])) tools.push("None");
  return [...new Set(tools)];
}
