// supabase/functions/whatsapp-webhook/modules/about.ts
// About XTOP Retail Technologies — Company Information Module

import {
  Contact,
  Conversation,
  updateConversation,
} from "../database.ts";
import {
  sendButtonMessage,
  sendListMessage,
  sendTextMessage,
  sendDocumentMessage,
  makeButton,
  makeListRow,
} from "../whatsapp.ts";
import { normalise, isBack, safeErrorLog } from "../utils.ts";
import { showMainMenu } from "./main-menu.ts";

// ═══════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════

export async function handleAbout(
  phone: string,
  text: string,
  contact: Contact,
  conv: Conversation,
  interactiveId?: string
): Promise<void> {
  const rawInput = (interactiveId || text || "").trim();
  const n = normalise(rawInput);

  try {
    // ── NAVIGATION ──
    if (n === "menu_home" || n === "main menu" || rawInput === "about_main_menu") {
      await updateConversation(conv.id, {
        current_module: "MAIN_MENU",
        current_state: "IDLE",
        context_json: {},
      });
      await showMainMenu(phone, conv.id);
      return;
    }

    if (rawInput === "about_back" || n === "back to about xtop") {
      await showAboutMenu(phone, conv.id);
      return;
    }

    // ── SUB-SECTIONS ──
    if (rawInput === "about_products" || n === "our products") {
      await showAboutProducts(phone, conv.id);
      return;
    }

    if (rawInput === "about_what_we_do" || n === "what we do") {
      await showWhatWeDo(phone, conv.id);
      return;
    }

    if (rawInput === "about_mission" || n === "our mission") {
      await showMission(phone, conv.id);
      return;
    }

    if (rawInput === "about_registration" || n === "business registration" || n === "registration") {
      await showRegistration(phone, conv.id);
      return;
    }

    if (rawInput === "about_agent" || n === "talk to an agent" || n.includes("agent")) {
      const { showAgentCategories } = await import("./agents.ts");
      await updateConversation(conv.id, {
        current_module: "AGENT",
        current_state: "SELECT_TYPE",
        context_json: {},
      });
      await showAgentCategories(phone, conv.id);
      return;
    }

    // ── PRODUCT DETAIL BUTTONS ──
    if (rawInput === "about_prod_naijashop") {
      await sendButtonMessage(
        phone,
        `🛒 *NaijaShop*\n\n` +
        `A retail technology platform designed to help businesses process customer orders and manage important retail workflows.\n\n` +
        `🌐 *Website:* https://naijashop.com.ng`,
        [
          makeButton("about_products", "🔙 All Products"),
          makeButton("about_back", "🏢 About XTOP"),
          makeButton("menu_home", "🏠 Main Menu"),
        ],
        "NaijaShop"
      );
      return;
    }

    if (rawInput === "about_prod_xtopedu") {
      await sendButtonMessage(
        phone,
        `🏫 *XtopEdu*\n\n` +
        `A WhatsApp-based school management solution designed to help schools manage communication, school information and administrative processes through WhatsApp.\n\n` +
        `📱 *Demo:* +2348073158887`,
        [
          makeButton("about_products", "🔙 All Products"),
          makeButton("about_back", "🏢 About XTOP"),
          makeButton("menu_home", "🏠 Main Menu"),
        ],
        "XtopEdu"
      );
      return;
    }

    if (rawInput === "about_prod_sabi") {
      await sendButtonMessage(
        phone,
        `🤖 *Sabi*\n\n` +
        `Our WhatsApp automation platform for businesses, designed to support enquiries, customer service, lead capture, sales workflows and other automated business interactions.\n\n` +
        `_You are currently chatting with Sabi!_`,
        [
          makeButton("about_products", "🔙 All Products"),
          makeButton("about_back", "🏢 About XTOP"),
          makeButton("menu_home", "🏠 Main Menu"),
        ],
        "Sabi"
      );
      return;
    }

    // ── CAC CERTIFICATE ──
    if (rawInput === "about_cac_cert") {
      await sendTextMessage(
        phone,
        `📄 The CAC certificate will be made available here.`
      );
      await showRegistration(phone, conv.id);
      return;
    }

    // ── DEFAULT: SHOW ABOUT MENU ──
    await showAboutMenu(phone, conv.id);

  } catch (err) {
    safeErrorLog("handleAbout", err);
    await sendTextMessage(
      phone,
      "⚠️ Something went wrong. Please try again or type *menu*."
    );
  }
}

// ═══════════════════════════════════════════════════════
// ABOUT XTOP — MAIN MENU
// ═══════════════════════════════════════════════════════

export async function showAboutMenu(phone: string, conversationId: string): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "ABOUT",
    current_state: "ABOUT_MENU",
    context_json: {},
  });

  const body =
    `🏢 *ABOUT XTOP RETAIL TECHNOLOGIES*\n\n` +
    `_Technology that works for your business._\n\n` +
    `XTOP Retail Technologies is a Nigerian ICT company focused on building practical digital solutions that help businesses, schools and organizations operate more efficiently.\n\n` +
    `We build technology around real-world problems, using software, WhatsApp, automation, AI and digital platforms.\n\n` +
    `*Our focus includes:*\n\n` +
    `💻 Custom Software & Web Applications\n` +
    `🤖 WhatsApp Bots & Automation\n` +
    `🧠 AI & Business Automation\n` +
    `🏫 School Management Technology\n` +
    `🛒 Retail & E-commerce Technology\n` +
    `🔗 Business Integrations & Digital Systems\n\n` +
    `*Our goal:*\nBuild technology that solves real problems.`;

  await sendButtonMessage(
    phone,
    body,
    [
      makeButton("about_products", "🚀 Our Products"),
      makeButton("about_what_we_do", "💻 What We Do"),
      makeButton("about_mission", "🎯 Our Mission"),
    ],
    "About XTOP"
  );

  await sendButtonMessage(
    phone,
    "_More options:_",
    [
      makeButton("about_registration", "📜 Registration"),
      makeButton("about_agent", "👨🏽‍💻 Talk to Agent"),
      makeButton("about_main_menu", "🔙 Main Menu"),
    ],
    ""
  );
}

