
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendNewOrderEmails, sendPaymentReceiptEmail, sendOrderStatusEmail, sendLowStockAlertEmail } from "../_shared/sabi-email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY")!;
const GEOAPIFY_KEY = Deno.env.get("GEOAPIFY_API_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function respond(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function fail(message: string, status = 400): Response {
  return respond({ success: false, error: message }, status);
}



// Notify the merchant only when a product crosses into the low-stock band
// (5 or fewer) or becomes completely out of stock. Stock reservation remains
// inside the existing database order RPC; this function only reads its result.
async function notifyLowStockAfterOrder(tenantId: string, orderId: string): Promise<void> {
  try {
    const { data: items, error: itemsError } = await db.from("tenant_order_items")
      .select("product_id,product_name,quantity")
      .eq("tenant_id", tenantId)
      .eq("order_id", orderId);

    if (itemsError || !items?.length) {
      if (itemsError) console.warn("Low-stock alert item lookup failed.", itemsError);
      return;
    }

    const alerts: Array<{ name: string; remaining: number; alertType: "LOW_STOCK" | "OUT_OF_STOCK" }> = [];
    for (const item of items) {
      if (!item.product_id) continue;
      const { data: product, error: productError } = await db.from("products")
        .select("name,stock_quantity")
        .eq("tenant_id", tenantId)
        .eq("id", item.product_id)
        .maybeSingle();

      if (productError || !product || product.stock_quantity == null) {
        if (productError) console.warn("Low-stock alert product lookup failed.", productError);
        continue;
      }

      const remaining = Number(product.stock_quantity);
      const beforeReservation = remaining + Number(item.quantity || 0);
      if (remaining === 0 && beforeReservation > 0) {
        alerts.push({ name: product.name || item.product_name || "Product", remaining, alertType: "OUT_OF_STOCK" });
      } else if (remaining > 0 && remaining <= 5 && beforeReservation > 5) {
        alerts.push({ name: product.name || item.product_name || "Product", remaining, alertType: "LOW_STOCK" });
      }
    }

    if (alerts.length) {
      await sendLowStockAlertEmail(db, { tenantId, products: alerts });
    }
  } catch (error) {
    // Inventory email delivery must never interrupt checkout or payment setup.
    console.warn("Low-stock notification failed; order processing will continue.", error);
  }
}

function getPaymentCallback(orderId: string): string {
  return `https://xtopbot.netlify.app/payment-confirmation.html?order=${encodeURIComponent(orderId)}&payment=return`;
}

// INITIALIZE PAYSTACK WITH MERCHANT SPLIT SETTLEMENT
async function initializePaystack(
  intent: Record<string, unknown>,
  orderNumber: string,
  purpose: string,
) {
  const reference = String(intent.reference);
  const tenantId = String(intent.tenant_id);
  const orderId = String(intent.order_id);
  const paymentType = String(intent.payment_type);

  // Read the fee calculation saved by the database trigger.
  const feeSnapshot = (intent.metadata || {}) as Record<string, unknown>;

  const basePaymentAmount = Number(feeSnapshot.base_payment_amount);
  const commissionAmount = Number(
    feeSnapshot.merchant_commission_amount,
  );
  const commissionBasisAmount = Number(
    feeSnapshot.commission_basis_amount,
  );
  const serviceFee = Number(feeSnapshot.customer_service_fee);
  const paystackProcessingFee = Number(feeSnapshot.paystack_processing_fee);
  const xtopTransactionCharge = Number(
    feeSnapshot.xtop_transaction_charge,
  );
  const expectedAmount = Number(intent.expected_amount);

  // Reject incomplete or inconsistent fee calculations.
  if (
    !Number.isFinite(basePaymentAmount) ||
    !Number.isFinite(commissionAmount) ||
    !Number.isFinite(commissionBasisAmount) ||
    !Number.isFinite(serviceFee) ||
    !Number.isFinite(paystackProcessingFee) ||
    !Number.isFinite(xtopTransactionCharge) ||
    !Number.isFinite(expectedAmount) ||
    serviceFee !== 50 ||
    commissionAmount < 0 ||
    paystackProcessingFee < 0 ||
    xtopTransactionCharge !== commissionAmount + serviceFee + paystackProcessingFee ||
    Math.round((basePaymentAmount + xtopTransactionCharge) * 100) !==
      Math.round(expectedAmount * 100)
  ) {
    throw new Error("INVALID_PAYSTACK_FEE_SNAPSHOT");
  }

  // Confirm that the merchant has a verified Paystack subaccount.
  const { data: tenant, error: tenantError } = await db
    .from("tenants")
    .select(
      "paystack_subaccount_code,paystack_subaccount_status,paystack_subaccount_verified_at",
    )
    .eq("id", tenantId)
    .maybeSingle();

  if (
    tenantError ||
    !tenant?.paystack_subaccount_code ||
    tenant.paystack_subaccount_status !== "VERIFIED" ||
    !tenant.paystack_subaccount_verified_at
  ) {
    console.error(
      "Merchant Paystack subaccount is not verified:",
      tenantError,
    );
    throw new Error("MERCHANT_SUBACCOUNT_NOT_VERIFIED");
  }

  const paystackResponse = await fetch(
    "https://api.paystack.co/transaction/initialize",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: intent.customer_email,
        amount: String(Math.round(expectedAmount * 100)),
        currency: intent.currency,
        reference,

        // Merchant receives the balance.
        subaccount: tenant.paystack_subaccount_code,

        // XTOP receives commission plus the ₦50 service fee.
        // Paystack expects this amount in kobo.
        transaction_charge: Math.round(
          xtopTransactionCharge * 100,
        ),

        callback_url: getPaymentCallback(orderId),

        metadata: {
          purpose,
          tenant_id: tenantId,
          order_id: orderId,
          payment_type: paymentType,
          payment_reference: reference,
          order_number: orderNumber,
          merchant_commission_amount: commissionAmount,
          customer_service_fee: serviceFee,
          paystack_processing_fee: paystackProcessingFee,
          xtop_transaction_charge: xtopTransactionCharge,
          commission_basis_amount: commissionBasisAmount,
        },
      }),
    },
  );

  const paystackData = await paystackResponse.json();

  if (
    !paystackResponse.ok ||
    paystackData.status !== true ||
    !paystackData.data?.authorization_url
  ) {
    console.error("Paystack initialization failed:", paystackData);
    throw new Error("PAYMENT_INITIALIZATION_FAILED");
  }

  return {
    authorization_url: paystackData.data.authorization_url,
    access_code: paystackData.data.access_code,
    reference,
  };
}

