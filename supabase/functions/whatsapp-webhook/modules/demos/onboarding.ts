
 // modules/demos/onboarding.ts
// PATH B: New-number onboarding for "See a Demo for My Business".
// Flow: Business Name → Website → Category → Business Need.
// Uses deterministic classification and the existing WhatsApp/database helpers.

import {
  Contact,
  Conversation,
  updateConversation,
  createDemoLead,
  safeErrorLog,
} from "../../database.ts";

import {
  sendTextMessage,
  sendButtonMessage,
  sendListMessage,
  makeButton,
  makeListRow,
} from "../../whatsapp.ts";

import {
  getSelectableTemplates,
  classifyCategory,
  getTemplate,
} from "./templates.ts";

import { showMainMenu } from "../main-menu.ts";

type OnboardingStep =
  | "business_name"
  | "business_website"
  | "business_type"
  | "business_need"
  | "complete";

interface OnboardCtx {
  onboarding: true;
  step: OnboardingStep;
  pending_name?: string;
  pending_website?: string;
  pending_type?: string;
  pending_need?: string;
  leadId?: string;
  typePage?: 1 | 2;
}

const NEED_IDS = [
  "customer_enquiries",
  "product_catalogue",
  "reservations_bookings",
  "admissions_registrations",
  "quotes_sales_leads",
  "customer_support",
  "ordering_system",
  "delivery_tracking",
  "something_else",
] as const;

type NeedId = (typeof NEED_IDS)[number];

function isOnboard(ctx: Record<string, any>): ctx is OnboardCtx {
  return ctx.onboarding === true &&
    typeof ctx.step === "string" &&
    [
      "business_name",
      "business_website",
      "business_type",
      "business_need",
      "complete",
    ].includes(ctx.step);
}

function normalizeInput(value: string): string {
  return value.trim().toLowerCase();
}

function isValidBusinessName(value: string): boolean {
  return value.trim().length >= 2;
}

/**
 * Validate a website without making a network request.
 * Accepts a normal domain or HTTP(S) URL.
 * Returns a normalized URL, an empty string for "no website",
 * or null when the submitted URL is invalid.
 */
function normalizeWebsite(value: string): string | null {
  const input = value.trim();

  if (!input) return null;

  const candidate = /^https?:\/\//i.test(input)
    ? input
    : `https://${input}`;

  try {
    const url = new URL(candidate);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    if (!url.hostname || !url.hostname.includes(".")) {
      return null;
    }

    if (
      url.hostname.startsWith(".") ||
      url.hostname.endsWith(".") ||
      url.hostname.includes("..")
    ) {
      return null;
    }

    if (url.username || url.password) {
      return null;
    }

    return url.toString().slice(0, 200);
  } catch {
    return null;
  }
}

function isValidNeed(value: string): value is NeedId {
  return (NEED_IDS as readonly string[]).includes(value);
}

function getAllowedTemplateKeys(): Set<string> {
  return new Set(getSelectableTemplates().map((template) => template.key));
}

export async function startOnboarding(
  phone: string,
  conv: Conversation,
): Promise<void> {
  const ctx: OnboardCtx = {
    onboarding: true,
    step: "business_name",
    typePage: 1,
  };

  await updateConversation(conv.id, {
    current_module: "DEMOS",
    current_state: "ONBOARDING",
    context_json: ctx as any,
  });

  await sendTextMessage(
    phone,
    `Welcome to *Xtop Retail Technologies*! 👋\n\n` +
      "We help businesses improve customer service and sales through WhatsApp automation.\n\n" +
      "Let's find a suitable demonstration for your business.\n\n" +
      "*What is your business name?*\n\n" +
      "_Type the name and send it._",
  );
}

