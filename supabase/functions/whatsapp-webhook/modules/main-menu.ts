// supabase/functions/whatsapp-webhook/modules/main-menu.ts

import { updateConversation } from "../database.ts";
import { sendListMessage, makeListRow } from "../whatsapp.ts";

export async function showMainMenu(phone: string, conversationId: string): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "MAIN_MENU",
    current_state: "SHOWING_MENU",
    context_json: {},
  });

  const body =
    `👋 Welcome to *Xtop Retail Technologies*.\n\n` +
    `I'm *Sabi*, your digital assistant.\n\n` +
    `I can help you explore our platforms, view live demos, get instant project quotations, or speak with our team.\n\n` +
    `👇 *Select an option below to continue:*`;

  await sendListMessage(
    phone, body, "Main Menu",
    [
      {
        title: "Explore & Build",
        rows: [
          makeListRow("menu_products", "1️⃣ Our Products", "XtopEdu & NaijaShop"),
          makeListRow("menu_services", "2️⃣ Our Services", "WhatsApp Bots, Websites & more"),
          makeListRow("menu_demos", "3️⃣ View Our Demos", "10 live interactive demos"),
          makeListRow("menu_magazine", "4️⃣ Product Magazine", "Digital catalogue"),
          makeListRow("menu_agent", "5️⃣ Talk to an Agent", "Get help & quotes"),
          makeListRow("menu_learning", "6️⃣ Learning Centre", "Engr. Ero courses"),
          makeListRow("menu_sales", "🛠️ Build a Project", "Get instant quotation"),
        ],
      },
    ],
    "Xtop Retail Technologies", "Sabi Digital Assistant"
  );
}
