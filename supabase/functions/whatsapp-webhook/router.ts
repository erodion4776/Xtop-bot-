// supabase/functions/whatsapp-webhook/router.ts

import {
  Contact,
  Conversation,
  getOrCreateContact,
  getOrCreateConversation,
  updateConversation,
  storeMessage,
  logBotActivity,
  getActiveProducts,
  SYSTEM_TENANT_ID,
  getSupabaseClient,
} from "./database.ts";

import {
  IncomingMessage,
  sendTextMessage,
  sendImageMessage,
  WhatsAppCredentials,
} from "./whatsapp.ts";

import { decryptToken } from "./lib/encryption.ts";

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

import {
  isAdminPhone,
  isAdminAgentTrigger,
  showAdminAgentMenu,
  handleAdminAgent,
} from "./modules/admin-agent.ts";

const supabase = getSupabaseClient();

// =====================================================
// TENANT RESOLUTION
// =====================================================

interface ResolvedBotAccount {
  tenantId: string;
  credentials?: WhatsAppCredentials;
  isSystem: boolean;
  businessName: string;
  welcomeGreeting: string | null;
  merchantPaused: boolean;
}

async function resolveBotAccount(
  incoming: IncomingMessage,
): Promise<ResolvedBotAccount | null> {
  const phoneNumberId = String(
    incoming.phoneNumberId || "",
  ).trim();

  if (!phoneNumberId) {
    safeErrorLog(
      "resolveBotAccount",
      new Error("Missing metadata.phone_number_id."),
    );
    return null;
  }

  // Only the exact XTOP system phone number can use system credentials.
  const systemPhoneNumberId = String(
    Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "",
  ).trim();

  if (
    systemPhoneNumberId &&
    phoneNumberId === systemPhoneNumberId
  ) {
    return {
      tenantId: SYSTEM_TENANT_ID,
      isSystem: true,
      businessName: "XTOP Retail Technologies",
      welcomeGreeting: null,
      merchantPaused: false,
    };
  }

  // Resolve the customer's WhatsApp number to its tenant.
  const { data: account, error: accountError } = await supabase
    .from("tenant_whatsapp_accounts")
    .select(
      "tenant_id, phone_number_id, encrypted_access_token",
    )
    .eq("phone_number_id", phoneNumberId)
    .eq("is_active", true)
    .maybeSingle();

  if (accountError || !account) {
    if (accountError) {
      safeErrorLog(
        "resolveBotAccount.account",
        accountError,
      );
    }
    return null;
  }

  // Confirm tenant is active and retrieve its pause setting.
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select(
      "id, name, business_name, welcome_greeting, is_active, metadata",
    )
    .eq("id", account.tenant_id)
    .eq("is_active", true)
    .maybeSingle();

  if (tenantError || !tenant) {
    if (tenantError) {
      safeErrorLog(
        "resolveBotAccount.tenant",
        tenantError,
      );
    }
    return null;
  }

  // Sabi does not require subscriptions or trials.
  // Merchant access depends on an active tenant and WhatsApp account.

  // Decrypt this tenant's own WhatsApp access token.
  let accessToken: string;

  try {
    accessToken = await decryptToken(
      account.encrypted_access_token,
    );
  } catch (error) {
    safeErrorLog(
      "resolveBotAccount.decryptToken",
      error,
    );
    return null;
  }

  if (!accessToken) return null;

  return {
    tenantId: account.tenant_id,

    credentials: {
      phoneNumberId: account.phone_number_id,
      accessToken,
    },

    isSystem: false,

    businessName:
      tenant.business_name ||
      tenant.name ||
      "Our Store",

    welcomeGreeting:
      tenant.welcome_greeting || null,

    merchantPaused:
      tenant.metadata?.sabi_paused === true,
  };
}

// =====================================================
// CUSTOMER TENANT STORE HANDLER
// =====================================================

