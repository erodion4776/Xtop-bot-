// modules/demos/onboarding.ts
// PATH B: New-number onboarding for "See a Demo for My Business".
// Generic 4-step flow: Name → Website → Category → Need.
// Works for ANY business. No hardcoded company names.

import {
  Contact, Conversation, updateConversation,
  createDemoLead, safeErrorLog,
} from "../../database.ts";
import {
  sendTextMessage, sendButtonMessage, sendListMessage,
  makeButton, makeListRow,
} from "../../whatsapp.ts";
import { getSelectableTemplates, classifyCategory, getTemplate } from "./templates.ts";
import { showMainMenu } from "../main-menu.ts";

interface OnboardCtx {
  onboarding: true;
  step: "business_name" | "business_website" | "business_type" | "business_need" | "complete";
  pending_name?: string;
  pending_website?: string;
  pending_type?: string;
  pending_need?: string;
  leadId?: string;
}

function isOnboard(ctx: Record<string, any>): ctx is OnboardCtx {
  return ctx.onboarding === true && !!ctx.step;
}

export async function startOnboarding(phone: string, conv: Conversation): Promise<void> {
  const ctx: OnboardCtx = { onboarding: true, step: "business_name" };
  await updateConversation(conv.id, {
    current_module: "DEMOS", current_state: "ONBOARDING", context_json: ctx as any,
  });
  await sendTextMessage(phone,
    `Welcome to *Xtop Retail Technologies*! 👋\n\n` +
    `We help businesses improve customer service and sales through WhatsApp automation.\n\n` +
    `Let's find the right demo for your business.\n\n` +
    `*What is your business name?*\n\n_Just type the name and send._`);
}

export async function processOnboarding(
  phone: string, text: string, contact: Contact,
  conv: Conversation, interactiveId?: string
): Promise<boolean> {
  const ctx = (conv.context_json || {}) as Record<string, any>;
  if (!isOnboard(ctx)) return false;

  const raw = (interactiveId || text || "").trim();
  const n = raw.toLowerCase();

  // ── Global escape hatches ──
  if (n === "menu_home" || n === "main menu" || n === "exit") {
    await updateConversation(conv.id, {
      current_module: "MAIN_MENU", current_state: "IDLE", context_json: {},
    });
    await showMainMenu(phone, conv.id);
    return true;
  }

  if (n === "back") {
    if (ctx.step === "business_website") {
      ctx.step = "business_name";
      delete ctx.pending_website;
    } else if (ctx.step === "business_type") {
      ctx.step = "business_website";
      delete ctx.pending_type;
    } else if (ctx.step === "business_need") {
      ctx.step = "business_type";
      delete ctx.pending_need;
    }
    await updateConversation(conv.id, { context_json: ctx as any });
    if (ctx.step === "business_name") {
      await sendTextMessage(phone, `*What is your business name?*`);
    } else if (ctx.step === "business_website") {
      await sendTextMessage(phone, `*Do you have a website?*\n\n_Send the URL or type "skip"._`);
    } else if (ctx.step === "business_type") {
      await showTypeMenu(phone);
    }
    return true;
  }

  // ── STEP 1: Business Name ──
  if (ctx.step === "business_name") {
    if (raw.length < 2) {
      await sendTextMessage(phone, `Please enter a valid business name (at least 2 characters).`);
      return true;
    }
    ctx.pending_name = raw.substring(0, 100);
    ctx.step = "business_website";
    await updateConversation(conv.id, { context_json: ctx as any });
    await sendTextMessage(phone,
      `Great! *${ctx.pending_name}*.\n\n` +
      `*Do you have a website?*\n\n_Send the URL (e.g. www.example.com) or type "skip"._`);
    return true;
  }

  // ── STEP 2: Website (Optional) ──
  if (ctx.step === "business_website") {
    if (n === "skip" || n === "no" || n === "none" || n === "n/a") {
      ctx.pending_website = "";
    } else if (raw.length > 3) {
      ctx.pending_website = raw.substring(0, 200);
    } else {
      ctx.pending_website = "";
    }
    ctx.step = "business_type";
    await updateConversation(conv.id, { context_json: ctx as any });
    await showTypeMenu(phone);
    return true;
  }

  // ── STEP 3: Business Category ──
  if (ctx.step === "business_type") {
    let selectedType = "";

    if (interactiveId?.startsWith("onboard_type_")) {
      selectedType = interactiveId.replace("onboard_type_", "");
    } else {
      // Deterministic classifier from free text
      selectedType = classifyCategory(raw);
      // If classifier returns "other" and user typed something short, ask again
      if (selectedType === "other" && raw.length < 4) {
        await sendTextMessage(phone,
          `⚠️ I didn't quite catch that. Please select a business type from the list above.`);
        return true;
      }
    }

    if (!selectedType) {
      await sendTextMessage(phone, `⚠️ Please select a business type from the list.`);
      return true;
    }

    ctx.pending_type = selectedType;
    ctx.step = "business_need";
    await updateConversation(conv.id, { context_json: ctx as any });
    await showNeedMenu(phone);
    return true;
  }

  // ── STEP 4: Business Need ──
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
        "order": "ordering_system",
        "book": "reservations_bookings",
        "lead": "quotes_sales_leads",
        "deliver": "delivery_tracking",
        "appoint": "reservations_bookings",
      };
      for (const [kw, need] of Object.entries(needMap)) {
        if (n.includes(kw)) { selectedNeed = need; break; }
      }
      if (!selectedNeed && raw.length > 2) selectedNeed = raw.substring(0, 100);
    }

    if (!selectedNeed) {
      await sendTextMessage(phone, `⚠️ Please select what you'd most like help with.`);
      return true;
    }

    ctx.pending_need = selectedNeed;
    ctx.step = "complete";
    await updateConversation(conv.id, { context_json: ctx as any });
    await completeOnboarding(phone, contact, conv, ctx);
    return true;
  }

  return false;
}

