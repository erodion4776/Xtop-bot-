// supabase/functions/whatsapp-webhook/modules/sales.ts
// Phase 3 — Strict Structured Qualification with Full Validation & Client Details
// Updated: Plain English + Onboarding routing

import {
  Contact, Conversation, updateConversation,
  createLead, updateLead, getActiveLeadForContact,
  createQuotation, updateQuotation, createAgentRequest,
} from "../database.ts";
import {
  sendButtonMessage, sendListMessage, sendTextMessage,
  makeButton, makeListRow,
} from "../whatsapp.ts";
import {
  matchPackage, formatNaira,
  BOT_FEATURE_MAP, WEB_FEATURE_MAP, AUTO_FEATURE_MAP,
  mapFeaturesToCodes,
} from "./pricing.ts";
import {
  normalise, isBack, isExit, extractSelection,
} from "../utils.ts";
import { showMainMenu } from "./main-menu.ts";

// ═══════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════

export interface SalesCtx {
  flow: "BOT" | "WEB" | "COMBO" | "AUTO";
  step: string;

  leadId?: string;
  quotationId?: string;
  quotationNumber?: string;

  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;

  businessName?: string;
  industry?: string;

  features: string[];
  featureCodes: string[];

  waBiz?: string;
  needWebsite?: string;
  webType?: string;
  webFeatures: string[];

  domain?: string;
  hosting?: string;
  waIntegration?: string;

  autoActivities: string[];
  autoProcess?: string;
  autoUsers?: string;
  autoIntegrations: string[];

  budget?: string;

  serviceType?: string;
  selectedPackageId?: string;
  selectedPackageCode?: string;

  estimatedMin?: number;
  estimatedMax?: number;
}

function defaultCtx(flow: SalesCtx["flow"]): SalesCtx {
  return {
    flow,
    step: "ENTRY",
    features: [],
    featureCodes: [],
    webFeatures: [],
    autoActivities: [],
    autoIntegrations: [],
    serviceType: flowToServiceType(flow),
    clientName: undefined,
    clientEmail: undefined,
    clientPhone: undefined,
  };
}

function flowToServiceType(flow: string): string {
  if (flow === "BOT") return "WHATSAPP_BOT";
  if (flow === "WEB") return "WEBSITE";
  if (flow === "COMBO") return "BOT_AND_WEBSITE";
  return "AUTOMATION";
}

async function saveCtx(id: string, ctx: SalesCtx): Promise<void> {
  await updateConversation(id, {
    current_module: "SALES",
    current_state: ctx.step,
    context_json: ctx as unknown as Record<string, unknown>,
  });
}

// ═══════════════════════════════════════════════════════
// PLAIN ENGLISH DISPLAY HELPER
// ═══════════════════════════════════════════════════════

function plain(internal: string): string {
  const map: Record<string, string> = {
    "Answer Customer FAQs": "Answer FAQs",
    "Receive Orders": "Take Orders",
    "Collect Customer Leads": "Collect Enquiries",
    "Product Recommendations": "Suggest Products",
    "Booking/Appointments": "Book Appointments",
    "Customer Support": "Customer Support",
    "Payments": "Take Payments",
    "Generate Quotations": "Send Price Quotes",
    "Notifications": "Send Notifications",
    "Customer Database/CRM": "Save Customer Info",
    "Admin Dashboard/CMS": "Admin Dashboard",
    "Online Payment": "Online Payment",
    "WhatsApp Integration": "WhatsApp Chat",
    "Customer Accounts/Login": "Customer Login",
    "Online Forms": "Online Forms",
    "Booking/Appointment System": "Booking System",
    "Product Catalogue": "Product List",
    "Database": "Database",
    "Reports": "Reports",
    "Customer Management": "Manage Customers",
    "Sales/Order Processing": "Process Orders",
    "Invoicing": "Send Invoices",
    "CRM": "CRM",
    "Google Sheets/Excel": "Sheets / Excel",
    "Database Management": "Manage Database",
    "PDF Generation": "Create PDFs",
    "WhatsApp Automation": "WhatsApp Auto",
    "Email Automation": "Email Auto",
    "Retail & E-commerce": "Retail / Online Shop",
    "Education & School": "School / Education",
    "Health & Pharmacy": "Health / Pharmacy",
    "Real Estate": "Real Estate",
    "Professional Services": "Professional Services",
    "Food & Hospitality": "Food / Hospitality",
    "Church/NGO/Organisation": "Church / NGO",
    "Manufacturing": "Manufacturing",
    "Corporate/Business Website": "Business Website",
    "Landing Page": "Landing Page",
    "E-commerce Website": "Online Shop",
    "Customer/Business Portal": "Customer Portal",
    "Booking Website": "Booking Website",
    "Custom Web Application": "Custom Web App",
  };
  return map[internal] || internal;
}

// ═══════════════════════════════════════════════════════
// STRICT VALIDATION HELPER
// ═══════════════════════════════════════════════════════

function resolveStrict(
  text: string,
  idMap: Record<string, string>,
  numMap: Record<number, string>,
  textAliases?: Record<string, string>
): string | null {
  if (!text) return null;
  const raw = text.trim();
  const n = normalise(raw);

  if (idMap[raw]) return idMap[raw];
  if (idMap[n]) return idMap[n];

  const num = extractSelection(raw);
  if (num !== null && numMap[num]) return numMap[num];

  if (textAliases) {
    for (const [alias, value] of Object.entries(textAliases)) {
      if (n === alias || n.startsWith(alias + " ")) return value;
    }
  }

  for (const [, val] of Object.entries(idMap)) {
    if (n === normalise(val) || n.includes(normalise(val))) return val;
  }

  return null;
}

// ═══════════════════════════════════════════════════════
// OPTION MAPS  (internal values — do NOT change)
// ═══════════════════════════════════════════════════════

const INDUSTRY_IDS: Record<string, string> = {
  ind_retail: "Retail & E-commerce", ind_edu: "Education & School",
  ind_health: "Health & Pharmacy", ind_realestate: "Real Estate",
  ind_services: "Professional Services", ind_food: "Food & Hospitality",
  ind_ngo: "Church/NGO/Organisation", ind_mfg: "Manufacturing",
  ind_other: "__OTHER__",
};
const INDUSTRY_NUMS: Record<number, string> = {
  1: "Retail & E-commerce", 2: "Education & School", 3: "Health & Pharmacy",
  4: "Real Estate", 5: "Professional Services", 6: "Food & Hospitality",
  7: "Church/NGO/Organisation", 8: "Manufacturing", 9: "__OTHER__",
};

const BOT_FEAT_IDS: Record<string, string> = {
  bf_faq: "Answer Customer FAQs", bf_orders: "Receive Orders",
  bf_leads: "Collect Customer Leads", bf_recs: "Product Recommendations",
  bf_booking: "Booking/Appointments", bf_support: "Customer Support",
  bf_pay: "Payments", bf_quotes: "Generate Quotations",
  bf_notif: "Notifications", bf_crm: "Customer Database/CRM",
  bf_other: "__OTHER__",
};
const BOT_FEAT_NUMS: Record<number, string> = {
  1: "Answer Customer FAQs", 2: "Receive Orders", 3: "Collect Customer Leads",
  4: "Product Recommendations", 5: "Booking/Appointments", 6: "Customer Support",
  7: "Payments", 8: "Generate Quotations", 9: "Notifications",
  10: "Customer Database/CRM", 11: "__OTHER__",
};

const WEB_FEAT_IDS: Record<string, string> = {
  wf_cms: "Admin Dashboard/CMS", wf_pay: "Online Payment",
  wf_wa: "WhatsApp Integration", wf_acct: "Customer Accounts/Login",
  wf_forms: "Online Forms", wf_book: "Booking/Appointment System",
  wf_cat: "Product Catalogue", wf_db: "Database",
  wf_report: "Reports", wf_other: "__OTHER__",
};
const WEB_FEAT_NUMS: Record<number, string> = {
  1: "Admin Dashboard/CMS", 2: "Online Payment", 3: "WhatsApp Integration",
  4: "Customer Accounts/Login", 5: "Online Forms", 6: "Booking/Appointment System",
  7: "Product Catalogue", 8: "Database", 9: "Reports", 10: "__OTHER__",
};

const WEB_TYPE_IDS: Record<string, string> = {
  wt_corp: "Corporate/Business Website", wt_landing: "Landing Page",
  wt_ecom: "E-commerce Website", wt_portal: "Customer/Business Portal",
  wt_booking: "Booking Website", wt_custom: "Custom Web Application",
  wt_other: "__OTHER__",
};
const WEB_TYPE_NUMS: Record<number, string> = {
  1: "Corporate/Business Website", 2: "Landing Page", 3: "E-commerce Website",
  4: "Customer/Business Portal", 5: "Booking Website",
  6: "Custom Web Application", 7: "__OTHER__",
};

