// modules/demos/onboarding.ts
// PATH B: New-number onboarding flow for "See a Demo for My Business".
// Multi-step state machine stored in conversations.context_json.

import {
  Contact, Conversation, updateConversation,
  createDemoLead, createAgentRequest,
  safeErrorLog,
} from "../../database.ts";
import {
  sendTextMessage, sendButtonMessage, sendListMessage,
  makeButton, makeListRow,
} from "../../whatsapp.ts";
import { getIndustryOptions, resolveTemplateKey, getIndustryTemplate } from "./industry-templates.ts";
import { showMainMenu } from "../main-menu.ts";

type OnboardingStep = "business_name" | "business_type" | "business_need" | "complete";

interface OnboardingContext {
  onboarding: true;
  step: OnboardingStep;
  pending_business_name?: string;
  pending_business_type?: string;
  pending_business_need?: string;
  leadId?: string;
}

function isOnboardingCtx(ctx: Record<string, any>): ctx is OnboardingContext {
  return ctx.onboarding === true && !!ctx.step;
}

/**
 * Start the onboarding flow.
 */
export async function startOnboarding(phone: string, conversation: Conversation): Promise<void> {
  const ctx: OnboardingContext = {
    onboarding: true,
    step: "business_name",
  };

  await updateConversation(conversation.id, {
    current_module: "DEMOS",
    current_state: "ONBOARDING",
    context_json: ctx as unknown as Record<string, unknown>,
  });

  await sendTextMessage(
    phone,
    `Welcome to *Xtop Retail Technologies*! 👋\n\n` +
    `We help businesses improve customer service and sales ` +
    `through WhatsApp automation.\n\n` +
    `Let's find the right demo for your business.\n\n` +
    `*What is your business name?*\n\n` +
    `_Just type the name and send._`
  );
}

/**
 * Process an onboarding step. Returns true if handled.
 */
export async function processOnboarding(
  phone: string,
  text: string,
  contact: Contact,
  conversation: Conversation,
  interactiveId?: string
): Promise<boolean> {
  const ctx = (conversation.context_json || {}) as Record<string, any>;
  if (!isOnboardingCtx(ctx)) return false;

  const rawInput = (interactiveId || text || "").trim();
  const n = rawInput.toLowerCase();

  // ── Global escape hatches ──
  if (n === "menu_home" || n === "main menu" || n === "exit" || n === "quit") {
    await updateConversation(conversation.id, {
      current_module: "MAIN_MENU",
      current_state: "IDLE",
      context_json: {},
    });
    await showMainMenu(phone, conversation.id);
    return true;
  }

  if (n === "back" || n === "🔙 back") {
    // Go back one step
    if (ctx.step === "business_type") {
      ctx.step = "business_name";
      delete ctx.pending_business_type;
      await updateConversation(conversation.id, { context_json: ctx as any });
      await sendTextMessage(phone, `*What is your business name?*`);
      return true;
    }
    if (ctx.step === "business_need") {
      ctx.step = "business_type";
      delete ctx.pending_business_need;
      await updateConversation(conversation.id, { context_json: ctx as any });
      await showBusinessTypeMenu(phone);
      return true;
    }
  }

  // ── STEP 1: Business Name ──
  if (ctx.step === "business_name") {
    if (rawInput.length < 2) {
      await sendTextMessage(phone, `Please enter a valid business name (at least 2 characters).`);
      return true;
    }

    ctx.pending_business_name = rawInput.substring(0, 100);
    ctx.step = "business_type";
    await updateConversation(conversation.id, { context_json: ctx as any });
    await showBusinessTypeMenu(phone);
    return true;
  }

  // ── STEP 2: Business Type ──
  if (ctx.step === "business_type") {
    let selectedType = "";

    if (interactiveId?.startsWith("onboard_type_")) {
      selectedType = interactiveId.replace("onboard_type_", "");
    } else {
      // Try to match free text
      const options = getIndustryOptions();
      const match = options.find((o) =>
        n.includes(o.key.replace("_", " ")) || n.includes(o.label.toLowerCase())
      );
      if (match) selectedType = match.key;
    }

    if (!selectedType) {
      await sendTextMessage(
        phone,
        `⚠️ Please select a business type from the list above, ` +
        `or type one of the options.`
      );
      return true;
    }

    ctx.pending_business_type = selectedType;
    ctx.step = "business_need";
    await updateConversation(conversation.id, { context_json: ctx as any });
    await showBusinessNeedMenu(phone);
    return true;
  }

  // ── STEP 3: Business Need ──
  if (ctx.step === "business_need") {
    let selectedNeed = "";

    if (interactiveId?.startsWith("onboard_need_")) {
      selectedNeed = interactiveId.replace("onboard_need_", "");
    } else {
      const needMap: Record<string, string> = {
        "enquir": "customer_enquiries",
        "catalog": "product_catalogue",
        "reserv": "reservations_bookings",
        "admiss": "admissions_registrations",
        "quote": "quotes_sales_leads",
        "support": "customer_support",
      };
      for (const [keyword, need] of Object.entries(needMap)) {
        if (n.includes(keyword)) { selectedNeed = need; break; }
      }
      if (!selectedNeed && rawInput.length > 2) selectedNeed = rawInput.substring(0, 100);
    }

    if (!selectedNeed) {
      await sendTextMessage(phone, `⚠️ Please select what you'd most like help with.`);
      return true;
    }

    ctx.pending_business_need = selectedNeed;
    ctx.step = "complete";
    await updateConversation(conversation.id, { context_json: ctx as any });
    await completeOnboarding(phone, contact, conversation, ctx);
    return true;
  }

  return false;
}

