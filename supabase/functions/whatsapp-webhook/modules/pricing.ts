// supabase/functions/whatsapp-webhook/modules/pricing.ts
// Placeholder for Phase 3 — Pricing engine

import { getSupabaseClient } from "../database.ts";
import { safeErrorLog } from "../utils.ts";

export interface PricingPackage {
  id: string;
  service_type: string;
  package_name: string;
  description: string;
  price: number;
  features: string[];
  display_order: number;
}

/**
 * Get pricing packages for a service type from the database.
 */
export async function getPackages(serviceType: string): Promise<PricingPackage[]> {
  const sb = getSupabaseClient();

  const { data, error } = await sb
    .from("pricing_packages")
    .select("*")
    .eq("service_type", serviceType)
    .eq("status", "ACTIVE")
    .order("display_order", { ascending: true });

  if (error) {
    safeErrorLog("getPackages", error);
    return [];
  }

  return (data || []) as PricingPackage[];
}
