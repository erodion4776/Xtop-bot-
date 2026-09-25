// supabase/functions/whatsapp-webhook/modules/demos.ts
// Phase 2 — Interactive Live Demos & Bot Testing

import {
  Contact,
  Conversation,
  getActiveDemos,
  getDemoBySlug,
  updateConversation,
} from "../database.ts";
import {
  sendButtonMessage,
  sendListMessage,
  sendTextMessage,
  makeButton,
  makeListRow,
} from "../whatsapp.ts";
import { extractSelection, normalise, isBack, isExit, isGreeting } from "../utils.ts";
import { showMainMenu } from "./main-menu.ts";

// Fallback demo registry if database has no rows configured yet
const DEFAULT_DEMOS = [
  {
    name: "Xtop Edu — WhatsApp LMS & CBT",
    slug: "xtopedu",
    category: "Education & Exams",
    description: "Automated student attendance, lecture delivery, quizzes, and CBT exams directly on WhatsApp.",
    demo_url: "https://wa.me/2348073158887?text=Hi%20Engr%20Ero",
    whatsapp_number: "+2348073158887",
    trigger_keyword: "Engr Ero",
  },
  {
    name: "NaijaShop — E-Commerce Platform",
    slug: "naijashop",
    category: "Retail & Shopping",
    description: "Interactive storefront, dynamic product catalogue, checkout cart, and automated order notifications.",
    demo_url: "https://naijashop.com.ng",
  },
  {
    name: "Edvenia — JAMB & WAEC CBT Hub",
    slug: "edvenia",
    category: "AI EdTech",
    description: "AI-powered mock exams, instant answer explanations, and automated grading system.",
    demo_url: "https://edvenia.com",
  },
  {
    name: "CyberCoach BarPrep — AI Law Tutor",
    slug: "barprep",
    category: "Legal Education",
    description: "Bar exam simulation drills, Nigerian case law reviews, and interactive legal quizzes.",
    demo_url: "https://barprep.cybarcoach.com",
  },
];

// ═══════════════════════════════════════════════════════
// MAIN DEMOS HANDLER
// ═══════════════════════════════════════════════════════

export async function handleDemos(
  phone: string,
  text: string,
  contact: Contact,
  conversation: Conversation
): Promise<void> {
  const n = normalise(text);
  const state = conversation.current_state;
  const context = (conversation.context_json || {}) as { selectedDemoSlug?: string };

  if (isExit(text) || n === "exit") {
    await updateConversation(conversation.id, {
      current_module: "MAIN_MENU",
      current_state: "IDLE",
      context_json: {},
    });
    await showMainMenu(phone, conversation.id);
    return;
  }

  if (isBack(text) && state === "VIEWING_DETAIL") {
    await showDemosList(phone, conversation.id);
    return;
  }

  switch (state) {
    case "ENTRY":
    case "SHOWING_LIST":
      await processDemoSelection(phone, text, conversation);
      break;

    case "VIEWING_DETAIL":
      await processDemoDetailAction(phone, text, contact, conversation, context.selectedDemoSlug);
      break;

    default:
      await showDemosList(phone, conversation.id);
      break;
  }
}

// ═══════════════════════════════════════════════════════
// DEMOS LIST SELECTOR
// ═══════════════════════════════════════════════════════

export async function showDemosList(phone: string, conversationId: string): Promise<void> {
  let demos = await getActiveDemos();

  if (!demos || demos.length === 0) {
    demos = DEFAULT_DEMOS as any[];
  }

  await updateConversation(conversationId, {
    current_module: "DEMOS",
    current_state: "SHOWING_LIST",
    context_json: {},
  });

  const rows = demos.map((d: any, idx: number) =>
    makeListRow(
      `demo_${d.slug}`,
      `${idx + 1}️⃣ ${d.name}`.substring(0, 24),
      (d.category || "Interactive Demo").substring(0, 72)
    )
  );

  rows.push(makeListRow("demo_back_menu", "🔙 Main Menu", "Return to main home screen"));

  const body =
    `🎮 *Live Interactive Demos & Platform Previews*\n\n` +
    `Test out our live bots, educational portals, and commercial platforms built for Nigerian businesses and institutions.\n\n` +
    `👇 *Select a demo to test live:*`;

  await sendListMessage(
    phone,
    body,
    "Choose a Demo",
    [{ title: "Live Demonstrations", rows }],
    "Xtop Retail Technologies",
    "Live Demos"
  );
}

// ═══════════════════════════════════════════════════════
// PROCESS DEMO SELECTION
// ═══════════════════════════════════════════════════════