// PUBLIC CUSTOMER CHECKOUT
async function createOrder(body: Record<string, unknown>) {
  const productId = String(body.product_id || "");
  const quantity = Number(body.quantity);
  const customerName = String(body.customer_name || "").trim();
  const customerPhone = String(body.customer_phone || "").trim();
  const customerEmail = String(body.customer_email || "")
    .trim()
    .toLowerCase();
  const deliveryAddress = String(body.delivery_address || "").trim();
  const notes = body.notes == null ? null : String(body.notes);
  const paymentMethod = String(body.payment_method || "ONLINE").toUpperCase();

  if (
    !productId ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > 100
  ) {
    throw new Error("INVALID_ORDER_DETAILS");
  }

  if (
    !customerName ||
    !customerPhone ||
    !customerEmail ||
    !deliveryAddress
  ) {
    throw new Error("CUSTOMER_DETAILS_REQUIRED");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    throw new Error("INVALID_CUSTOMER_EMAIL");
  }

  if (!["ONLINE", "POD"].includes(paymentMethod)) {
    throw new Error("INVALID_PAYMENT_METHOD");
  }

  const { data: order, error: orderError } = await db.rpc(
    "sabi_create_public_order",
    {
      p_product_id: productId,
      p_quantity: quantity,
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_customer_email: customerEmail,
      p_delivery_address: deliveryAddress,
      p_notes: notes,
      p_payment_method: paymentMethod,
    },
  );

  if (orderError || !order?.success) {
    console.error("Order creation failed:", orderError);
    throw new Error("ORDER_CREATION_FAILED");
  }


  // Metadata is required for the fee and split-settlement calculation.
  const { data: intent, error: intentError } = await db
    .from("tenant_order_payment_intents")
    .select(
      "tenant_id,order_id,payment_type,reference,expected_amount,currency,customer_email,metadata",
    )
    .eq("reference", order.payment_reference)
    .single();

  if (intentError || !intent) {
    console.error("Payment intent lookup failed:", intentError);
    throw new Error("PAYMENT_INTENT_NOT_FOUND");
  }

  await notifyLowStockAfterOrder(String(intent.tenant_id), String(order.order_id));

  // Link the saved cart to this order, but keep it active until payment
  // is confirmed. The reminder worker checks the live order payment status.
  const { error: cartLinkError } = await db.from("sabi_abandoned_carts")
    .update({
      order_id: String(order.order_id),
      updated_at: new Date().toISOString()
    })
    .eq("tenant_id", intent.tenant_id)
    .eq("product_id", productId)
    .eq("customer_email", customerEmail)
    .eq("status", "ACTIVE");
  if (cartLinkError) {
    console.warn("Could not link the abandoned-cart record to this order.", cartLinkError);
  }

  // Best-effort branded emails; order creation must not fail if email delivery is unavailable.
  await sendNewOrderEmails(db, {
    tenantId: intent.tenant_id,
    orderId: String(order.order_id),
    orderNumber: order.order_number,
    customerName,
    customerEmail,
    subtotal: Number(order.subtotal || 0),
    deliveryFee: Number(order.delivery_fee || 0),
    total: Number(order.total || 0),
    paymentMethod,
  });

  let payment;

  try {
    payment = await initializePaystack(
      intent,
      order.order_number,
      "SABI_PUBLIC_ORDER",
    );
  } catch (error) {
    console.error("Public Paystack initialization failed:", error);

    const errorMessage =
      error instanceof Error ? error.message : "";

    return respond({
      success: false,
      order_created: true,
      order_id: order.order_id,
      order_number: order.order_number,
      error: errorMessage || "PAYMENT_INITIALIZATION_FAILED",
      message:
        errorMessage === "MERCHANT_SUBACCOUNT_NOT_VERIFIED"
          ? "This merchant has not completed Paystack account verification. Please contact the merchant."
          : "Your order was created, but payment could not start. Please contact the merchant before trying again.",
    }, 502);
  }

  const feeSnapshot = (intent.metadata || {}) as Record<string, unknown>;

  return respond({
    success: true,
    order_id: order.order_id,
    order_number: order.order_number,
    payment_reference: payment.reference,
    payment_type: intent.payment_type,
    payment_method: paymentMethod,
    subtotal: order.subtotal,
    delivery_fee: order.delivery_fee,
    total: order.total,
    payment_amount: Number(intent.expected_amount),
    sabi_service_fee: Number(feeSnapshot.customer_service_fee),
    sabi_commission: Number(feeSnapshot.merchant_commission_amount),
    paystack_processing_fee: Number(feeSnapshot.paystack_processing_fee),
    currency: intent.currency,
    authorization_url: payment.authorization_url,
    access_code: payment.access_code,
    customer_confirmation_token: order.customer_confirmation_token,
  });
}



type MerchantWhatsAppDeliveryQuote = {
  fee: number;
  calculation: "MERCHANT_FLAT_FALLBACK" | "GEOAPIFY_ROAD_DISTANCE" | "NO_DELIVERY";
  distanceKm: number | null;
};

