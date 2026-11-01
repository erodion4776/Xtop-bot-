
import {
  getSupabaseClient,
  updateConversation,
  safeErrorLog,
} from "../database.ts";

import {
  sendTextMessage,
  sendButtonMessage,
  makeButton,
} from "../whatsapp.ts";

import { encryptToken } from "../lib/encryption.ts";
import {
  exchangeAuthCode,
  subscribeWebhook,
} from "../lib/meta-embedded-signup.ts";

const sb = getSupabaseClient();

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

const BASE_URL = (
  Deno.env.get("ONBOARDING_BASE_URL") ||
  "https://xtopbot.netlify.app"
).replace(/\/+$/, "");

export function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...corsHeaders,
    },
  });
}

// =====================================================
// 1. CREATE MERCHANT WHATSAPP REGISTRATION SESSION
// =====================================================

export async function createOnboardingSession(
  tenantId: string,
): Promise<string | null> {
  const sessionToken = crypto.randomUUID().replace(/-/g, "");

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  const { error } = await sb
    .from("onboarding_sessions")
    .insert({
      tenant_id: tenantId,
      session_token: sessionToken,
      package_code: null,
      status: "PENDING",
      expires_at: expiresAt.toISOString(),
    });

  if (error) {
    safeErrorLog("createOnboardingSession", error);
    return null;
  }

  return `${BASE_URL}/connect-whatsapp.html?token=${encodeURIComponent(sessionToken)}`;
}

// =====================================================
// 2. DEDICATED BUSINESS NUMBER WARNING
// =====================================================

const NUMBER_WARNING =
  "⚠️ *IMPORTANT: CHOOSE YOUR WHATSAPP NUMBER CAREFULLY*\n\n" +
  "To connect your business to Sabi, you need a dedicated business WhatsApp number.\n\n" +
  "Please read this before continuing:\n\n" +
  "1️⃣ Use a spare number dedicated to your business. We recommend a number you are not currently using for your personal WhatsApp conversations.\n\n" +
  "2️⃣ Once connected through Meta WhatsApp Business Platform, Sabi will use that number to receive and respond to your customers automatically.\n\n" +
  "3️⃣ Depending on Meta's supported setup and migration options, you may no longer be able to use that number with the normal WhatsApp or WhatsApp Business mobile app in the usual way.\n\n" +
  "4️⃣ Do not connect your main personal WhatsApp number unless you understand the migration implications and deliberately want to use it for this purpose.\n\n" +
  "5️⃣ Keep the SIM active and accessible. You may need it for verification.\n\n" +
  "✅ *RECOMMENDED:* Use a separate business number that you can dedicate to Sabi.\n\n" +
  "Your personal WhatsApp number is optional. It will remain separate and will NOT be connected to Sabi automation.";

// =====================================================
// 3. START MERCHANT REGISTRATION
// =====================================================

