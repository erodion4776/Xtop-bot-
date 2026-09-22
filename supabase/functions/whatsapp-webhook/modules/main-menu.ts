// supabase/functions/whatsapp-webhook/modules/main-menu.ts

import { updateConversation } from "../database.ts";
import { sendListMessage, makeListRow } from "../whatsapp.ts";

/**
 * Display the main Sabi menu using WhatsApp interactive lists.
 */
export async function showMainMenu(phone: string, conversationId: string): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "MAIN_MENU",
    current_state: "SHOWING_MENU",
    context_json: {},
  });

  const body = `👋 Welcome to *Xtop Retail Technologies*.\n\nI'm *Sabi*, your automated assistant.\n\nI can help you explore our products, see live working demos, get project estimates, or access the learning centre.\n\n👇 Select an option below to continue:`;

  await sendListMessage(
    phone,
    body,
    "Explore Options",
    [
      {
        title: "📦 Products & Software",
        rows: [
          makeListRow("menu_products", "Our Products", "XtopEdu, NaijaShop.com"),
          makeListRow("menu_bot", "Build a WhatsApp Bot", "Automated customer bots"),
          makeListRow("menu_website", "Build a Website", "Business & ecommerce sites"),
          makeListRow("menu_bot_website", "Bot + Website Combo", "Complete digital presence"),
          makeListRow("menu_automation", "AI & Automation", "Workflow automation"),
        ],
      },
      {
        title: "🎯 Demos & Information",
        rows: [
          makeListRow("menu_demos", "View Our Demos", "10+ live interactive demos"),
          makeListRow("menu_magazine", "Product Magazine", "Digital product catalogue"),
          makeListRow("menu_agent", "Talk to an Agent", "Human support & quotes"),
          makeListRow("menu_learning", "Learning Centre", "Engr. Ero courses"),
        ],
      },
    ],
    "Xtop Retail Technologies",
    "Sabi Automated Engine"
  );
}