async function handleTenantStoreMessage(
  incoming: IncomingMessage,
  account: ResolvedBotAccount,
  contact: Contact,
): Promise<void> {
  const credentials = account.credentials;

  if (!credentials) return;

  const phone = incoming.from;

  const message = String(
    incoming.interactiveId ||
    incoming.text ||
    "",
  ).trim().toLowerCase();

  const products = await getActiveProducts(
    account.tenantId,
  );

  const greeting =
    account.welcomeGreeting ||
    `Welcome to *${account.businessName}*.`;

  let reply: string;

  if (
    [
      "",
      "hi",
      "hello",
      "hey",
      "menu",
      "start",
      "shop",
      "catalogue",
      "catalog",
      "products",
      "1",
    ].includes(message)
  ) {
    if (!products.length) {
      reply =
        `${greeting}\n\n` +
        "Our product catalogue is being updated. " +
        "Please contact the business for assistance.";
    } else {
      const lines = products
        .slice(0, 20)
        .map((product, index) =>
          `${index + 1}. *${product.name}*` +
          `${
            product.price_text
              ? ` — ${product.price_text}`
              : ""
          }` +
          `${
            product.description
              ? `\n${product.description}`
              : ""
          }`
        );

      reply =
        `${greeting}\n\n` +
        `*Available products*\n\n` +
        `${lines.join("\n\n")}\n\n` +
        "Reply with a product name for details. " +
        "Type *menu* to see this list again.";
    }
  } else {
    const match = products.find((product) => {
      const name = String(
        product.name || "",
      ).toLowerCase();

      const slug = String(
        product.slug || "",
      ).toLowerCase();

      return (
        message === name ||
        message === slug ||
        (
          name.length > 2 &&
          message.includes(name)
        )
      );
    });

    reply = match
      ? (
        `*${match.name}*\n\n` +
        `${
          match.description ||
          "Please contact us for more information."
        }` +
        `${
          match.price_text
            ? `\n\nPrice: *${match.price_text}*`
            : ""
        }` +
        `${
          match.website_url
            ? `\n\nMore details: ${match.website_url}`
            : ""
        }` +
        "\n\nType *menu* to view all products."
      )
      : (
        `I couldn't find that product in *${account.businessName}*.\n\n` +
        "Type *menu* to view the catalogue or contact the business for help."
      );
  }

  // Explicit tenant credentials: no XTOP fallback.
  const result = await sendTextMessage(
    phone,
    reply,
    credentials,
  );

  // sendTextMessage returns the WhatsApp message ID or null.
  if (!result) {
    safeErrorLog(
      "handleTenantStoreMessage.send",
      new Error("WhatsApp message could not be sent."),
    );
    return;
  }

  const waMessageId = result;

  await storeMessage(
    contact.id,
    "OUTBOUND",
    "text",
    reply,
    waMessageId,
    account.tenantId,
  );

  await logBotActivity(
    phone,
    "OUTBOUND",
    "text",
    "TENANT_STORE",
    reply,
    contact.name || incoming.profileName,
    "",
    waMessageId || undefined,
    account.tenantId,
  );
}

// =====================================================
// SABI ONBOARDING ACTIONS
// =====================================================

function isSabiOnboardingAction(id: string): boolean {
  return (
    [
      "demo_store",
      "demo_products",
      "demo_order",
      "demo_faq",
      "demo_signup",
      "view_plans",
      "onboard_agent",
      "onboard_tools",
    ].includes(id) ||
    id.startsWith("plan_") ||
    id.startsWith("getbot_")
  );
}

// =====================================================
// DEMO CENTRE ACTIONS
// =====================================================

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

function isInteractivePayload(
  incoming: IncomingMessage,
): boolean {
  return Boolean(incoming.interactiveId);
}

// =====================================================
// MAIN ROUTER
// =====================================================

