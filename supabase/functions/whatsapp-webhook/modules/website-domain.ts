// supabase/functions/whatsapp-webhook/modules/website-domain.ts
// Website & Domain Checker — Deterministic, No AI, Production-Ready

import {
  Contact, Conversation, updateConversation,
  logDomainSearch, logWebsiteCheck, logDnsCheck,
} from "../database.ts";
import {
  sendButtonMessage, sendListMessage, sendTextMessage,
  makeButton, makeListRow,
} from "../whatsapp.ts";
import { normalise, safeErrorLog } from "../utils.ts";
import { showMainMenu } from "./main-menu.ts";

// ═══════════════════════════════════════════════════════
// DOMAIN AVAILABILITY (WHOIS + RDAP Dual Verification)
// ═══════════════════════════════════════════════════════

interface DomainResult {
  domain: string;
  status: "available" | "registered" | "unknown";
  available: boolean | null;
  registrar_price: number | null;
  currency: string | null;
}

async function domainCheckAvailability(domain: string): Promise<DomainResult> {
  const fail: DomainResult = {
    domain, status: "unknown", available: null,
    registrar_price: null, currency: null,
  };

  // Method 1: WHOIS API
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);

    const resp = await fetch(
      `https://api.whois.vu/?q=${encodeURIComponent(domain)}`,
      { signal: ctrl.signal }
    );
    clearTimeout(timer);

    if (resp.ok) {
      const data = await resp.json();
      if (data.available === true || data.status === "available") {
        return { domain, status: "available", available: true, registrar_price: null, currency: null };
      }
      if (data.available === false || data.status === "registered" || data.created || data.domain || data.registrar) {
        return { domain, status: "registered", available: false, registrar_price: null, currency: null };
      }
    }
  } catch (_) {}

  // Method 2: Official ICANN RDAP Protocol (Fallback)
  try {
    const ctrl2 = new AbortController();
    const timer2 = setTimeout(() => ctrl2.abort(), 6000);

    const resp2 = await fetch(
      `https://rdap.org/domain/${encodeURIComponent(domain)}`,
      { signal: ctrl2.signal, redirect: "follow" }
    );
    clearTimeout(timer2);

    if (resp2.status === 404) {
      return { domain, status: "available", available: true, registrar_price: null, currency: null };
    }
    if (resp2.status === 200) {
      return { domain, status: "registered", available: false, registrar_price: null, currency: null };
    }
  } catch (_) {}

  return fail;
}

// ═══════════════════════════════════════════════════════
// INPUT NORMALIZATION & VALIDATION
// ═══════════════════════════════════════════════════════

function normalizeDomain(raw: string): string | null {
  let d = raw.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "");
  d = d.replace(/^www\./, "");
  d = d.replace(/\/.*$/, "");
  d = d.replace(/\?.*$/, "");
  d = d.replace(/\s+/g, "");
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(d)) {
    return null;
  }
  return d;
}

function extractTld(domain: string): string {
  const p = domain.split(".");
  if (p.length >= 3 && ["com", "co", "org", "net", "edu", "gov"].includes(p[p.length - 2])) {
    return p.slice(-2).join(".");
  }
  return p[p.length - 1];
}

function normalizeUrl(raw: string): string | null {
  let u = raw.trim().toLowerCase();
  if (!u.startsWith("http://") && !u.startsWith("https://")) u = "https://" + u;
  try {
    const p = new URL(u);
    if (!p.hostname.includes(".")) return null;
    return p.href;
  } catch { return null; }
}

const rlMap = new Map<string, number[]>();

function rateOk(phone: string, max = 5, windowMs = 60000): boolean {
  const now = Date.now();
  const hits = (rlMap.get(phone) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) return false;
  hits.push(now);
  rlMap.set(phone, hits);
  return true;
}

// ═══════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════