// ── Helper Menus ──

async function showTypeMenu(phone: string): Promise<void> {
  const templates = getSelectableTemplates();
  const rows = templates.map((t) =>
    makeListRow(`onboard_type_${t.key}`, `${t.icon} ${t.label}`.substring(0, 24), "")
  );

  await sendListMessage(phone,
    `*What type of business do you operate?*`,
    "Business Type",
    [{ title: "Select Type", rows }],
    "Business Type",
    "Type 'back' to go back"
  );
}

async function showNeedMenu(phone: string): Promise<void> {
  const rows = [
    makeListRow("onboard_need_customer_enquiries", "❓ Customer Enquiries", ""),
    makeListRow("onboard_need_product_catalogue", "📦 Product/Service Catalogue", ""),
    makeListRow("onboard_need_reservations_bookings", "📅 Reservations/Bookings", ""),
    makeListRow("onboard_need_admissions_registrations", "📝 Admissions/Registrations", ""),
    makeListRow("onboard_need_quotes_sales_leads", "💰 Quotes & Sales Leads", ""),
    makeListRow("onboard_need_customer_support", "🛟 Customer Support", ""),
    makeListRow("onboard_need_ordering_system", "🛍️ Ordering System", ""),
    makeListRow("onboard_need_delivery_tracking", "🚚 Delivery Tracking", ""),
    makeListRow("onboard_need_something_else", "🔧 Something Else", ""),
  ];

  await sendListMessage(phone,
    `*What would you most like WhatsApp to help you with?*`,
    "Main Need",
    [{ title: "Select Need", rows }],
    "Business Need",
    "Type 'back' to go back"
  );
}

// ── Completion ──

async function completeOnboarding(
  phone: string, contact: Contact,
  conv: Conversation, ctx: OnboardCtx
): Promise<void> {
  const bizName = ctx.pending_name || "Your Business";
  const templateKey = ctx.pending_type || "other";
  const tpl = getTemplate(templateKey);

  const lead = await createDemoLead(
    phone, contact.name || "Prospect", bizName,
    templateKey, templateKey,
    `${bizName} — Onboarding Demo`,
    `Need: ${ctx.pending_need || "general"}`
  );
  const leadId = lead?.id || null;

  const newCtx = {
    personalizedDemo: true,
    businessName: bizName,
    businessCategory: templateKey,
    demoTemplate: templateKey,
    businessConfigId: null,
    tokenPrefix: "ONBOARD",
    leadId,
    onboardingComplete: true,
    businessWebsite: ctx.pending_website || "",
  };

  await updateConversation(conv.id, {
    current_module: "DEMOS", current_state: "PERSONALIZED_WELCOME", context_json: newCtx,
  });

  // Be transparent: this is a template, not a custom build
  await sendTextMessage(phone,
    `Thank you! Based on your information, we've selected a demo ` +
    `that best matches *${bizName}*.\n\n` +
    `⚠️ _This is an example of what can be customized for your business. ` +
    `It uses sample data and is not yet connected to your real operations._`);

  await sendButtonMessage(phone, `👇 What would you like to do?`, [
    makeButton("demo_view_my_biz", "View Suggested Demo"),
    makeButton("demo_change_details", "Change Details"),
    makeButton("demo_build_lead", "Talk to Agent"),
  ]);
}

export async function handleChangeDetails(
  phone: string, conv: Conversation
): Promise<boolean> {
  const ctx = (conv.context_json || {}) as Record<string, any>;
  if (!ctx.personalizedDemo && !ctx.onboarding) return false;
  await startOnboarding(phone, conv);
  return true;
}
