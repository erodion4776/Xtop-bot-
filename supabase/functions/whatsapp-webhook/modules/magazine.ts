// supabase/functions/whatsapp-webhook/modules/magazine.ts

import {
  Contact,
  Conversation,
  getActiveMagazineConfig,
  updateConversation,
} from "../database.ts";
import {
  sendButtonMessage,
  sendDocumentMessage,
  sendTextMessage,
  makeButton,
} from "../whatsapp.ts";
import { normalise, isBack } from "../utils.ts";
import { showMainMenu } from "./main-menu.ts";

export async function handleMagazine(
  phone: string,
  text: string,
  contact: Contact,
  conversation: Conversation
): Promise<void> {
  const n = normalise(text);

  if (isBack(text) || n === "mag_back_menu") {
    await showMainMenu(phone, conversation.id);
    return;
  }

  if (n === "mag_act_agent" || n.includes("agent")) {
    await updateConversation(conversation.id, {
      current_module: "AGENT",
      current_state: "COLLECT_MESSAGE",
      context_json: { request_type: "PRODUCT_QUESTION", preset_message: "Enquiry from Product Magazine reader" },
    });
    await sendTextMessage(
      phone,
      "👤 *Talk to an Agent*\n\nPlease enter your question regarding our products or engineering services:"
    );
    return;
  }

  if (n === "mag_act_products" || n.includes("product")) {
    const { showProductsList } = await import("./products.ts");
    await showProductsList(phone, conversation.id);
    return;
  }

  await displayMagazine(phone, conversation.id);
}

export async function displayMagazine(phone: string, conversationId: string): Promise<void> {
  const mag = await getActiveMagazineConfig();

  await updateConversation(conversationId, {
    current_module: "MAGAZINE",
    current_state: "SHOWING_MAGAZINE",
    context_json: {},
  });

  if (!mag || !mag.file_url || !mag.file_url.startsWith("http")) {
    const fallbackMessage =
      `📖 *Xtop Retail Technologies — Digital Magazine*\n\n` +
      `Our official product catalogue and engineering portfolio is currently being updated for the current quarter.\n\n` +
      `Please talk to an agent or explore our live products and demos below:`;

    await sendButtonMessage(
      phone,
      fallbackMessage,
      [
        makeButton("mag_act_products", "📦 Our Products"),
        makeButton("mag_act_agent", "👤 Talk to an Agent"),
        makeButton("mag_back_menu", "🔙 Main Menu"),
      ],
      "Xtop Digital Magazine",
      "Xtop Retail Technologies"
    );
    return;
  }

  // If valid PDF URL exists, send the document directly
  await sendTextMessage(
    phone,
    `📖 *${mag.title}*\n\n${mag.description}\n\n_Sending document directly to your WhatsApp..._`
  );

  await sendDocumentMessage(
    phone,
    mag.file_url,
    "Xtop-Retail-Technologies-Magazine.pdf",
    mag.title
  );

  await sendButtonMessage(
    phone,
    "Would you like to start a project or speak with an engineer?",
    [
      makeButton("mag_act_products", "📦 Explore Products"),
      makeButton("mag_act_agent", "👤 Talk to an Agent"),
      makeButton("mag_back_menu", "🔙 Main Menu"),
    ],
    "Catalogue Delivered",
    "Powered by Sabi"
  );
}
