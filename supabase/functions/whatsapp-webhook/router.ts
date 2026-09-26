// supabase/functions/whatsapp-webhook/router.ts
import { handleAbout, showAboutMenu } from "./modules/about.ts";
import {
  Contact, Conversation,
  getOrCreateContact, getOrCreateConversation,
  updateConversation, storeMessage, getSupabaseClient
} from "./database.ts";
import { IncomingMessage, sendTextMessage } from "./whatsapp.ts";
import {
  sanitizeInput, isGreeting, isBack, isHelp,
  isAgentRequest, isExit, detectIntent, isLearningKeyword, safeErrorLog,
} from "./utils.ts";
import { showMainMenu } from "./modules/main-menu.ts";
import { handleProducts, showProductsList } from "./modules/products.ts";
import { handleServices, showServicesList } from "./modules/services.ts";
import { handleDemos, showDemosList, showDemoCentreMenu } from "./modules/demos/index.ts";
import { handleMagazine, displayMagazine } from "./modules/magazine.ts";
import { handleAgent, showAgentCategories } from "./modules/agents.ts";
import { handleLearning } from "./modules/learning.ts";
import { handleSales, showServiceTypeSelector } from "./modules/sales.ts";
import { handleExams } from "./modules/exams.ts";
import { handleTools, showToolsMenu } from "./modules/tools.ts";
import { handleGames, showGamesMenu } from "./modules/games/index.ts";

const supabase = getSupabaseClient();

