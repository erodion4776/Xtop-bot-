// supabase/functions/onboard/index.ts
// Meta Embedded Signup Onboarding Portal
// Serves the onboarding page and handles Meta auth code exchange.

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
// AES-256-GCM ENCRYPTION (INLINE TO AVOID IMPORT ISSUES)
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
  if (!tokenResp.ok) return null;
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

async function serveOnboardingPage(sessionToken: string): Promise<Response> {
  const sb = getSupabase();

  // Validate session
  const { data: session } = await sb
    .from("onboarding_sessions")
    .select("*, tenants(*)")
    .eq("session_token", sessionToken)
    .maybeSingle();

  if (!session || new Date(session.expires_at) < new Date()) {
    return htmlResponse(getExpiredPage());
  }

  if (session.status === "TRIAL_ACTIVATED") {
    return htmlResponse(getSuccessPage(session));
  }

  // Fetch available packages
  const { data: packages } = await sb
    .from("tenant_packages")
    .select("*")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  const appId = Deno.env.get("META_APP_ID") || "";
  const tenantName = (session as any).tenants?.business_name || (session as any).tenants?.name || "Your Business";

  return htmlResponse(getOnboardingHtml(sessionToken, appId, tenantName, packages || []));
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
      return jsonResponse({ error: "Meta authorization failed" }, 500);
    }

    // Check duplicate phone
    const { data: existing } = await sb
      .from("tenant_whatsapp_accounts")
      .select("id")
      .eq("phone_number_id", result.phoneNumberId)
      .maybeSingle();

    if (existing) {
      await sb.from("onboarding_sessions").update({ status: "FAILED", error_message: "Phone already registered" }).eq("id", session.id);
      return jsonResponse({ error: "Phone number already connected" }, 409);
    }

    // Encrypt and store token
    const encryptedToken = await encryptToken(result.accessToken);

    await sb.from("tenant_whatsapp_accounts").insert({
      tenant_id: session.tenant_id,
      waba_id: result.wabaId,
      phone_number_id: result.phoneNumberId,
      display_phone_number: result.displayPhone,
      verified_name: result.verifiedName,
      encrypted_access_token: encryptedToken,
      is_active: true,
    });

    // Activate trial
    const { data: pkg } = await sb
      .from("tenant_packages")
      .select("*")
      .eq("code", package_code || session.package_code || "BASIC")
      .maybeSingle();

    const trialDays = pkg?.trial_days || 14;
    const trialStart = new Date();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + trialDays);

    await sb.from("tenant_subscriptions").insert({
      tenant_id: session.tenant_id,
      package_code: pkg?.code || "BASIC",
      package_name: pkg?.name || "Basic",
      status: "TRIAL",
      trial_started_at: trialStart.toISOString(),
      trial_expires_at: trialEnd.toISOString(),
      monthly_fee_ngn: pkg?.monthly_fee_ngn || 35000,
      messages_included: pkg?.messages_included || 1000,
      is_active: true,
    });

    // Enable tenant modules
    if (pkg?.modules && Array.isArray(pkg.modules)) {
      for (const mod of pkg.modules) {
        await sb.from("tenant_modules").upsert(
          { tenant_id: session.tenant_id, module_key: mod, is_enabled: true },
          { onConflict: "tenant_id,module_key" }
        );
      }
    }

    // Update session
    await sb.from("onboarding_sessions").update({
      status: "TRIAL_ACTIVATED",
      waba_id: result.wabaId,
      phone_number_id: result.phoneNumberId,
    }).eq("id", session.id);

    // Activate tenant
    await sb.from("tenants").update({ is_active: true }).eq("id", session.tenant_id);

    return jsonResponse({
      success: true,
      phone: result.displayPhone,
      trial_ends: trialEnd.toISOString(),
      package: pkg?.name || "Basic",
    });
  } catch (err) {
    console.error("[Onboard Callback Error]:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
}

// ══════════════════════════════════════════════════════
// HTML TEMPLATES
// ══════════════════════════════════════════════════════

function getOnboardingHtml(token: string, appId: string, tenantName: string, packages: any[]): string {
  const packageCards = packages.map((pkg: any) => `
    <div class="pkg-card" data-code="${pkg.code}" onclick="selectPackage('${pkg.code}')">
      <div class="pkg-badge">${pkg.code === 'STANDARD' ? '⭐ POPULAR' : ''}</div>
      <h3>${pkg.name}</h3>
      <div class="pkg-price">₦${Number(pkg.monthly_fee_ngn).toLocaleString()}<span>/mo</span></div>
      <div class="pkg-trial">${pkg.trial_days}-day free trial</div>
      <ul>${(pkg.features || []).map((f: string) => `<li>✓ ${f}</li>`).join("")}</ul>
    </div>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Connect WhatsApp — Xtop</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f0f2f5;color:#1c1e21;min-height:100vh}
.container{max-width:480px;margin:0 auto;padding:20px}
.header{text-align:center;padding:30px 0 20px}
.header h1{font-size:24px;color:#25D366}
.header p{color:#65676b;margin-top:8px;font-size:14px}
.step{background:#fff;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.1)}
.step h2{font-size:16px;margin-bottom:12px;color:#1c1e21}
.pkg-grid{display:flex;flex-direction:column;gap:12px}
.pkg-card{border:2px solid #e4e6eb;border-radius:10px;padding:16px;cursor:pointer;position:relative;transition:border-color 0.2s}
.pkg-card.selected{border-color:#25D366;background:#f0faf4}
.pkg-badge{position:absolute;top:-10px;right:12px;background:#25D366;color:#fff;font-size:11px;padding:2px 8px;border-radius:10px;font-weight:700}
.pkg-card h3{font-size:18px;margin-bottom:4px}
.pkg-price{font-size:28px;font-weight:700;color:#25D366}
.pkg-price span{font-size:14px;color:#65676b;font-weight:400}
.pkg-trial{font-size:13px;color:#65676b;margin:4px 0 8px}
.pkg-card ul{list-style:none;font-size:13px;color:#444}
.pkg-card li{padding:2px 0}
.btn{display:block;width:100%;padding:14px;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;text-align:center;margin-top:12px}
.btn-primary{background:#25D366;color:#fff}
.btn-primary:disabled{background:#ccc;cursor:not-allowed}
.btn-secondary{background:#e4e6eb;color:#1c1e21}
.status{text-align:center;padding:20px;font-size:14px;color:#65676b}
.success-icon{font-size:64px;margin-bottom:12px}
.error{color:#e74c3c;text-align:center;padding:12px;font-size:14px}
.hidden{display:none}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>🟢 Xtop WhatsApp Bot</h1>
    <p>Set up <strong>${tenantName}</strong> with your own WhatsApp Business number</p>
  </div>

  <div class="step" id="step1">
    <h2>Step 1: Choose Your Package</h2>
    <div class="pkg-grid">${packageCards}</div>
    <button class="btn btn-primary" id="btnNext" disabled onclick="goToStep2()">Continue</button>
  </div>

  <div class="step hidden" id="step2">
    <h2>Step 2: Connect Your WhatsApp</h2>
    <p style="font-size:14px;color:#65676b;margin-bottom:12px">
      Click the button below to securely connect your WhatsApp Business account through Meta. You will need to log in with your Facebook account and verify your phone number.
    </p>
    <button class="btn btn-primary" id="btnConnect" onclick="launchSignup()">
      🔗 Connect WhatsApp Business
    </button>
    <button class="btn btn-secondary" onclick="goToStep1()">← Back</button>
    <div class="error hidden" id="errorMsg"></div>
  </div>

  <div class="step hidden" id="step3">
    <div class="status">
      <div class="success-icon">🎉</div>
      <h2>Your Bot is Live!</h2>
      <p id="successMsg" style="margin-top:8px"></p>
      <button class="btn btn-primary" style="margin-top:20px" onclick="window.close()">Done</button>
    </div>
  </div>
</div>

<script>
let selectedPackage = '';
const SESSION_TOKEN = '${token}';
const APP_ID = '${appId}';

function selectPackage(code) {
  selectedPackage = code;
  document.querySelectorAll('.pkg-card').forEach(c => c.classList.remove('selected'));
  document.querySelector('[data-code="' + code + '"]').classList.add('selected');
  document.getElementById('btnNext').disabled = false;
}

function goToStep1() {
  document.getElementById('step1').classList.remove('hidden');
  document.getElementById('step2').classList.add('hidden');
}

function goToStep2() {
  document.getElementById('step1').classList.add('hidden');
  document.getElementById('step2').classList.remove('hidden');
}

function launchSignup() {
  const btn = document.getElementById('btnConnect');
  btn.disabled = true;
  btn.textContent = 'Opening Meta Signup...';
  document.getElementById('errorMsg').classList.add('hidden');

  const redirectUri = window.location.origin + window.location.pathname;
  const configId = ''; // Optional: pre-configured WABA config ID

  // Launch Meta Embedded Signup
  window.open(
    'https://www.facebook.com/v21.0/dialog/whatsapp_business_signup' +
    '?app_id=' + APP_ID +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&session_info=' + encodeURIComponent(JSON.stringify({type: 'whatsapp_business', waba_id: configId})) +
    '&state=' + SESSION_TOKEN,
    'meta_signup',
    'width=600,height=700,scrollbars=yes'
  );

  // Listen for the popup to close and check for auth code
  const checkInterval = setInterval(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
      clearInterval(checkInterval);
      await completeOnboarding(code);
    }
  }, 2000);

  // Also check after 5 minutes timeout
  setTimeout(() => {
    clearInterval(checkInterval);
    if (btn.disabled) {
      btn.disabled = false;
      btn.textContent = '🔗 Connect WhatsApp Business';
      showError('Signup timed out. Please try again.');
    }
  }, 300000);
}

async function completeOnboarding(code) {
  const btn = document.getElementById('btnConnect');
  btn.textContent = 'Setting up your bot...';

  try {
    const resp = await fetch(window.location.pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_token: SESSION_TOKEN,
        auth_code: code,
        package_code: selectedPackage
      })
    });

    const data = await resp.json();

    if (data.success) {
      document.getElementById('step2').classList.add('hidden');
      document.getElementById('step3').classList.remove('hidden');
      document.getElementById('successMsg').innerHTML =
        'Your WhatsApp number <strong>' + (data.phone || '') + '</strong> is now connected.<br>' +
        'Package: <strong>' + data.package + '</strong><br>' +
        'Trial ends: <strong>' + new Date(data.trial_ends).toLocaleDateString() + '</strong><br><br>' +
        'Send "hi" to your new WhatsApp number to test your bot!';
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    } else {
      showError(data.error || 'Setup failed. Please try again.');
      btn.disabled = false;
      btn.textContent = '🔗 Connect WhatsApp Business';
    }
  } catch (err) {
    showError('Network error. Please check your connection and try again.');
    btn.disabled = false;
    btn.textContent = '🔗 Connect WhatsApp Business';
  }
}

function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// Check if returning from Meta signup
window.addEventListener('load', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  if (code && selectedPackage) {
    completeOnboarding(code);
  }
});
</script>
</body>
</html>`;
}

function getExpiredPage(): string {
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Link Expired</title>
<style>body{font-family:sans-serif;text-align:center;padding:60px 20px;background:#f0f2f5}
h1{color:#e74c3c}p{color:#65676b;margin-top:12px}</style></head>
<body><h1>⏰ Link Expired</h1>
<p>This onboarding link has expired. Please contact Xtop on WhatsApp to get a new link.</p>
</body></html>`;
}

function getSuccessPage(session: any): string {
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Setup Complete</title>
<style>body{font-family:sans-serif;text-align:center;padding:60px 20px;background:#f0f2f5}
h1{color:#25D366}p{color:#65676b;margin-top:12px}</style></head>
<body><h1>🎉 Setup Complete!</h1>
<p>Your WhatsApp bot is already active. Send "hi" to your WhatsApp Business number to test it.</p>
</body></html>`;
}

// ══════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // Expected: /onboard/TOKEN or /onboard?token=TOKEN
  const sessionToken = pathParts[1] || url.searchParams.get("token") || "";

  if (req.method === "GET") {
    if (!sessionToken) {
      return htmlResponse(getExpiredPage(), 404);
    }
    return await serveOnboardingPage(sessionToken);
  }

  if (req.method === "POST") {
    return await handleCallback(req);
  }

  return new Response("Method not allowed", { status: 405 });
});
