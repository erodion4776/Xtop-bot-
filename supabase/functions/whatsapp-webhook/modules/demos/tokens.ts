// modules/demos/tokens.ts
// Secure demo token generation, extraction, validation and link creation.
// Structured business enquiries must use the onboarding flow;
// they must never be treated as valid database-backed tokens.

import { getSupabaseClient, safeErrorLog } from "../../database.ts";

const TOKEN_PREFIX = "XTD_";
const TOKEN_RANDOM_LENGTH = 12;
const MILLISECONDS_PER_DAY = 86_400_000;
const MAX_TOKEN_LIFETIME_DAYS = 365;

// Keep the alphabet length below 256 and use rejection sampling
// to avoid modulo bias when generating random token characters.
const TOKEN_CHARACTERS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export interface ValidatedToken {
  tokenId: string;
  businessConfigId: string;
  businessName: string;
  businessCategory: string;
  demoTemplate: string;
  demoConfig: Record<string, unknown>;
  campaignSource: string | null;
  tokenPrefix: string;
}

/**
 * Generate a cryptographically random demo token.
 */
export function generateRawToken(): string {
  const chars = TOKEN_CHARACTERS;
  const maxAcceptedByte = Math.floor(256 / chars.length) * chars.length;

  let random = "";

  while (random.length < TOKEN_RANDOM_LENGTH) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);

    for (const byte of bytes) {
      if (byte >= maxAcceptedByte) continue;

      random += chars[byte % chars.length];

      if (random.length === TOKEN_RANDOM_LENGTH) break;
    }
  }

  return `${TOKEN_PREFIX}${random}`;
}

/**
 * Return the SHA-256 hexadecimal digest of a token.
 * Raw tokens must not be stored in token_hash.
 */