export async function handleWebsiteDomain(
  phone: string, text: string,
  contact: Contact, conv: Conversation,
  interactiveId?: string
): Promise<void> {
  const raw = (interactiveId || text || "").trim();
  const n = normalise(raw);
  const state = conv.current_state;

  if (n === "menu_home" || n === "main menu" || raw === "wd_back_main") {
    await updateConversation(conv.id, { current_module: "MAIN_MENU", current_state: "IDLE", context_json: {} });
    await showMainMenu(phone, conv.id);
    return;
  }
  if (raw === "wd_back" || n === "back" || n === "tools menu") {
    await showWdMenu(phone, conv.id);
    return;
  }

  if (raw === "wd_domain" || n === "check domain") { await promptDomain(phone, conv.id); return; }
  if (raw === "wd_website" || n === "check website") { await promptWebsite(phone, conv.id); return; }
  if (raw === "wd_ssl" || n === "check ssl") { await promptSsl(phone, conv.id); return; }
  if (raw === "wd_dns" || n === "check dns") { await promptDns(phone, conv.id); return; }

  if (raw === "wd_retry_domain") { await promptDomain(phone, conv.id); return; }
  if (raw === "wd_retry_website") { await promptWebsite(phone, conv.id); return; }
  if (raw === "wd_retry_ssl") { await promptSsl(phone, conv.id); return; }

  if (state === "WD_WAIT_DOMAIN" || state === "WD_WAITING_DOMAIN") {
    await doDomainCheck(phone, text, conv);
    return;
  }
  if (state === "WD_WAIT_WEBSITE" || state === "WD_WAITING_WEBSITE") {
    await doWebsiteCheck(phone, text, conv);
    return;
  }
  if (state === "WD_WAIT_SSL" || state === "WD_WAITING_SSL") {
    await doSslCheck(phone, text, conv);
    return;
  }
  if (state === "WD_WAIT_DNS_DOMAIN" || state === "WD_WAITING_DNS_DOMAIN") {
    await doDnsDomain(phone, text, conv);
    return;
  }
  if (state === "WD_WAIT_DNS_TYPE" || state === "WD_WAITING_DNS_TYPE") {
    await doDnsType(phone, raw, conv);
    return;
  }

  await showWdMenu(phone, conv.id);
}

export async function showWdMenu(phone: string, convId: string): Promise<void> {
  await updateConversation(convId, { current_module: "TOOLS", current_state: "WD_MENU", context_json: {} });

  await sendListMessage(
    phone,
    `🌐 *WEBSITE & DOMAIN TOOLS*\n\nFree utilities to check domains, websites, SSL certificates, and DNS records.\n\n👇 *Select a tool:*`,
    "Choose Tool",
    [{ title: "Available Tools", rows: [
      makeListRow("wd_domain", "1️⃣ Check Domain", "Domain availability lookup"),
      makeListRow("wd_website", "2️⃣ Check Website", "Status, speed & HTTPS"),
      makeListRow("wd_ssl", "3️⃣ Check SSL", "Certificate validation"),
      makeListRow("wd_dns", "4️⃣ Check DNS", "A, MX, NS, TXT records"),
      makeListRow("wd_back_main", "↩️ Main Menu", "Return to home"),
    ]}],
    "Web & Domain", "Xtop Free Tools"
  );
}

async function promptDomain(phone: string, convId: string): Promise<void> {
  await updateConversation(convId, { current_module: "TOOLS", current_state: "WD_WAIT_DOMAIN", context_json: {} });
  await sendTextMessage(phone,
    `🌐 *DOMAIN AVAILABILITY*\n\nEnter the domain you want to check.\n\n_Examples:_\n• mybusiness.com\n• mybusiness.ng\n• mybusiness.com.ng\n• mybusiness.net`
  );
}

