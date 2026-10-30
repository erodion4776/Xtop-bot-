
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY")!;

const MIN_TOPUP_NGN = 500;
const MAX_TOPUP_NGN = 5_000_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const db = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

function response(
  data: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(
  message: string,
  status = 400,
): Response {
  return response({ success: false, error: message }, status);
}

function makeReference(): string {
  return `SABI-${crypto.randomUUID().replaceAll("-", "")}`;
}

async function getAuthenticatedUser(req: Request) {
  const authorization = req.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Authentication required.");
  }

  const token = authorization.slice(7);

  const {
    data: { user },
    error,
  } = await db.auth.getUser(token);

  if (error || !user) {
    throw new Error("Invalid or expired login session.");
  }

  return user;
}

async function verifyTenantMembership(
  userId: string,
  tenantId: string,
) {
  const { data: membership, error } = await db
    .from("tenant_members")
    .select("tenant_id, user_id, role, is_active")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !membership) {
    throw new Error("You do not have access to this merchant account.");
  }

  const { data: tenant, error: tenantError } = await db
    .from("tenants")
    .select("id, is_active, contact_email, contact_name, business_name")
    .eq("id", tenantId)
    .eq("is_system", false)
    .maybeSingle();

  if (tenantError || !tenant || !tenant.is_active) {
    throw new Error("Merchant account is unavailable.");
  }

  return { membership, tenant };
}

async function initializeTopup(
  req: Request,
): Promise<Response> {
  const user = await getAuthenticatedUser(req);

  const body = await req.json();

  const tenantId = String(body.tenant_id || "");
  const amount = Number(body.amount);

  if (!tenantId) {
    return errorResponse("Merchant account is required.");
  }

  if (
    !Number.isSafeInteger(amount) ||
    amount < MIN_TOPUP_NGN ||
    amount > MAX_TOPUP_NGN
  ) {
    return errorResponse(
      `Top-up must be between ₦${MIN_TOPUP_NGN.toLocaleString("en-NG")} and ₦${MAX_TOPUP_NGN.toLocaleString("en-NG")}.`,
    );
  }

  const { tenant } = await verifyTenantMembership(
    user.id,
    tenantId,
  );

  const email =
    String(user.email || tenant.contact_email || "")
      .trim()
      .toLowerCase();

  if (!email || !email.includes("@")) {
    return errorResponse(
      "A valid email address is required for Paystack payment.",
    );
  }

  const { data: wallet, error: walletError } = await db
    .from("tenant_wallets")
    .select("id, balance, status")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (walletError || !wallet) {
    return errorResponse(
      "Merchant wallet was not found. Please contact support.",
      404,
    );
  }

  const reference = makeReference();

  // Create the pending intent before requesting payment.
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
        merchant_name: tenant.business_name || tenant.contact_name || "",
        initiated_by: user.id,
      },
    });

  if (insertError) {
    console.error("Top-up intent insert failed:", insertError);
    return errorResponse("Could not create payment request.", 500);
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
        metadata: {
          purpose: "SABI_MERCHANT_WALLET_TOPUP",
          initialization_error: paystackData.message || "Paystack error",
        },
        updated_at: new Date().toISOString(),
      })
      .eq("reference", reference);

    console.error("Paystack initialization failed:", paystackData);

    return errorResponse(
      "Paystack could not initialize this payment. Please try again.",
      502,
    );
  }

  return response({
    success: true,
    authorization_url: paystackData.data.authorization_url,
    access_code: paystackData.data.access_code,
    reference,
    amount,
    currency: "NGN",
  });
}

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
    throw new Error("Could not verify Paystack transaction.");
  }

  return data.data;
}

