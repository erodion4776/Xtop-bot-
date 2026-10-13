// supabase/functions/whatsapp-webhook/modules/onboarding.ts
// Generates onboarding sessions and sends signup links to customers.

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

const sb = getSupabaseClient();

/**
 * Generate a secure onboarding session and return the signup link.
 */
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

  const baseUrl = Deno.env.get("ONBOARDING_BASE_URL") || "";
  return `${baseUrl}/onboard/${sessionToken}`;
}

/**
 * Handle a customer requesting their own WhatsApp bot.
 * Creates a tenant, generates an onboarding link, and sends it.
 */
export async function handleOnboardingRequest(
  phone: string,
  text: string,
  contactId: string,
  conversationId: string
): Promise<boolean> {
  const lower = text.toLowerCase().trim();

  const isOnboardingIntent =
    lower.includes("i want a bot") ||
    lower.includes("get my own bot") ||
    lower.includes("set up my bot") ||
    lower.includes("connect my whatsapp") ||
    lower.includes("i need a bot for my business") ||
    lower.includes("onboard") ||
    lower === "signup" ||
    lower === "sign up";

  if (!isOnboardingIntent) return false;

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

  // Create tenant
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

  // Create onboarding session
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
