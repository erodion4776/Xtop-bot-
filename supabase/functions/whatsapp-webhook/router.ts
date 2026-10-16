// supabase/functions/whatsapp-webhook/router.ts

import {
  Contact,
  Conversation,
  getOrCreateContact,
  getOrCreateConversation,
  updateConversation,
  storeMessage,
  logBotActivity,
  getSupabaseClient,
} from "./database.ts";

import {
  IncomingMessage,
  sendTextMessage,
} from "./whatsapp.ts";

import {
  sanitizeInput,
  isGreeting,
  isBack,
  isHelp,
  isAgentRequest,
  isExit,
  detectIntent,
  isLearningKeyword,
  safeErrorLog,
} from "./utils.ts";

import { showMainMenu } from "./modules/main-menu.ts";
import {
  handleProducts,
  showProductsList,
} from "./modules/products.ts";
import {
  handleServices,
  showServicesList,
} from "./modules/services.ts";
import {
  handleDemos,
  showDemoCentreMenu,
} from "./modules/demos/index.ts";
import {
  handleMagazine,
  displayMagazine,
} from "./modules/magazine.ts";
import {
  handleAgent,
  showAgentCategories,
} from "./modules/agents.ts";
import { handleLearning } from "./modules/learning.ts";
import {
  handleSales,
  showServiceTypeSelector,
} from "./modules/sales.ts";
import { handleExams } from "./modules/exams.ts";
import {
  handleTools,
  showToolsMenu,
} from "./modules/tools.ts";
import { handleWebsiteDomain } from "./modules/website-domain.ts";
import { handleFlightChecker } from "./modules/flight-checker.ts";
import {
  handleGames,
  showGamesMenu,
} from "./modules/games/index.ts";
import {
  handleAbout,
  showAboutMenu,
} from "./modules/about.ts";
import {
  handleMagazineStudio,
  showStudioMenu,
} from "./modules/magazine-studio.ts";

import {
  handlePersonalizedDemoToken,
  handleStructuredPersonalizedDemoRequest,
  handlePersonalizedDemoAction,
} from "./modules/demos/personalized.ts";

import { extractTokenFromText } from "./modules/demos/tokens.ts";

import { handleOnboardingRequest } from "./modules/onboarding.ts";

// =====================================================
// PRIVATE ADMIN AGENT
// =====================================================

import {
  isAdminPhone,
  isAdminAgentTrigger,
  showAdminAgentMenu,
  handleAdminAgent,
} from "./modules/admin-agent.ts";

const supabase = getSupabaseClient();

/**
 * Demo Centre actions that must be routed to the Demo Centre handler.
 */
function isDemoInteractiveAction(id: string): boolean {
  return (
    id === "menu_demos" ||
    id === "democat_page_1" ||
    id === "democat_page_2" ||
    id === "demopage_next" ||
    id === "demopage_prev" ||
    id === "democat_back" ||
    id.startsWith("demo_") ||
    id.startsWith("democat_") ||
    id.startsWith("demostart_") ||
    id.startsWith("demo_lead_") ||
    id.startsWith("onboard_")
  );
}

function isInteractivePayload(incoming: IncomingMessage): boolean {
  return Boolean(incoming.interactiveId);
}

