// supabase/functions/whatsapp-webhook/lib/tenant-context.ts
// Resolves the active tenant from an incoming webhook payload
// and provides tenant-scoped database helpers.

import { getSupabaseClient, safeErrorLog } from "../database.ts";
import { decryptToken } from "./encryption.ts";

const XTOP_SYSTEM_TENANT_ID = "00000000-0000-0000-0000-000000000001";

export interface TenantContext {
  tenantId: string;
  isSystem: boolean;
  phoneNumberId: string;
  accessToken: string;
  wabaId: string;
  tenantName: string;
  subscriptionStatus: string;
  isSubscriptionActive: boolean;
}

/**
 * Resolve tenant from the phone_number_id in the incoming webhook payload.
 * Falls back to the Xtop system tenant for backward compatibility.
 */
export async function resolveTenantFromWebhook(
  phoneNumberId: string
): Promise<TenantContext | null> {
  if (!phoneNumberId) {
    return await getSystemTenantContext();
  }

  const sb = getSupabaseClient();

  const { data: account, error } = await sb
    .from("tenant_whatsapp_accounts")
    .select("*, tenants(*), tenant_subscriptions(*)")
    .eq("phone_number_id", phoneNumberId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    safeErrorLog("resolveTenantFromWebhook", error);
    return await getSystemTenantContext();
  }

  if (!account) {
    return await getSystemTenantContext();
  }

  const tenant = (account as any).tenants;
  const subscriptions = (account as any).tenant_subscriptions;
  const activeSub = Array.isArray(subscriptions)
    ? subscriptions.find((s: any) => s.is_active)
    : null;

  const isSubscriptionActive = checkSubscriptionActive(activeSub);

  if (!isSubscriptionActive && !tenant?.is_system) {
    console.log(
      `[Tenant] Subscription inactive for tenant ${tenant?.id}. ` +
      `Status: ${activeSub?.status || "NONE"}`
    );
    return null;
  }

  let accessToken: string;
  try {
    accessToken = await decryptToken(account.encrypted_access_token);
  } catch (err) {
    safeErrorLog("resolveTenantFromWebhook.decrypt", err);
    return null;
  }

  return {
    tenantId: account.tenant_id,
    isSystem: tenant?.is_system || false,
    phoneNumberId: account.phone_number_id,
    accessToken,
    wabaId: account.waba_id,
    tenantName: tenant?.name || "Unknown",
    subscriptionStatus: activeSub?.status || "NONE",
    isSubscriptionActive,
  };
}

/**
 * Get the Xtop system tenant context using legacy environment variables.
 * This preserves full backward compatibility.
 */
async function getSystemTenantContext(): Promise<TenantContext> {
  return {
    tenantId: XTOP_SYSTEM_TENANT_ID,
    isSystem: true,
    phoneNumberId: Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "",
    accessToken: Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "",
    wabaId: "",
    tenantName: "Xtop Retail Technologies",
    subscriptionStatus: "ACTIVE",
    isSubscriptionActive: true,
  };
}

/**
 * Check if a subscription is currently active (trial or paid).
 */
function checkSubscriptionActive(sub: any): boolean {
  if (!sub) return false;

  const now = new Date();

  if (sub.status === "ACTIVE") {
    if (sub.paid_expires_at && new Date(sub.paid_expires_at) < now) {
      return false;
    }
    return true;
  }

  if (sub.status === "TRIAL") {
    if (sub.trial_expires_at && new Date(sub.trial_expires_at) < now) {
      return false;
    }
    return true;
  }

  if (sub.status === "GRACE_PERIOD") {
    if (sub.paid_expires_at) {
      const graceEnd = new Date(sub.paid_expires_at);
      graceEnd.setDate(graceEnd.getDate() + 7);
      return graceEnd > now;
    }
    return false;
  }

  return false;
}

/**
 * Get tenant context by tenant ID (for outbound messages).
 */
export async function getTenantContext(
  tenantId: string
): Promise<TenantContext | null> {
  if (tenantId === XTOP_SYSTEM_TENANT_ID) {
    return await getSystemTenantContext();
  }

  const sb = getSupabaseClient();

  const { data: account, error } = await sb
    .from("tenant_whatsapp_accounts")
    .select("*, tenants(*), tenant_subscriptions(*)")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error || !account) {
    safeErrorLog("getTenantContext", error);
    return null;
  }

  const tenant = (account as any).tenants;
  const subscriptions = (account as any).tenant_subscriptions;
  const activeSub = Array.isArray(subscriptions)
    ? subscriptions.find((s: any) => s.is_active)
    : null;

  let accessToken: string;
  try {
    accessToken = await decryptToken(account.encrypted_access_token);
  } catch (err) {
    safeErrorLog("getTenantContext.decrypt", err);
    return null;
  }

  return {
    tenantId: account.tenant_id,
    isSystem: tenant?.is_system || false,
    phoneNumberId: account.phone_number_id,
    accessToken,
    wabaId: account.waba_id,
    tenantName: tenant?.name || "Unknown",
    subscriptionStatus: activeSub?.status || "NONE",
    isSubscriptionActive: checkSubscriptionActive(activeSub),
  };
}

export { XTOP_SYSTEM_TENANT_ID };
