// modules/demos/tokens.ts
// Secure token generation, extraction, and validation.

import { getSupabaseClient, safeErrorLog } from "../../database.ts";
import { classifyCategory } from "./templates.ts";

const TOKEN_PREFIX = "XTD_";
const TOKEN_RANDOM_LENGTH = 12;

export function generateRawToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const array = new Uint8Array(TOKEN_RANDOM_LENGTH);
  crypto.getRandomValues(array);
  let random = "";
  for (const byte of array) random += chars[byte % chars.length];
  return `${TOKEN_PREFIX}${random}`;
}

export async function hashToken(rawToken: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(rawToken.trim()));
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Extract a demo token or recognize structured customer business criteria.
 */
export function extractTokenFromText(text: string): string | null {
  if (!text) return null;

  const cleanText = text.toLowerCase();

  // 1. Structured message detection (e.g. "Business name: Sunrise Hotel...")
  if (
    cleanText.includes("business name") ||
    cleanText.includes("company name") ||
    (cleanText.includes("demo prepared for") && cleanText.includes("business"))
  ) {
    return "STRUCTURED_DIRECT_REQUEST";
  }

  // 2. Explicit "reference: TOKEN" pattern (e.g. "Demo reference: DEMO_MAELIZA_7F3K")
  const explicit = text.match(/(?:reference|ref|token|code)\s*[:=-]?\s*([A-Za-z0-9_-]{4,40})/i);
  if (explicit?.[1]) return explicit[1];

  // 3. Direct prefix match (XTD_*, DEMO_*, TEST_*)
  const prefix = text.match(/(?:XTD|DEMO|TEST)_[A-Za-z0-9_-]{4,40}/i);
  if (prefix) return prefix[0];

  return null;
}

export interface ValidatedToken {
  tokenId: string;
  businessConfigId: string;
  businessName: string;
  businessCategory: string;
  demoTemplate: string;
  demoConfig: Record<string, any>;
  campaignSource: string | null;
  tokenPrefix: string;
}

/**
 * Helper to extract business details from natural text
 */
function extractDetailsFromText(text: string): { name: string; category: string; need: string } {
  let name = "";
  let category = "";
  let need = "";

  // 1. Business Name
  const nameMatch = text.match(/(?:business\s+name|company\s+name|biz\s+name|prepared\s+for|demo\s+for)\s*[:=-]?\s*([^.\n\r]+?)(?=\.?\s*(?:business\s+category|business\s+type|category|industry|main\s+need|need|demo\s+reference|ref|$))/i);
  if (nameMatch?.[1]) {
    name = nameMatch[1].trim().replace(/^[:\s-]+|[:\s-]+$/g, "");
  }

  // 2. Category
  const catMatch = text.match(/(?:business\s+category|business\s+type|category|industry|type)\s*[:=-]?\s*([^.\n\r]+?)(?=\.?\s*(?:main\s+need|need|business\s+name|demo\s+reference|ref|$))/i);
  if (catMatch?.[1]) {
    category = catMatch[1].trim().replace(/^[:\s-]+|[:\s-]+$/g, "");
  }

  // 3. Main Need
  const needMatch = text.match(/(?:main\s+need|business\s+need|need)\s*[:=-]?\s*([^.\n\r]+?)(?=\.?\s*(?:business\s+name|business\s+category|demo\s+reference|$))/i);
  if (needMatch?.[1]) {
    need = needMatch[1].trim().replace(/^[:\s-]+|[:\s-]+$/g, "");
  }

  return { name, category, need };
}

/**
 * Validate a token or process structured details directly on-the-fly.
 */
