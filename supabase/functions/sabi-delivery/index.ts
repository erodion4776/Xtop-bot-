import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const TOKEN = Deno.env.get("SENDBOX_API_TOKEN") || "";
const ENV = (Deno.env.get("SENDBOX_ENV") || "staging").toLowerCase();
const WEBHOOK_TOKEN = Deno.env.get("SABI_DELIVERY_WEBHOOK_TOKEN") || "";
const BASE = ENV === "production" ? "https://live.sendbox.co" : "https://sandbox.staging.sendbox.co";
const db = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const clean = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);

async function merchant(req: Request, tenantId: string) {
  const auth = req.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match || !ANON_KEY) throw new Error("AUTH_REQUIRED");
  const client = createClient(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${match[1]}` } } });
  const { data, error } = await client.auth.getUser(match[1]);
  if (error || !data.user) throw new Error("AUTH_REQUIRED");
  const { data: member } = await db.from("tenant_members").select("tenant_id")
    .eq("tenant_id", tenantId).eq("user_id", data.user.id).eq("role", "OWNER").eq("is_active", true).maybeSingle();
  if (!member) throw new Error("NOT_AUTHORIZED");
  return data.user;
}

async function sendbox(path: string, method: string, body?: unknown) {
  if (!TOKEN) throw new Error("SENDBOX_NOT_CONFIGURED");
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: TOKEN, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Sendbox request failed", response.status, payload);
    throw new Error("SENDBOX_REQUEST_FAILED");
  }
  return payload;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return out({ success: false, error: "Method not allowed." }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const url = new URL(req.url);
    if (body.action === "webhook") {
      if (!WEBHOOK_TOKEN || url.searchParams.get("token") !== WEBHOOK_TOKEN) return out({ success: false }, 401);
      const code = clean(body.code || body.tracking_code || body.tracking?.code, 100);
      const status = clean(body.status_code || body.status?.code || body.status, 60).toLowerCase();
      if (!code) return out({ success: true, ignored: true });
      const mapped = status.includes("deliver") ? "DELIVERED" :
        status.includes("transit") || status.includes("delivery_started") ? "IN_TRANSIT" :
        status.includes("pickup_completed") ? "PICKED_UP" :
        status.includes("pickup") ? "PICKED_UP" :
        status.includes("cancel") ? "CANCELLED" :
        status.includes("fail") ? "FAILED" : "BOOKED";
      const { error } = await db.from("sabi_delivery_shipments").update({
        status: mapped, provider_payload: body, last_webhook_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("tracking_number", code);
      if (error) return out({ success: false }, 500);
      return out({ success: true });
    }

    const tenantId = clean(body.tenant_id, 80);
    if (!tenantId) return out({ success: false, error: "Merchant workspace is required." }, 400);
    await merchant(req, tenantId);

    if (body.action === "settings-get") {
      const [{ data: pref, error: prefError }, { data: partners, error: partnerError }] = await Promise.all([
        db.from("tenant_delivery_preferences").select("delivery_mode,preferred_partner_id,pickup_address,pickup_state,pickup_city,pickup_lga").eq("tenant_id", tenantId).maybeSingle(),
        db.from("sabi_delivery_partners").select("id,code,name,service_states,service_cities,integration_status,is_enabled").eq("is_enabled", true).eq("integration_status", "ACTIVE").order("sort_order"),
      ]);
      if (prefError || partnerError) throw new Error("DELIVERY_SETTINGS_LOAD_FAILED");
      return out({ success: true, settings: pref || { delivery_mode: "MERCHANT", preferred_partner_id: null, pickup_address: "", pickup_state: "", pickup_city: "", pickup_lga: "" }, partners: partners || [], configured: !!TOKEN, environment: ENV });
    }

    if (body.action === "settings-save") {
      const mode = body.delivery_mode === "PARTNER" ? "PARTNER" : "MERCHANT";
      const partnerId = clean(body.preferred_partner_id, 80) || null;
      if (mode === "PARTNER") {
        if (!partnerId) throw new Error("DELIVERY_PARTNER_REQUIRED");
        const { data: partner } = await db.from("sabi_delivery_partners").select("id").eq("id", partnerId).eq("is_enabled", true).eq("integration_status", "ACTIVE").maybeSingle();
        if (!partner) throw new Error("DELIVERY_PARTNER_UNAVAILABLE");
      }
      const payload = {
        tenant_id: tenantId, delivery_mode: mode, preferred_partner_id: mode === "PARTNER" ? partnerId : null,
        pickup_address: clean(body.pickup_address, 500), pickup_state: clean(body.pickup_state, 100),
        pickup_city: clean(body.pickup_city, 100), pickup_lga: clean(body.pickup_lga, 100), updated_at: new Date().toISOString(),
      };
      const { data, error } = await db.from("tenant_delivery_preferences").upsert(payload, { onConflict: "tenant_id" }).select().single();
      if (error) throw new Error("DELIVERY_SETTINGS_SAVE_FAILED");
      return out({ success: true, settings: data });
    }

    if (body.action === "quote") {
      const orderId = clean(body.order_id, 80);
      const weight = Number(body.weight_kg);
      const destination = body.destination && typeof body.destination === "object" ? body.destination : null;
      if (!orderId || !Number.isFinite(weight) || weight <= 0 || weight > 1000 || !destination) throw new Error("QUOTE_DETAILS_REQUIRED");
      const [{ data: pref }, { data: order }, { data: items }] = await Promise.all([
        db.from("tenant_delivery_preferences").select("*").eq("tenant_id", tenantId).maybeSingle(),
        db.from("tenant_orders").select("id,tenant_id,order_number,customer_name,customer_phone,delivery_address,subtotal,payment_status,status").eq("tenant_id", tenantId).eq("id", orderId).maybeSingle(),
        db.from("tenant_order_items").select("product_name,quantity,unit_price,line_total").eq("tenant_id", tenantId).eq("order_id", orderId),
      ]);
      if (!pref || pref.delivery_mode !== "PARTNER" || !pref.preferred_partner_id) throw new Error("PARTNER_NOT_SELECTED");
      if (!order || !items?.length) throw new Error("ORDER_NOT_FOUND");
      const { data: partner } = await db.from("sabi_delivery_partners").select("id,code,integration_status,is_enabled").eq("id", pref.preferred_partner_id).maybeSingle();
      if (!partner || !partner.is_enabled || partner.integration_status !== "ACTIVE" || partner.code !== "SENDBOX") throw new Error("DELIVERY_PARTNER_UNAVAILABLE");
      const origin = {
        first_name: "Merchant", last_name: "Pickup", name: "Merchant pickup",
        street: pref.pickup_address, state: pref.pickup_state, city: pref.pickup_city,
        country: "NG", phone: clean(body.origin_phone, 40), email: clean(body.origin_email, 180) || null,
      };
      const dest = {
        first_name: clean(order.customer_name, 100).split(" ")[0] || "Customer",
        last_name: clean(order.customer_name, 100).split(" ").slice(1).join(" ") || "Customer",
        name: clean(order.customer_name, 100), street: clean(destination.street || order.delivery_address, 500),
        state: clean(destination.state, 100), city: clean(destination.city, 100), country: "NG",
        phone: clean(order.customer_phone, 40), email: clean(body.destination_email, 180) || "",
      };
      if (!origin.street || !origin.state || !origin.city || !origin.phone || !dest.street || !dest.state || !dest.city || !dest.phone) throw new Error("PICKUP_AND_DESTINATION_REQUIRED");
      const requestBody = {
        origin, destination: dest, weight, dimension: { length: 1, width: 1, height: 1 },
        incoming_option: "pickup", region: "NG", service_type: "local", package_type: "general",
        total_value: Number(order.subtotal || 0), currency: "NGN", channel_code: "api",
        pickup_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        items: items.map((item: any) => ({ name: clean(item.product_name, 160), quantity: Number(item.quantity), value: Number(item.line_total), weight: weight / items.length, description: clean(item.product_name, 160) })),
        service_code: "nation-wide", customs_option: "recipient",
      };
      const result = await sendbox("/shipping/shipment_delivery_quote", "POST", requestBody);
      const rates = Array.isArray(result.rates) ? result.rates : Array.isArray(result.data?.rates) ? result.data.rates : [];
      if (!rates.length) throw new Error("NO_DELIVERY_RATES");
      const { error: saveError } = await db.from("sabi_delivery_shipments").upsert({
        tenant_id: tenantId, order_id: orderId, partner_id: partner.id, status: "QUOTED",
        delivery_fee: Number(result.min_quoted_fee || Math.min(...rates.map((r: any) => Number(r.fee) || Infinity))),
        provider_payload: { quote_request: requestBody, quote_response: result, rates },
        quote_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: "tenant_id,order_id" });
      if (saveError) throw new Error("QUOTE_SAVE_FAILED");
      return out({ success: true, rates: rates.filter((r: any) => r.is_enabled !== false).map((r: any) => ({ id: String(r.id || r.key || ""), name: clean(r.name || r.courier?.name || r.description, 100), fee: Number(r.fee), currency: "NGN", delivery_eta: clean(r.delivery_eta_string || r.delivery_window || r.sla_description, 160) })).filter((r: any) => r.id && Number.isFinite(r.fee)) });
    }

    if (body.action === "book") {
      const orderId = clean(body.order_id, 80);
      const rateId = clean(body.rate_id, 100);
      if (!orderId || !rateId || body.confirm_cost !== true) throw new Error("BOOKING_CONFIRMATION_REQUIRED");
      const [{ data: order }, { data: shipment }] = await Promise.all([
        db.from("tenant_orders").select("id,tenant_id,payment_status,status").eq("tenant_id", tenantId).eq("id", orderId).maybeSingle(),
        db.from("sabi_delivery_shipments").select("*").eq("tenant_id", tenantId).eq("order_id", orderId).maybeSingle(),
      ]);
      if (!order || !shipment || shipment.status !== "QUOTED") throw new Error("QUOTE_NOT_FOUND");
      if (order.payment_status !== "PAID" || order.status === "CANCELLED") throw new Error("ORDER_NOT_READY_FOR_SHIPMENT");
      if (!shipment.quote_expires_at || new Date(shipment.quote_expires_at).getTime() <= Date.now()) throw new Error("QUOTE_EXPIRED");
      const saved = shipment.provider_payload || {};
      const rates = Array.isArray(saved.rates) ? saved.rates : [];
      const selected = rates.find((r: any) => String(r.id || r.key || "") === rateId && r.is_enabled !== false);
      if (!selected) throw new Error("INVALID_DELIVERY_RATE");
      const payload = { ...saved.quote_request, selected_rate_id: rateId, selected_rate: selected, callback_url: `${URL}/functions/v1/sabi-delivery?action=webhook&token=${encodeURIComponent(WEBHOOK_TOKEN)}` };
      const { error: bookingStateError } = await db.from("sabi_delivery_shipments").update({ status: "BOOKING", delivery_fee: Number(selected.fee), provider_payload: { ...saved, selected_rate: selected }, updated_at: new Date().toISOString() }).eq("id", shipment.id);
      if (bookingStateError) throw new Error("SHIPMENT_UPDATE_FAILED");
      try {
        const created = await sendbox("/shipping/shipments", "POST", payload);
        const tracking = clean(created.tracking_code || created.code || created.data?.tracking_code, 100);
        const providerId = clean(created._id || created.id || created.data?._id, 120);
        const rawStatus = clean(created.status_code || created.status?.code || created.data?.status_code, 60).toLowerCase();
        const status = rawStatus === "drafted" ? "PENDING" : rawStatus.includes("deliver") ? "DELIVERED" : "BOOKED";
        const { error: updateError } = await db.from("sabi_delivery_shipments").update({
          provider_shipment_id: providerId || null, tracking_number: tracking || null,
          tracking_url: tracking ? `https://sendbox.co/track/${encodeURIComponent(tracking)}` : null,
          status, provider_payload: { ...saved, booking_response: created, selected_rate: selected }, updated_at: new Date().toISOString(),
        }).eq("id", shipment.id);
        if (updateError) throw new Error("SHIPMENT_SAVE_FAILED");
        return out({ success: true, tracking_number: tracking, status, fee: Number(selected.fee), message: status === "PENDING" ? "Sendbox accepted the shipment as drafted. Check the Sendbox wallet to complete payment." : "Shipment booked with Sendbox." });
      } catch (e) {
        await db.from("sabi_delivery_shipments").update({ status: "FAILED", updated_at: new Date().toISOString() }).eq("id", shipment.id);
        throw e;
      }
    }

    if (body.action === "track") {
      const orderId = clean(body.order_id, 80);
      const { data: shipment } = await db.from("sabi_delivery_shipments").select("*").eq("tenant_id", tenantId).eq("order_id", orderId).maybeSingle();
      if (!shipment?.tracking_number) throw new Error("TRACKING_NOT_AVAILABLE");
      const result = await sendbox("/shipping/tracking", "POST", { code: shipment.tracking_number });
      const rawStatus = clean(result.status_code || result.status?.code, 60).toLowerCase();
      const status = rawStatus.includes("deliver") ? "DELIVERED" : rawStatus.includes("transit") || rawStatus.includes("in_delivery") ? "IN_TRANSIT" : rawStatus.includes("pickup") ? "PICKED_UP" : "BOOKED";
      await db.from("sabi_delivery_shipments").update({ status, provider_payload: { ...(shipment.provider_payload || {}), tracking_response: result }, updated_at: new Date().toISOString() }).eq("id", shipment.id);
      return out({ success: true, tracking_number: shipment.tracking_number, status, events: result.events || result.tracking_events || [], courier: result.courier?.name || result.selected_courier?.name || "Sendbox delivery partner" });
    }

    return out({ success: false, error: "Unknown delivery action." }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const messages: Record<string,string> = {
      AUTH_REQUIRED: "Please log in again.", NOT_AUTHORIZED: "You are not authorized for this merchant workspace.",
      SENDBOX_NOT_CONFIGURED: "Sendbox credentials have not been configured by Sabi yet.",
      SENDBOX_REQUEST_FAILED: "Sendbox could not complete the request. Check the integration account and try again.",
      DELIVERY_PARTNER_REQUIRED: "Select an approved delivery partner.",
      DELIVERY_PARTNER_UNAVAILABLE: "This delivery partner is not currently available.",
      QUOTE_DETAILS_REQUIRED: "Enter the order, parcel weight and destination details.",
      PICKUP_AND_DESTINATION_REQUIRED: "Complete the merchant pickup address and customer destination city, state, street and phone.",
      PARTNER_NOT_SELECTED: "Select an approved delivery partner in Delivery Settings first.",
      ORDER_NOT_FOUND: "Order not found.",
      NO_DELIVERY_RATES: "Sendbox returned no delivery rates for this route.",
      QUOTE_SAVE_FAILED: "The delivery quote could not be saved.",
      BOOKING_CONFIRMATION_REQUIRED: "Confirm the displayed delivery price before booking.",
      QUOTE_NOT_FOUND: "Get a fresh delivery quote before booking.",
      ORDER_NOT_READY_FOR_SHIPMENT: "Only paid, active orders can be booked for delivery.",
      QUOTE_EXPIRED: "This delivery quote has expired. Request a new quote.",
      INVALID_DELIVERY_RATE: "That delivery option is no longer valid. Request a new quote.",
      TRACKING_NOT_AVAILABLE: "No tracking number is available for this order.",
    };
    const status = message === "AUTH_REQUIRED" ? 401 : message === "NOT_AUTHORIZED" ? 403 : message === "SENDBOX_REQUEST_FAILED" ? 502 : 400;
    return out({ success: false, error: messages[message] || "Delivery request failed." }, status);
  }
});