async function quoteMerchantWhatsAppDelivery(
  items: { product_id: string; quantity: number }[],
  deliveryAddress: string,
): Promise<MerchantWhatsAppDeliveryQuote> {
  const productIds = [...new Set(items.map(item => item.product_id))];
  const { data: products, error: productsError } = await db
    .from("products").select("id,tenant_id").in("id", productIds);
  if (productsError || !products || products.length !== productIds.length) {
    throw new Error("INVALID_ORDER_DETAILS");
  }
  const tenantIds = [...new Set(products.map((item: any) => String(item.tenant_id)))];
  if (tenantIds.length !== 1) throw new Error("INVALID_ORDER_DETAILS");
  const tenantId = tenantIds[0];

  const [{ data: tenant, error: tenantError }, { data: pref, error: prefError }] = await Promise.all([
    db.from("tenants").select("id,shipping_enabled,shipping_fee").eq("id", tenantId).maybeSingle(),
    db.from("tenant_delivery_preferences")
      .select("pickup_lat,pickup_lon,base_fee,per_km_fee,minimum_fee,max_delivery_km,pricing_enabled,location_verified_at")
      .eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (tenantError || prefError || !tenant) throw new Error("DELIVERY_SETTINGS_LOOKUP_FAILED");
  if (tenant.shipping_enabled !== true) return { fee: 0, calculation: "NO_DELIVERY", distanceKm: null };

  const flatFallback = Number(tenant.shipping_fee || 0);
  if (!Number.isFinite(flatFallback) || flatFallback < 0) throw new Error("INVALID_DELIVERY_FEE");
  if (pref?.pricing_enabled !== true) {
    if (flatFallback <= 0) throw new Error("MERCHANT_DELIVERY_NOT_CONFIGURED");
    return { fee: Math.ceil(flatFallback), calculation: "MERCHANT_FLAT_FALLBACK", distanceKm: null };
  }

  const hasVerifiedPickup = pref.location_verified_at &&
    pref.pickup_lat != null && pref.pickup_lon != null &&
    Number.isFinite(Number(pref.pickup_lat)) && Number.isFinite(Number(pref.pickup_lon)) &&
    Math.abs(Number(pref.pickup_lat)) <= 90 && Math.abs(Number(pref.pickup_lon)) <= 180;
  if (!hasVerifiedPickup) {
    if (flatFallback > 0) return { fee: Math.ceil(flatFallback), calculation: "MERCHANT_FLAT_FALLBACK", distanceKm: null };
    throw new Error("MERCHANT_PICKUP_LOCATION_NOT_READY");
  }

  try {
    const destination = await geoapifyGeocode(deliveryAddress);
    const distanceKm = await geoapifyRoadDistance(
      { lat: Number(pref.pickup_lat), lon: Number(pref.pickup_lon) },
      destination,
    );
    const maxKm = Number(pref.max_delivery_km || 100);
    if (!Number.isFinite(maxKm) || maxKm <= 0 || distanceKm > maxKm) {
      if (flatFallback > 0) return { fee: Math.ceil(flatFallback), calculation: "MERCHANT_FLAT_FALLBACK", distanceKm };
      throw new Error("DELIVERY_OUTSIDE_MERCHANT_RANGE");
    }
    const baseFee = Number(pref.base_fee || 0);
    const perKmFee = Number(pref.per_km_fee || 0);
    const minimumFee = Number(pref.minimum_fee || 0);
    if (![baseFee, perKmFee, minimumFee].every(value => Number.isFinite(value) && value >= 0)) {
      throw new Error("INVALID_DELIVERY_FEE");
    }
    const fee = Math.ceil(Math.max(minimumFee, baseFee + distanceKm * perKmFee));
    if (!Number.isSafeInteger(fee) || fee < 0 || fee > 100000000) throw new Error("INVALID_DELIVERY_FEE");
    return { fee, calculation: "GEOAPIFY_ROAD_DISTANCE", distanceKm: Math.round(distanceKm * 10) / 10 };
  } catch (error) {
    if (flatFallback > 0 && error instanceof Error &&
        ["GEOAPIFY_NOT_CONFIGURED", "GEOAPIFY_GEOCODE_FAILED", "GEOAPIFY_ROUTE_FAILED", "DELIVERY_DESTINATION_NOT_FOUND"].includes(error.message)) {
      return { fee: Math.ceil(flatFallback), calculation: "MERCHANT_FLAT_FALLBACK", distanceKm: null };
    }
    throw error;
  }
}

async function createCartOrder(body: Record<string, unknown>) {
  const items = Array.isArray(body.items) ? body.items : [];
  const customerName = String(body.customer_name || "").trim();
  const customerPhone = String(body.customer_phone || "").trim();
  const customerEmail = String(body.customer_email || "").trim().toLowerCase();
  const deliveryAddress = String(body.delivery_address || "").trim();
  const paymentMethod = String(body.payment_method || "ONLINE").toUpperCase();

  if (!items.length || items.length > 30) throw new Error("INVALID_ORDER_DETAILS");
  if (!customerName || !customerPhone || !customerEmail || !deliveryAddress) throw new Error("CUSTOMER_DETAILS_REQUIRED");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) throw new Error("INVALID_CUSTOMER_EMAIL");
  if (!["ONLINE", "POD"].includes(paymentMethod)) throw new Error("INVALID_PAYMENT_METHOD");

  const normalizedItems = items.map((item: Record<string, unknown>) => ({
    product_id: String(item.product_id || ""),
    quantity: Number(item.quantity),
  }));
  if (normalizedItems.some((item: {product_id:string;quantity:number}) =>
    !item.product_id || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 100
  )) throw new Error("INVALID_ORDER_DETAILS");

  // If a previous checkout created the order but lost its WhatsApp reply,
  // reuse that exact pending order instead of creating another order or
  // deducting stock a second time.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentIntents, error: recentIntentError } = await db
    .from("tenant_order_payment_intents")
    .select("id,tenant_id,order_id,payment_type,reference,expected_amount,currency,customer_email,metadata,created_at")
    .eq("customer_email", customerEmail)
    .eq("status", "PENDING")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(10);
  if (recentIntentError) throw new Error("PAYMENT_INTENT_LOOKUP_FAILED");

  const requestedItems = normalizedItems
    .map((x: {product_id:string;quantity:number}) => x.product_id + ":" + x.quantity)
    .sort()
    .join("|");

  let order: any = null;
  let intent: any = null;
  let previousReference = "";
  let isNewOrder = false;

  for (const candidate of recentIntents || []) {
    const { data: candidateOrder } = await db
      .from("tenant_orders")
      .select("id,tenant_id,order_number,status,payment_status,payment_method,source,subtotal,delivery_fee,total")
      .eq("id", candidate.order_id)
      .eq("tenant_id", candidate.tenant_id)
      .eq("customer_phone", customerPhone)
      .maybeSingle();

    if (!candidateOrder ||
        candidateOrder.status !== "PENDING" ||
        candidateOrder.payment_status !== "UNPAID" ||
        candidateOrder.source !== "WHATSAPP" ||
        candidateOrder.payment_method !== paymentMethod) continue;

    const { data: savedItems, error: savedItemsError } = await db
      .from("tenant_order_items")
      .select("product_id,quantity")
      .eq("tenant_id", candidate.tenant_id)
      .eq("order_id", candidate.order_id);
    if (savedItemsError || !savedItems) continue;

    const savedSignature = savedItems
      .map((x: {product_id:string;quantity:number}) => String(x.product_id) + ":" + Number(x.quantity))
      .sort()
      .join("|");
    if (savedSignature !== requestedItems) continue;

    order = candidateOrder;
    intent = candidate;
    previousReference = String(candidate.reference || "");
    break;
  }

  if (order && intent) {
    // An existing pending order keeps its original delivery-fee snapshot on retry.
    // Retire the lost checkout reference before issuing a replacement link.
    await db.from("tenant_order_payment_intents")
      .update({ status: "FAILED" })
      .eq("tenant_id", order.tenant_id)
      .eq("order_id", order.id)
      .eq("status", "PENDING");

    const newReference = "SABI-ORDER-" + crypto.randomUUID().replace(/-/g, "");
    const { data: replacementIntent, error: replacementError } = await db
      .from("tenant_order_payment_intents")
      .insert({
        tenant_id: order.tenant_id,
        order_id: order.id,
        payment_type: intent.payment_type,
        reference: newReference,
        expected_amount: Number(intent.expected_amount),
        currency: intent.currency || "NGN",
        customer_email: customerEmail,
        status: "PENDING",
        metadata: {
          // Preserve the original fee snapshot; Paystack initialization validates it.
          ...((intent.metadata && typeof intent.metadata === "object") ? intent.metadata : {}),
          purpose: "SABI_PUBLIC_ORDER",
          order_number: order.order_number,
          payment_method: paymentMethod,
          source: "WHATSAPP",
          retry_of_reference: previousReference,
        },
      })
      .select("tenant_id,order_id,payment_type,reference,expected_amount,currency,customer_email,metadata")
      .single();
    if (replacementError || !replacementIntent) {
      console.error("Pending order payment recovery failed:", replacementError);
      throw new Error("PAYMENT_INTENT_RECOVERY_FAILED");
    }
    intent = replacementIntent;
  } else {
    const deliveryQuote = await quoteMerchantWhatsAppDelivery(normalizedItems, deliveryAddress);
    const { data: createdOrder, error: orderError } = await db.rpc("sabi_create_public_cart_order_with_delivery", {
      p_items: normalizedItems,
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_customer_email: customerEmail,
      p_delivery_address: deliveryAddress,
      p_notes: body.notes == null ? null : String(body.notes),
      p_payment_method: paymentMethod,
      p_delivery_fee: deliveryQuote.fee,
      p_delivery_calculation: deliveryQuote.calculation,
      p_delivery_distance_km: deliveryQuote.distanceKm,
    });
    if (orderError || !createdOrder?.success) {
      console.error("WhatsApp cart order creation failed:", orderError);
      throw new Error("ORDER_CREATION_FAILED");
    }

    await notifyLowStockAfterOrder(String(createdOrder.tenant_id || ""), String(createdOrder.order_id));
    order = {
      id: createdOrder.order_id,
      tenant_id: createdOrder.tenant_id,
      order_number: createdOrder.order_number,
      subtotal: createdOrder.subtotal,
      delivery_fee: createdOrder.delivery_fee,
      total: createdOrder.total,
    };
    isNewOrder = true;
    const { data: createdIntent, error: intentError } = await db
      .from("tenant_order_payment_intents")
      .select("tenant_id,order_id,payment_type,reference,expected_amount,currency,customer_email,metadata")
      .eq("reference", createdOrder.payment_reference)
      .single();
    if (intentError || !createdIntent) throw new Error("PAYMENT_INTENT_NOT_FOUND");
    intent = createdIntent;
  }

  if (isNewOrder) {
    await sendNewOrderEmails(db, {
      tenantId: intent.tenant_id,
      orderId: String(order.id),
      orderNumber: order.order_number,
      customerName,
      customerEmail,
      subtotal: Number(order.subtotal || 0),
      deliveryFee: Number(order.delivery_fee || 0),
      total: Number(order.total || 0),
      paymentMethod,
    });
  }

  try {
    const payment = await initializePaystack(intent, order.order_number, "SABI_PUBLIC_ORDER");
    const feeSnapshot = (intent.metadata || {}) as Record<string, unknown>;
    return respond({
      success: true,
      order_id: order.id,
      order_number: order.order_number,
      payment_reference: payment.reference,
      payment_type: intent.payment_type,
      payment_method: paymentMethod,
      subtotal: Number(order.subtotal),
      delivery_fee: Number(order.delivery_fee),
      total: Number(order.total),
      payment_amount: Number(intent.expected_amount),
      sabi_service_fee: Number(feeSnapshot.customer_service_fee),
      sabi_commission: Number(feeSnapshot.merchant_commission_amount),
      paystack_processing_fee: Number(feeSnapshot.paystack_processing_fee),
      currency: intent.currency,
      authorization_url: payment.authorization_url,
      delivery_calculation: order.delivery_calculation || null,
      delivery_distance_km: order.delivery_distance_km || null,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "";
    console.error("WhatsApp cart Paystack initialization failed:", error);
    return respond({
      success: false,
      order_created: true,
      order_id: order.id,
      order_number: order.order_number,
      error: errorMessage || "PAYMENT_INITIALIZATION_FAILED",
      message: errorMessage === "MERCHANT_SUBACCOUNT_NOT_VERIFIED"
        ? "Merchant Paystack verification is still pending. Contact the merchant to complete payment."
        : "Your order is saved, but payment setup failed. Reply *checkout* to safely retry payment; your stock will not be deducted again.",
    }, 502);
  }
}


async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, "0")).join("");
}

function marketplaceCartSignature(items: { product_id: string; quantity: number }[]): Promise<string> {
  const stable = [...items].sort((a, b) => a.product_id.localeCompare(b.product_id))
    .map(item => `${item.product_id}:${item.quantity}`).join("|");
  return sha256Hex(stable);
}

async function geoapifyGeocode(address: string): Promise<{ lat: number; lon: number }> {
  if (!GEOAPIFY_KEY) throw new Error("GEOAPIFY_NOT_CONFIGURED");
  const url = new URL("https://api.geoapify.com/v1/geocode/search");
  url.searchParams.set("text", address);
  url.searchParams.set("countrycodes", "ng");
  url.searchParams.set("limit", "1");
  url.searchParams.set("format", "json");
  url.searchParams.set("apiKey", GEOAPIFY_KEY);
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("GEOAPIFY_GEOCODE_FAILED");
  const data = await response.json();
  const place = Array.isArray(data.results) ? data.results[0] : null;
  const lat = Number(place?.lat), lon = Number(place?.lon);
  if (!place || place.country_code !== "ng" || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("DELIVERY_DESTINATION_NOT_FOUND");
  }
  return { lat, lon };
}

