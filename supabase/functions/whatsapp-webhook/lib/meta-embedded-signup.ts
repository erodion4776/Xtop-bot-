// supabase/functions/whatsapp-webhook/lib/meta-embedded-signup.ts
// Server-side Meta Embedded Signup helpers.
// Handles authorization code exchange and webhook subscription.

import { getSupabaseClient, safeErrorLog } from "../database.ts";
import { encryptToken } from "./encryption.ts";

const GRAPH_API = "https://graph.facebook.com/v21.0";

function getMetaConfig() {
  return {
    appId: Deno.env.get("META_APP_ID") || "",
    appSecret: Deno.env.get("META_APP_SECRET") || "",
    systemUserToken: Deno.env.get("META_SYSTEM_USER_TOKEN") || "",
  };
}

/**
 * Exchange the Meta authorization code for a System User Access Token.
 */
export async function exchangeAuthCode(
  authCode: string
): Promise<{ accessToken: string; wabaId: string; phoneNumberId: string } | null> {
  const config = getMetaConfig();

  if (!config.appId || !config.appSecret) {
    console.error("[MetaSignup] Missing META_APP_ID or META_APP_SECRET");
    return null;
  }

  try {
    // Step 1: Exchange auth code for user access token
    const tokenUrl =
      `${GRAPH_API}/oauth/access_token` +
      `?client_id=${encodeURIComponent(config.appId)}` +
      `&client_secret=${encodeURIComponent(config.appSecret)}` +
      `&code=${encodeURIComponent(authCode)}`;

    const tokenResp = await fetch(tokenUrl, { method: "GET" });
    if (!tokenResp.ok) {
      const err = await tokenResp.text();
      safeErrorLog("MetaSignup.exchangeAuthCode.token", new Error(err));
      return null;
    }

    const tokenData = await tokenResp.json();
    const userAccessToken = tokenData.access_token;

    if (!userAccessToken) {
      console.error("[MetaSignup] No access_token in response");
      return null;
    }

    // Step 2: Get the WABA ID from the user's authorized accounts
    const wabaUrl =
      `${GRAPH_API}/me/whatsapp_business_accounts` +
      `?access_token=${encodeURIComponent(userAccessToken)}`;

    const wabaResp = await fetch(wabaUrl);
    if (!wabaResp.ok) {
      const err = await wabaResp.text();
      safeErrorLog("MetaSignup.exchangeAuthCode.waba", new Error(err));
      return null;
    }

    const wabaData = await wabaResp.json();
    const wabaId = wabaData.data?.[0]?.id;

    if (!wabaId) {
      console.error("[MetaSignup] No WABA found for user");
      return null;
    }

    // Step 3: Get the phone number ID from the WABA
    const phoneUrl =
      `${GRAPH_API}/${wabaId}/phone_numbers` +
      `?access_token=${encodeURIComponent(config.systemUserToken || userAccessToken)}`;

    const phoneResp = await fetch(phoneUrl);
    if (!phoneResp.ok) {
      const err = await phoneResp.text();
      safeErrorLog("MetaSignup.exchangeAuthCode.phone", new Error(err));
      return null;
    }

    const phoneData = await phoneResp.json();
    const phoneNumberId = phoneData.data?.[0]?.id;

    if (!phoneNumberId) {
      console.error("[MetaSignup] No phone number found for WABA");
      return null;
    }

    // Use the system user token for ongoing operations if available
    const finalToken = config.systemUserToken || userAccessToken;

    return {
      accessToken: finalToken,
      wabaId,
      phoneNumberId,
    };
  } catch (err) {
    safeErrorLog("MetaSignup.exchangeAuthCode", err);
    return null;
  }
}

/**
 * Subscribe the tenant's WABA to the webhook.
 */
export async function subscribeWebhook(
  wabaId: string,
  accessToken: string
): Promise<boolean> {
  try {
    const url =
      `${GRAPH_API}/${wabaId}/subscribed_apps` +
      `?access_token=${encodeURIComponent(accessToken)}`;

    const resp = await fetch(url, { method: "POST" });
    if (!resp.ok) {
      const err = await resp.text();
      safeErrorLog("MetaSignup.subscribeWebhook", new Error(err));
      return false;
    }

    return true;
  } catch (err) {
    safeErrorLog("MetaSignup.subscribeWebhook", err);
    return false;
  }
}

/**
 * Complete the onboarding flow: exchange code, encrypt token, store, subscribe.
 */
export async function completeOnboarding(
  sessionToken: string,
  authCode: string
): Promise<{ success: boolean; error?: string }> {
  const sb = getSupabaseClient();

  // 1. Validate the onboarding session
  const { data: session, error: sessionErr } = await sb
    .from("onboarding_sessions")
    .select("*")
    .eq("session_token", sessionToken)
    .maybeSingle();

  if (sessionErr || !session) {
    return { success: false, error: "Invalid or expired onboarding session." };
  }

  if (session.status === "TRIAL_ACTIVATED") {
    return { success: false, error: "This onboarding session is already complete." };
  }

  if (new Date(session.expires_at) < new Date()) {
    return { success: false, error: "This onboarding session has expired." };
  }

  // 2. Exchange the auth code
  const result = await exchangeAuthCode(authCode);
  if (!result) {
    await sb.from("onboarding_sessions")
      .update({ status: "FAILED", error_message: "Token exchange failed" })
      .eq("id", session.id);
    return { success: false, error: "Could not complete Meta authorization." };
  }

  // 3. Check for duplicate phone number
  const { data: existing } = await sb
    .from("tenant_whatsapp_accounts")
    .select("id")
    .eq("phone_number_id", result.phoneNumberId)
    .maybeSingle();

  if (existing) {
    await sb.from("onboarding_sessions")
      .update({ status: "FAILED", error_message: "Phone number already registered" })
      .eq("id", session.id);
    return { success: false, error: "This WhatsApp number is already connected to another account." };
  }

  // 4. Encrypt and store the access token
  const encryptedToken = await encryptToken(result.accessToken);

  await sb.from("tenant_whatsapp_accounts").insert({
    tenant_id: session.tenant_id,
    waba_id: result.wabaId,
    phone_number_id: result.phoneNumberId,
    encrypted_access_token: encryptedToken,
    is_active: true,
  });

  // 5. Subscribe webhook
  await subscribeWebhook(result.wabaId, result.accessToken);

  // 6. Activate 14-day trial
  const trialStart = new Date();
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);

  await sb.from("tenant_subscriptions").insert({
    tenant_id: session.tenant_id,
    package_code: session.package_code || "BASIC",
    package_name: session.package_code === "PREMIUM" ? "Premium" : session.package_code === "STANDARD" ? "Standard" : "Basic",
    status: "TRIAL",
    trial_started_at: trialStart.toISOString(),
    trial_expires_at: trialEnd.toISOString(),
    monthly_fee_ngn: session.package_code === "PREMIUM" ? 150000 : session.package_code === "STANDARD" ? 75000 : 35000,
    messages_included: session.package_code === "PREMIUM" ? 10000 : session.package_code === "STANDARD" ? 5000 : 1000,
    is_active: true,
  });

  // 7. Update session status
  await sb.from("onboarding_sessions")
    .update({
      status: "TRIAL_ACTIVATED",
      meta_auth_code: authCode.substring(0, 20) + "...",
      waba_id: result.wabaId,
      phone_number_id: result.phoneNumberId,
    })
    .eq("id", session.id);

  return { success: true };
}
