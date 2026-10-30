
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY")!;

const MIN_TOPUP_NGN = 500;
const MAX_TOPUP_NGN = 5_000_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
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

function makeReference(): string {
  return `SABI-${crypto.randomUUID().replaceAll("-", "")}`;
}

async function getAuthenticatedUser(req: Request) {
  const authorization = req.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("AUTH_REQUIRED");
  }

  const token = authorization.slice(7);

  const { data, error } = await db.auth.getUser(token);

  if (error || !data.user) {
    throw new Error("INVALID_SESSION");
  }

  return data.user;
}

async function verifyTenantMembership(
  userId: string,
  tenantId: string,
) {
  const { data: membership, error } = await db
    .from("tenant_members")
    .select("tenant_id,user_id,role,is_active")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !membership) {
    throw new Error("TENANT_ACCESS_DENIED");
  }

  const { data: tenant, error: tenantError } = await db
    .from("tenants")
    .select(
      "id,is_active,is_system,contact_email,contact_name,business_name",
    )
    .eq("id", tenantId)
    .eq("is_system", false)
    .maybeSingle();

  if (
    tenantError ||
    !tenant ||
    tenant.is_active !== true
  ) {
    throw new Error("TENANT_UNAVAILABLE");
  }

  return { membership, tenant };
}

async function getMerchantWallet(tenantId: string) {
  const { data: wallet, error } = await db
    .from("tenant_wallets")
    .select("id,tenant_id,balance,status,low_balance_threshold")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !wallet) {
    throw new Error("WALLET_NOT_FOUND");
  }

  if (wallet.status === "PAUSED") {
    throw new Error("WALLET_PAUSED");
  }

  return wallet;
}

// ==========================================
// 1. INITIALIZE MERCHANT WALLET TOP-UP
// ==========================================

async function initializeTopup(req: Request): Promise<Response> {
  const user = await getAuthenticatedUser(req);
  const body = await req.json();

  const tenantId = String(body.tenant_id || "");
  const amount = Number(body.amount);

  if (!tenantId) {
    return fail("Merchant account is required.");
  }

  if (
    !Number.isSafeInteger(amount) ||
    amount < MIN_TOPUP_NGN ||
    amount > MAX_TOPUP_NGN
  ) {
    return fail(
      `Top-up must be between ₦${MIN_TOPUP_NGN.toLocaleString("en-NG")} and ₦${MAX_TOPUP_NGN.toLocaleString("en-NG")}.`,
    );
  }

  const { tenant } = await verifyTenantMembership(
    user.id,
    tenantId,
  );

  const wallet = await getMerchantWallet(tenantId);

  const email = String(
    user.email || tenant.contact_email || "",
  ).trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail("A valid email address is required.");
  }

  const reference = makeReference();

  const { error: insertError } = await db
    .from("wallet_topup_intents")
    .insert({
      tenant_id: tenantId,
      reference,
      amount,
      currency: "NGN",
      status: "PENDING",
      customer_email: email,
      metadata: {
        purpose: "SABI_MERCHANT_WALLET_TOPUP",
        merchant_name:
          tenant.business_name || tenant.contact_name || "",
        initiated_by: user.id,
      },
    });

  if (insertError) {
    console.error("Top-up intent insert failed:", insertError);
    return fail("Could not create payment request.", 500);
  }

  try {
    const paystackResponse = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          amount: String(amount * 100),
          currency: "NGN",
          reference,
          metadata: {
            purpose: "SABI_MERCHANT_WALLET_TOPUP",
            tenant_id: tenantId,
            wallet_topup_reference: reference,
          },
        }),
      },
    );

    const paystackData = await paystackResponse.json();

    if (!paystackResponse.ok || !paystackData.status) {
      await db
        .from("wallet_topup_intents")
        .update({
          status: "FAILED",
          paystack_status: "initialization_failed",
          updated_at: new Date().toISOString(),
        })
        .eq("reference", reference);

      console.error("Paystack initialization failed:", paystackData);

      return fail(
        "Paystack could not initialize this payment. Please try again.",
        502,
      );
    }

    return respond({
      success: true,
      authorization_url:
        paystackData.data.authorization_url,
      access_code: paystackData.data.access_code,
      reference,
      amount,
      currency: "NGN",
      wallet_balance: wallet.balance,
    });
  } catch (error) {
    console.error("Paystack initialization error:", error);

    await db
      .from("wallet_topup_intents")
      .update({
        paystack_status: "initialization_error",
        updated_at: new Date().toISOString(),
      })
      .eq("reference", reference);

    return fail("Payment service is temporarily unavailable.", 502);
  }
}