async function geoapifyRoadDistance(origin: { lat: number; lon: number }, destination: { lat: number; lon: number }): Promise<number> {
  const url = new URL("https://api.geoapify.com/v1/routing");
  url.searchParams.set("waypoints", `${origin.lat},${origin.lon}|${destination.lat},${destination.lon}`);
  url.searchParams.set("mode", "drive");
  url.searchParams.set("type", "balanced");
  url.searchParams.set("format", "json");
  url.searchParams.set("apiKey", GEOAPIFY_KEY);
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("GEOAPIFY_ROUTE_FAILED");
  const data = await response.json();
  const meters = Number(data?.results?.[0]?.distance);
  if (!Number.isFinite(meters) || meters <= 0 || meters > 1000000) throw new Error("GEOAPIFY_ROUTE_FAILED");
  return meters / 1000;
}

async function geoapifyRoadDistances(
  origins: { lat: number; lon: number }[],
  destination: { lat: number; lon: number },
): Promise<(number | null)[]> {
  if (!GEOAPIFY_KEY) throw new Error("GEOAPIFY_NOT_CONFIGURED");
  if (!origins.length || origins.length > 1000) throw new Error("GEOAPIFY_ROUTE_FAILED");
  const response = await fetch(`https://api.geoapify.com/v1/routematrix?apiKey=${encodeURIComponent(GEOAPIFY_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "drive",
      type: "balanced",
      units: "metric",
      sources: origins.map(point => ({ location: [point.lon, point.lat] })),
      targets: [{ location: [destination.lon, destination.lat] }],
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (response.ok) {
    const data = await response.json();
    const matrix = data?.sources_to_targets;
    if (Array.isArray(matrix) && matrix.length === origins.length) {
      return matrix.map((row: any) => {
        const meters = Number(row?.[0]?.distance);
        return Number.isFinite(meters) && meters > 0 && meters <= 1000000 ? meters / 1000 : null;
      });
    }
  }

  // Some Geoapify projects restrict API products individually. If Route Matrix
  // is not enabled for this key, fall back to the standard Routing API.
  return await Promise.all(origins.map(async origin => {
    try {
      return await geoapifyRoadDistance(origin, destination);
    } catch {
      return null;
    }
  }));
}

function marketplaceProcessingFee(itemSubtotal: number, deliveryTotal: number, commissionTotal: number): number {
  const preFee = itemSubtotal + deliveryTotal + commissionTotal + 50;
  let fixedKobo = preFee >= 2500 ? 10000 : 0;
  let processingKobo = Math.ceil(((preFee * 100 * 0.015) + fixedKobo) / 0.985);
  if (preFee < 2500 && (preFee * 100 + processingKobo) >= 250000) {
    fixedKobo = 10000;
    processingKobo = Math.ceil(((preFee * 100 * 0.015) + fixedKobo) / 0.985);
  }
  return Math.min(processingKobo, 200000) / 100;
}

async function createMarketplaceCheckout(body: Record<string, unknown>) {
  const items = Array.isArray(body.items) ? body.items : [];
  const customerName = String(body.customer_name || "").trim();
  const customerPhone = String(body.customer_phone || "").trim();
  const customerEmail = String(body.customer_email || "").trim().toLowerCase();
  const deliveryAddress = String(body.delivery_address || "").trim();
  if (!items.length || items.length > 30) throw new Error("INVALID_ORDER_DETAILS");
  if (!customerName || !customerPhone || !customerEmail || !deliveryAddress) throw new Error("CUSTOMER_DETAILS_REQUIRED");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) throw new Error("INVALID_CUSTOMER_EMAIL");

  const normalizedItems = items.map((item: Record<string, unknown>) => ({
    product_id: String(item.product_id || ""),
    quantity: Number(item.quantity),
  }));
  if (normalizedItems.some((item: {product_id:string;quantity:number}) =>
    !item.product_id || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 100
  )) throw new Error("INVALID_ORDER_DETAILS");

  const deliveryQuoteId = String(body.delivery_quote_id || "").trim();
  if (!deliveryQuoteId) throw new Error("DELIVERY_QUOTE_REQUIRED");
  const signature = await marketplaceCartSignature(normalizedItems);
  const { data: savedQuote, error: quoteError } = await db.from("sabi_marketplace_delivery_quotes")
    .select("id,cart_signature,delivery_address,expires_at,used_at")
    .eq("id", deliveryQuoteId).maybeSingle();
  if (quoteError || !savedQuote || savedQuote.used_at || new Date(savedQuote.expires_at).getTime() <= Date.now() ||
      savedQuote.cart_signature !== signature || savedQuote.delivery_address !== deliveryAddress) {
    throw new Error("DELIVERY_QUOTE_EXPIRED");
  }

  const { data: checkout, error: checkoutError } = await db.rpc("sabi_create_marketplace_checkout", {
    p_items: normalizedItems,
    p_customer_name: customerName,
    p_customer_phone: customerPhone,
    p_customer_email: customerEmail,
    p_delivery_address: deliveryAddress,
    p_notes: body.notes == null ? null : String(body.notes),
    p_delivery_quote_id: deliveryQuoteId,
  });
  if (checkoutError || !checkout?.success) {
    console.error("Marketplace checkout creation failed:", checkoutError);
    throw new Error(checkoutError?.message || "ORDER_CREATION_FAILED");
  }

  const { data: sellerOrders, error: sellerOrdersError } = await db
    .from("sabi_marketplace_checkout_orders")
    .select("tenant_id,order_id,merchant_name,item_subtotal,delivery_fee,commission_amount,merchant_payout_amount,subaccount_code")
    .eq("checkout_id", checkout.checkout_id)
    .order("created_at", { ascending: true });
  if (sellerOrdersError || !sellerOrders?.length) throw new Error("MARKETPLACE_CHECKOUT_ORDERS_NOT_FOUND");

  // Notify each seller and run inventory alerts without allowing email failures to block checkout.
  for (const seller of sellerOrders) {
    const { data: order } = await db.from("tenant_orders")
      .select("order_number,customer_name")
      .eq("id", seller.order_id).eq("tenant_id", seller.tenant_id).maybeSingle();
    if (order) {
      await sendNewOrderEmails(db, {
        tenantId: seller.tenant_id,
        orderId: seller.order_id,
        orderNumber: order.order_number,
        customerName,
        customerEmail,
        subtotal: Number(seller.item_subtotal),
        deliveryFee: Number(seller.delivery_fee),
        total: Number(seller.item_subtotal) + Number(seller.delivery_fee),
        paymentMethod: "ONLINE",
      });
      await notifyLowStockAfterOrder(seller.tenant_id, seller.order_id);
    }
  }

  const subaccounts = sellerOrders.map((seller: Record<string, unknown>) => ({
    subaccount: String(seller.subaccount_code),
    share: Math.round(Number(seller.merchant_payout_amount) * 100),
  }));
  const allocatedKobo = subaccounts.reduce((sum: number, item: {share:number}) => sum + item.share, 0);
  const expectedKobo = Math.round(Number(checkout.expected_amount) * 100);
  if (!subaccounts.length || subaccounts.some((item: {subaccount:string;share:number}) => !item.subaccount || item.share < 0) || allocatedKobo > expectedKobo) {
    throw new Error("INVALID_MARKETPLACE_SPLIT");
  }

  const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: customerEmail,
      amount: String(expectedKobo),
      currency: "NGN",
      reference: checkout.checkout_reference,
      split: {
        name: checkout.checkout_reference,
        type: "flat",
        currency: "NGN",
        bearer_type: "account",
        subaccounts,
      },
      callback_url: `https://xtopbot.netlify.app/payment-confirmation.html?reference=${encodeURIComponent(checkout.checkout_reference)}&payment=return`,
      metadata: {
        purpose: "SABI_MARKETPLACE_CHECKOUT",
        checkout_id: checkout.checkout_id,
        checkout_reference: checkout.checkout_reference,
        customer_email: customerEmail,
        seller_count: sellerOrders.length,
        item_subtotal: checkout.item_subtotal,
        delivery_total: checkout.delivery_total,
        commission_total: checkout.commission_total,
        customer_service_fee: checkout.customer_service_fee,
        paystack_processing_fee: checkout.paystack_processing_fee,
        expected_amount: checkout.expected_amount,
      },
    }),
  });
  const paystack = await paystackResponse.json();
  if (!paystackResponse.ok || paystack.status !== true || !paystack.data?.authorization_url) {
    console.error("Marketplace Paystack initialization failed:", paystack);
    return respond({
      success: false,
      order_created: true,
      checkout_id: checkout.checkout_id,
      checkout_reference: checkout.checkout_reference,
      orders: checkout.orders,
      error: "PAYMENT_INITIALIZATION_FAILED",
      message: "Your seller orders were created, but Paystack could not start the combined payment. Please contact Sabi support before retrying.",
    }, 502);
  }

  return respond({
    success: true,
    checkout_id: checkout.checkout_id,
    checkout_reference: checkout.checkout_reference,
    seller_count: checkout.seller_count,
    orders: checkout.orders,
    item_subtotal: checkout.item_subtotal,
    delivery_total: checkout.delivery_total,
    commission_total: checkout.commission_total,
    customer_service_fee: checkout.customer_service_fee,
    paystack_processing_fee: checkout.paystack_processing_fee,
    payment_amount: checkout.expected_amount,
    currency: "NGN",
    authorization_url: paystack.data.authorization_url,
    access_code: paystack.data.access_code,
    payment_method: "ONLINE",
  });
}

