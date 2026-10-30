
import {
  getSupabaseClient,
  updateConversation,
  safeErrorLog,
} from "../database.ts";

import {
  sendTextMessage,
  sendButtonMessage,
  sendListMessage,
  makeButton,
  makeListRow,
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

const PLANS: Record<string, {
  name: string;
  monthlyFee: number;
  messages: number;
  features: string;
}> = {
  BASIC: {
    name: "Starter",
    monthlyFee: 5000,
    messages: 1000,
    features:
      "• Automatic customer replies\n" +
      "• WhatsApp product catalogue\n" +
      "• Customer enquiries and leads\n" +
      "• Human-agent handover",
  },
  STANDARD: {
    name: "Growth",
    monthlyFee: 10000,
    messages: 5000,
    features:
      "• Everything in Starter\n" +
      "• Automated product enquiries\n" +
      "• Customer order collection\n" +
      "• Business FAQs and support",
  },
  PREMIUM: {
    name: "Business",
    monthlyFee: 20000,
    messages: 10000,
    features:
      "• Everything in Growth\n" +
      "• Advanced business automation\n" +
      "• Extended business tools\n" +
      "• Priority support",
  },
};

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
// 1. CREATE ONBOARDING SESSION
// =====================================================

export async function createOnboardingSession(
  tenantId: string,
  packageCode: string = "BASIC"
): Promise<string | null> {
  const plan = PLANS[packageCode.toUpperCase()]
    ? packageCode.toUpperCase()
    : "BASIC";

  const sessionToken = crypto.randomUUID().replace(/-/g, "");

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  const { error } = await sb.from("onboarding_sessions").insert({
    tenant_id: tenantId,
    session_token: sessionToken,
    package_code: plan,
    status: "PENDING",
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    safeErrorLog("createOnboardingSession", error);
    return null;
  }

  const baseUrl = (
    Deno.env.get("ONBOARDING_BASE_URL") ||
    "https://xtopbot.netlify.app"
  ).replace(/\/+$/, "");

  return `${baseUrl}/?token=${encodeURIComponent(sessionToken)}&plan=${plan}`;
}

// =====================================================
// 2. SHOW THE SINGLE PUBLIC E-COMMERCE DEMO
// =====================================================

async function showStoreDemo(phone: string): Promise<void> {
  await sendTextMessage(
    phone,
    "🛍️ *WELCOME TO THE SABI DEMO STORE!*\n\n" +
      "This is a demonstration of how your own WhatsApp shop can work.\n\n" +
      "Imagine your customers being able to:\n\n" +
      "✅ Browse products\n" +
      "✅ Check prices\n" +
      "✅ Ask questions\n" +
      "✅ Place orders\n" +
      "✅ Speak with a human agent\n\n" +
      "Let's try it!"
  );

  await sendButtonMessage(
    phone,
    "What would you like to try?",
    [
      makeButton("demo_products", "🛍️ View Products"),
      makeButton("demo_order", "📦 Try an Order"),
      makeButton("demo_faq", "❓ Ask a Question"),
    ],
    "Sabi Demo Store"
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
      "_These are sample products for demonstration only._"
  );

  await sendButtonMessage(
    phone,
    "Would you like to test the ordering process?",
    [
      makeButton("demo_order", "📦 Try an Order"),
      makeButton("demo_faq", "❓ Ask a Question"),
      makeButton("demo_signup", "🚀 Get My Bot"),
    ],
    "Demo Store"
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
      "Your real business bot can collect customer details, " +
      "confirm orders and send payment instructions.\n\n" +
      "⚠️ This is a sample order. No real order or payment has been created."
  );

  await sendButtonMessage(
    phone,
    "That is how a customer order can look. What next?",
    [
      makeButton("demo_products", "🛍️ Products"),
      makeButton("demo_faq", "❓ FAQs"),
      makeButton("demo_signup", "🚀 Get My Bot"),
    ],
    "Order Demonstration"
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
      "_Your own FAQs can be edited from your business dashboard._"
  );

  await sendButtonMessage(
    phone,
    "Would you like your own WhatsApp shop?",
    [
      makeButton("demo_signup", "🚀 Get My Bot"),
      makeButton("demo_products", "🛍️ Products"),
      makeButton("onboard_agent", "💬 Talk to Agent"),
    ],
    "Sabi by XTOP"
  );
}

// =====================================================
// 3. SHOW SUBSCRIPTION PLANS
// =====================================================

async function showPlans(phone: string): Promise<void> {
  await sendTextMessage(
    phone,
    "🚀 *GET YOUR OWN SABI WHATSAPP BOT*\n\n" +
      "Choose a plan for your business.\n\n" +
      "All plans include a 14-day free trial.\n" +
      "No subscription payment is required to start the trial.\n\n" +
      "Note: Meta WhatsApp messaging charges may apply separately."
  );

  await sendListMessage(
    phone,
    "*Choose Your Plan*",
    "View Plans",
    [{
      title: "Sabi Subscription Plans",
      rows: [
        makeListRow(
          "plan_BASIC",
          "Starter – ₦5,000/month",
          "For small businesses"
        ),
        makeListRow(
          "plan_STANDARD",
          "Growth – ₦10,000/month",
          "For growing businesses"
        ),
        makeListRow(
          "plan_PREMIUM",
          "Business – ₦20,000/month",
          "For established businesses"
        ),
      ],
    }],
    "Sabi by XTOP",
    "14-day free trial"
  );
}

// =====================================================
// 4. WHATSAPP ONBOARDING HANDLER
// =====================================================

export async function handleOnboardingRequest(
  phone: string,
  text: string,
  contactId: string,
  conversationId: string
): Promise<boolean> {
  const lower = text.toLowerCase().trim();

  const isEntry =
    lower.includes("i want a bot") ||
    lower.includes("i need a bot") ||
    lower.includes("get my own bot") ||
    lower.includes("set up my bot") ||
    lower.includes("setup bot") ||
    lower.includes("connect my whatsapp") ||
    lower.includes("build a bot") ||
    lower.includes("create a bot") ||
    lower.includes("start trial") ||
    lower.includes("free trial") ||
    lower === "signup" ||
    lower === "sign up" ||
    lower === "onboard" ||
    lower === "demo" ||
    lower === "try demo" ||
    lower === "demo_store";

  if (isEntry) {
    await updateConversation(conversationId, {
      current_module: "MAIN_MENU",
      current_state: "IDLE",
      context_json: {},
    });

    await showStoreDemo(phone);
    return true;
  }

  // Demo navigation

  if (lower === "demo_products") {
    await showDemoProducts(phone);
    return true;
  }

  if (lower === "demo_order") {
    await showDemoOrder(phone);
    return true;
  }

  if (lower === "demo_faq") {
    await showDemoFAQ(phone);
    return true;
  }

  if (lower === "demo_signup" || lower === "view_plans") {
    await showPlans(phone);
    return true;
  }

  if (
    lower === "view plans" ||
    lower === "plans" ||
    lower === "subscription"
  ) {
    await showPlans(phone);
    return true;
  }

  // Plan selection

  if (lower.startsWith("plan_")) {
    const plan = lower.replace("plan_", "").toUpperCase();
    const selected = PLANS[plan];

    if (!selected) {
      await sendTextMessage(
        phone,
        "Please select a valid Sabi subscription plan."
      );
      return true;
    }

    await sendTextMessage(
      phone,
      `✅ *You selected ${selected.name}*\n\n` +
        `Subscription: ₦${selected.monthlyFee.toLocaleString("en-NG")}/month\n\n` +
        `${selected.features}\n\n` +
        "Your 14-day free trial starts after you connect your WhatsApp Business number."
    );

    await sendButtonMessage(
      phone,
      "Ready to set up your business bot?",
      [
        makeButton(`getbot_${plan}`, "🚀 Get My Bot"),
        makeButton("onboard_agent", "💬 Talk to Agent"),
        makeButton("menu_home", "🏠 Main Menu"),
      ],
      selected.name
    );

    return true;
  }

  // Create tenant and generate signup link

  if (lower.startsWith("getbot_")) {
    const plan = lower.replace("getbot_", "").toUpperCase();
    const selected = PLANS[plan];

    if (!selected) {
      await sendTextMessage(phone, "Please select a valid plan first.");
      return true;
    }

    await sendTextMessage(
      phone,
      "🔧 Preparing your Sabi business account..."
    );

    const slug = `biz_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

    const { data: tenant, error: tenantErr } = await sb
      .from("tenants")
      .insert({
        name: `Business ${slug}`,
        slug,
        contact_phone: phone,
        is_active: false,
      })
      .select("id")
      .single();

    if (tenantErr || !tenant) {
      safeErrorLog("handleOnboardingRequest.tenant", tenantErr);

      await sendTextMessage(
        phone,
        "⚠️ We could not create your account right now. Please try again or talk to our team."
      );

      return true;
    }

    const signupLink = await createOnboardingSession(
      tenant.id,
      plan
    );

    if (!signupLink) {
      // Remove the unused tenant if session creation failed.
      await sb.from("tenants").delete().eq("id", tenant.id);

      await sendTextMessage(
        phone,
        "⚠️ We could not generate your signup link. Please contact our team."
      );

      return true;
    }

    await sendTextMessage(
      phone,
      "✅ *Your Sabi signup link is ready!*\n\n" +
        `${signupLink}\n\n` +
        "Open the link in your phone browser and connect your WhatsApp Business account.\n\n" +
        "⏰ This link expires in 24 hours.\n\n" +
        "Your 14-day trial begins after successful connection."
    );

    await sendButtonMessage(
      phone,
      "Need assistance?",
      [
        makeButton("onboard_agent", "💬 Talk to Agent"),
        makeButton("menu_home", "🏠 Main Menu"),
      ]
    );

    return true;
  }

  // Human agent

  if (
    lower === "onboard_agent" ||
    lower === "talk to agent"
  ) {
    await sendTextMessage(
      phone,
      "💬 *TALK TO THE XTOP TEAM*\n\n" +
        "Our team can help you set up Sabi for your business.\n\n" +
        "WhatsApp: +234 802 498 8555\n\n" +
        "You can also reply here with your question."
    );

    await sendButtonMessage(
      phone,
      "What would you like to do next?",
      [
        makeButton("view_plans", "📋 View Plans"),
        makeButton("menu_home", "🏠 Main Menu"),
      ]
    );

    return true;
  }

  // XTOP tools

  if (
    lower === "onboard_tools" ||
    lower === "our tools"
  ) {
    await sendTextMessage(
      phone,
      "🔧 *XTOP BUSINESS TOOLS*\n\n" +
        "• Website checker\n" +
        "• Domain name search\n" +
        "• Business calculator\n" +
        "• Engineering tools\n\n" +
        "Explore our other XTOP products and services."
    );

    await sendButtonMessage(
      phone,
      "What would you like to do?",
      [
        makeButton("menu_tools", "🔧 Open Tools"),
        makeButton("view_plans", "📋 View Plans"),
        makeButton("menu_home", "🏠 Main Menu"),
      ]
    );

    return true;
  }

  return false;
}

// =====================================================
// 5. META EMBEDDED SIGNUP CALLBACK
// =====================================================

export async function handleOnboardingCallback(
  req: Request
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let sessionId: string | null = null;

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
      return jsonResponse({
        error: "Could not verify signup session.",
      }, 500);
    }

    if (!session) {
      return jsonResponse({
        error: "Invalid signup session.",
      }, 404);
    }

    sessionId = session.id;

    if (session.status === "TRIAL_ACTIVATED") {
      return jsonResponse({
        success: true,
        message: "This signup has already been completed.",
      });
    }

    if (session.status !== "PENDING") {
      return jsonResponse({
        error: "This signup session is no longer valid.",
      }, 409);
    }

    if (new Date(session.expires_at).getTime() < Date.now()) {
      return jsonResponse({
        error: "Signup link has expired.",
      }, 410);
    }

    if (!session.tenant_id) {
      return jsonResponse({
        error: "Signup session has no tenant.",
      }, 400);
    }

    const pkg = String(session.package_code || "BASIC").toUpperCase();
    const selected = PLANS[pkg];

    if (!selected) {
      return jsonResponse({
        error: "Invalid subscription plan.",
      }, 400);
    }

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

    const metaAccount = await exchangeAuthCode(
      authCode,
      wabaId,
      phoneNumberId
    );

    const subscribed = await subscribeWebhook(
      metaAccount.wabaId,
      metaAccount.accessToken
    );

    if (!subscribed) {
      throw new Error(
        "WhatsApp account verified, but webhook subscription failed. Please retry."
      );
    }

    const encryptedToken = await encryptToken(
      metaAccount.accessToken
    );

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

    const trialStart = new Date();
    const trialEnd = new Date(trialStart);
    trialEnd.setDate(trialEnd.getDate() + 14);

    const { data: existingTrial, error: trialLookupError } = await sb
      .from("tenant_subscriptions")
      .select("id")
      .eq("tenant_id", session.tenant_id)
      .eq("status", "TRIAL")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (trialLookupError) {
      safeErrorLog("onboarding.trial.lookup", trialLookupError);
      throw new Error("Could not verify the subscription.");
    }

    if (!existingTrial) {
      const { error: subscriptionError } = await sb
        .from("tenant_subscriptions")
        .insert({
          tenant_id: session.tenant_id,
          package_code: pkg,
          package_name: selected.name,
          status: "TRIAL",
          trial_started_at: trialStart.toISOString(),
          trial_expires_at: trialEnd.toISOString(),
          monthly_fee_ngn: selected.monthlyFee,
          messages_included: selected.messages,
          is_active: true,
        });

      if (subscriptionError) {
        safeErrorLog("onboarding.subscription.save", subscriptionError);
        throw new Error("Could not activate the trial subscription.");
      }
    }

    const { error: tenantError } = await sb
      .from("tenants")
      .update({ is_active: true })
      .eq("id", session.tenant_id);

    if (tenantError) {
      safeErrorLog("onboarding.tenant.activate", tenantError);
      throw new Error("Could not activate the business account.");
    }

    const { error: updateSessionError } = await sb
      .from("onboarding_sessions")
      .update({
        status: "TRIAL_ACTIVATED",
        waba_id: metaAccount.wabaId,
        phone_number_id: metaAccount.phoneNumberId,
      })
      .eq("id", session.id);

    if (updateSessionError) {
      safeErrorLog("onboarding.session.complete", updateSessionError);
      throw new Error("Could not complete the signup session.");
    }

    return jsonResponse({
      success: true,
      message: "WhatsApp Business account connected successfully.",
      phone: metaAccount.displayPhone,
      verified_name: metaAccount.verifiedName,
      package: pkg,
      package_name: selected.name,
      trial_days: 14,
      trial_ends: trialEnd.toISOString(),
    });
  } catch (error) {
    safeErrorLog("handleOnboardingCallback", error);

    if (sessionId) {
      await sb
        .from("onboarding_sessions")
        .update({ status: "FAILED" })
        .eq("id", sessionId)
        .neq("status", "TRIAL_ACTIVATED");
    }

    return jsonResponse({
      error: error instanceof Error
        ? error.message
        : "WhatsApp signup failed. Please try again.",
    }, 400);
  }
}

// =====================================================
// 6. SALES ONBOARDING
// =====================================================

export async function startOnboardingFromSales(
  from: string,
  session: any,
  serviceType: string
): Promise<void> {
  const isCombo =
    serviceType.toUpperCase().includes("BOT") &&
    serviceType.toUpperCase().includes("WEBSITE");

  const serviceName = isCombo
    ? "WhatsApp Bot + Website"
    : "WhatsApp Bot";

  await sendTextMessage(
    from,
    `Awesome! Let's get your ${serviceName} set up. 🎉\n\n` +
      "First, choose a Sabi subscription plan:"
  );

  await showPlans(from);
}
