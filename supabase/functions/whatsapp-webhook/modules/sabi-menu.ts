// supabase/functions/whatsapp-webhook/modules/sabi-menu.ts

import { updateConversation } from "../database.ts";
import {
  sendListMessage,
  makeListRow,
} from "../whatsapp.ts";

/**
 * Main Sabi by XTOP gateway.
 *
 * This menu is separate from the existing XTOP Retail menu.
 * It is the entry point for Sabi's WhatsApp experiences.
 */
export async function showSabiWelcomeMenu(
  phone: string,
  conversationId: string,
): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "SABI_GATEWAY",
    current_state: "SHOWING_WELCOME",
    context_json: {
      sabi_gateway: true,
    },
  });

  const body =
    `👋 Hello and welcome to *Sabi by XTOP*!\\n\\n` +
    `Your smart WhatsApp business assistant.\\n\\n` +
    `You can explore a sample WhatsApp shop, register your business, or learn how Sabi helps businesses serve customers and manage orders.\\n\\n` +
    `👇 *What would you like to do?*`;

  await sendListMessage(
    phone,
    body,
    "Explore Sabi",
    [
      {
        title: "Discover Sabi",
        rows: [
          makeListRow(
            "sabi_demo",
            "🛍️ Try Shop Demo",
            "Experience shopping inside WhatsApp",
          ),
          makeListRow(
            "sabi_register",
            "🏪 Register My Business",
            "Set up your business on Sabi",
          ),
          makeListRow(
            "sabi_about",
            "ℹ️ Learn About Sabi",
            "Discover how Sabi works",
          ),
          makeListRow(
            "sabi_support",
            "💬 Contact Support",
            "Get help from the Sabi team",
          ),
        ],
      },
    ],
    "Sabi by XTOP",
    "Smart business. Simple WhatsApp.",
  );
}