const YES_NO_IDS: Record<string, string> = {
  opt_yes: "YES", opt_no: "NO", opt_unsure: "NOT_SURE",
  wa_yes: "YES", wa_no: "NO", wa_unsure: "NOT_SURE",
  web_yes: "YES", web_no: "NO", web_unsure: "NOT_SURE",
  dom_yes: "YES", dom_no: "NO", dom_unsure: "NOT_SURE",
  host_yes: "YES", host_no: "NO", host_unsure: "NOT_SURE",
  wai_yes: "YES", wai_no: "NO", wai_unsure: "NOT_SURE",
};
const YES_NO_NUMS: Record<number, string> = { 1: "YES", 2: "NO", 3: "NOT_SURE" };
const YES_NO_TEXT: Record<string, string> = {
  yes: "YES", y: "YES", no: "NO", n: "NO",
  "not sure": "NOT_SURE", unsure: "NOT_SURE", maybe: "NOT_SURE",
};

const BUDGET_IDS: Record<string, string> = {
  bud_1: "100000-200000", bud_2: "200000-500000",
  bud_3: "500000-900000", bud_4: "900000+", bud_5: "NOT_SURE",
};
const BUDGET_NUMS: Record<number, string> = {
  1: "100000-200000", 2: "200000-500000", 3: "500000-900000",
  4: "900000+", 5: "NOT_SURE",
};

const AUTO_ACT_IDS: Record<string, string> = {
  aa_cs: "Customer Management", aa_sales: "Sales/Order Processing",
  aa_inv: "Invoicing", aa_crm: "CRM", aa_sheets: "Google Sheets/Excel",
  aa_db: "Database Management", aa_pdf: "PDF Generation",
  aa_report: "Reports", aa_wa: "WhatsApp Automation",
  aa_email: "Email Automation", aa_notif: "Notifications",
  aa_other: "__OTHER__",
};
const AUTO_ACT_NUMS: Record<number, string> = {
  1: "Customer Management", 2: "Sales/Order Processing", 3: "Invoicing",
  4: "CRM", 5: "Google Sheets/Excel", 6: "Database Management",
  7: "PDF Generation", 8: "Reports", 9: "WhatsApp Automation",
  10: "Email Automation", 11: "Notifications", 12: "__OTHER__",
};

const AUTO_PROC_IDS: Record<string, string> = {
  ap_wa: "WhatsApp", ap_excel: "Excel", ap_sheets: "Google Sheets",
  ap_web: "Website", ap_paper: "Paper/Manual Process",
  ap_sw: "Existing Software", ap_multi: "Multiple places", ap_other: "__OTHER__",
};
const AUTO_PROC_NUMS: Record<number, string> = {
  1: "WhatsApp", 2: "Excel", 3: "Google Sheets", 4: "Website",
  5: "Paper/Manual Process", 6: "Existing Software",
  7: "Multiple places", 8: "__OTHER__",
};

const AUTO_USERS_IDS: Record<string, string> = {
  au_1: "1 person", au_2: "2-5 people", au_3: "6-20 people",
  au_4: "More than 20", au_5: "Not sure",
};
const AUTO_USERS_NUMS: Record<number, string> = {
  1: "1 person", 2: "2-5 people", 3: "6-20 people",
  4: "More than 20", 5: "Not sure",
};

const AUTO_INT_IDS: Record<string, string> = {
  ai_wa: "WhatsApp", ai_web: "Website", ai_sheets: "Google Sheets",
  ai_email: "Email", ai_pay: "Payment Gateway", ai_db: "Database",
  ai_crm: "CRM", ai_other: "__OTHER__", ai_none: "None",
};
const AUTO_INT_NUMS: Record<number, string> = {
  1: "WhatsApp", 2: "Website", 3: "Google Sheets", 4: "Email",
  5: "Payment Gateway", 6: "Database", 7: "CRM", 8: "__OTHER__", 9: "None",
};

// ═══════════════════════════════════════════════════════
// REUSABLE QUESTION SENDERS  (plain English)
// ═══════════════════════════════════════════════════════

async function sendIndustryQuestion(phone: string): Promise<void> {
  await sendListMessage(phone,
    "*What kind of business do you run?*\n\nPick one:",
    "Choose",
    [{ title: "Business Type", rows: [
      makeListRow("ind_retail", "Retail / Online Shop", ""),
      makeListRow("ind_edu", "School / Education", ""),
      makeListRow("ind_health", "Health / Pharmacy", ""),
      makeListRow("ind_realestate", "Real Estate", ""),
      makeListRow("ind_services", "Professional Services", ""),
      makeListRow("ind_food", "Food / Hospitality", ""),
      makeListRow("ind_ngo", "Church / NGO", ""),
      makeListRow("ind_mfg", "Manufacturing", ""),
      makeListRow("ind_other", "Other", ""),
    ]}],
  );
}

async function sendBotFeaturesQuestion(phone: string, selected: string[]): Promise<void> {
  const summary = selected.length > 0
    ? `\n\n✅ *Picked so far:*\n${selected.map((f) => `  • ${plain(f)}`).join("\n")}\n`
    : "";
  await sendListMessage(phone,
    `*What do you want your bot to do?*${summary}\nPick one. You can add more after.`,
    "Choose",
    [{ title: "Bot Features", rows: [
      makeListRow("bf_faq", "Answer FAQs", ""),
      makeListRow("bf_orders", "Take Orders", ""),
      makeListRow("bf_leads", "Collect Enquiries", ""),
      makeListRow("bf_recs", "Suggest Products", ""),
      makeListRow("bf_booking", "Book Appointments", ""),
      makeListRow("bf_support", "Customer Support", ""),
      makeListRow("bf_pay", "Take Payments", ""),
      makeListRow("bf_quotes", "Send Price Quotes", ""),
      makeListRow("bf_notif", "Send Notifications", ""),
      makeListRow("bf_crm", "Save Customer Info", ""),
    ]}],
  );
}

async function sendWebTypeQuestion(phone: string): Promise<void> {
  await sendListMessage(phone,
    "*What kind of website do you need?*",
    "Choose",
    [{ title: "Website Type", rows: [
      makeListRow("wt_corp", "Business Website", ""),
      makeListRow("wt_landing", "Landing Page", ""),
      makeListRow("wt_ecom", "Online Shop", ""),
      makeListRow("wt_portal", "Customer Portal", ""),
      makeListRow("wt_booking", "Booking Website", ""),
      makeListRow("wt_custom", "Custom Web App", ""),
      makeListRow("wt_other", "Other", ""),
    ]}],
  );
}

async function sendWebFeaturesQuestion(phone: string, selected: string[]): Promise<void> {
  const summary = selected.length > 0
    ? `\n\n✅ *Picked so far:*\n${selected.map((f) => `  • ${plain(f)}`).join("\n")}\n`
    : "";
  await sendListMessage(phone,
    `*What features do you need on the website?*${summary}\nPick one. You can add more after.`,
    "Choose",
    [{ title: "Web Features", rows: [
      makeListRow("wf_cms", "Admin Dashboard", ""),
      makeListRow("wf_pay", "Online Payment", ""),
      makeListRow("wf_wa", "WhatsApp Chat", ""),
      makeListRow("wf_acct", "Customer Login", ""),
      makeListRow("wf_forms", "Online Forms", ""),
      makeListRow("wf_book", "Booking System", ""),
      makeListRow("wf_cat", "Product List", ""),
      makeListRow("wf_db", "Database", ""),
      makeListRow("wf_report", "Reports", ""),
      makeListRow("wf_other", "Other", ""),
    ]}],
  );
}

async function sendYesNoQuestion(
  phone: string, question: string, yesId: string, noId: string, unsureId: string
): Promise<void> {
  await sendListMessage(phone, question, "Choose",
    [{ title: "Choose", rows: [
      makeListRow(yesId, "Yes", ""),
      makeListRow(noId, "No", ""),
      makeListRow(unsureId, "Not sure", ""),
    ]}]);
}

async function sendBudgetQuestion(phone: string): Promise<void> {
  await sendListMessage(phone,
    "*How much are you looking to spend?*\n\nPick a range:",
    "Choose",
    [{ title: "Budget", rows: [
      makeListRow("bud_1", "₦100k – ₦200k", "Starter"),
      makeListRow("bud_2", "₦200k – ₦500k", "Standard"),
      makeListRow("bud_3", "₦500k – ₦900k", "Advanced"),
      makeListRow("bud_4", "Above ₦900k", "Enterprise"),
      makeListRow("bud_5", "Not sure yet", "Need help deciding"),
    ]}],
  );
}

