
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
  sendCtaUrlMessage,
  sendListMessage,
  sendButtonMessage,
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
import { handleSabiWhatsAppAI } from "./sabi-ai-whatsapp.ts";
import { interpretMerchantMessage } from "./merchant-ai.ts";

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
import { startVehicleDiagnosis, handleVehicleDiagnosis } from "./modules/vehicle-diagnosis.ts";

import {
  handleSales,
  showServiceTypeSelector,
} from "./modules/sales.ts";

import { handleExams, handleExamPaymentRecovery, handleActiveExamRecovery, handleEla401CbtContinuation, handleCourseCbtContinuation } from "./modules/exams.ts";

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

async function notifySabiSupportAdmin(
  customerPhone: string,
  customerName: string,
  message: string,
): Promise<boolean> {
  const configuredAdmin = String(Deno.env.get("XTOP_ADMIN_PHONE") || "").replace(/\D/g, "");
  if (!configuredAdmin) {
    console.error("[Sabi Support] XTOP_ADMIN_PHONE is not configured; handoff notification not sent.");
    return false;
  }

  const safeName = String(customerName || "WhatsApp customer").replace(/[\r\n]/g, " ").slice(0, 70);
  const safeMessage = String(message || "(Customer opened a support request)").slice(0, 2500);
  const sent = await sendTextMessage(
    configuredAdmin,
    [
      "🔔 *NEW SABI CUSTOMER SUPPORT REQUEST*",
      "",
      "Customer: " + safeName,
      "WhatsApp: " + customerPhone,
      "",
      "Message:",
      safeMessage,
      "",
      "To reply, send this to the Sabi number:",
      "reply " + customerPhone + " <your message>",
      "",
      "Open Lizzy → Customer Support Inbox to review active handoffs.",
    ].join("\n"),
  );
  return !!sent;
}

// =====================================================
// TENANT RESOLUTION
// =====================================================

interface ResolvedBotAccount {
  tenantId: string;
  credentials?: WhatsAppCredentials;
  isSystem: boolean;
  businessName: string;
  logoUrl: string | null;
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
      logoUrl: null,
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
      "id, name, business_name, logo_url, welcome_greeting, is_active, metadata",
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

    logoUrl: tenant.logo_url || null,

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

  // Automatic, unobtrusive Sabi attribution on every merchant-bot reply.
  // This runs only for resolved merchant tenants, never the XTOP system bot.
  const send = async (body: string, imageUrl?: string) => {
    const cleanBody = String(body || "").trim();
    const brandedBody = /powered by sabi/i.test(cleanBody)
      ? cleanBody
      : `${cleanBody}${cleanBody ? "\n\n" : ""}_Powered by Sabi by XTOP_`;
    const id = imageUrl
      ? await sendImageMessage(phone, imageUrl, brandedBody, credentials)
      : await sendTextMessage(phone, brandedBody, credentials);
    if (!id) {
      safeErrorLog("tenantStore.send", new Error("WhatsApp send failed"));
      return;
    }
    await storeMessage(contact.id, "OUTBOUND", imageUrl ? "image" : "text", brandedBody, id, account.tenantId);
    await logBotActivity(phone, "OUTBOUND", imageUrl ? "image" : "text", "TENANT_STORE", brandedBody,
      contact.name || incoming.profileName, "", id, account.tenantId);
  };


  // Text-first shopping: customers can reply with a number or the item/action name.
  // Save the numbered choices per conversation; no WhatsApp list/reply buttons are required.
  const sendShopList = async (body: string, rows: Array<{id:string;title:string;description?:string}>) => {
    const options = rows.slice(0, 10);
    const { data: latestConversation, error: menuContextError } = await supabase
      .from("conversations")
      .select("context_json")
      .eq("tenant_id", account.tenantId)
      .eq("id", conversation.id)
      .maybeSingle();
    if (menuContextError) safeErrorLog("tenantStore.textMenuContext", menuContextError);
    await updateConversation(conversation.id, {
      context_json: {
        ...((latestConversation?.context_json || context) as Record<string, any>),
        store_text_options: options.map((row) => ({ id: row.id, title: row.title })),
      },
    }, account.tenantId);
    const menu = options.map((row, index) =>
      `${index + 1}. *${row.title}*${row.description ? " — " + row.description : ""}`
    ).join("\n");
    await send(`${body}\n\n${menu}\n\nReply with the *number* or *name* of your choice. You can also type what you want in your own words.`);
  };
  const sendShopButtons = async (body:string, buttons:Array<{id:string;title:string}>) => {
    await sendShopList(body, buttons);
  };
  const showShopProduct = async (p:any) => {
    const price=productPrice(p), stock=productStock(p);
    const body=`🛍️ *${p.name}*\n\n${p.description||"Contact the shop for more information."}\n\nPrice: *${p.price_text||money(price)}*\nAvailability: *${stock===null?"Please confirm with shop":stock>0?stock+" in stock":"Out of stock"}*\n\nWould you like to add this item to your cart?`;
    const image=String(p.image_url||"").trim();
    await send(body,image.startsWith("https://")||image.startsWith("http://")?image:undefined);
    await sendShopButtons("Choose your next step:",stock===null||stock>0?[
      {id:`store_add:${p.id}`,title:"Add to Cart"},{id:"store_products",title:"Keep Shopping"},{id:"store_cart",title:"View Cart"}
    ]:[{id:"store_products",title:"Keep Shopping"},{id:"store_cart",title:"View Cart"}]);
  };
  const showShopPage = async (page=0, source:any[]=products) => {
    const size=7, pages=Math.max(1,Math.ceil(source.length/size)), current=Math.max(0,Math.min(page,pages-1));
    const rows: Array<{id:string;title:string;description?:string}> = [{id:"store_agent",title:"💬 Speak to an Agent",description:"Talk directly to the shop team"}, ...source.slice(current*size,(current+1)*size).map((p:any)=>({id:`store_product:${p.id}`,title:String(p.name||"Product").slice(0,24),description:money(productPrice(p)).slice(0,72)}))];
    if(current>0) rows.push({id:"store_prev",title:"⬅️ Previous page"});
    if(current<pages-1) rows.push({id:"store_next",title:"Next page ➡️"});
    rows.push({id:"store_categories",title:"Browse categories"},{id:"store_cart",title:"🛒 View cart"});
    await save("IDLE",{store_page:current});
    await sendShopList(`Browse ${source.length} product(s). Page ${current+1} of ${pages}. Select a product to view its picture, details and price.`,rows);
  };
  const sendSabiDiscovery = async () => {
    const body = "_Powered by Sabi by XTOP_";
    const footer = "Discover the platform behind this shop";
    const id = await sendCtaUrlMessage(
      phone,
      body,
      "Discover Sabi",
      "https://xtopbot.netlify.app",
      footer,
      credentials,
    );
    if (!id) {
      safeErrorLog("tenantStore.sabiDiscovery", new Error("WhatsApp CTA URL send failed"));
      return;
    }
    await storeMessage(contact.id, "OUTBOUND", "interactive", body, id, account.tenantId);
    await logBotActivity(
      phone, "OUTBOUND", "interactive", "TENANT_STORE", body,
      contact.name || incoming.profileName, "", id, account.tenantId,
    );
  };

