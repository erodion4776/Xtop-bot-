// modules/demos/tokens.ts
// Secure token generation, extraction, and validation.
// Upgraded: resilient non-punctuated boundary lookahead parser.

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

  // 1. Resilient structured pattern matching (any spacing, colons, or punctuation)
  if (
    cleanText.includes("business name") &&
    (cleanText.includes("business category") || cleanText.includes("business type") || cleanText.includes("category"))
  ) {
    return "STRUCTURED_DIRECT_REQUEST";
  }

  // 2. Explicit "reference: TOKEN" pattern
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
 * Validate a token or process structured details directly on-the-fly.
 */
export async function validateToken(
  rawToken: string,
  originalText?: string
): Promise<ValidatedToken | null> {
  const clean = rawToken.trim();

  // ── 1. STRUCTURED DIRECT REQUESTS (Bypasses manual onboarding questions) ──
  if (clean === "STRUCTURED_DIRECT_REQUEST" && originalText) {
    let businessName = "Your Business";
    let categoryKey = "other";
    let mainNeed = "";

    // Robust lookahead boundaries (period, newline, or next criteria keyword acting as delimiter)
    const nameMatch = originalText.match(/business\s+name\s*[:=-]?\s*([^.]+?)(?=\.?\s*(?:business\s+category|business\s+type|category|main\s+need|need|$))/i);
    if (nameMatch?.[1]) {
      businessName = nameMatch[1].trim().replace(/^[:\s-]+|[:\s-]+$/g, "");
    }

    const catMatch = originalText.match(/(?:business\s+category|business\s+type|category)\s*[:=-]?\s*([^.]+?)(?=\.?\s*(?:main\s+need|need|business\s+name|$))/i);
    if (catMatch?.[1]) {
      const rawCat = catMatch[1].trim().replace(/^[:\s-]+|[:\s-]+$/g, "");
      categoryKey = classifyCategory(rawCat);
    }

    const needMatch = originalText.match(/(?:main\s+need|need)\s*[:=-]?\s*([^.]+?)(?=\.?\s*(?:business\s+name|business\s+category|business\s+type|$))/i);
    if (needMatch?.[1]) {
      mainNeed = needMatch[1].trim().replace(/^[:\s-]+|[:\s-]+$/g, "");
    }

    return {
      tokenId: "00000000-0000-0000-0000-000000000000",
      businessConfigId: "00000000-0000-0000-0000-000000000000",
      businessName,
      businessCategory: categoryKey,
      demoTemplate: categoryKey,
      demoConfig: { main_need: mainNeed },
      campaignSource: "structured_direct_inbound",
      tokenPrefix: "DIRECT",
    };
  }

  // ── 2. TEST TOKENS (Dynamic mocks) ──
  if (clean.toUpperCase().startsWith("TEST_")) {
    let businessName = "Test Business";
    let businessType = "";

    if (originalText) {
      const nameMatch = originalText.match(/(?:prepared\s+)?for\s+([A-Z][^.]+?)(?:\.|\s+Business|\s+Demo|\s*$)/i);
      if (nameMatch?.[1]) businessName = nameMatch[1].trim();

      const typeMatch = originalText.match(/business\s+type\s*[:=-]?\s*([^.\n\r]+)/i);
      if (typeMatch?.[1]) businessType = typeMatch[1].trim();
    }

    if (businessName === "Test Business") {
      const slug = clean.replace(/^TEST_/i, "").replace(/_/g, " ");
      businessName = slug.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    }

    const category = businessType ? classifyCategory(businessType) : "digital_agency";

    return {
      tokenId: "00000000-0000-0000-0000-000000000000",
      businessConfigId: "00000000-0000-0000-0000-000000000000",
      businessName,
      businessCategory: category,
      demoTemplate: category,
      demoConfig: {},
      campaignSource: "developer_testing",
      tokenPrefix: clean.substring(0, 8),
    };
  }

  // ── 3. PRODUCTION TOKENS (Database query) ──
  const sb = getSupabaseClient();
  try {
    const hash = await hashToken(clean);

    const { data: tokenRow } = await sb
      .from("demo_entry_tokens")
      .select("id, business_config_id, is_active, is_revoked, expires_at, campaign_source, token_prefix")
      .or(`token_hash.eq.${hash},token_hash.eq.${clean}`)
      .maybeSingle();

    if (!tokenRow || !tokenRow.is_active || tokenRow.is_revoked) return null;
    if (new Date(tokenRow.expires_at) < new Date()) return null;

    const { data: biz } = await sb
      .from("business_demo_configs")
      .select("id, business_name, business_category, demo_template, demo_config, is_active")
      .eq("id", tokenRow.business_config_id)
      .maybeSingle();

    if (!biz || !biz.is_active) return null;

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
  } catch (err) {
    safeErrorLog("validateToken", err);
    return null;
  }
}

/**
 * Admin: create a business config + token pair.
 * Returns the raw token and wa.me link.
 */
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
