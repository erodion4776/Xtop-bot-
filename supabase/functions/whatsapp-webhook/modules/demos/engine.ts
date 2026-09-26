// supabase/functions/whatsapp-webhook/modules/demos/engine.ts
// Reusable Demo Flow Engine — State machine for all demo types

import {
  DemoSession, createDemoSession, updateDemoSession,
  completeDemoSession, createDemoLead, getActiveDemoSession,
} from "../../database.ts";
import {
  sendButtonMessage, sendListMessage, sendTextMessage,
  makeButton, makeListRow,
} from "../../whatsapp.ts";
import { normalise, safeErrorLog } from "../../utils.ts";
import { showMainMenu } from "../main-menu.ts";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface DemoOption {
  id: string;
  label: string;
  description?: string;
}

export interface DemoStep {
  id: string;
  type: "message" | "list" | "buttons" | "input" | "confirmation";
  title?: string;
  body: string | ((ctx: Record<string, any>) => string);
  options?: DemoOption[] | ((ctx: Record<string, any>) => DemoOption[]);
  captureField?: string;
  nextStep?: string | ((input: string, ctx: Record<string, any>) => string);
  validation?: (input: string) => string | null;
  onComplete?: (ctx: Record<string, any>) => Promise<void>;
}

export interface DemoConfig {
  id: string;
  name: string;
  icon: string;
  category: string;
  description: string;
  steps: DemoStep[];
}

// ═══════════════════════════════════════════════════════
// ENGINE: START DEMO
// ═══════════════════════════════════════════════════════

export async function startDemo(
  phone: string,
  conversationId: string,
  config: DemoConfig
): Promise<void> {
  const session = await createDemoSession(phone, config.id, config.category, {
    conversationId,
    stepHistory: [],
  });

  if (!session) {
    await sendTextMessage(phone, "⚠️ Could not start demo. Please try again.");
    return;
  }

  await sendTextMessage(
    phone,
    `⚠️ *DEMO MODE*\n\n` +
    `${config.icon} *${config.name}*\n\n` +
    `${config.description}\n\n` +
    `_This is an interactive demonstration. No real transactions will occur._`
  );

  await executeStep(phone, session, config, "ENTRY");
}

// ═══════════════════════════════════════════════════════
// ENGINE: EXECUTE STEP
// ═══════════════════════════════════════════════════════

export async function executeStep(
  phone: string,
  session: DemoSession,
  config: DemoConfig,
  stepId: string
): Promise<void> {
  const step = config.steps.find((s) => s.id === stepId);
  if (!step) {
    await showDemoComplete(phone, session, config);
    return;
  }

  await updateDemoSession(session.id, { current_step: stepId } as any);

  const ctx = session.session_data || {};
  const body = typeof step.body === "function" ? step.body(ctx) : step.body;

  switch (step.type) {
    case "message":
      await sendTextMessage(phone, body);
      if (step.nextStep) {
        const next = typeof step.nextStep === "function" ? step.nextStep("", ctx) : step.nextStep;
        await executeStep(phone, session, config, next);
      }
      break;

    case "list": {
      const options = typeof step.options === "function" ? step.options(ctx) : (step.options || []);
      const rows = options.map((o) => makeListRow(
        `demo_${config.id}_${o.id}`,
        o.label.substring(0, 24),
        (o.description || "").substring(0, 72)
      ));
      rows.push(makeListRow(`demo_${config.id}_exit`, "🔙 Exit Demo", "Return to Demo Centre"));
      await sendListMessage(phone, body, step.title || "Select", [{ title: "Options", rows }], config.name, "Xtop Demo");
      break;
    }

    case "buttons": {
      const options = typeof step.options === "function" ? step.options(ctx) : (step.options || []);
      const buttons = options.slice(0, 3).map((o) => makeButton(`demo_${config.id}_${o.id}`, o.label));
      await sendButtonMessage(phone, body, buttons, step.title || config.name);
      if (options.length > 3) {
        const moreButtons = options.slice(3, 6).map((o) => makeButton(`demo_${config.id}_${o.id}`, o.label));
        await sendButtonMessage(phone, "_More options:_", moreButtons, "");
      }
      break;
    }

    case "input":
      await sendTextMessage(phone, body);
      break;

    case "confirmation":
      await sendButtonMessage(
        phone,
        body,
        [
          makeButton(`demo_${config.id}_confirm`, "✅ Confirm"),
          makeButton(`demo_${config.id}_cancel`, "❌ Cancel"),
        ],
        "Confirm"
      );
      break;
  }
}

// ═══════════════════════════════════════════════════════
// ENGINE: PROCESS INPUT
// ═══════════════════════════════════════════════════════