// ==========================================
// 2. VERIFY PAYMENT DIRECTLY WITH PAYSTACK
// ==========================================

async function verifyPaystackTransaction(reference: string) {
  const result = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      },
    },
  );

  const data = await result.json();

  if (!result.ok || !data.status || !data.data) {
    throw new Error("PAYSTACK_VERIFICATION_FAILED");
  }

  return data.data;
}

// ==========================================
// 3. CREDIT VERIFIED MERCHANT WALLET
// ==========================================

async function creditVerifiedTopup(reference: string) {
  const { data: intent, error } = await db
    .from("wallet_topup_intents")
    .select("*")
    .eq("reference", reference)
    .maybeSingle();

  if (error || !intent) {
    throw new Error("PAYMENT_REFERENCE_NOT_FOUND");
  }

  if (intent.status === "COMPLETED") {
    return {
      success: true,
      message: "Wallet top-up was already credited.",
      already_processed: true,
    };
  }

  if (intent.status === "FAILED") {
    throw new Error("PAYMENT_INTENT_FAILED");
  }

  const transaction = await verifyPaystackTransaction(reference);

  if (transaction.status !== "success") {
    await db
      .from("wallet_topup_intents")
      .update({
        paystack_status: transaction.status || "unknown",
        updated_at: new Date().toISOString(),
      })
      .eq("reference", reference);

    return {
      success: false,
      message: "Payment has not been confirmed as successful.",
    };
  }

  const expectedKobo = Math.round(Number(intent.amount) * 100);

  if (
    transaction.reference !== reference ||
    transaction.currency !== "NGN" ||
    Number(transaction.amount) !== expectedKobo ||
    String(transaction.customer?.email || "").toLowerCase() !==
      String(intent.customer_email).toLowerCase()
  ) {
    throw new Error("PAYMENT_DETAILS_MISMATCH");
  }

  const metadata = transaction.metadata || {};

  if (
    metadata.purpose !== "SABI_MERCHANT_WALLET_TOPUP" ||
    metadata.tenant_id !== intent.tenant_id ||
    metadata.wallet_topup_reference !== reference
  ) {
    throw new Error("PAYMENT_METADATA_MISMATCH");
  }

  // Database handles wallet locking and idempotency.
  const { data: creditResult, error: creditError } = await db.rpc(
    "sabi_credit_wallet",
    {
      p_tenant_id: intent.tenant_id,
      p_amount: Number(intent.amount),
      p_reference: reference,
      p_idempotency_key: `PAYSTACK:${reference}`,
    },
  );

  if (creditError) {
    console.error("Wallet credit failed:", creditError);
    throw new Error("WALLET_CREDIT_RETRY_REQUIRED");
  }

  if (creditResult?.success !== true) {
    throw new Error("WALLET_CREDIT_NOT_CONFIRMED");
  }

  // A retry remains safe because the SQL function is idempotent.
  const { error: updateError } = await db
    .from("wallet_topup_intents")
    .update({
      status: "COMPLETED",
      paystack_status: "success",
      paystack_transaction_id: String(transaction.id),
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("reference", reference);

  if (updateError) {
    console.error("Intent completion update failed:", updateError);
  }

  return {
    success: true,
    message: "Wallet successfully credited.",
    already_processed: creditResult.reason === "ALREADY_PROCESSED",
  };
}

// ==========================================
// 4. MERCHANT PAYMENT VERIFICATION
// ==========================================

async function verifyTopupForMerchant(
  req: Request,
): Promise<Response> {
  const user = await getAuthenticatedUser(req);
  const body = await req.json();

  const tenantId = String(body.tenant_id || "");
  const reference = String(body.reference || "");

  if (!tenantId || !reference) {
    return fail("Merchant account and payment reference are required.");
  }

  await verifyTenantMembership(user.id, tenantId);

  const { data: intent, error } = await db
    .from("wallet_topup_intents")
    .select("tenant_id,reference")
    .eq("tenant_id", tenantId)
    .eq("reference", reference)
    .maybeSingle();

  if (error || !intent) {
    return fail("Payment reference not found.", 404);
  }

  const result = await creditVerifiedTopup(reference);

  return respond(result, result.success ? 200 : 202);
}

// ==========================================
// 5. VERIFY PAYSTACK WEBHOOK SIGNATURE
// ==========================================

async function verifyWebhookSignature(
  rawBody: Uint8Array,
  signature: string,
): Promise<boolean> {
  if (!/^[a-fA-F0-9]{128}$/.test(signature)) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(PAYSTACK_SECRET_KEY),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );

  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    rawBody,
  );

  const expected = Array.from(new Uint8Array(signed))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  const supplied = signature.toLowerCase();

  let difference = 0;

  for (let i = 0; i < expected.length; i++) {
    difference |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  }

  return difference === 0;
}

