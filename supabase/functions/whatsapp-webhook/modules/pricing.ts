// supabase/functions/whatsapp-webhook/modules/pricing.ts

import { getPricingPackages, PricingPackage } from "../database.ts";

export function formatNaira(amount: number): string {
  return "₦" + amount.toLocaleString("en-NG", { maximumFractionDigits: 0 });
}

/**
 * Deterministic pricing engine.
 *
 * Rules:
 * 1. Fetch all active packages for the service type from PostgreSQL.
 * 2. For each package, calculate the coverage ratio of requested features
 *    against the features listed on the package.
 * 3. Prefer packages with >= 70% coverage.
 * 4. Score = coverage_percent + bonus (10) if min_price <= budget midpoint.
 * 5. Return the highest scoring package (ties broken by lowest price).
 */
export async function matchPackage(
  serviceType: string,
  requestedFeatureCodes: string[],
  budgetRange?: string
): Promise<{ pkg: PricingPackage; coverage: number } | null> {
  const packages = await getPricingPackages(serviceType);
  if (packages.length === 0) return null;

  const budgetMid = parseBudgetMidpoint(budgetRange);

  const scored = packages.map((pkg) => {
    const pkgFeatures = (pkg.features || []) as string[];
    if (requestedFeatureCodes.length === 0) {
      return { pkg, coverage: 1, score: 100 };
    }
    const matched = requestedFeatureCodes.filter((f) =>
      pkgFeatures.some((pf) => pf.toUpperCase() === f.toUpperCase())
    ).length;
    const coverage = matched / requestedFeatureCodes.length;
    let score = coverage * 100;
    if (budgetMid > 0 && pkg.min_price <= budgetMid) score += 10;
    return { pkg, coverage, score };
  });

  const viable = scored.filter((s) => s.coverage >= 0.7);
  const pool = viable.length > 0 ? viable : scored;
  pool.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.pkg.min_price - b.pkg.min_price;
  });
  return pool[0] || null;
}

function parseBudgetMidpoint(budgetRange?: string): number {
  if (!budgetRange || budgetRange === "NOT_SURE") return 0;
  const nums = budgetRange.match(/\d+/g);
  if (!nums || nums.length === 0) return 0;
  const values = nums.map((n) => parseInt(n, 10));
  if (values.length === 1) return values[0];
  return Math.round((values[0] + values[values.length - 1]) / 2);
}

// ── Feature code maps ──────────────────────────────────

export const BOT_FEATURE_MAP: Record<string, string> = {
  "answer faqs": "FAQ", "faqs": "FAQ",
  "take orders": "ORDERS", "orders": "ORDERS",
  "collect leads": "LEADS", "leads": "LEADS",
  "product recommendations": "PRODUCT_RECS",
  "booking/appointments": "BOOKING", "booking": "BOOKING", "appointments": "BOOKING",
  "customer support": "FAQ",
  "payments": "PAYMENTS",
  "quotations": "QUOTATIONS",
  "notifications": "NOTIFICATIONS",
  "other": "CUSTOM_WORKFLOW",
};

export const WEB_FEATURE_MAP: Record<string, string> = {
  "admin/cms dashboard": "CMS", "cms": "CMS",
  "payment gateway": "PAYMENT_GATEWAY",
  "whatsapp integration": "WA_INTEGRATION",
  "customer accounts": "CUSTOMER_ACCOUNTS",
  "online forms": "FORMS",
  "booking": "BOOKING",
  "database": "DATABASE",
  "other": "CUSTOM_INTEGRATION",
};

export const AUTO_FEATURE_MAP: Record<string, string> = {
  "customer management": "CRM",
  "invoicing": "INVOICING",
  "crm": "CRM",
  "google sheets integration": "GOOGLE_SHEETS",
  "database integration": "DATABASE",
  "pdf generation": "PDF",
  "reports": "REPORTS",
  "whatsapp automation": "WHATSAPP_AUTO",
  "email automation": "EMAIL_AUTO",
  "custom workflow": "CUSTOM_WORKFLOW",
};

export function mapFeaturesToCodes(features: string[], map: Record<string, string>): string[] {
  const codes = new Set<string>();
  for (const f of features) {
    const key = f.toLowerCase();
    const code = map[key] || f.toUpperCase().replace(/\s+/g, "_");
    codes.add(code);
  }
  return Array.from(codes);
}
