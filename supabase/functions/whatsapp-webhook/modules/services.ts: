// supabase/functions/whatsapp-webhook/modules/services.ts

import {
  Contact,
  Conversation,
  getActiveServices,
  getServiceBySlug,
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

export async function handleServices(
  phone: string,
  text: string,
  contact: Contact,
  conversation: Conversation
): Promise<void> {
  const state = conversation.current_state;
  const context = conversation.context_json as { selectedServiceSlug?: string };

  if (isBack(text) && state === "VIEWING_DETAIL") {
    await showServicesList(phone, conversation.id);
    return;
  }

  switch (state) {
    case "ENTRY":
    case "SHOWING_LIST":
      await processServiceSelection(phone, text, conversation);
      break;

    case "VIEWING_DETAIL":
      await processServiceDetailAction(phone, text, contact, conversation, context.selectedServiceSlug);
      break;

    default:
      await showServicesList(phone, conversation.id);
      break;
  }
}

export async function showServicesList(phone: string, conversationId: string): Promise<void> {
  const services = await getActiveServices();

  if (services.length === 0) {
    await sendTextMessage(phone, "🛠️ Services are currently being updated. Please check back shortly.");
    await showMainMenu(phone, conversationId);
    return;
  }

  await updateConversation(conversationId, {
    current_module: "SERVICES",
    current_state: "SHOWING_LIST",
    context_json: {},
  });

  const rows = services.map((s, idx) =>
    makeListRow(`srv_${s.slug}`, `${idx + 1}️⃣ ${s.name}`, s.price_range || "Custom Pricing")
  );
  rows.push(makeListRow("srv_back_menu", "🔙 Main Menu", "Return to home"));

  const body = `🛠️ *Xtop Retail Technologies — Our Services*\n\nWe design, develop, and deploy enterprise-grade digital automation systems for businesses.\n\n👇 *Select a service to view deliverables and pricing:*`;

  await sendListMessage(phone, body, "View Services", [
    { title: "Engineering & Automation", rows },
  ]);
}

async function processServiceSelection(
  phone: string,
  text: string,
  conversation: Conversation
): Promise<void> {
  const n = normalise(text);

  if (n === "srv_back_menu" || n.includes("main menu")) {
    await showMainMenu(phone, conversation.id);
    return;
  }

  const services = await getActiveServices();
  let selected = services.find((s) => n === `srv_${s.slug}` || n.includes(s.slug) || n.includes(normalise(s.name)));

  if (!selected) {
    const num = extractSelection(text);
    if (num && num >= 1 && num <= services.length) {
      selected = services[num - 1];
    }
  }

  if (!selected) {
    await sendTextMessage(phone, "Please select one of the available services from the list.");
    await showServicesList(phone, conversation.id);
    return;
  }

  await showServiceDetail(phone, conversation.id, selected.slug);
}

export async function showServiceDetail(phone: string, conversationId: string, slug: string): Promise<void> {
  const service = await getServiceBySlug(slug);
  if (!service) {
    await sendTextMessage(phone, "Service not found.");
    await showServicesList(phone, conversationId);
    return;
  }

  await updateConversation(conversationId, {
    current_module: "SERVICES",
    current_state: "VIEWING_DETAIL",
    context_json: { selectedServiceSlug: service.slug },
  });

  const featuresFormatted = (service.features || [])
    .map((f) => `  • ${f}`)
    .join("\n");

  const message =
    `⚙️ *${service.name.toUpperCase()}*\n\n` +
    `📖 *Description:*\n${service.description}\n\n` +
    `⚡ *Deliverables & Scope:*\n${featuresFormatted}\n\n` +
    `💰 *Starting Estimate:* ${service.price_range || "Custom quotation required"}\n`;

  await sendButtonMessage(
    phone,
    message,
    [
      makeButton(`srv_req_${service.slug}`, "Request Service"),
      makeButton("srv_list_back", "All Services"),
      makeButton("srv_menu_home", "Main Menu"),
    ],
    service.name,
    "Xtop Retail Technologies"
  );
}

async function processServiceDetailAction(
  phone: string,
  text: string,
  contact: Contact,
  conversation: Conversation,
  serviceSlug?: string
): Promise<void> {
  const n = normalise(text);
  const slug = serviceSlug || "whatsapp_bots";

  if (n === "srv_list_back" || isBack(text)) {
    await showServicesList(phone, conversation.id);
    return;
  }

  if (n === "srv_menu_home" || n.includes("menu")) {
    await showMainMenu(phone, conversation.id);
    return;
  }

  if (n.startsWith("srv_req_") || n.includes("request")) {
    await updateConversation(conversation.id, {
      current_module: "AGENT",
      current_state: "COLLECT_MESSAGE",
      context_json: { request_type: "QUOTATION", preset_message: `Quotation request for service: ${slug}` },
    });
    await sendTextMessage(
      phone,
      `📋 *Quotation Request: ${slug.toUpperCase()}*\n\nPlease describe your business type and the key features you need built:\n\n_(An agent will prepare a structured proposal)_`
    );
    return;
  }

  await sendTextMessage(phone, "Please select an option below:");
  await showServiceDetail(phone, conversation.id, slug);
}
