
const GRAPH_API = "https://graph.facebook.com/v21.0";

interface MetaAccount {
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhone: string;
  verifiedName: string;
}

function getConfig() {
  const appId = Deno.env.get("META_APP_ID") || "1947931015867084";
  const appSecret = Deno.env.get("META_APP_SECRET") || "";

  if (!appId || !appSecret) {
    throw new Error("Meta application credentials are missing.");
  }

  return { appId, appSecret };
}

async function parseResponse(response: Response): Promise<any> {
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.error) {
    throw new Error(
      data?.error?.message || `Meta API request failed (${response.status}).`
    );
  }

  return data;
}

async function graphRequest(
  path: string,
  accessToken: string,
  method = "GET"
): Promise<any> {
  if (!accessToken) {
    throw new Error("Missing Meta access token.");
  }

  const url = new URL(`${GRAPH_API}${path}`);

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  return await parseResponse(response);
}

export async function exchangeAuthCode(
  authCode: string,
  wabaId: string,
  phoneNumberId: string
): Promise<MetaAccount> {
  if (!authCode || !wabaId || !phoneNumberId) {
    throw new Error("Missing authorization code, WABA ID or phone number ID.");
  }

  const { appId, appSecret } = getConfig();

  // Exchange Embedded Signup authorization code.
  const tokenUrl = new URL(`${GRAPH_API}/oauth/access_token`);

  tokenUrl.searchParams.set("client_id", appId);
  tokenUrl.searchParams.set("client_secret", appSecret);
  tokenUrl.searchParams.set("code", authCode);

  const tokenResponse = await fetch(tokenUrl.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const tokenData = await parseResponse(tokenResponse);

  const customerToken = tokenData.access_token;

  if (!customerToken) {
    throw new Error("Meta did not return a customer access token.");
  }

  // Verify the exact selected WhatsApp Business Account.
  const waba = await graphRequest(
    `/${encodeURIComponent(wabaId)}?fields=id`,
    customerToken
  );

  if (String(waba.id) !== String(wabaId)) {
    throw new Error("WhatsApp Business Account verification failed.");
  }

  // Retrieve phone numbers belonging to this exact WABA.
  const phoneData = await graphRequest(
    `/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name&limit=100`,
    customerToken
  );

  const phone = (phoneData.data || []).find(
    (item: any) => String(item.id) === String(phoneNumberId)
  );

  if (!phone) {
    throw new Error(
      "The selected phone number does not belong to this WhatsApp Business Account."
    );
  }

  return {
    accessToken: customerToken,
    wabaId: String(wabaId),
    phoneNumberId: String(phoneNumberId),
    displayPhone: phone.display_phone_number || "",
    verifiedName: phone.verified_name || "",
  };
}

export async function subscribeWebhook(
  wabaId: string,
  customerToken: string
): Promise<boolean> {
  try {
    if (!wabaId || !customerToken) {
      throw new Error("Missing WABA ID or customer access token.");
    }

    const result = await graphRequest(
      `/${encodeURIComponent(wabaId)}/subscribed_apps`,
      customerToken,
      "POST"
    );

    return result?.success === true;
  } catch (error) {
    console.error(
      "[Meta Embedded Signup] Webhook subscription failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return false;
  }
}