export async function processOnboarding(
  phone: string,
  text: string,
  contact: Contact,
  conv: Conversation,
  interactiveId?: string,
): Promise<boolean> {
  const ctx = (conv.context_json || {}) as Record<string, any>;

  if (!isOnboard(ctx)) return false;

  const raw = (interactiveId || text || "").trim();
  const normalized = normalizeInput(raw);

  // ─────────────────────────────────────────
  // GLOBAL ESCAPE HATCHES
  // ─────────────────────────────────────────

  if (
    normalized === "menu_home" ||
    normalized === "main menu" ||
    normalized === "exit"
  ) {
    await updateConversation(conv.id, {
      current_module: "MAIN_MENU",
      current_state: "IDLE",
      context_json: {},
    });

    await showMainMenu(phone, conv.id);
    return true;
  }

  if (normalized === "back") {
    if (ctx.step === "business_website") {
      ctx.step = "business_name";
      delete ctx.pending_website;
    } else if (ctx.step === "business_type") {
      ctx.step = "business_website";
      delete ctx.pending_type;
      ctx.typePage = 1;
    } else if (ctx.step === "business_need") {
      ctx.step = "business_type";
      delete ctx.pending_need;
      ctx.typePage = 1;
    } else {
      await sendTextMessage(
        phone,
        "You are already at the first step. Type *menu* to exit.",
      );
      return true;
    }

    await updateConversation(conv.id, {
      current_module: "DEMOS",
      current_state: "ONBOARDING",
      context_json: ctx as any,
    });

    if (ctx.step === "business_name") {
      await sendTextMessage(phone, "*What is your business name?*");
    } else if (ctx.step === "business_website") {
      await sendTextMessage(
        phone,
        '*Do you have a website?*\n\nSend the URL or type "skip".',
      );
    } else if (ctx.step === "business_type") {
      await showTypeMenu(phone, 1);
    }

    return true;
  }

  // ─────────────────────────────────────────
  // STEP 1: BUSINESS NAME
  // ─────────────────────────────────────────

  if (ctx.step === "business_name") {
    if (!isValidBusinessName(raw)) {
      await sendTextMessage(
        phone,
        "Please enter a business name with at least 2 characters.",
      );
      return true;
    }

    ctx.pending_name = raw.substring(0, 100);
    ctx.step = "business_website";

    await updateConversation(conv.id, {
      context_json: ctx as any,
    });

    await sendTextMessage(
      phone,
      `Great! *${ctx.pending_name}*.\n\n` +
        "*Do you have a website?*\n\n" +
        '_Send a URL such as www.example.com, or type "skip"._',
    );

    return true;
  }

  // ─────────────────────────────────────────
  // STEP 2: WEBSITE (OPTIONAL)
  // ─────────────────────────────────────────

  if (ctx.step === "business_website") {
    if (
      ["skip", "no", "none", "n/a"].includes(normalized)
    ) {
      ctx.pending_website = "";
    } else {
      const website = normalizeWebsite(raw);

      if (!website) {
        await sendTextMessage(
          phone,
          "Please enter a valid website, such as *www.example.com*, " +
            'or type *skip* if you do not have one.',
        );
        return true;
      }

      ctx.pending_website = website;
    }

    ctx.step = "business_type";
    ctx.typePage = 1;

    await updateConversation(conv.id, {
      context_json: ctx as any,
    });

    await showTypeMenu(phone, 1);
    return true;
  }

  // ─────────────────────────────────────────
  // STEP 3: BUSINESS CATEGORY
  // ─────────────────────────────────────────

  if (ctx.step === "business_type") {
    // Pagination keeps each WhatsApp list within the usual
    // maximum of 10 rows per interactive list message.
    if (interactiveId === "onboard_type_page_2") {
      ctx.typePage = 2;
      await updateConversation(conv.id, {
        context_json: ctx as any,
      });
      await showTypeMenu(phone, 2);
      return true;
    }

    if (interactiveId === "onboard_type_page_1") {
      ctx.typePage = 1;
      await updateConversation(conv.id, {
        context_json: ctx as any,
      });
      await showTypeMenu(phone, 1);
      return true;
    }

    let selectedType = "";

    if (interactiveId?.startsWith("onboard_type_")) {
      selectedType = interactiveId.slice("onboard_type_".length);
    } else {
      selectedType = classifyCategory(raw);
    }

    const allowedTemplates = getAllowedTemplateKeys();

    if (!allowedTemplates.has(selectedType)) {
      // A free-text description classified as "other" is acceptable.
      // Invalid interactive IDs are not accepted as category keys.
      if (
        !interactiveId &&
        selectedType === "other" &&
        raw.length >= 4
      ) {
        ctx.pending_type = "other";
      } else {
        await sendTextMessage(
          phone,
          "Please select a valid business type from the list, " +
            "or describe your business in a few words.",
        );
        return true;
      }
    } else {
      ctx.pending_type = selectedType;
    }

    ctx.step = "business_need";

    await updateConversation(conv.id, {
      context_json: ctx as any,
    });

    await showNeedMenu(phone);
    return true;
  }

  // ─────────────────────────────────────────
  // STEP 4: BUSINESS NEED
  // ─────────────────────────────────────────

  if (ctx.step === "business_need") {
    let selectedNeed = "";

    if (interactiveId?.startsWith("onboard_need_")) {
      selectedNeed = interactiveId.slice("onboard_need_".length);

      if (!isValidNeed(selectedNeed)) {
        await sendTextMessage(
          phone,
          "Please select a valid business need from the list.",
        );
        return true;
      }
    } else {
      const needKeywords: [string[], NeedId][] = [
        [["enquiry", "enquiries", "question", "questions"], "customer_enquiries"],
        [["catalogue", "catalog", "products", "services"], "product_catalogue"],
        [["reservation", "reservations", "booking", "bookings", "appointment"], "reservations_bookings"],
        [["admission", "admissions", "registration", "registrations"], "admissions_registrations"],
        [["quote", "quotation", "sales", "lead", "leads"], "quotes_sales_leads"],
        [["support", "complaint", "complaints", "help"], "customer_support"],
        [["order", "ordering", "purchase", "purchases"], "ordering_system"],
        [["delivery", "tracking", "shipment", "dispatch"], "delivery_tracking"],
        [["something else", "other", "anything else"], "something_else"],
      ];

      for (const [keywords, need] of needKeywords) {
        if (
          keywords.some((keyword) =>
            normalized.includes(keyword)
          )
        ) {
          selectedNeed = need;
          break;
        }
      }

      // Permit a short, custom description if no predefined need matches.
      if (!selectedNeed && raw.length > 2) {
        selectedNeed = raw.substring(0, 100);
      }
    }

    if (!selectedNeed) {
      await sendTextMessage(
        phone,
        "Please select what you would most like WhatsApp to help with.",
      );
      return true;
    }

    ctx.pending_need = selectedNeed;
    ctx.step = "complete";

    await updateConversation(conv.id, {
      context_json: ctx as any,
    });

    await completeOnboarding(phone, contact, conv, ctx);
    return true;
  }

  // Avoid consuming unrelated messages if onboarding has already completed.
  return false;
}

