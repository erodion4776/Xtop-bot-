
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

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function fail(error: string, status = 400) {
  return respond({ success: false, error }, status);
}

async function paystackRequest(
  path: string,
  method = "GET",
  body?: Record<string, unknown>,
) {
  const response = await fetch(`https://api.paystack.co${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await response.json();

  if (!response.ok || data.status !== true) {
    console.error("Paystack API error:", data);
    throw new Error("PAYSTACK_REQUEST_FAILED");
  }

  return data.data;
}

async function authenticateOwner(req: Request, tenantId: string) {
  const authorization = req.headers.get("Authorization") || "";

  if (!authorization.startsWith("Bearer ")) {
    throw new Error("AUTH_REQUIRED");
  }

  const token = authorization.slice(7).trim();

  const authClient = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  );

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser(token);

  if (authError || !user) {
    throw new Error("AUTH_REQUIRED");
  }

  const { data: membership, error } = await db
    .from("tenant_members")
    .select("tenant_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .eq("role", "OWNER")
    .eq("is_active", true)
    .maybeSingle();

  if (error || !membership) {
    throw new Error("OWNER_ACCESS_REQUIRED");
  }

  return user;
}

function normalizeName(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

async function resolveAccount(
  accountNumber: string,
  bankCode: string,
) {
  if (!/^\d{10}$/.test(accountNumber)) {
    throw new Error("INVALID_ACCOUNT_NUMBER");
  }

  if (!/^\d{2,6}$/.test(bankCode)) {
    throw new Error("INVALID_BANK_CODE");
  }

  const query = new URLSearchParams({
    account_number: accountNumber,
    bank_code: bankCode,
  });

  return await paystackRequest(
    `/bank/resolve?${query.toString()}`,
  );
}

async function listBanks() {
  const query = new URLSearchParams({
    country: "nigeria",
    use_cursor: "false",
    perPage: "100",
  });

  const banks = await paystackRequest(
    `/bank?${query.toString()}`,
  );

  return (Array.isArray(banks) ? banks : [])
    .filter((bank: any) => bank.active !== false)
    .map((bank: any) => ({
      name: bank.name,
      code: String(bank.code),
      type: bank.type || null,
    }))
    .sort((a: any, b: any) =>
      a.name.localeCompare(b.name)
    );
}

async function resolveMerchantAccount(
  req: Request,
  body: Record<string, unknown>,
) {
  const tenantId = String(body.tenant_id || "").trim();
  const accountNumber = String(body.account_number || "").trim();
  const bankCode = String(body.bank_code || "").trim();

  if (!tenantId) throw new Error("TENANT_REQUIRED");

  await authenticateOwner(req, tenantId);

  const account = await resolveAccount(accountNumber, bankCode);

  return respond({
    success: true,
    account_name: account.account_name,
    account_number: account.account_number,
    bank_id: account.bank_id,
    message: "Bank account resolved successfully.",
  });
}

async function createMerchantSubaccount(
  req: Request,
  body: Record<string, unknown>,
) {
  const tenantId = String(body.tenant_id || "").trim();
  const accountNumber = String(body.account_number || "").trim();
  const bankCode = String(body.bank_code || "").trim();
  const confirmedName = String(
    body.confirmed_account_name || "",
  ).trim();

  if (!tenantId || !confirmedName) {
    throw new Error("BANK_DETAILS_REQUIRED");
  }

  await authenticateOwner(req, tenantId);

  const { data: tenant, error: tenantError } = await db
    .from("tenants")
    .select(
      "id,name,business_name,contact_name,contact_email,contact_phone,paystack_subaccount_code,paystack_subaccount_status",
    )
    .eq("id", tenantId)
    .eq("is_active", true)
    .maybeSingle();

  if (tenantError || !tenant) {
    throw new Error("TENANT_NOT_FOUND");
  }

  if (tenant.paystack_subaccount_code) {
    return respond({
      success: true,
      already_configured: true,
      status: tenant.paystack_subaccount_status,
      message: "A Paystack subaccount is already registered.",
    });
  }

  if (
    tenant.paystack_subaccount_status !== "NOT_CONFIGURED"
  ) {
    throw new Error("SUBACCOUNT_SETUP_IN_PROGRESS");
  }

  // Resolve again on the server immediately before creation.
  const account = await resolveAccount(accountNumber, bankCode);

  if (
    normalizeName(account.account_name) !==
    normalizeName(confirmedName)
  ) {
    throw new Error("ACCOUNT_NAME_CONFIRMATION_MISMATCH");
  }

  // Reserve this tenant's setup to prevent duplicate creation.
  const { data: reserved, error: reserveError } = await db
    .from("tenants")
    .update({
      paystack_subaccount_status: "CREATING",
    })
    .eq("id", tenantId)
    .is("paystack_subaccount_code", null)
    .eq("paystack_subaccount_status", "NOT_CONFIGURED")
    .select("id")
    .maybeSingle();

  if (reserveError || !reserved) {
    throw new Error("SUBACCOUNT_SETUP_IN_PROGRESS");
  }

  let subaccount: any;

  try {
    subaccount = await paystackRequest(
      "/subaccount",
      "POST",
      {
        business_name:
          tenant.business_name || tenant.name,
        settlement_bank: bankCode,
        account_number: accountNumber,

        // Fixed Sabi commission is applied at transaction
        // initialization, not through a percentage split.
        percentage_charge: 0,

        description: "Sabi by XTOP merchant settlement",

        primary_contact_name:
          tenant.contact_name || account.account_name,

        primary_contact_email:
          tenant.contact_email || undefined,

        primary_contact_phone:
          tenant.contact_phone || undefined,

        metadata: JSON.stringify({
          tenant_id: tenantId,
          platform: "Sabi by XTOP",
        }),
      },
    );
  } catch (error) {
    // A network timeout can occur after Paystack creates
    // the subaccount. Do not automatically retry and create
    // a duplicate. Flag it for reconciliation.
    const message = error instanceof Error ? error.message : "";

    await db
      .from("tenants")
      .update({
        paystack_subaccount_status:
          message === "PAYSTACK_REQUEST_FAILED"
            ? "NOT_CONFIGURED"
            : "CREATION_REVIEW",
      })
      .eq("id", tenantId);

    throw error;
  }

  const subaccountCode = String(
    subaccount.subaccount_code || "",
  );

  if (!subaccountCode) {
    await db
      .from("tenants")
      .update({
        paystack_subaccount_status: "CREATION_REVIEW",
      })
      .eq("id", tenantId);

    throw new Error("SUBACCOUNT_CODE_MISSING");
  }

  const verified = subaccount.is_verified === true;

  const { error: saveError } = await db
    .from("tenants")
    .update({
      paystack_subaccount_code: subaccountCode,
      paystack_subaccount_status: verified
        ? "VERIFIED"
        : "PENDING_VERIFICATION",
      paystack_subaccount_verified_at: verified
        ? new Date().toISOString()
        : null,
    })
    .eq("id", tenantId);

  if (saveError) {
    console.error("Subaccount database save failed:", saveError);

    await db
      .from("tenants")
      .update({
        paystack_subaccount_status: "CREATION_REVIEW",
      })
      .eq("id", tenantId);

    throw new Error("SUBACCOUNT_SAVE_FAILED");
  }

  return respond({
    success: true,
    subaccount_created: true,
    status: verified ? "VERIFIED" : "PENDING_VERIFICATION",
    account_name: subaccount.account_name || account.account_name,
    bank_name: subaccount.settlement_bank || null,
    account_last_four: accountNumber.slice(-4),
    message: verified
      ? "Your merchant payout account is verified."
      : "Your subaccount was created and is awaiting Paystack verification.",
  });
}

async function refreshSubaccountStatus(
  req: Request,
  body: Record<string, unknown>,
) {
  const tenantId = String(body.tenant_id || "").trim();

  if (!tenantId) throw new Error("TENANT_REQUIRED");

  await authenticateOwner(req, tenantId);

  const { data: tenant, error } = await db
    .from("tenants")
    .select(
      "paystack_subaccount_code,paystack_subaccount_status",
    )
    .eq("id", tenantId)
    .maybeSingle();

  if (error || !tenant) {
    throw new Error("TENANT_NOT_FOUND");
  }

  if (!tenant.paystack_subaccount_code) {
    return respond({
      success: true,
      status: tenant.paystack_subaccount_status,
      configured: false,
    });
  }

  const subaccount = await paystackRequest(
    `/subaccount/${encodeURIComponent(
      tenant.paystack_subaccount_code,
    )}`,
  );

  const verified = subaccount.is_verified === true;

  const status = verified
    ? "VERIFIED"
    : subaccount.active === false
      ? "INACTIVE"
      : "PENDING_VERIFICATION";

  const { error: updateError } = await db
    .from("tenants")
    .update({
      paystack_subaccount_status: status,
      paystack_subaccount_verified_at: verified
        ? new Date().toISOString()
        : null,
    })
    .eq("id", tenantId);

  if (updateError) {
    throw new Error("STATUS_UPDATE_FAILED");
  }

  return respond({
    success: true,
    configured: true,
    status,
    account_name: subaccount.account_name || null,
    bank_name: subaccount.settlement_bank || null,
    account_last_four: String(
      subaccount.account_number || "",
    ).slice(-4),
  });
}

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
    return fail("Payment service is not configured.", 500);
  }

  try {
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "banks") {
      return respond({
        success: true,
        banks: await listBanks(),
      });
    }

    if (action === "resolve") {
      return await resolveMerchantAccount(req, body);
    }

    if (action === "create_subaccount") {
      return await createMerchantSubaccount(req, body);
    }

    if (action === "status") {
      return await refreshSubaccountStatus(req, body);
    }

    return fail("Unknown action.", 404);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "";

    const messages: Record<string, string> = {
      AUTH_REQUIRED: "Please log in again.",
      OWNER_ACCESS_REQUIRED:
        "Only the merchant account owner can manage payout details.",
      TENANT_REQUIRED: "Merchant account is required.",
      TENANT_NOT_FOUND: "Merchant account was not found.",
      INVALID_ACCOUNT_NUMBER:
        "Enter a valid 10-digit bank account number.",
      INVALID_BANK_CODE: "Select a valid bank.",
      BANK_DETAILS_REQUIRED:
        "Complete the bank details and confirm the account name.",
      ACCOUNT_NAME_CONFIRMATION_MISMATCH:
        "The verified account name has changed. Please verify it again.",
      SUBACCOUNT_SETUP_IN_PROGRESS:
        "Subaccount registration is already in progress or needs review.",
      SUBACCOUNT_CODE_MISSING:
        "Paystack did not return a subaccount code.",
      SUBACCOUNT_SAVE_FAILED:
        "Paystack created the subaccount, but saving it failed. Contact support before retrying.",
      STATUS_UPDATE_FAILED:
        "Could not update the Paystack verification status.",
      PAYSTACK_REQUEST_FAILED:
        "Paystack could not complete the request. Please retry later.",
      CREATION_REVIEW:
        "Subaccount registration needs support review before retrying.",
    };

    const status =
      message === "AUTH_REQUIRED" ? 401 :
      message === "OWNER_ACCESS_REQUIRED" ? 403 :
      message === "TENANT_NOT_FOUND" ? 404 :
      message === "PAYSTACK_REQUEST_FAILED" ? 502 :
      message === "SUBACCOUNT_SAVE_FAILED" ? 503 : 400;

    console.error("Merchant Paystack API error:", message);

    return fail(
      messages[message] || "Unable to process payout account details.",
      status,
    );
  }
});
