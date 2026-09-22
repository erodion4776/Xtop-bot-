// supabase/functions/whatsapp-webhook/modules/agents.ts

import {
  Contact,
  Conversation,
  createAgentRequest,
  updateConversation,
  AgentRequest,
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

export async function handleAgent(
  phone: string,
  text: string,
  contact: Contact,
  conversation: Conversation
): Promise<void> {
  const state = conversation.current_state;
  const context = conversation.context_json as {
    request_type?: AgentRequest["request_type"];
    preset_message?: string;
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

export async function showAgentCategories(phone: string, conversationId: string): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "AGENT",
    current_state: "SELECT_TYPE",
    context_json: {},
  });

  const body =
    `👤 *Talk to an Agent*\n\n` +
    `Our technical consulting and project management team is ready to assist you.\n\n` +
    `👇 *How can our team help you today?*`;

  await sendListMessage(
    phone,
    body,
    "Select Department",
    [
      {
        title: "Enquiry Types",
        rows: [
          makeListRow("agt_type_project", "1️⃣ Start a Project", "Build a Bot, Web, or ERP"),
          makeListRow("agt_type_quote", "2️⃣ Request a Quotation", "Get a detailed price estimate"),
          makeListRow("agt_type_product", "3️⃣ Product Question", "Questions on XtopEdu / NaijaShop"),
          makeListRow("agt_type_support", "4️⃣ Technical Support", "Existing customer assistance"),
          makeListRow("agt_type_general", "5️⃣ General Enquiry", "Partnerships & questions"),
        ],
      },
    ],
    "Xtop Retail Support",
    "Direct Human Escalation"
  );
}

async function processAgentCategorySelection(
  phone: string,
  text: string,
  conversation: Conversation
): Promise<void> {
  const n = normalise(text);
  let requestType: AgentRequest["request_type"] = "GENERAL_ENQUIRY";

  if (n === "agt_type_project" || n.includes("start a project") || n === "1") {
    requestType = "START_PROJECT";
  } else if (n === "agt_type_quote" || n.includes("quotation") || n === "2") {
    requestType = "QUOTATION";
  } else if (n === "agt_type_product" || n.includes("product question") || n === "3") {
    requestType = "PRODUCT_QUESTION";
  } else if (n === "agt_type_support" || n.includes("technical support") || n === "4") {
    requestType = "TECH_SUPPORT";
  } else if (n === "agt_type_general" || n.includes("general") || n === "5") {
    requestType = "GENERAL_ENQUIRY";
  } else {
    const num = extractSelection(text);
    if (num === 1) requestType = "START_PROJECT";
    else if (num === 2) requestType = "QUOTATION";
    else if (num === 3) requestType = "PRODUCT_QUESTION";
    else if (num === 4) requestType = "TECH_SUPPORT";
    else if (num === 5) requestType = "GENERAL_ENQUIRY";
    else {
      await sendTextMessage(phone, "Please select one of the support options from the menu.");
      await showAgentCategories(phone, conversation.id);
      return;
    }
  }

  await updateConversation(conversation.id, {
    current_module: "AGENT",
    current_state: "COLLECT_MESSAGE",
    context_json: { request_type: requestType },
  });

  const promptMap: Record<AgentRequest["request_type"], string> = {
    START_PROJECT: "🚀 *Start a Project*\n\nPlease describe what you would like built, your business type, and target timeline:",
    QUOTATION: "📋 *Request a Quotation*\n\nPlease provide your business name and the specific features or software you require a quote for:",
    PRODUCT_QUESTION: "❓ *Product Question*\n\nWhich product do you have a question about (XtopEdu, NaijaShop, or custom bots), and what would you like to know?",
    TECH_SUPPORT: "🛠️ *Technical Support Desk*\n\nPlease describe the issue you are experiencing in detail. Include any relevant account names:",
    GENERAL_ENQUIRY: "💬 *General Enquiry*\n\nPlease type your message or enquiry below:",
  };

  await sendTextMessage(phone, promptMap[requestType]);
}

async function processAgentMessageSubmission(
  phone: string,
  text: string,
  contact: Contact,
  conversation: Conversation,
  requestType: AgentRequest["request_type"]
): Promise<void> {
  const priority = requestType === "TECH_SUPPORT" ? "HIGH" : "NORMAL";

  const record = await createAgentRequest(contact.id, requestType, text, priority);

  await updateConversation(conversation.id, {
    current_module: "MAIN_MENU",
    current_state: "IDLE",
    context_json: { lastRequestId: record?.id },
  });

  const ticketRef = record?.id ? `#REQ-${record.id.substring(0, 8).toUpperCase()}` : "#REQ-RECEIVED";

  const confirmationMessage =
    `✅ *Your request has been logged successfully!*\n\n` +
    `*Reference Ticket:* \`${ticketRef}\`\n` +
    `*Department:* ${requestType.replace("_", " ")}\n` +
    `*Status:* Queued for Agent Review\n\n` +
    `An Xtop Retail Technologies team member will follow up with you on WhatsApp shortly.\n\n` +
    `_Type *menu* anytime to explore other options._`;

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
