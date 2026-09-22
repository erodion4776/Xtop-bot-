// supabase/functions/whatsapp-webhook/router.ts

import {
  Contact,
  Conversation,
  getOrCreateContact,
  getOrCreateConversation,
  updateConversation,
  storeMessage,
} from "./database.ts";
import { IncomingMessage, sendTextMessage } from "./whatsapp.ts";
import {
  sanitizeInput,
  isGreeting,
  isBack,
  isHelp,
  isAgentRequest,
  isExit,
  safeErrorLog,
} from "./utils.ts";
import { showMainMenu, resolveMainMenuSelection } from "./modules/main-menu.ts";
import { handleProducts } from "./modules/products.ts";
import { handleSalesBot, handleSalesWebsite, handleSalesBotWebsite, handleSalesAutomation } from "./modules/sales.ts";
import { handleDemos } from "./modules/demos.ts";
import { handleMagazine } from "./modules/magazine.ts";
import { handleAgent } from "./modules/agents.ts";
import { handleLearning } from "./modules/learning.ts";
import { handleExams } from "./modules/exams.ts";

/**
 * Main message router.
 *
 * 1. Load/create contact
 * 2. Load/create conversation state
 * 3. Store inbound message
 * 4. Check global commands (menu, back, help, agent, exit)
 * 5. Route based on current_module
 * 6. Store outbound message
 */
export async function routeMessage(incoming: IncomingMessage): Promise<void> {
  const phone = incoming.from;
  const rawText = incoming.text;
  const text = sanitizeInput(rawText);
  const interactiveId = incoming.interactiveId;

  if (!text && !interactiveId) {
    // Non-text message types we don't handle yet (image, audio, etc.)
    await sendTextMessage(
      phone,
      "I can currently process text messages and menu selections. Please type your message or choose an option."
    );
    return;
  }

  try {
    // ── Step 1: Contact ──────────────────────────────
    const contact = await getOrCreateContact(phone, incoming.profileName);

    // ── Step 2: Conversation ─────────────────────────
    const conversation = await getOrCreateConversation(contact.id);

    // ── Step 3: Store inbound message ────────────────
    await storeMessage(
      contact.id,
      "INBOUND",
      incoming.type,
      text || interactiveId || null,
      incoming.messageId
    );

    // ── Step 4: Global commands ──────────────────────
    if (isGreeting(text) || isHelp(text)) {
      await showMainMenu(phone, conversation.id);
      return;
    }

    if (isExit(text)) {
      await updateConversation(conversation.id, {
        current_module: "MAIN_MENU",
        current_state: "IDLE",
        context_json: {},
      });
      await sendTextMessage(
        phone,
        `👋 Thank you for chatting with Xtop Retail Technologies, ${contact.name || ""}.\n\nType *hi* anytime to start again.`
      );
      return;
    }

    if (isAgentRequest(text)) {
      await handleAgent(phone, text, contact, conversation);
      return;
    }

    // ── Step 5: Route by current module ──────────────
    const currentModule = conversation.current_module;

    switch (currentModule) {
      case "MAIN_MENU": {
        // Check if user is selecting from the menu
        const resolved = resolveMainMenuSelection(text, interactiveId);

        if (resolved) {
          // Route to the resolved module
          await routeToModule(resolved, phone, text, contact, conversation);
        } else if (isBack(text)) {
          await showMainMenu(phone, conversation.id);
        } else {
          // Unknown input at main menu — show menu again
          await sendTextMessage(
            phone,
            "I didn't quite catch that. Let me show you the menu again."
          );
          await showMainMenu(phone, conversation.id);
        }
        break;
      }

      case "PRODUCTS":
        if (isBack(text)) {
          await showMainMenu(phone, conversation.id);
        } else {
          await handleProducts(phone, text, contact, conversation);
        }
        break;

      case "SALES_BOT":
        if (isBack(text)) {
          await showMainMenu(phone, conversation.id);
        } else {
          await handleSalesBot(phone, text, contact, conversation);
        }
        break;

      case "SALES_WEBSITE":
        if (isBack(text)) {
          await showMainMenu(phone, conversation.id);
        } else {
          await handleSalesWebsite(phone, text, contact, conversation);
        }
        break;

      case "SALES_BOT_WEBSITE":
        if (isBack(text)) {
          await showMainMenu(phone, conversation.id);
        } else {
          await handleSalesBotWebsite(phone, text, contact, conversation);
        }
        break;

      case "SALES_AUTOMATION":
        if (isBack(text)) {
          await showMainMenu(phone, conversation.id);
        } else {
          await handleSalesAutomation(phone, text, contact, conversation);
        }
        break;

      case "DEMOS":
        if (isBack(text)) {
          await showMainMenu(phone, conversation.id);
        } else {
          await handleDemos(phone, text, contact, conversation);
        }
        break;

      case "MAGAZINE":
        if (isBack(text)) {
          await showMainMenu(phone, conversation.id);
        } else {
          await handleMagazine(phone, text, contact, conversation);
        }
        break;

      case "AGENT":
        if (isBack(text) || isGreeting(text)) {
          await showMainMenu(phone, conversation.id);
        } else {
          // User sent another message while waiting for agent
          await sendTextMessage(
            phone,
            "An agent will be with you shortly. Type *menu* to return to the main menu."
          );
        }
        break;

      case "LEARNING":
        if (isBack(text)) {
          await showMainMenu(phone, conversation.id);
        } else {
          await handleLearning(phone, text, contact, conversation);
        }
        break;

      case "EXAMS":
        if (isBack(text)) {
          await showMainMenu(phone, conversation.id);
        } else {
          await handleExams(phone, text, contact, conversation);
        }
        break;

      default:
        // Unknown state — reset to main menu
        await showMainMenu(phone, conversation.id);
        break;
    }
  } catch (err) {
    safeErrorLog("routeMessage", err);
    await sendTextMessage(
      phone,
      "Sorry, I'm having trouble processing that right now. Please type *menu* for options or *agent* to speak with our team."
    );
  }
}

/**
 * Route to a specific module and update conversation state.
 */
async function routeToModule(
  module: string,
  phone: string,
  text: string,
  contact: Contact,
  conversation: Conversation
): Promise<void> {
  // Update conversation state to the new module
  await updateConversation(conversation.id, {
    current_module: module,
    current_state: "ENTRY",
    context_json: {},
  });

  // Refresh conversation with new state
  const updatedConversation: Conversation = {
    ...conversation,
    current_module: module,
    current_state: "ENTRY",
    context_json: {},
  };

  switch (module) {
    case "PRODUCTS":
      await handleProducts(phone, text, contact, updatedConversation);
      break;
    case "SALES_BOT":
      await handleSalesBot(phone, text, contact, updatedConversation);
      break;
    case "SALES_WEBSITE":
      await handleSalesWebsite(phone, text, contact, updatedConversation);
      break;
    case "SALES_BOT_WEBSITE":
      await handleSalesBotWebsite(phone, text, contact, updatedConversation);
      break;
    case "SALES_AUTOMATION":
      await handleSalesAutomation(phone, text, contact, updatedConversation);
      break;
    case "DEMOS":
      await handleDemos(phone, text, contact, updatedConversation);
      break;
    case "MAGAZINE":
      await handleMagazine(phone, text, contact, updatedConversation);
      break;
    case "AGENT":
      await handleAgent(phone, text, contact, updatedConversation);
      break;
    case "LEARNING":
      await handleLearning(phone, text, contact, updatedConversation);
      break;
    default:
      await showMainMenu(phone, conversation.id);
      break;
  }
}
