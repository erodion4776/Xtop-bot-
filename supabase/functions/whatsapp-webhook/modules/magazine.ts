// supabase/functions/whatsapp-webhook/modules/magazine.ts
// Xtop Official Product Magazine & Catalogue Download (Menu Option 7)

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
  conversation: Conversation,
  interactiveId?: string
): Promise<void> {
  const raw = (interactiveId || text || "").trim();
  const n = normalise(raw);

  if (isBack(raw) || n === "cat_mag_back" || n === "main menu" || n === "menu_home") {
    await updateConversation(conversation.id, {
      current_module: "MAIN_MENU",
      current_state: "IDLE",
      context_json: {},
    });
    await showMainMenu(phone, conversation.id);
    return;
  }

  if (raw === "cat_mag_agent" || n.includes("agent")) {
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

  if (raw === "cat_mag_products" || n.includes("product")) {
    const { showProductsList } = await import("./products.ts");
    await showProductsList(phone, conversation.id);
    return;
  }

  await displayMagazine(phone, conversation.id);
}

export async function displayMagazine(phone: string, conversationId: string): Promise<void> {
  const mag = await getActiveMagazineConfig();

  await updateConversation(conversationId, {
    current_module: "MAGAZINE_CATALOG",
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
        makeButton("cat_mag_products", "📦 Our Products"),
        makeButton("cat_mag_agent", "👤 Talk to an Agent"),
        makeButton("cat_mag_back", "🔙 Main Menu"),
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

  try {
    await sendDocumentMessage(
      phone,
      mag.file_url,
      "Xtop-Retail-Technologies-Magazine.pdf",
      mag.title
    );
  } catch (_) {
    await sendTextMessage(phone, `📄 *Download link:*\n${mag.file_url}`);
  }

  await sendButtonMessage(
    phone,
    "Would you like to start a project or speak with an engineer?",
    [
      makeButton("cat_mag_products", "📦 Explore Products"),
      makeButton("cat_mag_agent", "👤 Talk to an Agent"),
      makeButton("cat_mag_back", "🔙 Main Menu"),
    ],
    "Catalogue Delivered",
    "Powered by Sabi"
  );
}