export async function routeMessage(incoming: IncomingMessage): Promise<void> {
  const phone = incoming.from;
  const text = sanitizeInput(incoming.text);
  const interactiveId = incoming.interactiveId || "";

  // 1. Ignore empty payloads
  if (!text && !interactiveId) return;

  // 2. Message Deduplication
  if (incoming.messageId) {
    const { data: existingMsg } = await supabase
      .from("messages")
      .select("id")
      .eq("whatsapp_message_id", incoming.messageId)
      .maybeSingle();
    if (existingMsg) return;
  }

  try {
    const contact = await getOrCreateContact(phone, incoming.profileName);
    const conversation = await getOrCreateConversation(contact.id);

    await storeMessage(
      contact.id, "INBOUND", incoming.type,
      text || interactiveId || null, incoming.messageId
    );

    // ══════════════════════════════════════════════════════
    // 1. ACTIVE LEARNING MODULE ISOLATION
    // ══════════════════════════════════════════════════════
    if (conversation.current_module === "LEARNING") {
      await handleLearning(phone, text, contact, conversation);
      return;
    }

    // ══════════════════════════════════════════════════════
    // 2. LEARNING KEYWORD TRIGGER
    // ══════════════════════════════════════════════════════
    if (isLearningKeyword(text)) {
      const existingCtx = conversation.context_json || {};
      await updateConversation(conversation.id, {
        current_module: "LEARNING",
        current_state: "ENTRY",
        context_json: { ...existingCtx, learningUnlocked: true, step: "ENTRY" },
      });
      await handleLearning(phone, text, contact, conversation);
      return;
    }

    // ══════════════════════════════════════════════════════
    // 3. DIRECT GAMES INTENT OVERRIDE
    // ══════════════════════════════════════════════════════
    if (
      interactiveId.startsWith("game_") ||
      interactiveId.startsWith("trivia_") ||
      interactiveId.startsWith("math_") ||
      interactiveId.startsWith("diff_") ||
      interactiveId.startsWith("ng_") ||
      interactiveId.startsWith("riddle_") ||
      interactiveId.startsWith("rps_") ||
      interactiveId.startsWith("word_") ||
      interactiveId.startsWith("ttt_") ||
      interactiveId.startsWith("emoji_") ||
      interactiveId.startsWith("dice_")
    ) {
      await handleGames(phone, text, contact, conversation, interactiveId);
      return;
    }

    // ══════════════════════════════════════════════════════
    // 4. DIRECT DEMO CENTRE INTENT OVERRIDE
    // ══════════════════════════════════════════════════════
    if (
      interactiveId.startsWith("demo_") ||
      interactiveId.startsWith("democat_") ||
      interactiveId.startsWith("demostart_") ||
      interactiveId.startsWith("demo_lead_")
    ) {
      await handleDemos(phone, text, contact, conversation, interactiveId);
      return;
    }

    // ══════════════════════════════════════════════════════
    // 5. DIRECT TOOLS INTENT OVERRIDE
    // ══════════════════════════════════════════════════════
    if (interactiveId.startsWith("tool_") || interactiveId.startsWith("tools_")) {
      await handleTools(phone, text, contact, conversation, interactiveId);
      return;
    }
    // ══════════════════════════════════════════════════════
    // DIRECT ABOUT INTENT OVERRIDE
    // ══════════════════════════════════════════════════════
    if (interactiveId.startsWith("about_")) {
      await handleAbout(phone, text, contact, conversation, interactiveId);
      return;
    }
    // ══════════════════════════════════════════════════════
    // 6. GLOBAL INTERRUPTS
    // ══════════════════════════════════════════════════════
    const activeModules = ["SALES", "EXAMS", "LEARNING", "TOOLS", "GAMES", "DEMOS"];

    if (
      (isGreeting(text) || isHelp(text) || text === "menu_home" || interactiveId === "menu_home")
      && !activeModules.includes(conversation.current_module || "")
    ) {
      await showMainMenu(phone, conversation.id);
      return;
    }

    if (
      isExit(text)
      && !activeModules.includes(conversation.current_module || "")
    ) {
      await updateConversation(conversation.id, {
        current_module: "MAIN_MENU", current_state: "IDLE", context_json: {},
      });
      await sendTextMessage(phone,
        `👋 Thank you for contacting *Xtop Retail Technologies*, ${contact.name || ""}.\n\nType *hi* or *menu* to return anytime.`
      );
      return;
    }

    if (
      isAgentRequest(text)
      && !activeModules.includes(conversation.current_module || "")
    ) {
      await showAgentCategories(phone, conversation.id);
      return;
    }

    // ══════════════════════════════════════════════════════
    // 7. MODULE ROUTER
    // ══════════════════════════════════════════════════════
    const currentModule = conversation.current_module;

    switch (currentModule) {
      case "MAIN_MENU": {
        const intent = detectIntent(text, interactiveId);
        if (intent === "PRODUCTS" || interactiveId === "menu_products") {
          await showProductsList(phone, conversation.id);
        } else if (intent === "SERVICES" || interactiveId === "menu_services") {
          await showServicesList(phone, conversation.id);
        } else if (interactiveId === "menu_demos" || text.toLowerCase().includes("demo")) {
          await showDemoCentreMenu(phone, conversation.id);
        } else if (interactiveId === "menu_games" || text.toLowerCase().includes("games")) {
          await showGamesMenu(phone, conversation.id);
        } else if (intent === "TOOLS" || interactiveId === "menu_tools" || text.toLowerCase().includes("tools")) {
          await showToolsMenu(phone, conversation.id);
        } else if (intent === "MAGAZINE" || interactiveId === "menu_magazine") {
          await displayMagazine(phone, conversation.id);
        } else if (intent === "AGENT" || interactiveId === "menu_agent") {
          await showAgentCategories(phone, conversation.id);
        } else if (intent === "SALES" || interactiveId === "menu_sales") {
          await showServiceTypeSelector(phone, conversation.id);
        } else if (isBack(text)) {
          await showMainMenu(phone, conversation.id);
        } else {
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
        await handleDemos(phone, text, contact, conversation, interactiveId);
        break;

      case "TOOLS":
        await handleTools(phone, text, contact, conversation, interactiveId);
        break;

      case "GAMES":
        await handleGames(phone, text, contact, conversation, interactiveId);
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
      case "ABOUT":
        await handleAbout(phone, text, contact, conversation, interactiveId);
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
