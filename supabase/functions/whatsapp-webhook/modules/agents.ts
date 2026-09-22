// supabase/functions/whatsapp-webhook/modules/agents.ts
// Phase 3 — Talk to an Agent (With Auto-Redirection to Structured Qualification)

import {
  Contact, Conversation, updateConversation,
  createAgentRequest,
} from "../database.ts";
import {
  sendButtonMessage, sendListMessage, sendTextMessage,
  makeButton, makeListRow,
} from "../whatsapp.ts";
import { extractSelection, normalise, isBack } from "../utils.ts";
import { showMainMenu } from "./main-menu.ts";

// ═══════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════

export async function handleAgent(
  phone: string, text: string, contact: Contact, conversation: Conversation
): Promise<void> {
  const state = conversation.current_state;
  const context = conversation.context_json as {
    request_type?: string;
  };

  if (isBack(text)) {
    if (state === "COLLECT_MESSAGE") {
      await showAgentCategories(phone, conversation.id);
    } else {
      await showMainMenu(phone, conversation.id);
    }
    return;
  }

  switch (state) {
    case "ENTRY":
    case "SELECT_TYPE":
      await processAgentCategorySelection(phone, text, conversation);
      break;

    case "COLLECT_MESSAGE":
      await processAgentMessageSubmission(phone, text, contact, conversation, context.request_type || "GENERAL_ENQUIRY");
      break;

    default:
      await showAgentCategories(phone, conversation.id);
      break;
  }
}

// ═══════════════════════════════════════════════════════
// CATEGORY SELECTOR
// ═══════════════════════════════════════════════════════

export async function showAgentCategories(phone: string, conversationId: string): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "AGENT",
    current_state: "SELECT_TYPE",
    context_json: {},
  });

  const body =
    `👤 *Talk to an Agent*\n\n` +
    `How can our team help you today?\n\n` +
    `👉 Options *1* and *2* will guide you through our automated estimator to give you an instant quote first.`;

  await sendListMessage(
    phone,
    body,
    "How can we help?",
    [
      {
        title: "Start or Get Estimates",
        rows: [
          makeListRow("agt_type_project", "1️⃣ Start a Project", "Launch qualification wizard"),
          makeListRow("agt_type_quote", "2️⃣ Request a Quotation", "Get instant estimate"),
        ],
      },
      {
        title: "Product Support & Other",
        rows: [
          makeListRow("agt_type_product", "3️⃣ Product Question", "Questions on XtopEdu/NaijaShop"),
          makeListRow("agt_type_support", "4️⃣ Technical Support", "For existing customers"),
          makeListRow("agt_type_general", "5️⃣ Speak to an Agent", "General human escalation"),
        ],
      },
    ],
    "Xtop Retail Support",
    "Human Escalation Desk"
  );
}

// ═══════════════════════════════════════════════════════
// CATEGORY PROCESSOR
// ═══════════════════════════════════════════════════════

async function processAgentCategorySelection(
  phone: string, text: string, conversation: Conversation
): Promise<void> {
  const n = normalise(text);

  // 1. Direct Redirections to Structured Qualification
  if (n === "agt_type_project" || n === "agt_type_quote" || n === "1" || n === "2") {
    const { showServiceTypeSelector } = await import("./sales.ts");
    await showServiceTypeSelector(phone, conversation.id);
    return;
  }

  // 2. Resolve selection deterministically
  let requestType = "GENERAL_ENQUIRY";

  if (n === "agt_type_product" || n === "3") {
    requestType = "PRODUCT_QUESTION";
  } else if (n === "agt_type_support" || n === "4") {
    requestType = "TECH_SUPPORT";
  } else if (n === "agt_type_general" || n === "5") {
    requestType = "GENERAL_ENQUIRY";
  } else {
    const num = extractSelection(text);
    if (num === 1 || num === 2) {
      const { showServiceTypeSelector } = await import("./sales.ts");
      await showServiceTypeSelector(phone, conversation.id);
      return;
    } else if (num === 3) {
      requestType = "PRODUCT_QUESTION";
    } else if (num === 4) {
      requestType = "TECH_SUPPORT";
    } else if (num === 5) {
      requestType = "GENERAL_ENQUIRY";
    } else {
      await sendTextMessage(phone, "⚠️ Please select one of the valid options from the menu.");
      await showAgentCategories(phone, conversation.id);
      return;
    }
  }

  // 3. Move to free-text message collection for Support/Questions
  await updateConversation(conversation.id, {
    current_module: "AGENT",
    current_state: "COLLECT_MESSAGE",
    context_json: { request_type: requestType },
  });

  const prompts: Record<string, string> = {
    PRODUCT_QUESTION: "❓ *Product Question*\n\nWhich of our products (XtopEdu, NaijaShop) do you have a question about, and what would you like to know?\n\n_(Type your question below)_",
    TECH_SUPPORT: "🛠 *Technical Support*\n\nPlease describe the technical issue you are experiencing in detail:\n\n_(Type your support request below)_",
    GENERAL_ENQUIRY: "💬 *Speak to an Agent*\n\nPlease type your message or enquiry below and a team member will reply directly:",
  };

  await sendTextMessage(phone, prompts[requestType]);
}

// ═══════════════════════════════════════════════════════
// TICKET SUBMISSION
// ═══════════════════════════════════════════════════════

async function processAgentMessageSubmission(
  phone: string, text: string, contact: Contact, conversation: Conversation, requestType: string
): Promise<void> {
  const priority = requestType === "TECH_SUPPORT" ? "HIGH" : "NORMAL";

  const record = await createAgentRequest(contact.id, requestType, text, priority);

  await updateConversation(conversation.id, {
    current_module: "MAIN_MENU",
    current_state: "IDLE",
    context_json: { lastRequestId: record?.id },
  });

  const ticketRef = record?.id
    ? `#REQ-${record.id.substring(0, 8).toUpperCase()}`
    : "#REQ-RECEIVED";

  const confirmationMessage =
    `✅ *Your request has been logged successfully!*\n\n` +
    `*Reference Ticket:* \`${ticketRef}\`\n` +
    `*Department:* ${requestType.replace("_", " ")}\n` +
    `*Status:* Queued for Agent Review\n\n` +
    `An Xtop Retail Technologies team member will follow up with you on WhatsApp shortly.\n\n` +
    `_Type *menu* anytime to return to the main options._`;

  await sendButtonMessage(
    phone,
    confirmationMessage,
    [
      makeButton("menu_home", "🏠 Main Menu"),
      makeButton("menu_products", "📦 Our Products"),
      makeButton("menu_demos", "🎮 View Demos"),
    ],
    "Request Received",
    "Xtop Retail Technologies"
  );
}
