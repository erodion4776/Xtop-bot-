
// supabase/functions/whatsapp-webhook/whatsapp.ts

import { safeErrorLog } from "./utils.ts";

const WA_API_BASE = "https://graph.facebook.com/v21.0";

// =====================================================
// TYPES
// =====================================================

export interface WhatsAppCredentials {
  phoneNumberId: string;
  accessToken: string;
}

export interface IncomingMessage {
  from: string;
  messageId: string;
  timestamp: string;
  type: string;
  text: string;
  profileName: string;
  phoneNumberId?: string;
  displayPhoneNumber?: string;
  wabaId?: string;
  interactiveType?: string;
  interactiveId?: string;
  interactiveTitle?: string;
}

export interface WhatsAppButton {
  type: "reply";
  reply: {
    id: string;
    title: string;
  };
}

export interface WhatsAppListRow {
  id: string;
  title: string;
  description?: string;
}

export interface WhatsAppListSection {
  title: string;
  rows: WhatsAppListRow[];
}

// =====================================================
// CREDENTIAL RESOLUTION
// =====================================================

function getSystemCredentials(): WhatsAppCredentials {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

  if (!accessToken || !phoneNumberId) {
    throw new Error("Missing system WhatsApp credentials.");
  }

  return {
    accessToken,
    phoneNumberId,
  };
}

function resolveCredentials(
  credentials?: WhatsAppCredentials,
): WhatsAppCredentials {
  // Explicit tenant credentials must never fall back to XTOP credentials.
  if (credentials !== undefined) {
    if (
      !credentials.phoneNumberId?.trim() ||
      !credentials.accessToken?.trim()
    ) {
      throw new Error("Incomplete tenant WhatsApp credentials.");
    }

    return {
      phoneNumberId: credentials.phoneNumberId.trim(),
      accessToken: credentials.accessToken.trim(),
    };
  }

  // System credentials are used only by existing system-level calls.
  return getSystemCredentials();
}

// =====================================================
// WEBHOOK PARSER
// =====================================================

export function parseWebhookPayload(
  body: Record<string, unknown>,
): IncomingMessage | null {
  try {
    const entry = (body.entry as Array<Record<string, unknown>>)?.[0];
    if (!entry) return null;

    const changes = entry.changes as Array<Record<string, unknown>>;
    const change = changes?.[0];
    if (!change) return null;

    const value = change.value as Record<string, unknown>;
    if (!value) return null;

    const messages = value.messages as Array<Record<string, unknown>>;
    if (!messages?.length) return null;

    const msg = messages[0];

    const contacts = value.contacts as Array<Record<string, unknown>>;
    const contact = contacts?.[0];

    const profile = contact?.profile as Record<string, unknown> | undefined;

    const metadata = value.metadata as Record<string, unknown> | undefined;

    const type = String(msg.type || "");
    let text = "";
    let interactiveType: string | undefined;
    let interactiveId: string | undefined;
    let interactiveTitle: string | undefined;

    if (type === "text") {
      const textObject = msg.text as Record<string, unknown>;
      text = String(textObject?.body || "");
    } else if (type === "interactive") {
      const interactive = msg.interactive as Record<string, unknown>;

      interactiveType = String(interactive?.type || "");

      if (interactiveType === "button_reply") {
        const reply = interactive?.button_reply as Record<string, unknown>;

        interactiveId = String(reply?.id || "");
        interactiveTitle = String(reply?.title || "");
        text = interactiveId || interactiveTitle;
      } else if (interactiveType === "list_reply") {
        const reply = interactive?.list_reply as Record<string, unknown>;

        interactiveId = String(reply?.id || "");
        interactiveTitle = String(reply?.title || "");
        text = interactiveId || interactiveTitle;
      }
    } else if (type === "button") {
      const button = msg.button as Record<string, unknown>;

      text = String(button?.text || button?.payload || "");
    } else if (type === "image") {
      text = "[Image received]";
    } else if (type === "document") {
      text = "[Document received]";
    } else if (type === "audio") {
      text = "[Audio received]";
    } else if (type === "video") {
      text = "[Video received]";
    } else if (type === "location") {
      text = "[Location received]";
    } else if (type === "sticker") {
      text = "[Sticker received]";
    }

    const from = String(msg.from || "");
    const messageId = String(msg.id || "");

    if (!from || !messageId) return null;

    return {
      from,
      messageId,
      timestamp: String(msg.timestamp || ""),
      type,
      text,
      profileName: String(profile?.name || ""),
      phoneNumberId: String(metadata?.phone_number_id || ""),
      displayPhoneNumber: String(metadata?.display_phone_number || ""),
      wabaId: String(value.metadata
        ? (metadata as Record<string, unknown>).waba_id || ""
        : ""),
      interactiveType,
      interactiveId,
      interactiveTitle,
    };
  } catch (err) {
    safeErrorLog("parseWebhookPayload", err);
    return null;
  }
}

// =====================================================
// CORE WHATSAPP SENDER
// =====================================================

async function sendToWhatsApp(
  payload: Record<string, unknown>,
  credentials?: WhatsAppCredentials,
): Promise<string | null> {
  let resolved: WhatsAppCredentials;

  try {
    resolved = resolveCredentials(credentials);
  } catch (err) {
    safeErrorLog("sendToWhatsApp.credentials", err);
    return null;
  }

  const url =
    `${WA_API_BASE}/${encodeURIComponent(resolved.phoneNumberId)}/messages`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolved.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();

      safeErrorLog(
        "sendToWhatsApp.response",
        new Error(`${response.status}: ${errorBody}`),
      );

      return null;
    }

    const data = await response.json();

    return data?.messages?.[0]?.id || null;
  } catch (err) {
    safeErrorLog("sendToWhatsApp", err);
    return null;
  }
}