async function doDomainCheck(phone: string, text: string, conv: Conversation): Promise<void> {
  if (!rateOk(phone, 5, 60000)) {
    await sendTextMessage(phone, "⏳ Too many requests. Please wait a moment.");
    await showWdMenu(phone, conv.id);
    return;
  }

  const domain = normalizeDomain(text);
  if (!domain) {
    await sendTextMessage(phone, "⚠️ Invalid domain format.\n\nPlease enter a domain like *mybusiness.com* or *mybusiness.com.ng*:");
    return;
  }

  const tld = extractTld(domain);
  await sendTextMessage(phone, `🔍 Checking *${domain}*...\n\n_Please wait._`);

  const result = await domainCheckAvailability(domain);
  await logDomainSearch(phone, domain, tld, result.status, result.available, result.registrar_price, result.currency);

  if (result.status === "available") {
    await sendButtonMessage(phone,
      `🌐 *DOMAIN RESULT*\n\n*${domain}*\n\n✅ *AVAILABLE*\n\nThis domain is currently available for registration.`,
      [makeButton("wd_retry_domain", "🔎 Check Another"), makeButton("wd_back", "🌐 Tools Menu"), makeButton("wd_back_main", "🏠 Main Menu")],
      "Domain Available"
    );
  } else if (result.status === "registered") {
    await sendButtonMessage(phone,
      `🌐 *DOMAIN RESULT*\n\n*${domain}*\n\n❌ *NOT AVAILABLE*\n\nThis domain appears to be registered already.`,
      [makeButton("wd_retry_domain", "🔎 Check Another"), makeButton("wd_back", "🌐 Tools Menu"), makeButton("wd_back_main", "🏠 Main Menu")],
      "Domain Taken"
    );
  } else {
    await sendButtonMessage(phone,
      `🌐 *DOMAIN RESULT*\n\n*${domain}*\n\n⚠️ *Unable to confirm availability right now.*\n\nPlease try again.`,
      [makeButton("wd_retry_domain", "🔄 Try Again"), makeButton("wd_back_main", "🏠 Main Menu")],
      "Check Failed"
    );
  }

  await updateConversation(conv.id, { current_module: "TOOLS", current_state: "SHOWING_TOOLS", context_json: {} });
}

async function promptWebsite(phone: string, convId: string): Promise<void> {
  await updateConversation(convId, { current_module: "TOOLS", current_state: "WD_WAIT_WEBSITE", context_json: {} });
  await sendTextMessage(phone,
    `🌐 *WEBSITE CHECK*\n\nEnter the website URL.\n\n_Examples:_\n• https://example.com\n• example.com\n• naijashop.com.ng`
  );
}

