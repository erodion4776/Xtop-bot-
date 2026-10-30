
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
  const allowedPlans = ["BASIC", "STANDARD", "PREMIUM"];
  const plan = allowedPlans.includes(packageCode.toUpperCase())
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
// 2. WHATSAPP ONBOARDING HANDLER
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
    lower === "onboard";

  if (isEntry) {
    await updateConversation(conversationId, {
      current_module: "MAIN_MENU",
      current_state: "IDLE",
      context_json: {},
    });

    await sendTextMessage(
      phone,
      "🟢 *Great choice!*\n\n" +
        "You can have your own WhatsApp bot running in under 5 minutes.\n\n" +
        "Pick a plan from the list below to get started."
    );

    await sendListMessage(
      phone,
      "*Choose Your Plan*\n\nAll plans include a 14-day free trial. No payment needed today.",
      "View Plans",
      [{
        title: "Available Plans",
        rows: [
          makeListRow("plan_BASIC", "Basic - N35,000/mo", "Auto-replies, catalogue, leads"),
          makeListRow("plan_STANDARD", "Standard - N75,000/mo", "Quotes, demos, tools"),
          makeListRow("plan_PREMIUM", "Premium - N150,000/mo", "Automation, magazine, priority"),
        ],
      }],
      "Xtop Bot Plans",
      "14-day free trial"
    );

    return true;
  }

  if (lower.startsWith("plan_")) {
    const plan = lower.replace("plan_", "").toUpperCase();

    const planNames: Record<string, string> = {
      BASIC: "Basic (N35,000/mo)",
      STANDARD: "Standard (N75,000/mo)",
      PREMIUM: "Premium (N150,000/mo)",
    };

    const planFeatures: Record<string, string> = {
      BASIC:
        "• Auto-replies to customer messages\n" +
        "• Product catalogue on WhatsApp\n" +
        "• Collect customer enquiries\n" +
        "• Hand over to a human agent",
      STANDARD:
        "• Everything in Basic\n" +
        "• Send price quotes automatically\n" +
        "• Interactive business demos\n" +
        "• Free business tools included",
      PREMIUM:
        "• Everything in Standard\n" +
        "• Automate your daily workflows\n" +
        "• Digital magazine builder\n" +
        "• Priority support from our team",
    };

    if (!planNames[plan]) {
      await sendTextMessage(phone, "Please select a valid subscription plan.");
      return true;
    }

    await sendTextMessage(
      phone,
      `✅ *You selected: ${planNames[plan]}*\n\n` +
        `${planFeatures[plan]}\n\n` +
        "Your 14-day free trial starts when you connect your number."
    );

    await sendButtonMessage(
      phone,
      "What would you like to do next?",
      [
        makeButton(`getbot_${plan}`, "🚀 Get My Bot"),
        makeButton("onboard_agent", "💬 Talk to Agent"),
        makeButton("onboard_tools", "🔧 Our Tools"),
      ],
      planNames[plan]
    );

    return true;
  }

  if (lower.startsWith("getbot_")) {
    const plan = lower.replace("getbot_", "").toUpperCase();

    if (!["BASIC", "STANDARD", "PREMIUM"].includes(plan)) {
      await sendTextMessage(phone, "Please select a valid plan first.");
      return true;
    }

    await sendTextMessage(phone, "🔧 Setting up your account...");

    const slug = `biz_${Date.now()}`;

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
        "⚠️ Could not create your account right now. Please try again later or talk to our team."
      );

      return true;
    }

    const signupLink = await createOnboardingSession(tenant.id, plan);

    if (!signupLink) {
      await sendTextMessage(
        phone,
        "⚠️ Could not generate your signup link. Please contact our team."
      );
      return true;
    }

    await sendTextMessage(
      phone,
      `✅ *Your signup link is ready!*\n\n` +
        `🔗 ${signupLink}\n\n` +
        "Open this link in your phone browser to connect your WhatsApp Business number.\n\n" +
        "⏰ _Link expires in 24 hours._"
    );

    await sendButtonMessage(
      phone,
      "Need help?",
      [
        makeButton("onboard_agent", "💬 Talk to Agent"),
        makeButton("menu_home", "🏠 Main Menu"),
      ]
    );

    return true;
  }

  if (lower === "onboard_agent" || lower === "talk to agent") {
    await sendTextMessage(
      phone,
      "💬 *Talk to Our Team*\n\n" +
        "Send us a message on WhatsApp and we will help you set up your bot:\n\n" +
        "📞 +234 802 498 8555\n\n" +
        "Or simply reply here with your question."
    );

    await sendButtonMessage(
      phone,
      "What else can I help with?",
      [
        makeButton("plan_STANDARD", "📋 View Plans"),
        makeButton("menu_home", "🏠 Main Menu"),
      ]
    );

    return true;
  }

  if (lower === "onboard_tools" || lower === "our tools") {
    await sendTextMessage(
      phone,
      "🔧 *Free Xtop Tools*\n\n" +
        "• 🌐 Website checker\n" +
        "• 🔍 Domain name search\n" +
        "• ✈️ Flight status checker\n" +
        "• 🧮 Business calculator\n\n" +
        "Type *tools* to open the full tools menu."
    );

    await sendButtonMessage(
      phone,
      "What would you like to do?",
      [
        makeButton("menu_tools", "🔧 Open Tools"),
        makeButton("plan_STANDARD", "📋 View Plans"),
        makeButton("menu_home", "🏠 Main Menu"),
      ]
    );

    return true;
  }

  return false;
}

