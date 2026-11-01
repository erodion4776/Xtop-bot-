
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
import { showSabiWelcomeMenu } from "./modules/sabi-menu.ts";

import {
  startMerchantRegistration,
} from "./modules/onboarding.ts";

import {
  startSabiShopDemo,
  handleSabiShopDemo,
} from "./modules/sabi-shop-demo.ts";

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

  const isCatalogueRequest = [
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
  ].includes(message);

  const sendAndLog = async (
    body: string,
    type: "text" | "image",
    imageUrl?: string,
  ): Promise<void> => {
    const messageId =
      type === "image" && imageUrl
        ? await sendImageMessage(
            phone,
            imageUrl,
            body,
            credentials,
          )
        : await sendTextMessage(
            phone,
            body,
            credentials,
          );

    if (!messageId) {
      safeErrorLog(
        "handleTenantStoreMessage.send",
        new Error(`WhatsApp ${type} message failed.`),
      );
      return;
    }

    await storeMessage(
      contact.id,
      "OUTBOUND",
      type,
      body,
      messageId,
      account.tenantId,
    );

    await logBotActivity(
      phone,
      "OUTBOUND",
      type,
      "TENANT_STORE",
      body,
      contact.name || incoming.profileName,
      "",
      messageId,
      account.tenantId,
    );
  };

  // CUSTOMER OPENS THE SHOP
  if (isCatalogueRequest) {
    if (!products.length) {
      await sendAndLog(
        `${greeting}\n\nOur product catalogue is being updated. Please contact the business for assistance.`,
        "text",
      );
      return;
    }

    await sendAndLog(
      `${greeting}\n\n🛍️ *Welcome to our shop!*\n\nHere are our available products. You can view each product below.\n\nReply with a product name to see its full details.`,
      "text",
    );

    // Send up to 10 products per catalogue request.
    for (const product of products.slice(0, 10)) {
      const price =
        product.price_text ||
        (
          product.price !== null &&
          product.price !== undefined
            ? `₦${Number(product.price).toLocaleString("en-NG")}`
            : "Contact us for price"
        );

      const caption =
        `🛍️ *${product.name}*\n\n` +
        `${product.description || "Contact us for more information."}\n\n` +
        `💰 Price: *${price}*\n\n` +
        `Reply *${product.name}* for more details.`;

      const imageUrl = String(
        product.image_url || "",
      ).trim();

      if (
        imageUrl.startsWith("https://") ||
        imageUrl.startsWith("http://")
      ) {
        await sendAndLog(
          caption,
          "image",
          imageUrl,
        );
      } else {
        await sendAndLog(
          caption,
          "text",
        );
      }
    }

    if (products.length > 10) {
      await sendAndLog(
        `There are ${products.length - 10} more products. Reply *menu* to view the catalogue again.`,
        "text",
      );
    }

    return;
  }

  // CUSTOMER SELECTS A PRODUCT BY NAME OR SLUG.
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

  if (!match) {
    await sendAndLog(
      `I couldn't find that product in *${account.businessName}*.\n\nReply *menu* to view the catalogue or contact the business for help.`,
      "text",
    );
    return;
  }

  // SHOW SELECTED PRODUCT DETAILS.
  const price =
    match.price_text ||
    (
      match.price !== null &&
      match.price !== undefined
        ? `₦${Number(match.price).toLocaleString("en-NG")}`
        : "Contact us for price"
    );

  const details =
    `*${match.name}*\n\n` +
    `${match.description || "Please contact us for more information."}\n\n` +
    `💰 Price: *${price}*` +
    (
      match.website_url
        ? `\n\nMore details: ${match.website_url}`
        : ""
    ) +
    "\n\nReply *menu* to view all products.";

  const imageUrl = String(
    match.image_url || "",
  ).trim();

  if (
    imageUrl.startsWith("https://") ||
    imageUrl.startsWith("http://")
  ) {
    await sendAndLog(
      details,
      "image",
      imageUrl,
    );
  } else {
    await sendAndLog(
      details,
      "text",
    );
  }
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
// SABI KEYWORD HELPERS
// =====================================================