export async function startMerchantRegistration(
  phone: string,
  conversationId?: string,
): Promise<void> {
  try {
    await sendTextMessage(
      phone,
      "🏪 *REGISTER YOUR BUSINESS ON SABI BY XTOP*\n\n" +
        "Let's connect your business to Sabi so your customers can browse products, ask questions and place orders directly on WhatsApp.\n\n" +
        "Before we begin, please read this important information.",
    );

    await sendTextMessage(phone, NUMBER_WARNING);

    // Reuse a recent pending merchant registration for this phone.
    const { data: existingTenant, error: tenantLookupError } = await sb
      .from("tenants")
      .select("id")
      .eq("contact_phone", phone)
      .eq("is_active", false)
      .eq("is_system", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tenantLookupError) {
      safeErrorLog("onboarding.tenant.lookup", tenantLookupError);
    }

    let tenantId: string | null = existingTenant?.id || null;

    if (!tenantId) {
      const slug =
        `sabi-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

      const { data: tenant, error: tenantError } = await sb
        .from("tenants")
        .insert({
          name: `Sabi Business ${slug}`,
          slug,
          contact_phone: phone,
          is_system: false,
          is_active: false,
        })
        .select("id")
        .single();

      if (tenantError || !tenant) {
        safeErrorLog("onboarding.tenant.create", tenantError);

        await sendTextMessage(
          phone,
          "Sorry, we could not prepare your registration right now. Please try again later or contact our team.",
        );
        return;
      }

      tenantId = tenant.id;
    }

    // Reuse a valid pending session if one already exists.
    const { data: pendingSession, error: sessionLookupError } = await sb
      .from("onboarding_sessions")
      .select("session_token, expires_at")
      .eq("tenant_id", tenantId)
      .eq("status", "PENDING")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionLookupError) {
      safeErrorLog("onboarding.session.lookup", sessionLookupError);
    }

    let signupLink: string | null = null;

    if (
      pendingSession &&
      new Date(pendingSession.expires_at).getTime() > Date.now()
    ) {
      signupLink =
        `${BASE_URL}/connect-whatsapp.html?token=` +
        encodeURIComponent(pendingSession.session_token);
    } else {
      signupLink = await createOnboardingSession(tenantId);
    }

    if (!signupLink) {
      await sendTextMessage(
        phone,
        "We could not generate your registration link. Please try again.",
      );
      return;
    }

    if (conversationId) {
      await updateConversation(conversationId, {
        current_module: "ONBOARDING",
        current_state: "WHATSAPP_CONNECTION_PENDING",
        context_json: {
          registration_type: "SABI_MERCHANT",
          tenant_id: tenantId,
        },
      });
    }

    await sendTextMessage(
      phone,
      "✅ *YOUR REGISTRATION LINK IS READY*\n\n" +
        "Open the link below in your phone browser to connect your dedicated business WhatsApp number through Meta:\n\n" +
        signupLink +
        "\n\n⏰ This registration link expires in 24 hours.\n\n" +
        "After connecting WhatsApp, you will proceed to create your merchant dashboard login.\n\n" +
        "Your personal WhatsApp number is optional and will not be connected to Sabi.",
    );

    await sendButtonMessage(
      phone,
      "Need help with registration?",
      [
        makeButton("onboard_agent", "💬 Talk to Support"),
        makeButton("menu_home", "🏠 Main Menu"),
      ],
      "Sabi by XTOP",
    );
  } catch (error) {
    safeErrorLog("startMerchantRegistration", error);

    await sendTextMessage(
      phone,
      "Sorry, something went wrong while preparing your registration. Please try again shortly.",
    );
  }
}

// =====================================================
// 4. PUBLIC SABI DEMO STORE
// =====================================================

async function showStoreDemo(phone: string): Promise<void> {
  await sendTextMessage(
    phone,
    "🛍️ *WELCOME TO THE SABI DEMO STORE!*\n\n" +
      "This demonstrates how your own WhatsApp shop can work.\n\n" +
      "Customers can:\n\n" +
      "✅ Browse products\n" +
      "✅ Check prices\n" +
      "✅ Ask questions\n" +
      "✅ Place orders\n" +
      "✅ Speak with a human agent\n\n" +
      "Let's try it!",
  );

  await sendButtonMessage(
    phone,
    "What would you like to try?",
    [
      makeButton("demo_products", "🛍️ View Products"),
      makeButton("demo_order", "📦 Try an Order"),
      makeButton("demo_faq", "❓ Ask a Question"),
    ],
    "Sabi Demo Store",
  );
}

async function showDemoProducts(phone: string): Promise<void> {
  await sendTextMessage(
    phone,
    "🛍️ *DEMO STORE PRODUCTS*\n\n" +
      "1. Wireless Headphones — ₦18,000\n" +
      "2. Smart Watch — ₦25,000\n" +
      "3. Bluetooth Speaker — ₦15,000\n" +
      "4. Power Bank — ₦12,000\n\n" +
      "_These are sample products for demonstration only._",
  );

  await sendButtonMessage(
    phone,
    "Would you like to test the ordering process?",
    [
      makeButton("demo_order", "📦 Try an Order"),
      makeButton("demo_faq", "❓ Ask a Question"),
      makeButton("sabi_register", "🏪 Register My Business"),
    ],
    "Demo Store",
  );
}

async function showDemoOrder(phone: string): Promise<void> {
  await sendTextMessage(
    phone,
    "📦 *DEMO ORDER*\n\n" +
      "Product: Wireless Headphones\n" +
      "Quantity: 1\n" +
      "Price: ₦18,000\n" +
      "Delivery: ₦2,000\n" +
      "----------------------\n" +
      "*Demo Total: ₦20,000*\n\n" +
      "Your real business bot can collect customer details, confirm orders and send payment instructions.\n\n" +
      "⚠️ This is a sample order. No real order or payment has been created.",
  );

  await sendButtonMessage(
    phone,
    "That is how a customer order can look. What next?",
    [
      makeButton("demo_products", "🛍️ Products"),
      makeButton("demo_faq", "❓ FAQs"),
      makeButton("sabi_register", "🏪 Register My Business"),
    ],
    "Order Demonstration",
  );
}

async function showDemoFAQ(phone: string): Promise<void> {
  await sendTextMessage(
    phone,
    "❓ *DEMO STORE – FREQUENTLY ASKED QUESTIONS*\n\n" +
      "*Q: How long does delivery take?*\n" +
      "A: Usually 1–3 working days.\n\n" +
      "*Q: Can I pay on delivery?*\n" +
      "A: Payment options depend on the store's settings.\n\n" +
      "*Q: Can I speak with a person?*\n" +
      "A: Yes. The bot can hand your conversation to a human agent.\n\n" +
      "_Your own FAQs can be edited from your business dashboard._",
  );

  await sendButtonMessage(
    phone,
    "Would you like your own WhatsApp shop?",
    [
      makeButton("sabi_register", "🏪 Register My Business"),
      makeButton("demo_products", "🛍️ Products"),
      makeButton("onboard_agent", "💬 Talk to Agent"),
    ],
    "Sabi by XTOP",
  );
}

// =====================================================
// 5. WHATSAPP ONBOARDING TEXT HANDLER
// =====================================================

export async function handleOnboardingRequest(
  phone: string,
  text: string,
  _contactId: string,
  conversationId: string,
): Promise<boolean> {
  const lower = text.toLowerCase().trim();

  if (
    lower === "demo_products" ||
    lower === "view products"
  ) {
    await showDemoProducts(phone);
    return true;
  }

  if (
    lower === "demo_order" ||
    lower === "try an order"
  ) {
    await showDemoOrder(phone);
    return true;
  }

  if (
    lower === "demo_faq" ||
    lower === "ask a question"
  ) {
    await showDemoFAQ(phone);
    return true;
  }

  if (
    lower === "demo" ||
    lower === "try demo" ||
    lower === "demo_store"
  ) {
    await showStoreDemo(phone);
    return true;
  }

  if (
    lower === "sabi_register" ||
    lower === "register my business" ||
    lower === "register business" ||
    lower === "get my own bot" ||
    lower === "connect my whatsapp"
  ) {
    await startMerchantRegistration(phone, conversationId);
    return true;
  }

  if (
    lower === "onboard_agent" ||
    lower === "talk to agent"
  ) {
    await sendTextMessage(
      phone,
      "💬 *TALK TO THE XTOP TEAM*\n\n" +
        "Our team can help you set up Sabi for your business.\n\n" +
        "WhatsApp: +234 802 498 8555\n\n" +
        "Reply here with your question.",
    );
    return true;
  }

  return false;
}

// =====================================================
// 6. META EMBEDDED SIGNUP CALLBACK
// =====================================================

export async function handleOnboardingCallback(
  req: Request,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();

    const sessionToken = String(body.session_token || "").trim();
    const authCode = String(body.auth_code || "").trim();
    const wabaId = String(body.waba_id || "").trim();
    const phoneNumberId = String(body.phone_number_id || "").trim();

    if (!sessionToken || !authCode || !wabaId || !phoneNumberId) {
      return jsonResponse({
        error: "Missing session_token, auth_code, waba_id or phone_number_id.",
      }, 400);
    }

    const { data: session, error: sessionError } = await sb
      .from("onboarding_sessions")
      .select("*")
      .eq("session_token", sessionToken)
      .maybeSingle();

    if (sessionError) {
      safeErrorLog("onboarding.session.lookup", sessionError);
      return jsonResponse({ error: "Could not verify signup session." }, 500);
    }

    if (!session) {
      return jsonResponse({ error: "Invalid signup session." }, 404);
    }

    if (session.status === "WHATSAPP_CONNECTED") {
      return jsonResponse({
        success: true,
        message: "WhatsApp Business account is already connected.",
        phone_number_id: session.phone_number_id,
        dashboard_registration_required: true,
        session_token: sessionToken,
      });
    }

    if (session.status !== "PENDING") {
      return jsonResponse({
        error: "This signup session is no longer valid.",
      }, 409);
    }

    if (new Date(session.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: "Signup link has expired." }, 410);
    }

    if (!session.tenant_id) {
      return jsonResponse({ error: "Signup session has no tenant." }, 400);
    }

    // Ensure the selected WhatsApp number is not assigned to another tenant.
    const { data: existingAccount, error: existingError } = await sb
      .from("tenant_whatsapp_accounts")
      .select("tenant_id")
      .eq("phone_number_id", phoneNumberId)
      .maybeSingle();

    if (existingError) {
      safeErrorLog("onboarding.phone.lookup", existingError);
      return jsonResponse({
        error: "Could not verify phone number ownership.",
      }, 500);
    }

    if (
      existingAccount &&
      String(existingAccount.tenant_id) !== String(session.tenant_id)
    ) {
      return jsonResponse({
        error: "This WhatsApp number is already connected to another account.",
      }, 409);
    }

    // Exchange and validate Meta authorization details.
    const metaAccount = await exchangeAuthCode(
      authCode,
      wabaId,
      phoneNumberId,
    );

    if (
      !metaAccount?.accessToken ||
      !metaAccount?.wabaId ||
      !metaAccount?.phoneNumberId
    ) {
      throw new Error("Meta did not return valid WhatsApp account details.");
    }

    if (
      String(metaAccount.wabaId) !== wabaId ||
      String(metaAccount.phoneNumberId) !== phoneNumberId
    ) {
      throw new Error(
        "The returned WhatsApp account does not match the signup selection.",
      );
    }

    const subscribed = await subscribeWebhook(
      metaAccount.wabaId,
      metaAccount.accessToken,
    );

    if (!subscribed) {
      throw new Error(
        "WhatsApp account verified, but webhook subscription failed. Please retry.",
      );
    }

    const encryptedToken = await encryptToken(metaAccount.accessToken);

    const { error: accountError } = await sb
      .from("tenant_whatsapp_accounts")
      .upsert({
        tenant_id: session.tenant_id,
        waba_id: metaAccount.wabaId,
        phone_number_id: metaAccount.phoneNumberId,
        display_phone_number: metaAccount.displayPhone,
        verified_name: metaAccount.verifiedName,
        encrypted_access_token: encryptedToken,
        is_active: true,
      }, {
        onConflict: "phone_number_id",
      });

    if (accountError) {
      safeErrorLog("onboarding.account.save", accountError);
      throw new Error("Could not save the WhatsApp account.");
    }

    // Mark WhatsApp as connected, but do not activate a subscription
    // or mark the merchant workspace as fully registered.
    const { error: updateSessionError } = await sb
      .from("onboarding_sessions")
      .update({
        status: "WHATSAPP_CONNECTED",
        waba_id: metaAccount.wabaId,
        phone_number_id: metaAccount.phoneNumberId,
      })
      .eq("id", session.id)
      .eq("status", "PENDING");

    if (updateSessionError) {
      safeErrorLog("onboarding.session.complete", updateSessionError);
      throw new Error("WhatsApp connected, but the registration session could not be updated.");
    }

    return jsonResponse({
      success: true,
      message: "WhatsApp Business account connected successfully.",
      phone: metaAccount.displayPhone,
      verified_name: metaAccount.verifiedName,
      session_token: sessionToken,
      dashboard_registration_required: true,
      dashboard_url: `${BASE_URL}/?session_token=${encodeURIComponent(sessionToken)}`,
    });
  } catch (error) {
    safeErrorLog("handleOnboardingCallback", error);

    return jsonResponse({
      error: error instanceof Error
        ? error.message
        : "WhatsApp signup failed. Please try again.",
    }, 400);
  }
}

// =====================================================
// 7. LEGACY SALES ENTRY POINT
// =====================================================

export async function startOnboardingFromSales(
  from: string,
  session: any,
  _serviceType: string,
): Promise<void> {
  await startMerchantRegistration(
    from,
    String(session?.conversationId || ""),
  );
}
