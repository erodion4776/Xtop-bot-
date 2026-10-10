// modules/demos/personalized.ts
// PATH A: Token-based personalized demo entry + active session handler.
// Generic: loads the correct template for ANY business category.

import {
  Contact, Conversation, updateConversation,
  createDemoLead, createAgentRequest,
  getSupabaseClient, safeErrorLog,
} from "../../database.ts";
import {
  sendTextMessage, sendButtonMessage, sendListMessage,
  makeButton, makeListRow,
} from "../../whatsapp.ts";
import { validateToken } from "./tokens.ts";
import { getTemplate, getRelatedTemplates } from "./templates.ts";
import { showDemoCentreMenu } from "./index.ts";

async function logEvent(phone: string, type: string, leadId?: string | null, data?: Record<string, any>): Promise<void> {
  try {
    await getSupabaseClient().from("sales_events").insert({
      phone_number: phone, lead_id: leadId || null, event_type: type, event_data: data || {},
    });
  } catch (e) { safeErrorLog("logEvent", e); }
}

/**
 * Entry point: called from router.ts when a token is detected in IDLE state.
 */
export async function handlePersonalizedDemoToken(
  phone: string, text: string, token: string,
  contact: Contact, conversation: Conversation
): Promise<boolean> {
  const v = await validateToken(token, text);

  if (!v) {
    await sendTextMessage(phone,
      `⚠️ The demo reference code appears expired or invalid.\n\nNo worries — you can still explore our demos and tools.`);
    await showDemoCentreMenu(phone, conversation.id);
    await logEvent(phone, "invalid_token", null, { prefix: token.substring(0, 8) });
    return true;
  }

  const lead = await createDemoLead(
    phone, contact.name || "Prospect", v.businessName,
    v.businessCategory, v.demoTemplate,
    `${v.businessName} Demo`, `Token ${v.tokenPrefix}`
  );
  const leadId = lead?.id || null;
  await logEvent(phone, "inbound_demo_request", leadId, { business: v.businessName, campaign: v.campaignSource });

  await updateConversation(conversation.id, {
    current_module: "DEMOS", current_state: "PERSONALIZED_WELCOME",
    context_json: {
      personalizedDemo: true, businessName: v.businessName,
      businessCategory: v.businessCategory, demoTemplate: v.demoTemplate,
      businessConfigId: v.businessConfigId, tokenPrefix: v.tokenPrefix, leadId,
    },
  });

  await sendTextMessage(phone,
    `Hello *${v.businessName}*! 👋\n\n` +
    `Welcome to your personalized Xtop WhatsApp business demo.\n\n` +
    `We've prepared an example of how a WhatsApp system could help ` +
    `your business present services, handle enquiries, collect leads, ` +
    `and connect customers to your team.\n\nWhat would you like to do?`);

  await sendButtonMessage(phone, `👇 Choose an option:`, [
    makeButton("demo_view_my_biz", "View My Demo"),
    makeButton("demo_try_related", "Related Demos"),
    makeButton("demo_try_tools", "Free Xtop Tools"),
  ]);
  await sendTextMessage(phone, `Or type *agent* anytime to talk to our team.`);
  return true;
}

/**
 * Handle actions within an active personalized demo session.
 */