function isSabiDemoRequest(text: string): boolean {
  const value = text.trim().toLowerCase();

  return [
    "demo",
    "try demo",
    "try shop demo",
    "shop demo",
    "sabi demo",
    "try sabi",
    "try sabi demo",
  ].includes(value);
}

function isMyBusinessRequest(text: string): boolean {
  const value = text.trim().toLowerCase();

  return [
    "my business",
    "xtop retail",
    "xtop retail technologies",
    "business menu",
    "xtop business",
  ].includes(value);
}

function isEngrEroRequest(text: string): boolean {
  const value = text.trim().toLowerCase();

  return [
    "engr ero",
    "eng ero",
    "engr. ero",
    "ero learning",
    "learning centre",
    "learning center",
  ].includes(value);
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

  // ===================================================
  // MESSAGE DEDUPLICATION — TENANT SCOPED
  // ===================================================

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
      interactiveId === "sabi_home" ||
      lowerText === "menu_home" ||
      lowerText === "sabi_home"
    ) {
      await showSabiWelcomeMenu(
        phone,
        conversation.id,
      );
      return;
    }

    // ===================================================
    // EXPLICIT XTOP BUSINESS ROUTE
    // ===================================================

    if (
      interactiveId === "my_business" ||
      isMyBusinessRequest(text)
    ) {
      await showMainMenu(
        phone,
        conversation.id,
      );
      return;
    }

    // ===================================================
    // EXPLICIT ENGR ERO LEARNING ROUTE
    // ===================================================

    if (
      interactiveId === "engr_ero" ||
      isEngrEroRequest(text) ||
      isLearningKeyword(text)
    ) {
      await updateConversation(
        conversation.id,
        {
          current_module: "LEARNING",
          current_state: "ENTRY",
          context_json: {
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
    // SABI SHOP DEMO — START
    // ===================================================

    if (
      interactiveId === "sabi_demo" ||
      isSabiDemoRequest(text)
    ) {
      await startSabiShopDemo(
        phone,
        conversation.id,
      );
      return;
    }

    // ===================================================
    // SABI SHOP DEMO — ACTIVE SESSION
    // ===================================================

    if (currentModule === "SABI_SHOP_DEMO") {
      const demoHandled =
        await handleSabiShopDemo(
          phone,
          text || interactiveId,
          conversation.id,
          conversation.current_state || "",
          (
            conversation.context_json || {}
          ) as Record<string, unknown>,
        );

      if (demoHandled) return;
    }

    // ===================================================
    // SABI GATEWAY ACTIONS
    // ===================================================

    if (
      interactiveId === "sabi_register" ||
      lowerText === "register my business" ||
      lowerText === "register business" ||
      lowerText === "sabi_register"
    ) {
      await startMerchantRegistration(
        phone,
        conversation.id,
      );
      return;
    }

    if (interactiveId === "sabi_about") {
      await sendTextMessage(
        phone,
        "ℹ️ *About Sabi by XTOP*\n\nSabi helps businesses serve customers directly on WhatsApp.\n\nWith Sabi, a business can present its products, receive customer enquiries and orders, and manage its shop through a merchant dashboard.\n\nSabi is designed to make shopping and business communication simple and convenient.",
      );

      await showSabiWelcomeMenu(
        phone,
        conversation.id,
      );
      return;
    }

    if (interactiveId === "sabi_support") {
      await updateConversation(
        conversation.id,
        {
          current_module: "SABI_GATEWAY",
          current_state: "SUPPORT",
          context_json: {
            sabi_gateway: true,
            sabi_support_waiting: true,
          },
        },
        tenantId,
      );

      await sendTextMessage(
        phone,
        "💬 *Sabi Support*\n\nPlease describe the issue or question you need help with. Our team will follow up.",
      );
      return;
    }

    // ===================================================
    // SABI SUPPORT MESSAGE
    // ===================================================

    if (
      currentModule === "SABI_GATEWAY" &&
      conversation.current_state === "SUPPORT"
    ) {
      await sendTextMessage(
        phone,
        "Thank you for contacting Sabi Support. Your message has been received in this conversation.\n\nType *Hi* to return to the Sabi welcome menu.",
      );

      await showSabiWelcomeMenu(
        phone,
        conversation.id,
      );
      return;
    }

    // ===================================================
    // LEGACY ONBOARDING STATE
    // Return to Sabi without invoking old plans/trials.
    // The Meta embedded-signup callback is handled separately.
    // ===================================================

    if (currentModule === "ONBOARDING") {
      await showSabiWelcomeMenu(
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
      currentModule !== "SABI_GATEWAY" &&
      currentModule !== "SABI_SHOP_DEMO" &&
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

    // ===================================================
    // ACTIVE SABI GATEWAY
    // Any ordinary or unrecognised message returns
    // the customer to the Sabi welcome menu.
    // ===================================================

    if (currentModule === "SABI_GATEWAY") {
      await showSabiWelcomeMenu(
        phone,
        conversation.id,
      );
      return;
    }

    // ===================================================
    // ACTIVE SALES WORKFLOW
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
    // ACTIVE AGENT WORKFLOW
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
    // ACTIVE EXAMS WORKFLOW
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
    // ACTIVE TOOLS WORKFLOW
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
    // ACTIVE GAMES WORKFLOW
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
    // ACTIVE DEMO CENTRE WORKFLOW
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
    // ACTIVE MAGAZINE STUDIO WORKFLOW
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
    // ACTIVE ABOUT WORKFLOW
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
    // ACTIVE PRODUCTS WORKFLOW
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
    // ACTIVE SERVICES WORKFLOW
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
    // ACTIVE MAGAZINE CATALOGUE
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
    // ===================================================

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
    // Sabi shop demo actions are handled above first.
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

    // Greetings and help always open the Sabi gateway.
    if (isGreeting(text) || isHelp(text)) {
      await showSabiWelcomeMenu(
        phone,
        conversation.id,
      );
      return;
    }

    // Exit an active XTOP workflow.
    if (isExit(text)) {
      await showSabiWelcomeMenu(
        phone,
        conversation.id,
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
    // MAIN MENU DISPATCH — EXISTING XTOP SERVICES
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
      return;
    }

    if (
      intent === "SERVICES" ||
      interactiveId === "menu_services"
    ) {
      await showServicesList(
        phone,
        conversation.id,
      );
      return;
    }

    if (
      interactiveId === "menu_demos" ||
      lowerText.includes("xtop demo")
    ) {
      await showDemoCentreMenu(
        phone,
        conversation.id,
      );
      return;
    }

    if (
      interactiveId === "menu_games" ||
      lowerText.includes("games")
    ) {
      await showGamesMenu(
        phone,
        conversation.id,
      );
      return;
    }

    if (
      interactiveId === "menu_tools" ||
      lowerText.includes("tools")
    ) {
      await showToolsMenu(
        phone,
        conversation.id,
      );
      return;
    }

    if (
      interactiveId === "menu_magazine_studio" ||
      lowerText.includes("magazine studio") ||
      lowerText.includes("create magazine")
    ) {
      await showStudioMenu(
        phone,
        conversation.id,
      );
      return;
    }

    if (
      intent === "MAGAZINE" ||
      interactiveId === "menu_magazine"
    ) {
      await displayMagazine(
        phone,
        conversation.id,
      );
      return;
    }

    if (
      intent === "AGENT" ||
      interactiveId === "menu_agent"
    ) {
      await showAgentCategories(
        phone,
        conversation.id,
      );
      return;
    }

    if (
      intent === "SALES" ||
      interactiveId === "menu_sales"
    ) {
      await showServiceTypeSelector(
        phone,
        conversation.id,
      );
      return;
    }

    if (
      interactiveId === "menu_about" ||
      lowerText.includes("about")
    ) {
      await showAboutMenu(
        phone,
        conversation.id,
      );
      return;
    }

    if (isBack(text)) {
      await showSabiWelcomeMenu(
        phone,
        conversation.id,
      );
      return;
    }

    // ===================================================
    // DEFAULT ROUTE
    // ===================================================

    // New users and unrecognised messages always see Sabi.
    await showSabiWelcomeMenu(
      phone,
      conversation.id,
    );
  } catch (err) {
    safeErrorLog("routeMessage", err);

    try {
      await sendTextMessage(
        phone,
        "Sorry, an error occurred. Type *Hi* to return to the Sabi welcome menu.",
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