async function sendAutoActivitiesQuestion(phone: string, selected: string[]): Promise<void> {
  const summary = selected.length > 0
    ? `\n\n✅ *Picked so far:*\n${selected.map((f) => `  • ${plain(f)}`).join("\n")}\n`
    : "";
  await sendListMessage(phone,
    `*What tasks do you want to automate?*${summary}\nPick one. You can add more after.`,
    "Choose",
    [{ title: "Tasks", rows: [
      makeListRow("aa_cs", "Manage Customers", ""),
      makeListRow("aa_sales", "Process Orders", ""),
      makeListRow("aa_inv", "Send Invoices", ""),
      makeListRow("aa_crm", "CRM", ""),
      makeListRow("aa_sheets", "Sheets / Excel", ""),
      makeListRow("aa_db", "Manage Database", ""),
      makeListRow("aa_pdf", "Create PDFs", ""),
      makeListRow("aa_report", "Reports", ""),
      makeListRow("aa_wa", "WhatsApp Auto", ""),
      makeListRow("aa_email", "Email Auto", ""),
    ]}],
  );
}

async function sendAutoProcessQuestion(phone: string): Promise<void> {
  await sendListMessage(phone,
    "*Where do you do this work right now?*",
    "Choose",
    [{ title: "Current Setup", rows: [
      makeListRow("ap_wa", "WhatsApp", ""),
      makeListRow("ap_excel", "Excel", ""),
      makeListRow("ap_sheets", "Google Sheets", ""),
      makeListRow("ap_web", "Website", ""),
      makeListRow("ap_paper", "Paper / Manual", ""),
      makeListRow("ap_sw", "Existing Software", ""),
      makeListRow("ap_multi", "Multiple places", ""),
      makeListRow("ap_other", "Other", ""),
    ]}]);
}

async function sendAutoUsersQuestion(phone: string): Promise<void> {
  await sendListMessage(phone,
    "*How many people will use this?*",
    "Choose",
    [{ title: "Team Size", rows: [
      makeListRow("au_1", "Just me", ""),
      makeListRow("au_2", "2–5 people", ""),
      makeListRow("au_3", "6–20 people", ""),
      makeListRow("au_4", "More than 20", ""),
      makeListRow("au_5", "Not sure", ""),
    ]}]);
}

async function sendAutoIntegrationsQuestion(phone: string, selected: string[]): Promise<void> {
  const summary = selected.length > 0
    ? `\n\n✅ *Picked so far:*\n${selected.map((f) => `  • ${plain(f)}`).join("\n")}\n`
    : "";
  await sendListMessage(phone,
    `*What tools should this connect to?*${summary}\nPick one. You can add more after.`,
    "Choose",
    [{ title: "Tools", rows: [
      makeListRow("ai_wa", "WhatsApp", ""),
      makeListRow("ai_web", "Website", ""),
      makeListRow("ai_sheets", "Google Sheets", ""),
      makeListRow("ai_email", "Email", ""),
      makeListRow("ai_pay", "Payment Gateway", ""),
      makeListRow("ai_db", "Database", ""),
      makeListRow("ai_crm", "CRM", ""),
      makeListRow("ai_none", "None", ""),
      makeListRow("ai_other", "Other", ""),
    ]}]);
}

// ═══════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════

export async function handleSales(
  phone: string,
  text: string,
  contact: Contact,
  conv: Conversation
): Promise<void> {
  const n = normalise(text);

  if (isExit(text) || n === "cancel" || n === "exit") {
    await updateConversation(conv.id, {
      current_module: "MAIN_MENU",
      current_state: "IDLE",
      context_json: {},
    });
    await sendTextMessage(
      phone,
      "No problem! We've saved your progress.\n\nType *menu* whenever you want to continue. 😊"
    );
    return;
  }

  if (isBack(text)) {
    const ctx = (conv.context_json as SalesCtx) || null;
    if (!ctx?.step || ctx.step === "ENTRY" || ctx.step === "ASK_SERVICE_TYPE") {
      await showMainMenu(phone, conv.id);
      return;
    }
    await showServiceTypeSelector(phone, conv.id);
    return;
  }

  const ctx = conv.context_json as SalesCtx | null;

  if (!ctx?.flow || !ctx?.step) {
    console.error(
      "[SALES STATE ERROR]",
      JSON.stringify({ conversationId: conv.id, phone, context: conv.context_json })
    );
    await showServiceTypeSelector(phone, conv.id);
    return;
  }

  if (ctx.step === "ENTRY" || ctx.step === "ASK_SERVICE_TYPE") {
    await processServiceTypeSelection(phone, text, conv);
    return;
  }

  switch (ctx.flow) {
    case "BOT":    await handleBotFlow(phone, text, contact, conv, ctx); break;
    case "WEB":    await handleWebFlow(phone, text, contact, conv, ctx); break;
    case "COMBO":  await handleComboFlow(phone, text, contact, conv, ctx); break;
    case "AUTO":   await handleAutoFlow(phone, text, contact, conv, ctx); break;
    default:
      console.error("[SALES INVALID FLOW]", JSON.stringify({ conversationId: conv.id, context: conv.context_json }));
      await showServiceTypeSelector(phone, conv.id);
      break;
  }
}

// ═══════════════════════════════════════════════════════
// SERVICE TYPE SELECTOR
// ═══════════════════════════════════════════════════════

export async function showServiceTypeSelector(phone: string, convId: string): Promise<void> {
  await updateConversation(convId, {
    current_module: "SALES",
    current_state: "ASK_SERVICE_TYPE",
    context_json: defaultCtx("BOT") as unknown as Record<string, unknown>,
  });
  await sendListMessage(phone,
    "What do you need help with? 🤔\n\nPick one:",
    "Choose",
    [{ title: "Options", rows: [
      makeListRow("sales_bot", "WhatsApp Bot", "Auto-reply to customers"),
      makeListRow("sales_web", "Website", "Business or online shop"),
      makeListRow("sales_combo", "Bot + Website", "The full package"),
      makeListRow("sales_auto", "Automation", "Automate your tasks"),
    ]}],
    "Xtop", "Get a Price"
  );
}

async function processServiceTypeSelection(phone: string, text: string, conv: Conversation): Promise<void> {
  console.log("[SALES] processServiceTypeSelection text:", JSON.stringify(text));

  const directMap: Record<string, string> = {
    sales_bot: "BOT", sales_web: "WEB", sales_combo: "COMBO", sales_auto: "AUTO",
    salesbot: "BOT", salesweb: "WEB", salescombo: "COMBO", salesauto: "AUTO",
  };
  const raw = text.trim().toLowerCase();
  if (directMap[raw]) {
    const flow = directMap[raw] as SalesCtx["flow"];
    console.log("[SALES] Direct match:", flow);
    await startFlow(phone, flow, conv);
    return;
  }

  const r = resolveStrict(text,
    { sales_bot: "BOT", sales_web: "WEB", sales_combo: "COMBO", sales_auto: "AUTO" },
    { 1: "BOT", 2: "WEB", 3: "COMBO", 4: "AUTO" },
    {
      "whatsapp bot": "BOT", "whatsapp": "BOT", "bot": "BOT",
      "website": "WEB", "web": "WEB",
      "bot + website": "COMBO", "bot website": "COMBO", "combo": "COMBO",
      "automation": "AUTO", "automate": "AUTO", "auto": "AUTO",
      "sales bot": "BOT", "sales web": "WEB",
      "sales combo": "COMBO", "sales auto": "AUTO",
    }
  );

  console.log("[SALES] resolveStrict result:", r);

  if (!r) {
    console.log("[SALES] No match, re-showing selector");
    await showServiceTypeSelector(phone, conv.id);
    return;
  }

  const flow = r as SalesCtx["flow"];
  await startFlow(phone, flow, conv);
}

async function startFlow(phone: string, flow: SalesCtx["flow"], conv: Conversation): Promise<void> {
  const ctx = defaultCtx(flow);
  ctx.step = "ASK_BIZ_NAME";
  await updateConversation(conv.id, {
    current_module: "SALES",
    current_state: "QUALIFYING",
    context_json: ctx as unknown as Record<string, unknown>,
  });

  const titles: Record<string, string> = {
    BOT: "🤖 *WhatsApp Bot*",
    WEB: "🌐 *Business Website*",
    COMBO: "📦 *Bot + Website Combo*",
    AUTO: "⚙️ *Business Automation*",
  };
  await sendTextMessage(phone,
    `${titles[flow]}\n\nI'll ask a few quick questions to give you a price estimate.\n\n` +
    `*1. What's your business name?*\n\n_(Just type it below)_`
  );
}