// =====================================================
// TEXT MESSAGE
// =====================================================

export async function sendTextMessage(
  to: string,
  body: string,
  credentials?: WhatsAppCredentials,
): Promise<string | null> {
  return sendToWhatsApp(
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body,
      },
    },
    credentials,
  );
}

// =====================================================
// IMAGE MESSAGE
// =====================================================

export async function sendImageMessage(
  to: string,
  imageUrl: string,
  caption?: string,
  credentials?: WhatsAppCredentials,
): Promise<string | null> {
  return sendToWhatsApp(
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "image",
      image: {
        link: imageUrl,
        ...(caption ? { caption } : {}),
      },
    },
    credentials,
  );
}

// =====================================================
// BUTTON MESSAGE
// =====================================================

export async function sendButtonMessage(
  to: string,
  body: string,
  buttons: WhatsAppButton[],
  header?: string,
  footer?: string,
  credentials?: WhatsAppCredentials,
): Promise<string | null> {
  const safeButtons = buttons.slice(0, 3).map((button) => ({
    type: "reply",
    reply: {
      id: button.reply.id.substring(0, 256),
      title: button.reply.title.substring(0, 20),
    },
  }));

  if (!safeButtons.length) {
    safeErrorLog(
      "sendButtonMessage",
      new Error("At least one button is required."),
    );
    return null;
  }

  const interactive: Record<string, unknown> = {
    type: "button",
    body: { text: body },
    action: {
      buttons: safeButtons,
    },
  };

  if (header) {
    interactive.header = {
      type: "text",
      text: header.substring(0, 60),
    };
  }

  if (footer) {
    interactive.footer = {
      text: footer.substring(0, 60),
    };
  }

  return sendToWhatsApp(
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive,
    },
    credentials,
  );
}

// =====================================================
// LIST MESSAGE
// =====================================================

export async function sendListMessage(
  to: string,
  body: string,
  buttonText: string,
  sections: WhatsAppListSection[],
  header?: string,
  footer?: string,
  credentials?: WhatsAppCredentials,
): Promise<string | null> {
  let totalRows = 0;

  const safeSections = [];

  for (const section of sections) {
    if (totalRows >= 10) break;

    const remaining = 10 - totalRows;

    const rows = section.rows.slice(0, remaining).map((row) => ({
      id: row.id.substring(0, 200),
      title: row.title.substring(0, 24),
      ...(row.description
        ? { description: row.description.substring(0, 72) }
        : {}),
    }));

    if (rows.length > 0) {
      safeSections.push({
        title: section.title.substring(0, 24),
        rows,
      });

      totalRows += rows.length;
    }
  }

  if (!totalRows) {
    safeErrorLog(
      "sendListMessage",
      new Error("At least one list row is required."),
    );
    return null;
  }

  const interactive: Record<string, unknown> = {
    type: "list",
    body: { text: body },
    action: {
      button: buttonText.substring(0, 20),
      sections: safeSections,
    },
  };

  if (header) {
    interactive.header = {
      type: "text",
      text: header.substring(0, 60),
    };
  }

  if (footer) {
    interactive.footer = {
      text: footer.substring(0, 60),
    };
  }

  return sendToWhatsApp(
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive,
    },
    credentials,
  );
}

// =====================================================
// DOCUMENT MESSAGE
// =====================================================

export async function sendDocumentMessage(
  to: string,
  documentUrl: string,
  filename: string,
  caption?: string,
  credentials?: WhatsAppCredentials,
): Promise<string | null> {
  return sendToWhatsApp(
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "document",
      document: {
        link: documentUrl,
        filename: filename.substring(0, 240),
        ...(caption ? { caption } : {}),
      },
    },
    credentials,
  );
}

// =====================================================
// MARK MESSAGE AS READ
// =====================================================

export async function markAsRead(
  messageId: string,
  credentials?: WhatsAppCredentials,
): Promise<void> {
  try {
    await sendToWhatsApp(
      {
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      },
      credentials,
    );
  } catch (err) {
    safeErrorLog("markAsRead", err);
  }
}

// =====================================================
// BUTTON / LIST HELPERS
// =====================================================

export function makeButton(
  id: string,
  title: string,
): WhatsAppButton {
  return {
    type: "reply",
    reply: {
      id: id.substring(0, 256),
      title: title.substring(0, 20),
    },
  };
}

export function makeListRow(
  id: string,
  title: string,
  description?: string,
): WhatsAppListRow {
  return {
    id: id.substring(0, 200),
    title: title.substring(0, 24),
    description: description?.substring(0, 72),
  };
}

// =====================================================
// TENANT TEXT MESSAGE
// =====================================================

export async function sendTenantTextMessage(
  to: string,
  body: string,
  tenantPhoneNumberId: string,
  tenantAccessToken: string,
): Promise<string | null> {
  if (!tenantPhoneNumberId || !tenantAccessToken) {
    safeErrorLog(
      "sendTenantTextMessage",
      new Error("Tenant phone number ID and access token are required."),
    );

    return null;
  }

  return sendTextMessage(to, body, {
    phoneNumberId: tenantPhoneNumberId,
    accessToken: tenantAccessToken,
  });
}