// ─────────────────────────────────────────────
// HELPER MENUS
// ─────────────────────────────────────────────

async function showTypeMenu(
  phone: string,
  page: 1 | 2 = 1,
): Promise<void> {
  const templates = getSelectableTemplates();

  // Nine categories plus one pagination row = at most ten rows.
  const pageSize = 9;
  const start = page === 1 ? 0 : pageSize;
  const visibleTemplates = templates.slice(start, start + pageSize);

  const rows = visibleTemplates.map((template) =>
    makeListRow(
      `onboard_type_${template.key}`,
      `${template.icon} ${template.label}`.substring(0, 24),
      "",
    )
  );

  if (page === 1 && templates.length > pageSize) {
    rows.push(
      makeListRow("onboard_type_page_2", "➡️ More business types", ""),
    );
  }

  if (page === 2) {
    rows.push(
      makeListRow("onboard_type_page_1", "⬅️ Previous types", ""),
    );
  }

  await sendListMessage(
    phone,
    page === 1
      ? "*What type of business do you operate?*"
      : "*More business types — select one:*",
    "Business Type",
    [{ title: "Select Type", rows }],
    "Business Type",
    "Type 'back' to return to the previous step",
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

  await sendListMessage(
    phone,
    "*What would you most like WhatsApp to help you with?*",
    "Main Need",
    [{ title: "Select Need", rows }],
    "Business Need",
    "Type 'back' to go back",
  );
}

// ─────────────────────────────────────────────
// COMPLETION
// ─────────────────────────────────────────────

async function completeOnboarding(
  phone: string,
  contact: Contact,
  conv: Conversation,
  ctx: OnboardCtx,
): Promise<void> {
  const bizName = ctx.pending_name || "Your Business";
  const templateKey = ctx.pending_type || "other";
  const template = getTemplate(templateKey);

  let leadId: string | null = null;
  let leadSaved = false;

  try {
    const lead = await createDemoLead(
      phone,
      contact.name || "Prospect",
      bizName,
      templateKey,
      templateKey,
      `${bizName} — Onboarding Demo`,
      `Need: ${ctx.pending_need || "general"}`,
    );

    leadId = lead?.id || null;
    leadSaved = Boolean(leadId);
  } catch (error) {
    safeErrorLog("completeOnboarding: demo lead creation failed", error);
  }

  const newCtx = {
    personalizedDemo: true,
    businessName: bizName,
    businessCategory: templateKey,
    demoTemplate: template.key,
    businessConfigId: null,
    tokenPrefix: "ONBOARD",
    leadId,
    onboardingComplete: true,
    businessWebsite: ctx.pending_website || "",
    businessNeed: ctx.pending_need || "general",
  };

  await updateConversation(conv.id, {
    current_module: "DEMOS",
    current_state: "PERSONALIZED_WELCOME",
    context_json: newCtx,
  });

  const leadNotice = leadSaved
    ? ""
    : "\n\n_Note: Your enquiry could not be saved right now, but you can still explore the demo._";

  await sendTextMessage(
    phone,
    `Thank you! Based on your information, we've selected a demo ` +
      `that best matches *${bizName}*.\n\n` +
      `*Suggested demo:* ${template.icon} ${template.label}\n\n` +
      `*Your main need:* ${ctx.pending_need || "General business automation"}\n\n` +
      "⚠️ _This is a template demonstration using sample data. " +
      "It is not connected to your actual business operations._" +
      leadNotice,
  );

  await sendButtonMessage(phone, "👇 What would you like to do?", [
    makeButton("demo_view_my_biz", "View Suggested Demo"),
    makeButton("demo_change_details", "Change Details"),
    makeButton("demo_build_lead", "Talk to Agent"),
  ]);
}

// ─────────────────────────────────────────────
// CHANGE DETAILS
// ─────────────────────────────────────────────

export async function handleChangeDetails(
  phone: string,
  conv: Conversation,
): Promise<boolean> {
  const ctx = (conv.context_json || {}) as Record<string, any>;

  if (!ctx.personalizedDemo && !ctx.onboarding) {
    return false;
  }

  await startOnboarding(phone, conv);
  return true;
}