// ═══════════════════════════════════════════════════════
// WHATSAPP BOT FLOW
// ═══════════════════════════════════════════════════════
async function handleBotFlow(
  phone: string, text: string, contact: Contact, conv: Conversation, ctx: SalesCtx
): Promise<void> {
  switch (ctx.step) {

    case "ASK_BIZ_NAME": {
      if (text.trim().length < 2) {
        await sendTextMessage(phone, "Please type your business name (at least 2 characters):");
        return;
      }
      ctx.businessName = text.trim();
      ctx.step = "ASK_INDUSTRY";
      await saveCtx(conv.id, ctx);
      await sendIndustryQuestion(phone);
      break;
    }

    case "ASK_INDUSTRY": {
      const r = resolveStrict(text, INDUSTRY_IDS, INDUSTRY_NUMS);
      if (!r) {
        await sendTextMessage(phone, "⚠️ Please pick one from the list.");
        await sendIndustryQuestion(phone);
        return;
      }
      if (r === "__OTHER__") {
        ctx.step = "ASK_INDUSTRY_OTHER";
        await saveCtx(conv.id, ctx);
        await sendTextMessage(phone, "What kind of business is it?");
        return;
      }
      ctx.industry = r;
      ctx.step = "ASK_BOT_FEATURES";
      await saveCtx(conv.id, ctx);
      await sendBotFeaturesQuestion(phone, ctx.features);
      break;
    }

    case "ASK_INDUSTRY_OTHER": {
      if (text.trim().length < 2) {
        await sendTextMessage(phone, "Please type your business type:");
        return;
      }
      ctx.industry = text.trim();
      ctx.step = "ASK_BOT_FEATURES";
      await saveCtx(conv.id, ctx);
      await sendBotFeaturesQuestion(phone, ctx.features);
      break;
    }

    case "ASK_BOT_FEATURES": {
      const r = resolveStrict(text, BOT_FEAT_IDS, BOT_FEAT_NUMS);
      if (!r) {
        await sendTextMessage(phone, "⚠️ Please pick a feature from the list.");
        await sendBotFeaturesQuestion(phone, ctx.features);
        return;
      }
      if (r === "__OTHER__") {
        ctx.step = "ASK_BOT_FEATURE_OTHER";
        await saveCtx(conv.id, ctx);
        await sendTextMessage(phone, "What else do you need the bot to do?");
        return;
      }
      if (!ctx.features.includes(r)) ctx.features.push(r);
      ctx.featureCodes = mapFeaturesToCodes(ctx.features, BOT_FEATURE_MAP);
      ctx.step = "ASK_BOT_FEATURES_MORE";
      await saveCtx(conv.id, ctx);
      await sendButtonMessage(phone,
        `✅ Added: *${plain(r)}*\n\n*Picked so far:*\n${ctx.features.map((f) => `  • ${plain(f)}`).join("\n")}\n\nWant to add another?`,
        [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ That's All")],
        "Features"
      );
      break;
    }

    case "ASK_BOT_FEATURE_OTHER": {
      const custom = text.trim();
      if (custom.length < 2) {
        await sendTextMessage(phone, "Please describe the feature:");
        return;
      }
      if (!ctx.features.includes(custom)) ctx.features.push(custom);
      ctx.featureCodes = mapFeaturesToCodes(ctx.features, BOT_FEATURE_MAP);
      ctx.step = "ASK_BOT_FEATURES_MORE";
      await saveCtx(conv.id, ctx);
      await sendButtonMessage(phone,
        `✅ Added: *${custom}*\n\n*Picked so far:*\n${ctx.features.map((f) => `  • ${plain(f)}`).join("\n")}\n\nWant to add another?`,
        [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ That's All")],
        "Features"
      );
      break;
    }

    case "ASK_BOT_FEATURES_MORE": {
      const n = normalise(text);
      if (text === "feat_more" || n === "add another" || n === "add" || n === "yes" || n === "1") {
        ctx.step = "ASK_BOT_FEATURES";
        await saveCtx(conv.id, ctx);
        await sendBotFeaturesQuestion(phone, ctx.features);
      } else if (text === "feat_done" || n === "done" || n === "thats all" || n === "no" || n === "2") {
        if (ctx.features.length === 0) {
          await sendTextMessage(phone, "⚠️ Please pick at least one feature.");
          ctx.step = "ASK_BOT_FEATURES";
          await saveCtx(conv.id, ctx);
          await sendBotFeaturesQuestion(phone, ctx.features);
          return;
        }
        ctx.step = "ASK_WA_BIZ";
        await saveCtx(conv.id, ctx);
        await sendYesNoQuestion(phone,
          "*Do you already have a WhatsApp Business number?*",
          "wa_yes", "wa_no", "wa_unsure");
      } else {
        await sendTextMessage(phone, "⚠️ Please tap one of the buttons.");
        await sendButtonMessage(phone,
          `*Picked so far:*\n${ctx.features.map((f) => `  • ${plain(f)}`).join("\n")}\n\nWant to add another?`,
          [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ That's All")],
          "Features"
        );
      }
      break;
    }

    case "ASK_WA_BIZ": {
      const r = resolveStrict(text, YES_NO_IDS, YES_NO_NUMS, YES_NO_TEXT);
      if (!r) {
        await sendTextMessage(phone, "⚠️ Please pick one.");
        await sendYesNoQuestion(phone, "*Do you already have a WhatsApp Business number?*",
          "wa_yes", "wa_no", "wa_unsure");
        return;
      }
      ctx.waBiz = r;
      ctx.step = "ASK_NEED_WEBSITE";
      await saveCtx(conv.id, ctx);
      await sendYesNoQuestion(phone, "*Do you also need a website?*",
        "web_yes", "web_no", "web_unsure");
      break;
    }

    case "ASK_NEED_WEBSITE": {
      const r = resolveStrict(text, YES_NO_IDS, YES_NO_NUMS, YES_NO_TEXT);
      if (!r) {
        await sendTextMessage(phone, "⚠️ Please pick one.");
        await sendYesNoQuestion(phone, "*Do you also need a website?*",
          "web_yes", "web_no", "web_unsure");
        return;
      }
      ctx.needWebsite = r;
      if (r === "YES") ctx.serviceType = "BOT_AND_WEBSITE";
      ctx.step = "ASK_BUDGET";
      await saveCtx(conv.id, ctx);
      await sendBudgetQuestion(phone);
      break;
    }

    case "ASK_BUDGET": {
      const r = resolveStrict(text, BUDGET_IDS, BUDGET_NUMS);
      if (!r) {
        await sendTextMessage(phone, "⚠️ Please pick a budget range.");
        await sendBudgetQuestion(phone);
        return;
      }
      ctx.budget = r;
      ctx.step = "ASK_CLIENT_NAME";
      await saveCtx(conv.id, ctx);
      await sendTextMessage(phone,
        `👤 *Your Details*\n\nAlmost done! What's your full name?`
      );
      break;
    }

    case "ASK_CLIENT_NAME": {
      const name = text.trim();
      if (name.length < 2) {
        await sendTextMessage(phone, "⚠️ Please type your full name:");
        return;
      }
      ctx.clientName = name;
      ctx.clientPhone = contact.phone;
      ctx.step = "ASK_CLIENT_EMAIL";
      await saveCtx(conv.id, ctx);
      await sendTextMessage(phone,
        `📧 *Email*\n\nWhat's your email? We'll send your price estimate there:`
      );
      break;
    }

    case "ASK_CLIENT_EMAIL": {
      const email = text.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        await sendTextMessage(phone,
          "⚠️ That doesn't look right.\n\nPlease type a valid email (e.g. name@gmail.com):"
        );
        return;
      }
      ctx.clientEmail = email;
      ctx.clientPhone = contact.phone;
      await saveCtx(conv.id, ctx);
      await generateAndShowQuotation(phone, contact, conv, ctx);
      break;
    }

    case "SHOWING_QUOTE":
      await handlePostQuoteAction(phone, text, contact, conv, ctx);
      break;

    default:
      await showServiceTypeSelector(phone, conv.id);
  }
}

// ═══════════════════════════════════════════════════════
// WEBSITE FLOW
// ═══════════════════════════════════════════════════════

async function handleWebFlow(
  phone: string, text: string, contact: Contact, conv: Conversation, ctx: SalesCtx
): Promise<void> {
  switch (ctx.step) {

    case "ASK_BIZ_NAME": {
      if (text.trim().length < 2) {
        await sendTextMessage(phone, "Please type your business name (at least 2 characters):");
        return;
      }
      ctx.businessName = text.trim();
      ctx.step = "ASK_INDUSTRY";
      await saveCtx(conv.id, ctx);
      await sendIndustryQuestion(phone);
      break;
    }

    case "ASK_INDUSTRY": {
      const r = resolveStrict(text, INDUSTRY_IDS, INDUSTRY_NUMS);
      if (!r) {
        await sendTextMessage(phone, "⚠️ Please pick one from the list.");
        await sendIndustryQuestion(phone); return;
      }
      if (r === "__OTHER__") {
        ctx.step = "ASK_INDUSTRY_OTHER";
        await saveCtx(conv.id, ctx);
        await sendTextMessage(phone, "What kind of business is it?"); return;
      }
      ctx.industry = r;
      ctx.step = "ASK_WEB_TYPE";
      await saveCtx(conv.id, ctx);
      await sendWebTypeQuestion(phone);
      break;
    }

    case "ASK_INDUSTRY_OTHER": {
      if (text.trim().length < 2) {
        await sendTextMessage(phone, "Please type your business type:");
        return;
      }
      ctx.industry = text.trim();
      ctx.step = "ASK_WEB_TYPE";
      await saveCtx(conv.id, ctx);
      await sendWebTypeQuestion(phone);
      break;
    }

    case "ASK_WEB_TYPE": {
      const r = resolveStrict(text, WEB_TYPE_IDS, WEB_TYPE_NUMS);
      if (!r) {
        await sendTextMessage(phone, "⚠️ Please pick a website type.");
        await sendWebTypeQuestion(phone);
        return;
      }
      if (r === "__OTHER__") {
        ctx.step = "ASK_WEB_TYPE_OTHER";
        await saveCtx(conv.id, ctx);
        await sendTextMessage(phone, "What kind of website do you have in mind?"); return;
      }
      ctx.webType = r;
      ctx.step = "ASK_WEB_FEATURES";
      await saveCtx(conv.id, ctx);
      await sendWebFeaturesQuestion(phone, ctx.webFeatures);
      break;
    }

    case "ASK_WEB_TYPE_OTHER": {
      if (text.trim().length < 2) {
        await sendTextMessage(phone, "Please describe the website you need:");
        return;
      }
      ctx.webType = text.trim();
      ctx.step = "ASK_WEB_FEATURES";
      await saveCtx(conv.id, ctx);
      await sendWebFeaturesQuestion(phone, ctx.webFeatures);
      break;
    }

    case "ASK_WEB_FEATURES": {
      const r = resolveStrict(text, WEB_FEAT_IDS, WEB_FEAT_NUMS);
      if (!r) {
        await sendTextMessage(phone, "⚠️ Please pick a feature from the list.");
        await sendWebFeaturesQuestion(phone, ctx.webFeatures); return;
      }
      if (r === "__OTHER__") {
        ctx.step = "ASK_WEB_FEATURE_OTHER";
        await saveCtx(conv.id, ctx);
        await sendTextMessage(phone, "What else do you need on the website?"); return;
      }
      if (!ctx.webFeatures.includes(r)) ctx.webFeatures.push(r);
      ctx.featureCodes = mapFeaturesToCodes(ctx.webFeatures, WEB_FEATURE_MAP);
      ctx.step = "ASK_WEB_FEATURES_MORE";
      await saveCtx(conv.id, ctx);
      await sendButtonMessage(phone,
        `✅ Added: *${plain(r)}*\n\n*Picked so far:*\n${ctx.webFeatures.map((f) => `  • ${plain(f)}`).join("\n")}\n\nWant to add another?`,
        [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ That's All")],
        "Features"
      );
      break;
    }

    case "ASK_WEB_FEATURE_OTHER": {
      const custom = text.trim();
      if (custom.length < 2) {
        await sendTextMessage(phone, "Please describe the feature:");
        return;
      }
      if (!ctx.webFeatures.includes(custom)) ctx.webFeatures.push(custom);
      ctx.featureCodes = mapFeaturesToCodes(ctx.webFeatures, WEB_FEATURE_MAP);
      ctx.step = "ASK_WEB_FEATURES_MORE";
      await saveCtx(conv.id, ctx);
      await sendButtonMessage(phone,
        `✅ Added: *${custom}*\n\n*Picked so far:*\n${ctx.webFeatures.map((f) => `  • ${plain(f)}`).join("\n")}\n\nWant to add another?`,
        [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ That's All")],
        "Features"
      );
      break;
    }

    case "ASK_WEB_FEATURES_MORE": {
      const n = normalise(text);
      if (text === "feat_more" || n === "add another" || n === "add" || n === "yes" || n === "1") {
        ctx.step = "ASK_WEB_FEATURES";
        await saveCtx(conv.id, ctx);
        await sendWebFeaturesQuestion(phone, ctx.webFeatures);
      } else if (text === "feat_done" || n === "done" || n === "thats all" || n === "no" || n === "2") {
        if (ctx.webFeatures.length === 0) {
          await sendTextMessage(phone, "⚠️ Please pick at least one feature.");
          ctx.step = "ASK_WEB_FEATURES";
          await saveCtx(conv.id, ctx);
          await sendWebFeaturesQuestion(phone, ctx.webFeatures); return;
        }
        ctx.step = "ASK_DOMAIN";
        await saveCtx(conv.id, ctx);
        await sendYesNoQuestion(phone,
          "*Do you already have a website address (like .com or .ng)?*",
          "dom_yes", "dom_no", "dom_unsure");
      } else {
        await sendTextMessage(phone, "⚠️ Please tap one of the buttons.");
        await sendButtonMessage(phone,
          `*Picked so far:*\n${ctx.webFeatures.map((f) => `  • ${plain(f)}`).join("\n")}\n\nWant to add another?`,
          [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ That's All")], "Features");
      }
      break;
    }

    case "ASK_DOMAIN": {
      const r = resolveStrict(text, YES_NO_IDS, YES_NO_NUMS, YES_NO_TEXT);
      if (!r) {
        await sendTextMessage(phone, "⚠️ Please pick one.");
        await sendYesNoQuestion(phone, "*Do you already have a website address?*",
          "dom_yes", "dom_no", "dom_unsure");
        return;
      }
      ctx.domain = r;
      ctx.step = "ASK_HOSTING";
      await saveCtx(conv.id, ctx);
      await sendYesNoQuestion(phone, "*Do you already have web hosting?*",
        "host_yes", "host_no", "host_unsure");
      break;
    }

    case "ASK_HOSTING": {
      const r = resolveStrict(text, YES_NO_IDS, YES_NO_NUMS, YES_NO_TEXT);
      if (!r) {
        await sendTextMessage(phone, "⚠️ Please pick one.");
        await sendYesNoQuestion(phone, "*Do you already have web hosting?*",
          "host_yes", "host_no", "host_unsure");
        return;
      }
      ctx.hosting = r;
      ctx.step = "ASK_WA_INT";
      await saveCtx(conv.id, ctx);
      await sendYesNoQuestion(phone, "*Do you want WhatsApp chat on your website?*",
        "wai_yes", "wai_no", "wai_unsure");
      break;
    }

    case "ASK_WA_INT": {
      const r = resolveStrict(text, YES_NO_IDS, YES_NO_NUMS, YES_NO_TEXT);
      if (!r) {
        await sendTextMessage(phone, "⚠️ Please pick one.");
        await sendYesNoQuestion(phone, "*Do you want WhatsApp chat on your website?*",
          "wai_yes", "wai_no", "wai_unsure");
        return;
      }
      ctx.waIntegration = r;
      if (r === "YES" && !ctx.featureCodes.includes("WA_INTEGRATION")) {
        ctx.featureCodes.push("WA_INTEGRATION");
      }
      ctx.step = "ASK_BUDGET";
      await saveCtx(conv.id, ctx);
      await sendBudgetQuestion(phone);
      break;
    }

    case "ASK_BUDGET": {
      const r = resolveStrict(text, BUDGET_IDS, BUDGET_NUMS);
      if (!r) {
        await sendTextMessage(phone, "⚠️ Please pick a budget range.");
        await sendBudgetQuestion(phone); return;
      }
      ctx.budget = r;
      ctx.step = "ASK_CLIENT_NAME";
      await saveCtx(conv.id, ctx);
      await sendTextMessage(phone,
        `👤 *Your Details*\n\nAlmost done! What's your full name?`
      );
      break;
    }

    case "ASK_CLIENT_NAME": {
      const name = text.trim();
      if (name.length < 2) {
        await sendTextMessage(phone, "⚠️ Please type your full name:");
        return;
      }
      ctx.clientName = name;
      ctx.clientPhone = contact.phone;
      ctx.step = "ASK_CLIENT_EMAIL";
      await saveCtx(conv.id, ctx);
      await sendTextMessage(phone,
        `📧 *Email*\n\nWhat's your email? We'll send your price estimate there:`
      );
      break;
    }

    case "ASK_CLIENT_EMAIL": {
      const email = text.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        await sendTextMessage(phone,
          "⚠️ That doesn't look right.\n\nPlease type a valid email (e.g. name@gmail.com):"
        );
        return;
      }
      ctx.clientEmail = email;
      ctx.clientPhone = contact.phone;
      await saveCtx(conv.id, ctx);
      await generateAndShowQuotation(phone, contact, conv, ctx);
      break;
    }

    case "SHOWING_QUOTE":
      await handlePostQuoteAction(phone, text, contact, conv, ctx);
      break;

    default:
      await showServiceTypeSelector(phone, conv.id);
  }
}

// ═══════════════════════════════════════════════════════
// COMBO FLOW
// ═══════════════════════════════════════════════════════

async function handleComboFlow(
  phone: string, text: string, contact: Contact, conv: Conversation, ctx: SalesCtx
): Promise<void> {
  const botSteps = ["ASK_BIZ_NAME", "ASK_INDUSTRY", "ASK_INDUSTRY_OTHER",
    "ASK_BOT_FEATURES", "ASK_BOT_FEATURE_OTHER", "ASK_BOT_FEATURES_MORE", "ASK_WA_BIZ"];
  const webSteps = ["ASK_WEB_TYPE", "ASK_WEB_TYPE_OTHER",
    "ASK_WEB_FEATURES", "ASK_WEB_FEATURE_OTHER", "ASK_WEB_FEATURES_MORE",
    "ASK_DOMAIN", "ASK_HOSTING", "ASK_WA_INT"];

  if (botSteps.includes(ctx.step)) {
    await handleBotFlow(phone, text, contact, conv, ctx); return;
  }
  if (ctx.step === "ASK_NEED_WEBSITE") {
    ctx.needWebsite = "YES";
    ctx.serviceType = "BOT_AND_WEBSITE";
    ctx.step = "ASK_WEB_TYPE";
    await saveCtx(conv.id, ctx);
    await sendWebTypeQuestion(phone);
    return;
  }
  if (webSteps.includes(ctx.step)) {
    await handleWebFlow(phone, text, contact, conv, ctx); return;
  }
  if (ctx.step === "ASK_BUDGET") {
    const r = resolveStrict(text, BUDGET_IDS, BUDGET_NUMS);
    if (!r) {
      await sendTextMessage(phone, "⚠️ Please pick a budget range.");
      await sendBudgetQuestion(phone); return;
    }
    ctx.budget = r;
    ctx.step = "ASK_CLIENT_NAME";
    await saveCtx(conv.id, ctx);
    await sendTextMessage(phone,
      `👤 *Your Details*\n\nAlmost done! What's your full name?`
    );
    return;
  }
  if (ctx.step === "ASK_CLIENT_NAME") {
    const name = text.trim();
    if (name.length < 2) {
      await sendTextMessage(phone, "⚠️ Please type your full name:");
      return;
    }
    ctx.clientName = name;
    ctx.clientPhone = contact.phone;
    ctx.step = "ASK_CLIENT_EMAIL";
    await saveCtx(conv.id, ctx);
    await sendTextMessage(phone,
      `📧 *Email*\n\nWhat's your email? We'll send your price estimate there:`
    );
    return;
  }
  if (ctx.step === "ASK_CLIENT_EMAIL") {
    const email = text.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await sendTextMessage(phone,
        "⚠️ That doesn't look right.\n\nPlease type a valid email (e.g. name@gmail.com):"
      );
      return;
    }
    ctx.clientEmail = email;
    ctx.clientPhone = contact.phone;
    await saveCtx(conv.id, ctx);
    await generateAndShowQuotation(phone, contact, conv, ctx);
    return;
  }
  if (ctx.step === "SHOWING_QUOTE") {
    await handlePostQuoteAction(phone, text, contact, conv, ctx); return;
  }
  await showServiceTypeSelector(phone, conv.id);
}

// ═══════════════════════════════════════════════════════
// AUTOMATION FLOW
// ═══════════════════════════════════════════════════════

async function handleAutoFlow(
  phone: string, text: string, contact: Contact, conv: Conversation, ctx: SalesCtx
): Promise<void> {
  switch (ctx.step) {

    case "ASK_BIZ_NAME": {
      if (text.trim().length < 2) {
        await sendTextMessage(phone, "Please type your business name (at least 2 characters):"); return;
      }
      ctx.businessName = text.trim();
      ctx.step = "ASK_INDUSTRY";
      await saveCtx(conv.id, ctx);
      await sendIndustryQuestion(phone);
      break;
    }

    case "ASK_INDUSTRY": {
      const r = resolveStrict(text, INDUSTRY_IDS, INDUSTRY_NUMS);
      if (!r) {
        await sendTextMessage(phone, "⚠️ Please pick one from the list.");
        await sendIndustryQuestion(phone); return;
      }
      if (r === "__OTHER__") {
        ctx.step = "ASK_INDUSTRY_OTHER";
        await saveCtx(conv.id, ctx);
        await sendTextMessage(phone, "What kind of business is it?"); return;
      }
      ctx.industry = r;
      ctx.step = "ASK_AUTO_ACTIVITIES";
      await saveCtx(conv.id, ctx);
      await sendAutoActivitiesQuestion(phone, ctx.autoActivities);
      break;
    }

    case "ASK_INDUSTRY_OTHER": {
      if (text.trim().length < 2) {
        await sendTextMessage(phone, "Please type your business type:");
        return;
      }
      ctx.industry = text.trim();
      ctx.step = "ASK_AUTO_ACTIVITIES";
      await saveCtx(conv.id, ctx);
      await sendAutoActivitiesQuestion(phone, ctx.autoActivities);
      break;
    }

    case "ASK_AUTO_ACTIVITIES": {
      const r = resolveStrict(text, AUTO_ACT_IDS, AUTO_ACT_NUMS);
      if (!r) {
        await sendTextMessage(phone, "⚠️ Please pick a task from the list.");
        await sendAutoActivitiesQuestion(phone, ctx.autoActivities);
        return;
      }
      if (r === "__OTHER__") {
        ctx.step = "ASK_AUTO_ACTIVITY_OTHER";
        await saveCtx(conv.id, ctx);
        await sendTextMessage(phone, "What task do you want to automate?"); return;
      }
      if (!ctx.autoActivities.includes(r)) ctx.autoActivities.push(r);
      ctx.features = [...ctx.autoActivities];
      ctx.featureCodes = mapFeaturesToCodes(ctx.autoActivities, AUTO_FEATURE_MAP);
      ctx.step = "ASK_AUTO_ACTIVITIES_MORE";
      await saveCtx(conv.id, ctx);
      await sendButtonMessage(phone,
        `✅ Added: *${plain(r)}*\n\n*Picked so far:*\n${ctx.autoActivities.map((a) => `  • ${plain(a)}`).join("\n")}\n\nWant to add another?`,
        [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ That's All")], "Tasks");
      break;
    }

    case "ASK_AUTO_ACTIVITY_OTHER": {
      const custom = text.trim();
      if (custom.length < 2) {
        await sendTextMessage(phone, "Please describe the task:");
        return;
      }
      if (!ctx.autoActivities.includes(custom)) ctx.autoActivities.push(custom);
      ctx.features = [...ctx.autoActivities];
      ctx.featureCodes = mapFeaturesToCodes(ctx.autoActivities, AUTO_FEATURE_MAP);
      ctx.step = "ASK_AUTO_ACTIVITIES_MORE";
      await saveCtx(conv.id, ctx);
      await sendButtonMessage(phone,
        `✅ Added: *${custom}*\n\n*Picked so far:*\n${ctx.autoActivities.map((a) => `  • ${plain(a)}`).join("\n")}\n\nWant to add another?`,
        [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ That's All")], "Tasks");
      break;
    }

    case "ASK_AUTO_ACTIVITIES_MORE": {
      const n = normalise(text);
      if (text === "feat_more" || n === "add another" || n === "add" || n === "yes" || n === "1") {
        ctx.step = "ASK_AUTO_ACTIVITIES";
        await saveCtx(conv.id, ctx);
        await sendAutoActivitiesQuestion(phone, ctx.autoActivities);
      } else if (text === "feat_done" || n === "done" || n === "thats all" || n === "no" || n === "2") {
        if (ctx.autoActivities.length === 0) {
          await sendTextMessage(phone, "⚠️ Please pick at least one task.");
          ctx.step = "ASK_AUTO_ACTIVITIES";
          await saveCtx(conv.id, ctx);
          await sendAutoActivitiesQuestion(phone, ctx.autoActivities); return;
        }
        ctx.step = "ASK_AUTO_PROCESS";
        await saveCtx(conv.id, ctx);
        await sendAutoProcessQuestion(phone);
      } else {
        await sendTextMessage(phone, "⚠️ Please tap one of the buttons.");
        await sendButtonMessage(phone,
          `*Picked so far:*\n${ctx.autoActivities.map((a) => `  • ${plain(a)}`).join("\n")}\n\nWant to add another?`,
          [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ That's All")], "Tasks");
      }
      break;
    }

    case "ASK_AUTO_PROCESS": {
      const r = resolveStrict(text, AUTO_PROC_IDS, AUTO_PROC_NUMS);
      if (!r) {
        await sendTextMessage(phone, "⚠️ Please pick one.");
        await sendAutoProcessQuestion(phone);
        return;
      }
      ctx.autoProcess = r === "__OTHER__" ? "Other" : r;
      ctx.step = "ASK_AUTO_USERS";
      await saveCtx(conv.id, ctx);
      await sendAutoUsersQuestion(phone);
      break;
    }

    case "ASK_AUTO_USERS": {
      const r = resolveStrict(text, AUTO_USERS_IDS, AUTO_USERS_NUMS);
      if (!r) {
        await sendTextMessage(phone, "⚠️ Please pick one.");
        await sendAutoUsersQuestion(phone);
        return;
      }
      ctx.autoUsers = r;
      ctx.step = "ASK_AUTO_INTEGRATIONS";
      await saveCtx(conv.id, ctx);
      await sendAutoIntegrationsQuestion(phone, ctx.autoIntegrations);
      break;
    }

    case "ASK_AUTO_INTEGRATIONS": {
      const r = resolveStrict(text, AUTO_INT_IDS, AUTO_INT_NUMS);
      if (!r) {
        await sendTextMessage(phone, "⚠️ Please pick one from the list.");
        await sendAutoIntegrationsQuestion(phone, ctx.autoIntegrations);
        return;
      }
      if (r === "__OTHER__") {
        ctx.step = "ASK_AUTO_INT_OTHER";
        await saveCtx(conv.id, ctx);
        await sendTextMessage(phone, "What other tool should it connect to?"); return;
      }
      if (!ctx.autoIntegrations.includes(r)) ctx.autoIntegrations.push(r);
      ctx.step = "ASK_AUTO_INT_MORE";
      await saveCtx(conv.id, ctx);
      await sendButtonMessage(phone,
        `✅ Added: *${plain(r)}*\n\n*Picked so far:*\n${ctx.autoIntegrations.map((i) => `  • ${plain(i)}`).join("\n")}\n\nWant to add another?`,
        [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ That's All")], "Tools");
      break;
    }

    case "ASK_AUTO_INT_OTHER": {
      const custom = text.trim();
      if (custom.length < 2) {
        await sendTextMessage(phone, "Please type the tool name:");
        return;
      }
      if (!ctx.autoIntegrations.includes(custom)) ctx.autoIntegrations.push(custom);
      ctx.step = "ASK_AUTO_INT_MORE";
      await saveCtx(conv.id, ctx);
      await sendButtonMessage(phone,
        `✅ Added: *${custom}*\n\n*Picked so far:*\n${ctx.autoIntegrations.map((i) => `  • ${plain(i)}`).join("\n")}\n\nWant to add another?`,
        [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ That's All")], "Tools");
      break;
    }

    case "ASK_AUTO_INT_MORE": {
      const n = normalise(text);
      if (text === "feat_more" || n === "add another" || n === "add" || n === "yes" || n === "1") {
        ctx.step = "ASK_AUTO_INTEGRATIONS";
        await saveCtx(conv.id, ctx);
        await sendAutoIntegrationsQuestion(phone, ctx.autoIntegrations);
      } else if (text === "feat_done" || n === "done" || n === "thats all" || n === "no" || n === "2") {
        ctx.step = "ASK_BUDGET";
        await saveCtx(conv.id, ctx);
        await sendBudgetQuestion(phone);
      } else {
        await sendTextMessage(phone, "⚠️ Please tap one of the buttons.");
        await sendButtonMessage(phone,
          `*Picked so far:*\n${ctx.autoIntegrations.map((i) => `  • ${plain(i)}`).join("\n")}\n\nWant to add another?`,
          [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ That's All")], "Tools");
      }
      break;
    }

    case "ASK_BUDGET": {
      const r = resolveStrict(text, BUDGET_IDS, BUDGET_NUMS);
      if (!r) {
        await sendTextMessage(phone, "⚠️ Please pick a budget range.");
        await sendBudgetQuestion(phone); return;
      }
      ctx.budget = r;
      ctx.step = "ASK_CLIENT_NAME";
      await saveCtx(conv.id, ctx);
      await sendTextMessage(phone,
        `👤 *Your Details*\n\nAlmost done! What's your full name?`
      );
      break;
    }

    case "ASK_CLIENT_NAME": {
      const name = text.trim();
      if (name.length < 2) {
        await sendTextMessage(phone, "⚠️ Please type your full name:");
        return;
      }
      ctx.clientName = name;
      ctx.clientPhone = contact.phone;
      ctx.step = "ASK_CLIENT_EMAIL";
      await saveCtx(conv.id, ctx);
      await sendTextMessage(phone,
        `📧 *Email*\n\nWhat's your email? We'll send your price estimate there:`
      );
      break;
    }

    case "ASK_CLIENT_EMAIL": {
      const email = text.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        await sendTextMessage(phone,
          "⚠️ That doesn't look right.\n\nPlease type a valid email (e.g. name@gmail.com):"
        );
        return;
      }
      ctx.clientEmail = email;
      ctx.clientPhone = contact.phone;
      await saveCtx(conv.id, ctx);
      await generateAndShowQuotation(phone, contact, conv, ctx);
      break;
    }

    case "SHOWING_QUOTE":
      await handlePostQuoteAction(phone, text, contact, conv, ctx);
      break;

    default:
      await showServiceTypeSelector(phone, conv.id);
  }
}

// ═══════════════════════════════════════════════════════
// QUOTATION GENERATOR  (plain English)
// ═══════════════════════════════════════════════════════

async function generateAndShowQuotation(
  phone: string, contact: Contact, conv: Conversation, ctx: SalesCtx
): Promise<void> {
  const serviceType = ctx.serviceType || flowToServiceType(ctx.flow);
  const allFeatures = [...ctx.features, ...ctx.webFeatures, ...ctx.autoActivities];

  let allCodes: string[] = [];
  if (ctx.flow === "COMBO") {
    const botCodes = mapFeaturesToCodes(ctx.features, BOT_FEATURE_MAP);
    const webCodes = mapFeaturesToCodes(ctx.webFeatures, WEB_FEATURE_MAP);
    allCodes = [...new Set([...botCodes, ...webCodes])];
  } else {
    const featureMap = ctx.flow === "WEB" ? WEB_FEATURE_MAP
      : ctx.flow === "AUTO" ? AUTO_FEATURE_MAP : BOT_FEATURE_MAP;
    allCodes = mapFeaturesToCodes(allFeatures, featureMap);
  }

  const match = await matchPackage(serviceType, allCodes, ctx.budget);

  if (!match) {
    const lead = await createLead(contact.id, serviceType, buildLeadFields(ctx));
    if (lead) ctx.leadId = lead.id;
    ctx.step = "SHOWING_QUOTE";
    await saveCtx(conv.id, ctx);
    await sendButtonMessage(phone,
      "Thanks! One of our team members will prepare a custom price for you.\n\nWhat would you like to do?",
      [makeButton("q_agent", "👤 Talk to Our Team"), makeButton("menu_home", "🏠 Main Menu")], "Next Steps");
    return;
  }

  const pkg = match.pkg;
  ctx.selectedPackageId = pkg.id;
  ctx.selectedPackageCode = pkg.package_code;
  ctx.estimatedMin = pkg.min_price;
  ctx.estimatedMax = pkg.max_price;

  let lead = await getActiveLeadForContact(contact.id, serviceType);
  const fields = buildLeadFields(ctx, pkg);
  if (lead) { await updateLead(lead.id, fields); }
  else { lead = await createLead(contact.id, serviceType, fields); }
  if (lead) ctx.leadId = lead.id;

  const serviceLabel = plain(serviceType.replace(/_/g, " "));
  const deliverables = (pkg.features || []) as string[];
  const quotation = await createQuotation(
    lead?.id || "", pkg.id,
    `${serviceLabel} — ${pkg.package_name}`,
    pkg.description, deliverables, pkg.min_price, pkg.max_price
  );
  if (quotation) { ctx.quotationId = quotation.id; ctx.quotationNumber = quotation.quotation_number; }

  ctx.step = "SHOWING_QUOTE";
  await saveCtx(conv.id, ctx);

  const delivBullets = deliverables.slice(0, 8).map((d) => `  • ${plain(d.replace(/_/g, " "))}`).join("\n");
  const msg =
    `━━━━━━━━━━━━━━━━\n📋 *YOUR PRICE ESTIMATE*\n━━━━━━━━━━━━━━━━\n\n` +
    `*Name:* ${ctx.clientName || contact.name || "Customer"}\n` +
    `*Email:* ${ctx.clientEmail || "Provided"}\n` +
    `*Business:* ${ctx.businessName || "N/A"}\n` +
    `*Type:* ${plain(ctx.industry || "N/A")}\n` +
    `*Project:* ${serviceLabel}\n` +
    `*Package:* ${pkg.package_name}\n` +
    `*Ref:* ${ctx.quotationNumber || "PENDING"}\n\n` +
    `*Estimated Price:*\n${formatNaira(pkg.min_price)} – ${formatNaira(pkg.max_price)}\n\n` +
    `*What's included:*\n${delivBullets}\n\n` +
    `⚠️ _This is an estimate. We'll confirm the final price after reviewing everything._`;

  await sendButtonMessage(phone, msg,
    [makeButton("q_select", "✅ Get Started"), makeButton("q_change", "🔄 Start Over"), makeButton("q_agent", "👤 Talk to Our Team")],
    "Xtop", "Valid for 14 days");
}

function buildLeadFields(
  ctx: SalesCtx,
  pkg?: { id: string; min_price: number; max_price: number }
): Partial<import("../database.ts").Lead> {
  return {
    business_name: ctx.businessName,
    industry: ctx.industry,
    features: [...ctx.features, ...ctx.webFeatures, ...ctx.autoActivities],
    budget_range: ctx.budget,
    bot_required: ctx.flow === "BOT" || ctx.flow === "COMBO",
    website_required: ctx.flow === "WEB" || ctx.flow === "COMBO" || ctx.needWebsite === "YES",
    whatsapp_number_available: ctx.waBiz || null,
    domain_available: ctx.domain || null,
    hosting_available: ctx.hosting || null,
    estimated_min_price: pkg?.min_price || null,
    estimated_max_price: pkg?.max_price || null,
    selected_package_id: pkg?.id || null,
    status: pkg ? "QUOTED" : "QUALIFYING",
    requirements_json: {
      client_name: ctx.clientName || null,
      client_email: ctx.clientEmail || null,
      client_phone: ctx.clientPhone || null,
      flow: ctx.flow,
      service_type: ctx.serviceType,
      business_name: ctx.businessName,
      industry: ctx.industry,
      bot_features: ctx.features,
      bot_feature_codes: ctx.featureCodes,
      web_features: ctx.webFeatures,
      web_type: ctx.webType,
      whatsapp_business: ctx.waBiz,
      need_website: ctx.needWebsite,
      domain: ctx.domain,
      hosting: ctx.hosting,
      whatsapp_integration: ctx.waIntegration,
      automation_activities: ctx.autoActivities,
      automation_process: ctx.autoProcess,
      automation_users: ctx.autoUsers,
      automation_integrations: ctx.autoIntegrations,
      budget: ctx.budget,
    },
  };
}

// ═══════════════════════════════════════════════════════
// POST-QUOTATION ACTIONS  (plain English + onboarding routing)
// ═══════════════════════════════════════════════════════

async function handlePostQuoteAction(
  phone: string,
  text: string,
  contact: Contact,
  conv: Conversation,
  ctx: SalesCtx
): Promise<void> {
  const n = normalise(text);

  // ── Back to main menu ──
  if (n === "menu_home" || n === "main menu" || n === "menu") {
    await updateConversation(conv.id, {
      current_module: "MAIN_MENU",
      current_state: "IDLE",
      context_json: {},
    });
    await sendTextMessage(phone,
      "No problem! You can always come back when you're ready. 😊"
    );
    await showMainMenu(phone, conv.id);
    return;
  }

  // ── Start Over / Change Requirements ──
  if (n === "q_change" || n.includes("change") || n.includes("start over")) {
    await showServiceTypeSelector(phone, conv.id);
    return;
  }

  // ── Get Started / Select Package ──
  if (n === "q_select" || n.includes("get started") || n.includes("select")) {
    if (ctx.leadId) {
      await updateLead(ctx.leadId, {
        status: "PACKAGE_SELECTED",
        selected_package_id: ctx.selectedPackageId,
      });
    }
    if (ctx.quotationId) {
      await updateQuotation(ctx.quotationId, { status: "PACKAGE_SELECTED" });
    }

    const svc = (ctx.serviceType || flowToServiceType(ctx.flow)).toUpperCase();

    // ── WEBSITE or AUTOMATION → old onboarding (Netlify link) ──
    if (svc === "WEBSITE" || svc === "AUTOMATION") {
      const label = svc === "WEBSITE" ? "website" : "automation";

      await updateConversation(conv.id, {
        current_module: "MAIN_MENU",
        current_state: "IDLE",
        context_json: { lastService: svc },
      });

      await sendTextMessage(phone,
        `Great choice! To set up your ${label}, you'll need to connect your WhatsApp number.\n\n` +
        `*Here's how (takes about 2 minutes):*\n\n` +
        `1️⃣ Open *Chrome* on your phone\n` +
        `2️⃣ Type or paste this link:\n` +
        `👉 https://xtopbot.netlify.app/\n` +
        `3️⃣ Tap *"Connect to WhatsApp"*\n` +
        `4️⃣ Follow the steps on screen\n\n` +
        `Once you're done, we'll finish setting everything up for you! 🚀\n\n` +
        `If the link doesn't open, copy it and paste it in Chrome.`
      );
      return;
    }

    // ── BOT or COMBO → WhatsApp-native onboarding (plan picker) ──
    const { startOnboardingFromSales } = await import("./onboarding.ts");

    await updateConversation(conv.id, {
      current_module: "ONBOARDING",
      current_state: "ONBOARDING_PLAN",
      context_json: {
        ...ctx,
        onboarding_source: "sales",
        onboarding_service: svc,
      } as unknown as Record<string, unknown>,
    });

    await startOnboardingFromSales(phone, {
      state: "ONBOARDING_PLAN",
      onboarding_source: "sales",
      onboarding_service: svc,
    }, svc);
    return;
  }

  // ── Talk to Our Team ──
  if (n === "q_agent" || n === "q_agent_now" || n.includes("agent") || n.includes("talk") || n.includes("team")) {
    const summary =
      `Client: ${ctx.clientName || contact.name || "N/A"}\n` +
      `Email: ${ctx.clientEmail || "N/A"}\n` +
      `Phone: ${ctx.clientPhone || phone}\n` +
      `Business: ${ctx.businessName || "N/A"}\n` +
      `Industry: ${ctx.industry || "N/A"}\n` +
      `Service: ${ctx.serviceType || "N/A"}\n` +
      `Features: ${[...ctx.features, ...ctx.webFeatures, ...ctx.autoActivities].join(", ") || "N/A"}\n` +
      `Budget: ${ctx.budget || "N/A"}\n` +
      `Package: ${ctx.selectedPackageCode || "N/A"}\n` +
      `Estimate: ${formatNaira(ctx.estimatedMin || 0)} – ${formatNaira(ctx.estimatedMax || 0)}\n` +
      `Quotation Ref: ${ctx.quotationNumber || "N/A"}`;

    const record = await createAgentRequest(
      contact.id,
      "QUOTATION",
      `Price review request from ${ctx.clientName || contact.name || contact.phone}`,
      "HIGH",
      ctx.leadId,
      ctx.quotationId,
      summary
    );

    if (!record || !record.id) {
      await sendButtonMessage(phone,
        "⚠️ *Sorry, we couldn't save your request right now.*\n\n" +
        "Your price estimate is still here. Please try again in a few minutes.",
        [makeButton("q_agent", "🔄 Try Again"), makeButton("menu_home", "🏠 Main Menu")],
        "Try Again"
      );
      return;
    }

    if (ctx.leadId) await updateLead(ctx.leadId, { status: "AGENT_REQUESTED" });
    if (ctx.quotationId) await updateQuotation(ctx.quotationId, { status: "AGENT_REVIEW" });

    const ticketRef = `#REQ-${record.id.substring(0, 8).toUpperCase()}`;

    await updateConversation(conv.id, {
      current_module: "MAIN_MENU",
      current_state: "IDLE",
      context_json: { lastRequestId: record.id, lastRequestRef: ticketRef },
    });

    await sendButtonMessage(phone,
      `✅ *Got it! We've saved your request.*\n\n` +
      `*Ticket:* ${ticketRef}\n` +
      `*Ref:* ${ctx.quotationNumber || "N/A"}\n\n` +
      `One of our team members will message you on WhatsApp soon. 👍`,
      [makeButton("menu_home", "🏠 Main Menu")],
      "Request Saved"
    );
    return;
  }

  // ── Fallback ──
  await sendButtonMessage(phone,
    "What would you like to do next?",
    [
      makeButton("q_select", "✅ Get Started"),
      makeButton("q_change", "🔄 Start Over"),
      makeButton("q_agent", "👤 Talk to Our Team"),
    ],
    "Your Options"
  );
}
