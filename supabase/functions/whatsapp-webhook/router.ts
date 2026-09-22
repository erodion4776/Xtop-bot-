// supabase/functions/whatsapp-webhook/router.ts

import {
  Contact, Conversation,
  getOrCreateContact, getOrCreateConversation,
  updateConversation, storeMessage,
} from "./database.ts";
import { IncomingMessage, sendTextMessage } from "./whatsapp.ts";
import {
  sanitizeInput, isGreeting, isBack, isHelp,
  isAgentRequest, isExit, detectIntent, safeErrorLog,
} from "./utils.ts";
import { showMainMenu } from "./modules/main-menu.ts";
import { handleProducts, showProductsList } from "./modules/products.ts";
import { handleServices, showServicesList } from "./modules/services.ts";
import { handleDemos, showDemosList } from "./modules/demos.ts";
import { handleMagazine, displayMagazine } from "./modules/magazine.ts";
import { handleAgent, showAgentCategories } from "./modules/agents.ts";
import { handleLearning } from "./modules/learning.ts";
import { handleSales, showServiceTypeSelector } from "./modules/sales.ts";
import { handleExams } from "./modules/exams.ts";

export async function routeMessage(incoming: IncomingMessage): Promise<void> {
  const phone = incoming.from;
  const text = sanitizeInput(incoming.text);
  const interactiveId = incoming.interactiveId;

  if (!text && !interactiveId) {
    await sendTextMessage(phone,
      "👋 Hello! Please send a text message or choose an option from the menu.\n\nType *menu* to view all services."
    );
    return;
  }

  try {
    const contact = await getOrCreateContact(phone, incoming.profileName);
    const conversation = await getOrCreateConversation(contact.id);

    await storeMessage(
      contact.id, "INBOUND", incoming.type,
      text || interactiveId || null, incoming.messageId
    );

    // Global interrupts — bypass if currently in active CBT exam or Sales flow
    if ((isGreeting(text) || isHelp(text) || text === "menu_home")
        && !["SALES", "EXAMS"].includes(conversation.current_module)) {
      await showMainMenu(phone, conversation.id);
      return;
    }

    if (isExit(text) && !["SALES", "EXAMS"].includes(conversation.current_module)) {
      await updateConversation(conversation.id, {
        current_module: "MAIN_MENU", current_state: "IDLE", context_json: {},
      });
      await sendTextMessage(phone,
        `👋 Thank you for contacting *Xtop Retail Technologies*, ${contact.name || ""}.\n\nType *hi* or *menu* to return anytime.`
      );
      return;
    }

    // Agent shortcut
    if (isAgentRequest(text)
        && !["AGENT", "SALES", "EXAMS"].includes(conversation.current_module)) {
      await showAgentCategories(phone, conversation.id);
      return;
    }

    const currentModule = conversation.current_module;

    switch (currentModule) {
      case "MAIN_MENU": {
        const intent = detectIntent(text, interactiveId);
        if (intent === "PRODUCTS") await showProductsList(phone, conversation.id);
        else if (intent === "SERVICES") await showServicesList(phone, conversation.id);
        else if (intent === "DEMOS") await showDemosList(phone, conversation.id);
        else if (intent === "MAGAZINE") await displayMagazine(phone, conversation.id);
        else if (intent === "AGENT") await showAgentCategories(phone, conversation.id);
        else if (intent === "LEARNING") await handleLearning(phone, text, contact, conversation);
        else if (intent === "SALES") await showServiceTypeSelector(phone, conversation.id);
        else if (isBack(text)) await showMainMenu(phone, conversation.id);
        else {
          await sendTextMessage(phone, "Please select an option from the menu below:");
          await showMainMenu(phone, conversation.id);
        }
        break;
      }

      case "PRODUCTS":
        await handleProducts(phone, text, contact, conversation);
        break;

      case "SERVICES":
        await handleServices(phone, text, contact, conversation);
        break;

      case "DEMOS":
        await handleDemos(phone, text, contact, conversation);
        break;

      case "MAGAZINE":
        await handleMagazine(phone, text, contact, conversation);
        break;

      case "AGENT":
        await handleAgent(phone, text, contact, conversation);
        break;

      case "LEARNING":
        await handleLearning(phone, text, contact, conversation);
        break;

      case "SALES":
        await handleSales(phone, text, contact, conversation);
        break;

      case "EXAMS":
        await handleExams(phone, text, contact, conversation);
        break;

      default:
        await showMainMenu(phone, conversation.id);
        break;
    }
  } catch (err) {
    safeErrorLog("routeMessage", err);
    await sendTextMessage(phone,
      "Sorry, an error occurred. Type *menu* to return to the home screen."
    );
  }
}
