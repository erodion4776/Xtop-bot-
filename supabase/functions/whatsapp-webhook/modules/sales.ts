// supabase/functions/whatsapp-webhook/modules/sales.ts
// Phase 3 — Strict Structured Qualification with Full Validation
// NO AI API. All validation is deterministic.

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
  normalise, isBack, isExit, isGreeting, extractSelection,
} from "../utils.ts";
import { showMainMenu } from "./main-menu.ts";

// ═══════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════

interface SalesCtx {
  flow: "BOT" | "WEB" | "COMBO" | "AUTO";
  step: string;
  leadId?: string;
  quotationId?: string;
  quotationNumber?: string;
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
    flow, step: "ENTRY",
    features: [], featureCodes: [],
    webFeatures: [], autoActivities: [], autoIntegrations: [],
    serviceType: flowToServiceType(flow),
  };
}

function flowToServiceType(flow: string): string {
  if (flow === "BOT") return "WHATSAPP_BOT";
  if (flow === "WEB") return "WEBSITE";
  if (flow === "COMBO") return "BOT_AND_WEBSITE";
  return "AUTOMATION";
}

async function saveCtx(id: string, ctx: SalesCtx): Promise<void> {
  await updateConversation(id, { context_json: ctx as unknown as Record<string, unknown> });
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
  const n = normalise(text);
  if (idMap[text]) return idMap[text];
  const num = extractSelection(text);
  if (num !== null && numMap[num]) return numMap[num];
  if (textAliases) {
    for (const [alias, value] of Object.entries(textAliases)) {
      if (n === alias || n.startsWith(alias + " ")) return value;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════
// OPTION MAPS
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
// REUSABLE QUESTION SENDERS
// ═══════════════════════════════════════════════════════

async function sendIndustryQuestion(phone: string): Promise<void> {
  await sendListMessage(phone,
    "*What type of business do you operate?*\n\nPlease select one:",
    "Select Industry",
    [{ title: "Business Type", rows: [
      makeListRow("ind_retail", "1️⃣ Retail & E-commerce", ""),
      makeListRow("ind_edu", "2️⃣ Education & School", ""),
      makeListRow("ind_health", "3️⃣ Health & Pharmacy", ""),
      makeListRow("ind_realestate", "4️⃣ Real Estate", ""),
      makeListRow("ind_services", "5️⃣ Professional Services", ""),
      makeListRow("ind_food", "6️⃣ Food & Hospitality", ""),
      makeListRow("ind_ngo", "7️⃣ Church/NGO/Organisation", ""),
      makeListRow("ind_mfg", "8️⃣ Manufacturing", ""),
      makeListRow("ind_other", "9️⃣ Other", ""),
    ]}],
  );
}

async function sendBotFeaturesQuestion(phone: string, selected: string[]): Promise<void> {
  const summary = selected.length > 0
    ? `\n\n✅ *Selected so far:*\n${selected.map((f) => `  • ${f}`).join("\n")}\n`
    : "";
  await sendListMessage(phone,
    `*What should your WhatsApp bot do?*${summary}\nSelect one feature. You can add more after.`,
    "Select Feature",
    [{ title: "Bot Features", rows: [
      makeListRow("bf_faq", "1️⃣ Answer FAQs", ""),
      makeListRow("bf_orders", "2️⃣ Receive Orders", ""),
      makeListRow("bf_leads", "3️⃣ Collect Leads", ""),
      makeListRow("bf_recs", "4️⃣ Product Recs", ""),
      makeListRow("bf_booking", "5️⃣ Bookings", ""),
      makeListRow("bf_support", "6️⃣ Customer Support", ""),
      makeListRow("bf_pay", "7️⃣ Payments", ""),
      makeListRow("bf_quotes", "8️⃣ Quotations", ""),
      makeListRow("bf_notif", "9️⃣ Notifications", ""),
      makeListRow("bf_crm", "🔟 CRM/Database", ""),
    ]}],
  );
}

async function sendWebTypeQuestion(phone: string): Promise<void> {
  await sendListMessage(phone,
    "*What type of website do you need?*",
    "Select Type",
    [{ title: "Website Type", rows: [
      makeListRow("wt_corp", "1️⃣ Corporate/Business", ""),
      makeListRow("wt_landing", "2️⃣ Landing Page", ""),
      makeListRow("wt_ecom", "3️⃣ E-commerce", ""),
      makeListRow("wt_portal", "4️⃣ Customer Portal", ""),
      makeListRow("wt_booking", "5️⃣ Booking Website", ""),
      makeListRow("wt_custom", "6️⃣ Custom Web App", ""),
      makeListRow("wt_other", "7️⃣ Other", ""),
    ]}],
  );
}

async function sendWebFeaturesQuestion(phone: string, selected: string[]): Promise<void> {
  const summary = selected.length > 0
    ? `\n\n✅ *Selected so far:*\n${selected.map((f) => `  • ${f}`).join("\n")}\n`
    : "";
  await sendListMessage(phone,
    `*What features do you need on the website?*${summary}\nSelect one. You can add more after.`,
    "Select Feature",
    [{ title: "Web Features", rows: [
      makeListRow("wf_cms", "1️⃣ Admin/CMS Dashboard", ""),
      makeListRow("wf_pay", "2️⃣ Online Payment", ""),
      makeListRow("wf_wa", "3️⃣ WhatsApp Integration", ""),
      makeListRow("wf_acct", "4️⃣ Customer Accounts", ""),
      makeListRow("wf_forms", "5️⃣ Online Forms", ""),
      makeListRow("wf_book", "6️⃣ Booking System", ""),
      makeListRow("wf_cat", "7️⃣ Product Catalogue", ""),
      makeListRow("wf_db", "8️⃣ Database", ""),
      makeListRow("wf_report", "9️⃣ Reports", ""),
      makeListRow("wf_other", "🔟 Other", ""),
    ]}],
  );
}

async function sendYesNoQuestion(
  phone: string, question: string, yesId: string, noId: string, unsureId: string
): Promise<void> {
  await sendListMessage(phone, question, "Select",
    [{ title: "Choose", rows: [
      makeListRow(yesId, "1️⃣ Yes", ""),
      makeListRow(noId, "2️⃣ No", ""),
      makeListRow(unsureId, "3️⃣ Not sure", ""),
    ]}]);
}

async function sendBudgetQuestion(phone: string): Promise<void> {
  await sendListMessage(phone,
    "*What budget range have you planned for this project?*\n\nPlease select one:",
    "Select Budget",
    [{ title: "Budget Range", rows: [
      makeListRow("bud_1", "1️⃣ ₦100k – ₦200k", "Starter"),
      makeListRow("bud_2", "2️⃣ ₦200k – ₦500k", "Standard"),
      makeListRow("bud_3", "3️⃣ ₦500k – ₦900k", "Advanced"),
      makeListRow("bud_4", "4️⃣ Above ₦900k", "Enterprise"),
      makeListRow("bud_5", "5️⃣ Not sure", "Need guidance"),
    ]}],
  );
}

async function sendAutoActivitiesQuestion(phone: string, selected: string[]): Promise<void> {
  const summary = selected.length > 0
    ? `\n\n✅ *Selected so far:*\n${selected.map((f) => `  • ${f}`).join("\n")}\n`
    : "";
  await sendListMessage(phone,
    `*Which business activity would you like to automate?*${summary}\nSelect one. You can add more after.`,
    "Select Activity",
    [{ title: "Activities", rows: [
      makeListRow("aa_cs", "1️⃣ Customer Mgmt", ""),
      makeListRow("aa_sales", "2️⃣ Sales/Orders", ""),
      makeListRow("aa_inv", "3️⃣ Invoicing", ""),
      makeListRow("aa_crm", "4️⃣ CRM", ""),
      makeListRow("aa_sheets", "5️⃣ Sheets/Excel", ""),
      makeListRow("aa_db", "6️⃣ Database Mgmt", ""),
      makeListRow("aa_pdf", "7️⃣ PDF Generation", ""),
      makeListRow("aa_report", "8️⃣ Reports", ""),
      makeListRow("aa_wa", "9️⃣ WhatsApp Auto", ""),
      makeListRow("aa_email", "🔟 Email Auto", ""),
    ]}],
  );
}

async function sendAutoProcessQuestion(phone: string): Promise<void> {
  await sendListMessage(phone,
    "*Where does this process currently happen?*",
    "Select",
    [{ title: "Current Process", rows: [
      makeListRow("ap_wa", "1️⃣ WhatsApp", ""),
      makeListRow("ap_excel", "2️⃣ Excel", ""),
      makeListRow("ap_sheets", "3️⃣ Google Sheets", ""),
      makeListRow("ap_web", "4️⃣ Website", ""),
      makeListRow("ap_paper", "5️⃣ Paper/Manual", ""),
      makeListRow("ap_sw", "6️⃣ Existing Software", ""),
      makeListRow("ap_multi", "7️⃣ Multiple places", ""),
      makeListRow("ap_other", "8️⃣ Other", ""),
    ]}]);
}

async function sendAutoUsersQuestion(phone: string): Promise<void> {
  await sendListMessage(phone,
    "*How many people will use the system?*",
    "Select",
    [{ title: "Users", rows: [
      makeListRow("au_1", "1️⃣ 1 person", ""),
      makeListRow("au_2", "2️⃣ 2–5 people", ""),
      makeListRow("au_3", "3️⃣ 6–20 people", ""),
      makeListRow("au_4", "4️⃣ More than 20", ""),
      makeListRow("au_5", "5️⃣ Not sure", ""),
    ]}]);
}

async function sendAutoIntegrationsQuestion(phone: string, selected: string[]): Promise<void> {
  const summary = selected.length > 0
    ? `\n\n✅ *Selected so far:*\n${selected.map((f) => `  • ${f}`).join("\n")}\n`
    : "";
  await sendListMessage(phone,
    `*Which systems should the automation connect to?*${summary}\nSelect one. You can add more after.`,
    "Select Integration",
    [{ title: "Integrations", rows: [
      makeListRow("ai_wa", "1️⃣ WhatsApp", ""),
      makeListRow("ai_web", "2️⃣ Website", ""),
      makeListRow("ai_sheets", "3️⃣ Google Sheets", ""),
      makeListRow("ai_email", "4️⃣ Email", ""),
      makeListRow("ai_pay", "5️⃣ Payment Gateway", ""),
      makeListRow("ai_db", "6️⃣ Database", ""),
      makeListRow("ai_crm", "7️⃣ CRM", ""),
      makeListRow("ai_none", "8️⃣ None", ""),
      makeListRow("ai_other", "9️⃣ Other", ""),
    ]}]);
}

// ═══════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════

export async function handleSales(
  phone: string, text: string, contact: Contact, conv: Conversation
): Promise<void> {
  const n = normalise(text);

  if (isGreeting(text)) { await showMainMenu(phone, conv.id); return; }
  if (isExit(text) || n === "cancel") {
    await updateConversation(conv.id, { current_module: "MAIN_MENU", current_state: "IDLE", context_json: {} });
    await sendTextMessage(phone, "Your quotation process has been paused. Type *menu* to continue later.");
    return;
  }
  if (isBack(text)) {
    const ctx = (conv.context_json as SalesCtx) || defaultCtx("BOT");
    if (!ctx.step || ctx.step === "ENTRY" || ctx.step === "ASK_SERVICE_TYPE") {
      await showMainMenu(phone, conv.id); return;
    }
    await showServiceTypeSelector(phone, conv.id); return;
  }

  const ctx = (conv.context_json as SalesCtx) || defaultCtx("BOT");
  if (!ctx.step || ctx.step === "ENTRY" || ctx.step === "ASK_SERVICE_TYPE") {
    await processServiceTypeSelection(phone, text, conv); return;
  }

  switch (ctx.flow) {
    case "BOT": await handleBotFlow(phone, text, contact, conv, ctx); break;
    case "WEB": await handleWebFlow(phone, text, contact, conv, ctx); break;
    case "COMBO": await handleComboFlow(phone, text, contact, conv, ctx); break;
    case "AUTO": await handleAutoFlow(phone, text, contact, conv, ctx); break;
    default: await showServiceTypeSelector(phone, conv.id);
  }
}

// ═══════════════════════════════════════════════════════
// SERVICE TYPE SELECTOR
// ═══════════════════════════════════════════════════════

export async function showServiceTypeSelector(phone: string, convId: string): Promise<void> {
  await updateConversation(convId, {
    current_module: "SALES", current_state: "ASK_SERVICE_TYPE",
    context_json: defaultCtx("BOT") as unknown as Record<string, unknown>,
  });
  await sendListMessage(phone,
    "💼 *What would you like us to build?*\n\nSelect a project type:",
    "Select Project",
    [{ title: "Project Types", rows: [
      makeListRow("sales_bot", "1️⃣ WhatsApp Bot", "Automated chatbot"),
      makeListRow("sales_web", "2️⃣ Website", "Business or e-commerce"),
      makeListRow("sales_combo", "3️⃣ Bot + Website", "Complete package"),
      makeListRow("sales_auto", "4️⃣ Automation", "Workflow automation"),
    ]}],
    "Xtop Sales", "Instant Quotation"
  );
}

async function processServiceTypeSelection(phone: string, text: string, conv: Conversation): Promise<void> {
  const r = resolveStrict(text,
    { sales_bot: "BOT", sales_web: "WEB", sales_combo: "COMBO", sales_auto: "AUTO" },
    { 1: "BOT", 2: "WEB", 3: "COMBO", 4: "AUTO" }
  );
  if (!r) { await showServiceTypeSelector(phone, conv.id); return; }

  const flow = r as SalesCtx["flow"];
  const ctx = defaultCtx(flow);
  ctx.step = "ASK_BIZ_NAME";
  await updateConversation(conv.id, {
    current_module: "SALES", current_state: "QUALIFYING",
    context_json: ctx as unknown as Record<string, unknown>,
  });

  const titles: Record<string, string> = {
    BOT: "🤖 *Build a Custom WhatsApp Bot*",
    WEB: "🌐 *Build a Business Website*",
    COMBO: "📦 *WhatsApp Bot + Website Combo*",
    AUTO: "⚙️ *Business Automation Project*",
  };
  await sendTextMessage(phone,
    `${titles[flow]}\n\nI will ask you a few quick questions to generate your instant quotation.\n\n` +
    `*1. What is the name of your business or brand?*\n\n_(Type your business name)_`
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
        await sendTextMessage(phone, "Please enter your business name (at least 2 characters):");
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
        await sendTextMessage(phone, "⚠️ Please select one of the industries from the list.");
        await sendIndustryQuestion(phone);
        return;
      }
      if (r === "__OTHER__") {
        ctx.step = "ASK_INDUSTRY_OTHER";
        await saveCtx(conv.id, ctx);
        await sendTextMessage(phone, "Please enter your business type:");
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
        await sendTextMessage(phone, "Please enter a valid business type:");
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
        await sendTextMessage(phone, "⚠️ Please select a feature from the list.");
        await sendBotFeaturesQuestion(phone, ctx.features);
        return;
      }
      if (r === "__OTHER__") {
        ctx.step = "ASK_BOT_FEATURE_OTHER";
        await saveCtx(conv.id, ctx);
        await sendTextMessage(phone, "What custom feature do you need?");
        return;
      }
      if (!ctx.features.includes(r)) ctx.features.push(r);
      ctx.featureCodes = mapFeaturesToCodes(ctx.features, BOT_FEATURE_MAP);
      ctx.step = "ASK_BOT_FEATURES_MORE";
      await saveCtx(conv.id, ctx);
      await sendButtonMessage(phone,
        `✅ Added: *${r}*\n\n*Selected so far:*\n${ctx.features.map((f) => `  • ${f}`).join("\n")}\n\nAdd another feature?`,
        [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ Done")],
        "Features"
      );
      break;
    }

    case "ASK_BOT_FEATURE_OTHER": {
      const custom = text.trim();
      if (custom.length < 2) {
        await sendTextMessage(phone, "Please enter a valid feature:");
        return;
      }
      if (!ctx.features.includes(custom)) ctx.features.push(custom);
      ctx.featureCodes = mapFeaturesToCodes(ctx.features, BOT_FEATURE_MAP);
      ctx.step = "ASK_BOT_FEATURES_MORE";
      await saveCtx(conv.id, ctx);
      await sendButtonMessage(phone,
        `✅ Added: *${custom}*\n\n*Selected so far:*\n${ctx.features.map((f) => `  • ${f}`).join("\n")}\n\nAdd another feature?`,
        [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ Done")],
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
      } else if (text === "feat_done" || n === "done" || n === "no" || n === "2") {
        if (ctx.features.length === 0) {
          await sendTextMessage(phone, "⚠️ Please select at least one feature.");
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
        await sendTextMessage(phone, "⚠️ Please tap one of the buttons below.");
        await sendButtonMessage(phone,
          `*Selected so far:*\n${ctx.features.map((f) => `  • ${f}`).join("\n")}\n\nAdd another feature?`,
          [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ Done")],
          "Features"
        );
      }
      break;
    }

    case "ASK_WA_BIZ": {
      const r = resolveStrict(text, YES_NO_IDS, YES_NO_NUMS, YES_NO_TEXT);
      if (!r) {
        await sendTextMessage(phone, "⚠️ Please select one of the options.");
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
        await sendTextMessage(phone, "⚠️ Please select one of the options.");
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
        await sendTextMessage(phone, "⚠️ Please select a budget range from the list.");
        await sendBudgetQuestion(phone);
        return;
      }
      ctx.budget = r;
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
        await sendTextMessage(phone, "Please enter your business name (at least 2 characters):");
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
        await sendTextMessage(phone, "⚠️ Please select one of the industries from the list.");
        await sendIndustryQuestion(phone); return;
      }
      if (r === "__OTHER__") {
        ctx.step = "ASK_INDUSTRY_OTHER";
        await saveCtx(conv.id, ctx);
        await sendTextMessage(phone, "Please enter your business type:"); return;
      }
      ctx.industry = r;
      ctx.step = "ASK_WEB_TYPE";
      await saveCtx(conv.id, ctx);
      await sendWebTypeQuestion(phone);
      break;
    }

    case "ASK_INDUSTRY_OTHER": {
      if (text.trim().length < 2) {
        await sendTextMessage(phone, "Please enter a valid business type:");
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
        await sendTextMessage(phone, "⚠️ Please select a website type from the list.");
        await sendWebTypeQuestion(phone);
        return;
      }
      if (r === "__OTHER__") {
        ctx.step = "ASK_WEB_TYPE_OTHER";
        await saveCtx(conv.id, ctx);
        await sendTextMessage(phone, "Please describe the type of website you need:"); return;
      }
      ctx.webType = r;
      ctx.step = "ASK_WEB_FEATURES";
      await saveCtx(conv.id, ctx);
      await sendWebFeaturesQuestion(phone, ctx.webFeatures);
      break;
    }

    case "ASK_WEB_TYPE_OTHER": {
      if (text.trim().length < 2) {
        await sendTextMessage(phone, "Please describe a valid website type:");
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
        await sendTextMessage(phone, "⚠️ Please select a feature from the list.");
        await sendWebFeaturesQuestion(phone, ctx.webFeatures); return;
      }
      if (r === "__OTHER__") {
        ctx.step = "ASK_WEB_FEATURE_OTHER";
        await saveCtx(conv.id, ctx);
        await sendTextMessage(phone, "What custom feature do you need?"); return;
      }
      if (!ctx.webFeatures.includes(r)) ctx.webFeatures.push(r);
      ctx.featureCodes = mapFeaturesToCodes(ctx.webFeatures, WEB_FEATURE_MAP);
      ctx.step = "ASK_WEB_FEATURES_MORE";
      await saveCtx(conv.id, ctx);
      await sendButtonMessage(phone,
        `✅ Added: *${r}*\n\n*Selected so far:*\n${ctx.webFeatures.map((f) => `  • ${f}`).join("\n")}\n\nAdd another?`,
        [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ Done")],
        "Features"
      );
      break;
    }

    case "ASK_WEB_FEATURE_OTHER": {
      const custom = text.trim();
      if (custom.length < 2) {
        await sendTextMessage(phone, "Please enter a valid feature:");
        return;
      }
      if (!ctx.webFeatures.includes(custom)) ctx.webFeatures.push(custom);
      ctx.featureCodes = mapFeaturesToCodes(ctx.webFeatures, WEB_FEATURE_MAP);
      ctx.step = "ASK_WEB_FEATURES_MORE";
      await saveCtx(conv.id, ctx);
      await sendButtonMessage(phone,
        `✅ Added: *${custom}*\n\n*Selected so far:*\n${ctx.webFeatures.map((f) => `  • ${f}`).join("\n")}\n\nAdd another?`,
        [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ Done")],
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
      } else if (text === "feat_done" || n === "done" || n === "no" || n === "2") {
        if (ctx.webFeatures.length === 0) {
          await sendTextMessage(phone, "⚠️ Please select at least one feature.");
          ctx.step = "ASK_WEB_FEATURES";
          await saveCtx(conv.id, ctx);
          await sendWebFeaturesQuestion(phone, ctx.webFeatures); return;
        }
        ctx.step = "ASK_DOMAIN";
        await saveCtx(conv.id, ctx);
        await sendYesNoQuestion(phone,
          "*Do you already have a domain name (e.g. .com, .ng)?*",
          "dom_yes", "dom_no", "dom_unsure");
      } else {
        await sendTextMessage(phone, "⚠️ Please tap one of the buttons below.");
        await sendButtonMessage(phone,
          `*Selected so far:*\n${ctx.webFeatures.map((f) => `  • ${f}`).join("\n")}\n\nAdd another?`,
          [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ Done")], "Features");
      }
      break;
    }

    case "ASK_DOMAIN": {
      const r = resolveStrict(text, YES_NO_IDS, YES_NO_NUMS, YES_NO_TEXT);
      if (!r) {
        await sendTextMessage(phone, "⚠️ Please select one of the options.");
        await sendYesNoQuestion(phone, "*Do you already have a domain name?*",
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
        await sendTextMessage(phone, "⚠️ Please select one of the options.");
        await sendYesNoQuestion(phone, "*Do you already have web hosting?*",
          "host_yes", "host_no", "host_unsure");
        return;
      }
      ctx.hosting = r;
      ctx.step = "ASK_WA_INT";
      await saveCtx(conv.id, ctx);
      await sendYesNoQuestion(phone, "*Do you need WhatsApp integration on the website?*",
        "wai_yes", "wai_no", "wai_unsure");
      break;
    }

    case "ASK_WA_INT": {
      const r = resolveStrict(text, YES_NO_IDS, YES_NO_NUMS, YES_NO_TEXT);
      if (!r) {
        await sendTextMessage(phone, "⚠️ Please select one of the options.");
        await sendYesNoQuestion(phone, "*Do you need WhatsApp integration on the website?*",
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
        await sendTextMessage(phone, "⚠️ Please select a budget range from the list.");
        await sendBudgetQuestion(phone); return;
      }
      ctx.budget = r;
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
      await sendTextMessage(phone, "⚠️ Please select a budget range from the list.");
      await sendBudgetQuestion(phone); return;
    }
    ctx.budget = r;
    await saveCtx(conv.id, ctx);
    await generateAndShowQuotation(phone, contact, conv, ctx); return;
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
        await sendTextMessage(phone, "Please enter your business name (at least 2 characters):"); return;
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
        await sendTextMessage(phone, "⚠️ Please select one of the industries from the list.");
        await sendIndustryQuestion(phone); return;
      }
      if (r === "__OTHER__") {
        ctx.step = "ASK_INDUSTRY_OTHER";
        await saveCtx(conv.id, ctx);
        await sendTextMessage(phone, "Please enter your business type:"); return;
      }
      ctx.industry = r;
      ctx.step = "ASK_AUTO_ACTIVITIES";
      await saveCtx(conv.id, ctx);
      await sendAutoActivitiesQuestion(phone, ctx.autoActivities);
      break;
    }

    case "ASK_INDUSTRY_OTHER": {
      if (text.trim().length < 2) {
        await sendTextMessage(phone, "Please enter a valid business type:");
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
        await sendTextMessage(phone, "⚠️ Please select an activity from the list.");
        await sendAutoActivitiesQuestion(phone, ctx.autoActivities);
        return;
      }
      if (r === "__OTHER__") {
        ctx.step = "ASK_AUTO_ACTIVITY_OTHER";
        await saveCtx(conv.id, ctx);
        await sendTextMessage(phone, "What custom workflow do you need automated?"); return;
      }
      if (!ctx.autoActivities.includes(r)) ctx.autoActivities.push(r);
      ctx.features = [...ctx.autoActivities];
      ctx.featureCodes = mapFeaturesToCodes(ctx.autoActivities, AUTO_FEATURE_MAP);
      ctx.step = "ASK_AUTO_ACTIVITIES_MORE";
      await saveCtx(conv.id, ctx);
      await sendButtonMessage(phone,
        `✅ Added: *${r}*\n\n*Selected so far:*\n${ctx.autoActivities.map((a) => `  • ${a}`).join("\n")}\n\nAdd another?`,
        [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ Done")], "Activities");
      break;
    }

    case "ASK_AUTO_ACTIVITY_OTHER": {
      const custom = text.trim();
      if (custom.length < 2) {
        await sendTextMessage(phone, "Please enter a valid workflow:");
        return;
      }
      if (!ctx.autoActivities.includes(custom)) ctx.autoActivities.push(custom);
      ctx.features = [...ctx.autoActivities];
      ctx.featureCodes = mapFeaturesToCodes(ctx.autoActivities, AUTO_FEATURE_MAP);
      ctx.step = "ASK_AUTO_ACTIVITIES_MORE";
      await saveCtx(conv.id, ctx);
      await sendButtonMessage(phone,
        `✅ Added: *${custom}*\n\n*Selected so far:*\n${ctx.autoActivities.map((a) => `  • ${a}`).join("\n")}\n\nAdd another?`,
        [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ Done")], "Activities");
      break;
    }

    case "ASK_AUTO_ACTIVITIES_MORE": {
      const n = normalise(text);
      if (text === "feat_more" || n === "add another" || n === "add" || n === "yes" || n === "1") {
        ctx.step = "ASK_AUTO_ACTIVITIES";
        await saveCtx(conv.id, ctx);
        await sendAutoActivitiesQuestion(phone, ctx.autoActivities);
      } else if (text === "feat_done" || n === "done" || n === "no" || n === "2") {
        if (ctx.autoActivities.length === 0) {
          await sendTextMessage(phone, "⚠️ Please select at least one activity.");
          ctx.step = "ASK_AUTO_ACTIVITIES";
          await saveCtx(conv.id, ctx);
          await sendAutoActivitiesQuestion(phone, ctx.autoActivities); return;
        }
        ctx.step = "ASK_AUTO_PROCESS";
        await saveCtx(conv.id, ctx);
        await sendAutoProcessQuestion(phone);
      } else {
        await sendTextMessage(phone, "⚠️ Please tap one of the buttons below.");
        await sendButtonMessage(phone,
          `*Selected so far:*\n${ctx.autoActivities.map((a) => `  • ${a}`).join("\n")}\n\nAdd another?`,
          [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ Done")], "Activities");
      }
      break;
    }

    case "ASK_AUTO_PROCESS": {
      const r = resolveStrict(text, AUTO_PROC_IDS, AUTO_PROC_NUMS);
      if (!r) {
        await sendTextMessage(phone, "⚠️ Please select one of the options.");
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
        await sendTextMessage(phone, "⚠️ Please select one of the options.");
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
        await sendTextMessage(phone, "⚠️ Please select an option from the list.");
        await sendAutoIntegrationsQuestion(phone, ctx.autoIntegrations);
        return;
      }
      if (r === "__OTHER__") {
        ctx.step = "ASK_AUTO_INT_OTHER";
        await saveCtx(conv.id, ctx);
        await sendTextMessage(phone, "What other system should it connect to?"); return;
      }
      if (!ctx.autoIntegrations.includes(r)) ctx.autoIntegrations.push(r);
      ctx.step = "ASK_AUTO_INT_MORE";
      await saveCtx(conv.id, ctx);
      await sendButtonMessage(phone,
        `✅ Added: *${r}*\n\n*Integrations so far:*\n${ctx.autoIntegrations.map((i) => `  • ${i}`).join("\n")}\n\nAdd another?`,
        [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ Done")], "Integrations");
      break;
    }

    case "ASK_AUTO_INT_OTHER": {
      const custom = text.trim();
      if (custom.length < 2) {
        await sendTextMessage(phone, "Please enter a valid integration name:");
        return;
      }
      if (!ctx.autoIntegrations.includes(custom)) ctx.autoIntegrations.push(custom);
      ctx.step = "ASK_AUTO_INT_MORE";
      await saveCtx(conv.id, ctx);
      await sendButtonMessage(phone,
        `✅ Added: *${custom}*\n\n*Integrations so far:*\n${ctx.autoIntegrations.map((i) => `  • ${i}`).join("\n")}\n\nAdd another?`,
        [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ Done")], "Integrations");
      break;
    }

    case "ASK_AUTO_INT_MORE": {
      const n = normalise(text);
      if (text === "feat_more" || n === "add another" || n === "add" || n === "yes" || n === "1") {
        ctx.step = "ASK_AUTO_INTEGRATIONS";
        await saveCtx(conv.id, ctx);
        await sendAutoIntegrationsQuestion(phone, ctx.autoIntegrations);
      } else if (text === "feat_done" || n === "done" || n === "no" || n === "2") {
        ctx.step = "ASK_BUDGET";
        await saveCtx(conv.id, ctx);
        await sendBudgetQuestion(phone);
      } else {
        await sendTextMessage(phone, "⚠️ Please tap one of the buttons below.");
        await sendButtonMessage(phone,
          `*Integrations so far:*\n${ctx.autoIntegrations.map((i) => `  • ${i}`).join("\n")}\n\nAdd another?`,
          [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ Done")], "Integrations");
      }
      break;
    }

    case "ASK_BUDGET": {
      const r = resolveStrict(text, BUDGET_IDS, BUDGET_NUMS);
      if (!r) {
        await sendTextMessage(phone, "⚠️ Please select a budget range from the list.");
        await sendBudgetQuestion(phone); return;
      }
      ctx.budget = r;
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
// QUOTATION GENERATOR (Combo Mismatch Fixed)
// ═══════════════════════════════════════════════════════

async function generateAndShowQuotation(
  phone: string, contact: Contact, conv: Conversation, ctx: SalesCtx
): Promise<void> {
  const serviceType = ctx.serviceType || flowToServiceType(ctx.flow);
  const allFeatures = [...ctx.features, ...ctx.webFeatures, ...ctx.autoActivities];

  // Resolve Combo matching mismatch dynamically
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
      "Thank you! An Xtop agent will prepare a custom quotation.\n\nWhat next?",
      [makeButton("q_agent", "👤 Talk to Agent"), makeButton("q_menu", "🏠 Main Menu")], "Next Steps");
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

  const serviceLabel = serviceType.replace(/_/g, " ");
  const deliverables = (pkg.features || []) as string[];
  const quotation = await createQuotation(
    lead?.id || "", pkg.id,
    `${serviceLabel} — ${pkg.package_name}`,
    pkg.description, deliverables, pkg.min_price, pkg.max_price
  );
  if (quotation) { ctx.quotationId = quotation.id; ctx.quotationNumber = quotation.quotation_number; }

  ctx.step = "SHOWING_QUOTE";
  await saveCtx(conv.id, ctx);

  const delivBullets = deliverables.slice(0, 8).map((d) => `  • ${d.replace(/_/g, " ")}`).join("\n");
  const msg =
    `━━━━━━━━━━━━━━━━\n📋 *PRELIMINARY QUOTATION*\n━━━━━━━━━━━━━━━━\n\n` +
    `*Business:* ${ctx.businessName}\n*Industry:* ${ctx.industry}\n*Project:* ${serviceLabel}\n` +
    `*Package:* ${pkg.package_code} — ${pkg.package_name}\n*Ref:* ${ctx.quotationNumber || "PENDING"}\n\n` +
    `*Estimated Investment:*\n${formatNaira(pkg.min_price)} – ${formatNaira(pkg.max_price)}\n\n` +
    `*Includes:*\n${delivBullets}\n\n` +
    `⚠️ _This is a preliminary estimate. Final pricing will be confirmed after reviewing your complete requirements._`;

  await sendButtonMessage(phone, msg,
    [makeButton("q_select", "✅ Select Package"), makeButton("q_change", "🔄 Change Reqs"), makeButton("q_agent", "👤 Talk to Agent")],
    "Xtop Quotation Engine", "Valid for 14 days");
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
      botFeatures: ctx.features,
      botFeatureCodes: ctx.featureCodes,
      webType: ctx.webType,
      webFeatures: ctx.webFeatures,
      domain: ctx.domain,
      hosting: ctx.hosting,
      whatsappBusiness: ctx.waBiz,
      whatsappIntegration: ctx.waIntegration,
      automationAreas: ctx.autoActivities,
      automationProcess: ctx.autoProcess,
      automationUsers: ctx.autoUsers,
      automationIntegrations: ctx.autoIntegrations,
      budget: ctx.budget,
    } as Record<string, unknown>,
  };
}

// ═══════════════════════════════════════════════════════
// POST-QUOTATION ACTIONS
// ═══════════════════════════════════════════════════════

async function handlePostQuoteAction(
  phone: string, text: string, contact: Contact, conv: Conversation, ctx: SalesCtx
): Promise<void> {
  const n = normalise(text);

  if (n === "q_select" || n.includes("select")) {
    if (ctx.leadId) await updateLead(ctx.leadId, { status: "PACKAGE_SELECTED", selected_package_id: ctx.selectedPackageId });
    if (ctx.quotationId) await updateQuotation(ctx.quotationId, { status: "PACKAGE_SELECTED" });
    await updateConversation(conv.id, { current_module: "MAIN_MENU", current_state: "IDLE", context_json: {} });
    await sendButtonMessage(phone,
      `✅ *Package selection recorded.*\n\n*Ref:* ${ctx.quotationNumber}\n*Package:* ${ctx.selectedPackageCode}\n*Estimate:* ${formatNaira(ctx.estimatedMin || 0)} – ${formatNaira(ctx.estimatedMax || 0)}\n\nAn Xtop agent will confirm the final scope.`,
      [makeButton("q_agent_now", "👤 Talk to Agent"), makeButton("menu_home", "🏠 Main Menu")],
      "Package Selected", "Xtop Retail Technologies");
    return;
  }

  if (n === "q_change" || n.includes("change")) {
    await showServiceTypeSelector(phone, conv.id); return;
  }

  if (n === "q_agent" || n === "q_agent_now" || n.includes("agent") || n.includes("talk")) {
    if (ctx.leadId) await updateLead(ctx.leadId, { status: "AGENT_REQUESTED" });
    if (ctx.quotationId) await updateQuotation(ctx.quotationId, { status: "AGENT_REVIEW" });
    const summary =
      `Business: ${ctx.businessName || "N/A"}\n` +
      `Industry: ${ctx.industry || "N/A"}\n` +
      `Service: ${ctx.serviceType || "N/A"}\n` +
      `Features: ${[...ctx.features, ...ctx.webFeatures, ...ctx.autoActivities].join(", ") || "N/A"}\n` +
      `Budget: ${ctx.budget || "N/A"}\n` +
      `Package: ${ctx.selectedPackageCode || "N/A"}\n` +
      `Estimate: ${formatNaira(ctx.estimatedMin || 0)} – ${formatNaira(ctx.estimatedMax || 0)}\n` +
      `Ref: ${ctx.quotationNumber || "N/A"}`;

    await createAgentRequest(
      contact.id, "QUOTATION",
      `Quotation review request from ${contact.name || contact.phone}`,
      "HIGH", ctx.leadId, ctx.quotationId, summary
    );

    await updateConversation(conv.id, { current_module: "MAIN_MENU", current_state: "IDLE", context_json: {} });
    await sendButtonMessage(phone,
      `✅ *Your requirements and quotation have been sent to our team.*\n\n` +
      `*Ref:* ${ctx.quotationNumber || "XTR-PENDING"}\n\n` +
      `An Xtop agent will follow up with you shortly.`,
      [makeButton("menu_home", "🏠 Main Menu")],
      "Agent Notified", "Xtop Retail Technologies"
    );
    return;
  }

  if (n === "menu_home" || isGreeting(text)) {
    await showMainMenu(phone, conv.id);
    return;
  }

  await sendTextMessage(phone, "Please choose one of the options below.");
}
