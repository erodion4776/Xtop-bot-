// supabase/functions/whatsapp-webhook/modules/sales.ts

import {
  Contact, Conversation, updateConversation,
  createLead, updateLead, getActiveLeadForContact,
  createQuotation, updateQuotation, createAgentRequest,
} from "../database.ts";
import {
  sendButtonMessage, sendListMessage, sendTextMessage,
  makeButton, makeListRow,
} from "../whatsapp.ts";
import { matchPackage, formatNaira, BOT_FEATURE_MAP, WEB_FEATURE_MAP, AUTO_FEATURE_MAP, mapFeaturesToCodes } from "./pricing.ts";
import {
  normalise, isBack, isExit, isGreeting, extractSelection,
  mapBusinessType, mapBotPurposes, mapWebFeatures,
  mapAutoActivities, mapExistingResources, mapCurrentTools,
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
  botPurposes: string[];
  webFeatures: string[];
  autoActivities: string[];
  existingResources: string[];
  currentTools: string[];
  webType?: string;
  waBiz?: string;
  needWebsite?: string;
  domain?: string;
  hosting?: string;
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
    botPurposes: [], webFeatures: [], autoActivities: [],
    existingResources: [], currentTools: [],
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
// MAIN HANDLER
// ═══════════════════════════════════════════════════════

export async function handleSales(phone: string, text: string, contact: Contact, conv: Conversation): Promise<void> {
  const n = normalise(text);

  if (isGreeting(text)) { await showMainMenu(phone, conv.id); return; }
  if (isExit(text) || n === "cancel") {
    await updateConversation(conv.id, { current_module: "MAIN_MENU", current_state: "IDLE", context_json: {} });
    await sendTextMessage(phone, "Your quotation process has been paused. Type *menu* to continue later.");
    return;
  }
  if (isBack(text)) {
    const ctx = (conv.context_json as SalesCtx) || defaultCtx("BOT");
    if (!ctx.step || ctx.step === "ENTRY" || ctx.step === "ASK_SERVICE_TYPE") { await showMainMenu(phone, conv.id); return; }
    await showServiceTypeSelector(phone, conv.id);
    return;
  }

  const ctx = (conv.context_json as SalesCtx) || defaultCtx("BOT");
  if (!ctx.step || ctx.step === "ENTRY" || ctx.step === "ASK_SERVICE_TYPE") {
    await processServiceTypeSelection(phone, text, conv);
    return;
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
  const n = normalise(text);
  let flow: SalesCtx["flow"] = "BOT";
  if (n === "sales_bot" || n === "1") flow = "BOT";
  else if (n === "sales_web" || n === "2") flow = "WEB";
  else if (n === "sales_combo" || n === "3") flow = "COMBO";
  else if (n === "sales_auto" || n === "4") flow = "AUTO";
  else { const num = extractSelection(text); if (num === 2) flow = "WEB"; else if (num === 3) flow = "COMBO"; else if (num === 4) flow = "AUTO"; else { await showServiceTypeSelector(phone, conv.id); return; } }

  const ctx = defaultCtx(flow);
  ctx.step = "ASK_BIZ_NAME";
  await updateConversation(conv.id, { current_module: "SALES", current_state: "QUALIFYING", context_json: ctx as unknown as Record<string, unknown> });

  const titles: Record<string, string> = {
    BOT: "🤖 *Build a Custom WhatsApp Bot*",
    WEB: "🌐 *Build a Business Website*",
    COMBO: "📦 *WhatsApp Bot + Website Combo*",
    AUTO: "⚙️ *Business Automation Project*",
  };
  await sendTextMessage(phone, `${titles[flow]}\n\nI will ask you a few quick questions to generate your instant quotation.\n\n*1. What is the name of your business or brand?*\n\n_(Type your business name)_`);
}

// ═══════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════

async function askBizType(phone: string, ctx: SalesCtx, conv: Conversation): Promise<void> {
  ctx.step = "ASK_BIZ_TYPE";
  await saveCtx(conv.id, ctx);
  await sendListMessage(phone,
    `*2. What type of business do you operate?*`,
    "Select Type",
    [{ title: "Business Type", rows: [
      makeListRow("bt_retail", "1️⃣ Retail", "Shop, store, supermarket"),
      makeListRow("bt_edu", "2️⃣ School/Education", "School, academy, tutorial"),
      makeListRow("bt_realestate", "3️⃣ Real Estate", "Property, housing"),
      makeListRow("bt_food", "4️⃣ Restaurant/Food", "Restaurant, catering, hotel"),
      makeListRow("bt_services", "5️⃣ Professional Services", "Law, consulting, agency"),
      makeListRow("bt_ngo", "6️⃣ Church/NGO", "Church, NGO, organisation"),
      makeListRow("bt_health", "7️⃣ Healthcare", "Hospital, clinic, pharmacy"),
      makeListRow("bt_other", "8️⃣ Other", "Something else"),
    ]}],
  );
}

function resolveBizType(text: string): string | null {
  const m: Record<string, string> = {
    bt_retail: "Retail", bt_edu: "School/Education", bt_realestate: "Real Estate",
    bt_food: "Restaurant/Food", bt_services: "Professional Services",
    bt_ngo: "Church/NGO/Organisation", bt_health: "Healthcare", bt_other: "OTHER",
  };
  if (m[text]) return m[text];
  const num = extractSelection(text);
  const nm: Record<number, string> = { 1: "Retail", 2: "School/Education", 3: "Real Estate", 4: "Restaurant/Food", 5: "Professional Services", 6: "Church/NGO/Organisation", 7: "Healthcare", 8: "OTHER" };
  if (num && nm[num]) return nm[num];
  return mapBusinessType(text);
}

async function askBudget(phone: string, ctx: SalesCtx, conv: Conversation): Promise<void> {
  ctx.step = "ASK_BUDGET";
  await saveCtx(conv.id, ctx);
  await sendListMessage(phone,
    `*What budget range have you planned for this project?*`,
    "Select Budget",
    [{ title: "Budget Range", rows: [
      makeListRow("bud_1", "1️⃣ ₦50k – ₦100k", "Micro / Starter"),
      makeListRow("bud_2", "2️⃣ ₦100k – ₦200k", "Basic"),
      makeListRow("bud_3", "3️⃣ ₦200k – ₦500k", "Standard"),
      makeListRow("bud_4", "4️⃣ ₦500k – ₦1M", "Advanced"),
      makeListRow("bud_5", "5️⃣ Above ₦1M", "Enterprise"),
      makeListRow("bud_6", "6️⃣ Not sure yet", "Need guidance"),
    ]}],
  );
}

function resolveBudget(text: string): string | null {
  const m: Record<string, string> = {
    bud_1: "50000-100000", bud_2: "100000-200000", bud_3: "200000-500000",
    bud_4: "500000-1000000", bud_5: "1000000+", bud_6: "NOT_SURE",
  };
  if (m[text]) return m[text];
  const num = extractSelection(text);
  const nm: Record<number, string> = { 1: "50000-100000", 2: "100000-200000", 3: "200000-500000", 4: "500000-1000000", 5: "1000000+", 6: "NOT_SURE" };
  if (num && nm[num]) return nm[num];
  return null;
}

// ═══════════════════════════════════════════════════════
// WHATSAPP BOT FLOW
// ═══════════════════════════════════════════════════════

async function handleBotFlow(phone: string, text: string, contact: Contact, conv: Conversation, ctx: SalesCtx): Promise<void> {
  switch (ctx.step) {
    case "ASK_BIZ_NAME": {
      if (text.trim().length < 2) { await sendTextMessage(phone, "Please enter your business name (at least 2 characters):"); return; }
      ctx.businessName = text.trim();
      await saveCtx(conv.id, ctx);
      await askBizType(phone, ctx, conv);
      break;
    }
    case "ASK_BIZ_TYPE": {
      const bt = resolveBizType(text);
      if (!bt) { await sendTextMessage(phone, "Please select a business type from the list (1-8):"); await askBizType(phone, ctx, conv); return; }
      if (bt === "OTHER") { ctx.step = "ASK_BIZ_TYPE_OTHER"; await saveCtx(conv.id, ctx); await sendTextMessage(phone, "Please enter your business type:"); return; }
      ctx.industry = bt;
      await saveCtx(conv.id, ctx);
      await askBotPurpose(phone, ctx, conv);
      break;
    }
    case "ASK_BIZ_TYPE_OTHER": {
      ctx.industry = text.trim() || "Other";
      await saveCtx(conv.id, ctx);
      await askBotPurpose(phone, ctx, conv);
      break;
    }
    case "ASK_BOT_PURPOSE": {
      const purposes = resolveBotPurpose(text);
      if (purposes.length === 0) { await sendTextMessage(phone, "Please select at least one option (1-10):"); await askBotPurpose(phone, ctx, conv); return; }
      if (purposes.includes("Something else")) {
        ctx.botPurposes = purposes.filter((p) => p !== "Something else");
        ctx.step = "ASK_BOT_PURPOSE_OTHER";
        await saveCtx(conv.id, ctx);
        await sendTextMessage(phone, "Please briefly describe what else you need the bot to do:");
        return;
      }
      ctx.botPurposes = purposes;
      await saveCtx(conv.id, ctx);
      await askExistingResources(phone, ctx, conv);
      break;
    }
    case "ASK_BOT_PURPOSE_OTHER": {
      if (text.trim().length > 0) ctx.botPurposes.push(text.trim());
      await saveCtx(conv.id, ctx);
      await askExistingResources(phone, ctx, conv);
      break;
    }
    case "ASK_EXISTING_RESOURCES": {
      const res = resolveExistingResources(text);
      if (res.length === 0) { await sendTextMessage(phone, "Please select at least one option (1-5):"); await askExistingResources(phone, ctx, conv); return; }
      ctx.existingResources = res;
      if (res.includes("WhatsApp Business number")) ctx.waBiz = "YES";
      else if (res.includes("None")) ctx.waBiz = "NO";
      else ctx.waBiz = "PARTIAL";
      await saveCtx(conv.id, ctx);
      await sendListMessage(phone,
        `*5. Do you want the bot to connect to a website?*`,
        "Select",
        [{ title: "Website Connection", rows: [
          makeListRow("web_yes", "1️⃣ Yes", "Include a website"),
          makeListRow("web_no", "2️⃣ No", "Bot only"),
          makeListRow("web_unsure", "3️⃣ Not sure", "Decide later"),
        ]}],
      );
      ctx.step = "ASK_NEED_WEBSITE";
      await saveCtx(conv.id, ctx);
      break;
    }
    case "ASK_NEED_WEBSITE": {
      const m: Record<string, string> = { web_yes: "YES", web_no: "NO", web_unsure: "NOT_SURE" };
      ctx.needWebsite = m[text] || (extractSelection(text) === 1 ? "YES" : extractSelection(text) === 2 ? "NO" : "NOT_SURE");
      if (ctx.needWebsite === "YES") ctx.serviceType = "BOT_AND_WEBSITE";
      await saveCtx(conv.id, ctx);
      await askBudget(phone, ctx, conv);
      break;
    }
    case "ASK_BUDGET": {
      const b = resolveBudget(text);
      if (!b) { await sendTextMessage(phone, "Please select a budget range (1-6):"); await askBudget(phone, ctx, conv); return; }
      ctx.budget = b;
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

async function askBotPurpose(phone: string, ctx: SalesCtx, conv: Conversation): Promise<void> {
  ctx.step = "ASK_BOT_PURPOSE";
  await saveCtx(conv.id, ctx);
  await sendListMessage(phone,
    `*3. What should your WhatsApp bot mainly help you with?*\n\n_Select the most important one. You can add more after._`,
    "Select Purpose",
    [{ title: "Bot Purpose", rows: [
      makeListRow("bp_faq", "1️⃣ Answer questions", "FAQs & enquiries"),
      makeListRow("bp_orders", "2️⃣ Receive orders", "Cart & checkout"),
      makeListRow("bp_leads", "3️⃣ Collect leads", "Customer intake"),
      makeListRow("bp_recs", "4️⃣ Recommend products", "Smart suggestions"),
      makeListRow("bp_book", "5️⃣ Book appointments", "Scheduling"),
      makeListRow("bp_pay", "6️⃣ Send payment info", "Invoices & receipts"),
      makeListRow("bp_quote", "7️⃣ Generate quotations", "Auto estimates"),
      makeListRow("bp_notif", "8️⃣ Send notifications", "Alerts & broadcasts"),
      makeListRow("bp_support", "9️⃣ Customer support", "Issue resolution"),
      makeListRow("bp_other", "🔟 Something else", "Custom requirement"),
    ]}],
  );
}

function resolveBotPurpose(text: string): string[] {
  const m: Record<string, string> = {
    bp_faq: "Answer customer questions", bp_orders: "Receive orders", bp_leads: "Collect customer leads",
    bp_recs: "Recommend products", bp_book: "Book appointments", bp_pay: "Send payment information",
    bp_quote: "Generate quotations", bp_notif: "Send notifications", bp_support: "Customer support",
    bp_other: "Something else",
  };
  if (m[text]) return [m[text]];
  const num = extractSelection(text);
  const nm: Record<number, string> = { 1: "Answer customer questions", 2: "Receive orders", 3: "Collect customer leads", 4: "Recommend products", 5: "Book appointments", 6: "Send payment information", 7: "Generate quotations", 8: "Send notifications", 9: "Customer support", 10: "Something else" };
  if (num && nm[num]) return [nm[num]];
  const mapped = mapBotPurposes(text);
  if (mapped.length > 0) return mapped;
  return [];
}

async function askExistingResources(phone: string, ctx: SalesCtx, conv: Conversation): Promise<void> {
  ctx.step = "ASK_EXISTING_RESOURCES";
  await saveCtx(conv.id, ctx);
  const summary = ctx.botPurposes.length > 0 ? `\n\n✅ Selected purposes: ${ctx.botPurposes.join(", ")}` : "";
  await sendListMessage(phone,
    `*4. Which of these do you already have?*${summary}`,
    "Select Resources",
    [{ title: "Existing Resources", rows: [
      makeListRow("res_wa", "1️⃣ WhatsApp Business", "Business number set up"),
      makeListRow("res_web", "2️⃣ Website", "Existing website"),
      makeListRow("res_cat", "3️⃣ Product catalogue", "Product/service list"),
      makeListRow("res_db", "4️⃣ Customer database", "CRM or contact list"),
      makeListRow("res_none", "5️⃣ None", "Starting from scratch"),
    ]}],
  );
}

function resolveExistingResources(text: string): string[] {
  const m: Record<string, string> = {
    res_wa: "WhatsApp Business number", res_web: "Website",
    res_cat: "Product/service catalogue", res_db: "Customer database", res_none: "None",
  };
  if (m[text]) return [m[text]];
  const num = extractSelection(text);
  const nm: Record<number, string> = { 1: "WhatsApp Business number", 2: "Website", 3: "Product/service catalogue", 4: "Customer database", 5: "None" };
  if (num && nm[num]) return [nm[num]];
  const mapped = mapExistingResources(text);
  if (mapped.length > 0) return mapped;
  return [];
}

// ═══════════════════════════════════════════════════════
// WEBSITE FLOW
// ═══════════════════════════════════════════════════════

async function handleWebFlow(phone: string, text: string, contact: Contact, conv: Conversation, ctx: SalesCtx): Promise<void> {
  switch (ctx.step) {
    case "ASK_BIZ_NAME": {
      if (text.trim().length < 2) { await sendTextMessage(phone, "Please enter your business name:"); return; }
      ctx.businessName = text.trim();
      await saveCtx(conv.id, ctx);
      await askBizType(phone, ctx, conv);
      break;
    }
    case "ASK_BIZ_TYPE": {
      const bt = resolveBizType(text);
      if (!bt) { await sendTextMessage(phone, "Please select a business type (1-8):"); await askBizType(phone, ctx, conv); return; }
      if (bt === "OTHER") { ctx.step = "ASK_BIZ_TYPE_OTHER"; await saveCtx(conv.id, ctx); await sendTextMessage(phone, "Please enter your business type:"); return; }
      ctx.industry = bt;
      await saveCtx(conv.id, ctx);
      await askWebType(phone, ctx, conv);
      break;
    }
    case "ASK_BIZ_TYPE_OTHER": {
      ctx.industry = text.trim() || "Other";
      await saveCtx(conv.id, ctx);
      await askWebType(phone, ctx, conv);
      break;
    }
    case "ASK_WEB_TYPE": {
      const wt = resolveWebType(text);
      if (!wt) { await sendTextMessage(phone, "Please select a website type (1-7):"); await askWebType(phone, ctx, conv); return; }
      if (wt === "OTHER") { ctx.step = "ASK_WEB_TYPE_OTHER"; await saveCtx(conv.id, ctx); await sendTextMessage(phone, "Please describe the type of website you need:"); return; }
      ctx.webType = wt;
      await saveCtx(conv.id, ctx);
      await askWebFeatures(phone, ctx, conv);
      break;
    }
    case "ASK_WEB_TYPE_OTHER": {
      ctx.webType = text.trim() || "Custom";
      await saveCtx(conv.id, ctx);
      await askWebFeatures(phone, ctx, conv);
      break;
    }
    case "ASK_WEB_FEATURES": {
      const feats = resolveWebFeature(text);
      if (feats.length === 0) { await sendTextMessage(phone, "Please select at least one feature (1-10):"); await askWebFeatures(phone, ctx, conv); return; }
      if (feats.includes("Other")) {
        ctx.webFeatures = feats.filter((f) => f !== "Other");
        ctx.step = "ASK_WEB_FEATURES_OTHER";
        await saveCtx(conv.id, ctx);
        await sendTextMessage(phone, "Please describe the additional feature you need:");
        return;
      }
      ctx.webFeatures = feats;
      await saveCtx(conv.id, ctx);
      await sendListMessage(phone, "*5. Do you already have a domain name (e.g. .com, .ng)?*", "Select", [{ title: "Domain", rows: [
        makeListRow("dom_yes", "1️⃣ Yes", ""), makeListRow("dom_no", "2️⃣ No", ""), makeListRow("dom_unsure", "3️⃣ Not sure", ""),
      ]}]);
      ctx.step = "ASK_DOMAIN";
      await saveCtx(conv.id, ctx);
      break;
    }
    case "ASK_WEB_FEATURES_OTHER": {
      if (text.trim().length > 0) ctx.webFeatures.push(text.trim());
      await saveCtx(conv.id, ctx);
      await sendListMessage(phone, "*5. Do you already have a domain name?*", "Select", [{ title: "Domain", rows: [
        makeListRow("dom_yes", "1️⃣ Yes", ""), makeListRow("dom_no", "2️⃣ No", ""), makeListRow("dom_unsure", "3️⃣ Not sure", ""),
      ]}]);
      ctx.step = "ASK_DOMAIN";
      await saveCtx(conv.id, ctx);
      break;
    }
    case "ASK_DOMAIN": {
      const dm: Record<string, string> = { dom_yes: "YES", dom_no: "NO", dom_unsure: "NOT_SURE" };
      ctx.domain = dm[text] || (extractSelection(text) === 1 ? "YES" : extractSelection(text) === 2 ? "NO" : "NOT_SURE");
      ctx.step = "ASK_HOSTING";
      await saveCtx(conv.id, ctx);
      await sendListMessage(phone, "*6. Do you already have web hosting?*", "Select", [{ title: "Hosting", rows: [
        makeListRow("host_yes", "1️⃣ Yes", ""), makeListRow("host_no", "2️⃣ No", ""), makeListRow("host_unsure", "3️⃣ Not sure", ""),
      ]}]);
      break;
    }
    case "ASK_HOSTING": {
      const hm: Record<string, string> = { host_yes: "YES", host_no: "NO", host_unsure: "NOT_SURE" };
      ctx.hosting = hm[text] || (extractSelection(text) === 1 ? "YES" : extractSelection(text) === 2 ? "NO" : "NOT_SURE");
      await saveCtx(conv.id, ctx);
      await askBudget(phone, ctx, conv);
      break;
    }
    case "ASK_BUDGET": {
      const b = resolveBudget(text);
      if (!b) { await sendTextMessage(phone, "Please select a budget range (1-6):"); await askBudget(phone, ctx, conv); return; }
      ctx.budget = b;
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

async function askWebType(phone: string, ctx: SalesCtx, conv: Conversation): Promise<void> {
  ctx.step = "ASK_WEB_TYPE";
  await saveCtx(conv.id, ctx);
  await sendListMessage(phone, "*3. What type of website do you need?*", "Select Type", [{ title: "Website Type", rows: [
    makeListRow("wt_corp", "1️⃣ Corporate Website", "Company showcase"),
    makeListRow("wt_landing", "2️⃣ Landing Page", "Lead capture"),
    makeListRow("wt_ecom", "3️⃣ E-commerce Website", "Online store"),
    makeListRow("wt_portal", "4️⃣ Customer Portal", "Client logins"),
    makeListRow("wt_booking", "5️⃣ Booking Website", "Appointments"),
    makeListRow("wt_custom", "6️⃣ Custom Web App", "Unique requirements"),
    makeListRow("wt_other", "7️⃣ Other", "Something else"),
  ]}]);
}

function resolveWebType(text: string): string | null {
  const m: Record<string, string> = {
    wt_corp: "Corporate Website", wt_landing: "Landing Page", wt_ecom: "E-commerce Website",
    wt_portal: "Customer Portal", wt_booking: "Booking Website", wt_custom: "Custom Web App", wt_other: "OTHER",
  };
  if (m[text]) return m[text];
  const num = extractSelection(text);
  const nm: Record<number, string> = { 1: "Corporate Website", 2: "Landing Page", 3: "E-commerce Website", 4: "Customer Portal", 5: "Booking Website", 6: "Custom Web App", 7: "OTHER" };
  if (num && nm[num]) return nm[num];
  const n = normalise(text);
  if (n.includes("corporate") || n.includes("company") || n.includes("business")) return "Corporate Website";
  if (n.includes("landing")) return "Landing Page";
  if (n.includes("ecommerce") || n.includes("e-commerce") || n.includes("store") || n.includes("shop")) return "E-commerce Website";
  if (n.includes("portal") || n.includes("login")) return "Customer Portal";
  if (n.includes("book")) return "Booking Website";
  if (n.includes("custom") || n.includes("app")) return "Custom Web App";
  return null;
}

async function askWebFeatures(phone: string, ctx: SalesCtx, conv: Conversation): Promise<void> {
  ctx.step = "ASK_WEB_FEATURES";
  await saveCtx(conv.id, ctx);
  await sendListMessage(phone,
    `*4. What features do you need on the website?*\n\n_Select the most important one. You can add more after._`,
    "Select Feature",
    [{ title: "Web Features", rows: [
      makeListRow("wf_wa", "1️⃣ WhatsApp integration", ""),
      makeListRow("wf_pay", "2️⃣ Online payment", ""),
      makeListRow("wf_acct", "3️⃣ Customer accounts", "Login/registration"),
      makeListRow("wf_forms", "4️⃣ Contact forms", "Enquiry forms"),
      makeListRow("wf_book", "5️⃣ Booking system", "Appointments"),
      makeListRow("wf_admin", "6️⃣ Admin dashboard", "CMS"),
      makeListRow("wf_cat", "7️⃣ Product catalogue", "Inventory"),
      makeListRow("wf_db", "8️⃣ Database", "Data storage"),
      makeListRow("wf_report", "9️⃣ Reports", "Analytics"),
      makeListRow("wf_other", "🔟 Other", "Custom feature"),
    ]}],
  );
}

function resolveWebFeature(text: string): string[] {
  const m: Record<string, string> = {
    wf_wa: "WhatsApp integration", wf_pay: "Online payment", wf_acct: "Customer accounts/login",
    wf_forms: "Contact/enquiry forms", wf_book: "Booking/appointments", wf_admin: "Admin dashboard",
    wf_cat: "Product catalogue", wf_db: "Database", wf_report: "Reports", wf_other: "Other",
  };
  if (m[text]) return [m[text]];
  const num = extractSelection(text);
  const nm: Record<number, string> = { 1: "WhatsApp integration", 2: "Online payment", 3: "Customer accounts/login", 4: "Contact/enquiry forms", 5: "Booking/appointments", 6: "Admin dashboard", 7: "Product catalogue", 8: "Database", 9: "Reports", 10: "Other" };
  if (num && nm[num]) return [nm[num]];
  const mapped = mapWebFeatures(text);
  if (mapped.length > 0) return mapped;
  return [];
}

// ═══════════════════════════════════════════════════════
// COMBO FLOW
// ═══════════════════════════════════════════════════════

async function handleComboFlow(phone: string, text: string, contact: Contact, conv: Conversation, ctx: SalesCtx): Promise<void> {
  const botSteps = ["ASK_BIZ_NAME", "ASK_BIZ_TYPE", "ASK_BIZ_TYPE_OTHER", "ASK_BOT_PURPOSE", "ASK_BOT_PURPOSE_OTHER", "ASK_EXISTING_RESOURCES"];
  const webSteps = ["ASK_WEB_TYPE", "ASK_WEB_TYPE_OTHER", "ASK_WEB_FEATURES", "ASK_WEB_FEATURES_OTHER", "ASK_DOMAIN", "ASK_HOSTING"];

  if (botSteps.includes(ctx.step)) {
    await handleBotFlow(phone, text, contact, conv, ctx);
    return;
  }
  if (ctx.step === "ASK_NEED_WEBSITE") {
    ctx.needWebsite = "YES";
    ctx.serviceType = "BOT_AND_WEBSITE";
    await saveCtx(conv.id, ctx);
    await askWebType(phone, ctx, conv);
    return;
  }
  if (webSteps.includes(ctx.step)) {
    await handleWebFlow(phone, text, contact, conv, ctx);
    return;
  }
  if (ctx.step === "ASK_BUDGET") {
    const b = resolveBudget(text);
    if (!b) { await sendTextMessage(phone, "Please select a budget range (1-6):"); await askBudget(phone, ctx, conv); return; }
    ctx.budget = b;
    await saveCtx(conv.id, ctx);
    await generateAndShowQuotation(phone, contact, conv, ctx);
    return;
  }
  if (ctx.step === "SHOWING_QUOTE") { await handlePostQuoteAction(phone, text, contact, conv, ctx); return; }
  await showServiceTypeSelector(phone, conv.id);
}

// ═══════════════════════════════════════════════════════
// AUTOMATION FLOW
// ═══════════════════════════════════════════════════════

async function handleAutoFlow(phone: string, text: string, contact: Contact, conv: Conversation, ctx: SalesCtx): Promise<void> {
  switch (ctx.step) {
    case "ASK_BIZ_NAME": {
      if (text.trim().length < 2) { await sendTextMessage(phone, "Please enter your business name:"); return; }
      ctx.businessName = text.trim();
      await saveCtx(conv.id, ctx);
      await askBizType(phone, ctx, conv);
      break;
    }
    case "ASK_BIZ_TYPE": {
      const bt = resolveBizType(text);
      if (!bt) { await sendTextMessage(phone, "Please select a business type (1-8):"); await askBizType(phone, ctx, conv); return; }
      if (bt === "OTHER") { ctx.step = "ASK_BIZ_TYPE_OTHER"; await saveCtx(conv.id, ctx); await sendTextMessage(phone, "Please enter your business type:"); return; }
      ctx.industry = bt;
      await saveCtx(conv.id, ctx);
      await askAutoActivities(phone, ctx, conv);
      break;
    }
    case "ASK_BIZ_TYPE_OTHER": {
      ctx.industry = text.trim() || "Other";
      await saveCtx(conv.id, ctx);
      await askAutoActivities(phone, ctx, conv);
      break;
    }
    case "ASK_AUTO_ACTIVITIES": {
      const acts = resolveAutoActivity(text);
      if (acts.length === 0) { await sendTextMessage(phone, "Please select at least one activity (1-10):"); await askAutoActivities(phone, ctx, conv); return; }
      if (acts.includes("Other")) {
        ctx.autoActivities = acts.filter((a) => a !== "Other");
        ctx.step = "ASK_AUTO_ACTIVITIES_OTHER";
        await saveCtx(conv.id, ctx);
        await sendTextMessage(phone, "Please describe the additional activity you want to automate:");
        return;
      }
      ctx.autoActivities = acts;
      await saveCtx(conv.id, ctx);
      await askCurrentTools(phone, ctx, conv);
      break;
    }
    case "ASK_AUTO_ACTIVITIES_OTHER": {
      if (text.trim().length > 0) ctx.autoActivities.push(text.trim());
      await saveCtx(conv.id, ctx);
      await askCurrentTools(phone, ctx, conv);
      break;
    }
    case "ASK_CURRENT_TOOLS": {
      const tools = resolveCurrentTool(text);
      if (tools.length === 0) { await sendTextMessage(phone, "Please select at least one tool (1-8):"); await askCurrentTools(phone, ctx, conv); return; }
      if (tools.includes("Other")) {
        ctx.currentTools = tools.filter((t) => t !== "Other");
        ctx.step = "ASK_CURRENT_TOOLS_OTHER";
        await saveCtx(conv.id, ctx);
        await sendTextMessage(phone, "Please name the other tool(s) you use:");
        return;
      }
      ctx.currentTools = tools;
      await saveCtx(conv.id, ctx);
      await askBudget(phone, ctx, conv);
      break;
    }
    case "ASK_CURRENT_TOOLS_OTHER": {
      if (text.trim().length > 0) ctx.currentTools.push(text.trim());
      await saveCtx(conv.id, ctx);
      await askBudget(phone, ctx, conv);
      break;
    }
    case "ASK_BUDGET": {
      const b = resolveBudget(text);
      if (!b) { await sendTextMessage(phone, "Please select a budget range (1-6):"); await askBudget(phone, ctx, conv); return; }
      ctx.budget = b;
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

async function askAutoActivities(phone: string, ctx: SalesCtx, conv: Conversation): Promise<void> {
  ctx.step = "ASK_AUTO_ACTIVITIES";
  await saveCtx(conv.id, ctx);
  await sendListMessage(phone,
    "*3. Which business activities would you like to automate?*\n\n_Select the most important one._",
    "Select Activity",
    [{ title: "Activities", rows: [
      makeListRow("aa_cs", "1️⃣ Customer management", ""),
      makeListRow("aa_sales", "2️⃣ Sales", ""),
      makeListRow("aa_inv", "3️⃣ Invoicing", ""),
      makeListRow("aa_wa", "4️⃣ WhatsApp messages", ""),
      makeListRow("aa_email", "5️⃣ Email", ""),
      makeListRow("aa_report", "6️⃣ Reports", ""),
      makeListRow("aa_follow", "7️⃣ Customer follow-up", ""),
      makeListRow("aa_sheets", "8️⃣ Google Sheets", "Data entry"),
      makeListRow("aa_pdf", "9️⃣ PDF generation", ""),
      makeListRow("aa_other", "🔟 Other", "Custom workflow"),
    ]}],
  );
}

function resolveAutoActivity(text: string): string[] {
  const m: Record<string, string> = {
    aa_cs: "Customer management", aa_sales: "Sales", aa_inv: "Invoicing",
    aa_wa: "WhatsApp messages", aa_email: "Email", aa_report: "Reports",
    aa_follow: "Customer follow-up", aa_sheets: "Google Sheets/data entry",
    aa_pdf: "PDF generation", aa_other: "Other",
  };
  if (m[text]) return [m[text]];
  const num = extractSelection(text);
  const nm: Record<number, string> = { 1: "Customer management", 2: "Sales", 3: "Invoicing", 4: "WhatsApp messages", 5: "Email", 6: "Reports", 7: "Customer follow-up", 8: "Google Sheets/data entry", 9: "PDF generation", 10: "Other" };
  if (num && nm[num]) return [nm[num]];
  const mapped = mapAutoActivities(text);
  if (mapped.length > 0) return mapped;
  return [];
}

async function askCurrentTools(phone: string, ctx: SalesCtx, conv: Conversation): Promise<void> {
  ctx.step = "ASK_CURRENT_TOOLS";
  await saveCtx(conv.id, ctx);
  await sendListMessage(phone,
    `*4. What tools do you currently use?*\n\n✅ Activities: ${ctx.autoActivities.join(", ")}\n\n_Select the most relevant one._`,
    "Select Tool",
    [{ title: "Current Tools", rows: [
      makeListRow("ct_wa", "1️⃣ WhatsApp", ""),
      makeListRow("ct_sheets", "2️⃣ Google Sheets", ""),
      makeListRow("ct_excel", "3️⃣ Excel", ""),
      makeListRow("ct_web", "4️⃣ Website", ""),
      makeListRow("ct_crm", "5️⃣ CRM", ""),
      makeListRow("ct_acct", "6️⃣ Accounting software", ""),
      makeListRow("ct_none", "7️⃣ None", "Manual processes"),
      makeListRow("ct_other", "8️⃣ Other", ""),
    ]}],
  );
}

function resolveCurrentTool(text: string): string[] {
  const m: Record<string, string> = {
    ct_wa: "WhatsApp", ct_sheets: "Google Sheets", ct_excel: "Excel",
    ct_web: "Website", ct_crm: "CRM", ct_acct: "Accounting software",
    ct_none: "None", ct_other: "Other",
  };
  if (m[text]) return [m[text]];
  const num = extractSelection(text);
  const nm: Record<number, string> = { 1: "WhatsApp", 2: "Google Sheets", 3: "Excel", 4: "Website", 5: "CRM", 6: "Accounting software", 7: "None", 8: "Other" };
  if (num && nm[num]) return [nm[num]];
  const mapped = mapCurrentTools(text);
  if (mapped.length > 0) return mapped;
  return [];
}

// ═══════════════════════════════════════════════════════
// QUOTATION GENERATOR
// ═══════════════════════════════════════════════════════

async function generateAndShowQuotation(phone: string, contact: Contact, conv: Conversation, ctx: SalesCtx): Promise<void> {
  const serviceType = ctx.serviceType || flowToServiceType(ctx.flow);
  const allFeatures = [...ctx.botPurposes, ...ctx.webFeatures, ...ctx.autoActivities];
  const featureMap = ctx.flow === "WEB" ? WEB_FEATURE_MAP : ctx.flow === "AUTO" ? AUTO_FEATURE_MAP : BOT_FEATURE_MAP;
  const allCodes = mapFeaturesToCodes(allFeatures, featureMap);

  const match = await matchPackage(serviceType, allCodes, ctx.budget);

  if (!match) {
    const lead = await createLead(contact.id, serviceType, buildLeadFields(ctx));
    if (lead) ctx.leadId = lead.id;
    ctx.step = "SHOWING_QUOTE";
    await saveCtx(conv.id, ctx);
    await sendButtonMessage(phone, "Thank you! An Xtop agent will prepare a custom quotation.\n\nWhat next?",
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
  if (lead) { await updateLead(lead.id, fields); } else { lead = await createLead(contact.id, serviceType, fields); }
  if (lead) ctx.leadId = lead.id;

  const serviceLabel = serviceType.replace(/_/g, " ");
  const deliverables = (pkg.features || []) as string[];
  const quotation = await createQuotation(lead?.id || "", pkg.id, `${serviceLabel} — ${pkg.package_name}`, pkg.description, deliverables, pkg.min_price, pkg.max_price);
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

function buildLeadFields(ctx: SalesCtx, pkg?: { id: string; min_price: number; max_price: number }): Partial<import("../database.ts").Lead> {
  return {
    business_name: ctx.businessName,
    industry: ctx.industry,
    features: [...ctx.botPurposes, ...ctx.webFeatures, ...ctx.autoActivities],
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
      botPurposes: ctx.botPurposes,
      webFeatures: ctx.webFeatures,
      autoActivities: ctx.autoActivities,
      existingResources: ctx.existingResources,
      currentTools: ctx.currentTools,
      webType: ctx.webType,
    } as Record<string, unknown>,
  };
}

// ═══════════════════════════════════════════════════════
// POST-QUOTATION ACTIONS
// ═══════════════════════════════════════════════════════

async function handlePostQuoteAction(phone: string, text: string, contact: Contact, conv: Conversation, ctx: SalesCtx): Promise<void> {
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

  if (n === "q_change" || n.includes("change")) { await showServiceTypeSelector(phone, conv.id); return; }

  if (n === "q_agent" || n === "q_agent_now" || n.includes("agent") || n.includes("talk")) {
    if (ctx.leadId) await updateLead(ctx.leadId, { status: "AGENT_REQUESTED" });
    if (ctx.quotationId) await updateQuotation(ctx.quotationId, { status: "AGENT_REVIEW" });
    const summary = `Business: ${ctx.businessName}\nIndustry: ${ctx.industry}\nService: ${ctx.serviceType}\nPurposes: ${ctx.botPurposes.join(", ")}\nWeb Features: ${ctx.webFeatures.join(", ")}\nAuto: ${ctx.autoActivities.join(", ")}\nResources: ${ctx.existingResources.join(", ")}\nTools: ${ctx.currentTools.join(", ")}\nBudget: ${ctx.budget}\nPackage: ${ctx.selectedPackageCode}\nEstimate: ${formatNaira(ctx.estimatedMin || 0)} – ${formatNaira(ctx.estimatedMax || 0)}\nRef: ${ctx.quotationNumber}`;
    await createAgentRequest(contact.id, "QUOTATION", `Quotation review from ${contact.name || contact.phone}`, "HIGH", ctx.leadId, ctx.quotationId, summary);
    await updateConversation(conv.id, { current_module: "MAIN_MENU", current_state: "IDLE", context_json: {} });
    await sendButtonMessage(phone,
      `✅ *Your requirements and quotation have been sent to our team.*\n\n*Ref:* ${ctx.quotationNumber}\n\nAn Xtop agent will follow up shortly.`,
      [makeButton("menu_home", "🏠 Main Menu")], "Agent Notified", "Xtop Retail Technologies");
    return;
  }

  if (n === "menu_home" || isGreeting(text)) { await showMainMenu(phone, conv.id); return; }
  await sendTextMessage(phone, "Please choose one of the options below.");
}