async function processDemoSelection(
  phone: string,
  text: string,
  conversation: Conversation
): Promise<void> {
  const n = normalise(text);

  if (n === "demo_back_menu" || isBack(text) || n.includes("main menu")) {
    await showMainMenu(phone, conversation.id);
    return;
  }

  let demos = await getActiveDemos();
  if (!demos || demos.length === 0) demos = DEFAULT_DEMOS as any[];

  let selected = demos.find(
    (d: any) =>
      n === `demo_${d.slug}` ||
      n.includes(d.slug.toLowerCase()) ||
      n.includes(normalise(d.name))
  );

  if (!selected) {
    const num = extractSelection(text);
    if (num && num >= 1 && num <= demos.length) {
      selected = demos[num - 1];
    }
  }

  if (!selected) {
    await sendTextMessage(phone, "⚠️ Please choose one of the available live demos from the list:");
    await showDemosList(phone, conversation.id);
    return;
  }

  await showDemoDetail(phone, conversation.id, selected.slug);
}

// ═══════════════════════════════════════════════════════
// DEMO DETAILS
// ═══════════════════════════════════════════════════════

export async function showDemoDetail(
  phone: string,
  conversationId: string,
  slug: string
): Promise<void> {
  let demo = await getDemoBySlug(slug);
  if (!demo) {
    demo = DEFAULT_DEMOS.find((d) => d.slug.toLowerCase() === slug.toLowerCase()) as any;
  }

  if (!demo) {
    await sendTextMessage(phone, "Demo not found.");
    await showDemosList(phone, conversationId);
    return;
  }

  await updateConversation(conversationId, {
    current_module: "DEMOS",
    current_state: "VIEWING_DETAIL",
    context_json: { selectedDemoSlug: demo.slug },
  });

  const body =
    `🎮 *${demo.name.toUpperCase()}*\n` +
    `_${demo.category || "Interactive Demo"}_\n\n` +
    `📖 *Overview:*\n${demo.description || "Live interactive platform demo."}\n\n` +
    (demo.demo_url ? `🔗 *Launch Link:* ${demo.demo_url}\n` : "") +
    (demo.whatsapp_number ? `📱 *WhatsApp Demo Line:* ${demo.whatsapp_number}\n` : "");

  await sendButtonMessage(
    phone,
    body,
    [
      makeButton(`launch_demo_${demo.slug}`, "🚀 Launch Live Demo"),
      makeButton(`build_demo_${demo.slug}`, "📝 Request This System"),
      makeButton("demo_back_list", "🔙 All Demos"),
    ],
    demo.name,
    "Xtop Retail Technologies"
  );
}

// ═══════════════════════════════════════════════════════
// DEMO DETAIL ACTIONS
// ═══════════════════════════════════════════════════════

async function processDemoDetailAction(
  phone: string,
  text: string,
  contact: Contact,
  conversation: Conversation,
  slug?: string
): Promise<void> {
  const n = normalise(text);
  const targetSlug = slug || "xtopedu";

  if (n === "demo_back_list" || isBack(text)) {
    await showDemosList(phone, conversation.id);
    return;
  }

  // 1. Build project request -> Route to Sales Estimator or Agent
  if (n.startsWith("build_demo_") || n.includes("request")) {
    const { showServiceTypeSelector } = await import("./sales.ts");
    await showServiceTypeSelector(phone, conversation.id);
    return;
  }

  // 2. Launch demo link
  if (n.startsWith("launch_demo_") || n.includes("launch") || n.includes("demo")) {
    const s = targetSlug.toLowerCase();

    if (s.includes("edu")) {
      await sendTextMessage(
        phone,
        `🎓 *XTOP EDU — LIVE WHATSAPP BOT*\n\n` +
        `Experience automated lecture delivery, attendance logging, and CBT exams live on WhatsApp:\n\n` +
        `📱 *Demo Line:* +2348073158887\n` +
        `👉 *Click to Open:* https://wa.me/2348073158887?text=Hi%20Engr%20Ero\n\n` +
        `_Send *Engr Ero* to start studying!_`
      );
    } else if (s.includes("naijashop")) {
      await sendTextMessage(
        phone,
        `🛒 *NAIJASHOP — LIVE STORE*\n\n` +
        `Explore our web storefront and automated receipt engine:\n\n` +
        `🌐 *Visit Platform:* https://naijashop.com.ng\n\n` +
        `_Test product browsing and instant order receipts!_`
      );
    } else if (s.includes("edvenia")) {
      await sendTextMessage(
        phone,
        `📚 *EDVENIA — WAEC / NECO / JAMB AI CBT*\n\n` +
        `Practice past examination questions with instant AI scoring:\n\n` +
        `🌐 *Visit Edvenia:* https://edvenia.com`
      );
    } else if (s.includes("barprep")) {
      await sendTextMessage(
        phone,
        `⚖️ *CYBERCOACH BARPREP — AI LAW TUTOR*\n\n` +
        `Prepare for Nigerian Law School bar exams:\n\n` +
        `🌐 *Visit BarPrep:* https://barprep.cybarcoach.com`
      );
    } else {
      await sendTextMessage(
        phone,
        `🚀 Visit the platform demo live here:\nhttps://naijashop.com.ng`
      );
    }

    await showDemoDetail(phone, conversation.id, targetSlug);
    return;
  }

  await sendTextMessage(phone, "Please select an option below:");
  await showDemoDetail(phone, conversation.id, targetSlug);
}