  let raw = String(incoming.interactiveId || incoming.text || "").trim();
  let message = raw.toLowerCase();
  const savedTextOptions = Array.isArray(context.store_text_options) ? context.store_text_options : [];
  if (!incoming.interactiveId && /^\\d{1,2}$/.test(message)) {
    const selected = savedTextOptions[Number(message) - 1];
    if (selected?.id) {
      raw = String(selected.id);
      message = raw.toLowerCase();
    }
  } else if (!incoming.interactiveId && savedTextOptions.length) {
    const selected = savedTextOptions.find((option: any) =>
      String(option?.title || "").trim().toLowerCase() === message
    );
    if (selected?.id) {
      raw = String(selected.id);
      message = raw.toLowerCase();
    }
  }
  const products = await getActiveProducts(account.tenantId);
  const greeting = account.welcomeGreeting || `Welcome to *${account.businessName}*.`;
  const context = (conversation.context_json || {}) as Record<string, any>;
  let cart: Array<{product_id:string;name:string;price:number;quantity:number}> =
    Array.isArray(context.store_cart) ? context.store_cart : [];
  const state = String(conversation.current_state || "IDLE");

  // Arena understands natural customer language, but it never writes commerce
  // records itself. Its validated command is fed into the existing tenant-
  // scoped product/cart/checkout handlers below.
  if (!incoming.interactiveId && (state === "IDLE" || state === "CHECKOUT_CONFIRM") && raw) {
    const aiIntent = await interpretMerchantMessage({
      message: raw,
      businessName: account.businessName,
      products,
      cart,
      state,
    });
    if (aiIntent?.type === "reply") {
      await send(aiIntent.reply);
      await logBotActivity(
        phone, "OUTBOUND", "text", "SABI_MERCHANT_AI", aiIntent.reply,
        contact.name || incoming.profileName || "", "", "", account.tenantId,
      );
      return;
    }
    if (aiIntent?.type === "command") {
      raw = aiIntent.command;
      message = raw.toLowerCase();
      console.log("[SABI_MERCHANT_AI] Interpreted customer request as:", message.split(" ")[0]);
    }
  }

