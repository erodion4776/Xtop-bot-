// supabase/functions/whatsapp-webhook/modules/demos.ts

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

export async function handleDemos(
  phone: string,
  text: string,
  contact: Contact,
  conversation: Conversation
): Promise<void> {
  const state = conversation.current_state;
  const context = conversation.context_json as {
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
    await sendTextMessage(phone, "🎮 Demos are currently undergoing routine maintenance. Please check back shortly.");
    await showMainMenu(phone, conversationId);
    return;
  }

  await updateConversation(conversationId, {
    current_module: "DEMOS",
    current_state: "SHOWING_LIST",
    context_json: {},
  });

  const rows = demos.map((d, idx) =>
    makeListRow(`demo_sel_${d.slug}`, `${idx + 1}️⃣ ${d.name}`, d.description.substring(0, 70))
  );
  rows.push(makeListRow("demo_back_menu", "🔙 Main Menu", "Return to home"));

  const body = `🎮 *Xtop Retail Demo Centre*\n\nExperience our live interactive WhatsApp bots. Select any bot below to test its automated flow in real-time:`;

  await sendListMessage(phone, body, "Choose Demo", [
    { title: "Live Bot Simulators", rows },
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
  const demo = await getDemoBySlug(demoSlug);
  if (!demo || !demo.steps_json) {
    await sendTextMessage(phone, "Demo not found.");
    await showDemosList(phone, conversationId);
    return;
  }

  const stepData = demo.steps_json.find((s) => s.step === stepNumber);

  if (!stepData) {
    // Demo finished — show completion screen
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
    `Demo: ${demo.name}`,
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

  // Progress to next step
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
    `🎉 *Demo Simulation Complete!*\n\n` +
    `Would you like an automated system like this built and deployed for your business?`;

  await sendButtonMessage(
    phone,
    body,
    [
      makeButton("demo_act_estimate", "✅ Get an Estimate"),
      makeButton("demo_act_agent", "👤 Talk to an Agent"),
      makeButton("demo_act_back", "🔙 Back to Demos"),
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

  if (n === "demo_act_estimate" || n.includes("estimate") || n.includes("build")) {
    await updateConversation(conversation.id, {
      current_module: "AGENT",
      current_state: "COLLECT_MESSAGE",
      context_json: {
        request_type: "QUOTATION",
        preset_message: `Requesting preliminary estimate inspired by demo: ${demoSlug || "General"}`,
      },
    });
    await sendTextMessage(
      phone,
      `📋 *Project Quotation Request*\n\nPlease describe your business and the core features you would like included:\n\n_(An agent will calculate your tailored estimate)_`
    );
    return;
  }

  if (n === "demo_act_agent" || n.includes("agent")) {
    await updateConversation(conversation.id, {
      current_module: "AGENT",
      current_state: "COLLECT_MESSAGE",
      context_json: {
        request_type: "START_PROJECT",
        preset_message: `Interested in building system based on demo: ${demoSlug || "General"}`,
      },
    });
    await sendTextMessage(
      phone,
      `👤 *Talk to an Agent*\n\nPlease leave your name and a brief note about your project. Our engineering team will follow up directly:`
    );
    return;
  }

  await showDemosList(phone, conversation.id);
}