// ── Helper Menus ──

async function showBusinessTypeMenu(phone: string): Promise<void> {
  const options = getIndustryOptions();
  const rows = options.map((o) =>
    makeListRow(
      `onboard_type_${o.key}`,
      `${o.icon} ${o.label}`.substring(0, 24),
      ""
    )
  );

  await sendListMessage(
    phone,
    `*What type of business do you operate?*`,
    "Business Type",
    [{ title: "Select Type", rows }],
    "Business Type",
    "Type 'back' to go back"
  );
}

async function showBusinessNeedMenu(phone: string): Promise<void> {
  const rows = [
    makeListRow("onboard_need_customer_enquiries", "❓ Customer Enquiries", ""),
    makeListRow("onboard_need_product_catalogue", "📦 Product/Service Catalogue", ""),
    makeListRow("onboard_need_reservations_bookings", "📅 Reservations/Bookings", ""),
    makeListRow("onboard_need_admissions_registrations", "📝 Admissions/Registrations", ""),
    makeListRow("onboard_need_quotes_sales_leads", "💰 Quotes & Sales Leads", ""),
    makeListRow("onboard_need_customer_support", "🛟 Customer Support", ""),
    makeListRow("onboard_need_something_else", "🔧 Something Else", ""),
  ];

  await sendListMessage(
    phone,
    `*What would you most like WhatsApp to help you with?*`,
    "Main Need",
    [{ title: "Select Need", rows }],
    "Business Need",
    "Type 'back' to go back"
  );
}

// ── Completion ──

async function completeOnboarding(
  phone: string,
  contact: Contact,
  conversation: Conversation,
  ctx: OnboardingContext
): Promise<void> {
  const businessName = ctx.pending_business_name || "Your Business";
  const templateKey = resolveTemplateKey(ctx.pending_business_type || "other");
  const template = getIndustryTemplate(templateKey);

  // Create lead record
  const leadResult = await createDemoLead(
    phone,
    contact.name || "Prospect",
    businessName,
    templateKey,
    templateKey,
    `${businessName} — Onboarding Demo`,
    `Need: ${ctx.pending_business_need || "general"}`
  );

  const leadId = leadResult?.id || null;

  // Update context to personalized demo mode
  const newCtx = {
    personalizedDemo: true,
    businessName,
    businessCategory: templateKey,
    demoTemplate: templateKey,
    businessConfigId: null,
    tokenPrefix: "ONBOARD",
    leadId,
    onboardingComplete: true,
  };

  await updateConversation(conversation.id, {
    current_module: "DEMOS",
    current_state: "PERSONALIZED_WELCOME",
    context_json: newCtx,
  });

  // IMPORTANT: Be transparent that this is a template, not a custom build
  await sendTextMessage(
    phone,
    `Thank you! Based on the information you provided, ` +
    `we've selected a demo that best matches *${businessName}*.\n\n` +
    `⚠️ _This is an example of what can be customized for your business. ` +
    `It uses sample data and is not yet connected to your real operations._`
  );

  await sendButtonMessage(
    phone,
    `👇 What would you like to do?`,
    [
      makeButton("demo_view_my_biz", "View Suggested Demo"),
      makeButton("demo_change_details", "Change Details"),
      makeButton("demo_build_lead", "Talk to Agent"),
    ]
  );
}

/**
 * Handle "Change Details" — restart onboarding.
 */
export async function handleChangeDetails(
  phone: string,
  conversation: Conversation
): Promise<boolean> {
  const ctx = (conversation.context_json || {}) as Record<string, any>;
  if (!ctx.personalizedDemo && !ctx.onboarding) return false;

  await startOnboarding(phone, conversation);
  return true;
}