async function doWebsiteCheck(phone: string, text: string, conv: Conversation): Promise<void> {
  if (!rateOk(phone, 3, 60000)) {
    await sendTextMessage(phone, "⏳ Too many requests. Please wait.");
    await showWdMenu(phone, conv.id);
    return;
  }

  const url = normalizeUrl(text);
  if (!url) {
    await sendTextMessage(phone, "⚠️ Invalid URL.\n\nPlease enter a website like *example.com*:");
    return;
  }

  await sendTextMessage(phone, `🔍 Checking *${url}*...\n\n_Please wait._`);

  const t0 = Date.now();
  let reachable = false, statusCode: number | null = null;
  let https = false, responseTimeMs: number | null = null, finalUrl = url;

  try {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(url, { method: "HEAD", signal: ctrl.signal, redirect: "follow" });
    clearTimeout(tm);
    reachable = true;
    statusCode = r.status;
    https = r.url.startsWith("https://");
    responseTimeMs = Date.now() - t0;
    finalUrl = r.url;
  } catch {
    if (url.startsWith("https://")) {
      try {
        const httpUrl = url.replace("https://", "http://");
        const ctrl2 = new AbortController();
        const tm2 = setTimeout(() => ctrl2.abort(), 8000);
        const r2 = await fetch(httpUrl, { method: "HEAD", signal: ctrl2.signal, redirect: "follow" });
        clearTimeout(tm2);
        reachable = true; statusCode = r2.status;
        https = false; responseTimeMs = Date.now() - t0; finalUrl = r2.url;
      } catch { reachable = false; responseTimeMs = Date.now() - t0; }
    } else { reachable = false; responseTimeMs = Date.now() - t0; }
  }

  await logWebsiteCheck(phone, url, reachable, statusCode, https, responseTimeMs, finalUrl);

  const display = url.replace(/^https?:\/\//, "").replace(/\/$/, "");

  if (reachable) {
    const se = statusCode && statusCode >= 200 && statusCode < 400 ? "✅" : "⚠️";
    await sendButtonMessage(phone,
      `🌐 *WEBSITE CHECK*\n\n*${display}*\n\n✅ Online\n${https ? "✅" : "❌"} HTTPS ${https ? "enabled" : "not detected"}\n${se} HTTP ${statusCode}\n⏱ Response: ${responseTimeMs}ms`,
      [makeButton("wd_retry_website", "🔄 Check Again"), makeButton("wd_back", "🌐 Tools Menu"), makeButton("wd_back_main", "🏠 Main Menu")],
      "Website Check"
    );
  } else {
    await sendButtonMessage(phone,
      `🌐 *WEBSITE CHECK*\n\n*${display}*\n\n❌ *Unreachable*\n\nThe website could not be reached.\n⏱ Timeout: ${responseTimeMs}ms`,
      [makeButton("wd_retry_website", "🔄 Try Again"), makeButton("wd_back", "🌐 Tools Menu"), makeButton("wd_back_main", "🏠 Main Menu")],
      "Website Offline"
    );
  }

  await updateConversation(conv.id, { current_module: "TOOLS", current_state: "SHOWING_TOOLS", context_json: {} });
}

async function promptSsl(phone: string, convId: string): Promise<void> {
  await updateConversation(convId, { current_module: "TOOLS", current_state: "WD_WAIT_SSL", context_json: {} });
  await sendTextMessage(phone,
    `🔐 *SSL CERTIFICATE CHECK*\n\nEnter the domain to check.\n\n_Example: example.com_`
  );
}

async function doSslCheck(phone: string, text: string, conv: Conversation): Promise<void> {
  if (!rateOk(phone, 3, 60000)) {
    await sendTextMessage(phone, "⏳ Too many requests. Please wait.");
    await showWdMenu(phone, conv.id);
    return;
  }

  const domain = normalizeDomain(text);
  if (!domain) {
    await sendTextMessage(phone, "⚠️ Please enter a valid domain like *example.com*:");
    return;
  }

  await sendTextMessage(phone, `🔐 Checking SSL for *${domain}*...\n\n_Please wait._`);

  let sslValid = false, sslNote = "Unknown";

  try {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 10000);
    await fetch(`https://${domain}`, { method: "HEAD", signal: ctrl.signal, redirect: "follow" });
    clearTimeout(tm);
    sslValid = true;
    sslNote = "Valid (connection secured)";
  } catch (err: any) {
    sslValid = false;
    sslNote = err.name === "AbortError" ? "Connection timed out" : "SSL handshake failed or certificate invalid";
  }

  await logWebsiteCheck(phone, `https://${domain}`, sslValid, null, sslValid, null, `https://${domain}`, sslValid, sslNote);

  if (sslValid) {
    await sendButtonMessage(phone,
      `🔐 *SSL CHECK RESULT*\n\n*${domain}*\n\n✅ *SSL Certificate Valid*\n✅ HTTPS connection established\n📅 ${sslNote}`,
      [makeButton("wd_retry_ssl", "🔄 Check Another"), makeButton("wd_back", "🌐 Tools Menu"), makeButton("wd_back_main", "🏠 Main Menu")],
      "SSL Valid"
    );
  } else {
    await sendButtonMessage(phone,
      `🔐 *SSL CHECK RESULT*\n\n*${domain}*\n\n❌ *SSL Issue Detected*\n⚠️ ${sslNote}`,
      [makeButton("wd_retry_ssl", "🔄 Try Again"), makeButton("wd_back", "🌐 Tools Menu"), makeButton("wd_back_main", "🏠 Main Menu")],
      "SSL Issue"
    );
  }

  await updateConversation(conv.id, { current_module: "TOOLS", current_state: "SHOWING_TOOLS", context_json: {} });
}

