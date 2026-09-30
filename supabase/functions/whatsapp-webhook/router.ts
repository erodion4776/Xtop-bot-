// supabase/functions/whatsapp-webhook/router.ts

import {
  Contact, Conversation,
  getOrCreateContact, getOrCreateConversation,
  updateConversation, storeMessage, logBotActivity, getSupabaseClient
} from "./database.ts";
import { IncomingMessage, sendTextMessage } from "./whatsapp.ts";
import {
  sanitizeInput, isGreeting, isBack, isHelp,
  isAgentRequest, isExit, detectIntent, isLearningKeyword, safeErrorLog,
} from "./utils.ts";
import { showMainMenu } from "./modules/main-menu.ts";
import { handleProducts, showProductsList } from "./modules/products.ts";
import { handleServices, showServicesList } from "./modules/services.ts";
import { handleDemos, showDemoCentreMenu } from "./modules/demos/index.ts";
import { handleMagazine, displayMagazine } from "./modules/magazine.ts";
import { handleAgent, showAgentCategories } from "./modules/agents.ts";
import { handleLearning } from "./modules/learning.ts";
import { handleSales, showServiceTypeSelector } from "./modules/sales.ts";
import { handleExams } from "./modules/exams.ts";
import { handleTools, showToolsMenu } from "./modules/tools.ts";
import { handleWebsiteDomain } from "./modules/website-domain.ts";
import { handleFlightChecker } from "./modules/flight-checker.ts";
import { handleGames, showGamesMenu } from "./modules/games/index.ts";
import { handleAbout, showAboutMenu } from "./modules/about.ts";
import { handleMagazineStudio, showStudioMenu } from "./modules/magazine-studio.ts";

const supabase = getSupabaseClient();