async function creditVerifiedTopup(
  reference: string,
): Promise<{ success: boolean; message: string }> {
  const { data: intent, error } = await db
    .from("wallet_topup_intents")
    .select("*")
    .eq("reference", reference)
    .maybeSingle();

  if (error || !intent) {
    throw new Error("Wallet payment reference was not found.");
  }

  if (intent.status === "COMPLETED") {
    return {
      success: true,
      message: "Wallet top-up was already credited.",
    };
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
    throw new Error(
      "Paystack transaction details do not match the wallet payment.",
    );
  }

  const metadata = transaction.metadata || {};

  if (
    metadata.purpose !== "SABI_MERCHANT_WALLET_TOPUP" ||
    metadata.tenant_id !== intent.tenant_id ||
    metadata.wallet_topup_reference !== reference
  ) {
    throw new Error("Wallet payment metadata validation failed.");
  }

  // The database function handles wallet locking and idempotency.
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
    throw new Error("Payment verified but wallet credit needs retry.");
  }

  if (
    creditResult &&
    creditResult.success === false
  ) {
    throw new Error(
      creditResult.message || "Wallet credit was not completed.",
    );
  }

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
    // A retry is safe because the wallet credit uses an idempotency key.
    console.error("Top-up intent update failed:", updateError);
  }

  return {
    success: true,
    message: "Wallet successfully credited.",
  };
}

async function verifyTopupForMerchant(
  req: Request,
): Promise<Response> {
  const user = await getAuthenticatedUser(req);
  const body = await req.json();

  const tenantId = String(body.tenant_id || "");
  const reference = String(body.reference || "");

  if (!tenantId || !reference) {
    return errorResponse("Merchant account and payment reference are required.");
  }

  await verifyTenantMembership(user.id, tenantId);

  const { data: intent, error } = await db
    .from("wallet_topup_intents")
    .select("tenant_id, reference")
    .eq("tenant_id", tenantId)
    .eq("reference", reference)
    .maybeSingle();

  if (error || !intent) {
    return errorResponse("Payment reference not found.", 404);
  }

  const result = await creditVerifiedTopup(reference);

  return response(result, result.success ? 200 : 202);
}

async function verifyWebhookSignature(
  rawBody: Uint8Array,
  signature: string,
): Promise<boolean> {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(PAYSTACK_SECRET_KEY),
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

  if (expected.length !== signature.length) return false;

  let difference = 0;

  for (let i = 0; i < expected.length; i++) {
    difference |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }

  return difference === 0;
}

async function handlePaystackWebhook(
  req: Request,
): Promise<Response> {
  const signature = req.headers.get("x-paystack-signature") || "";

  if (!signature) {
    return errorResponse("Missing Paystack signature.", 401);
  }

  const rawBody = new Uint8Array(await req.arrayBuffer());

  const validSignature = await verifyWebhookSignature(
    rawBody,
    signature,
  );

  if (!validSignature) {
    return errorResponse("Invalid Paystack signature.", 401);
  }

  let event: any;

  try {
    event = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return errorResponse("Invalid webhook payload.");
  }

  // We only credit successful Paystack transactions.
  if (event.event !== "charge.success") {
    return response({ received: true, ignored: true });
  }

  const reference = String(event.data?.reference || "");

  if (!reference) {
    return errorResponse("Missing payment reference.");
  }

  try {
    const result = await creditVerifiedTopup(reference);

    if (!result.success) {
      // Do not acknowledge an unconfirmed payment as processed.
      return response(
        { received: true, credited: false, message: result.message },
        202,
      );
    }

    return response({
      received: true,
      credited: true,
      message: result.message,
    });
  } catch (error) {
    console.error("Paystack webhook processing error:", error);

    // Non-2xx allows Paystack to retry the event.
    return response(
      { received: false, error: "Wallet credit processing failed." },
      500,
    );
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed.", 405);
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !PAYSTACK_SECRET_KEY
  ) {
    console.error("Wallet API environment configuration is incomplete.");
    return errorResponse("Wallet service is not configured.", 500);
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

    return errorResponse("Unknown wallet action.", 404);
  } catch (error) {
    console.error("Wallet API error:", error);

    const message =
      error instanceof Error ? error.message : "Unexpected server error.";

    const status =
      message.includes("Authentication") ||
      message.includes("login session")
        ? 401
        : message.includes("access to this merchant")
          ? 403
          : 400;

    return errorResponse(message, status);
  }
});