async function quoteMarketplaceCheckout(body: Record<string, unknown>, req: Request) {
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length || items.length > 30) throw new Error("INVALID_ORDER_DETAILS");
  const normalizedItems = items.map((item: Record<string, unknown>) => ({
    product_id: String(item.product_id || ""),
    quantity: Number(item.quantity),
  }));
  if (normalizedItems.some((item: {product_id:string;quantity:number}) =>
    !item.product_id || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 100
  )) throw new Error("INVALID_ORDER_DETAILS");

  const destinationAddress = String(body.delivery_address || "").trim().slice(0, 1000);
  if (destinationAddress.length < 8) throw new Error("DELIVERY_ADDRESS_REQUIRED");

  const clientIp = req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  let requestFingerprint: string | null = null;
  if (clientIp) {
    requestFingerprint = await sha256Hex(clientIp);
    const since = new Date(Date.now() - 60 * 1000).toISOString();
    const { count, error: rateError } = await db.from("sabi_delivery_quote_attempts")
      .select("id", { count: "exact", head: true })
      .eq("request_fingerprint", requestFingerprint)
      .gte("created_at", since);
    if (rateError) throw new Error("DELIVERY_RATE_CHECK_FAILED");
    if ((count || 0) >= 25) throw new Error("DELIVERY_QUOTE_RATE_LIMITED");
    const { error: attemptError } = await db.from("sabi_delivery_quote_attempts")
      .insert({ request_fingerprint: requestFingerprint });
    if (attemptError) throw new Error("DELIVERY_RATE_CHECK_FAILED");
  }

  const { data: baseQuote, error: baseError } = await db.rpc("sabi_quote_marketplace_checkout", { p_items: normalizedItems });
  if (baseError || !baseQuote?.success) {
    console.warn("Marketplace checkout quote failed:", baseError);
    throw new Error(baseError?.message || "MARKETPLACE_QUOTE_FAILED");
  }

  const sellerIds = (baseQuote.sellers || []).map((seller: any) => String(seller.tenant_id)).filter(Boolean);
  if (!sellerIds.length) throw new Error("MARKETPLACE_SELLERS_NOT_FOUND");
  const [{ data: tenants, error: tenantsError }, { data: preferences, error: prefsError }] = await Promise.all([
    db.from("tenants").select("id,shipping_enabled,shipping_fee").in("id", sellerIds),
    db.from("tenant_delivery_preferences")
      .select("tenant_id,pickup_lat,pickup_lon,base_fee,per_km_fee,minimum_fee,max_delivery_km,pricing_enabled")
      .in("tenant_id", sellerIds),
  ]);
  if (tenantsError || prefsError) throw new Error("DELIVERY_SETTINGS_LOOKUP_FAILED");

  const tenantById = new Map((tenants || []).map((row: any) => [String(row.id), row]));
  const prefByTenant = new Map((preferences || []).map((row: any) => [String(row.tenant_id), row]));
  const routeSummary: any[] = [];
  const deliveryFees: any[] = [];
  const routeCandidates: { seller: any; tenantId: string; tenant: any; pref: any; flatFallback: number }[] = [];
  for (const seller of (baseQuote.sellers || [])) {
    const tenantId = String(seller.tenant_id);
    const tenant: any = tenantById.get(tenantId);
    const pref: any = prefByTenant.get(tenantId);
    const flatFallback = Math.max(0, Number(tenant?.shipping_fee ?? seller.delivery_fee ?? 0));
    if (pref?.pricing_enabled === true && pref.pickup_lat != null && pref.pickup_lon != null &&
        Number.isFinite(Number(pref.pickup_lat)) && Number.isFinite(Number(pref.pickup_lon))) {
      routeCandidates.push({ seller, tenantId, tenant, pref, flatFallback });
    } else if (pref?.pricing_enabled === true && flatFallback <= 0) {
      throw new Error("MERCHANT_PICKUP_LOCATION_NOT_READY");
    }
  }

  let routeDistances: (number | null)[] = [];
  if (routeCandidates.length) {
    try {
      const destination = await geoapifyGeocode(destinationAddress);
      routeDistances = await geoapifyRoadDistances(
        routeCandidates.map(item => ({ lat: Number(item.pref.pickup_lat), lon: Number(item.pref.pickup_lon) })),
        destination
      );
    } catch (error) {
      if (routeCandidates.some(item => item.flatFallback <= 0)) throw error;
      routeDistances = routeCandidates.map(() => null);
    }
  }
  const routeIndex = new Map(routeCandidates.map((item, index) => [item.tenantId, index]));

  for (const seller of (baseQuote.sellers || [])) {
    const tenantId = String(seller.tenant_id);
    const tenant: any = tenantById.get(tenantId);
    const pref: any = prefByTenant.get(tenantId);
    const flatFallback = Math.max(0, Number(tenant?.shipping_fee ?? seller.delivery_fee ?? 0));
    const candidateIndex = routeIndex.get(tenantId);
    let fee = flatFallback;
    let routeKm: number | null = null;
    let calculation = "MERCHANT_FLAT_FALLBACK";

    if (candidateIndex !== undefined) {
      routeKm = routeDistances[candidateIndex] ?? null;
      const maxKm = Math.max(1, Number(pref.max_delivery_km || 100));
      if (routeKm !== null && routeKm <= maxKm) {
        const baseFee = Math.max(0, Number(pref.base_fee || 0));
        const perKm = Math.max(0, Number(pref.per_km_fee || 0));
        const minimum = Math.max(0, Number(pref.minimum_fee || 0));
        fee = Math.ceil(Math.max(minimum, baseFee + routeKm * perKm));
        calculation = "GEOAPIFY_ROAD_DISTANCE";
      } else if (flatFallback <= 0) {
        throw new Error(routeKm === null ? "GEOAPIFY_ROUTE_FAILED" : "DELIVERY_OUTSIDE_MERCHANT_RANGE");
      }
    }

    if (!Number.isFinite(fee) || fee < 0 || fee > 100000000) throw new Error("INVALID_DELIVERY_FEE");
    deliveryFees.push({ tenant_id: tenantId, delivery_fee: fee });
    routeSummary.push({
      tenant_id: tenantId,
      merchant_name: String(seller.merchant_name || "Merchant"),
      distance_km: routeKm === null ? null : Math.round(routeKm * 10) / 10,
      delivery_fee: fee,
      calculation,
      label: calculation === "GEOAPIFY_ROAD_DISTANCE" ? "Road-distance delivery" : "Merchant flat-fee fallback",
    });
  }

  const cartSignature = await marketplaceCartSignature(normalizedItems);
  const { data: quoteRow, error: saveError } = await db.from("sabi_marketplace_delivery_quotes")
    .insert({
      cart_signature: cartSignature,
      delivery_address: destinationAddress,
      delivery_fees: deliveryFees,
      request_fingerprint: requestFingerprint,
      route_summary: routeSummary,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    })
    .select("id,expires_at")
    .single();
  if (saveError || !quoteRow) {
    console.error("Could not persist marketplace delivery quote:", saveError);
    throw new Error("DELIVERY_QUOTE_SAVE_FAILED");
  }

  const deliveryTotal = deliveryFees.reduce((sum, item) => sum + Number(item.delivery_fee), 0);
  const itemSubtotal = Number(baseQuote.item_subtotal || 0);
  const commissionTotal = Number(baseQuote.commission_total || 0);
  const processingFee = marketplaceProcessingFee(itemSubtotal, deliveryTotal, commissionTotal);
  const serviceFee = Number(baseQuote.customer_service_fee ?? 50);
  const expectedAmount = itemSubtotal + deliveryTotal + commissionTotal + serviceFee + processingFee;
  const feeByTenant = new Map(deliveryFees.map(item => [item.tenant_id, item.delivery_fee]));
  const sellers = (baseQuote.sellers || []).map((seller: any) => ({
    ...seller,
    delivery_fee: Number(feeByTenant.get(String(seller.tenant_id)) ?? seller.delivery_fee ?? 0),
    delivery_type: routeSummary.find(route => route.tenant_id === String(seller.tenant_id))?.calculation || "MERCHANT_FLAT_FALLBACK",
    delivery_label: routeSummary.find(route => route.tenant_id === String(seller.tenant_id))?.label || "Merchant flat-fee fallback",
    distance_km: routeSummary.find(route => route.tenant_id === String(seller.tenant_id))?.distance_km ?? null,
  }));

  return respond({
    ...baseQuote,
    quote_id: quoteRow.id,
    quote_expires_at: quoteRow.expires_at,
    sellers,
    delivery_total: deliveryTotal,
    marketplace_fee_total: commissionTotal + serviceFee,
    paystack_processing_fee: processingFee,
    expected_amount: expectedAmount,
    route_summary: routeSummary,
  });
}

