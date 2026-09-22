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
import {
  matchPackage, formatNaira,
  BOT_FEATURE_MAP, WEB_FEATURE_MAP, AUTO_FEATURE_MAP, mapFeaturesToCodes,
} from "./pricing.ts";
import { normalise, isBack, isExit, isGreeting, extractSelection } from "../utils.ts";
import { showMainMenu } from "./main-menu.ts";

// ═══════════════════════════════════════════════════════
// SALES CONTEXT
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
  autoDescription?: string;
  budget?: string;
  serviceType?: string;
  selectedPackageId?: string;
  selectedPackageCode?: string;
  estimatedMin?: number;
  estimatedMax?: number;
}

function defaultCtx(flow: SalesCtx["flow"]): SalesCtx {
  return {
    flow, step: "ENTRY", features: [], featureCodes: [],
    webFeatures: [], serviceType: flowToServiceType(flow),
  };
}

function flowToServiceType(flow: string): string {
  if (flow === "BOT") return "WHATSAPP_BOT";
  if (flow === "WEB") return "WEBSITE";
  if (flow === "COMBO") return "BOT_AND_WEBSITE";
  return "AUTOMATION";
}

async function saveCtx(convId: string, ctx: SalesCtx): Promise<void> {
  await updateConversation(convId, { context_json: ctx as unknown as Record<string, unknown> });
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
    await sendTextMessage(phone, "Your current quotation process has been paused. You can continue later from the main menu.");
    return;
  }
  if (isBack(text)) {
    const ctx = (conv.context_json as SalesCtx) || defaultCtx("BOT");
    if (!ctx.step || ctx.step === "ENTRY" || ctx.step === "ASK_SERVICE_TYPE") {
      await showMainMenu(phone, conv.id);
      return;
    }
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

export async function showServiceTypeSelector(phone: string, conversationId: string): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "SALES", current_state: "ASK_SERVICE_TYPE",
    context_json: defaultCtx("BOT") as unknown as Record<string, unknown>,
  });
  await sendListMessage(phone,
    "💼 *What would you like us to build?*\n\nSelect a project type to begin your instant quotation:",
    "Select Project",
    [{
      title: "Project Types",
      rows: [
        makeListRow("sales_bot", "1️⃣ WhatsApp Bot", "Custom automated chatbot"),
        makeListRow("sales_web", "2️⃣ Website", "Business or e-commerce site"),
        makeListRow("sales_combo", "3️⃣ Bot + Website", "Complete digital package"),
        makeListRow("sales_auto", "4️⃣ Automation", "Workflow & process automation"),
      ],
    }],
    "Xtop Sales Engine", "Instant Quotation"
  );
}

async function processServiceTypeSelection(phone: string, text: string, conv: Conversation): Promise<void> {
  const n = normalise(text);
  let flow: SalesCtx["flow"] = "BOT";

  if (n === "sales_bot" || n === "1") flow = "BOT";
  else if (n === "sales_web" || n === "2") flow = "WEB";
  else if (n === "sales_combo" || n === "3") flow = "COMBO";
  else if (n === "sales_auto" || n === "4") flow = "AUTO";
  else {
    const num = extractSelection(text);
    if (num === 1) flow = "BOT";
    else if (num === 2) flow = "WEB";
    else if (num === 3) flow = "COMBO";
    else if (num === 4) flow = "AUTO";
    else { await showServiceTypeSelector(phone, conv.id); return; }
  }

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
    `${titles[flow]}\n\nLet's qualify your project and generate an instant preliminary estimate.\n\n` +
    `*What is the name of your business or brand?*\n\n_(Type your business name below)_`
  );
}

// ═══════════════════════════════════════════════════════
// WHATSAPP BOT FLOW
// ═══════════════════════════════════════════════════════

