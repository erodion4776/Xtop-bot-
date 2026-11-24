import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const GEOAPIFY_KEY = Deno.env.get("GEOAPIFY_API_KEY") || "";

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const clean = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);
const amount = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

async function requireMerchant(req: Request, tenantId: string) {
  const match = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match || !ANON_KEY || !SERVICE_KEY) throw new Error("AUTH_REQUIRED");
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${match[1]}` } },
  });
  const { data, error } = await client.auth.getUser(match[1]);
  if (error || !data.user) throw new Error("AUTH_REQUIRED");
  const { data: member, error: memberError } = await db.from("tenant_members")
    .select("tenant_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", data.user.id)
    .eq("role", "OWNER")
    .eq("is_active", true)
    .maybeSingle();
  if (memberError || !member) throw new Error("NOT_AUTHORIZED");
}

async function geocodeMerchantAddress(address: string, city: string, state: string) {
  if (!GEOAPIFY_KEY) throw new Error("GEOAPIFY_NOT_CONFIGURED");
  const query = [address, city, state, "Nigeria"].filter(Boolean).join(", ");
  const url = new URL("https://api.geoapify.com/v1/geocode/search");
  url.searchParams.set("text", query);
  url.searchParams.set("countrycodes", "ng");
  url.searchParams.set("limit", "1");
  url.searchParams.set("format", "json");
  url.searchParams.set("apiKey", GEOAPIFY_KEY);
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  } catch (error) {
    console.error("Geoapify geocoding network failure:", error instanceof Error ? error.name : "UNKNOWN");
    throw new Error("ADDRESS_LOOKUP_NETWORK_FAILED");
  }
  if (!response.ok) {
    // Log only status metadata; never log the URL, API key, or merchant address.
    console.error("Geoapify geocoding rejected request:", {
      status: response.status,
      requestId: response.headers.get("x-request-id") || response.headers.get("x-correlation-id") || null,
    });
    if (response.status === 401 || response.status === 403) throw new Error("GEOAPIFY_KEY_REJECTED");
    if (response.status === 429) throw new Error("GEOAPIFY_RATE_LIMITED");
    throw new Error("ADDRESS_LOOKUP_FAILED");
  }
  const data = await response.json();
  const place = Array.isArray(data.results) ? data.results[0] : null;
  const lat = Number(place?.lat);
  const lon = Number(place?.lon);
  if (!place || place.country_code !== "ng" || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("ADDRESS_NOT_FOUND");
  }
  return {
    lat, lon,
    label: clean(place.formatted || place.address_line1 || query, 500),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return out({ success: false, error: "Method not allowed." }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const tenantId = clean(body.tenant_id, 80);
    if (!tenantId) return out({ success: false, error: "Merchant workspace is required." }, 400);
    await requireMerchant(req, tenantId);

    if (body.action === "settings-get") {
      const { data, error } = await db.from("tenant_delivery_preferences")
        .select("delivery_mode,pickup_address,pickup_state,pickup_city,pickup_lga,pickup_phone,base_fee,per_km_fee,minimum_fee,max_delivery_km,pricing_enabled,pickup_lat,pickup_lon,geocoded_label,location_verified_at")
        .eq("tenant_id", tenantId).maybeSingle();
      if (error) throw new Error("DELIVERY_SETTINGS_LOAD_FAILED");
      return out({
        success: true,
        configured: Boolean(GEOAPIFY_KEY),
        settings: data || {
          delivery_mode: "MERCHANT", pickup_address: "", pickup_state: "", pickup_city: "",
          pickup_lga: "", pickup_phone: "", base_fee: 0, per_km_fee: 0,
          minimum_fee: 0, max_delivery_km: 100, pricing_enabled: false,
          pickup_lat: null, pickup_lon: null, geocoded_label: null, location_verified_at: null,
        },
      });
    }

    if (body.action === "settings-save") {
      const address = clean(body.pickup_address, 500);
      const city = clean(body.pickup_city, 120);
      const state = clean(body.pickup_state, 120);
      const lga = clean(body.pickup_lga, 120);
      const phone = clean(body.pickup_phone, 40);
      const baseFee = amount(body.base_fee, -1);
      const perKmFee = amount(body.per_km_fee, -1);
      const minimumFee = amount(body.minimum_fee, -1);
      const maxKm = amount(body.max_delivery_km, 100);
      const pricingEnabled = body.pricing_enabled === true;

      if (pricingEnabled && (!address || !city || !state)) throw new Error("PICKUP_ADDRESS_REQUIRED");
      if ([baseFee, perKmFee, minimumFee].some(v => v < 0 || v > 100000000) ||
          !Number.isFinite(maxKm) || maxKm <= 0 || maxKm > 1000) {
        throw new Error("INVALID_DELIVERY_PRICING");
      }
      if (pricingEnabled && baseFee + perKmFee <= 0) throw new Error("DELIVERY_RATE_REQUIRED");

      const point = pricingEnabled ? await geocodeMerchantAddress(address, city, state) : null;
      const payload = {
        tenant_id: tenantId,
        delivery_mode: "MERCHANT",
        preferred_partner_id: null,
        pickup_address: address,
        pickup_state: state,
        pickup_city: city,
        pickup_lga: lga || null,
        pickup_phone: phone || null,
        pickup_lat: point?.lat ?? null,
        pickup_lon: point?.lon ?? null,
        geocoded_label: point?.label ?? null,
        location_verified_at: point ? new Date().toISOString() : null,
        base_fee: baseFee,
        per_km_fee: perKmFee,
        minimum_fee: minimumFee,
        max_delivery_km: maxKm,
        pricing_enabled: pricingEnabled,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await db.from("tenant_delivery_preferences")
        .upsert(payload, { onConflict: "tenant_id" })
        .select("delivery_mode,pickup_address,pickup_state,pickup_city,pickup_lga,pickup_phone,base_fee,per_km_fee,minimum_fee,max_delivery_km,pricing_enabled,pickup_lat,pickup_lon,geocoded_label,location_verified_at")
        .single();
      if (error) {
        console.error("Merchant delivery settings save failed:", error);
        throw new Error("DELIVERY_SETTINGS_SAVE_FAILED");
      }
      return out({ success: true, settings: data, message: pricingEnabled ? "Pickup address verified and delivery pricing saved." : "Merchant flat-fee delivery settings saved." });
    }

    return out({ success: false, error: "Unknown delivery settings action." }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const messages: Record<string, string> = {
      AUTH_REQUIRED: "Please log in again.",
      NOT_AUTHORIZED: "You are not authorized for this merchant workspace.",
      GEOAPIFY_NOT_CONFIGURED: "Sabi's distance service is not configured yet.",
      ADDRESS_LOOKUP_FAILED: "Geoapify could not complete the address lookup. Please try again shortly.",
      GEOAPIFY_KEY_REJECTED: "Geoapify rejected the API key. Check that the key is active and has no browser-only referrer restriction.",
      GEOAPIFY_RATE_LIMITED: "Geoapify's request limit has been reached. Please wait and try again.",
      ADDRESS_LOOKUP_NETWORK_FAILED: "Sabi could not reach Geoapify. Please try again shortly.",
      ADDRESS_NOT_FOUND: "We could not locate that pickup address in Nigeria. Add a clearer street, area, city and state.",
      PICKUP_ADDRESS_REQUIRED: "Enter the merchant pickup street address, city and state.",
      INVALID_DELIVERY_PRICING: "Enter valid delivery charges and a maximum distance between 1 and 1,000 km.",
      DELIVERY_RATE_REQUIRED: "Enter a base fee or a per-kilometre fee before enabling distance pricing.",
      DELIVERY_SETTINGS_LOAD_FAILED: "Unable to load merchant delivery settings.",
      DELIVERY_SETTINGS_SAVE_FAILED: "Unable to save merchant delivery settings.",
    };
    const status = message === "AUTH_REQUIRED" ? 401 : message === "NOT_AUTHORIZED" ? 403 :
      message === "ADDRESS_LOOKUP_FAILED" || message === "GEOAPIFY_NOT_CONFIGURED" ||
      message === "GEOAPIFY_KEY_REJECTED" || message === "GEOAPIFY_RATE_LIMITED" ||
      message === "ADDRESS_LOOKUP_NETWORK_FAILED" ? 502 : 400;
    console.error("Sabi delivery settings error:", message);
    return out({ success: false, error: messages[message] || "Delivery settings request failed." }, status);
  }
});
