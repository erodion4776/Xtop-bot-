// supabase/functions/whatsapp-webhook/modules/onboarding.ts
// Multi-Tenant Meta Embedded Signup — Hardcoded redirect URI for xtopbot.netlify.app

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

const sb = getSupabaseClient();

const FIXED_REDIRECT_URI = "https://xtopbot.netlify.app/";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

export function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

// ══════════════════════════════════════════════════════
// 1. LINK GENERATOR
// ══════════════════════════════════════════════════════

export async function createOnboardingSession(
  tenantId: string,
  packageCode: string = "BASIC"
): Promise<string | null> {
  const sessionToken = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  const { error } = await sb.from("onboarding_sessions").insert({
    tenant_id: tenantId,
    session_token: sessionToken,
    package_code: packageCode,
    status: "PENDING",
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    safeErrorLog("createOnboardingSession", error);
    return null;
  }

  const baseUrl = (Deno.env.get("ONBOARDING_BASE_URL") || "https://xtopbot.netlify.app").replace(/\/+$/, "");
  return `${baseUrl}/?token=${sessionToken}&plan=${packageCode}`;
}

// ══════════════════════════════════════════════════════
// 2. WHATSAPP CHAT HANDLER
// ══════════════════════════════════════════════════════

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

    await sendTextMessage(
      phone,
      `✅ *You selected: ${planNames[plan] || plan}*\n\n` +
      `${planFeatures[plan] || ""}\n\n` +
      `Your 14-day free trial starts when you connect your number.`
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
      await sendTextMessage(phone, "⚠️ Could not generate your signup link. Please try again.");
      return true;
    }

    await sendTextMessage(
      phone,
      `✅ *Your signup link is ready!*\n\n` +
      `🔗 ${signupLink}\n\n` +
      `Open this link in your phone browser to verify your WhatsApp Business number.\n\n` +
      `⏰ _Link expires in 24 hours._`
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
      "Or simply reply here with your question and we will get back to you shortly."
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
      "Try these free tools right now:\n\n" +
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

// ══════════════════════════════════════════════════════
// 3. META AUTH CODE EXCHANGE
// ══════════════════════════════════════════════════════

async function exchangeMetaAuthCode(authCode: string) {
  const appId = Deno.env.get("META_APP_ID") || "1947931015867084";
  const appSecret = Deno.env.get("META_APP_SECRET") || "";
  const systemToken = Deno.env.get("META_SYSTEM_USER_TOKEN") || "";
  const graphApi = "https://graph.facebook.com/v21.0";

  let userToken = "";

  if (authCode.startsWith("EAA") && authCode.length > 50) {
    userToken = authCode;
  } else {
    const tokenUrl =
      `${graphApi}/oauth/access_token?client_id=${appId}` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&code=${encodeURIComponent(authCode)}` +
      `&redirect_uri=${encodeURIComponent(FIXED_REDIRECT_URI)}`;

    const tokenResp = await fetch(tokenUrl);

    if (!tokenResp.ok) {
      const errText = await tokenResp.text();
      console.error("[Meta Exchange Error]:", errText);
      return { error: `Meta token exchange failed: ${errText}` };
    }

    const tokenData = await tokenResp.json();
    userToken = tokenData.access_token;
  }

  if (!userToken) return { error: "No access token from Meta" };

  let wabaId = "";
  const wabaResp = await fetch(`${graphApi}/me/whatsapp_business_accounts?access_token=${userToken}`);
  if (wabaResp.ok) {
    const wabaData = await wabaResp.json();
    wabaId = wabaData.data?.[0]?.id || "";
  }

  if (!wabaId) return { error: "No WhatsApp Business Account found." };

  const activeToken = systemToken || userToken;
  let phoneNumberId = "", displayPhone = "", verifiedName = "";

  const phoneResp = await fetch(`${graphApi}/${wabaId}/phone_numbers?access_token=${activeToken}`);
  if (phoneResp.ok) {
    const phoneData = await phoneResp.json();
    if (phoneData.data?.length > 0) {
      phoneNumberId = phoneData.data[0].id;
      displayPhone = phoneData.data[0].display_phone_number || "";
      verifiedName = phoneData.data[0].verified_name || "";
    }
  }

  if (!phoneNumberId) return { error: "No verified phone number found." };

  await fetch(`${graphApi}/${wabaId}/subscribed_apps?access_token=${activeToken}`, { method: "POST" });

  return { accessToken: activeToken, wabaId, phoneNumberId, displayPhone, verifiedName };
}

// ══════════════════════════════════════════════════════
// 4. ONBOARDING CALLBACK
// ══════════════════════════════════════════════════════

export async function handleOnboardingCallback(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { session_token, auth_code, package_code } = body;

    if (!session_token || !auth_code) {
      return jsonResponse({ error: "Missing session_token or auth_code" }, 400);
    }

    const { data: session } = await sb
      .from("onboarding_sessions")
      .select("*")
      .eq("session_token", session_token)
      .maybeSingle();

    if (!session) return jsonResponse({ error: "Invalid session" }, 404);
    if (new Date(session.expires_at) < new Date()) return jsonResponse({ error: "Link expired" }, 410);
    if (session.status === "TRIAL_ACTIVATED") return jsonResponse({ error: "Already completed" }, 409);

    const result = await exchangeMetaAuthCode(auth_code);

    if ("error" in result || !result.accessToken) {
      await sb.from("onboarding_sessions").update({ status: "FAILED", error_message: (result as any).error }).eq("id", session.id);
      return jsonResponse({ error: (result as any).error }, 400);
    }

    const encryptedToken = await encryptToken(result.accessToken);

    await sb.from("tenant_whatsapp_accounts").upsert({
      tenant_id: session.tenant_id,
      waba_id: result.wabaId,
      phone_number_id: result.phoneNumberId,
      display_phone_number: result.displayPhone,
      verified_name: result.verifiedName,
      encrypted_access_token: encryptedToken,
      is_active: true,
    }, { onConflict: "phone_number_id" });

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);

    const pkg = package_code || session.package_code || "BASIC";
    const fee = pkg === "PREMIUM" ? 150000 : pkg === "STANDARD" ? 75000 : 35000;
    const msgs = pkg === "PREMIUM" ? 10000 : pkg === "STANDARD" ? 5000 : 1000;

    await sb.from("tenant_subscriptions").insert({
      tenant_id: session.tenant_id,
      package_code: pkg,
      package_name: pkg.charAt(0) + pkg.slice(1).toLowerCase(),
      status: "TRIAL",
      trial_started_at: new Date().toISOString(),
      trial_expires_at: trialEnd.toISOString(),
      monthly_fee_ngn: fee,
      messages_included: msgs,
      is_active: true,
    });

    await sb.from("onboarding_sessions").update({
      status: "TRIAL_ACTIVATED",
      waba_id: result.wabaId,
      phone_number_id: result.phoneNumberId,
    }).eq("id", session.id);

    if (session.tenant_id) {
      await sb.from("tenants").update({ is_active: true }).eq("id", session.tenant_id);
    }

    return jsonResponse({ success: true, phone: result.displayPhone, trial_ends: trialEnd.toISOString(), package: pkg });
  } catch (err) {
    console.error("[Onboard Callback]:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
}