// ═══════════════════════════════════════════════════════
// OUR PRODUCTS
// ═══════════════════════════════════════════════════════

async function showAboutProducts(phone: string, conversationId: string): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "ABOUT",
    current_state: "ABOUT_PRODUCTS",
    context_json: {},
  });

  const body =
    `🚀 *OUR PRODUCTS*\n\n` +
    `XTOP Retail Technologies develops and operates digital products designed around practical business and organizational needs.\n\n` +
    `🛒 *NaijaShop*\n` +
    `A retail technology platform designed to help businesses process customer orders and manage important retail workflows.\n\n` +
    `🏫 *XtopEdu*\n` +
    `A WhatsApp-based school management solution designed to help schools manage communication, school information and administrative processes through WhatsApp.\n\n` +
    `🤖 *Sabi*\n` +
    `Our WhatsApp automation platform for businesses, designed to support enquiries, customer service, lead capture, sales workflows and other automated business interactions.`;

  await sendButtonMessage(
    phone,
    body,
    [
      makeButton("about_prod_naijashop", "🛒 NaijaShop"),
      makeButton("about_prod_xtopedu", "🏫 XtopEdu"),
      makeButton("about_prod_sabi", "🤖 Sabi"),
    ],
    "Our Products"
  );

  await sendButtonMessage(
    phone,
    "_Navigation:_",
    [
      makeButton("about_back", "🔙 Back to About XTOP"),
      makeButton("about_main_menu", "🏠 Main Menu"),
    ],
    ""
  );
}

// ═══════════════════════════════════════════════════════
// WHAT WE DO
// ═══════════════════════════════════════════════════════

async function showWhatWeDo(phone: string, conversationId: string): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "ABOUT",
    current_state: "ABOUT_SERVICES",
    context_json: {},
  });

  const body =
    `💻 *WHAT WE DO*\n\n` +
    `We design and develop technology solutions including:\n\n` +
    `• Custom software and web applications\n` +
    `• WhatsApp business bots\n` +
    `• Business process automation\n` +
    `• AI-enabled business solutions\n` +
    `• School technology solutions\n` +
    `• Retail and e-commerce systems\n` +
    `• Customer-service automation\n` +
    `• Lead capture and CRM workflows\n` +
    `• Business integrations\n` +
    `• Digital platforms and custom ICT solutions\n\n` +
    `*Our process is simple:*\n\n` +
    `Understand → Design → Build → Test → Deploy → Improve`;

  await sendButtonMessage(
    phone,
    body,
    [
      makeButton("about_back", "🔙 Back to About XTOP"),
      makeButton("about_main_menu", "🏠 Main Menu"),
    ],
    "What We Do"
  );
}

// ═══════════════════════════════════════════════════════
// OUR MISSION
// ═══════════════════════════════════════════════════════

async function showMission(phone: string, conversationId: string): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "ABOUT",
    current_state: "ABOUT_MISSION",
    context_json: {},
  });

  const body =
    `🎯 *OUR MISSION*\n\n` +
    `To design, develop and deliver accessible technology solutions that solve real operational problems and help businesses and organizations become more efficient.\n\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `🔭 *Our Vision*\n\n` +
    `To become a trusted African technology company known for building practical digital solutions that make businesses and organizations more efficient, connected and productive.\n\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `💎 *Our Values*\n\n` +
    `*Innovation* — We look for better ways to solve problems.\n\n` +
    `*Practicality* — We build solutions for real-world use.\n\n` +
    `*Integrity* — We value honesty and responsible technology.\n\n` +
    `*Customer Success* — Our technology should create useful value.\n\n` +
    `*Continuous Improvement* — We continuously improve our products and services.`;

  await sendButtonMessage(
    phone,
    body,
    [
      makeButton("about_back", "🔙 Back to About XTOP"),
      makeButton("about_main_menu", "🏠 Main Menu"),
    ],
    "Our Mission"
  );
}

// ═══════════════════════════════════════════════════════
// BUSINESS REGISTRATION
// ═══════════════════════════════════════════════════════

async function showRegistration(phone: string, conversationId: string): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "ABOUT",
    current_state: "ABOUT_REGISTRATION",
    context_json: {},
  });

  const body =
    `📜 *BUSINESS REGISTRATION*\n\n` +
    `XTOP RETAIL TECHNOLOGIES is a registered Nigerian business name.\n\n` +
    `*Business Name:* XTOP RETAIL TECHNOLOGIES\n` +
    `*Registration No.:* 9324817\n` +
    `*Registered Under:* Companies and Allied Matters Act (CAMA) 2020\n` +
    `*Date of Registration:* 13 February 2026\n` +
    `*Nature of Business:* Information and Communication Technology Services\n` +
    `*Principal Place of Business:* Benin City, Edo State, Nigeria`;

  await sendButtonMessage(
    phone,
    body,
    [
      makeButton("about_cac_cert", "📄 View CAC Certificate"),
      makeButton("about_back", "🔙 Back to About XTOP"),
      makeButton("about_main_menu", "🏠 Main Menu"),
    ],
    "Registration"
  );
}