// =====================================================
// 3. META EMBEDDED SIGNUP CALLBACK
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

    // Find the onboarding session.
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

    sessionId = session.id;

    if (session.status === "TRIAL_ACTIVATED") {
      return jsonResponse({
        success: true,
        message: "This signup has already been completed.",
      });
    }

    if (new Date(session.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: "Signup link has expired." }, 410);
    }

    if (!session.tenant_id) {
      return jsonResponse({ error: "Signup session has no tenant." }, 400);
    }

    // The package is controlled by the saved session, not the browser.
    const allowedPlans = ["BASIC", "STANDARD", "PREMIUM"];
    const pkg = String(session.package_code || "BASIC").toUpperCase();

    if (!allowedPlans.includes(pkg)) {
      return jsonResponse({ error: "Invalid subscription plan." }, 400);
    }

    // Prevent another tenant from claiming this phone number.
    const { data: existingAccount, error: existingError } = await sb
      .from("tenant_whatsapp_accounts")
      .select("tenant_id")
      .eq("phone_number_id", phoneNumberId)
      .maybeSingle();

    if (existingError) {
      safeErrorLog("onboarding.phone.lookup", existingError);
      return jsonResponse({ error: "Could not verify phone number ownership." }, 500);
    }

    if (
      existingAccount &&
      String(existingAccount.tenant_id) !== String(session.tenant_id)
    ) {
      return jsonResponse({
        error: "This WhatsApp number is already connected to another account.",
      }, 409);
    }

    // Exchange the code and verify the exact selected WABA and phone.
    const metaAccount = await exchangeAuthCode(
      authCode,
      wabaId,
      phoneNumberId
    );

    // Subscribe the customer's WABA to this Meta app.
    const subscribed = await subscribeWebhook(
      metaAccount.wabaId,
      metaAccount.accessToken
    );

    if (!subscribed) {
      throw new Error(
        "WhatsApp account verified, but webhook subscription failed. Please retry."
      );
    }

    // Encrypt the customer's own token before storing it.
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

    // Start the 14-day trial.
    const trialStart = new Date();
    const trialEnd = new Date(trialStart);
    trialEnd.setDate(trialEnd.getDate() + 14);

    const fee =
      pkg === "PREMIUM" ? 150000 :
      pkg === "STANDARD" ? 75000 : 35000;

    const messages =
      pkg === "PREMIUM" ? 10000 :
      pkg === "STANDARD" ? 5000 : 1000;

    // Avoid creating a second active trial for the same tenant.
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
          package_name: pkg.charAt(0) + pkg.slice(1).toLowerCase(),
          status: "TRIAL",
          trial_started_at: trialStart.toISOString(),
          trial_expires_at: trialEnd.toISOString(),
          monthly_fee_ngn: fee,
          messages_included: messages,
          is_active: true,
        });

      if (subscriptionError) {
        safeErrorLog("onboarding.subscription.save", subscriptionError);
        throw new Error("Could not activate the trial subscription.");
      }
    }

    // Activate the tenant.
    const { error: tenantError } = await sb
      .from("tenants")
      .update({ is_active: true })
      .eq("id", session.tenant_id);

    if (tenantError) {
      safeErrorLog("onboarding.tenant.activate", tenantError);
      throw new Error("Could not activate the business account.");
    }

    // Mark this signup session as completed.
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
// 4. SALES ONBOARDING
// =====================================================

export async function startOnboardingFromSales(
  from: string,
  session: any,
  serviceType: string
): Promise<void> {
  const { sendTextMessage, sendListMessage, makeListRow } =
    await import("../whatsapp.ts");

  const isCombo =
    serviceType.toUpperCase().includes("BOT") &&
    serviceType.toUpperCase().includes("WEBSITE");

  const serviceName = isCombo
    ? "WhatsApp Bot + Website"
    : "WhatsApp Bot";

  await sendTextMessage(
    from,
    `Awesome! Let's get your ${serviceName} set up. 🎉\n\n` +
      "First, pick a plan that works for you:"
  );

  await new Promise((resolve) => setTimeout(resolve, 600));

  await sendListMessage(
    from,
    "Pick a plan to continue:",
    "See Plans",
    [{
      title: "Available Plans",
      rows: [
        makeListRow("plan_BASIC", "Basic – N35,000/mo", "For small shops"),
        makeListRow("plan_STANDARD", "Standard – N75,000/mo", "For growing businesses"),
        makeListRow("plan_PREMIUM", "Premium – N150,000/mo", "Full package"),
      ],
    }]
  );
}
