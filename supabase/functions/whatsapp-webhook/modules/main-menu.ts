// supabase/functions/whatsapp-webhook/modules/main-menu.ts

import { Conversation, Contact, updateConversation } from "../database.ts";
import {
  sendTextMessage,
  sendListMessage,
  makeListRow,
} from "../whatsapp.ts";
import { extractSelection, normalise, isAgentRequest } from "../utils.ts";

/**
 * Show the main Sabi menu using a WhatsApp interactive list.
 */
export async function showMainMenu(phone: string, conversationId: string): Promise<void> {
  // Update state
  await updateConversation(conversationId, {
    current_module: "MAIN_MENU",
    current_state: "SHOWING_MENU",
    context_json: {},
  });

  const body = `👋 Welcome to *Xtop Retail Technologies*.\n\nI'm *Sabi*, your AI assistant.\n\nI can help you explore our products, see working demos, or start a project.\n\nPlease select an option below:`;

  await sendListMessage(
    phone,
    body,
    "View Options",
    [
      {
        title: "Products & Services",
        rows: [
          makeListRow("menu_products", "Our Products", "XtopEdu, NaijaShop & more"),
          makeListRow("menu_bot", "Build a WhatsApp Bot", "Custom AI-powered bots"),
          makeListRow("menu_website", "Build a Website", "Professional business sites"),
          makeListRow("menu_bot_website", "Bot + Website", "Combined package deal"),
          makeListRow("menu_automation", "AI & Automation", "Business process automation"),
        ],
      },
      {
        title: "Explore & Support",
        rows: [
          makeListRow("menu_demos", "View Our Demos", "Try live demo bots"),
          makeListRow("menu_magazine", "Product Magazine", "Browse our catalogue"),
          makeListRow("menu_agent", "Talk to an Agent", "Get human assistance"),
          makeListRow("menu_learning", "Learning Centre", "Engr. Ero courses"),
        ],
      },
    ],
    "Xtop Retail Technologies",
    "Powered by Sabi AI"
  );
}

/**
 * Handle a selection from the main menu.
 * Returns the module name to route to, or null if not recognized.
 */
export function resolveMainMenuSelection(
  text: string,
  interactiveId?: string
): string | null {
  // First check interactive button/list IDs
  if (interactiveId) {
    const idMap: Record<string, string> = {
      menu_products: "PRODUCTS",
      menu_bot: "SALES_BOT",
      menu_website: "SALES_WEBSITE",
      menu_bot_website: "SALES_BOT_WEBSITE",
      menu_automation: "SALES_AUTOMATION",
      menu_demos: "DEMOS",
      menu_magazine: "MAGAZINE",
      menu_agent: "AGENT",
      menu_learning: "LEARNING",
    };
    if (idMap[interactiveId]) return idMap[interactiveId];
  }

  // Check numeric selection
  const num = extractSelection(text);
  if (num) {
    const numMap: Record<number, string> = {
      1: "PRODUCTS",
      2: "SALES_BOT",
      3: "SALES_WEBSITE",
      4: "SALES_BOT_WEBSITE",
      5: "SALES_AUTOMATION",
      6: "DEMOS",
      7: "MAGAZINE",
      8: "AGENT",
      9: "LEARNING",
    };
    if (numMap[num]) return numMap[num];
  }

  // Check text-based selections
  const n = normalise(text);

  if (n.includes("product")) return "PRODUCTS";
  if (n.includes("bot") && n.includes("website")) return "SALES_BOT_WEBSITE";
  if (n.includes("bot") || n.includes("whatsapp bot")) return "SALES_BOT";
  if (n.includes("website") || n.includes("site")) return "SALES_WEBSITE";
  if (n.includes("automat") || n.includes("ai")) return "SALES_AUTOMATION";
  if (n.includes("demo")) return "DEMOS";
  if (n.includes("magazine") || n.includes("catalogue") || n.includes("catalog")) return "MAGAZINE";
  if (isAgentRequest(text)) return "AGENT";
  if (n.includes("learn") || n.includes("course") || n.includes("engr")) return "LEARNING";

  return null;
}
