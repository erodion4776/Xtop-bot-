// modules/demos/personalized.ts
// PATH A: Token-based personalized demo entry.
// PATH C: Preserves existing user workflows (by design — only triggers from IDLE).

import {
  Contact, Conversation, updateConversation,
  createDemoLead, createAgentRequest,
  getSupabaseClient, safeErrorLog,
} from "../../database.ts";
import {
  sendTextMessage, sendButtonMessage, sendListMessage,
  makeButton, makeListRow,
} from "../../whatsapp.ts";
import { validateToken, extractTokenFromText, ValidatedToken } from "./tokens.ts";
import { getIndustryTemplate } from "./industry-templates.ts";
import { showDemoCentreMenu } from "./index.ts";
import { showMainMenu } from "../main-menu.ts";

/**
 * Log a sales event to the audit trail.
 */
async function logSalesEvent(
  phone: string,
  eventType: string,
  leadId?: string | null,
  eventData?: Record<string, any>
): Promise<void> {
  const sb = getSupabaseClient();
  try {
    await sb.from("sales_events").insert({
      phone_number: phone,
      lead_id: leadId || null,
      event_type: eventType,
      event_data: eventData || {},
    });
  } catch (err) {
    safeErrorLog("logSalesEvent", err);
  }
}

/**
 * Main entry: called from router.ts when a token is detected in an IDLE conversation.
 * Returns true if the token was handled (valid or invalid), false to continue routing.
 */
export async function handlePersonalizedDemoToken(
  phone: string,
  text: string,
  token: string,
  contact: Contact,
  conversation: Conversation
): Promise<boolean> {
  const validated = await validateToken(token);

  if (!validated) {
    // Token found but invalid/expired — inform user and show main menu
    await sendTextMessage(
      phone,
      `⚠️ The demo reference code you provided appears to be expired or invalid.\n\n` +
      `No worries! You can still explore our demos and tools.`
    );
    await showDemoCentreMenu(phone, conversation.id);
    await logSalesEvent(phone, "invalid_token", null, { token_prefix: token.substring(0, 8) });
    return true;
  }

  // ✅ Valid token — create/update lead
  const leadResult = await createDemoLead(
    phone,
    contact.name || "Prospect",
    validated.businessName,
    validated.businessCategory,
    validated.demoTemplate,
    validated.businessName + " Demo",
    `Personalized demo via token ${validated.tokenPrefix}`
  );

  const leadId = leadResult?.id || null;

  await logSalesEvent(phone, "inbound_demo_request", leadId, {
    business_name: validated.businessName,
    token_prefix: validated.tokenPrefix,
    campaign: validated.campaignSource,
  });

  // Update conversation to DEMOS workflow with personalized context
  await updateConversation(conversation.id, {
    current_module: "DEMOS",
    current_state: "PERSONALIZED_WELCOME",
    context_json: {
      personalizedDemo: true,
      businessName: validated.businessName,
      businessCategory: validated.businessCategory,
      demoTemplate: validated.demoTemplate,
      businessConfigId: validated.businessConfigId,
      tokenPrefix: validated.tokenPrefix,
      leadId,
    },
  });

  // Show personalized welcome with 4 buttons
  await sendTextMessage(
    phone,
    `Hello *${validated.businessName}*! 👋\n\n` +
    `Welcome to your personalized Xtop WhatsApp business demo.\n\n` +
    `We've prepared an example of how a WhatsApp system could help ` +
    `your business present services, handle enquiries, collect customer ` +
    `leads, and connect serious customers to your team.\n\n` +
    `What would you like to do?`
  );

  await sendButtonMessage(
    phone,
    `👇 Choose an option:`,
    [
      makeButton("demo_view_my_biz", "View My Demo"),
      makeButton("demo_try_related", "Related Demos"),
      makeButton("demo_try_tools", "Free Xtop Tools"),
    ]
  );

  // Send "Talk to Agent" separately (WhatsApp limits to 3 buttons)
  await sendTextMessage(
    phone,
    `Or type *agent* anytime to talk to our team.`
  );

  return true;
}

/**
 * Handle actions within an active personalized demo session.
 * Called from the DEMOS workflow lock when context_json.personalizedDemo is true.
 */