export async function processDemoInput(
  phone: string,
  text: string,
  interactiveId: string,
  session: DemoSession,
  config: DemoConfig,
  conversationId: string
): Promise<void> {
  const rawInput = (interactiveId || text || "").trim();
  const n = normalise(rawInput);
  const stepId = session.current_step;
  const step = config.steps.find((s) => s.id === stepId);
  const ctx = session.session_data || {};

  // Exit / Back
  if (n === "menu_home" || n === "main menu" || rawInput.includes("_exit")) {
    await completeDemoSession(session.id);
    await showMainMenu(phone, conversationId);
    return;
  }

  if (n === "demo_menu" || n === "demo_back" || n === "demo_centre") {
    await completeDemoSession(session.id);
    const { showDemoCentreMenu } = await import("./index.ts");
    await showDemoCentreMenu(phone, conversationId);
    return;
  }

  if (!step) {
    await showDemoComplete(phone, session, config);
    return;
  }

  // Handle confirmation
  if (step.type === "confirmation") {
    if (rawInput.includes("_confirm")) {
      if (step.onComplete) await step.onComplete(ctx);
      const next = typeof step.nextStep === "function" ? step.nextStep("confirm", ctx) : (step.nextStep || "COMPLETE");
      if (next === "COMPLETE") {
        await showDemoComplete(phone, session, config);
      } else {
        await executeStep(phone, session, config, next);
      }
    } else {
      await sendTextMessage(phone, "❌ Cancelled.");
      await showDemoComplete(phone, session, config);
    }
    return;
  }

  // Handle list/button selection
  if (rawInput.startsWith(`demo_${config.id}_`)) {
    const selectedId = rawInput.replace(`demo_${config.id}_`, "");
    const options = typeof step.options === "function" ? step.options(ctx) : (step.options || []);
    const selected = options.find((o) => o.id === selectedId);

    if (selected && step.captureField) {
      ctx[step.captureField] = selected.label;
      ctx[`${step.captureField}_id`] = selected.id;
    }

    await updateDemoSession(session.id, { session_data: ctx } as any);

    if (step.nextStep) {
      const next = typeof step.nextStep === "function" ? step.nextStep(selectedId, ctx) : step.nextStep;
      await executeStep(phone, session, config, next);
    } else {
      await showDemoComplete(phone, session, config);
    }
    return;
  }

  // Handle free-text input
  if (step.type === "input") {
    if (step.validation) {
      const error = step.validation(rawInput);
      if (error) {
        await sendTextMessage(phone, error);
        return;
      }
    }

    if (step.captureField) {
      ctx[step.captureField] = rawInput;
    }

    await updateDemoSession(session.id, { session_data: ctx } as any);

    if (step.nextStep) {
      const next = typeof step.nextStep === "function" ? step.nextStep(rawInput, ctx) : step.nextStep;
      await executeStep(phone, session, config, next);
    } else {
      await showDemoComplete(phone, session, config);
    }
    return;
  }

  // Fallback: re-send current step
  await executeStep(phone, session, config, stepId);
}

// ═══════════════════════════════════════════════════════
// DEMO COMPLETE + LEAD CAPTURE
// ═══════════════════════════════════════════════════════

async function showDemoComplete(
  phone: string,
  session: DemoSession,
  config: DemoConfig
): Promise<void> {
  await completeDemoSession(session.id);

  await sendButtonMessage(
    phone,
    `🎉 *Demo Complete!*\n\n` +
    `${config.icon} *${config.name}*\n\n` +
    `You've experienced a live demonstration of how Xtop can automate this workflow for your business.\n\n` +
    `⚠️ _This was a demo with fictional data. Xtop can build a fully customized version for your real business._\n\n` +
    `*What would you like to do next?*`,
    [
      makeButton(`demo_restart_${config.id}`, "▶️ Try Again"),
      makeButton("demo_build_lead", "💼 Build This For My Business"),
      makeButton("demo_agent", "👨‍💼 Talk to an Agent"),
      makeButton("demo_menu", "🎮 Demo Centre"),
    ],
    "Demo Complete"
  );
}

export async function handlePostDemoAction(
  phone: string,
  text: string,
  interactiveId: string,
  conversationId: string,
  contactName?: string
): Promise<boolean> {
  const rawInput = (interactiveId || text || "").trim();
  const n = normalise(rawInput);

  if (rawInput.startsWith("demo_restart_")) {
    const demoId = rawInput.replace("demo_restart_", "");
    const { getDemoConfig } = await import("./data.ts");
    const config = getDemoConfig(demoId);
    if (config) {
      await startDemo(phone, conversationId, config);
      return true;
    }
  }

  if (n === "demo_build_lead" || n.includes("build this")) {
    await startLeadCapture(phone, conversationId);
    return true;
  }

  if (n === "demo_agent" || n.includes("talk to an agent")) {
    const { showAgentCategories } = await import("../agents.ts");
    await showAgentCategories(phone, conversationId);
    return true;
  }

  return false;
}