export async function handlePersonalizedDemoAction(
  phone: string, text: string, interactiveId: string,
  conversation: Conversation
): Promise<boolean> {
  const ctx = (conversation.context_json || {}) as Record<string, any>;
  if (!ctx.personalizedDemo) return false;

  const biz = ctx.businessName || "Your Business";
  const tpl = getTemplate(ctx.demoTemplate || "other");
  const n = text.toLowerCase().trim();

  // ── View My Business Demo ──
  if (interactiveId === "demo_view_my_biz" || n.includes("view my demo") || n.includes("view my business") || n.includes("view suggested")) {
    await updateConversation(conversation.id, {
      current_module: "DEMOS", current_state: "PERSONALIZED_DEMO_VIEW", context_json: { ...ctx },
    });
    await sendTextMessage(phone, tpl.welcomeMessage(biz));

    const rows = tpl.menuOptions.map((o) => makeListRow(o.id, o.title.substring(0, 24), o.description.substring(0, 72)));
    rows.push(makeListRow("demo_back_personalized", "🔙 Back to Menu", "Return to options"));

    await sendListMessage(phone, tpl.menuBody(biz), "Explore", [{ title: "Demo Options", rows }], `${tpl.icon} ${biz}`, "Powered by Xtop");
    await logEvent(phone, "demo_opened", ctx.leadId, { template: ctx.demoTemplate });
    return true;
  }

  // ── Sample Responses (function-based — no scope errors) ──
  if (interactiveId.startsWith("demo_") && tpl.sampleResponses[interactiveId]) {
    const responseFn = tpl.sampleResponses[interactiveId];
    await sendTextMessage(phone, responseFn(biz));
    await sendButtonMessage(phone, `What next?`, [
      makeButton("demo_view_my_biz", "Back to Demo"),
      makeButton("demo_try_related", "Related Demos"),
      makeButton("demo_build_lead", "Talk to Agent"),
    ]);
    return true;
  }

  // ── Related Demos ──
  if (interactiveId === "demo_try_related" || n.includes("related")) {
    const related = getRelatedTemplates(ctx.demoTemplate || "other");
    const rows = related.map((r) => makeListRow(`demostart_${r.key}`, `${r.icon} ${r.label}`.substring(0, 24), "Try this demo"));
    rows.push(makeListRow("demo_back_personalized", "🔙 Back to My Demo", "Return"));
    rows.push(makeListRow("democat_all", "📋 Full Demo Centre", "Browse all"));

    await sendListMessage(phone,
      `🔗 *Related Demos for ${biz}*\n\nBased on your industry:`,
      "Related", [{ title: "Suggested", rows }], `${tpl.icon} Related`, "Powered by Xtop");
    return true;
  }

  // ── Free Tools ──
  if (interactiveId === "demo_try_tools" || n.includes("free tools") || n.includes("tools")) {
    const rows = [
      makeListRow("tool_domain", "🌐 Domain Checker", "Check availability"),
      makeListRow("tool_flight", "✈️ Flight Checker", "Flight status"),
      makeListRow("tool_calc", "🧮 Calculator", "Business calc"),
      makeListRow("demo_back_personalized", "🔙 Back to Demo", "Return"),
      makeListRow("menu_home", "🏠 Main Menu", "Full menu"),
    ];
    await sendListMessage(phone, `🛠️ *Free Xtop Tools*`, "Tools", [{ title: "Available", rows }], "Xtop Tools", "Powered by Xtop");
    await logEvent(phone, "free_tools_opened", ctx.leadId);
    return true;
  }

  // ── Agent / Callback / Quote ──
  if (interactiveId === "demo_build_lead" || interactiveId === "demo_agent" ||
      n.includes("agent") || n.includes("talk to") || n.includes("callback") ||
      n.includes("quote") || n.includes("discuss")) {
    await createAgentRequest(
      (contact as any)?.id, "DEMO_CONVERSION",
      tpl.agentHandover(biz), "HIGH", ctx.leadId
    );
    await logEvent(phone, "agent_requested", ctx.leadId, { business: biz });
    await sendTextMessage(phone,
      `✅ *Request Received!*\n\nThank you for your interest in Xtop for *${biz}*.\n\n` +
      `A team member will reach out shortly to discuss customization.\n\n` +
      `📞 You can also call *08024988555* directly.\n\nType *menu* to explore more.`);
    await updateConversation(conversation.id, { current_module: "MAIN_MENU", current_state: "IDLE", context_json: {} });
    return true;
  }

  // ── Back ──
  if (interactiveId === "demo_back_personalized" || n.includes("back to demo") || n.includes("back to menu")) {
    await sendButtonMessage(phone, `*${biz} Demo*\n\nWhat would you like to do?`, [
      makeButton("demo_view_my_biz", "View My Demo"),
      makeButton("demo_try_related", "Related Demos"),
      makeButton("demo_try_tools", "Free Xtop Tools"),
    ]);
    return true;
  }

  return false;
}