async function verifyMarketplaceCheckout(reference: string) {
  const { data: checkout, error: checkoutError } = await db.from("sabi_marketplace_checkouts")
    .select("id,reference,customer_email,currency,status,payment_status,expected_amount,item_subtotal,delivery_total,commission_total,customer_service_fee,paystack_processing_fee")
    .eq("reference", reference).maybeSingle();
  if (checkoutError || !checkout) throw new Error("PAYMENT_REFERENCE_NOT_FOUND");
  if (checkout.status === "PAID") {
    return respond({ success: true, payment_confirmed: true, already_confirmed: true, checkout_id: checkout.id });
  }
  if (checkout.status !== "PENDING") throw new Error("PAYMENT_INTENT_FAILED");

  const verificationResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
  });
  const verification = await verificationResponse.json();
  if (!verificationResponse.ok || verification.status !== true || !verification.data) throw new Error("PAYSTACK_VERIFICATION_FAILED");
  const transaction = verification.data;
  if (transaction.status !== "success") {
    return respond({ success: false, payment_confirmed: false, status: transaction.status || "pending", message: "Payment has not yet been confirmed. You can retry verification." }, 202);
  }
  const metadata = transaction.metadata || {};
  if (
    transaction.reference !== reference ||
    transaction.currency !== checkout.currency ||
    Number(transaction.amount) !== Math.round(Number(checkout.expected_amount) * 100) ||
    String(transaction.customer?.email || "").trim().toLowerCase() !== checkout.customer_email.toLowerCase() ||
    metadata.purpose !== "SABI_MARKETPLACE_CHECKOUT" ||
    metadata.checkout_id !== checkout.id ||
    metadata.checkout_reference !== reference ||
    Number(metadata.expected_amount) !== Number(checkout.expected_amount) ||
    Number(metadata.item_subtotal) !== Number(checkout.item_subtotal) ||
    Number(metadata.delivery_total) !== Number(checkout.delivery_total) ||
    Number(metadata.commission_total) !== Number(checkout.commission_total) ||
    Number(metadata.customer_service_fee) !== Number(checkout.customer_service_fee) ||
    Number(metadata.paystack_processing_fee) !== Number(checkout.paystack_processing_fee)
  ) {
    console.error("Marketplace payment verification mismatch:", reference);
    throw new Error("PAYMENT_DETAILS_MISMATCH");
  }

  const { data: confirmation, error: confirmationError } = await db.rpc("sabi_confirm_marketplace_checkout_payment", {
    p_reference: reference,
    p_paystack_transaction_id: String(transaction.id),
    p_paid_amount: Number(checkout.expected_amount),
    p_currency: checkout.currency,
  });
  if (confirmationError || confirmation?.success !== true) {
    console.error("Marketplace checkout confirmation failed:", confirmationError, confirmation);
    throw new Error("ORDER_PAYMENT_CONFIRMATION_FAILED");
  }

  const { data: sellerOrders } = await db.from("sabi_marketplace_checkout_orders")
    .select("tenant_id,order_id,merchant_name,item_subtotal,delivery_fee")
    .eq("checkout_id", checkout.id);
  for (const seller of sellerOrders || []) {
    const { data: order } = await db.from("tenant_orders").select("order_number,customer_name")
      .eq("id", seller.order_id).eq("tenant_id", seller.tenant_id).maybeSingle();
    if (order && checkout.customer_email) {
      await sendPaymentReceiptEmail(db, {
        tenantId: seller.tenant_id,
        orderId: seller.order_id,
        orderNumber: order.order_number,
        customerEmail: checkout.customer_email,
        customerName: order.customer_name || "",
        amount: Number(seller.item_subtotal) + Number(seller.delivery_fee),
      });
    }
  }
  return respond({ ...confirmation, checkout_reference: reference });
}

async function getMarketplacePaymentDetails(reference: string) {
  const { data: checkout, error } = await db.from("sabi_marketplace_checkouts")
    .select("id,reference,currency,status,payment_status,expected_amount,item_subtotal,delivery_total,created_at")
    .eq("reference", reference).maybeSingle();
  if (error || !checkout) throw new Error("PAYMENT_REFERENCE_NOT_FOUND");
  const { data: sellers } = await db.from("sabi_marketplace_checkout_orders")
    .select("order_id,merchant_name,item_subtotal,delivery_fee")
    .eq("checkout_id", checkout.id);
  return respond({
    success: true,
    payment_confirmed: checkout.payment_status === "PAID",
    payment_status: checkout.payment_status,
    amount: Number(checkout.expected_amount),
    currency: checkout.currency,
    checkout_reference: checkout.reference,
    sellers: (sellers || []).map((seller: Record<string, unknown>) => ({
      order_id: seller.order_id,
      merchant_name: seller.merchant_name,
      subtotal: Number(seller.item_subtotal),
      delivery_fee: Number(seller.delivery_fee),
    })),
  });
}

// AUTHENTICATED MERCHANT PAYMENT INITIALIZATION
async function initializeMerchantOrder(
  req: Request,
  body: Record<string, unknown>,
) {
  const authorization = req.headers.get("Authorization") || "";

  if (!authorization.startsWith("Bearer ")) {
    throw new Error("MERCHANT_AUTH_REQUIRED");
  }

  const accessToken = authorization.slice(7).trim();

  if (!accessToken) {
    throw new Error("MERCHANT_AUTH_REQUIRED");
  }

  // Verify the actual logged-in dashboard user.
  const authClient = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    },
  );

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser(accessToken);

  if (authError || !user) {
    throw new Error("MERCHANT_AUTH_REQUIRED");
  }

  const tenantId = String(body.tenant_id || "").trim();
  const orderId = String(body.order_id || "").trim();

  if (!tenantId || !orderId) {
    throw new Error("MERCHANT_ORDER_DETAILS_REQUIRED");
  }

  // Verify that this user is an active OWNER of this tenant.
  const { data: membership, error: membershipError } = await db
    .from("tenant_members")
    .select("tenant_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .eq("role", "OWNER")
    .eq("is_active", true)
    .maybeSingle();

  if (membershipError || !membership) {
    throw new Error("MERCHANT_NOT_AUTHORIZED");
  }

  // Confirm that the order belongs to this tenant.
  const { data: order, error: orderError } = await db
    .from("tenant_orders")
    .select("id,tenant_id,order_number,status,payment_status")
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (orderError || !order) {
    throw new Error("MERCHANT_ORDER_NOT_FOUND");
  }

  if (order.status === "CANCELLED") {
    throw new Error("MERCHANT_ORDER_CANCELLED");
  }

  if (order.payment_status === "PAID") {
    throw new Error("MERCHANT_ORDER_ALREADY_PAID");
  }

  // Retrieve the payment intent created by the merchant order RPC.
  const { data: intent, error: intentError } = await db
    .from("tenant_order_payment_intents")
    .select(
      "tenant_id,order_id,payment_type,reference,expected_amount,currency,customer_email,status,metadata",
    )
    .eq("tenant_id", tenantId)
    .eq("order_id", orderId)
    .maybeSingle();

  if (intentError || !intent) {
    throw new Error("PAYMENT_INTENT_NOT_FOUND");
  }

  if (intent.status !== "PENDING") {
    throw new Error("PAYMENT_INTENT_NOT_PENDING");
  }

  const metadata = (intent.metadata || {}) as Record<string, unknown>;

  if (metadata.purpose !== "SABI_MERCHANT_ORDER") {
    throw new Error("INVALID_MERCHANT_PAYMENT_INTENT");
  }

  const payment = await initializePaystack(
    intent,
    order.order_number,
    "SABI_MERCHANT_ORDER",
  );

  return respond({
    success: true,
    order_id: order.id,
    order_number: order.order_number,
    payment_reference: payment.reference,
    payment_type: intent.payment_type,
    payment_amount: Number(intent.expected_amount),
    sabi_service_fee: Number(metadata.customer_service_fee),
    currency: intent.currency,
    authorization_url: payment.authorization_url,
    access_code: payment.access_code,
    message: "Paystack payment link created successfully.",
  });
}

