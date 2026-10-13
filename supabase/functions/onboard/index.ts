// supabase/functions/onboard/index.ts
// Meta Embedded Signup Onboarding Portal (Mobile & Desktop Optimized)
// Handles resilient URL token parsing, mobile redirect flow, and token exchange.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  );
}

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}

// ══════════════════════════════════════════════════════
// AES-256-GCM ENCRYPTION
// ══════════════════════════════════════════════════════

async function encryptToken(plainText: string): Promise<string> {
  const keyHex = Deno.env.get("ENCRYPTION_KEY") || "";
  if (!keyHex || keyHex.length !== 64) {
    throw new Error("ENCRYPTION_KEY not configured");
  }
  const keyBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    keyBytes[i] = parseInt(keyHex.substring(i * 2, i * 2 + 2), 16);
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, cryptoKey, new TextEncoder().encode(plainText)
  );
  const combined = new Uint8Array(12 + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), 12);
  return btoa(String.fromCharCode(...combined));
}

// ══════════════════════════════════════════════════════
// META AUTH CODE EXCHANGE
// ══════════════════════════════════════════════════════

async function exchangeMetaAuthCode(authCode: string) {
  const appId = Deno.env.get("META_APP_ID") || "";
  const appSecret = Deno.env.get("META_APP_SECRET") || "";
  const systemToken = Deno.env.get("META_SYSTEM_USER_TOKEN") || "";
  const graphApi = "https://graph.facebook.com/v21.0";

  // Step 1: Exchange auth code for user access token
  const tokenUrl = `${graphApi}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${encodeURIComponent(authCode)}`;
  const tokenResp = await fetch(tokenUrl);
  if (!tokenResp.ok) {
    console.error("[Meta Exchange Error]:", await tokenResp.text());
    return null;
  }
  const tokenData = await tokenResp.json();
  const userToken = tokenData.access_token;
  if (!userToken) return null;

  // Step 2: Get WABA ID
  const wabaResp = await fetch(`${graphApi}/me/whatsapp_business_accounts?access_token=${userToken}`);
  if (!wabaResp.ok) return null;
  const wabaData = await wabaResp.json();
  const wabaId = wabaData.data?.[0]?.id;
  if (!wabaId) return null;

  // Step 3: Get phone number ID
  const activeToken = systemToken || userToken;
  const phoneResp = await fetch(`${graphApi}/${wabaId}/phone_numbers?access_token=${activeToken}`);
  if (!phoneResp.ok) return null;
  const phoneData = await phoneResp.json();
  const phoneNumberId = phoneData.data?.[0]?.id;
  const displayPhone = phoneData.data?.[0]?.display_phone_number || "";
  const verifiedName = phoneData.data?.[0]?.verified_name || "";
  if (!phoneNumberId) return null;

  // Step 4: Subscribe webhook
  await fetch(`${graphApi}/${wabaId}/subscribed_apps?access_token=${activeToken}`, { method: "POST" });

  return { accessToken: activeToken, wabaId, phoneNumberId, displayPhone, verifiedName };
}

// ══════════════════════════════════════════════════════
// SERVE ONBOARDING HTML PAGE
// ══════════════════════════════════════════════════════

async function serveOnboardingPage(sessionToken: string, currentUrl: URL): Promise<Response> {
  const sb = getSupabase();

  // Validate session
  const { data: session, error: sessErr } = await sb
    .from("onboarding_sessions")
    .select("*, tenants(*)")
    .eq("session_token", sessionToken)
    .maybeSingle();

  if (sessErr || !session) {
    console.error("[Onboard Session Lookup Error]:", sessErr, { sessionToken });
    return htmlResponse(getExpiredPage());
  }

  if (new Date(session.expires_at) < new Date()) {
    return htmlResponse(getExpiredPage());
  }

  if (session.status === "TRIAL_ACTIVATED") {
    return htmlResponse(getSuccessPage(session));
  }

  // Fetch packages with fallback default packages if table is not yet seeded
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
  const callbackUrl = `${currentUrl.origin}${currentUrl.pathname}`;

  return htmlResponse(getOnboardingHtml(sessionToken, appId, tenantName, packages, callbackUrl));
}