async function handleBotFlow(phone: string, text: string, contact: Contact, conv: Conversation, ctx: SalesCtx): Promise<void> {
  switch (ctx.step) {
    case "ASK_BIZ_NAME": {
      if (text.trim().length < 2) { await sendTextMessage(phone, "Please enter a valid business name (at least 2 characters):"); return; }
      ctx.businessName = text.trim();
      ctx.step = "ASK_INDUSTRY";
      await saveCtx(conv.id, ctx);
      await sendListMessage(phone, `What industry is *${ctx.businessName}* in?`, "Select Industry", [{
        title: "Industries",
        rows: [
          makeListRow("ind_retail", "Retail & E-commerce", ""),
          makeListRow("ind_edu", "Education & School", ""),
          makeListRow("ind_health", "Health & Pharmacy", ""),
          makeListRow("ind_realestate", "Real Estate", ""),
          makeListRow("ind_services", "Professional Services", ""),
          makeListRow("ind_food", "Food & Hospitality", ""),
          makeListRow("ind_other", "Other", ""),
        ],
      }]);
      break;
    }
    case "ASK_INDUSTRY": {
      const indMap: Record<string, string> = {
        ind_retail: "Retail & E-commerce", ind_edu: "Education", ind_health: "Health & Pharmacy",
        ind_realestate: "Real Estate", ind_services: "Professional Services",
        ind_food: "Food & Hospitality", ind_other: "Other",
      };
      ctx.industry = indMap[text] || text;
      ctx.step = "ASK_FEATURES";
      await saveCtx(conv.id, ctx);
      await showBotFeaturesList(phone);
      break;
    }
    case "ASK_FEATURES": {
      const featMap: Record<string, string> = {
        bf_faq: "Answer FAQs", bf_orders: "Take Orders", bf_leads: "Collect Leads",
        bf_recs: "Product Recommendations", bf_booking: "Booking/Appointments",
        bf_support: "Customer Support", bf_pay: "Payments", bf_quotes: "Quotations",
        bf_notif: "Notifications", bf_other: "Other",
      };
      const feat = featMap[text] || text;
      if (!ctx.features.includes(feat)) ctx.features.push(feat);
      ctx.featureCodes = mapFeaturesToCodes(ctx.features, BOT_FEATURE_MAP);
      ctx.step = "ASK_FEATURES_MORE";
      await saveCtx(conv.id, ctx);
      await sendButtonMessage(phone,
        `✅ Added: *${feat}*\n\nSelected so far:\n${ctx.features.map((f) => `  • ${f}`).join("\n")}\n\nAdd another feature?`,
        [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ Done, Continue")],
        "Feature Selection"
      );
      break;
    }
    case "ASK_FEATURES_MORE": {
      if (text === "feat_more" || normalise(text).includes("add")) {
        ctx.step = "ASK_FEATURES";
        await saveCtx(conv.id, ctx);
        await showBotFeaturesList(phone);
      } else {
        ctx.step = "ASK_WA_BIZ";
        await saveCtx(conv.id, ctx);
        await sendListMessage(phone, "Do you already have a WhatsApp Business number?", "Select", [{
          title: "WhatsApp Business",
          rows: [
            makeListRow("wa_yes", "Yes", "Already set up"),
            makeListRow("wa_no", "No", "Need help setting up"),
            makeListRow("wa_unsure", "Not sure", "Need guidance"),
          ],
        }]);
      }
      break;
    }
    case "ASK_WA_BIZ": {
      const waMap: Record<string, string> = { wa_yes: "YES", wa_no: "NO", wa_unsure: "NOT_SURE" };
      ctx.waBiz = waMap[text] || text;
      ctx.step = "ASK_NEED_WEBSITE";
      await saveCtx(conv.id, ctx);
      await sendListMessage(phone, "Do you also need a website?", "Select", [{
        title: "Website Add-on",
        rows: [
          makeListRow("web_yes", "Yes", "Include a website"),
          makeListRow("web_no", "No", "Bot only"),
          makeListRow("web_unsure", "Not sure", "Decide later"),
        ],
      }]);
      break;
    }
    case "ASK_NEED_WEBSITE": {
      ctx.needWebsite = text === "web_yes" ? "YES" : text === "web_no" ? "NO" : "NOT_SURE";
      if (ctx.needWebsite === "YES") ctx.serviceType = "BOT_AND_WEBSITE";
      ctx.step = "ASK_BUDGET";
      await saveCtx(conv.id, ctx);
      await showBudgetList(phone);
      break;
    }
    case "ASK_BUDGET": {
      const budMap: Record<string, string> = {
        bud_1: "100000-200000", bud_2: "200000-500000",
        bud_3: "500000-900000", bud_4: "900000+", bud_5: "NOT_SURE",
      };
      ctx.budget = budMap[text] || text;
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

async function showBotFeaturesList(phone: string): Promise<void> {
  await sendListMessage(phone, "Select a bot feature. You can add more after:", "Select Feature", [{
    title: "Bot Features",
    rows: [
      makeListRow("bf_faq", "Answer FAQs", "24/7 automated replies"),
      makeListRow("bf_orders", "Take Orders", "Cart & checkout"),
      makeListRow("bf_leads", "Collect Leads", "Customer intake"),
      makeListRow("bf_recs", "Product Recs", "Smart recommendations"),
      makeListRow("bf_booking", "Bookings", "Appointments"),
      makeListRow("bf_support", "Customer Support", "Live issue resolution"),
      makeListRow("bf_pay", "Payments", "Paystack/Monnify"),
      makeListRow("bf_quotes", "Quotations", "Auto estimates"),
      makeListRow("bf_notif", "Notifications", "Alerts"),
      makeListRow("bf_other", "Other", "Custom feature"),
    ],
  }]);
}

async function showBudgetList(phone: string): Promise<void> {
  await sendListMessage(phone, "What is your approximate budget?", "Select Budget", [{
    title: "Budget Range",
    rows: [
      makeListRow("bud_1", "₦100k – ₦200k", "Starter"),
      makeListRow("bud_2", "₦200k – ₦500k", "Standard"),
      makeListRow("bud_3", "₦500k – ₦900k", "Advanced"),
      makeListRow("bud_4", "Above ₦900k", "Enterprise"),
      makeListRow("bud_5", "Not sure", "Need guidance"),
    ],
  }]);
}

// ═══════════════════════════════════════════════════════
// WEBSITE FLOW
// ═══════════════════════════════════════════════════════

async function handleWebFlow(phone: string, text: string, contact: Contact, conv: Conversation, ctx: SalesCtx): Promise<void> {
  switch (ctx.step) {
    case "ASK_BIZ_NAME": {
      if (text.trim().length < 2) { await sendTextMessage(phone, "Please enter a valid business name:"); return; }
      ctx.businessName = text.trim();
      ctx.step = "ASK_INDUSTRY";
      await saveCtx(conv.id, ctx);
      await sendListMessage(phone, `What industry is *${ctx.businessName}* in?`, "Select Industry", [{
        title: "Industries",
        rows: [
          makeListRow("ind_retail", "Retail & E-commerce", ""),
          makeListRow("ind_edu", "Education", ""),
          makeListRow("ind_health", "Health", ""),
          makeListRow("ind_realestate", "Real Estate", ""),
          makeListRow("ind_services", "Services", ""),
          makeListRow("ind_food", "Food & Hospitality", ""),
          makeListRow("ind_other", "Other", ""),
        ],
      }]);
      break;
    }
    case "ASK_INDUSTRY": {
      const indMap: Record<string, string> = {
        ind_retail: "Retail", ind_edu: "Education", ind_health: "Health",
        ind_realestate: "Real Estate", ind_services: "Services",
        ind_food: "Food", ind_other: "Other",
      };
      ctx.industry = indMap[text] || text;
      ctx.step = "ASK_WEB_TYPE";
      await saveCtx(conv.id, ctx);
      await sendListMessage(phone, "What type of website do you need?", "Website Type", [{
        title: "Types",
        rows: [
          makeListRow("wt_corp", "Corporate Website", ""),
          makeListRow("wt_landing", "Landing Page", ""),
          makeListRow("wt_ecom", "E-Commerce", ""),
          makeListRow("wt_portal", "Business Portal", ""),
          makeListRow("wt_custom", "Custom Website", ""),
        ],
      }]);
      break;
    }
    case "ASK_WEB_TYPE": {
      const typeMap: Record<string, string> = {
        wt_corp: "Corporate", wt_landing: "Landing Page",
        wt_ecom: "E-Commerce", wt_portal: "Portal", wt_custom: "Custom",
      };
      ctx.webType = typeMap[text] || text;
      ctx.step = "ASK_WEB_FEATURES";
      await saveCtx(conv.id, ctx);
      await showWebFeaturesList(phone);
      break;
    }
    case "ASK_WEB_FEATURES": {
      const featMap: Record<string, string> = {
        wf_cms: "Admin/CMS Dashboard", wf_pay: "Payment Gateway",
        wf_wa: "WhatsApp Integration", wf_acct: "Customer Accounts",
        wf_forms: "Online Forms", wf_book: "Booking",
        wf_db: "Database", wf_other: "Other",
      };
      const feat = featMap[text] || text;
      if (!ctx.webFeatures.includes(feat)) ctx.webFeatures.push(feat);
      ctx.featureCodes = mapFeaturesToCodes(ctx.webFeatures, WEB_FEATURE_MAP);
      ctx.step = "ASK_WEB_FEATURES_MORE";
      await saveCtx(conv.id, ctx);
      await sendButtonMessage(phone,
        `✅ Added: *${feat}*\n\nFeatures: ${ctx.webFeatures.join(", ")}\n\nAdd another?`,
        [makeButton("feat_more", "➕ Add Another"), makeButton("feat_done", "✅ Done")],
        "Features"
      );
      break;
    }
    case "ASK_WEB_FEATURES_MORE": {
      if (text === "feat_more" || normalise(text).includes("add")) {
        ctx.step = "ASK_WEB_FEATURES";
        await saveCtx(conv.id, ctx);
        await showWebFeaturesList(phone);
      } else {
        ctx.step = "ASK_DOMAIN";
        await saveCtx(conv.id, ctx);
        await sendButtonMessage(phone, "Do you already have a domain name (e.g. .com, .ng)?",
          [makeButton("dom_yes", "Yes"), makeButton("dom_no", "No")], "Domain"
        );
      }
      break;
    }
    case "ASK_DOMAIN": {
      ctx.domain = text === "dom_yes" ? "YES" : "NO";
      ctx.step = "ASK_HOSTING";
      await saveCtx(conv.id, ctx);
      await sendButtonMessage(phone, "Do you already have web hosting?",
        [makeButton("host_yes", "Yes"), makeButton("host_no", "No")], "Hosting"
      );
      break;
    }
    case "ASK_HOSTING": {
      ctx.hosting = text === "host_yes" ? "YES" : "NO";
      ctx.step = "ASK_WA_INT";
      await saveCtx(conv.id, ctx);
      await sendButtonMessage(phone, "Do you need WhatsApp integration on the website?",
        [makeButton("wai_yes", "Yes"), makeButton("wai_no", "No")], "WhatsApp"
      );
      break;
    }
    case "ASK_WA_INT": {
      ctx.waIntegration = text === "wai_yes" ? "YES" : "NO";
      if (ctx.waIntegration === "YES" && !ctx.featureCodes.includes("WA_INTEGRATION")) {
        ctx.featureCodes.push("WA_INTEGRATION");
      }
      ctx.step = "ASK_BUDGET";
      await saveCtx(conv.id, ctx);
      await showBudgetList(phone);
      break;
    }
    case "ASK_BUDGET": {
      const budMap: Record<string, string> = {
        bud_1: "100000-200000", bud_2: "200000-500000",
        bud_3: "500000-900000", bud_4: "900000+", bud_5: "NOT_SURE",
      };
      ctx.budget = budMap[text] || text;
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

async function showWebFeaturesList(phone: string): Promise<void> {
  await sendListMessage(phone, "Select a website feature:", "Select Feature", [{
    title: "Web Features",
    rows: [
      makeListRow("wf_cms", "Admin/CMS Dashboard", ""),
      makeListRow("wf_pay", "Payment Gateway", ""),
      makeListRow("wf_wa", "WhatsApp Integration", ""),
      makeListRow("wf_acct", "Customer Accounts", ""),
      makeListRow("wf_forms", "Online Forms", ""),
      makeListRow("wf_book", "Booking System", ""),
      makeListRow("wf_db", "Database", ""),
      makeListRow("wf_other", "Other", ""),
    ],
  }]);
}

// ═══════════════════════════════════════════════════════
// COMBO FLOW
// ═══════════════════════════════════════════════════════

async function handleComboFlow(phone: string, text: string, contact: Contact, conv: Conversation, ctx: SalesCtx): Promise<void> {
  const botSteps = ["ASK_BIZ_NAME", "ASK_INDUSTRY", "ASK_FEATURES", "ASK_FEATURES_MORE", "ASK_WA_BIZ"];
  const webSteps = ["ASK_WEB_TYPE", "ASK_WEB_FEATURES", "ASK_WEB_FEATURES_MORE", "ASK_DOMAIN", "ASK_HOSTING", "ASK_WA_INT"];

  if (botSteps.includes(ctx.step)) {
    await handleBotFlow(phone, text, contact, conv, ctx);
    return;
  }
  if (ctx.step === "ASK_NEED_WEBSITE") {
    ctx.needWebsite = "YES";
    ctx.step = "ASK_WEB_TYPE";
    await saveCtx(conv.id, ctx);
    await sendListMessage(phone, "What type of website alongside your bot?", "Web Type", [{
      title: "Types",
      rows: [
        makeListRow("wt_corp", "Corporate", ""),
        makeListRow("wt_landing", "Landing Page", ""),
        makeListRow("wt_ecom", "E-Commerce", ""),
        makeListRow("wt_portal", "Portal", ""),
      ],
    }]);
    return;
  }
  if (webSteps.includes(ctx.step)) {
    await handleWebFlow(phone, text, contact, conv, ctx);
    return;
  }
  if (ctx.step === "ASK_BUDGET") {
    const budMap: Record<string, string> = {
      bud_1: "100000-200000", bud_2: "200000-500000",
      bud_3: "500000-900000", bud_4: "900000+", bud_5: "NOT_SURE",
    };
    ctx.budget = budMap[text] || text;
    await saveCtx(conv.id, ctx);
    await generateAndShowQuotation(phone, contact, conv, ctx);
    return;
  }
  if (ctx.step === "SHOWING_QUOTE") {
    await handlePostQuoteAction(phone, text, contact, conv, ctx);
    return;
  }
  await showServiceTypeSelector(phone, conv.id);
}

// ═══════════════════════════════════════════════════════
// AUTOMATION FLOW
// ═══════════════════════════════════════════════════════

async function handleAutoFlow(phone: string, text: string, contact: Contact, conv: Conversation, ctx: SalesCtx): Promise<void> {
  switch (ctx.step) {
    case "ASK_BIZ_NAME": {
      if (text.trim().length < 2) { await sendTextMessage(phone, "Please enter a valid business name:"); return; }
      ctx.businessName = text.trim();
      ctx.step = "ASK_AUTO_WORKFLOW";
      await saveCtx(conv.id, ctx);
      await sendListMessage(phone, "What would you like to automate?", "Select Workflow", [{
        title: "Workflows",
        rows: [
          makeListRow("af_cs", "Customer Management", ""),
          makeListRow("af_inv", "Invoicing", ""),
          makeListRow("af_crm", "CRM", ""),
          makeListRow("af_sheets", "Google Sheets", ""),
          makeListRow("af_db", "Database Integration", ""),
          makeListRow("af_pdf", "PDF Generation", ""),
          makeListRow("af_reports", "Reports", ""),
          makeListRow("af_wa", "WhatsApp Automation", ""),
          makeListRow("af_email", "Email Automation", ""),
          makeListRow("af_custom", "Custom Workflow", ""),
        ],
      }]);
      break;
    }
    case "ASK_AUTO_WORKFLOW": {
      const wfMap: Record<string, string> = {
        af_cs: "Customer Management", af_inv: "Invoicing", af_crm: "CRM",
        af_sheets: "Google Sheets Integration", af_db: "Database Integration",
        af_pdf: "PDF Generation", af_reports: "Reports",
        af_wa: "WhatsApp Automation", af_email: "Email Automation",
        af_custom: "Custom Workflow",
      };
      const wf = wfMap[text] || text;
      if (!ctx.features.includes(wf)) ctx.features.push(wf);
      ctx.featureCodes = mapFeaturesToCodes(ctx.features, AUTO_FEATURE_MAP);
      ctx.step = "ASK_AUTO_DESC";
      await saveCtx(conv.id, ctx);
      await sendTextMessage(phone,
        `✅ Selected: *${wf}*\n\nBriefly describe what you want the system to do:\n\n_(Type your description below)_`
      );
      break;
    }
    case "ASK_AUTO_DESC": {
      ctx.autoDescription = text.trim();
      ctx.step = "ASK_BUDGET";
      await saveCtx(conv.id, ctx);
      await showBudgetList(phone);
      break;
    }
    case "ASK_BUDGET": {
      const budMap: Record<string, string> = {
        bud_1: "100000-200000", bud_2: "200000-500000",
        bud_3: "500000-900000", bud_4: "900000+", bud_5: "NOT_SURE",
      };
      ctx.budget = budMap[text] || text;
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
// QUOTATION GENERATOR
// ═══════════════════════════════════════════════════════

async function generateAndShowQuotation(
  phone: string, contact: Contact, conv: Conversation, ctx: SalesCtx
): Promise<void> {
  const serviceType = ctx.serviceType || flowToServiceType(ctx.flow);
  const allFeatures = [...ctx.features, ...ctx.webFeatures];
  const allCodes = [...new Set([...ctx.featureCodes])];

  const match = await matchPackage(serviceType, allCodes, ctx.budget);

  if (!match) {
    const lead = await createLead(contact.id, serviceType, {
      business_name: ctx.businessName, industry: ctx.industry,
      features: allFeatures, budget_range: ctx.budget,
      bot_required: ctx.flow === "BOT" || ctx.flow === "COMBO",
      website_required: ctx.flow === "WEB" || ctx.flow === "COMBO" || ctx.needWebsite === "YES",
      requirements_json: { description: ctx.autoDescription } as Record<string, unknown>,
      status: "QUALIFYING",
    });
    if (lead) ctx.leadId = lead.id;
    ctx.step = "SHOWING_QUOTE";
    await saveCtx(conv.id, ctx);
    await sendButtonMessage(phone,
      "Thank you for your requirements. An Xtop agent will prepare a custom quotation.\n\nWhat next?",
      [makeButton("q_agent", "👤 Talk to Agent"), makeButton("q_menu", "🏠 Main Menu")],
      "Next Steps"
    );
    return;
  }

  const pkg = match.pkg;
  ctx.selectedPackageId = pkg.id;
  ctx.selectedPackageCode = pkg.package_code;
  ctx.estimatedMin = pkg.min_price;
  ctx.estimatedMax = pkg.max_price;

  let lead = await getActiveLeadForContact(contact.id, serviceType);
  const leadFields = {
    business_name: ctx.businessName, industry: ctx.industry,
    features: allFeatures, budget_range: ctx.budget,
    bot_required: ctx.flow === "BOT" || ctx.flow === "COMBO",
    website_required: ctx.flow === "WEB" || ctx.flow === "COMBO" || ctx.needWebsite === "YES",
    estimated_min_price: pkg.min_price, estimated_max_price: pkg.max_price,
    selected_package_id: pkg.id, status: "QUOTED",
    requirements_json: {
      description: ctx.autoDescription,
      webType: ctx.webType,
      waBiz: ctx.waBiz,
      domain: ctx.domain,
      hosting: ctx.hosting,
    } as Record<string, unknown>,
  };

  if (lead) {
    await updateLead(lead.id, leadFields);
  } else {
    lead = await createLead(contact.id, serviceType, leadFields);
  }

  if (lead) ctx.leadId = lead.id;

  const serviceLabel = serviceType.replace(/_/g, " ");
  const deliverables = (pkg.features || []) as string[];
  const quotation = await createQuotation(
    lead?.id || "", pkg.id,
    `${serviceLabel} — ${pkg.package_name}`,
    pkg.description, deliverables, pkg.min_price, pkg.max_price
  );

  if (quotation) {
    ctx.quotationId = quotation.id;
    ctx.quotationNumber = quotation.quotation_number;
  }

  ctx.step = "SHOWING_QUOTE";
  await saveCtx(conv.id, ctx);

  const delivBullets = deliverables.slice(0, 8).map((d) => `  • ${d.replace(/_/g, " ")}`).join("\n");

  const msg =
    `━━━━━━━━━━━━━━━━\n` +
    `📋 *PRELIMINARY QUOTATION*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `*Business:* ${ctx.businessName}\n` +
    `*Project:* ${serviceLabel}\n` +
    `*Package:* ${pkg.package_code} — ${pkg.package_name}\n` +
    `*Ref:* ${ctx.quotationNumber || "PENDING"}\n\n` +
    `*Estimated Investment:*\n${formatNaira(pkg.min_price)} – ${formatNaira(pkg.max_price)}\n\n` +
    `*Includes:*\n${delivBullets}\n\n` +
    `⚠️ _This is a preliminary estimate. Final pricing will be confirmed after reviewing your complete requirements._`;

  await sendButtonMessage(phone, msg,
    [
      makeButton("q_select", "✅ Select Package"),
      makeButton("q_change", "🔄 Change Reqs"),
      makeButton("q_agent", "👤 Talk to Agent"),
    ],
    "Xtop Quotation Engine", "Valid for 14 days"
  );
}

// ═══════════════════════════════════════════════════════
// POST-QUOTATION ACTIONS
// ═══════════════════════════════════════════════════════

async function handlePostQuoteAction(
  phone: string, text: string, contact: Contact, conv: Conversation, ctx: SalesCtx
): Promise<void> {
  const n = normalise(text);

  if (n === "q_select" || n.includes("select package")) {
    if (ctx.leadId) {
      await updateLead(ctx.leadId, {
        status: "PACKAGE_SELECTED",
        selected_package_id: ctx.selectedPackageId,
      });
    }
    if (ctx.quotationId) {
      await updateQuotation(ctx.quotationId, { status: "PACKAGE_SELECTED" });
    }

    await updateConversation(conv.id, { current_module: "MAIN_MENU", current_state: "IDLE", context_json: {} });

    await sendButtonMessage(phone,
      `✅ *Your package selection has been recorded.*\n\n` +
      `*Reference:* ${ctx.quotationNumber}\n` +
      `*Package:* ${ctx.selectedPackageCode}\n` +
      `*Estimate:* ${formatNaira(ctx.estimatedMin || 0)} – ${formatNaira(ctx.estimatedMax || 0)}\n\n` +
      `An Xtop Retail Technologies agent will review your requirements and confirm the final scope and quotation.`,
      [
        makeButton("q_agent_now", "👤 Talk to an Agent"),
        makeButton("menu_home", "🏠 Main Menu"),
      ],
      "Package Selected", "Xtop Retail Technologies"
    );
    return;
  }

  if (n === "q_change" || n.includes("change")) {
    await showServiceTypeSelector(phone, conv.id);
    return;
  }

  if (n === "q_agent" || n === "q_agent_now" || n.includes("agent") || n.includes("talk")) {
    if (ctx.leadId) await updateLead(ctx.leadId, { status: "AGENT_REQUESTED" });
    if (ctx.quotationId) await updateQuotation(ctx.quotationId, { status: "AGENT_REVIEW" });

    const summary =
      `Business: ${ctx.businessName || "N/A"}\n` +
      `Industry: ${ctx.industry || "N/A"}\n` +
      `Service: ${ctx.serviceType}\n` +
      `Features: ${[...ctx.features, ...ctx.webFeatures].join(", ") || "N/A"}\n` +
      `Budget: ${ctx.budget || "N/A"}\n` +
      `Package: ${ctx.selectedPackageCode || "N/A"}\n` +
      `Estimate: ${formatNaira(ctx.estimatedMin || 0)} – ${formatNaira(ctx.estimatedMax || 0)}\n` +
      `Quotation: ${ctx.quotationNumber || "N/A"}`;

    await createAgentRequest(
      contact.id, "QUOTATION",
      `Quotation review request from ${contact.name || contact.phone}`,
      "HIGH", ctx.leadId, ctx.quotationId, summary
    );

    await updateConversation(conv.id, { current_module: "MAIN_MENU", current_state: "IDLE", context_json: {} });

    await sendButtonMessage(phone,
      `✅ *Your requirements and preliminary quotation have been sent to our team.*\n\n` +
      `*Reference:* ${ctx.quotationNumber}\n\n` +
      `An Xtop Retail Technologies agent will follow up with you shortly.`,
      [makeButton("menu_home", "🏠 Main Menu")],
      "Agent Notified", "Xtop Retail Technologies"
    );
    return;
  }

  if (n === "menu_home" || isGreeting(text)) {
    await showMainMenu(phone, conv.id);
    return;
  }

  await sendTextMessage(phone, "Please choose one of the options below:");
  await handlePostQuoteAction(phone, "q_select", contact, conv, ctx);
}
