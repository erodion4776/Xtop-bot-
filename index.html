<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Connect WhatsApp &mdash; Xtop Retail Technologies</title>
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
.btn{display:block;width:100%;padding:15px;border:none;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;text-align:center;margin-top:14px;text-decoration:none}
.btn-primary{background:#25D366;color:#fff}
.btn-primary:active{background:#1ea952}
.btn-secondary{background:#e4e6eb;color:#1c1e21;margin-top:8px}
.status{text-align:center;padding:24px 12px}
.success-icon{font-size:56px;margin-bottom:12px}
.error{color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;text-align:center;margin-top:12px;font-size:14px;line-height:1.4}
.tip-box{background:#e8f4fd;border-left:4px solid #1877f2;padding:12px;border-radius:6px;font-size:13px;color:#0c5460;margin-top:14px;line-height:1.4}
.loading{display:inline-block;width:18px;height:18px;border:2.5px solid #fff;border-radius:50%;border-top-color:transparent;animation:spin 0.8s linear infinite;margin-right:8px;vertical-align:middle}
@keyframes spin{to{transform:rotate(360deg)}}
.hidden{display:none}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>&#128994; Xtop WhatsApp Bot</h1>
    <p>Connect your business to your WhatsApp Business number</p>
  </div>

  <!-- STEP 1: PACKAGE SELECTION -->
  <div class="step" id="step1">
    <h2>Step 1: Select Your Package</h2>
    <div class="pkg-grid">
      <div class="pkg-card" data-code="BASIC" onclick="selectPackage('BASIC')">
        <h3>Basic</h3>
        <div class="pkg-price">&#8358;35,000<span>/mo</span></div>
        <div class="pkg-trial">14-day free trial (&#8358;0 today)</div>
        <ul>
          <li>&#10003; Auto-replies & Menus</li>
          <li>&#10003; Product Catalogue</li>
          <li>&#10003; Lead Capture</li>
          <li>&#10003; Agent Handover</li>
        </ul>
      </div>
      
      <div class="pkg-card selected" data-code="STANDARD" onclick="selectPackage('STANDARD')">
        <div class="pkg-badge">&#11088; POPULAR</div>
        <h3>Standard</h3>
        <div class="pkg-price">&#8358;75,000<span>/mo</span></div>
        <div class="pkg-trial">14-day free trial (&#8358;0 today)</div>
        <ul>
          <li>&#10003; Everything in Basic</li>
          <li>&#10003; Sales Quotation Engine</li>
          <li>&#10003; Interactive Business Demos</li>
          <li>&#10003; Free Tools Suite</li>
        </ul>
      </div>

      <div class="pkg-card" data-code="PREMIUM" onclick="selectPackage('PREMIUM')">
        <h3>Premium</h3>
        <div class="pkg-price">&#8358;150,000<span>/mo</span></div>
        <div class="pkg-trial">14-day free trial (&#8358;0 today)</div>
        <ul>
          <li>&#10003; Everything in Standard</li>
          <li>&#10003; Workflow Automation</li>
          <li>&#10003; Magazine Studio</li>
          <li>&#10003; Priority Support</li>
        </ul>
      </div>
    </div>
    <button class="btn btn-primary" id="btnNext" onclick="goToStep2()">Continue to Connect WhatsApp</button>
  </div>

  <!-- STEP 2: META EMBEDDED SIGNUP -->
  <div class="step hidden" id="step2">
    <h2>Step 2: Connect Your WhatsApp Account</h2>
    <p style="font-size:14px;color:#65676b;line-height:1.5;margin-bottom:12px">
      Log in with Meta to select or create your WhatsApp Business Account and verify your phone number.
    </p>

    <button id="btnConnect" class="btn btn-primary" onclick="triggerMetaAuth()">
      &#128279; Connect WhatsApp with Meta
    </button>

    <div id="webviewTip" class="tip-box hidden">
      <strong>📱 Opening from WhatsApp?</strong><br>
      If the Facebook popup does not appear, tap the <strong>three dots (&#8942;)</strong> in the top-right corner and select <strong>"Open in Chrome / Browser"</strong>.
    </div>

    <button class="btn btn-secondary" onclick="goToStep1()">&#8592; Back</button>
    <div class="error hidden" id="errorMsg"></div>
  </div>

  <!-- STEP 3: SUCCESS CONFIRMATION -->
  <div class="step hidden" id="step3">
    <div class="status">
      <div class="success-icon">&#127881;</div>
      <h2 style="color:#25D366;font-size:20px">Your Bot is Live!</h2>
      <p id="successMsg" style="margin-top:12px;font-size:14px;line-height:1.6;color:#444"></p>
    </div>
  </div>
</div>

<!-- Facebook JavaScript SDK -->
<script async defer crossorigin="anonymous" src="https://connect.facebook.net/en_US/sdk.js"></script>

<script>
const SUPABASE_API_URL = "https://mldywarnnwjitfvqpgis.supabase.co/functions/v1/whatsapp-webhook?action=onboard";
const META_APP_ID = "1947931015867084";

let selectedPackage = 'STANDARD';
let fbSdkLoaded = false;
const urlParams = new URLSearchParams(window.location.search);
const SESSION_TOKEN = urlParams.get('token') || urlParams.get('state') || safeStorageGet('xtop_session_token') || '';

// Initialize Facebook SDK
window.fbAsyncInit = function() {
  try {
    FB.init({
      appId: META_APP_ID,
      cookie: true,
      xfbml: false,
      version: 'v21.0'
    });
    fbSdkLoaded = true;
  } catch (e) {
    console.warn("FB SDK init warning:", e);
  }
};

// ══════════════════════════════════════════════════════
// META EMBEDDED SIGNUP MESSAGE LISTENER
// Captures WABA ID and Phone Number ID from Meta popup
// ══════════════════════════════════════════════════════
window.addEventListener('message', (event) => {
  if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") {
    return;
  }

  try {
    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    if (data && data.type === 'WA_EMBEDDED_SIGNUP') {
      if (data.event === 'FINISH') {
        const { phone_number_id, waba_id } = data.data || {};
        console.log('WhatsApp Onboarding Finished:', { phone_number_id, waba_id });
        if (waba_id) safeStorageSet('xtop_waba_id', waba_id);
        if (phone_number_id) safeStorageSet('xtop_phone_id', phone_number_id);
      } else if (data.event === 'CANCEL') {
        showError("WhatsApp setup was cancelled.");
        resetButton();
      } else if (data.event === 'ERROR') {
        showError("An error occurred during WhatsApp setup: " + (data.data?.error_message || "Unknown error"));
        resetButton();
      }
    }
  } catch (e) {
    // Non-JSON message, ignore
  }
});

function safeStorageSet(key, val) {
  try { sessionStorage.setItem(key, val); localStorage.setItem(key, val); } catch (e) {}
}

function safeStorageGet(key) {
  try { return sessionStorage.getItem(key) || localStorage.getItem(key) || ''; } catch (e) { return ''; }
}

function selectPackage(code) {
  selectedPackage = code;
  document.querySelectorAll('.pkg-card').forEach(c => c.classList.remove('selected'));
  const card = document.querySelector('[data-code="' + code + '"]');
  if (card) card.classList.add('selected');
  safeStorageSet('xtop_package_code', selectedPackage);
}

function goToStep1() {
  document.getElementById('step1').classList.remove('hidden');
  document.getElementById('step2').classList.add('hidden');
}

function goToStep2() {
  if (!SESSION_TOKEN) {
    showError("Missing session token. Please type <strong>'I want a bot'</strong> on WhatsApp to generate a fresh link.");
    return;
  }
  safeStorageSet('xtop_session_token', SESSION_TOKEN);
  safeStorageSet('xtop_package_code', selectedPackage);
  document.getElementById('step1').classList.add('hidden');
  document.getElementById('step2').classList.remove('hidden');

  // Detect WhatsApp / in-app browser WebView
  const ua = navigator.userAgent || navigator.vendor || window.opera || '';
  if (/WhatsApp|FBAN|FBAV|Instagram/i.test(ua)) {
    document.getElementById('webviewTip').classList.remove('hidden');
  }
}

function getExactRedirectUri() {
  return window.location.origin + window.location.pathname;
}

function resetButton() {
  const btn = document.getElementById('btnConnect');
  if (btn) {
    btn.innerHTML = '&#128279; Connect WhatsApp with Meta';
    btn.disabled = false;
  }
}

// ══════════════════════════════════════════════════════
// TRIGGER META EMBEDDED SIGNUP
// ══════════════════════════════════════════════════════
function triggerMetaAuth() {
  const btn = document.getElementById('btnConnect');
  btn.innerHTML = '<span class="loading"></span> Connecting with Meta...';
  document.getElementById('errorMsg').classList.add('hidden');

  safeStorageSet('xtop_package_code', selectedPackage);
  safeStorageSet('xtop_session_token', SESSION_TOKEN);

  if (typeof FB !== 'undefined' && fbSdkLoaded) {
    try {
      FB.login(function(response) {
        if (response.authResponse && response.authResponse.code) {
          handleReturnedCode(response.authResponse.code);
        } else if (response.authResponse && response.authResponse.accessToken) {
          handleReturnedCode(response.authResponse.accessToken);
        } else {
          resetButton();
          if (response.status === 'not_authorized') {
            showError("Meta login cancelled. Please tap Connect to try again.");
          }
        }
      }, {
        extras: {
          feature: 'whatsapp_embedded_signup',
          version: 2,
          sessionInfoVersion: 2
        },
        response_type: 'code',
        override_default_response_type: true
      });
      return;
    } catch (e) {
      console.warn("FB.login failed, falling back to direct redirect:", e);
    }
  }

  // Fallback: Direct OAuth redirect
  const redirectUri = getExactRedirectUri();
  const metaUrl = 'https://www.facebook.com/v21.0/dialog/oauth' +
    '?client_id=' + encodeURIComponent(META_APP_ID) +
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
  btn.innerHTML = '<span class="loading"></span> Activating your WhatsApp bot...';
  btn.disabled = true;

  const savedPackage = safeStorageGet('xtop_package_code') || selectedPackage;
  const savedToken = safeStorageGet('xtop_session_token') || SESSION_TOKEN;
  const savedWabaId = safeStorageGet('xtop_waba_id') || '';
  const savedPhoneId = safeStorageGet('xtop_phone_id') || '';
  const redirectUri = getExactRedirectUri();

  try {
    const resp = await fetch(SUPABASE_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        session_token: savedToken,
        auth_code: code,
        package_code: savedPackage,
        redirect_uri: redirectUri,
        waba_id: savedWabaId,
        phone_number_id: savedPhoneId
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
      resetButton();
    }
  } catch (err) {
    showError('Network error during activation. Please tap Connect to try again.');
    resetButton();
  }
}

function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.innerHTML = msg;
  el.classList.remove('hidden');
}

window.addEventListener('load', () => {
  const metaError = urlParams.get('error_description') || urlParams.get('error_message') || urlParams.get('error');
  if (metaError) {
    document.getElementById('step1').classList.add('hidden');
    document.getElementById('step2').classList.remove('hidden');
    showError("Meta signup cancelled or denied: " + metaError);
    return;
  }

  const code = urlParams.get('code');
  if (code) {
    handleReturnedCode(code);
  }
});
</script>
</body>
</html>