// ══════════════════════════════════════════════════════
// HANDLE META CALLBACK (POST)
// ══════════════════════════════════════════════════════

async function handleCallback(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { session_token, auth_code, package_code } = body;

    if (!session_token || !auth_code) {
      return jsonResponse({ error: "Missing session_token or auth_code" }, 400);
    }

    const sb = getSupabase();

    // Validate session
    const { data: session } = await sb
      .from("onboarding_sessions")
      .select("*")
      .eq("session_token", session_token)
      .maybeSingle();

    if (!session) return jsonResponse({ error: "Invalid session" }, 404);
    if (new Date(session.expires_at) < new Date()) return jsonResponse({ error: "Session expired" }, 410);
    if (session.status === "TRIAL_ACTIVATED") return jsonResponse({ error: "Already completed" }, 409);

    // Exchange auth code
    const result = await exchangeMetaAuthCode(auth_code);
    if (!result) {
      await sb.from("onboarding_sessions").update({ status: "FAILED", error_message: "Token exchange failed" }).eq("id", session.id);
      return jsonResponse({ error: "Meta authorization failed. Please ensure your Meta app has Embedded Signup enabled." }, 500);
    }

    // Encrypt and store token
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

    // Activate trial
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

    // Update session
    await sb.from("onboarding_sessions").update({
      status: "TRIAL_ACTIVATED",
      waba_id: result.wabaId,
      phone_number_id: result.phoneNumberId,
    }).eq("id", session.id);

    // Activate tenant
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
// HTML TEMPLATES
// ══════════════════════════════════════════════════════

function getOnboardingHtml(
  token: string,
  appId: string,
  tenantName: string,
  packages: any[],
  callbackUrl: string
): string {
  const packageCards = packages.map((pkg: any) => `
    <div class="pkg-card ${pkg.code === 'STANDARD' ? 'selected' : ''}" data-code="${pkg.code}" onclick="selectPackage('${pkg.code}')">
      ${pkg.code === 'STANDARD' ? '<div class="pkg-badge">⭐ POPULAR</div>' : ''}
      <h3>${pkg.name}</h3>
      <div class="pkg-price">₦${Number(pkg.monthly_fee_ngn).toLocaleString()}<span>/mo</span></div>
      <div class="pkg-trial">${pkg.trial_days || 14}-day free trial (₦0 today)</div>
      <ul>${(pkg.features || []).map((f: string) => `<li>✓ ${f}</li>`).join("")}</ul>
    </div>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Connect WhatsApp — Xtop</title>
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
    <h1>🟢 Xtop WhatsApp Bot</h1>
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
      You will be redirected to Meta to log in with Facebook, select or create your WhatsApp Business Account, and verify your phone number.
    </p>
    <button class="btn btn-primary" id="btnConnect" onclick="startMetaSignup()">
      🔗 Connect WhatsApp with Meta
    </button>
    <button class="btn btn-secondary" onclick="goToStep1()">← Back</button>
    <div class="error hidden" id="errorMsg"></div>
  </div>

  <div class="step hidden" id="step3">
    <div class="status">
      <div class="success-icon">🎉</div>
      <h2 style="color:#25D366;font-size:20px">Your Bot is Live!</h2>
      <p id="successMsg" style="margin-top:12px;font-size:14px;line-height:1.6;color:#444"></p>
    </div>
  </div>
</div>

<script>
let selectedPackage = 'STANDARD';
const SESSION_TOKEN = '${token}';
const APP_ID = '${appId}';
const CALLBACK_URL = '${callbackUrl}';

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

function startMetaSignup() {
  const btn = document.getElementById('btnConnect');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading"></span> Redirecting to Meta...';
  document.getElementById('errorMsg').classList.add('hidden');

  // Store state in sessionStorage before redirecting
  sessionStorage.setItem('xtop_session_token', SESSION_TOKEN);
  sessionStorage.setItem('xtop_package_code', selectedPackage);

  const redirectUri = window.location.origin + window.location.pathname;

  // Direct mobile & desktop compatible Meta OAuth URL
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
  btn.innerHTML = '<span class="loading"></span> Setting up your bot...';

  const savedPackage = sessionStorage.getItem('xtop_package_code') || selectedPackage;

  try {
    const resp = await fetch(window.location.pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_token: SESSION_TOKEN,
        auth_code: code,
        package_code: savedPackage
      })
    });

    const data = await resp.json();

    if (data.success) {
      document.getElementById('step2').classList.add('hidden');
      document.getElementById('step3').classList.remove('hidden');
      document.getElementById('successMsg').innerHTML =
        'Your WhatsApp Business number <strong>' + (data.phone || 'Connected') + '</strong> is now active.<br><br>' +
        '📦 Package: <strong>' + data.package + '</strong><br>' +
        '🗓️ 14-Day Free Trial Ends: <strong>' + new Date(data.trial_ends).toLocaleDateString() + '</strong><br><br>' +
        '👉 <strong>Send "hi" to your new WhatsApp number to test your bot!</strong>';
      window.history.replaceState({}, '', window.location.pathname);
    } else {
      showError(data.error || 'Setup could not be completed. Please try again.');
      btn.disabled = false;
      btn.textContent = '🔗 Connect WhatsApp with Meta';
    }
  } catch (err) {
    showError('Network error during setup. Please refresh and try again.');
    btn.disabled = false;
    btn.textContent = '🔗 Connect WhatsApp with Meta';
  }
}

function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// Check for code returned from Meta OAuth redirect
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
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Link Expired — Xtop</title>
<style>body{font-family:sans-serif;text-align:center;padding:60px 20px;background:#f0f2f5}
h1{color:#e74c3c}p{color:#65676b;margin-top:12px;font-size:15px}</style></head>
<body><h1>⏰ Link Expired or Invalid</h1>
<p>This onboarding session link is no longer valid or has expired.<br><br>Please type <strong>"I want a bot"</strong> on WhatsApp to generate a fresh signup link.</p>
</body></html>`;
}

function getSuccessPage(session: any): string {
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Setup Complete — Xtop</title>
<style>body{font-family:sans-serif;text-align:center;padding:60px 20px;background:#f0f2f5}
h1{color:#25D366}p{color:#65676b;margin-top:12px;font-size:15px}</style></head>
<body><h1>🎉 Setup Already Complete!</h1>
<p>Your WhatsApp bot is already connected and running.<br><br>Send <strong>"hi"</strong> to your WhatsApp Business number to start chatting with your bot.</p>
</body></html>`;
}

// ══════════════════════════════════════════════════════
// MAIN ROUTER
// ══════════════════════════════════════════════════════

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathSegments = url.pathname.split("/").filter(Boolean);

  // Resilient token resolver (handles /functions/v1/onboard/TOKEN, /onboard/TOKEN, ?token=TOKEN, etc.)
  let sessionToken = url.searchParams.get("token") || url.searchParams.get("state") || "";

  if (!sessionToken && pathSegments.length > 0) {
    const lastSeg = pathSegments[pathSegments.length - 1];
    if (lastSeg !== "onboard" && lastSeg !== "v1" && lastSeg !== "functions") {
      sessionToken = lastSeg;
    }
  }

  if (req.method === "GET") {
    if (!sessionToken) {
      return htmlResponse(getExpiredPage(), 404);
    }
    return await serveOnboardingPage(sessionToken, url);
  }

  if (req.method === "POST") {
    return await handleCallback(req);
  }

  return new Response("Method not allowed", { status: 405 });
});