// ═══════════════════════════════════════════════════════
// LEAD CAPTURE FLOW
// ═══════════════════════════════════════════════════════

async function startLeadCapture(phone: string, conversationId: string): Promise<void> {
  const session = await createDemoSession(phone, "LEAD_CAPTURE", "CONVERSION", {
    conversationId,
    stepHistory: [],
  });
  if (!session) return;

  await sendTextMessage(
    phone,
    `💼 *Build This For Your Business!*\n\n` +
    `Let's capture your requirements so our team can prepare a custom proposal.\n\n` +
    `*1/5. What is your full name?*`
  );
  await updateDemoSession(session.id, { current_step: "LEAD_NAME" } as any);
}

export async function processLeadCapture(
  phone: string,
  text: string,
  session: DemoSession,
  conversationId: string
): Promise<boolean> {
  const ctx = session.session_data || {};
  const step = session.current_step;
  const input = text.trim();

  if (!input || normalise(input) === "menu_home") return false;

  switch (step) {
    case "LEAD_NAME":
      ctx.contactName = input;
      await updateDemoSession(session.id, { current_step: "LEAD_BUSINESS", session_data: ctx } as any);
      await sendTextMessage(phone, `Thanks *${input}*!\n\n*2/5. What is your business name?*`);
      return true;

    case "LEAD_BUSINESS":
      ctx.businessName = input;
      await updateDemoSession(session.id, { current_step: "LEAD_INDUSTRY", session_data: ctx } as any);
      await sendListMessage(phone, `*3/5. What industry is your business in?*`, "Select Industry", [{
        title: "Industry",
        rows: [
          makeListRow("demo_lead_ind_retail", "Retail & E-commerce", ""),
          makeListRow("demo_lead_ind_food", "Food & Restaurant", ""),
          makeListRow("demo_lead_ind_health", "Health & Medical", ""),
          makeListRow("demo_lead_ind_edu", "Education", ""),
          makeListRow("demo_lead_ind_realestate", "Real Estate", ""),
          makeListRow("demo_lead_ind_auto", "Automobile", ""),
          makeListRow("demo_lead_ind_services", "Professional Services", ""),
          makeListRow("demo_lead_ind_other", "Other", ""),
        ]
      }], "Industry", "Xtop Demo Lead");
      return true;

    case "LEAD_INDUSTRY":
      if (input.startsWith("demo_lead_ind_")) {
        ctx.industry = input.replace("demo_lead_ind_", "").replace(/_/g, " ");
        await updateDemoSession(session.id, { current_step: "LEAD_DEMO", session_data: ctx } as any);
        await sendTextMessage(phone, `*4/5. Which demo are you most interested in?*\n\n_(Type the name, e.g. Online Store, CRM, Appointment Booking)_`);
        return true;
      }
      break;

    case "LEAD_DEMO":
      ctx.demoInterest = input;
      await updateDemoSession(session.id, { current_step: "LEAD_REQUIREMENTS", session_data: ctx } as any);
      await sendTextMessage(phone, `*5/5. Briefly describe what you want customized:*\n\n_(e.g. "I need an online store for my shoe business with payment integration")_`);
      return true;

    case "LEAD_REQUIREMENTS":
      ctx.requirements = input;
      await updateDemoSession(session.id, { session_data: ctx } as any);

      // Save lead to database
      await createDemoLead(
        phone,
        ctx.contactName || "Unknown",
        ctx.businessName || "Unknown",
        ctx.industry || "Unknown",
        ctx.demoInterest || "general",
        ctx.demoInterest || "Demo Centre Lead",
        ctx.requirements || "No details provided"
      );

      await completeDemoSession(session.id);

      await sendButtonMessage(
        phone,
        `✅ *Request Submitted Successfully!*\n\n` +
        `*Name:* ${ctx.contactName}\n` +
        `*Business:* ${ctx.businessName}\n` +
        `*Industry:* ${ctx.industry}\n` +
        `*Interested In:* ${ctx.demoInterest}\n\n` +
        `An Xtop engineer will contact you within *24 hours* to discuss your custom automation project.\n\n` +
        `_Thank you for choosing Xtop Retail Technologies!_`,
        [
          makeButton("demo_menu", "🎮 Demo Centre"),
          makeButton("menu_home", "🏠 Main Menu"),
        ],
        "Lead Captured"
      );
      return true;
  }

  return false;
}