// Public-safe order summary for a customer returning from Paystack.
// The payment reference is required; no customer contact or delivery details are exposed.
async function getPublicPaymentDetails(body: Record<string, unknown>) {
  const reference = String(body.reference || "").trim();
  if (!reference) throw new Error("PAYMENT_REFERENCE_REQUIRED");
  const { data: intent, error: intentError } = await db
    .from("tenant_order_payment_intents")
    .select("tenant_id,order_id,reference,expected_amount,currency,status,payment_type")
    .eq("reference", reference).maybeSingle();
  if (intentError || !intent) throw new Error("PAYMENT_REFERENCE_NOT_FOUND");
  const [{ data: order, error: orderError }, { data: tenant, error: tenantError }, { data: whatsapp, error: whatsappError }] =
    await Promise.all([
      db.from("tenant_orders").select("id,order_number,status,payment_status,subtotal,delivery_fee,total,currency")
        .eq("id", intent.order_id).eq("tenant_id", intent.tenant_id).maybeSingle(),
      db.from("tenants").select("business_name,name,logo_url,brand_color,slug")
        .eq("id", intent.tenant_id).maybeSingle(),
      db.from("tenant_whatsapp_accounts").select("display_phone_number,is_active")
        .eq("tenant_id", intent.tenant_id).eq("is_active", true).maybeSingle()
    ]);
  if (orderError || !order || tenantError || !tenant) throw new Error("PAYMENT_REFERENCE_NOT_FOUND");
  if (whatsappError) console.error("Merchant WhatsApp lookup failed:", whatsappError);
  return respond({
    success: true,
    payment_confirmed: intent.status === "COMPLETED",
    payment_status: intent.status,
    amount: Number(intent.expected_amount),
    currency: intent.currency,
    payment_type: intent.payment_type,
    order: {
      order_number: order.order_number, status: order.status, payment_status: order.payment_status,
      subtotal: Number(order.subtotal || 0), delivery_fee: Number(order.delivery_fee || 0),
      total: Number(order.total || 0), currency: order.currency
    },
    merchant: {
      name: tenant.business_name || tenant.name || "Merchant",
      logo_url: tenant.logo_url || null, brand_color: tenant.brand_color || null, slug: tenant.slug || null,
      whatsapp_phone: whatsapp?.display_phone_number || null
    }
  });
}

// VERIFY PAYMENT DIRECTLY WITH PAYSTACK
async function verifyOrderPayment(body: Record<string, unknown>) {
  const reference = String(body.reference || "").trim();

  if (!reference) {
    throw new Error("PAYMENT_REFERENCE_REQUIRED");
  }

  const { data: intent, error: intentError } = await db
    .from("tenant_order_payment_intents")
    .select(
      "tenant_id,order_id,payment_type,reference,expected_amount,currency,customer_email,status,metadata",
    )
    .eq("reference", reference)
    .maybeSingle();

  if (intentError || !intent) {
    throw new Error("PAYMENT_REFERENCE_NOT_FOUND");
  }

  // A pending Paystack reference must not revive a cancelled order.
  const { data: order, error: orderError } = await db
    .from("tenant_orders")
    .select("status")
    .eq("id", intent.order_id)
    .eq("tenant_id", intent.tenant_id)
    .maybeSingle();

  if (orderError || !order) {
    throw new Error("PAYMENT_REFERENCE_NOT_FOUND");
  }

  if (order.status === "CANCELLED") {
    throw new Error("MERCHANT_ORDER_CANCELLED");
  }

  if (intent.status === "FAILED") {
    throw new Error("PAYMENT_INTENT_FAILED");
  }

  if (intent.status === "COMPLETED") {
    return respond({
      success: true,
      payment_confirmed: true,
      already_confirmed: true,
      order_id: intent.order_id,
      message: "This payment has already been confirmed.",
    });
  }

  const verificationResponse = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      },
    },
  );

  const verification = await verificationResponse.json();

  if (
    !verificationResponse.ok ||
    verification.status !== true ||
    !verification.data
  ) {
    throw new Error("PAYSTACK_VERIFICATION_FAILED");
  }

  const transaction = verification.data;

  if (transaction.status !== "success") {
    return respond({
      success: false,
      payment_confirmed: false,
      status: transaction.status || "pending",
      message:
        "Payment has not yet been confirmed. You can retry verification.",
    }, 202);
  }

  const expectedKobo = Math.round(
    Number(intent.expected_amount) * 100,
  );

  const metadata = transaction.metadata || {};
  const intentMetadata = (intent.metadata || {}) as Record<
    string,
    unknown
  >;
  const expectedPurpose = intentMetadata.purpose;

  const validPurpose = [
    "SABI_PUBLIC_ORDER",
    "SABI_MERCHANT_ORDER",
  ].includes(String(expectedPurpose));

  const expectedCommission = Number(
    intentMetadata.merchant_commission_amount,
  );
  const expectedServiceFee = Number(
    intentMetadata.customer_service_fee,
  );
  const expectedTransactionCharge = Number(
    intentMetadata.xtop_transaction_charge,
  );
  const expectedPaystackFee = Number(intentMetadata.paystack_processing_fee);
  const expectedBasis = Number(
    intentMetadata.commission_basis_amount,
  );

  if (
    transaction.reference !== reference ||
    transaction.currency !== intent.currency ||
    Number(transaction.amount) !== expectedKobo ||
    String(transaction.customer?.email || "")
      .trim()
      .toLowerCase() !== intent.customer_email.toLowerCase() ||
    !validPurpose ||
    metadata.purpose !== expectedPurpose ||
    metadata.tenant_id !== intent.tenant_id ||
    metadata.order_id !== intent.order_id ||
    metadata.payment_type !== intent.payment_type ||
    metadata.payment_reference !== reference ||
    Number(metadata.merchant_commission_amount) !==
      expectedCommission ||
    Number(metadata.customer_service_fee) !== expectedServiceFee ||
    Number(metadata.xtop_transaction_charge) !==
      expectedTransactionCharge ||
    Number(metadata.paystack_processing_fee) !== expectedPaystackFee ||
    Number(metadata.commission_basis_amount) !== expectedBasis ||
    expectedServiceFee !== 50 ||
    !Number.isFinite(expectedPaystackFee) || expectedPaystackFee < 0 ||
    expectedTransactionCharge !==
      expectedCommission + expectedServiceFee + expectedPaystackFee
  ) {
    console.error("Payment verification mismatch:", reference);
    throw new Error("PAYMENT_DETAILS_MISMATCH");
  }

  // Secure database confirmation.
  // The database records the split-settlement charge exactly once.
  const { data: confirmation, error: confirmationError } =
    await db.rpc("sabi_confirm_order_payment", {
      p_reference: reference,
      p_paystack_transaction_id: String(transaction.id),
      p_paid_amount: Number(intent.expected_amount),
      p_currency: intent.currency,
    });

  if (confirmationError || confirmation?.success !== true) {
    console.error(
      "Order payment confirmation failed:",
      confirmationError,
      confirmation,
    );
    throw new Error("ORDER_PAYMENT_CONFIRMATION_FAILED");
  }

  // The verified customer email is stored on the payment intent, not tenant_orders.
  // Do not select customer_email from tenant_orders: that column does not exist.
  const { data: paidOrder, error: paidOrderError } = await db.from("tenant_orders")
    .select("order_number,customer_name")
    .eq("id", intent.order_id)
    .eq("tenant_id", intent.tenant_id)
    .maybeSingle();

  if (paidOrderError) {
    console.error("Could not load paid order details for receipt email:", paidOrderError);
  }

  const receiptEmail = String(intent.customer_email || "").trim();
  if (paidOrder && receiptEmail) {
    await sendPaymentReceiptEmail(db, {
      tenantId: intent.tenant_id,
      orderId: intent.order_id,
      orderNumber: paidOrder.order_number,
      customerEmail: receiptEmail,
      customerName: paidOrder.customer_name || "",
      amount: Number(intent.expected_amount),
    });
  }

  return respond(confirmation);
}

