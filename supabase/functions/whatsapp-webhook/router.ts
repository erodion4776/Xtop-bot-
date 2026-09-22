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
  detectIntent,
  safeErrorLog,
} from "./utils.ts";
import { showMainMenu } from "./modules/main-menu.ts";
import { handleProducts } from "./modules/products.ts";
import {
  handleSalesBot,
  handleSalesWebsite,
  handleSalesBotWebsite,
  handleSalesAutomation,
} from "./modules/sales.ts";
import { handleDemos } from "./modules/demos.ts";
import { handleMagazine } from "./modules/magazine.ts";
import { handleAgent } from "./modules/agents.ts";
import { handleLearning } from "./modules/learning.ts";
import { handleExams } from "./modules/exams.ts";

/**
 * Main Deterministic Router.
 */
export async function routeMessage(incoming: IncomingMessage): Promise<void> {
  const phone = incoming.from;
  const text = sanitizeInput(incoming.text);
  const interactiveId = incoming.interactiveId;

  if (!text && !interactiveId) {
    await sendTextMessage(
      phone,
      "👋 Hello! Please send a text message or choose an option from the menu.\n\nType *menu* to view all services."
    );
    return;
  }

  try {
    // 1. Contact & State Management
    const contact = await getOrCreateContact(phone, incoming.profileName);
    const conversation = await getOrCreateConversation(contact.id);

    // 2. Persist Inbound Message
    await storeMessage(
      contact.id,
      "INBOUND",
      incoming.type,
      text || interactiveId || null,
      incoming.messageId
    );

    // 3. Global Intercepts (Available anywhere)
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
        `👋 Thank you for visiting *Xtop Retail Technologies*, ${contact.name || ""}.\n\nWhenever you are ready to continue, simply type *hi* or *menu*. Have a productive day!`
      );
      return;
    }

    if (isAgentRequest(text)) {
      await handleAgent(phone, text, contact, conversation);
      return;
    }

    // 4. Module State Machine Routing
    const currentModule = conversation.current_module;

    switch (currentModule) {
      case "MAIN_MENU": {
        const intent = detectIntent(text, interactiveId);

        if (intent !== "UNKNOWN" && intent !== "MENU") {
          await routeToModule(intent, phone, text, contact, conversation);
        } else if (isBack(text)) {
          await showMainMenu(phone, conversation.id);
        } else {
          await sendTextMessage(
            phone,
            "I didn't quite understand that selection. Let me show you the menu options below:"
          );
          await showMainMenu(phone, conversation.id);
        }
        break;
      }

      case "PRODUCTS":
        if (isBack(text)) await showMainMenu(phone, conversation.id);
        else await handleProducts(phone, text, contact, conversation);
        break;

      case "SALES_BOT":
        if (isBack(text)) await showMainMenu(phone, conversation.id);
        else await handleSalesBot(phone, text, contact, conversation);
        break;

      case "SALES_WEBSITE":
        if (isBack(text)) await showMainMenu(phone, conversation.id);
        else await handleSalesWebsite(phone, text, contact, conversation);
        break;

      case "SALES_BOT_WEBSITE":
        if (isBack(text)) await showMainMenu(phone, conversation.id);
        else await handleSalesBotWebsite(phone, text, contact, conversation);
        break;

      case "SALES_AUTOMATION":
        if (isBack(text)) await showMainMenu(phone, conversation.id);
        else await handleSalesAutomation(phone, text, contact, conversation);
        break;

      case "DEMOS":
        if (isBack(text)) await showMainMenu(phone, conversation.id);
        else await handleDemos(phone, text, contact, conversation);
        break;

      case "MAGAZINE":
        if (isBack(text)) await showMainMenu(phone, conversation.id);
        else await handleMagazine(phone, text, contact, conversation);
        break;

      case "AGENT":
        if (isBack(text) || isGreeting(text)) {
          await showMainMenu(phone, conversation.id);
        } else {
          await sendTextMessage(
            phone,
            "An Xtop agent has been notified and will reach out to you shortly.\n\nType *menu* to return to the main options."
          );
        }
        break;

      case "LEARNING":
        if (isBack(text)) await showMainMenu(phone, conversation.id);
        else await handleLearning(phone, text, contact, conversation);
        break;

      case "EXAMS":
        if (isBack(text)) await showMainMenu(phone, conversation.id);
        else await handleExams(phone, text, contact, conversation);
        break;

      default:
        await showMainMenu(phone, conversation.id);
        break;
    }
  } catch (err) {
    safeErrorLog("routeMessage", err);
    await sendTextMessage(
      phone,
      "Sorry, something went wrong processing your request. Please type *menu* or *agent* to speak with our team."
    );
  }
}

/**
 * Module Switcher.
 */
async function routeToModule(
  module: string,
  phone: string,
  text: string,
  contact: Contact,
  conversation: Conversation
): Promise<void> {
  await updateConversation(conversation.id, {
    current_module: module,
    current_state: "ENTRY",
    context_json: {},
  });

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