export async function validateToken(
  rawToken: string,
  originalText?: string
): Promise<ValidatedToken | null> {
  const clean = rawToken.trim();
  const text = originalText || "";

  // ── 1. STRUCTURED DIRECT REQUESTS & FALLBACKS ──
  if (clean === "STRUCTURED_DIRECT_REQUEST" || clean.toUpperCase().startsWith("TEST_") || clean.toUpperCase().startsWith("DEMO_")) {
    const extracted = extractDetailsFromText(text);
    
    let businessName = extracted.name;
    if (!businessName && (clean.startsWith("TEST_") || clean.startsWith("DEMO_"))) {
      const slug = clean.replace(/^(?:TEST|DEMO)_/i, "").replace(/_[A-Z0-9]{4}$/i, "").replace(/_/g, " ");
      businessName = slug.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    }
    if (!businessName) businessName = "Your Business";

    const resolvedCategory = classifyCategory(extracted.category || businessName);

    return {
      tokenId: "00000000-0000-0000-0000-000000000000",
      businessConfigId: "00000000-0000-0000-0000-000000000000",
      businessName,
      businessCategory: resolvedCategory,
      demoTemplate: resolvedCategory,
      demoConfig: { main_need: extracted.need },
      campaignSource: "inbound_demo_request",
      tokenPrefix: clean.substring(0, 8),
    };
  }

  // ── 2. PRODUCTION DATABASE TOKENS ──
  const sb = getSupabaseClient();
  try {
    const hash = await hashToken(clean);

    const { data: tokenRow } = await sb
      .from("demo_entry_tokens")
      .select("id, business_config_id, is_active, is_revoked, expires_at, campaign_source, token_prefix")
      .or(`token_hash.eq.${hash},token_hash.eq.${clean}`)
      .maybeSingle();

    if (tokenRow && tokenRow.is_active && !tokenRow.is_revoked && new Date(tokenRow.expires_at) >= new Date()) {
      const { data: biz } = await sb
        .from("business_demo_configs")
        .select("id, business_name, business_category, demo_template, demo_config, is_active")
        .eq("id", tokenRow.business_config_id)
        .maybeSingle();

      if (biz && biz.is_active) {
        return {
          tokenId: tokenRow.id,
          businessConfigId: biz.id,
          businessName: biz.business_name,
          businessCategory: biz.business_category,
          demoTemplate: biz.demo_template,
          demoConfig: (biz.demo_config || {}) as Record<string, any>,
          campaignSource: tokenRow.campaign_source,
          tokenPrefix: tokenRow.token_prefix,
        };
      }
    }
  } catch (err) {
    safeErrorLog("validateToken (db)", err);
  }

  // ── 3. RESILIENT FALLBACK: If token wasn't in DB but message has a business name in text ──
  const fallback = extractDetailsFromText(text);
  if (fallback.name) {
    const resolvedCategory = classifyCategory(fallback.category || fallback.name);
    return {
      tokenId: "00000000-0000-0000-0000-000000000000",
      businessConfigId: "00000000-0000-0000-0000-000000000000",
      businessName: fallback.name,
      businessCategory: resolvedCategory,
      demoTemplate: resolvedCategory,
      demoConfig: { main_need: fallback.need },
      campaignSource: "inbound_text_fallback",
      tokenPrefix: clean.substring(0, 8),
    };
  }

  return null;
}

export async function createDemoLink(
  businessName: string,
  businessCategory: string,
  demoTemplate: string,
  campaignSource?: string,
  expiresInDays: number = 30
): Promise<{ rawToken: string; waLink: string; businessSlug: string } | null> {
  const sb = getSupabaseClient();
  try {
    const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").substring(0, 50)
      + "_" + Date.now().toString(36);

    const { data: biz, error: bizErr } = await sb
      .from("business_demo_configs")
      .insert({ business_slug: slug, business_name: businessName, business_category: businessCategory, demo_template: demoTemplate })
      .select("id").single();
    if (bizErr || !biz) { safeErrorLog("createDemoLink (biz)", bizErr); return null; }

    const rawToken = generateRawToken();
    const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();

    const { error: tokenErr } = await sb
      .from("demo_entry_tokens")
      .insert({
        token_hash: await hashToken(rawToken),
        token_prefix: rawToken.substring(0, 8),
        business_config_id: biz.id,
        expires_at: expiresAt,
        campaign_source: campaignSource || null,
      });
    if (tokenErr) { safeErrorLog("createDemoLink (token)", tokenErr); return null; }

    const msg = encodeURIComponent(
      `Hello Xtop, I am interested in seeing the WhatsApp demo prepared for ${businessName}. Demo reference: ${rawToken}`
    );

    return { rawToken, waLink: `https://wa.me/2348024988555?text=${msg}`, businessSlug: slug };
  } catch (err) {
    safeErrorLog("createDemoLink", err);
    return null;
  }
}