// Send a customer status email only after an authenticated merchant changes their own order.
async function notifyOrderStatus(req: Request, body: Record<string, unknown>) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new Error("MERCHANT_AUTH_REQUIRED");
  const accessToken = authorization.slice(7).trim();
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken);
  if (authError || !user) throw new Error("MERCHANT_AUTH_REQUIRED");

  const tenantId = String(body.tenant_id || "");
  const orderId = String(body.order_id || "");
  const status = String(body.status || "").toUpperCase();
  if (!tenantId || !orderId || !["DISPATCHED", "COMPLETED", "CANCELLED"].includes(status)) {
    throw new Error("MERCHANT_ORDER_DETAILS_REQUIRED");
  }
  const { data: membership } = await db.from("tenant_members").select("tenant_id")
    .eq("tenant_id", tenantId).eq("user_id", user.id)
    .eq("role", "OWNER").eq("is_active", true).maybeSingle();
  if (!membership) throw new Error("MERCHANT_NOT_AUTHORIZED");

  const { data: order } = await db.from("tenant_orders").select("status")
    .eq("tenant_id", tenantId).eq("id", orderId).maybeSingle();
  if (!order || String(order.status).toUpperCase() !== status) {
    throw new Error("MERCHANT_ORDER_NOT_FOUND");
  }
  const sent = await sendOrderStatusEmail(db, tenantId, orderId, status as "DISPATCHED" | "COMPLETED" | "CANCELLED");
  return respond({ success: true, email_sent: sent });
}

// REQUEST ROUTER
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return fail("Method not allowed.", 405);
  }

  if (
    !SUPABASE_URL ||
    !SERVICE_ROLE_KEY ||
    !SUPABASE_ANON_KEY ||
    !PAYSTACK_SECRET_KEY
  ) {
    console.error("Order API environment configuration is incomplete.");
    return fail("Order payment service is not configured.", 500);
  }

  try {
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "create") {
      return await createOrder(body);
    }

    if (action === "create_cart") {
      return await createCartOrder(body);
    }

    if (action === "create_marketplace_checkout") {
      return await createMarketplaceCheckout(body);
    }

    if (action === "quote_marketplace_checkout") {
      return await quoteMarketplaceCheckout(body, req);
    }

    if (action === "initialize_merchant") {
      return await initializeMerchantOrder(req, body);
    }

    if (action === "payment_details") {
      const reference = String(body.reference || "").trim();
      if (reference.startsWith("SABI-MKT-")) return await getMarketplacePaymentDetails(reference);
      return await getPublicPaymentDetails(body);
    }

    if (action === "verify") {
      const reference = String(body.reference || "").trim();
      if (reference.startsWith("SABI-MKT-")) return await verifyMarketplaceCheckout(reference);
      return await verifyOrderPayment(body);
    }

    if (action === "notify_status") {
      return await notifyOrderStatus(req, body);
    }

    return fail("Unknown order action.", 404);
  } catch (error) {
    console.error("Sabi order API error:", error);

    const message = error instanceof Error ? error.message : "";

    const messages: Record<string, string> = {
      INVALID_ORDER_DETAILS:
        "Please check the selected product and quantity.",
      DELIVERY_ADDRESS_REQUIRED:
        "Enter your complete delivery state, city and street address to calculate delivery.",
      DELIVERY_QUOTE_RATE_LIMITED:
        "Too many delivery calculations were requested. Please wait one minute and try again.",
      DELIVERY_RATE_CHECK_FAILED:
        "Sabi could not validate the delivery request. Please try again.",
      DELIVERY_QUOTE_REQUIRED:
        "Your delivery quote is missing. Recalculate delivery before paying.",
      DELIVERY_QUOTE_EXPIRED:
        "Your delivery quote has expired or the address changed. Please recalculate delivery.",
      DELIVERY_QUOTE_CART_MISMATCH:
        "Your cart changed after delivery was calculated. Please recalculate delivery.",
      DELIVERY_QUOTE_SELLER_MISSING:
        "A seller delivery amount is missing. Please recalculate delivery or contact support.",
      DELIVERY_QUOTE_SAVE_FAILED:
        "Sabi could not save the delivery calculation. Please try again.",
      DELIVERY_SETTINGS_LOOKUP_FAILED:
        "Sabi could not load one seller's delivery settings. Please try again.",
      GEOAPIFY_NOT_CONFIGURED:
        "Sabi's road-distance service is not configured. A merchant flat delivery fee may still be available.",
      GEOAPIFY_GEOCODE_FAILED:
        "We could not locate the delivery address right now. Check the address and try again.",
      GEOAPIFY_ROUTE_FAILED:
        "We could not calculate the road route. Please check the address and try again.",
      DELIVERY_DESTINATION_NOT_FOUND:
        "We could not locate that delivery address in Nigeria. Add a clearer street, area, city and state.",
      DELIVERY_OUTSIDE_MERCHANT_RANGE:
        "The delivery address is outside this seller's configured delivery range.",
      MERCHANT_PICKUP_LOCATION_NOT_READY:
        "A seller has not verified its pickup address. Ask the seller to update Delivery Settings.",
      MERCHANT_DELIVERY_NOT_CONFIGURED:
        "This shop has not configured a delivery fee. Please contact the shop before placing the order.",
      INVALID_DELIVERY_FEE:
        "The delivery charge returned by the seller is invalid. Please contact support.",
      MARKETPLACE_SELLERS_NOT_FOUND:
        "The sellers in this cart could not be verified. Please refresh your cart.",
      MARKETPLACE_SELLER_DELIVERY_NOT_CONFIGURED:
        "A seller in your cart has not enabled delivery. Remove that seller’s products or ask the seller to configure delivery before checkout.",
      CUSTOMER_DETAILS_REQUIRED:
        "Please complete all required customer details.",
      INVALID_CUSTOMER_EMAIL:
        "Please enter a valid email address.",
      INVALID_PAYMENT_METHOD:
        "The selected payment method is invalid.",
      ORDER_CREATION_FAILED:
        "The order could not be created. Check product availability and try again.",
      PAYMENT_INTENT_NOT_FOUND:
        "Payment request could not be found.",
      PAYMENT_REFERENCE_REQUIRED:
        "Payment reference is required.",
      PAYMENT_REFERENCE_NOT_FOUND:
        "Payment reference was not found.",
      PAYMENT_INTENT_FAILED:
        "This payment request has failed.",
      PAYMENT_INTENT_NOT_PENDING:
        "This payment request is no longer pending.",
      PAYMENT_INITIALIZATION_FAILED:
        "Paystack could not create the payment link. Please retry.",
      INVALID_PAYSTACK_FEE_SNAPSHOT:
        "The order payment fee calculation is invalid. Please contact support.",
      MERCHANT_SUBACCOUNT_NOT_VERIFIED:
        "This merchant has not completed Paystack account verification. Please contact the merchant.",
      PAYMENT_DETAILS_MISMATCH:
        "Payment validation failed. Please contact support.",
      PAYSTACK_VERIFICATION_FAILED:
        "Could not verify payment with Paystack. Please retry.",
      ORDER_PAYMENT_CONFIRMATION_FAILED:
        "Payment was verified, but order confirmation needs retry. Please contact support.",
      MERCHANT_AUTH_REQUIRED:
        "Please log in again to continue.",
      MERCHANT_ORDER_DETAILS_REQUIRED:
        "Merchant tenant and order details are required.",
      MERCHANT_NOT_AUTHORIZED:
        "You are not authorized to process this merchant order.",
      MERCHANT_ORDER_NOT_FOUND:
        "The merchant order could not be found.",
      MERCHANT_ORDER_CANCELLED:
        "Cancelled orders cannot receive payments.",
      MERCHANT_ORDER_ALREADY_PAID:
        "This order has already been paid.",
      INVALID_MERCHANT_PAYMENT_INTENT:
        "This payment request is not a merchant dashboard order.",
    };

    const status =
      message === "DELIVERY_QUOTE_RATE_LIMITED" ? 429 :
      message === "PAYMENT_REFERENCE_NOT_FOUND" ||
      message === "MERCHANT_ORDER_NOT_FOUND" ? 404 :
      message === "MERCHANT_AUTH_REQUIRED" ? 401 :
      message === "MERCHANT_NOT_AUTHORIZED" ? 403 :
      message === "PAYMENT_INITIALIZATION_FAILED" ||
      message === "PAYSTACK_VERIFICATION_FAILED" ||
      message === "GEOAPIFY_GEOCODE_FAILED" ||
      message === "GEOAPIFY_ROUTE_FAILED" ||
      message === "GEOAPIFY_NOT_CONFIGURED" ? 502 :
      message === "ORDER_PAYMENT_CONFIRMATION_FAILED" ? 503 :
      400;

    return fail(
      messages[message] || "An unexpected order payment error occurred.",
      status,
    );
  }
});
