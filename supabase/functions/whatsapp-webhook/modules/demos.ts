// supabase/functions/whatsapp-webhook/modules/demos.ts
// Phase 3 — Interactive Demo Centre (Directs all demos to live platforms & WhatsApp lines)

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
import { extractSelection, normalise, isBack } from "../utils.ts";
import { showMainMenu } from "./main-menu.ts";
import { showServiceTypeSelector } from "./sales.ts";

export async function handleDemos(
  phone: string,
  text: string,
  contact: Contact,
  conversation: Conversation
): Promise<void> {
  const state = conversation.current_state;
  const context = (conversation.context_json || {}) as {
    selectedDemoSlug?: string;
    currentStep?: number;
  };

  if (isBack(text) && state !== "SHOWING_LIST") {
    await showDemosList(phone, conversation.id);
    return;
  }

  switch (state) {
    case "ENTRY":
    case "SHOWING_LIST":
      await processDemoSelection(phone, text, conversation);
      break;

    case "RUNNING_STEP":
      await processDemoStepProgression(phone, text, contact, conversation, context);
      break;

    case "DEMO_COMPLETED":
      await processDemoCompletedAction(phone, text, contact, conversation, context.selectedDemoSlug);
      break;

    default:
      await showDemosList(phone, conversation.id);
      break;
  }
}

export async function showDemosList(phone: string, conversationId: string): Promise<void> {
  const demos = await getActiveDemos();

  if (demos.length === 0) {
    await sendTextMessage(phone, "🎮 Demos are currently being updated. Please check back shortly.");
    await showMainMenu(phone, conversationId);
    return;
  }

  await updateConversation(conversationId, {
    current_module: "DEMOS",
    current_state: "SHOWING_LIST",
    context_json: {},
  });

  const section1Demos = demos.slice(0, 5);
  const section2Demos = demos.slice(5, 10);

  const shortTitles: Record<string, string> = {
    demo_xtopedu: "1️⃣ XtopEdu Bot",
    demo_naijashop: "2️⃣ NaijaShop Store",
    demo_tutorial: "3️⃣ Edvenia (WAEC/JAMB)",
    demo_custom_bot: "4️⃣ BarPrep AI Tutor",
    demo_customer_service: "5️⃣ Customer Support",
    demo_sales_bot: "6️⃣ Sales & Deals Bot",
    demo_booking: "7️⃣ Appointment Bot",
    demo_real_estate: "8️⃣ Real Estate Bot",
    demo_quotation: "9️⃣ Instant Quote Bot",
    demo_ngo: "🔟 Custom App Dev",
  };

  const section1Rows = section1Demos.map((d) =>
    makeListRow(`demo_sel_${d.slug}`, (shortTitles[d.slug] || d.name).substring(0, 24), d.description.substring(0, 70))
  );

  const section2Rows = section2Demos.map((d) =>
    makeListRow(`demo_sel_${d.slug}`, (shortTitles[d.slug] || d.name).substring(0, 24), d.description.substring(0, 70))
  );

  const body =
    `🎮 *Xtop Retail Technologies — Live Demos & Products*\n\n` +
    `Experience our live web platforms, AI bots, and custom applications:\n\n` +
    `_Select any platform below to test or launch:_`;

  await sendListMessage(phone, body, "Choose Demo", [
    { title: "Live Platforms & Education", rows: section1Rows },
    { title: "Commercial & Custom Solutions", rows: section2Rows },
  ]);
}

async function processDemoSelection(
  phone: string,
  text: string,
  conversation: Conversation
): Promise<void> {
  const n = normalise(text);

  if (n === "demo_back_menu" || n.includes("main menu")) {
    await showMainMenu(phone, conversation.id);
    return;
  }

  const demos = await getActiveDemos();
  let selected = demos.find((d) => n === `demo_sel_${d.slug}` || n.includes(d.slug) || n.includes(normalise(d.name)));

  if (!selected) {
    const num = extractSelection(text);
    if (num && num >= 1 && num <= demos.length) {
      selected = demos[num - 1];
    }
  }

  if (!selected) {
    await sendTextMessage(phone, "Please select one of the available demo bots from the list.");
    await showDemosList(phone, conversation.id);
    return;
  }

  await runDemoStep(phone, conversation.id, selected.slug, 1);
}