async function promptDns(phone: string, convId: string): Promise<void> {
  await updateConversation(convId, { current_module: "TOOLS", current_state: "WD_WAIT_DNS_DOMAIN", context_json: {} });
  await sendTextMessage(phone,
    `📡 *DNS RECORD LOOKUP*\n\nEnter the domain to check.\n\n_Example: example.com_`
  );
}

async function doDnsDomain(phone: string, text: string, conv: Conversation): Promise<void> {
  const domain = normalizeDomain(text);
  if (!domain) {
    await sendTextMessage(phone, "⚠️ Please enter a valid domain like *example.com*:");
    return;
  }

  await updateConversation(conv.id, {
    current_state: "WD_WAIT_DNS_TYPE",
    context_json: { wdTool: "dns", dnsDomain: domain },
  });

  await sendListMessage(phone,
    `📡 *DNS Lookup: ${domain}*\n\nSelect the record type:`,
    "Record Type",
    [{ title: "DNS Record Types", rows: [
      makeListRow("dns_A", "A", "IPv4 addresses"),
      makeListRow("dns_AAAA", "AAAA", "IPv6 addresses"),
      makeListRow("dns_CNAME", "CNAME", "Canonical name aliases"),
      makeListRow("dns_MX", "MX", "Mail servers"),
      makeListRow("dns_TXT", "TXT", "SPF, DKIM, verification"),
      makeListRow("dns_NS", "NS", "Name servers"),
      makeListRow("dns_ALL", "ALL", "All common records"),
    ]}],
    "DNS Lookup", domain
  );
}

async function doDnsType(phone: string, raw: string, conv: Conversation): Promise<void> {
  if (!rateOk(phone, 5, 60000)) {
    await sendTextMessage(phone, "⏳ Too many requests. Please wait.");
    await showWdMenu(phone, conv.id);
    return;
  }

  const ctx = (conv.context_json || {}) as { dnsDomain?: string };
  const domain = ctx.dnsDomain;
  if (!domain) { await promptDns(phone, conv.id); return; }

  const recordType = raw.startsWith("dns_") ? raw.replace("dns_", "") : "ALL";
  await sendTextMessage(phone, `📡 Looking up *${recordType}* records for *${domain}*...\n\n_Please wait._`);

  try {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 8000);
    const types = recordType === "ALL" ? ["A", "AAAA", "MX", "NS", "TXT", "CNAME"] : [recordType];
    const results: Record<string, string[]> = {};

    for (const t of types) {
      try {
        const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${t}`, { signal: ctrl.signal });
        const d = await r.json();
        if (d.Answer?.length > 0) results[t] = d.Answer.map((a: any) => a.data.replace(/\.$/, ""));
      } catch { /* skip */ }
    }
    clearTimeout(tm);

    await logDnsCheck(phone, domain, recordType, results);

    let msg = `📡 *DNS RECORDS: ${domain}*\n\n`;
    if (Object.keys(results).length === 0) {
      msg += `⚠️ No ${recordType} records found.`;
    } else {
      for (const [t, recs] of Object.entries(results)) {
        msg += `*${t}:*\n`;
        recs.slice(0, 5).forEach((r) => { msg += `  ${r}\n`; });
        if (recs.length > 5) msg += `  _...and ${recs.length - 5} more_\n`;
        msg += "\n";
      }
    }

    await sendButtonMessage(phone, msg,
      [makeButton("wd_dns", "📡 Check Another"), makeButton("wd_back", "🌐 Tools Menu"), makeButton("wd_back_main", "🏠 Main Menu")],
      "DNS Results"
    );
  } catch (err) {
    console.error("[DNS Error]:", err);
    await sendButtonMessage(phone,
      `📡 *DNS CHECK FAILED*\n\n⚠️ Unable to retrieve records for *${domain}*.`,
      [makeButton("wd_dns", "🔄 Try Again"), makeButton("wd_back_main", "🏠 Main Menu")],
      "DNS Error"
    );
  }

  await updateConversation(conv.id, { current_module: "TOOLS", current_state: "SHOWING_TOOLS", context_json: {} });
}