export async function handlePersonalizedDemoAction(
  phone: string,
  text: string,
  interactiveId: string,
  conversation: Conversation
): Promise<boolean> {
  const ctx = (conversation.context_json || {}) as Record<string, any>;
  if (!ctx.personalizedDemo) return false;

  const businessName = ctx.businessName || "Your Business";
  const template = getIndustryTemplate(ctx.demoTemplate || "other");
  const n = text.toLowerCase().trim();

  // ── View My Business Demo ──
  if (interactiveId === "demo_view_my_biz" || n.includes("view my demo") || n.includes("view my business")) {
    await updateConversation(conversation.id, {
      current_module: "DEMOS",
      current_state: "PERSONALIZED_DEMO_VIEW",
      context_json: { ...ctx },
    });

    await sendTextMessage(phone, template.welcomeMessage(businessName));

    const rows = template.menuOptions.map((opt) =>
      makeListRow(opt.id, opt.title.substring(0, 24), opt.description.substring(0, 72))
    );
    rows.push(makeListRow("demo_back_personalized", "🔙 Back to Demo Menu", "Return to options"));

    await sendListMessage(
      phone,
      template.menuBody(businessName),
      "Explore Demo",
      [{ title: "Demo Options", rows }],
      `${template.icon} ${businessName}`,
      "Powered by Xtop"
    );

    await logSalesEvent(phone, "demo_opened", ctx.leadId, { template: ctx.demoTemplate });
    return true;
  }

  // ── Sample Response for Demo Sub-options ──
  if (interactiveId.startsWith("demo_") && template.sampleResponses[interactiveId]) {
    await sendTextMessage(phone, template.sampleResponses[interactiveId]);
    await sendButtonMessage(
      phone,
      `What would you like to do next?`,
      [
        makeButton("demo_view_my_biz", "Back to Demo"),
        makeButton("demo_try_related", "Related Demos"),
        makeButton("demo_build_lead", "Talk to Agent"),
      ]
    );
    return true;
  }

  // ── Try Related Demos ──
  if (interactiveId === "demo_try_related" || n.includes("related")) {
    const relatedIds = template.relatedDemoIds;
    const rows = relatedIds.map((id) =>
      makeListRow(`demostart_${id}`, `📌 ${id.replace(/_/g, " ")}`.substring(0, 24), "Try this demo")
    );
    rows.push(makeListRow("demo_back_personalized", "🔙 Back to My Demo", "Return"));
    rows.push(makeListRow("democat_all", "📋 Full Demo Centre", "Browse all demos"));

    await sendListMessage(
      phone,
      `🔗 *Related Demos for ${businessName}*\n\n` +
      `Based on your industry, you might also like:`,
      "Related Demos",
      [{ title: "Suggested", rows }],
      `${template.icon} Related`,
      "Powered by Xtop"
    );
    return true;
  }

  // ── Try Free Xtop Tools ──
  if (interactiveId === "demo_try_tools" || n.includes("free tools") || n.includes("tools")) {
    const rows = [
      makeListRow("tool_domain", "🌐 Domain Checker", "Check domain availability"),
      makeListRow("tool_flight", "✈️ Flight Checker", "Check flight status"),
      makeListRow("tool_calc", "🧮 Calculator", "Business calculator"),
      makeListRow("demo_back_personalized", "🔙 Back to My Demo", "Return"),
      makeListRow("menu_home", "🏠 Main Menu", "Full menu"),
    ];

    await sendListMessage(
      phone,
      `🛠️ *Free Xtop Tools*\n\n` +
      `These tools are free to use right now:`,
      "Free Tools",
      [{ title: "Available Tools", rows }],
      "Xtop Free Tools",
      "Powered by Xtop"
    );
    await logSalesEvent(phone, "free_tools_opened", ctx.leadId);
    return true;
  }

  // ── Talk to Agent / Build Lead ──
  if (
    interactiveId === "demo_build_lead" ||
    interactiveId === "demo_agent" ||
    n.includes("agent") ||
    n.includes("talk to") ||
    n.includes("request a call") ||
    n.includes("quote")
  ) {
    await createAgentRequest(
      contact?.id,
      "DEMO_CONVERSION",
      `Personalized demo lead for ${businessName}. ` +
      `Category: ${ctx.businessCategory}. Template: ${ctx.demoTemplate}.`,
      "HIGH",
      ctx.leadId
    );

    await logSalesEvent(phone, "agent_requested", ctx.leadId, {
      business_name: businessName,
    });

    await sendTextMessage(
      phone,
      `✅ *Request Received!*\n\n` +
      `Thank you for your interest in Xtop for *${businessName}*.\n\n` +
      `A member of our team will reach out to you shortly ` +
      `to discuss how we can customize this system for your business.\n\n` +
      `📞 You can also reach us directly at *08024988555*.\n\n` +
      `Type *menu* to explore other features.`
    );

    await updateConversation(conversation.id, {
      current_module: "MAIN_MENU",
      current_state: "IDLE",
      context_json: {},
    });
    return true;
  }

  // ── Back to Personalized Menu ──
  if (interactiveId === "demo_back_personalized" || n.includes("back to demo")) {
    await sendButtonMessage(
      phone,
      `*${businessName} Demo*\n\nWhat would you like to do?`,
      [
        makeButton("demo_view_my_biz", "View My Demo"),
        makeButton("demo_try_related", "Related Demos"),
        makeButton("demo_try_tools", "Free Xtop Tools"),
      ]
    );
    return true;
  }

  return false;
}
