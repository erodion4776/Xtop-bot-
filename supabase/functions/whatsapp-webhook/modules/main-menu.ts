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
    `I can help you explore our platforms, test live demos, play games, get instant quotations, use free tools, or connect with our team.\n\n` +
    `👇 *Select an option below to continue:*`;

  await sendListMessage(
    phone,
    body,
    "Main Menu",
    [
      {
        title: "Explore & Build",
        rows: [
          makeListRow("menu_products", "1️⃣ Our Products", "NaijaShop, Edvenia & more"),
          makeListRow("menu_services", "2️⃣ Our Services", "WhatsApp Bots & App Dev"),
          makeListRow("menu_demos", "3️⃣ 🎮 Demo Centre", "Try live automation demos"),
          makeListRow("menu_games", "4️⃣ Xtop Games", "Play trivia, math & more"),
        ],
      },
      {
        title: "Tools & Support",
        rows: [
          makeListRow("menu_tools", "5️⃣ Free Tools", "Weather, News, Calculator & more"),
          makeListRow("menu_magazine", "6️⃣ Product Magazine", "Download PDF catalogue"),
          makeListRow("menu_agent", "7️⃣ Talk to an Agent", "Get support & enquiries"),
          makeListRow("menu_sales", "8️⃣ Build a Project", "Get instant price quote"),
        ],
      },
    ],
    "Xtop Retail Technologies",
    "Sabi Digital Assistant"
  );
}
