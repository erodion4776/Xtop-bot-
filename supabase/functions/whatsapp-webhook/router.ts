
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
  conversation: Conversation,
): Promise<void> {
  const credentials = account.credentials;
  if (!credentials) return;
  const phone = incoming.from;
  const raw = String(incoming.interactiveId || incoming.text || "").trim();
  const message = raw.toLowerCase();
  const products = await getActiveProducts(account.tenantId);
  const greeting = account.welcomeGreeting || `Welcome to *${account.businessName}*.`;
  const context = (conversation.context_json || {}) as Record<string, any>;
  const cart: Array<{product_id:string;name:string;price:number;quantity:number}> =
    Array.isArray(context.store_cart) ? context.store_cart : [];
  const state = String(conversation.current_state || "IDLE");

  if (message === "agent" || message === "human" || message === "talk to human" || message === "customer service") {
    await supabase.from("contacts").update({ agent_mode: true }).eq("tenant_id", account.tenantId).eq("id", contact.id);
    await updateConversation(conversation.id, {
      current_module: "TENANT_STORE",
      current_state: "AGENT_TAKEOVER",
      context_json: { ...context, agent_takeover: true, agent_mode: true },
      agent_mode: true,
    }, account.tenantId);
    await send("👤 Your request for human assistance has been recorded in the shop's Sabi Inbox. Automated replies are paused for this conversation so the shop team can take over.");
    return;
  }

  if (message === "track" || message.startsWith("track ")) {
    const requestedNumber = message.startsWith("track ") ? raw.slice(6).trim().toUpperCase() : String(context.store_last_order || "").toUpperCase();
    let orderQuery = supabase.from("tenant_orders")
      .select("order_number,status,payment_status,shipping_payment_status,payment_method,created_at,subtotal,delivery_fee,total")
      .eq("tenant_id", account.tenantId)
      .eq("customer_phone", phone);
    if (requestedNumber) orderQuery = orderQuery.eq("order_number", requestedNumber);
    const { data: tracked, error: trackError } = await orderQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (trackError) safeErrorLog("tenantStore.track", trackError);
    if (!tracked) {
      await send("I couldn't find an order for this WhatsApp number. Reply *track ORDER_NUMBER* using the number in your confirmation message, or contact the shop.");
      return;
    }
    await send(`📦 *Order tracking: ${tracked.order_number}*\n\nOrder status: *${tracked.status}*\nProduct payment: *${tracked.payment_status}*\nDelivery payment: *${tracked.shipping_payment_status || "Not applicable"}*\nPayment method: *${tracked.payment_method}*\nOrder date: ${new Date(tracked.created_at).toLocaleString("en-NG")}\n\nReply *agent* if you need help from the shop.`);
    return;
  }

  const send = async (body: string, imageUrl?: string) => {
    const id = imageUrl
      ? await sendImageMessage(phone, imageUrl, body, credentials)
      : await sendTextMessage(phone, body, credentials);
    if (!id) {
      safeErrorLog("tenantStore.send", new Error("WhatsApp send failed"));
      return;
    }
    await storeMessage(contact.id, "OUTBOUND", imageUrl ? "image" : "text", body, id, account.tenantId);
    await logBotActivity(phone, "OUTBOUND", imageUrl ? "image" : "text", "TENANT_STORE", body,
      contact.name || incoming.profileName, "", id, account.tenantId);
  };

  const save = async (nextState: string, patch: Record<string, unknown> = {}) => {
    await updateConversation(conversation.id, {
      current_module: "TENANT_STORE",
      current_state: nextState,
      context_json: { ...context, ...patch },
    }, account.tenantId);
  };

  const money = (n: number) => `₦${Number(n || 0).toLocaleString("en-NG")}`;
  const productPrice = (p: any) => Number(p.price ?? 0);
  const productStock = (p: any) => p.stock_quantity == null ? null : Number(p.stock_quantity);

  if (["cancel", "cancel checkout", "stop"].includes(message)) {
    await save("IDLE", { store_checkout: null });
    await send("Checkout cancelled. Your cart is still saved. Reply *cart* to view it or *menu* to shop.");
    return;
  }

  if (["cart", "my cart", "view cart", "2"].includes(message)) {
    if (!cart.length) {
      await send("🛒 Your cart is empty. Reply *menu* to browse products.");
      return;
    }
    const lines = cart.map((item, i) => `${i + 1}. ${item.name} × ${item.quantity} — ${money(item.price * item.quantity)}`);
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    await send(`🛒 *Your cart*\n\n${lines.join("\n")}\n\n*Products subtotal: ${money(total)}*\n\nReply *remove product name* to remove an item, *clear cart* to empty it, or *checkout* to continue.`);
    return;
  }

  if (message === "clear cart") {
    await save("IDLE", { store_cart: [], store_checkout: null });
    await send("Your cart has been cleared. Reply *menu* to continue shopping.");
    return;
  }

  if (message.startsWith("remove ")) {
    const term = message.slice(7).trim();
    const next = cart.filter(item => item.name.toLowerCase() !== term && !item.name.toLowerCase().includes(term));
    if (next.length === cart.length) {
      await send("I couldn't find that item in your cart. Reply *cart* to see the exact product names.");
    } else {
      await save("IDLE", { store_cart: next });
      await send("Item removed. Reply *cart* to review your updated cart.");
    }
    return;
  }

  if (message === "checkout" || message === "buy now") {
    if (!cart.length) {
      await send("Your cart is empty. Reply *menu* to choose products first.");
      return;
    }
    await save("CHECKOUT_NAME", { store_checkout: { name: "", email: "", address: "", payment_method: "" } });
    await send("Let's complete your order.\n\nPlease enter your *full name*.");
    return;
  }

  // Continue the persisted checkout conversation.
  if (state.startsWith("CHECKOUT_")) {
    const checkout = { ...(context.store_checkout || {}) };
    if (state === "CHECKOUT_NAME") {
      if (raw.length < 2 || raw.length > 100) {
        await send("Please enter your full name so the merchant can identify your order.");
        return;
      }
      checkout.name = raw;
      await save("CHECKOUT_EMAIL", { store_checkout: checkout });
      await send("Thank you. Now enter your *email address* for your order confirmation and delivery updates.");
      return;
    }
    if (state === "CHECKOUT_EMAIL") {
      const email = raw.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        await send("That email address doesn't look valid. Please enter it again (example: name@gmail.com).");
        return;
      }
      checkout.email = email;
      await save("CHECKOUT_ADDRESS", { store_checkout: checkout });
      await send("Please enter your *full delivery address*, including area and city.");
      return;
    }
    if (state === "CHECKOUT_ADDRESS") {
      if (raw.length < 8) {
        await send("Please provide a more complete delivery address, including area and city.");
        return;
      }
      checkout.address = raw;
      await save("CHECKOUT_PAYMENT", { store_checkout: checkout });
      const tenantResult = await supabase.from("tenants")
        .select("pod_enabled,shipping_enabled,shipping_fee")
        .eq("id", account.tenantId).maybeSingle();
      const podAvailable = tenantResult.data?.pod_enabled === true &&
        tenantResult.data?.shipping_enabled === true && Number(tenantResult.data?.shipping_fee || 0) > 0;
      await send(`Choose how you want to pay:\n\nReply *ONLINE* to pay for the products and delivery now.${podAvailable ? "\nReply *POD* to pay the delivery fee now and the product balance when your order arrives." : ""}\n\nYour WhatsApp number will be used for order updates.`);
      return;
    }
    if (state === "CHECKOUT_PAYMENT") {
      const paymentMethod = message === "pod" || message === "pay on delivery" ? "POD"
        : message === "online" || message === "pay now" ? "ONLINE" : "";
      if (!paymentMethod) {
        await send("Please reply *ONLINE* or *POD* to choose a payment method.");
        return;
      }
      if (!cart.length) {
        await save("IDLE", { store_checkout: null });
        await send("Your cart is empty. Reply *menu* to shop again.");
        return;
      }
      await send("⏳ Creating your order and preparing checkout. Please wait...");
      try {
        const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/order-api`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": Deno.env.get("SUPABASE_ANON_KEY") || "",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") || ""}`,
          },
          body: JSON.stringify({
            action: "create_cart",
            items: cart.map(item => ({ product_id: item.product_id, quantity: item.quantity })),
            customer_name: checkout.name,
            customer_phone: phone,
            customer_email: checkout.email,
            delivery_address: checkout.address,
            payment_method: paymentMethod,
          }),
        });
        const result = await response.json();
        if (result.order_created && result.order_number) {
          await save("ORDER_PAYMENT_PENDING", {
            store_last_order: result.order_number,
            store_checkout: null,
          });
          await send(`Your order *${result.order_number}* has been recorded, but payment setup is not ready yet. The merchant needs to complete Paystack verification. Please contact the shop before making another order.`);
          return;
        }
        if (!response.ok || result.success !== true) {
          await send(result.message || "I couldn't complete checkout. Your cart is saved; reply *checkout* to try again or *agent* to contact the shop.");
          return;
        }
        await save("ORDER_AWAITING_PAYMENT", {
          store_last_order: result.order_number,
          store_last_payment_reference: result.payment_reference,
          store_checkout: null,
          store_cart: [],
        });
        await send(`✅ *Order created: ${result.order_number}*\n\nProducts: ${money(Number(result.subtotal))}\nDelivery: ${money(Number(result.delivery_fee))}\nPayment due now: ${money(Number(result.payment_amount))}\n\nComplete your secure Paystack payment here:\n${result.authorization_url}\n\nYour order will be confirmed after Paystack verifies the payment. We will send updates to this WhatsApp number and ${checkout.email}.`);
      } catch (error) {
        safeErrorLog("tenantStore.checkout", error);
        await send("The checkout service is temporarily unavailable. Your cart is saved. Please try *checkout* again shortly.");
      }
      return;
    }
  }

  if (["hi", "hello", "hey", "menu", "start", "shop", "catalogue", "catalog", "products", ""].includes(message)) {
    if (!products.length) {
      await send(`${greeting}\n\nOur product catalogue is being updated. Please contact the business for assistance.`);
      return;
    }
    const categories = [...new Set(products.map(p => String((p as any).category || "Other")).filter(Boolean))];
    const list = products.slice(0, 10).map((p: any, i: number) =>
      `${i + 1}. *${p.name}* — ${p.price_text || money(productPrice(p))}${productStock(p) === null ? "" : productStock(p) <= 0 ? " (Out of stock)" : ""}`
    );
    await save("IDLE", { store_page: 0 });
    await send(`${greeting}\n\n🛍️ *Welcome to ${account.businessName}*\nBrowse our real products below.\n\n${list.join("\n")}\n\nReply with a product name for details. To add one, reply *ADD product name*.\n\nCategories: ${categories.join(", ")}\n\nReply *cart* to view your basket or *more* to see more products.`);
    return;
  }

  if (message === "more" || message.startsWith("more ")) {
    const page = Number(context.store_page || 0) + 1;
    const slice = products.slice(page * 10, (page + 1) * 10);
    if (!slice.length) {
      await send("You've reached the end of the catalogue. Reply *menu* to start again or *cart* to view your basket.");
      return;
    }
    await save("IDLE", { store_page: page });
    await send(slice.map((p: any, i: number) =>
      `${page * 10 + i + 1}. *${p.name}* — ${p.price_text || money(productPrice(p))}`
    ).join("\n") + "\n\nReply with a product name or *ADD product name*.");
    return;
  }

  if (message.startsWith("category ")) {
    const category = message.slice(9).trim();
    const matches = products.filter(p => String((p as any).category || "").toLowerCase().includes(category));
    if (!matches.length) await send("I couldn't find that category. Reply *menu* to see available categories.");
    else await send(matches.slice(0, 20).map((p: any) => `• *${p.name}* — ${p.price_text || money(productPrice(p))}`).join("\n") + "\n\nReply with a product name to view it.");
    return;
  }

  const addCommand = message.match(/^add\s+(.+?)(?:\s+x(\d+))?$/i);
  const searchTerm = addCommand ? addCommand[1].trim() : message;
  const match = products.find((p: any) => {
    const name = String(p.name || "").toLowerCase();
    const slug = String(p.slug || "").toLowerCase();
    return searchTerm === name || searchTerm === slug || (name.length > 2 && searchTerm.includes(name));
  });

  if (!match) {
    await send(`I couldn't find that product in *${account.businessName}*. Reply *menu* to browse, *cart* to view your cart, or *agent* to contact the shop.`);
    return;
  }

  const price = productPrice(match);
  if (!Number.isFinite(price) || price <= 0) {
    await send(`*${match.name}*\n\nPlease contact the shop for the current price before ordering.`);
    return;
  }
  const stock = productStock(match);
  if (stock !== null && stock <= 0) {
    await send(`Sorry, *${match.name}* is currently out of stock. Reply *menu* to choose another product.`);
    return;
  }

  if (addCommand) {
    const quantity = Math.max(1, Math.min(100, Number(addCommand[2] || 1)));
    if (stock !== null && stock < quantity) {
      await send(`Only ${stock} unit(s) of *${match.name}* are currently available.`);
      return;
    }
    const existing = cart.find(item => item.product_id === match.id);
    const next = existing
      ? cart.map(item => item.product_id === match.id ? { ...item, quantity: item.quantity + quantity } : item)
      : [...cart, { product_id: String(match.id), name: String(match.name), price, quantity }];
    await save("IDLE", { store_cart: next });
    await send(`🛒 Added *${quantity} × ${match.name}* to your cart.\n\nReply *cart* to review or *checkout* when ready.`);
    return;
  }

  const details = `* ${match.name} *\n\n${match.description || "Contact the shop for more information."}\n\nPrice: *${match.price_text || money(price)}*\nStock available: *${stock === null ? "Please confirm with shop" : stock}*\n\nReply *ADD ${match.name}* to add one to your cart. You can also say *ADD ${match.name} x2*.\nReply *menu* to browse more products.`;
  const imageUrl = String(match.image_url || "").trim();
  await send(details, imageUrl.startsWith("https://") || imageUrl.startsWith("http://") ? imageUrl : undefined);
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
        conversation,
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
        account.isSystem,
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

    // A practice answer is usually a single letter (A-D), so it cannot
    // reliably trigger keyword-based course routing. Honour the persisted
    // quiz state even if another menu has changed current_module.
    if (conversation.current_state === "PRACTICE_QUESTION") {
      await handleLearning(
        phone,
        text,
        contact,
        {
          ...conversation,
          current_module: "LEARNING",
        } as Conversation,
      );
      return;
    }

    // ===================================================
    // EXPLICIT ENGR ERO LEARNING ROUTE
    // ===================================================

    const isLearningCourseAction =
      interactiveId.startsWith("cm_");

    if (
      interactiveId === "engr_ero" ||
      isLearningCourseAction ||
      isEngrEroRequest(text) ||
      isLearningKeyword(text)
    ) {
      // Course-menu list replies must continue the existing course session.
      // Do not reset a student to registration/ENTRY when they tap Lecture,
      // Materials, Progress or Final CBT Exam.
      const savedLearningContext = (
        conversation.context_json || {}
      ) as Record<string, any>;
      const nextLearningState = isLearningCourseAction
        ? (conversation.current_state === "SABI_GATEWAY"
            ? (savedLearningContext.courseId ? "COURSE_MENU" : "ENTRY")
            : (conversation.current_state || (savedLearningContext.courseId ? "COURSE_MENU" : "ENTRY")))
        : "ENTRY";
      const nextLearningContext = isLearningCourseAction
        ? { ...savedLearningContext, learningUnlocked: true }
        : { learningUnlocked: true, step: "ENTRY" };

      await updateConversation(
        conversation.id,
        {
          current_module: "LEARNING",
          current_state: nextLearningState,
          context_json: nextLearningContext,
        },
        tenantId,
      );

      const learningConversation = {
        ...conversation,
        current_module: "LEARNING",
        current_state: nextLearningState,
        context_json: nextLearningContext,
      } as Conversation;

      await handleLearning(
        phone,
        text,
        contact,
        learningConversation,
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

    if (
      interactiveId === "sabi_about" ||
      lowerText === "learn about sabi" ||
      lowerText === "about sabi" ||
      lowerText === "what is sabi" ||
      lowerText === "tell me about sabi"
    ) {
      await sendTextMessage(
        phone,
        "ℹ️ *GET TO KNOW SABI BY XTOP*\\n\\nSabi is a WhatsApp-powered commerce assistant that helps businesses display products, guide customers through shopping, receive orders and organise everyday sales activities. It connects the convenience of WhatsApp with a merchant dashboard for managing your shop.\\n\\nIt is designed for fashion and beauty stores, food vendors, phone and electronics sellers, supermarkets, distributors, home businesses and other growing retail businesses.",
      );

      await sendTextMessage(
        phone,
        "🛍️ *WHAT YOUR CUSTOMERS CAN DO*\\n\\n• Chat with your business on WhatsApp.\\n• Browse product categories and available items.\\n• View product information, pictures and prices.\\n• Add items to a shopping cart and review an order.\\n• Provide their contact and delivery details.\\n• Pay online where payment is available, or choose pay-on-delivery when your business has enabled it.\\n• Receive order updates and ask for human assistance when needed.\\n\\nYour customers do not need to download a separate shopping app to use the WhatsApp shopping conversation.",
      );

      await sendTextMessage(
        phone,
        "🏪 *WHAT SABI HELPS YOUR BUSINESS MANAGE*\\n\\n• Present your products in an organised WhatsApp shopping experience.\\n• Add and update product names, prices, descriptions, categories and pictures.\\n• Receive customer orders with the details needed to process them.\\n• Review and manage orders from your merchant dashboard.\\n• Configure delivery options, delivery fees and pay-on-delivery where supported.\\n• Set up payment collection and eligible merchant payouts through the payment provider.\\n• Share products and help customers discover what you sell.\\n\\nSabi helps reduce repetitive replies and scattered order details. You remain in control of your products, prices, fulfilment and customer relationships.",
      );

      await sendTextMessage(
        phone,
        "💳 *COST, PAYMENTS & YOUR NUMBER*\\n\\n• There is no monthly Sabi subscription and no paid Sabi trial.\\n• Payment-provider or WhatsApp/Meta charges may apply separately under their own terms.\\n• Sabi applies a transaction-based service commission to eligible Paystack payments; delivery fees are excluded from the sales-commission calculation.\\n• Sabi automation is intended for a dedicated business WhatsApp number, so your personal WhatsApp can remain separate.\\n\\n🚀 *HOW TO GET STARTED*\\n1. Choose *Register My Business* below.\\n2. Follow the WhatsApp registration instructions.\\n3. Connect your dedicated business number through Meta's secure WhatsApp connection process.\\n4. Complete your merchant dashboard account setup.\\n5. Add your products, configure your delivery and payment settings, then invite customers to shop.\\n\\nYou can try the sample shop first. The demo lets you experience the customer shopping journey; demo checkout is a simulation and does not collect a real payment.",
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

    // Continue an active Engr Ero learning session.
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
    // SABI + ENGR ERO ONLY
    // ===================================================
    // Engr Ero is routed explicitly above. Sabi registration, support,
    // shop demo and gateway actions are also handled above. Do not expose
    // the retired XTOP Retail services, products, demos or sales bot here.
    await showSabiWelcomeMenu(
      phone,
      conversation.id,
    );
    return;

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