// ==========================================
// 6. PAYSTACK WEBHOOK
// ==========================================

async function handlePaystackWebhook(
  req: Request,
): Promise<Response> {
  const signature =
    req.headers.get("x-paystack-signature") || "";

  const rawBody = new Uint8Array(await req.arrayBuffer());

  const valid = await verifyWebhookSignature(
    rawBody,
    signature,
  );

  if (!valid) {
    return fail("Invalid Paystack signature.", 401);
  }

  let event: any;

  try {
    event = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return fail("Invalid webhook payload.");
  }

  if (event.event !== "charge.success") {
    return respond({
      received: true,
      ignored: true,
    });
  }

  const reference = String(event.data?.reference || "");

  if (!reference) {
    return fail("Missing payment reference.");
  }

  try {
    const result = await creditVerifiedTopup(reference);

    if (!result.success) {
      return respond({
        received: true,
        credited: false,
        message: result.message,
      }, 202);
    }

    return respond({
      received: true,
      credited: true,
      message: result.message,
    });
  } catch (error) {
    console.error("Webhook processing failed:", error);

    // Paystack can retry failed webhook delivery.
    return fail("Payment processing requires retry.", 500);
  }
}

// ==========================================
// 7. MAIN REQUEST ROUTER
// ==========================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return fail("Method not allowed.", 405);
  }

  if (
    !SUPABASE_URL ||
    !SERVICE_ROLE_KEY ||
    !PAYSTACK_SECRET_KEY
  ) {
    console.error("Wallet API environment configuration is incomplete.");
    return fail("Wallet service is not configured.", 500);
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    if (action === "initialize") {
      return await initializeTopup(req);
    }

    if (action === "verify") {
      return await verifyTopupForMerchant(req);
    }

    if (action === "webhook") {
      return await handlePaystackWebhook(req);
    }

    return fail("Unknown wallet action.", 404);
  } catch (error) {
    console.error("Wallet API error:", error);

    if (error instanceof Error) {
      switch (error.message) {
        case "AUTH_REQUIRED":
        case "INVALID_SESSION":
          return fail("Please log in again.", 401);

        case "TENANT_ACCESS_DENIED":
          return fail("You do not have access to this merchant account.", 403);

        case "TENANT_UNAVAILABLE":
          return fail("Merchant account is unavailable.", 403);

        case "WALLET_NOT_FOUND":
          return fail("Merchant wallet was not found.", 404);

        case "WALLET_PAUSED":
          return fail("Your merchant wallet is paused. Contact support.", 403);

        case "PAYMENT_REFERENCE_NOT_FOUND":
          return fail("Payment reference not found.", 404);

        case "PAYMENT_INTENT_FAILED":
          return fail("This payment request has failed.", 400);

        case "PAYSTACK_VERIFICATION_FAILED":
          return fail("Could not verify payment with Paystack. Please retry.", 502);

        case "PAYMENT_DETAILS_MISMATCH":
        case "PAYMENT_METADATA_MISMATCH":
          return fail("Payment validation failed. Contact support.", 400);

        case "WALLET_CREDIT_RETRY_REQUIRED":
          return fail("Payment verified but wallet credit needs retry.", 503);

        default:
          break;
      }
    }

    return fail("An unexpected wallet service error occurred.", 500);
  }
});