export async function routeMessage(
  incoming: IncomingMessage,
): Promise<void> {
  const phone = incoming.from;

  // Resolve the WhatsApp number before processing the message.
  const account = await resolveBotAccount(incoming);

  if (!account) {
    console.error(
      "[routeMessage] Rejected unknown, inactive, or unregistered WhatsApp number.",
    );
    return;
  }

  const tenantId = account.tenantId;

  const rawInput =
    incoming.interactiveId ||
    incoming.text ||
    "";

  const text = sanitizeInput(rawInput);

  const interactiveId =
    incoming.interactiveId || "";

  const lowerText = text.toLowerCase();

  if (!text && !interactiveId) return;

  // =====================================================
  // MESSAGE DEDUPLICATION — TENANT SCOPED
  // =====================================================

  if (incoming.messageId) {
    const { data: existingMsg, error } =
      await supabase
        .from("messages")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq(
          "whatsapp_message_id",
          incoming.messageId,
        )
        .maybeSingle();

    if (error) {
      safeErrorLog(
        "routeMessage.deduplication",
        error,
      );
    }

    if (existingMsg) return;
  }

  try {
    // ===================================================
    // CONTACT AND CONVERSATION — TENANT SCOPED
    // ===================================================

    const contact = await getOrCreateContact(
      phone,
      incoming.profileName,
      tenantId,
    );

    const conversation =
      await getOrCreateConversation(
        contact.id,
        tenantId,
      );

    await storeMessage(
      contact.id,
      "INBOUND",
      incoming.type,
      text || interactiveId || null,
      incoming.messageId,
      tenantId,
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
      tenantId,
    ).catch(() => {});

    // ===================================================
    // CUSTOMER TENANTS — PAUSE AND TAKEOVER
    // ===================================================

    if (!account.isSystem) {
      const merchantContext = (
        conversation.context_json || {}
      ) as Record<string, any>;

      const merchantAgentTakeover =
        (contact as any)?.agent_mode === true ||
        (conversation as any)?.agent_mode === true ||
        merchantContext.agent_takeover === true ||
        merchantContext.agent_mode === true;

      // Merchant-wide pause affects only this merchant.
      if (account.merchantPaused) {
        console.log(
          `[Merchant Pause] Automated replies paused for tenant ${tenantId}.`,
        );
        return;
      }

      // Individual takeover affects only this customer.
      if (merchantAgentTakeover) {
        console.log(
          `[Merchant Agent Takeover] Bot paused for ${phone}.`,
        );
        return;
      }

      await handleTenantStoreMessage(
        incoming,
        account,
        contact,
      );
      return;
    }

    // ===================================================
    // PRIVATE XTOP ADMIN AGENT
    // ===================================================

    const authorisedAdmin =
      account.isSystem && isAdminPhone(phone);

    const existingContext = (
      conversation.context_json || {}
    ) as Record<string, unknown>;

    const adminAgentActive =
      conversation.current_module === "ADMIN_AGENT" ||
      existingContext.admin_agent_active === true;

    if (
      authorisedAdmin &&
      isAdminAgentTrigger(text, interactiveId)
    ) {
      const updatedConversation =
        await updateConversation(
          conversation.id,
          {
            current_module: "ADMIN_AGENT",
            current_state: "ACTIVE",
            context_json: {
              admin_agent_active: true,
            },
          },
          tenantId,
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

    // ===================================================
    // GLOBAL SABI PAUSE CHECK — XTOP SYSTEM ONLY
    // ===================================================

    const { data: setting, error: settingError } =
      await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "sabi_global_handoff")
        .maybeSingle();

    if (settingError) {
      safeErrorLog(
        "routeMessage.globalPauseCheck",
        settingError,
      );
    }

    if (setting?.value?.enabled === true) {
      console.log(
        `[Global Sabi Paused] Message from ${phone} logged.`,
      );
      return;
    }

    // ===================================================
    // INDIVIDUAL AGENT TAKEOVER — XTOP SYSTEM
    // ===================================================

    const ctx = (
      conversation.context_json || {}
    ) as Record<string, any>;

    const isContactAgentMode =
      (contact as any)?.agent_mode === true;

    const isConvTakeover =
      ctx.agent_takeover === true ||
      ctx.agent_mode === true;

    if (isContactAgentMode || isConvTakeover) {
      console.log(
        `[Agent Takeover] Bot paused for: ${phone}.`,
      );
      return;
    }

    const currentModule =
      conversation.current_module || "MAIN_MENU";

    // ===================================================
    // EXPLICIT HOME ACTION
    // ===================================================

    if (
      interactiveId === "menu_home" ||
      lowerText === "menu_home"
    ) {
      await updateConversation(
        conversation.id,
        {
          current_module: "MAIN_MENU",
          current_state: "IDLE",
          context_json: {},
        },
        tenantId,
      );

      await showMainMenu(
        phone,
        conversation.id,
      );
      return;
    }

    // ===================================================
    // PERSONALIZED DEMO INTERCEPTION
    // ===================================================

    const isAcademicWorkflow =
      currentModule === "LEARNING" ||
      currentModule === "EXAMS";

    if (
      !isAcademicWorkflow &&
      !isInteractivePayload(incoming)
    ) {
      const originalText =
        incoming.text || text;

      const structuredDemoHandled =
        await handleStructuredPersonalizedDemoRequest(
          phone,
          originalText,
          contact,
          conversation,
        );

      if (structuredDemoHandled) return;

      const detectedToken =
        extractTokenFromText(originalText);

      if (detectedToken) {
        const handled =
          await handlePersonalizedDemoToken(
            phone,
            originalText,
            detectedToken,
            contact,
            conversation,
          );

        if (handled) return;
      }
    }

    // ===================================================
    // SABI BY XTOP ONBOARDING
    // ===================================================

    if (!isAcademicWorkflow) {
      const isSabiAction =
        isSabiOnboardingAction(interactiveId);

      const isOnboardingConversation =
        currentModule === "ONBOARDING";

      const isOnboardingText =
        !isInteractivePayload(incoming);

      if (
        isSabiAction ||
        isOnboardingConversation ||
        isOnboardingText
      ) {
        const onboardingHandled =
          await handleOnboardingRequest(
            phone,
            text || interactiveId,
            contact.id || "",
            conversation.id,
          );

        if (onboardingHandled) return;
      }
    }

    // ===================================================
    // ACTIVE LEARNING WORKFLOW
    // ===================================================

    if (currentModule === "LEARNING") {
      await handleLearning(
        phone,
        text,
        contact,
        conversation,
      );
      return;
    }

    if (isLearningKeyword(text)) {
      const existingCtx =
        conversation.context_json || {};

      await updateConversation(
        conversation.id,
        {
          current_module: "LEARNING",
          current_state: "ENTRY",
          context_json: {
            ...existingCtx,
            learningUnlocked: true,
            step: "ENTRY",
          },
        },
        tenantId,
      );

      await handleLearning(
        phone,
        text,
        contact,
        conversation,
      );
      return;
    }

    // ===================================================
    // ONBOARDING WORKFLOW
    // ===================================================

    if (currentModule === "ONBOARDING") {
      const onboardingHandled =
        await handleOnboardingRequest(
          phone,
          text || interactiveId,
          contact.id || "",
          conversation.id,
        );

      if (onboardingHandled) return;

      await updateConversation(
        conversation.id,
        {
          current_module: "MAIN_MENU",
          current_state: "IDLE",
          context_json: {},
        },
        tenantId,
      );

      await showMainMenu(
        phone,
        conversation.id,
      );
      return;
    }

    // ===================================================
    // SALES WORKFLOW
    // ===================================================

    if (currentModule === "SALES") {
      await handleSales(
        phone,
        text,
        contact,
        conversation,
      );
      return;
    }

    // ===================================================
    // AGENT WORKFLOW
    // ===================================================

    if (currentModule === "AGENT") {
      await handleAgent(
        phone,
        text,
        contact,
        conversation,
      );
      return;
    }

    // ===================================================
    // EXAMS WORKFLOW
    // ===================================================

    if (currentModule === "EXAMS") {
      await handleExams(
        phone,
        text,
        contact,
        conversation,
      );
      return;
    }

    // ===================================================
    // TOOLS WORKFLOW
    // ===================================================

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

    // ===================================================
    // GAMES WORKFLOW
    // ===================================================

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

    // ===================================================
    // DEMO WORKFLOW
    // ===================================================

    if (currentModule === "DEMOS") {
      const personalizedHandled =
        await handlePersonalizedDemoAction(
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

    // ===================================================
    // MAGAZINE STUDIO WORKFLOW
    // ===================================================

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

    // ===================================================
    // ABOUT WORKFLOW
    // ===================================================

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

    // ===================================================
    // PRODUCTS WORKFLOW
    // ===================================================

    if (currentModule === "PRODUCTS") {
      await handleProducts(
        phone,
        text,
        contact,
        conversation,
      );
      return;
    }

    // ===================================================
    // SERVICES WORKFLOW
    // ===================================================

    if (currentModule === "SERVICES") {
      await handleServices(
        phone,
        text,
        contact,
        conversation,
      );
      return;
    }

    // ===================================================
    // MAGAZINE CATALOGUE
    // ===================================================

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

    // ===================================================
    // DIRECT INTENT OVERRIDES
    // =====================================================

    if (
      interactiveId.startsWith("plan_") ||
      interactiveId.startsWith("getbot_") ||
      interactiveId === "onboard_agent" ||
      interactiveId === "onboard_tools"
    ) {
      const onboardingHandled =
        await handleOnboardingRequest(
          phone,
          interactiveId,
          contact.id || "",
          conversation.id,
        );

      if (onboardingHandled) return;
    }

    // ABOUT
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

    // GAMES
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

    // DEMO CENTRE
    if (isDemoInteractiveAction(interactiveId)) {
      const personalizedHandled =
        await handlePersonalizedDemoAction(
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

    // TOOLS
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

    // WEBSITE / DOMAIN CHECKER
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

    // FLIGHT CHECKER
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

    // MAGAZINE STUDIO
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
        await showStudioMenu(
          phone,
          conversation.id,
        );
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

    // ===================================================
    // GLOBAL COMMANDS
    // ===================================================

    if (isGreeting(text) || isHelp(text)) {
      await showMainMenu(
        phone,
        conversation.id,
      );
      return;
    }

    if (isExit(text)) {
      await updateConversation(
        conversation.id,
        {
          current_module: "MAIN_MENU",
          current_state: "IDLE",
          context_json: {},
        },
        tenantId,
      );

      await sendTextMessage(
        phone,
        `👋 Thank you for contacting *Xtop Retail Technologies*, ${
          contact.name || ""
        }.\n\nType *hi* or *menu* to return anytime.`,
      );
      return;
    }

    if (isAgentRequest(text)) {
      await showAgentCategories(
        phone,
        conversation.id,
      );
      return;
    }

    // ===================================================
    // MAIN MENU DISPATCH
    // ===================================================

    const intent = detectIntent(
      text,
      interactiveId,
    );

    if (
      intent === "PRODUCTS" ||
      interactiveId === "menu_products"
    ) {
      await showProductsList(
        phone,
        conversation.id,
      );
    } else if (
      intent === "SERVICES" ||
      interactiveId === "menu_services"
    ) {
      await showServicesList(
        phone,
        conversation.id,
      );
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
      await showGamesMenu(
        phone,
        conversation.id,
      );
    } else if (
      interactiveId === "menu_tools" ||
      lowerText.includes("tools")
    ) {
      await showToolsMenu(
        phone,
        conversation.id,
      );
    } else if (
      interactiveId === "menu_magazine_studio" ||
      lowerText.includes("magazine studio") ||
      lowerText.includes("create magazine")
    ) {
      await showStudioMenu(
        phone,
        conversation.id,
      );
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
      await showMainMenu(
        phone,
        conversation.id,
      );
    } else {
      await sendTextMessage(
        phone,
        "Please select an option from the menu below:",
      );

      await showMainMenu(
        phone,
        conversation.id,
      );
    }
  } catch (err) {
    safeErrorLog("routeMessage", err);

    try {
      await sendTextMessage(
        phone,
        "Sorry, an error occurred. Type *menu* to return to the home screen.",
        account.credentials,
      );
    } catch (sendError) {
      safeErrorLog(
        "routeMessage.errorReply",
        sendError,
      );
    }
  }
}
