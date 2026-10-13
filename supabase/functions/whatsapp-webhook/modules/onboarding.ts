// supabase/functions/whatsapp-webhook/modules/onboarding.ts
// Multi-Tenant Meta Embedded Signup Onboarding Portal & Flow Handler

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

const sb = getSupabaseClient();

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
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

  const rawBaseUrl = Deno.env.get("ONBOARDING_BASE_URL") || "https://xtopbot.netlify.app";
  const baseUrl = rawBaseUrl.replace(/\/+$/, "");

  return `${baseUrl}?token=${sessionToken}`;
}

// ══════════════════════════════════════════════════════
// 2. WHATSAPP CHAT TRIGGER
// ══════════════════════════════════════════════════════

export async function handleOnboardingRequest(
  phone: string,
  text: string,
  contactId: string,
  conversationId: string
): Promise<boolean> {
  const lower = text.toLowerCase().trim();

  const isOnboardingIntent =
    lower.includes("i want a bot") ||
    lower.includes("i need a bot") ||
    lower.includes("get my own bot") ||
    lower.includes("set up my bot") ||
    lower.includes("setup bot") ||
    lower.includes("connect my whatsapp") ||
    lower.includes("connect whatsapp") ||
    lower.includes("build a bot") ||
    lower.includes("create a bot") ||
    lower.includes("start trial") ||
    lower.includes("free trial") ||
    lower.includes("onboard") ||
    lower === "signup" ||
    lower === "sign up";

  if (!isOnboardingIntent) return false;

  await updateConversation(conversationId, {
    current_module: "MAIN_MENU",
    current_state: "IDLE",
    context_json: {},
  });

  await sendTextMessage(
    phone,
    "🟢 *Great choice!*\n\n" +
    "I can set up a WhatsApp bot for your business in under 5 minutes.\n\n" +
    "You will get:\n" +
    "• Your own WhatsApp Business number\n" +
    "• Automated replies and menus\n" +
    "• Lead capture and customer management\n" +
    "• 14-day free trial (no payment required)\n\n" +
    "Generating your secure signup link..."
  );

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
      "⚠️ I could not create your account right now. Please try again later or contact our team directly."
    );
    return true;
  }

  const signupLink = await createOnboardingSession(tenant.id, "BASIC");

  if (!signupLink) {
    await sendTextMessage(
      phone,
      "⚠️ I could not generate your signup link. Please try again later."
    );
    return true;
  }

  await sendTextMessage(
    phone,
    `✅ *Your signup link is ready!*\n\n` +
    `🔗 ${signupLink}\n\n` +
    `Tap the link above to:\n` +
    `1. Choose your package\n` +
    `2. Connect your WhatsApp Business number\n` +
    `3. Start your 14-day free trial\n\n` +
    `⏰ _This link expires in 24 hours._`
  );

  await sendButtonMessage(
    phone,
    "Need help with setup?",
    [
      makeButton("demo_agent", "👤 Talk to Agent"),
      makeButton("menu_home", "🏠 Main Menu"),
    ]
  );

  return true;
}

// ══════════════════════════════════════════════════════
// 3. META AUTH CODE EXCHANGE (ROBUST WABA RESOLVER)
// ══════════════════════════════════════════════════════