export async function routeMessage(
  incoming: IncomingMessage,
): Promise<void> {
  const phone = incoming.from;
  const rawInput = incoming.interactiveId || incoming.text || "";
  const text = sanitizeInput(rawInput);
  const interactiveId = incoming.interactiveId || "";
  const lowerText = text.toLowerCase();

  // 1. Ignore completely empty payloads.
  if (!text && !interactiveId) return;

  // 2. Message deduplication.
  if (incoming.messageId) {
    const { data: existingMsg, error } = await supabase
      .from("messages")
      .select("id")
      .eq("whatsapp_message_id", incoming.messageId)
      .maybeSingle();

    if (error) {
      safeErrorLog("routeMessage.deduplication", error);
    }

    if (existingMsg) return;
  }

  try {
    const contact = await getOrCreateContact(
      phone,
      incoming.profileName,
    );

    const conversation = await getOrCreateConversation(contact.id);

    await storeMessage(
      contact.id,
      "INBOUND",
      incoming.type,
      text || interactiveId || null,
      incoming.messageId,
    );

    logBotActivity(
      phone,
      "INBOUND",
      incoming.type,
      conversation.current_module || "MAIN_MENU",
      text || interactiveId || "",
      contact.name || incoming.profileName,
      interactiveId,
      incoming.messageId,
    ).catch(() => {});

    // =====================================================
    // 3. PRIVATE ADMIN AGENT
    // =====================================================

    const authorisedAdmin = isAdminPhone(phone);

    const existingContext = (
      conversation.context_json || {}
    ) as Record<string, unknown>;

    const adminAgentActive =
      conversation.current_module === "ADMIN_AGENT" ||
      existingContext.admin_agent_active === true;

    // Open the private agent using "Lizzy".
    if (
      authorisedAdmin &&
      isAdminAgentTrigger(text, interactiveId)
    ) {
      const updatedConversation = await updateConversation(
        conversation.id,
        {
          current_module: "ADMIN_AGENT",
          current_state: "ACTIVE",
          context_json: {
            admin_agent_active: true,
          },
        },
      );

      if (!updatedConversation) {
        await sendTextMessage(
          phone,
          "I could not open the private assistant because the conversation state could not be saved. Please try again.",
        );
        return;
      }

      await showAdminAgentMenu(phone);
      return;
    }

    if (authorisedAdmin && adminAgentActive) {
      await handleAdminAgent(
        phone,
        text,
        interactiveId,
        conversation.id,
      );
      return;
    }

    // =====================================================
    // 4. GLOBAL SABI PAUSE CHECK
    // =====================================================

    const { data: setting, error: settingError } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "sabi_global_handoff")
      .maybeSingle();

    if (settingError) {
      safeErrorLog("routeMessage.globalPauseCheck", settingError);
    }

    if (setting?.value?.enabled === true) {
      console.log(
        `[Global Sabi Paused] Message from ${phone} logged.`,
      );
      return;
    }

    // =====================================================
    // 5. INDIVIDUAL AGENT TAKEOVER CHECK
    // =====================================================

    const ctx = (
      conversation.context_json || {}
    ) as Record<string, any>;

    const isContactAgentMode =
      (contact as any)?.agent_mode === true;

    const isConvTakeover =
      ctx.agent_takeover === true ||
      ctx.agent_mode === true;

    if (isContactAgentMode || isConvTakeover) {
      console.log(`[Agent Takeover] Bot paused for: ${phone}.`);
      return;
    }

    const currentModule =
      conversation.current_module || "MAIN_MENU";

    // =====================================================
    // 6. EXPLICIT HOME ACTION
    // =====================================================

    if (
      interactiveId === "menu_home" ||
      lowerText === "menu_home"
    ) {
      await updateConversation(conversation.id, {
        current_module: "MAIN_MENU",
        current_state: "IDLE",
        context_json: {},
      });

      await showMainMenu(phone, conversation.id);
      return;
    }

    // =====================================================
    // 7. PERSONALIZED DEMO INTERCEPTION
    // =====================================================

    const isAcademicWorkflow =
      currentModule === "LEARNING" ||
      currentModule === "EXAMS";

    if (
      !isAcademicWorkflow &&
      !isInteractivePayload(incoming)
    ) {
      const originalText = incoming.text || text;

      // Handle structured demo request
      const structuredDemoHandled =
        await handleStructuredPersonalizedDemoRequest(
          phone,
          originalText,
          contact,
          conversation,
        );

      if (structuredDemoHandled) return;

      // Handle demo tokens
      const detectedToken = extractTokenFromText(originalText);

      if (detectedToken) {
        console.log(
          `[Demo Intercept] Detected a demo token for ${phone}.`,
        );

        const handled = await handlePersonalizedDemoToken(
          phone,
          originalText,
          detectedToken,
          contact,
          conversation,
        );

        if (handled) return;
      }
    }

    // =====================================================
    // 7.5 ONBOARDING INTERCEPTION (Multi-Tenant Bot Signup)
    //
    // Placed BEFORE active workflow routing so that explicit
    // requests ("I want a bot for my business", "signup", etc.)
    // break out of any stale sales or quotation states.
    // =====================================================

    if (
      !isAcademicWorkflow &&
      !isInteractivePayload(incoming)
    ) {
      const onboardingHandled = await handleOnboardingRequest(
        phone,
        text,
        contact.id || "",
        conversation.id,
      );

      if (onboardingHandled) return;
    }

    // =====================================================
    // 8. ACTIVE WORKFLOW ROUTING
    // =====================================================

    // Learning workflow.
    if (currentModule === "LEARNING") {
      await handleLearning(
        phone,
        text,
        contact,
        conversation,
      );
      return;
    }

    // Learning keyword entry.
    if (isLearningKeyword(text)) {
      const existingCtx = conversation.context_json || {};

      await updateConversation(conversation.id, {
        current_module: "LEARNING",
        current_state: "ENTRY",
        context_json: {
          ...existingCtx,
          learningUnlocked: true,
          step: "ENTRY",
        },
      });

      await handleLearning(
        phone,
        text,
        contact,
        conversation,
      );
      return;
    }

    // Sales workflow.
    if (currentModule === "SALES") {
      await handleSales(
        phone,
        text,
        contact,
        conversation,
      );
      return;
    }

    // Agent workflow.
    if (currentModule === "AGENT") {
      await handleAgent(
        phone,
        text,
        contact,
        conversation,
      );
      return;
    }

    // Exams workflow.
    if (currentModule === "EXAMS") {
      await handleExams(
        phone,
        text,
        contact,
        conversation,
      );
      return;
    }

    // Tools workflow.
    if (currentModule === "TOOLS") {
      await handleTools(
        phone,
        text,
        contact,
        conversation,
        interactiveId,
      );
      return;
    }

    // Games workflow.
    if (currentModule === "GAMES") {
      await handleGames(
        phone,
        text,
        contact,
        conversation,
        interactiveId,
      );
      return;
    }

    // Demo workflow.
    if (currentModule === "DEMOS") {
      const personalizedHandled = await handlePersonalizedDemoAction(
        phone,
        text,
        interactiveId,
        conversation,
      );

      if (personalizedHandled) return;

      await handleDemos(
        phone,
        text,
        contact,
        conversation,
        interactiveId,
      );
      return;
    }

    // Magazine Studio workflow.
    if (currentModule === "MAGAZINE") {
      await handleMagazineStudio(
        phone,
        text,
        contact,
        conversation,
        interactiveId,
      );
      return;
    }

    // About workflow.
    if (currentModule === "ABOUT") {
      await handleAbout(
        phone,
        text,
        contact,
        conversation,
        interactiveId,
      );
      return;
    }

    // Products workflow.
    if (currentModule === "PRODUCTS") {
      await handleProducts(
        phone,
        text,
        contact,
        conversation,
      );
      return;
    }

    // Services workflow.
    if (currentModule === "SERVICES") {
      await handleServices(
        phone,
        text,
        contact,
        conversation,
      );
      return;
    }

    // Magazine catalogue workflow.
    if (currentModule === "MAGAZINE_CATALOG") {
      await handleMagazine(
        phone,
        text,
        contact,
        conversation,
        interactiveId,
      );
      return;
    }

        // =====================================================
    // 9. DIRECT INTENT OVERRIDES FROM IDLE / MAIN MENU
    // =====================================================

    // Onboarding interactive actions (plan selection, get bot, agent, tools)
    if (
      interactiveId.startsWith("plan_") ||
      interactiveId.startsWith("getbot_") ||
      interactiveId === "onboard_agent" ||
      interactiveId === "onboard_tools"
    ) {
      const onboardingHandled = await handleOnboardingRequest(
        phone,
        interactiveId,
        contact.id || "",
        conversation.id,
      );

      if (onboardingHandled) return;
    }


    // About.
    if (
      interactiveId === "menu_about" ||
      interactiveId.startsWith("about_") ||
      lowerText.includes("about xtop") ||
      lowerText.includes("about us") ||
      lowerText === "about"
    ) {
      await handleAbout(
        phone,
        text,
        contact,
        conversation,
        interactiveId || "menu_about",
      );
      return;
    }

    // Games.
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
      await handleGames(
        phone,
        text,
        contact,
        conversation,
        interactiveId,
      );
      return;
    }

    // Demo Centre.
    if (isDemoInteractiveAction(interactiveId)) {
      const personalizedHandled = await handlePersonalizedDemoAction(
        phone,
        text,
        interactiveId,
        conversation,
      );

      if (personalizedHandled) return;

      await handleDemos(
        phone,
        text,
        contact,
        conversation,
        interactiveId,
      );
      return;
    }

    // Tools.
    if (
      interactiveId.startsWith("tool_") ||
      interactiveId.startsWith("tools_")
    ) {
      await handleTools(
        phone,
        text,
        contact,
        conversation,
        interactiveId,
      );
      return;
    }

    // Website/domain checker.
    if (
      interactiveId.startsWith("wd_") ||
      interactiveId.startsWith("dns_")
    ) {
      await handleWebsiteDomain(
        phone,
        text,
        contact,
        conversation,
        interactiveId,
      );
      return;
    }

    // Flight checker.
    if (interactiveId.startsWith("flight_")) {
      await handleFlightChecker(
        phone,
        text,
        contact,
        conversation,
        interactiveId,
      );
      return;
    }

    // Magazine Studio.
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
        await handleMagazineStudio(
          phone,
          text,
          contact,
          conversation,
          interactiveId,
        );
      }
      return;
    }

    // =====================================================
    // 10. GLOBAL COMMANDS
    // =====================================================

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
        `👋 Thank you for contacting *Xtop Retail Technologies*, ${
          contact.name || ""
        }.\n\nType *hi* or *menu* to return anytime.`,
      );
      return;
    }

    if (isAgentRequest(text)) {
      await showAgentCategories(phone, conversation.id);
      return;
    }

    // =====================================================
    // 11. MAIN MENU DISPATCH
    // =====================================================

    const intent = detectIntent(text, interactiveId);

    if (
      intent === "PRODUCTS" ||
      interactiveId === "menu_products"
    ) {
      await showProductsList(phone, conversation.id);
    } else if (
      intent === "SERVICES" ||
      interactiveId === "menu_services"
    ) {
      await showServicesList(phone, conversation.id);
    } else if (
      interactiveId === "menu_demos" ||
      lowerText.includes("demo")
    ) {
      await showDemoCentreMenu(
        phone,
        conversation.id,
      );
    } else if (
      interactiveId === "menu_games" ||
      lowerText.includes("games")
    ) {
      await showGamesMenu(phone, conversation.id);
    } else if (
      interactiveId === "menu_tools" ||
      lowerText.includes("tools")
    ) {
      await showToolsMenu(phone, conversation.id);
    } else if (
      interactiveId === "menu_magazine_studio" ||
      lowerText.includes("magazine studio") ||
      lowerText.includes("create magazine")
    ) {
      await showStudioMenu(phone, conversation.id);
    } else if (
      intent === "MAGAZINE" ||
      interactiveId === "menu_magazine"
    ) {
      await displayMagazine(
        phone,
        conversation.id,
      );
    } else if (
      intent === "AGENT" ||
      interactiveId === "menu_agent"
    ) {
      await showAgentCategories(
        phone,
        conversation.id,
      );
    } else if (
      intent === "SALES" ||
      interactiveId === "menu_sales"
    ) {
      await showServiceTypeSelector(
        phone,
        conversation.id,
      );
    } else if (
      interactiveId === "menu_about" ||
      lowerText.includes("about")
    ) {
      await showAboutMenu(
        phone,
        conversation.id,
      );
    } else if (isBack(text)) {
      await showMainMenu(phone, conversation.id);
    } else {
      await sendTextMessage(
        phone,
        "Please select an option from the menu below:",
      );
      await showMainMenu(phone, conversation.id);
    }
  } catch (err) {
    safeErrorLog("routeMessage", err);

    try {
      await sendTextMessage(
        phone,
        "Sorry, an error occurred. Type *menu* to return to the home screen.",
      );
    } catch (sendError) {
      safeErrorLog(
        "routeMessage.errorReply",
        sendError,
      );
    }
  }
}
