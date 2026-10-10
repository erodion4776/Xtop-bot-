// modules/demos/tokens.ts
// Secure token generation, hashing, and validation for personalized demo links.

import { getSupabaseClient, safeErrorLog } from "../../database.ts";

const TOKEN_PREFIX = "XTD_";
const TOKEN_RANDOM_LENGTH = 12;

/**
 * Generate a cryptographically random opaque token.
 * Format: XTD_<12 alphanumeric chars>  e.g. XTD_a8F3k29X7mPq
 */
export function generateRawToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const array = new Uint8Array(TOKEN_RANDOM_LENGTH);
  crypto.getRandomValues(array);
  let random = "";
  for (const byte of array) {
    random += chars[byte % chars.length];
  }
  return `${TOKEN_PREFIX}${random}`;
}

/**
 * SHA-256 hash of a raw token for secure storage.
 */
export async function hashToken(rawToken: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(rawToken.trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Extract a demo token from an inbound message body.
 * Matches XTD_ tokens and legacy DEMO_ reference patterns.
 * Returns null if no token found.
 */
export function extractTokenFromText(text: string): string | null {
  if (!text) return null;
  // Primary: opaque XTD_ token
  const xtdMatch = text.match(/XTD_[A-Za-z0-9]{8,20}/);
  if (xtdMatch) return xtdMatch[0];
  // Legacy: DEMO_BUSINESSNAME_CODE pattern
  const demoMatch = text.match(/DEMO_[A-Z0-9_]{4,40}/);
  if (demoMatch) return demoMatch[0];
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
 * Validate a raw token against the database.
 * Returns the associated business config or null if invalid/expired/revoked.
 */
export async function validateToken(rawToken: string): Promise<ValidatedToken | null> {
  const sb = getSupabaseClient();
  try {
    const hash = await hashToken(rawToken);

    const { data: tokenRow, error: tokenErr } = await sb
      .from("demo_entry_tokens")
      .select("id, business_config_id, is_active, is_revoked, expires_at, campaign_source, token_prefix")
      .eq("token_hash", hash)
      .maybeSingle();

    if (tokenErr || !tokenRow) return null;
    if (!tokenRow.is_active || tokenRow.is_revoked) return null;
    if (new Date(tokenRow.expires_at) < new Date()) return null;

    const { data: bizConfig, error: bizErr } = await sb
      .from("business_demo_configs")
      .select("id, business_name, business_category, demo_template, demo_config, is_active")
      .eq("id", tokenRow.business_config_id)
      .maybeSingle();

    if (bizErr || !bizConfig || !bizConfig.is_active) return null;

    return {
      tokenId: tokenRow.id,
      businessConfigId: bizConfig.id,
      businessName: bizConfig.business_name,
      businessCategory: bizConfig.business_category,
      demoTemplate: bizConfig.demo_template,
      demoConfig: (bizConfig.demo_config || {}) as Record<string, any>,
      campaignSource: tokenRow.campaign_source,
      tokenPrefix: tokenRow.token_prefix,
    };
  } catch (err) {
    safeErrorLog("validateToken", err);
    return null;
  }
}

/**
 * Admin helper: create a business config + token pair.
 * Returns the raw token (only time it's visible in plaintext) and wa.me link.
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
    const slug = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .substring(0, 50) + "_" + Date.now().toString(36);

    const { data: bizConfig, error: bizErr } = await sb
      .from("business_demo_configs")
      .insert({
        business_slug: slug,
        business_name: businessName,
        business_category: businessCategory,
        demo_template: demoTemplate,
      })
      .select("id")
      .single();

    if (bizErr || !bizConfig) {
      safeErrorLog("createDemoLink (biz)", bizErr);
      return null;
    }

    const rawToken = generateRawToken();
    const tokenHash = await hashToken(rawToken);
    const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();

    const { error: tokenErr } = await sb
      .from("demo_entry_tokens")
      .insert({
        token_hash: tokenHash,
        token_prefix: rawToken.substring(0, 8),
        business_config_id: bizConfig.id,
        expires_at: expiresAt,
        campaign_source: campaignSource || null,
      });

    if (tokenErr) {
      safeErrorLog("createDemoLink (token)", tokenErr);
      return null;
    }

    const prefilledMsg = encodeURIComponent(
      `Hello Xtop, I am interested in seeing the WhatsApp demo prepared for ${businessName}. Demo reference: ${rawToken}`
    );
    const waLink = `https://wa.me/2348024988555?text=${prefilledMsg}`;

    return { rawToken, waLink, businessSlug: slug };
  } catch (err) {
    safeErrorLog("createDemoLink", err);
    return null;
  }
}
