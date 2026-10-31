
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY")!;

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

function getPaymentCallback(orderId: string): string {
  return `https://xtopbot.netlify.app/?order=${encodeURIComponent(orderId)}&payment=return`;
}

// INITIALIZE PAYSTACK FROM AN EXISTING PAYMENT INTENT
async function initializePaystack(
  intent: Record<string, unknown>,
  orderNumber: string,
  purpose: string,
) {
  const reference = String(intent.reference);
  const tenantId = String(intent.tenant_id);
  const orderId = String(intent.order_id);
  const paymentType = String(intent.payment_type);

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
        amount: String(
          Math.round(Number(intent.expected_amount) * 100),
        ),
        currency: intent.currency,
        reference,
        callback_url: getPaymentCallback(orderId),
        metadata: {
          purpose,
          tenant_id: tenantId,
          order_id: orderId,
          payment_type: paymentType,
          payment_reference: reference,
          order_number: orderNumber,
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

  const { data: intent, error: intentError } = await db
    .from("tenant_order_payment_intents")
    .select(
      "tenant_id,order_id,payment_type,reference,expected_amount,currency,customer_email",
    )
    .eq("reference", order.payment_reference)
    .single();

  if (intentError || !intent) {
    console.error("Payment intent lookup failed:", intentError);
    throw new Error("PAYMENT_INTENT_NOT_FOUND");
  }

  let payment;

  try {
    payment = await initializePaystack(
      intent,
      order.order_number,
      "SABI_PUBLIC_ORDER",
    );
  } catch (error) {
    console.error("Public Paystack initialization failed:", error);

    return respond({
      success: false,
      order_created: true,
      order_id: order.order_id,
      order_number: order.order_number,
      error: "PAYMENT_INITIALIZATION_FAILED",
      message:
        "Your order was created, but payment could not start. Please contact the merchant before trying again.",
    }, 502);
  }

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
    currency: intent.currency,
    authorization_url: payment.authorization_url,
    access_code: payment.access_code,
    customer_confirmation_token: order.customer_confirmation_token,
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

  const metadata = intent.metadata || {};

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
    currency: intent.currency,
    authorization_url: payment.authorization_url,
    access_code: payment.access_code,
    message: "Paystack payment link created successfully.",
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
  const expectedPurpose = intent.metadata?.purpose;

  const validPurpose = [
    "SABI_PUBLIC_ORDER",
    "SABI_MERCHANT_ORDER",
  ].includes(expectedPurpose);

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
    metadata.payment_reference !== reference
  ) {
    console.error("Payment verification mismatch:", reference);
    throw new Error("PAYMENT_DETAILS_MISMATCH");
  }

  // Secure database confirmation and commission processing.
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

  return respond(confirmation);
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

    if (action === "initialize_merchant") {
      return await initializeMerchantOrder(req, body);
    }

    if (action === "verify") {
      return await verifyOrderPayment(body);
    }

    return fail("Unknown order action.", 404);
  } catch (error) {
    console.error("Sabi order API error:", error);

    const message = error instanceof Error ? error.message : "";

    const messages: Record<string, string> = {
      INVALID_ORDER_DETAILS:
        "Please check the selected product and quantity.",
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
      message === "PAYMENT_REFERENCE_NOT_FOUND" ||
      message === "MERCHANT_ORDER_NOT_FOUND" ? 404 :
      message === "MERCHANT_AUTH_REQUIRED" ? 401 :
      message === "MERCHANT_NOT_AUTHORIZED" ? 403 :
      message === "PAYMENT_INITIALIZATION_FAILED" ||
      message === "PAYSTACK_VERIFICATION_FAILED" ? 502 :
      message === "ORDER_PAYMENT_CONFIRMATION_FAILED" ? 503 : 400;

    return fail(
      messages[message] || "An unexpected order payment error occurred.",
      status,
    );
  }
});