export async function runDemoStep(
  phone: string,
  conversationId: string,
  demoSlug: string,
  stepNumber: number
): Promise<void> {
  const s = demoSlug.toLowerCase();

  // 1. Xtop Edu -> WhatsApp Demo
  if (s.includes("edu") || s.includes("learning") || s === "demo_xtopedu") {
    await sendTextMessage(
      phone,
      `🎓 *XTOP EDU — LIVE WHATSAPP CLASSROOM*\n\nExperience lecture delivery, attendance, and CBT exams live:\n\n📱 *WhatsApp Line:* +2348073158887\n👉 *Direct Link:* https://wa.me/2348073158887?text=Hi%20Engr%20Ero\n\n_Send *Engr Ero* to the number above to start studying!_`
    );
    await showDemoCompletion(phone, conversationId, demoSlug);
    return;
  }

  // 2. Naijashop -> Live Store
  if (s.includes("naijashop") || s === "demo_naijashop") {
    await sendTextMessage(
      phone,
      `🛒 *NAIJASHOP — LIVE STORE*\n\nExplore our e-commerce platform and inventory system:\n\n🌐 *Visit Store:* https://naijashop.com.ng\n\n_Browse products, test order placements, and experience the checkout flow!_`
    );
    await showDemoCompletion(phone, conversationId, demoSlug);
    return;
  }

  // 3. Edvenia -> WAEC / JAMB CBT Platform
  if (s.includes("tutorial") || s.includes("edvenia") || s.includes("jamb")) {
    await sendTextMessage(
      phone,
      `📚 *EDVENIA — WAEC, NECO & JAMB AI CBT*\n\nPractice thousands of past questions with AI mock scoring:\n\n🌐 *Visit Platform:* https://edvenia.com\n\n_Available on web and mobile for students and tutorial centres!_`
    );
    await showDemoCompletion(phone, conversationId, demoSlug);
    return;
  }

  // 4. BarPrep -> AI Law School Tutor
  if (s.includes("custom_bot") || s.includes("barprep") || s.includes("law")) {
    await sendTextMessage(
      phone,
      `⚖️ *CYBERCOACH BARPREP — AI LAW TUTOR*\n\nAutomated legal preparation for Law School and Bar Exams:\n\n🌐 *Visit Portal:* https://barprep.cybarcoach.com\n\n_Access practice bar drills, legal research checks, and AI tutoring!_`
    );
    await showDemoCompletion(phone, conversationId, demoSlug);
    return;
  }

  // Fallback for simulated bot steps
  const demo = await getDemoBySlug(demoSlug);
  if (!demo || !demo.steps_json) {
    await sendTextMessage(phone, "Demo not found.");
    await showDemosList(phone, conversationId);
    return;
  }

  const stepData = demo.steps_json.find((st) => st.step === stepNumber);
  if (!stepData) {
    await showDemoCompletion(phone, conversationId, demoSlug);
    return;
  }

  await updateConversation(conversationId, {
    current_module: "DEMOS",
    current_state: "RUNNING_STEP",
    context_json: { selectedDemoSlug: demoSlug, currentStep: stepNumber },
  });

  const buttons = (stepData.options || ["Continue", "Exit Demo"])
    .slice(0, 3)
    .map((opt, i) => makeButton(`demo_step_btn_${i}`, opt));

  await sendButtonMessage(
    phone,
    stepData.bot_message,
    buttons,
    `Demo: ${demo.name.substring(0, 20)}`,
    `Step ${stepNumber} of ${demo.steps_json.length}`
  );
}

async function processDemoStepProgression(
  phone: string,
  text: string,
  contact: Contact,
  conversation: Conversation,
  context: { selectedDemoSlug?: string; currentStep?: number }
): Promise<void> {
  const n = normalise(text);
  const currentStep = context.currentStep || 1;
  const demoSlug = context.selectedDemoSlug || "demo_xtopedu";

  if (n.includes("exit") || isBack(text)) {
    await showDemosList(phone, conversation.id);
    return;
  }

  const nextStep = currentStep + 1;
  const demo = await getDemoBySlug(demoSlug);

  if (demo && demo.steps_json && nextStep <= demo.steps_json.length) {
    await runDemoStep(phone, conversation.id, demoSlug, nextStep);
  } else {
    await showDemoCompletion(phone, conversation.id, demoSlug);
  }
}

export async function showDemoCompletion(
  phone: string,
  conversationId: string,
  demoSlug: string
): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "DEMOS",
    current_state: "DEMO_COMPLETED",
    context_json: { selectedDemoSlug: demoSlug },
  });

  const body =
    `🎉 *Platform Overview Complete!*\n\n` +
    `Would you like us to build or deploy a custom automated WhatsApp bot, e-learning platform, or mobile app for your business?`;

  await sendButtonMessage(
    phone,
    body,
    [
      makeButton("demo_act_estimate", "✅ Get an Estimate"),
      makeButton("demo_act_agent", "👤 Talk to an Agent"),
      makeButton("demo_act_back", "🔙 All Demos"),
    ],
    "Xtop Retail Technologies",
    "Turnaround time: 5-7 days"
  );
}

async function processDemoCompletedAction(
  phone: string,
  text: string,
  contact: Contact,
  conversation: Conversation,
  demoSlug?: string
): Promise<void> {
  const n = normalise(text);

  if (n === "demo_act_back" || isBack(text)) {
    await showDemosList(phone, conversation.id);
    return;
  }

  if (
    n === "demo_act_estimate" ||
    n.includes("estimate") ||
    n.includes("quotation") ||
    n.includes("quote") ||
    n.includes("build") ||
    n === "1"
  ) {
    await sendTextMessage(
      phone,
      `📋 *Let's prepare your estimate*\n\n` +
      `We'll ask a few quick questions to generate a tailored preliminary quotation based on your requirements.`
    );
    await showServiceTypeSelector(phone, conversation.id);
    return;
  }

  if (
    n === "demo_act_agent" ||
    n.includes("agent") ||
    n.includes("human") ||
    n === "2"
  ) {
    await updateConversation(conversation.id, {
      current_module: "AGENT",
      current_state: "COLLECT_MESSAGE",
      context_json: {
        request_type: "START_PROJECT",
        source: "DEMO",
        demoSlug: demoSlug || "GENERAL",
        preset_message: `Inquiry after reviewing portfolio: ${demoSlug || "General"}`,
      },
    });

    await sendTextMessage(
      phone,
      `👤 *Talk to an Agent*\n\n` +
      `Please send a brief message describing your project requirements. A technical consultant will review and follow up with you directly:`
    );
    return;
  }

  await showDemosList(phone, conversation.id);
}