  // Restore the exact saved order when a prior checkout cleared the cart but
  // the customer later retries ONLINE. Never trust an order number alone:
  // verify tenant, WhatsApp sender, order status and payment method first.
  if (message === "online" && context.store_last_order && cart.length === 0) {
    const { data: savedOrder, error: savedOrderError } = await supabase
      .from("tenant_orders")
      .select("id,order_number,customer_name,customer_phone,delivery_address,status,payment_status,payment_method,source")
      .eq("tenant_id", account.tenantId)
      .eq("order_number", String(context.store_last_order))
      .eq("customer_phone", phone)
      .maybeSingle();
    if (savedOrderError) safeErrorLog("tenantStore.restoreCheckoutOrder", savedOrderError);

    if (savedOrder && savedOrder.status === "PENDING" &&
        savedOrder.payment_status === "UNPAID" &&
        savedOrder.payment_method === "ONLINE" && savedOrder.source === "WHATSAPP") {
      const [{ data: savedItems, error: itemsError }, { data: savedIntent, error: intentError }] = await Promise.all([
        supabase.from("tenant_order_items")
          .select("product_id,product_name,quantity,unit_price")
          .eq("tenant_id", account.tenantId).eq("order_id", savedOrder.id),
        supabase.from("tenant_order_payment_intents")
          .select("customer_email,reference")
          .eq("tenant_id", account.tenantId).eq("order_id", savedOrder.id)
          .eq("payment_type", "ONLINE_ORDER").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (itemsError) safeErrorLog("tenantStore.restoreCheckoutItems", itemsError);
      if (intentError) safeErrorLog("tenantStore.restoreCheckoutIntent", intentError);
      if (!itemsError && !intentError && Array.isArray(savedItems) && savedItems.length && savedIntent?.customer_email) {
        cart = savedItems.map((item: any) => ({
          product_id: String(item.product_id),
          name: String(item.product_name),
          price: Number(item.unit_price),
          quantity: Number(item.quantity),
        }));
        context.store_cart = cart;
        context.store_checkout = {
          name: String(savedOrder.customer_name || ""),
          email: String(savedIntent.customer_email),
          address: String(savedOrder.delivery_address || ""),
          payment_method: "ONLINE",
        };
        context.store_last_payment_reference = String(savedIntent.reference || context.store_last_payment_reference || "");
      }
    }
  }

  // Retry is valid only when the saved order and its original cart were restored.
  const isPaymentRetry = message === "online" &&
    Boolean(context.store_last_order) && cart.length > 0 &&
    Boolean(context.store_checkout?.email && context.store_checkout?.name && context.store_checkout?.address);

  if (["agent", "human", "talk to human", "customer service", "speak to an agent", "store_support", "store_agent"].includes(message) || incoming.interactiveId === "store_support" || incoming.interactiveId === "store_agent") {
    await supabase.from("contacts").update({ agent_mode: true }).eq("tenant_id", account.tenantId).eq("id", contact.id);
    await updateConversation(conversation.id, {
      current_module: "TENANT_STORE",
      current_state: "AGENT_TAKEOVER",
      context_json: { ...context, agent_takeover: true, agent_mode: true },
      agent_mode: true,
    }, account.tenantId);
    await send(`👤 *You have requested customer service*\n\nYour message has been added to ${account.businessName}’s Sabi Customer Service inbox. A member of the shop team can now take over this conversation.\n\nPlease type your question or describe the issue. Automated shop replies are paused until the team resumes the bot.\n\nType *resume bot* only if you want to return to automated assistance.`);
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


  // Recognise customer payment-confirmation messages before product search.
  // The customer's text is never trusted as proof: order/payment state is read
  // from this tenant's database and matched to the sender's WhatsApp number.
  const paymentConfirmationIntent =
    /\b(payment\s+(?:has\s+been\s+)?confirmed|payment\s+(?:was\s+)?successful|i\s+(?:have\s+)?paid|i\s+made\s+payment|paid\s+for\s+(?:my\s+)?order)\b/i.test(raw) ||
    /SABI-ORDER-[A-Z0-9-]+/i.test(raw);
  if (paymentConfirmationIntent) {
    const orderNumberMatch = raw.match(/SABI-\d{8}-[A-Z0-9]+/i);
    const paymentReferenceMatch = raw.match(/SABI-ORDER-[A-Z0-9-]+/i);
    const requestedOrder = (orderNumberMatch?.[0] || String(context.store_last_order || "")).trim().toUpperCase();
    const requestedReference = paymentReferenceMatch?.[0]?.trim();

    let order: any = null;
    let paymentIntent: any = null;

    if (requestedReference) {
      const { data: intent, error: intentError } = await supabase
        .from("tenant_order_payment_intents")
        .select("id,order_id,reference,status,paystack_status,expected_amount,completed_at")
        .eq("tenant_id", account.tenantId)
        .eq("reference", requestedReference)
        .maybeSingle();
      if (intentError) safeErrorLog("tenantStore.paymentConfirmation.intent", intentError);
      paymentIntent = intent || null;
      if (intent?.order_id) {
        const { data: referencedOrder, error: orderError } = await supabase
          .from("tenant_orders")
          .select("order_number,status,payment_status,shipping_payment_status,payment_method,created_at,subtotal,delivery_fee,total")
          .eq("tenant_id", account.tenantId)
          .eq("id", intent.order_id)
          .eq("customer_phone", phone)
          .maybeSingle();
        if (orderError) safeErrorLog("tenantStore.paymentConfirmation.orderByReference", orderError);
        order = referencedOrder || null;
      }
    } else if (requestedOrder) {
      const { data: numberedOrder, error: orderError } = await supabase
        .from("tenant_orders")
        .select("id,order_number,status,payment_status,shipping_payment_status,payment_method,created_at,subtotal,delivery_fee,total")
        .eq("tenant_id", account.tenantId)
        .eq("order_number", requestedOrder)
        .eq("customer_phone", phone)
        .maybeSingle();
      if (orderError) safeErrorLog("tenantStore.paymentConfirmation.orderByNumber", orderError);
      order = numberedOrder || null;
      if (order?.id) {
        const { data: intent, error: intentError } = await supabase
          .from("tenant_order_payment_intents")
          .select("id,order_id,reference,status,paystack_status,expected_amount,completed_at")
          .eq("tenant_id", account.tenantId)
          .eq("order_id", order.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (intentError) safeErrorLog("tenantStore.paymentConfirmation.intentByOrder", intentError);
        paymentIntent = intent || null;
      }
    }

    if (!order) {
      await send("I couldn't verify that payment against an order belonging to this WhatsApp number. Please check the order number or payment reference and send it again, or reply *agent* for help. Please don't make another payment until the shop checks it.");
      return;
    }

    const isPaid = String(order.payment_status || "").toUpperCase() === "PAID";
    const paymentLine = isPaid
      ? "✅ *Payment: CONFIRMED*"
      : "⏳ *Payment: NOT YET CONFIRMED*";
    const referenceLine = paymentIntent?.reference
      ? `\nPayment reference: ${paymentIntent.reference}`
      : "";
    const nextStep = isPaid
      ? "The shop can now process your order. You do not need to pay again."
      : "Please allow the payment verification process to complete. Do not pay again yet; contact the shop if the status does not update.";
    await send(`📦 *Order: ${order.order_number}*\n\n${paymentLine}\nOrder fulfilment: *${order.status}*\nDelivery payment: *${order.shipping_payment_status || "Not applicable"}*${referenceLine}\n\n${nextStep}\n\nReply *track ${order.order_number}* to check again, or *agent* to contact the shop.`);
    return;
  }

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

  const beginCheckoutReview = async () => {
    if (!cart.length) {
      await send("Your cart is empty. Browse products first.");
      return;
    }
    const refreshed: Array<{product_id:string;name:string;price:number;quantity:number}> = [];
    for (const item of cart) {
      const product = products.find((p: any) => String(p.id) === item.product_id);
      if (!product || product.is_active === false) {
        await send(`⚠️ *${item.name}* is no longer available. Please remove it or start a new order.`);
        return;
      }
      const stock = productStock(product);
      if (stock !== null && stock < item.quantity) {
        await send(`⚠️ Only *${stock}* unit(s) of *${product.name}* are currently available, but your cart has ${item.quantity}. Update your cart before checkout.`);
        return;
      }
      refreshed.push({
        product_id: String(product.id),
        name: String(product.name),
        price: productPrice(product),
        quantity: item.quantity,
      });
    }
    const subtotal = refreshed.reduce((sum, item) => sum + item.price * item.quantity, 0);
    await save("CHECKOUT_CONFIRM", {
      store_cart: refreshed,
      store_checkout: { name: "", email: "", address: "", payment_method: "" },
    });
    const lines = refreshed.map((item, index) =>
      `${index + 1}. *${item.name}* × ${item.quantity} — ${money(item.price * item.quantity)}`
    );
    await send(`🧾 *Please review your order*\n\n${lines.join("\n")}\n\n*Products subtotal: ${money(subtotal)}*\nDelivery and Sabi checkout fees will be shown before payment.\n\nConfirm this exact cart to continue, or edit it first.`);
    await sendShopButtons("Is this the cart you want to order?", [
      { id: "store_confirm_checkout", title: "Confirm Cart" },
      { id: "store_edit_cart", title: "Edit Cart" },
      { id: "store_new_order", title: "Start New Order" },
    ]);
  };


  if(message==="store_categories"){
    const cats=[...new Set(products.map((p:any)=>String(p.category||"Other").trim()).filter(Boolean))];
    const rows: Array<{id:string;title:string;description?:string}> = cats.slice(0,8).map((c:string)=>({id:`store_cat:${c}`,title:c.slice(0,24),description:`Browse ${c}`}));
    rows.push({id:"store_products",title:"All products"},{id:"store_cart",title:"🛒 View cart"});
    await sendShopList("Choose a category to browse.",rows);return;
  }
  if(message.startsWith("store_cat:")){
    const c=raw.slice(10).trim(), found=products.filter((p:any)=>String(p.category||"Other").toLowerCase()===c.toLowerCase());
    if(!found.length){await send("No products are listed in that category.");return;}
    await showShopPage(0,found);return;
  }
  if(message==="store_products"){await showShopPage(Number(context.store_page||0));return;}
  if(message==="store_next"||message==="store_prev"){await showShopPage(Number(context.store_page||0)+(message==="store_next"?1:-1));return;}
  if(message.startsWith("store_product:")){
    const p=products.find((x:any)=>String(x.id)===raw.slice(14).trim());
    if(!p){await send("That product is no longer available. Please refresh the catalogue.");return;}
    await showShopProduct(p);return;
  }
  if(message.startsWith("store_add:")){
    const p=products.find((x:any)=>String(x.id)===raw.slice(10).trim());
    if(!p){await send("That product is no longer available.");return;}
    const price=productPrice(p),stock=productStock(p);
    if(!Number.isFinite(price)||price<=0||(stock!==null&&stock<=0)){await send("This product cannot currently be added to your cart.");return;}
    const old=cart.find(x=>x.product_id===String(p.id));
    const next=old?cart.map(x=>x.product_id===String(p.id)?{...x,quantity:x.quantity+1}:x):[...cart,{product_id:String(p.id),name:String(p.name),price,quantity:1}];
    await save("IDLE",{store_cart:next});await send(`✅ Added *${p.name}* to your cart.`);
    await sendShopButtons("What would you like to do next?",[{id:"store_cart",title:"View Cart"},{id:"store_products",title:"Keep Shopping"},{id:"store_checkout",title:"Checkout"}]);return;
  }
  if(message==="store_cart"){
    if(!cart.length){await send("🛒 Your cart is empty.");return;}
    const subtotal=cart.reduce((n,x)=>n+x.price*x.quantity,0);
    await send(`🛒 *Your cart*\n\n${cart.map((x,i)=>`${i+1}. ${x.name} × ${x.quantity} — ${money(x.price*x.quantity)}`).join("\n")}\n\n*Products subtotal: ${money(subtotal)}*\nDelivery will be calculated from the shop's settings at checkout.`);
    await sendShopButtons("Choose an action:",[{id:"store_products",title:"Add More"},{id:"store_checkout",title:"Checkout"},{id:"store_clear",title:"Clear Cart"}]);return;
  }
  if(message==="store_clear"){await save("IDLE",{store_cart:[],store_checkout:null});await send("Your cart has been cleared.");await showShopPage(0);return;}
  if (message === "store_checkout" || message === "checkout" || message === "buy now") {
    await beginCheckoutReview();
    return;
  }
  if (message === "store_confirm_checkout" || message === "confirm cart" ||
      (state === "CHECKOUT_CONFIRM" && /^(yes|yeah|yep|confirm|confirmed|proceed|continue|place order|go ahead|that is correct|that's correct)$/i.test(message))) {
    if (state !== "CHECKOUT_CONFIRM" || !cart.length) {
      await send("Please review your cart first. Reply *cart* and choose *Checkout*.");
      return;
    }
    await save("CHECKOUT_NAME", { store_checkout: { name: "", email: "", address: "", payment_method: "" } });
    await send("Confirmed. Let's complete your order. Please enter your *full name*.");
    return;
  }
  if (message === "store_edit_cart" || message === "edit cart") {
    await save("IDLE", { store_checkout: null });
    if (!cart.length) await send("Your cart is empty.");
    else {
      const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
      await send(`🛒 *Your cart*\n\n${cart.map((item, i) => `${i + 1}. ${item.name} × ${item.quantity} — ${money(item.price * item.quantity)}`).join("\n")}\n\n*Products subtotal: ${money(subtotal)}*\n\nReply *remove product name*, *clear cart*, or *checkout* when ready.`);
    }
    return;
  }
  if (message === "store_new_order" || message === "new order" || message === "start new order") {
    await save("IDLE", { store_cart: [], store_checkout: null });
    await send("🧹 Your previous cart has been cleared. Let's start a fresh order.");
    await showShopPage(0);
    return;
  }
  if(message.startsWith("search ")){
    const q=message.slice(7).trim(), terms=q.split(/\s+/).filter((x:string)=>x.length>1&&!/^\d/.test(x)&&!["under","below","less","than","up","to"].includes(x));
    const price=q.match(/(?:under|below|less than|up to)\s*₦?\s*(\d+(?:\.\d+)?)\s*(k)?/);
    const limit=price?Number(price[1])*(price[2]?1000:1):null;
    const found=products.filter((p:any)=>{
      const hay=[p.name,p.description,p.category,p.slug].join(" ").toLowerCase();
      const wordMatch=terms.length===0||terms.every((t:string)=>hay.includes(t));
      return wordMatch&&(limit===null||productPrice(p)<=limit);
    });
    if(!found.length){await send(`No products matched *${raw.slice(7)}*. Try another search or browse categories.`);return;}
    await showShopPage(0,found);return;
  }
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

  // Continue the persisted checkout conversation.
  if (state.startsWith("CHECKOUT_") || isPaymentRetry) {
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
      const [{ data: tenantSettings }, { data: deliverySettings }] = await Promise.all([
        supabase.from("tenants").select("pod_enabled,shipping_enabled,shipping_fee")
          .eq("id", account.tenantId).maybeSingle(),
        supabase.from("tenant_delivery_preferences")
          .select("pricing_enabled,base_fee,minimum_fee")
          .eq("tenant_id", account.tenantId).maybeSingle(),
      ]);
      const configuredDeliveryAmount = Number(tenantSettings?.shipping_fee || 0) > 0 ||
        (deliverySettings?.pricing_enabled === true &&
          (Number(deliverySettings.base_fee || 0) > 0 || Number(deliverySettings.minimum_fee || 0) > 0));
      const podAvailable = tenantSettings?.pod_enabled === true &&
        tenantSettings?.shipping_enabled === true && configuredDeliveryAmount;
      await send(`Choose how you want to pay:\n\nReply *ONLINE* to pay for the products and delivery now.${podAvailable ? "\nReply *POD* to pay the delivery fee now and the product balance when your order arrives." : ""}\n\nYour WhatsApp number will be used for order updates.`);
      return;
    }
    if (state === "CHECKOUT_PAYMENT" || isPaymentRetry) {
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
          await save("CHECKOUT_PAYMENT", {
            store_last_order: result.order_number,
            store_last_payment_reference: null,
          });
          const paymentHelp = result.error === "MERCHANT_SUBACCOUNT_NOT_VERIFIED"
            ? "The shop's Paystack account still needs verification."
            : "The payment link could not be prepared.";
          await send(`Your order *${result.order_number}* is safely recorded. ${paymentHelp}\n\nReply *ONLINE* to retry payment. Your existing order and reserved stock will be reused; you do not need to add the products again.`);
          return;
        }
        if (!response.ok || result.success !== true) {
          await send(result.message || "I couldn't complete checkout. Your cart is saved; reply *checkout* to try again or *agent* to contact the shop.");
          return;
        }
        // Track the WhatsApp checkout until Paystack confirms payment.
        // The cart row is tied to the created order so the reminder worker can
        // suppress reminders automatically once that order becomes PAID.
        try {
          const cartItems = cart.map((item) => ({
            product_id: item.product_id,
            name: item.name,
            unit_price: item.price,
            quantity: item.quantity,
          }));
          const firstProductId = String(cartItems[0]?.product_id || "");
          if (firstProductId && result.order_id && result.authorization_url) {
            const { data: existingCart, error: existingCartError } = await supabase
              .from("sabi_abandoned_carts")
              .select("id")
              .eq("tenant_id", account.tenantId)
              .eq("order_id", String(result.order_id))
              .maybeSingle();
            if (existingCartError) safeErrorLog("tenantStore.abandonedCart.lookup", existingCartError);
            const cartRow = {
              tenant_id: account.tenantId,
              product_id: firstProductId,
              customer_name: checkout.name,
              customer_email: checkout.email,
              customer_phone: phone,
              quantity: cartItems.reduce((sum, item) => sum + item.quantity, 0),
              cart_snapshot: {
                business_name: account.businessName,
                product_name: "your WhatsApp order",
                product_price: Number(result.subtotal || 0),
                items: cartItems,
                source: "WHATSAPP",
                order_number: result.order_number,
              },
              checkout_url: String(result.authorization_url),
              status: "ACTIVE",
              order_id: String(result.order_id),
              last_activity_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              reminder_sent_at: null,
              reminder_claimed_at: null,
            };
            const { error: cartSaveError } = existingCart?.id
              ? await supabase.from("sabi_abandoned_carts").update(cartRow).eq("id", existingCart.id)
              : await supabase.from("sabi_abandoned_carts").insert(cartRow);
            if (cartSaveError) safeErrorLog("tenantStore.abandonedCart.save", cartSaveError);
          }
        } catch (cartError) {
          safeErrorLog("tenantStore.abandonedCart.exception", cartError);
        }

        await save("ORDER_AWAITING_PAYMENT", {
          store_last_order: result.order_number,
          store_last_payment_reference: result.payment_reference,
          store_checkout: null,
          store_cart: [],
        });
        const paymentAmount = Number(result.payment_amount || 0);
        const commission = Number(result.sabi_commission || 0);
        const paystackFee = Number(result.paystack_processing_fee || 0);
        const deliveryMethodLabel = result.delivery_calculation === "GEOAPIFY_ROAD_DISTANCE"
          ? `Road distance: ${Number(result.delivery_distance_km || 0).toFixed(1)} km`
          : result.delivery_calculation === "MERCHANT_FLAT_FALLBACK"
            ? "Merchant flat-fee fallback"
            : "No delivery charge";
        await send(`✅ *Order created: ${result.order_number}*\n\nProducts: ${money(Number(result.subtotal))}\nDelivery: ${money(Number(result.delivery_fee))}\nDelivery method: ${deliveryMethodLabel}\nSabi commission: ${money(commission)}\nSabi service fee: ${money(Number(result.sabi_service_fee || 0))}\nPaystack processing fee: ${money(paystackFee)}\n*Total payment due: ${money(paymentAmount)}*\n\nComplete your secure Paystack payment here:\n${result.authorization_url}\n\nYour order will be confirmed after Paystack verifies the payment. We will send updates to this WhatsApp number and ${checkout.email}.`);
      } catch (error) {
        safeErrorLog("tenantStore.checkout", error);
        await send("The checkout service is temporarily unavailable. Your cart is saved. Please try *checkout* again shortly.");
      }
      return;
    }
  }

  // Discover's prefilled customer message is an opening greeting, not a product query.
  const isDiscoverIntro = /found your shop on sabi discover|would like to ask about your products and place an order/i.test(raw);

  const isCatalogueIntro = /^(?:(?:hi|hello|hey)[,!. ]*)?(?:what products (?:do you have|are available)|show me (?:the )?products|list (?:your )?products|i want to browse products|let me see (?:your )?products)\??$/i.test(raw);

  if (isDiscoverIntro || isCatalogueIntro || ["hi", "hello", "hey", "menu", "start", "shop", "catalogue", "catalog", "products", ""].includes(message)) {
    if (!products.length) {
      if (account.logoUrl) await send(greeting, account.logoUrl);
      await send("Our product catalogue is being updated. Please contact the business for assistance.");
      await sendSabiDiscovery();return;
    }
    if(account.logoUrl) await send(greeting,account.logoUrl);
    await send(`🛍️ *Welcome to ${account.businessName}*\n\nBrowse categories, search for products, view pictures and details, add items to your cart and checkout securely here on WhatsApp.\n\nType *search black shoe* or *search under 20k* to find products.`);
    await sendShopButtons("What would you like to do?",[{id:"store_categories",title:"Shop Categories"},{id:"store_products",title:"All Products"},{id:"store_cart",title:"View Cart"}]);
    await showShopPage(0);await sendSabiDiscovery();return;
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

    // Restore the ELA401 post-simulation handoff if Sabi's welcome menu
    // replaced the learning context before the student requested CBT payment.
    const cbtContinuationRequest =
      interactiveId === "cm_test" ||
      /^(?:4|final cbt exam|take course test)$/i.test(String(text || "").trim()) ||
      /(?:completed|finished)[\s\S]*(?:all[\s]+)?(?:my[\s]+)?lectures?[\s\S]*(?:cbt|exam|payment|continue|proceed)/i.test(String(text || "")) ||
      /(?:cbt|exam)[\s\S]*(?:payment|continue|proceed)[\s\S]*(?:completed|finished)[\s\S]*lectures?/i.test(String(text || "")) ||
      /(?:completed|finished).*(?:experiment\s*17|plug\s*assembly).*(?:final\s*cbt|cbt\s*payment|continue)/i.test(String(text || "")) ||
      /(?:final\s*cbt|cbt\s*payment).*(?:experiment\s*17|plug\s*assembly)/i.test(String(text || ""));
    if (cbtContinuationRequest) {
      if (await handleEla401CbtContinuation(phone, conversation.id, conversation)) return;
      if (await handleCourseCbtContinuation(phone, conversation.id, conversation)) return;
    }

    // Learning Centre controls belong to the system classroom, not the
    // Sabi merchant/support gateway. Route them before global Sabi pause,
    // agent-takeover, and merchant-store guards so lecture navigation cannot
    // be swallowed by an unrelated Sabi workflow.
    const savedLearningContextForNavigation = (
      conversation.context_json || {}
    ) as Record<string, any>;
    const isExplicitLearningMenuText =
      /^(course menu|learning centre menu|learning center menu|my results|final cbt exam)$/i.test(String(text || "").trim());

    if (
      tenantId === SYSTEM_TENANT_ID &&
      (
        interactiveId.startsWith("lsn_") ||
        interactiveId.startsWith("cm_") ||
        conversation.current_module === "LEARNING" ||
        (isExplicitLearningMenuText && !!savedLearningContextForNavigation.courseId)
      )
    ) {
      // Course-menu selections must be handled in COURSE_MENU state. Older
      // gateway states (for example SABI_GATEWAY) otherwise cause the menu to
      // be shown again instead of opening the selected lecture.
      const savedLearningContext = savedLearningContextForNavigation;
      const learningState =
        interactiveId.startsWith("cm_") || isExplicitLearningMenuText
          ? "COURSE_MENU"
          : (
              conversation.current_state === "SABI_GATEWAY" &&
              savedLearningContext.courseId
                ? "COURSE_MENU"
                : (conversation.current_state || "ENTRY")
            );
      await handleLearning(
        phone,
        interactiveId || text,
        contact,
        {
          ...conversation,
          current_module: "LEARNING",
          current_state: learningState,
          context_json: {
            ...savedLearningContext,
            ...(learningState === "COURSE_MENU" ? { step: "COURSE_MENU", learningUnlocked: true } : {}),
          },
        } as Conversation,
      );
      return;
    }

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

      // Allow the customer or shop team to end an individual handoff.
      // Accept common variants/typos so the pause cannot trap the conversation.
      const resumeCommand = String(incoming.text || incoming.interactiveId || "")
        .trim()
        .toLowerCase()
        .replace(/[.!?]/g, "")
        .replace(/\s+/g, " ");
      const isResumeCommand = [
        "end agent",
        "end angent",
        "end human",
        "resume bot",
        "start bot",
        "bot on",
        "resume automation",
      ].includes(resumeCommand);

      if (merchantAgentTakeover && isResumeCommand) {
        const { error: contactResumeError } = await supabase
          .from("contacts")
          .update({ agent_mode: false })
          .eq("tenant_id", account.tenantId)
          .eq("id", contact.id);
        if (contactResumeError) safeErrorLog("tenantStore.resumeContact", contactResumeError);

        const resumedContext = { ...merchantContext };
        delete resumedContext.agent_takeover;
        delete resumedContext.agent_mode;

        await updateConversation(conversation.id, {
          current_module: "TENANT_STORE",
          current_state: "IDLE",
          context_json: resumedContext,
          agent_mode: false,
        }, account.tenantId);

        const resumeReply = "✅ Human assistance has ended. Sabi's automated shop replies are active again. Reply *menu* to continue shopping.";
        const resumeMessageId = await sendTextMessage(
          phone,
          resumeReply,
          account.credentials,
        );
        if (resumeMessageId) {
          await storeMessage(
            contact.id,
            "OUTBOUND",
            "text",
            resumeReply,
            resumeMessageId,
            account.tenantId,
          );
          await logBotActivity(
            phone,
            "OUTBOUND",
            "text",
            "TENANT_STORE",
            resumeReply,
            contact.name || incoming.profileName || "",
            "",
            resumeMessageId,
            account.tenantId,
          );
        }
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

    const isSupportAdminCommand =
      text.trim().toLowerCase() === "support inbox" ||
      text.trim().toLowerCase() === "sabi support" ||
      interactiveId === "admin_sabi_support" ||
      /^reply\s+/i.test(text.trim());

    if (authorisedAdmin && (adminAgentActive || isSupportAdminCommand)) {
      if (!adminAgentActive) {
        await updateConversation(
          conversation.id,
          {
            current_module: "ADMIN_AGENT",
            current_state: "ACTIVE",
            context_json: { admin_agent_active: true },
          },
          tenantId,
        );
      }

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
      lowerText === "sabi_home" ||
      lowerText === "menu" ||
      lowerText === "main menu" ||
      lowerText === "sabi menu" ||
      lowerText === "home" ||
      lowerText === "start"
    ) {
      await showSabiWelcomeMenu(
        phone,
        conversation.id,
      );
      return;
    }

    // Standalone Engr. Ero Vehicle Diagnosis: independent of course registration.
    // Persisted diagnosis states take priority; explicit entry phrases open the mode selector.
    const vehicleDiagnosisState = String(conversation.current_state || "").startsWith("VEHICLE_DIAG_");
    const vehicleDiagnosisRequest = /^(vehicle diagnosis|vehicle fault diagnosis|automobile diagnosis|diagnose my car|car diagnosis|vehicle troubleshooting)$/i.test(String(text || "").trim());
    if (vehicleDiagnosisState) {
      await handleVehicleDiagnosis(phone, text, conversation);
      return;
    }
    if (interactiveId === "cm_auto_diag" || interactiveId === "vehicle_diagnosis" || vehicleDiagnosisRequest) {
      await startVehicleDiagnosis(phone, conversation);
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
        "ℹ️ *GET TO KNOW SABI BY XTOP*\n\nSabi is a WhatsApp-powered commerce assistant that helps businesses display products, guide customers through shopping, receive orders and organise everyday sales activities. It connects the convenience of WhatsApp with a merchant dashboard for managing your shop.\n\nIt is designed for fashion and beauty stores, food vendors, phone and electronics sellers, supermarkets, distributors, home businesses and other growing retail businesses.",
      );

      await sendTextMessage(
        phone,
        "🛍️ *WHAT YOUR CUSTOMERS CAN DO*\n\n• Chat with your business on WhatsApp.\n• Browse product categories and available items.\n• View product information, pictures and prices.\n• Add items to a shopping cart and review an order.\n• Provide their contact and delivery details.\n• Pay online where payment is available, or choose pay-on-delivery when your business has enabled it.\n• Receive order updates and ask for human assistance when needed.\n\nYour customers do not need to download a separate shopping app to use the WhatsApp shopping conversation.",
      );

      await sendTextMessage(
        phone,
        "🏪 *WHAT SABI HELPS YOUR BUSINESS MANAGE*\n\n• Present your products in an organised WhatsApp shopping experience.\n• Add and update product names, prices, descriptions, categories and pictures.\n• Receive customer orders with the details needed to process them.\n• Review and manage orders from your merchant dashboard.\n• Configure delivery options, delivery fees and pay-on-delivery where supported.\n• Set up payment collection and eligible merchant payouts through the payment provider.\n• Share products and help customers discover what you sell.\n\nSabi helps reduce repetitive replies and scattered order details. You remain in control of your products, prices, fulfilment and customer relationships.",
      );

      await sendTextMessage(
        phone,
        "💳 *COST, PAYMENTS & YOUR NUMBER*\n\n• There is no monthly Sabi subscription and no paid Sabi trial.\n• Payment-provider or WhatsApp/Meta charges may apply separately under their own terms.\n• Sabi applies a transaction-based service commission to eligible Paystack payments; delivery fees are excluded from the sales-commission calculation.\n• Sabi automation is intended for a dedicated business WhatsApp number, so your personal WhatsApp can remain separate.\n\n🚀 *HOW TO GET STARTED*\n1. Choose *Register My Business* below.\n2. Follow the WhatsApp registration instructions.\n3. Connect your dedicated business number through Meta's secure WhatsApp connection process.\n4. Complete your merchant dashboard account setup.\n5. Add your products, configure your delivery and payment settings, then invite customers to shop.\n\nYou can try the sample shop first. The demo lets you experience the customer shopping journey; demo checkout is a simulation and does not collect a real payment.",
      );

      await showSabiWelcomeMenu(
        phone,
        conversation.id,
      );
      return;
    }

    if (interactiveId === "sabi_support") {
      const saved = await updateConversation(
        conversation.id,
        {
          current_module: "SABI_GATEWAY",
          current_state: "SUPPORT",
          context_json: {
            sabi_gateway: true,
            sabi_support_waiting: true,
            sabi_support_opened_at: new Date().toISOString(),
          },
        },
        tenantId,
      );

      if (!saved) {
        await sendTextMessage(phone, "⚠️ Sabi Support could not open this request. Please try again in a moment.");
        return;
      }

      const notified = await notifySabiSupportAdmin(
        phone,
        contact.name || incoming.profileName || "WhatsApp customer",
        "Customer tapped *Talk to Support* and is waiting to speak with a human.",
      );

      await sendTextMessage(
        phone,
        notified
          ? "💬 *You're connected to Sabi Support*\n\nA support request has been sent to our team. Please type your question or describe the issue here. A human support agent will reply in this WhatsApp chat.\n\nYou can send more than one message. Type *END SUPPORT* whenever you want to return to the Sabi menu."
          : "💬 *Sabi Support Request Saved*\n\nYour request is saved, but our support notification could not be delivered. Please try again shortly or contact us again from the Sabi menu. We are sorry for the inconvenience.",
      );
      return;
    }

    // ===================================================
    // SABI SUPPORT MESSAGE — FORWARD TO SUPER ADMIN
    // ===================================================

    if (
      currentModule === "SABI_GATEWAY" &&
      conversation.current_state === "SUPPORT"
    ) {
      if (text.trim().toLowerCase() === "end support") {
        await updateConversation(
          conversation.id,
          {
            current_module: "SABI_GATEWAY",
            current_state: "MENU",
            context_json: { sabi_gateway: true },
          },
          tenantId,
        );
        await showSabiWelcomeMenu(phone, conversation.id);
        return;
      }

      const notified = await notifySabiSupportAdmin(
        phone,
        contact.name || incoming.profileName || "WhatsApp customer",
        text || "Customer sent a support message without text content.",
      );

      await sendTextMessage(
        phone,
        notified
          ? "✅ Your message has been forwarded to the Sabi support team. You can continue sending messages here; a human agent will respond in this chat."
          : "⚠️ Your message is saved, but we could not notify the support team just now. Please try again later.",
      );
      return;
    }

    // If the conversation already has the live exam context, process the
    // answer normally. Do not rebuild the context from stale DB state on every
    // answer; the attempt row is only the recovery source after context loss.
    if (currentModule === "EXAMS" && conversation.current_state === "IN_EXAM") {
      await handleExams(phone, text, contact, conversation);
      return;
    }

    // An in-progress CBT attempt takes priority over Sabi menus only when
    // another workflow has replaced the conversation module/context.
    if (await handleActiveExamRecovery(phone, text, contact, conversation)) {
      return;
    }

    // CBT payment controls must survive a return from Paystack or a Sabi
    // welcome-menu context change. Recover the pending payment by sender number.
    if (interactiveId.startsWith("cbt_") || /^(verify payment|paid|retry verification)$/i.test(String(text || "").trim()) || /completed.*cbt payment.*verify.*payment/i.test(String(text || "").trim())) {
      await handleExamPaymentRecovery(phone, interactiveId || text, contact, conversation);
      return;
    }

    // Route Learning Centre button payloads directly to the learning handler.
    // This keeps Next Section / Course Menu actions working even if another
    // workflow changed the conversation module between WhatsApp deliveries.
    if (
      currentModule === "LEARNING" ||
      interactiveId.startsWith("lsn_") ||
      interactiveId.startsWith("cm_")
    ) {
      await handleLearning(
        phone,
        text,
        contact,
        conversation,
      );
      return;
    }

    // ===================================================
    // SABI AI WHATSAPP FALLBACK
    // ===================================================
    // All Engr Ero learning, attendance, CBT, exam, vehicle-diagnosis,
    // admin and support routes have already been handled above. Only the
    // XTOP system Sabi line reaches this AI fallback; merchant bot accounts
    // returned earlier through their existing tenant-store workflow.
    if (account.isSystem && incoming.type === "text" && text.trim()) {
      if (!contact.id) {
        safeErrorLog(
          "SABI_AI_WHATSAPP.contact",
          new Error("A contact ID is required for Sabi AI conversation history."),
        );
        await showSabiWelcomeMenu(phone, conversation.id);
        return;
      }

      await handleSabiWhatsAppAI(
        incoming,
        text,
        contact,
        conversation,
      );
      return;
    }

    // Unknown interactive actions retain the existing Sabi menu fallback.
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