async function exchangeMetaAuthCode(authCode: string, redirectUri: string) {
  const appId = Deno.env.get("META_APP_ID") || "1947931015867084";
  const appSecret = Deno.env.get("META_APP_SECRET") || "";
  const systemToken = Deno.env.get("META_SYSTEM_USER_TOKEN") || "";
  const graphApi = "https://graph.facebook.com/v21.0";

  let userToken = "";

  // If code is already a token (from direct FB.login)
  if (authCode.startsWith("EAA") && authCode.length > 50) {
    userToken = authCode;
  } else {
    // Exchange code for token (tries both clean URI and URI with trailing slash)
    const cleanUri = redirectUri ? redirectUri.replace(/\/+$/, "") : "";
    const tokenUrl =
      `${graphApi}/oauth/access_token?client_id=${appId}` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&code=${encodeURIComponent(authCode)}` +
      (cleanUri ? `&redirect_uri=${encodeURIComponent(cleanUri)}` : "");

    let tokenResp = await fetch(tokenUrl);
    if (!tokenResp.ok && cleanUri) {
      // Retry with trailing slash if required by Meta app settings
      const retryUrl =
        `${graphApi}/oauth/access_token?client_id=${appId}` +
        `&client_secret=${encodeURIComponent(appSecret)}` +
        `&code=${encodeURIComponent(authCode)}` +
        `&redirect_uri=${encodeURIComponent(cleanUri + "/")}`;
      tokenResp = await fetch(retryUrl);
    }

    if (!tokenResp.ok) {
      const errText = await tokenResp.text();
      console.error("[Meta Exchange Error - Token Step]:", errText);
      return { error: `Meta token exchange rejected: ${errText}` };
    }

    const tokenData = await tokenResp.json();
    userToken = tokenData.access_token;
  }

  if (!userToken) return { error: "No access token received from Meta" };

  // Step 2: Get WhatsApp Business Account ID
  let wabaId = "";

  const wabaResp = await fetch(`${graphApi}/me/whatsapp_business_accounts?access_token=${userToken}`);
  if (wabaResp.ok) {
    const wabaData = await wabaResp.json();
    wabaId = wabaData.data?.[0]?.id || "";
  }

  if (!wabaId) {
    const debugResp = await fetch(`${graphApi}/debug_token?input_token=${userToken}&access_token=${appId}|${appSecret}`);
    if (debugResp.ok) {
      const debugData = await debugResp.json();
      const scopes = debugData.data?.granular_scopes || [];
      const waScope = scopes.find((s: any) => s.scope === "whatsapp_business_management");
      wabaId = waScope?.target_ids?.[0] || "";
    }
  }

  if (!wabaId) {
    return { error: "No WhatsApp Business Account found associated with this Facebook login." };
  }

  // Step 3: Get Phone Number ID
  const activeToken = systemToken || userToken;
  const phoneResp = await fetch(`${graphApi}/${wabaId}/phone_numbers?access_token=${activeToken}`);
  if (!phoneResp.ok) {
    const errText = await phoneResp.text();
    console.error("[Meta Exchange Error - Phone Step]:", errText);
    return { error: `Could not retrieve phone numbers: ${errText}` };
  }

  const phoneData = await phoneResp.json();
  const phoneNumberId = phoneData.data?.[0]?.id;
  const displayPhone = phoneData.data?.[0]?.display_phone_number || "";
  const verifiedName = phoneData.data?.[0]?.verified_name || "";

  if (!phoneNumberId) {
    return { error: "No verified WhatsApp phone number found on this WhatsApp Business Account." };
  }

  // Step 4: Subscribe webhook
  await fetch(`${graphApi}/${wabaId}/subscribed_apps?access_token=${activeToken}`, { method: "POST" });

  return {
    accessToken: activeToken,
    wabaId,
    phoneNumberId,
    displayPhone,
    verifiedName,
  };
}

// ══════════════════════════════════════════════════════
// 4. ONBOARDING CALLBACK POST HANDLER
// ══════════════════════════════════════════════════════

export async function handleOnboardingCallback(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { session_token, auth_code, package_code, redirect_uri } = body;

    if (!session_token || !auth_code) {
      return jsonResponse({ error: "Missing session_token or auth_code" }, 400);
    }

    const { data: session } = await sb
      .from("onboarding_sessions")
      .select("*")
      .eq("session_token", session_token)
      .maybeSingle();

    if (!session) return jsonResponse({ error: "Invalid onboarding session" }, 404);
    if (new Date(session.expires_at) < new Date()) return jsonResponse({ error: "This onboarding link has expired" }, 410);
    if (session.status === "TRIAL_ACTIVATED") return jsonResponse({ error: "This account has already completed onboarding" }, 409);

    const result = await exchangeMetaAuthCode(auth_code, redirect_uri || "https://xtopbot.netlify.app");

    if ("error" in result || !result.accessToken) {
      await sb.from("onboarding_sessions").update({
        status: "FAILED",
        error_message: (result as any).error || "Token exchange failed",
      }).eq("id", session.id);

      return jsonResponse({ error: (result as any).error || "Meta authorization failed" }, 400);
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

    const trialStart = new Date();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);

    const selectedPkg = package_code || session.package_code || "BASIC";
    const monthlyFee = selectedPkg === "PREMIUM" ? 150000 : selectedPkg === "STANDARD" ? 75000 : 35000;
    const msgLimit = selectedPkg === "PREMIUM" ? 10000 : selectedPkg === "STANDARD" ? 5000 : 1000;

    await sb.from("tenant_subscriptions").insert({
      tenant_id: session.tenant_id,
      package_code: selectedPkg,
      package_name: selectedPkg.charAt(0) + selectedPkg.slice(1).toLowerCase(),
      status: "TRIAL",
      trial_started_at: trialStart.toISOString(),
      trial_expires_at: trialEnd.toISOString(),
      monthly_fee_ngn: monthlyFee,
      messages_included: msgLimit,
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

    return jsonResponse({
      success: true,
      phone: result.displayPhone,
      trial_ends: trialEnd.toISOString(),
      package: selectedPkg,
    });
  } catch (err) {
    console.error("[Onboard Callback Catch]:", err);
    return jsonResponse({ error: "Internal setup error. Please try again." }, 500);
  }
}
