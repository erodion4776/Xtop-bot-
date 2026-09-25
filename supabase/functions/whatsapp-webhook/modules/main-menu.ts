// supabase/functions/whatsapp-webhook/modules/main-menu.ts
// Phase 1 — Public Xtop Retail Technologies Main Menu

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
    `I can help you explore our web platforms, test live demos, generate instant project quotations, or connect with our engineering team.\n\n` +
    `👇 *Select an option below to continue:*`;

  await sendListMessage(
    phone, body, "Main Menu",
    [
      {
        title: "Explore & Build",
        rows: [
          makeListRow("menu_products", "1️⃣ Our Products", "NaijaShop, Edvenia & more"),
          makeListRow("menu_services", "2️⃣ Our Services", "WhatsApp Bots & App Dev"),
          makeListRow("menu_demos", "3️⃣ View Live Demos", "Test our interactive bots"),
          makeListRow("menu_magazine", "4️⃣ Product Magazine", "Download PDF catalogue"),
          makeListRow("menu_agent", "5️⃣ Talk to an Agent", "Get support & enquiries"),
          makeListRow("menu_sales", "🛠️ Build a Project", "Get instant price quote"),
        ],
      },
    ],
    "Xtop Retail Technologies", "Sabi Digital Assistant"
  );
}