export async function hashToken(rawToken: string): Promise<string> {
  const clean = rawToken.trim();

  if (!clean || clean.length > 100) {
    throw new Error("Invalid token input");
  }

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(clean),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Extract an explicit token from a WhatsApp message.
 *
 * Business details alone are not authentication credentials.
 * Structured requests must go through the onboarding flow.
 */
export function extractTokenFromText(text: string): string | null {
  if (!text || text.length > 10_000) return null;

  const explicit = text.match(
    /(?:demo\s+reference|reference|ref|token|code)\s*[:=-]?\s*((?:XTD|DEMO|TEST)_[A-Za-z0-9_-]{4,40})/i,
  );

  if (explicit?.[1]) return explicit[1].trim();

  const direct = text.match(
    /(?:XTD|DEMO|TEST)_[A-Za-z0-9_-]{4,40}/i,
  );

  return direct?.[0]?.trim() ?? null;
}

/**
 * Validate a token against the database.
 *
 * A token is accepted only when:
 * - Its SHA-256 hash matches a database record.
 * - The token is active and not revoked.
 * - Its expiry timestamp is valid and still in the future.
 * - Its associated business configuration is active.
 */
export async function validateToken(
  rawToken: string,
  _originalText?: string,
): Promise<ValidatedToken | null> {
  const clean = rawToken.trim();

  // Only tokens with recognised prefixes can be validated.
  if (
    clean.length < 8 ||
    clean.length > 45 ||
    !/^(?:XTD|DEMO|TEST)_[A-Za-z0-9_-]+$/i.test(clean)
  ) {
    return null;
  }

  try {
    const sb = getSupabaseClient();
    const tokenHash = await hashToken(clean);

    const { data: tokenRow, error: tokenError } = await sb
      .from("demo_entry_tokens")
      .select(
        "id, business_config_id, is_active, is_revoked, expires_at, campaign_source, token_prefix",
      )
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (tokenError) {
      safeErrorLog("validateToken: token lookup failed", tokenError);
      return null;
    }

    if (!tokenRow) return null;
    if (tokenRow.is_active !== true) return null;
    if (tokenRow.is_revoked !== false) return null;

    const expiryTime = Date.parse(tokenRow.expires_at);

    if (!Number.isFinite(expiryTime) || expiryTime <= Date.now()) {
      return null;
    }

    if (
      typeof tokenRow.business_config_id !== "string" ||
      !tokenRow.business_config_id
    ) {
      return null;
    }

    const { data: biz, error: businessError } = await sb
      .from("business_demo_configs")
      .select(
        "id, business_name, business_category, demo_template, demo_config, is_active",
      )
      .eq("id", tokenRow.business_config_id)
      .maybeSingle();

    if (businessError) {
      safeErrorLog("validateToken: business lookup failed", businessError);
      return null;
    }

    if (!biz || biz.is_active !== true) return null;

    if (
      typeof biz.id !== "string" ||
      typeof biz.business_name !== "string" ||
      typeof biz.business_category !== "string" ||
      typeof biz.demo_template !== "string"
    ) {
      safeErrorLog(
        "validateToken: business record has missing required fields",
        { businessConfigId: tokenRow.business_config_id },
      );
      return null;
    }

    const demoConfig =
      biz.demo_config &&
      typeof biz.demo_config === "object" &&
      !Array.isArray(biz.demo_config)
        ? (biz.demo_config as Record<string, unknown>)
        : {};

    return {
      tokenId: tokenRow.id,
      businessConfigId: biz.id,
      businessName: biz.business_name,
      businessCategory: biz.business_category,
      demoTemplate: biz.demo_template,
      demoConfig,
      campaignSource:
        typeof tokenRow.campaign_source === "string"
          ? tokenRow.campaign_source
          : null,
      tokenPrefix:
        typeof tokenRow.token_prefix === "string"
          ? tokenRow.token_prefix
          : clean.substring(0, 8),
    };
  } catch (error) {
    safeErrorLog("validateToken: unexpected error", error);
    return null;
  }
}

/**
 * Create a business demo configuration and its hashed entry token.
 *
 * Returns null if creation fails. If token insertion fails after
 * business creation, attempts to remove the newly created business row.
 */
export async function createDemoLink(
  businessName: string,
  businessCategory: string,
  demoTemplate: string,
  campaignSource?: string,
  expiresInDays = 30,
): Promise<{
  rawToken: string;
  waLink: string;
  businessSlug: string;
} | null> {
  const name = businessName.trim();
  const category = businessCategory.trim();
  const template = demoTemplate.trim();

  if (
    !name ||
    name.length > 100 ||
    !category ||
    category.length > 100 ||
    !template ||
    template.length > 100
  ) {
    return null;
  }

  if (
    !Number.isInteger(expiresInDays) ||
    expiresInDays < 1 ||
    expiresInDays > MAX_TOKEN_LIFETIME_DAYS
  ) {
    return null;
  }

  if (campaignSource && campaignSource.length > 100) {
    return null;
  }

  const sb = getSupabaseClient();
  let businessConfigId: string | null = null;

  try {
    const slugBase = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .substring(0, 50) || "business";

    const businessSlug = `${slugBase}_${crypto.randomUUID().replace(/-/g, "").substring(0, 12)}`;

    const { data: biz, error: businessError } = await sb
      .from("business_demo_configs")
      .insert({
        business_slug: businessSlug,
        business_name: name,
        business_category: category,
        demo_template: template,
      })
      .select("id")
      .single();

    if (businessError || !biz?.id) {
      safeErrorLog(
        "createDemoLink: business insert failed",
        businessError ?? "Missing business ID",
      );
      return null;
    }

    businessConfigId = biz.id;

    const rawToken = generateRawToken();
    const tokenHash = await hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() + expiresInDays * MILLISECONDS_PER_DAY,
    ).toISOString();

    const { error: tokenError } = await sb
      .from("demo_entry_tokens")
      .insert({
        token_hash: tokenHash,
        token_prefix: rawToken.substring(0, 8),
        business_config_id: businessConfigId,
        expires_at: expiresAt,
        campaign_source: campaignSource || null,
      });

    if (tokenError) {
      safeErrorLog("createDemoLink: token insert failed", tokenError);

      // Best-effort cleanup of the business row created by this call.
      const { error: cleanupError } = await sb
        .from("business_demo_configs")
        .delete()
        .eq("id", businessConfigId);

      if (cleanupError) {
        safeErrorLog(
          "createDemoLink: orphan cleanup failed",
          cleanupError,
        );
      }

      return null;
    }

    // Use an actual WhatsApp phone number, not the Cloud API phone ID.
    const configuredPhone = Deno.env.get("WHATSAPP_DEMO_PHONE_NUMBER");
    const phone = (configuredPhone || "2348024988555").replace(/\D/g, "");

    if (!/^\d{10,15}$/.test(phone)) {
      safeErrorLog(
        "createDemoLink: invalid demo WhatsApp phone number",
        { configured: Boolean(configuredPhone) },
      );
      return null;
    }

    const message = encodeURIComponent(
      `Hello Xtop, I am interested in seeing the WhatsApp demo prepared for ${name}. Demo reference: ${rawToken}`,
    );

    return {
      rawToken,
      waLink: `https://wa.me/${phone}?text=${message}`,
      businessSlug,
    };
  } catch (error) {
    safeErrorLog("createDemoLink: unexpected error", error);

    // Best-effort cleanup if business creation succeeded before failure.
    if (businessConfigId) {
      try {
        const { error: cleanupError } = await sb
          .from("business_demo_configs")
          .delete()
          .eq("id", businessConfigId);

        if (cleanupError) {
          safeErrorLog(
            "createDemoLink: exception cleanup failed",
            cleanupError,
          );
        }
      } catch (cleanupError) {
        safeErrorLog(
          "createDemoLink: exception cleanup threw",
          cleanupError,
        );
      }
    }

    return null;
  }
}