export async function routeMessage(incoming: IncomingMessage): Promise<void> {
  const phone = incoming.from;
  const rawInput = incoming.interactiveId || incoming.text || "";
  const text = sanitizeInput(rawInput);
  const interactiveId = incoming.interactiveId || "";
  const lowerText = text.toLowerCase();

  // 1. Ignore completely empty payloads
  if (!text && !interactiveId) return;

  // 2. Message Deduplication (Prevents Meta webhook retry storms)
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

    // Save message record in database
    await storeMessage(
      contact.id, "INBOUND", incoming.type,
      text || interactiveId || null, incoming.messageId
    );

    // Log to Dashboard Activity Feed
    logBotActivity(
      phone, "INBOUND", incoming.type,
      conversation.current_module || "MAIN_MENU",
      text || interactiveId || "",
      contact.name || incoming.profileName,
      interactiveId, incoming.messageId
    ).catch(() => {});

    // ══════════════════════════════════════════════════════
    // 🛑 1. GLOBAL SABI PAUSE CHECK
    // ══════════════════════════════════════════════════════
    const { data: setting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "sabi_global_handoff")
      .maybeSingle();

    if (setting?.value?.enabled === true) {
      console.log(`[Global Sabi Paused] Message from ${phone} logged. Auto-response OFF.`);
      return;
    }

    // ══════════════════════════════════════════════════════
    // 🛑 2. INDIVIDUAL CONVERSATION AGENT TAKEOVER CHECK
    // ══════════════════════════════════════════════════════
    const ctx = (conversation.context_json || {}) as Record<string, any>;
    const isContactAgentMode = (contact as any)?.agent_mode === true;
    const isConvTakeover = ctx.agent_takeover === true || ctx.agent_mode === true;

    if (isContactAgentMode || isConvTakeover) {
      console.log(`[Individual Agent Takeover Active] Bot paused for customer: ${phone}.`);
      return; // Sabi stays silent for this specific customer only
    }

    // ══════════════════════════════════════════════════════
    // ACTIVE WORKFLOW ROUTING (WORKFLOW LOCK)
    // ══════════════════════════════════════════════════════
    // Once a customer is inside a workflow, that workflow
    // owns the conversation until completed or explicitly exited.
    const currentModule = conversation.current_module || "MAIN_MENU";

    // Explicit Home button always resets to Main Menu
    if (interactiveId === "menu_home" || lowerText === "menu_home") {
      await updateConversation(conversation.id, {
        current_module: "MAIN_MENU",
        current_state: "IDLE",
        context_json: {},
      });
      await showMainMenu(phone, conversation.id);
      return;
    }

    // 1. LEARNING workflow
    if (currentModule === "LEARNING") {
      await handleLearning(phone, text, contact, conversation);
      return;
    }

    // 2. Keyword trigger for Learning Centre
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

    // 3. SALES workflow
    if (currentModule === "SALES") {
      await handleSales(phone, text, contact, conversation);
      return;
    }

    // 4. AGENT workflow
    if (currentModule === "AGENT") {
      await handleAgent(phone, text, contact, conversation);
      return;
    }

    // 5. EXAMS workflow
    if (currentModule === "EXAMS") {
      await handleExams(phone, text, contact, conversation);
      return;
    }

    // 6. TOOLS workflow
    if (currentModule === "TOOLS") {
      await handleTools(phone, text, contact, conversation, interactiveId);
      return;
    }

    // 7. GAMES workflow
    if (currentModule === "GAMES") {
      await handleGames(phone, text, contact, conversation, interactiveId);
      return;
    }

    // 8. DEMOS workflow
    if (currentModule === "DEMOS") {
      await handleDemos(phone, text, contact, conversation, interactiveId);
      return;
    }

    // 9. MAGAZINE STUDIO workflow
    if (currentModule === "MAGAZINE") {
      await handleMagazineStudio(phone, text, contact, conversation, interactiveId);
      return;
    }

    // 10. ABOUT workflow
    if (currentModule === "ABOUT") {
      await handleAbout(phone, text, contact, conversation, interactiveId);
      return;
    }

    // 11. PRODUCTS workflow
    if (currentModule === "PRODUCTS") {
      await handleProducts(phone, text, contact, conversation);
      return;
    }

    // 12. SERVICES workflow
    if (currentModule === "SERVICES") {
      await handleServices(phone, text, contact, conversation);
      return;
    }

    // 13. MAGAZINE CATALOGUE workflow
    if (currentModule === "MAGAZINE_CATALOG") {
      await handleMagazine(phone, text, contact, conversation, interactiveId);
      return;
    }

    // ══════════════════════════════════════════════════════
    // DIRECT INTENT OVERRIDES (FROM IDLE / MAIN MENU)
    // ══════════════════════════════════════════════════════

    // About Xtop
    if (
      interactiveId === "menu_about" ||
      interactiveId.startsWith("about_") ||
      lowerText.includes("about xtop") ||
      lowerText.includes("about us") ||
      lowerText === "about"
    ) {
      await handleAbout(phone, text, contact, conversation, interactiveId || "menu_about");
      return;
    }

    // Games Engine
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

    // Demo Centre
    if (
      interactiveId.startsWith("demo_") ||
      interactiveId.startsWith("democat_") ||
      interactiveId.startsWith("demostart_") ||
      interactiveId.startsWith("demo_lead_")
    ) {
      await handleDemos(phone, text, contact, conversation, interactiveId);
      return;
    }

    // Tools
    if (interactiveId.startsWith("tool_") || interactiveId.startsWith("tools_")) {
      await handleTools(phone, text, contact, conversation, interactiveId);
      return;
    }

    // Website & Domain sub-tool
    if (interactiveId.startsWith("wd_") || interactiveId.startsWith("dns_")) {
      await handleWebsiteDomain(phone, text, contact, conversation, interactiveId);
      return;
    }

    // Flight Checker sub-tool
    if (interactiveId.startsWith("flight_")) {
      await handleFlightChecker(phone, text, contact, conversation, interactiveId);
      return;
    }

    // Magazine Studio
    if (
      interactiveId === "menu_magazine_studio" ||
      interactiveId.startsWith("mag_") ||
      interactiveId.startsWith("magtype_") ||
      interactiveId.startsWith("magpages_") ||
      interactiveId.startsWith("magaud_") ||
      interactiveId.startsWith("magstyle_") ||
      interactiveId.startsWith("magvis_") ||
      interactiveId.startsWith("magtitle_") ||
      interactiveId.startsWith("maglogo_") ||
      interactiveId.startsWith("magview_") ||
      interactiveId.startsWith("magdel_") ||
      interactiveId.startsWith("magdelconfirm_") ||
      interactiveId.startsWith("magexport_") ||
      interactiveId.startsWith("magpreview_") ||
      interactiveId.startsWith("magregen_")
    ) {
      if (interactiveId === "menu_magazine_studio") {
        await showStudioMenu(phone, conversation.id);
      } else {
        await handleMagazineStudio(phone, text, contact, conversation, interactiveId);
      }
      return;
    }

    // ══════════════════════════════════════════════════════
    // GLOBAL COMMANDS (IDLE ONLY)
    // ══════════════════════════════════════════════════════

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
      await sendTextMessage(phone,
        `👋 Thank you for contacting *Xtop Retail Technologies*, ${contact.name || ""}.\n\nType *hi* or *menu* to return anytime.`
      );
      return;
    }

    if (isAgentRequest(text)) {
      await showAgentCategories(phone, conversation.id);
      return;
    }

    // ══════════════════════════════════════════════════════
    // MAIN MENU DISPATCH
    // ══════════════════════════════════════════════════════
    const intent = detectIntent(text, interactiveId);

    if (intent === "PRODUCTS" || interactiveId === "menu_products") {
      await showProductsList(phone, conversation.id);
    } else if (intent === "SERVICES" || interactiveId === "menu_services") {
      await showServicesList(phone, conversation.id);
    } else if (interactiveId === "menu_demos" || lowerText.includes("demo")) {
      await showDemoCentreMenu(phone, conversation.id);
    } else if (interactiveId === "menu_games" || lowerText.includes("games")) {
      await showGamesMenu(phone, conversation.id);
    } else if (interactiveId === "menu_tools" || lowerText.includes("tools")) {
      await showToolsMenu(phone, conversation.id);
    } else if (interactiveId === "menu_magazine_studio" || lowerText.includes("magazine studio") || lowerText.includes("create magazine")) {
      await showStudioMenu(phone, conversation.id);
    } else if (intent === "MAGAZINE" || interactiveId === "menu_magazine") {
      await displayMagazine(phone, conversation.id);
    } else if (intent === "AGENT" || interactiveId === "menu_agent") {
      await showAgentCategories(phone, conversation.id);
    } else if (intent === "SALES" || interactiveId === "menu_sales") {
      await showServiceTypeSelector(phone, conversation.id);
    } else if (interactiveId === "menu_about" || lowerText.includes("about")) {
      await showAboutMenu(phone, conversation.id);
    } else if (isBack(text)) {
      await showMainMenu(phone, conversation.id);
    } else {
      await sendTextMessage(phone, "Please select an option from the menu below:");
      await showMainMenu(phone, conversation.id);
    }
  } catch (err) {
    safeErrorLog("routeMessage", err);
    await sendTextMessage(phone, "Sorry, an error occurred. Type *menu* to return to the home screen.");
  }
}
