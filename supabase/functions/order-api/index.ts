8
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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

// CREATE ORDER AND INITIALIZE PAYSTACK
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

  // Supabase calculates all prices and reserves stock.
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

  // Initialize Paystack using the amount stored in Supabase.
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
                reference: intent.reference,
        callback_url: `https://xtopbot.netlify.app/?product=${encodeURIComponent(productId)}&payment=return`,
        metadata: {
          purpose: "SABI_PUBLIC_ORDER",
          tenant_id: intent.tenant_id,
          order_id: intent.order_id,
          payment_type: intent.payment_type,
          payment_reference: intent.reference,
          order_number: order.order_number,
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
    payment_reference: intent.reference,
    payment_type: intent.payment_type,
    payment_method: paymentMethod,
    subtotal: order.subtotal,
    delivery_fee: order.delivery_fee,
    total: order.total,
    payment_amount: Number(intent.expected_amount),
    currency: intent.currency,
    authorization_url: paystackData.data.authorization_url,
    access_code: paystackData.data.access_code,
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
      "tenant_id,order_id,payment_type,reference,expected_amount,currency,customer_email,status",
    )
    .eq("reference", reference)
    .maybeSingle();

  if (intentError || !intent) {
    throw new Error("PAYMENT_REFERENCE_NOT_FOUND");
  }

  if (intent.status === "FAILED") {
    throw new Error("PAYMENT_INTENT_FAILED");
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

  if (
    transaction.reference !== reference ||
    transaction.currency !== intent.currency ||
    Number(transaction.amount) !== expectedKobo ||
    String(transaction.customer?.email || "")
      .trim()
      .toLowerCase() !== intent.customer_email.toLowerCase() ||
    metadata.purpose !== "SABI_PUBLIC_ORDER" ||
    metadata.tenant_id !== intent.tenant_id ||
    metadata.order_id !== intent.order_id ||
    metadata.payment_type !== intent.payment_type ||
    metadata.payment_reference !== reference
  ) {
    console.error("Payment verification mismatch:", reference);
    throw new Error("PAYMENT_DETAILS_MISMATCH");
  }

  // Secure database confirmation and commission deduction.
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

    if (action === "verify") {
      return await verifyOrderPayment(body);
    }

    return fail("Unknown order action.", 404);
  } catch (error) {
    console.error("Sabi order API error:", error);

    const message = error instanceof Error ? error.message : "";

    const messages: Record<string, string> = {
      INVALID_ORDER_DETAILS: "Please check the selected product and quantity.",
      CUSTOMER_DETAILS_REQUIRED: "Please complete all required customer details.",
      INVALID_CUSTOMER_EMAIL: "Please enter a valid email address.",
      INVALID_PAYMENT_METHOD: "The selected payment method is invalid.",
      ORDER_CREATION_FAILED:
        "The order could not be created. Check product availability and try again.",
      PAYMENT_INTENT_NOT_FOUND: "Payment request could not be found.",
      PAYMENT_REFERENCE_REQUIRED: "Payment reference is required.",
      PAYMENT_REFERENCE_NOT_FOUND: "Payment reference was not found.",
      PAYMENT_INTENT_FAILED: "This payment request has failed.",
      PAYSTACK_VERIFICATION_FAILED:
        "Could not verify payment with Paystack. Please retry.",
      PAYMENT_DETAILS_MISMATCH:
        "Payment validation failed. Please contact support.",
      ORDER_PAYMENT_CONFIRMATION_FAILED:
        "Payment was verified, but order confirmation needs retry. Please contact support.",
    };

    const status =
      message === "PAYMENT_REFERENCE_NOT_FOUND" ? 404 :
      message === "PAYMENT_INTENT_FAILED" ? 400 :
      message === "PAYSTACK_VERIFICATION_FAILED" ? 502 :
      message === "ORDER_PAYMENT_CONFIRMATION_FAILED" ? 503 : 400;

    return fail(
      messages[message] || "An unexpected order payment error occurred.",
      status,
    );
  }
});
