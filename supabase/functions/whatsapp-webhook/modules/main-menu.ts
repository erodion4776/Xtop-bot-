// supabase/functions/whatsapp-webhook/modules/main-menu.ts

import { updateConversation } from "../database.ts";
import { sendListMessage, makeListRow } from "../whatsapp.ts";

export async function showMainMenu(phone: string, conversationId: string): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "MAIN_MENU",
    current_state: "SHOWING_MENU",
    context_json: {},
  });

  const body = `👋 Welcome to *Xtop Retail Technologies*.\n\nI'm *Sabi*, your digital assistant.\n\nI can help you explore our platforms, view live interactive demos, get project quotations, or speak directly with our team.\n\n👇 *Select an option below to continue:*`;

  await sendListMessage(
    phone,
    body,
    "Main Menu",
    [
      {
        title: "Explore & Build",
        rows: [
          makeListRow("menu_products", "1️⃣ Our Products", "XtopEdu & NaijaShop.com"),
          makeListRow("menu_services", "2️⃣ Our Services", "WhatsApp Bots, Websites & ERP"),
          makeListRow("menu_demos", "3️⃣ View Our Demos", "10 Live interactive bot demos"),
          makeListRow("menu_magazine", "4️⃣ Product Magazine", "Digital product catalogue"),
          makeListRow("menu_agent", "5️⃣ Talk to an Agent", "Consultations & custom quotes"),
          makeListRow("menu_learning", "6️⃣ Learning Centre", "Engr. Ero academic portal"),
        ],
      },
    ],
    "Xtop Retail Technologies",
    "Sabi Digital Assistant"
  );
}
