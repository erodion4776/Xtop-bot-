// supabase/functions/whatsapp-webhook/modules/onboarding.ts
// Multi-Tenant Meta Embedded Signup Onboarding Portal & Flow Handler
// Guaranteed text/html response headers for all mobile browsers.

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

export function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "no-cache, no-store, must-revalidate",
    },
  });
}

export function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
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

  const rawBaseUrl = Deno.env.get("ONBOARDING_BASE_URL") || "";
  const baseUrl = rawBaseUrl
    ? rawBaseUrl.replace(/\/+$/, "")
    : "https://mldywarnnwjitfvqpgis.supabase.co/functions/v1/whatsapp-webhook";

  return `${baseUrl}?action=onboard&token=${sessionToken}`;
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
// 3. META AUTH CODE EXCHANGE
// ══════════════════════════════════════════════════════

async function exchangeMetaAuthCode(authCode: string, redirectUri: string) {
  const appId = Deno.env.get("META_APP_ID") || "1947931015867084";
  const appSecret = Deno.env.get("META_APP_SECRET") || "";
  const systemToken = Deno.env.get("META_SYSTEM_USER_TOKEN") || "";
  const graphApi = "https://graph.facebook.com/v21.0";

  const tokenUrl =
    `${graphApi}/oauth/access_token?client_id=${appId}` +
    `&client_secret=${encodeURIComponent(appSecret)}` +
    `&code=${encodeURIComponent(authCode)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;

  const tokenResp = await fetch(tokenUrl);
  if (!tokenResp.ok) {
    console.error("[Meta Exchange Error]:", await tokenResp.text());
    return null;
  }
  const tokenData = await tokenResp.json();
  const userToken = tokenData.access_token;
  if (!userToken) return null;

  const wabaResp = await fetch(`${graphApi}/me/whatsapp_business_accounts?access_token=${userToken}`);
  if (!wabaResp.ok) return null;
  const wabaData = await wabaResp.json();
  const wabaId = wabaData.data?.[0]?.id;
  if (!wabaId) return null;

  const activeToken = systemToken || userToken;
  const phoneResp = await fetch(`${graphApi}/${wabaId}/phone_numbers?access_token=${activeToken}`);
  if (!phoneResp.ok) return null;
  const phoneData = await phoneResp.json();
  const phoneNumberId = phoneData.data?.[0]?.id;
  const displayPhone = phoneData.data?.[0]?.display_phone_number || "";
  const verifiedName = phoneData.data?.[0]?.verified_name || "";
  if (!phoneNumberId) return null;

  await fetch(`${graphApi}/${wabaId}/subscribed_apps?access_token=${activeToken}`, { method: "POST" });

  return { accessToken: activeToken, wabaId, phoneNumberId, displayPhone, verifiedName };
}

// ══════════════════════════════════════════════════════
// 4. ONBOARDING PORTAL HTML & POST HANDLER
// ══════════════════════════════════════════════════════

export async function serveOnboardingPortal(url: URL): Promise<Response> {
  const sessionToken = url.searchParams.get("token") || url.searchParams.get("state") || "";

  if (!sessionToken) {
    return htmlResponse(getExpiredPage(), 404);
  }

  const { data: session, error: sessErr } = await sb
    .from("onboarding_sessions")
    .select("*, tenants(*)")
    .eq("session_token", sessionToken)
    .maybeSingle();

  if (sessErr || !session || new Date(session.expires_at) < new Date()) {
    return htmlResponse(getExpiredPage());
  }

  if (session.status === "TRIAL_ACTIVATED") {
    return htmlResponse(getSuccessPage(session));
  }

  let { data: packages } = await sb
    .from("tenant_packages")
    .select("*")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (!packages || packages.length === 0) {
    packages = [
      {
        code: "BASIC",
        name: "Basic",
        monthly_fee_ngn: 35000,
        trial_days: 14,
        features: ["Auto-replies & Menus", "Product Catalogue", "Lead Capture", "Agent Handover"],
      },
      {
        code: "STANDARD",
        name: "Standard",
        monthly_fee_ngn: 75000,
        trial_days: 14,
        features: ["Everything in Basic", "Sales Quotation Engine", "Interactive Business Demos", "Free Tools Suite"],
      },
      {
        code: "PREMIUM",
        name: "Premium",
        monthly_fee_ngn: 150000,
        trial_days: 14,
        features: ["Everything in Standard", "Workflow Automation", "Magazine Studio", "Priority Support"],
      },
    ];
  }

  const appId = Deno.env.get("META_APP_ID") || "1947931015867084";
  const tenantName = (session as any).tenants?.business_name || (session as any).tenants?.name || "Your Business";

  return htmlResponse(getOnboardingHtml(sessionToken, appId, tenantName, packages, url));
}

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

    if (!session) return jsonResponse({ error: "Invalid session" }, 404);
    if (new Date(session.expires_at) < new Date()) return jsonResponse({ error: "Session expired" }, 410);
    if (session.status === "TRIAL_ACTIVATED") return jsonResponse({ error: "Already completed" }, 409);

    const result = await exchangeMetaAuthCode(auth_code, redirect_uri);
    if (!result) {
      await sb.from("onboarding_sessions").update({ status: "FAILED", error_message: "Token exchange failed" }).eq("id", session.id);
      return jsonResponse({ error: "Meta authorization failed. Please try again." }, 500);
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
    console.error("[Onboard Callback Error]:", err);
    return jsonResponse({ error: "Internal error during setup" }, 500);
  }
}

// ══════════════════════════════════════════════════════
// 5. HTML TEMPLATES
// ══════════════════════════════════════════════════════

function getOnboardingHtml(
  token: string,
  appId: string,
  tenantName: string,
  packages: any[],
  url: URL
): string {
  const packageCards = packages.map((pkg: any) => `
    <div class="pkg-card ${pkg.code === 'STANDARD' ? 'selected' : ''}" data-code="${pkg.code}" onclick="selectPackage('${pkg.code}')">
      ${pkg.code === 'STANDARD' ? '<div class="pkg-badge">&#11088; POPULAR</div>' : ''}
      <h3>${pkg.name}</h3>
      <div class="pkg-price">&#8358;${Number(pkg.monthly_fee_ngn).toLocaleString()}<span>/mo</span></div>
      <div class="pkg-trial">${pkg.trial_days || 14}-day free trial (&#8358;0 today)</div>
      <ul>${(pkg.features || []).map((f: string) => `<li>&#10003; ${f}</li>`).join("")}</ul>
    </div>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Connect WhatsApp &mdash; Xtop</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f0f2f5;color:#1c1e21;min-height:100vh}
.container{max-width:480px;margin:0 auto;padding:16px}
.header{text-align:center;padding:24px 0 16px}
.header h1{font-size:22px;color:#25D366;font-weight:700}
.header p{color:#65676b;margin-top:6px;font-size:14px}
.step{background:#fff;border-radius:14px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.08)}
.step h2{font-size:16px;margin-bottom:14px;color:#1c1e21}
.pkg-grid{display:flex;flex-direction:column;gap:12px}
.pkg-card{border:2px solid #e4e6eb;border-radius:12px;padding:16px;cursor:pointer;position:relative;transition:all 0.2s}
.pkg-card.selected{border-color:#25D366;background:#f0faf4}
.pkg-badge{position:absolute;top:-10px;right:12px;background:#25D366;color:#fff;font-size:10px;padding:3px 8px;border-radius:10px;font-weight:700}
.pkg-card h3{font-size:17px;margin-bottom:4px}
.pkg-price{font-size:26px;font-weight:700;color:#25D366}
.pkg-price span{font-size:13px;color:#65676b;font-weight:400}
.pkg-trial{font-size:12px;color:#008069;font-weight:600;margin:4px 0 8px}
.pkg-card ul{list-style:none;font-size:13px;color:#444}
.pkg-card li{padding:3px 0}
.btn{display:block;width:100%;padding:15px;border:none;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;text-align:center;margin-top:14px}
.btn-primary{background:#25D366;color:#fff}
.btn-primary:active{background:#1ea952}
.btn-secondary{background:#e4e6eb;color:#1c1e21;margin-top:8px}
.status{text-align:center;padding:24px 12px}
.success-icon{font-size:56px;margin-bottom:12px}
.error{color:#e74c3c;background:#fde8e8;border-radius:8px;padding:12px;text-align:center;margin-top:12px;font-size:14px}
.loading{display:inline-block;width:20px;height:20px;border:3px solid #fff;border-radius:50%;border-top-color:transparent;animation:spin 1s linear infinite;margin-right:8px;vertical-align:middle}
@keyframes spin{to{transform:rotate(360deg)}}
.hidden{display:none}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>&#128994; Xtop WhatsApp Bot</h1>
    <p>Connect <strong>${tenantName}</strong> to your WhatsApp Business number</p>
  </div>

  <div class="step" id="step1">
    <h2>Step 1: Select Your Package</h2>
    <div class="pkg-grid">${packageCards}</div>
    <button class="btn btn-primary" id="btnNext" onclick="goToStep2()">Continue to Connect WhatsApp</button>
  </div>

  <div class="step hidden" id="step2">
    <h2>Step 2: Connect Your WhatsApp Account</h2>
    <p style="font-size:14px;color:#65676b;line-height:1.5;margin-bottom:16px">
      You will log into Facebook with Meta, choose or create your WhatsApp Business Account, and verify your phone number.
    </p>
    <button class="btn btn-primary" id="btnConnect" onclick="startMetaSignup()">
      &#128279; Connect WhatsApp with Meta
    </button>
    <button class="btn btn-secondary" onclick="goToStep1()">&#8592; Back</button>
    <div class="error hidden" id="errorMsg"></div>
  </div>

  <div class="step hidden" id="step3">
    <div class="status">
      <div class="success-icon">&#127881;</div>
      <h2 style="color:#25D366;font-size:20px">Your Bot is Live!</h2>
      <p id="successMsg" style="margin-top:12px;font-size:14px;line-height:1.6;color:#444"></p>
    </div>
  </div>
</div>

<script>
let selectedPackage = 'STANDARD';
const SESSION_TOKEN = '${token}';
const APP_ID = '${appId}';

function selectPackage(code) {
  selectedPackage = code;
  document.querySelectorAll('.pkg-card').forEach(c => c.classList.remove('selected'));
  const card = document.querySelector('[data-code="' + code + '"]');
  if (card) card.classList.add('selected');
}

function goToStep1() {
  document.getElementById('step1').classList.remove('hidden');
  document.getElementById('step2').classList.add('hidden');
}

function goToStep2() {
  document.getElementById('step1').classList.add('hidden');
  document.getElementById('step2').classList.remove('hidden');
}

function getCleanRedirectUri() {
  return window.location.origin + window.location.pathname + '?action=onboard&token=' + SESSION_TOKEN;
}

function startMetaSignup() {
  const btn = document.getElementById('btnConnect');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading"></span> Connecting with Meta...';
  document.getElementById('errorMsg').classList.add('hidden');

  sessionStorage.setItem('xtop_package_code', selectedPackage);

  const redirectUri = getCleanRedirectUri();
  const metaUrl = 'https://www.facebook.com/v21.0/dialog/oauth' +
    '?client_id=' + encodeURIComponent(APP_ID) +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&scope=' + encodeURIComponent('whatsapp_business_management,whatsapp_business_messaging') +
    '&response_type=code' +
    '&state=' + encodeURIComponent(SESSION_TOKEN);

  window.location.href = metaUrl;
}

async function handleReturnedCode(code) {
  document.getElementById('step1').classList.add('hidden');
  document.getElementById('step2').classList.remove('hidden');
  const btn = document.getElementById('btnConnect');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading"></span> Activating your WhatsApp bot...';

  const savedPackage = sessionStorage.getItem('xtop_package_code') || selectedPackage;

  try {
    const resp = await fetch(window.location.href, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        session_token: SESSION_TOKEN,
        auth_code: code,
        package_code: savedPackage,
        redirect_uri: getCleanRedirectUri()
      })
    });

    const data = await resp.json();

    if (data.success) {
      document.getElementById('step2').classList.add('hidden');
      document.getElementById('step3').classList.remove('hidden');
      document.getElementById('successMsg').innerHTML =
        'Your WhatsApp Business number <strong>' + (data.phone || 'Connected') + '</strong> is now active.<br><br>' +
        '&#128230; Package: <strong>' + data.package + '</strong><br>' +
        '&#128197; 14-Day Free Trial Ends: <strong>' + new Date(data.trial_ends).toLocaleDateString() + '</strong><br><br>' +
        '&#128073; <strong>Send "hi" to your new WhatsApp number to test your bot!</strong>';
    } else {
      showError(data.error || 'Setup could not be completed. Please try again.');
      btn.disabled = false;
      btn.textContent = '&#128279; Connect WhatsApp with Meta';
    }
  } catch (err) {
    showError('Network error during setup. Please refresh and try again.');
    btn.disabled = false;
    btn.textContent = '&#128279; Connect WhatsApp with Meta';
  }
}

function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.classList.remove('hidden');
}

window.addEventListener('load', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  if (code) {
    handleReturnedCode(code);
  }
});
</script>
</body>
</html>`;
}

function getExpiredPage(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Link Expired &mdash; Xtop</title>
<style>body{font-family:sans-serif;text-align:center;padding:60px 20px;background:#f0f2f5}
h1{color:#e74c3c}p{color:#65676b;margin-top:12px;font-size:15px}</style></head>
<body><h1>&#9200; Link Expired or Invalid</h1>
<p>This onboarding session link is no longer valid or has expired.<br><br>Please type <strong>"I want a bot"</strong> on WhatsApp to generate a fresh signup link.</p>
</body></html>`;
}

function getSuccessPage(session: any): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Setup Complete &mdash; Xtop</title>
<style>body{font-family:sans-serif;text-align:center;padding:60px 20px;background:#f0f2f5}
h1{color:#25D366}p{color:#65676b;margin-top:12px;font-size:15px}</style></head>
<body><h1>&#127881; Setup Already Complete!</h1>
<p>Your WhatsApp bot is already connected and running.<br><br>Send <strong>"hi"</strong> to your WhatsApp Business number to start chatting with your bot.</p>
</body></html>`;
}
