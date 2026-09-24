// supabase/functions/whatsapp-webhook/whatsapp.ts

import { safeErrorLog } from "./utils.ts";

export interface IncomingMessage {
  from: string;
  messageId: string;
  timestamp: string;
  type: string;
  text: string;
  profileName: string;
  interactiveType?: string;
  interactiveId?: string;
  interactiveTitle?: string;
}

export interface WhatsAppButton {
  type: "reply";
  reply: {
    id: string;
    title: string; // Max 20 chars
  };
}

export interface WhatsAppListRow {
  id: string;
  title: string;        // Max 24 chars
  description?: string; // Max 72 chars
}

export interface WhatsAppListSection {
  title: string;        // Max 24 chars
  rows: WhatsAppListRow[];
}

export function parseWebhookPayload(body: Record<string, unknown>): IncomingMessage | null {
  try {
    const entry = (body.entry as Array<Record<string, unknown>>)?.[0];
    if (!entry) return null;

    const changes = (entry.changes as Array<Record<string, unknown>>)?.[0];
    if (!changes) return null;

    const value = changes.value as Record<string, unknown>;
    if (!value) return null;

    const messages = value.messages as Array<Record<string, unknown>>;
    if (!messages || messages.length === 0) return null;

    const msg = messages[0];
    const contacts = value.contacts as Array<Record<string, unknown>>;
    const profileName = contacts?.[0]?.profile
      ? ((contacts[0].profile as Record<string, unknown>).name as string) || ""
      : "";

    const type = msg.type as string;
    let text = "";
    let interactiveType: string | undefined;
    let interactiveId: string | undefined;
    let interactiveTitle: string | undefined;

    if (type === "text") {
      text = ((msg.text as Record<string, unknown>)?.body as string) || "";
    } else if (type === "interactive") {
      const interactive = msg.interactive as Record<string, unknown>;
      interactiveType = interactive?.type as string;

      if (interactiveType === "button_reply") {
        const reply = interactive.button_reply as Record<string, unknown>;
        interactiveId = reply?.id as string;
        interactiveTitle = reply?.title as string;
        text = interactiveId || interactiveTitle || "";
      } else if (interactiveType === "list_reply") {
        const reply = interactive.list_reply as Record<string, unknown>;
        interactiveId = reply?.id as string;
        interactiveTitle = reply?.title as string;
        text = interactiveId || interactiveTitle || "";
      }
    } else if (type === "button") {
      const button = msg.button as Record<string, unknown>;
      text = (button?.text as string) || (button?.payload as string) || "";
    }

    return {
      from: msg.from as string,
      messageId: msg.id as string,
      timestamp: msg.timestamp as string,
      type,
      text,
      profileName,
      interactiveType,
      interactiveId,
      interactiveTitle,
    };
  } catch (err) {
    safeErrorLog("parseWebhookPayload", err);
    return null;
  }
}

const WA_API_BASE = "https://graph.facebook.com/v21.0";

function getHeaders(): Record<string, string> {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  if (!token) throw new Error("Missing WHATSAPP_ACCESS_TOKEN");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function getPhoneNumberId(): string {
  const id = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!id) throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID");
  return id;
}

async function sendToWhatsApp(payload: Record<string, unknown>): Promise<string | null> {
  const phoneNumberId = getPhoneNumberId();
  const url = `${WA_API_BASE}/${phoneNumberId}/messages`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      safeErrorLog("sendToWhatsApp:response", new Error(`${resp.status}: ${errBody}`));
      return null;
    }

    const data = await resp.json();
    return data?.messages?.[0]?.id || null;
  } catch (err) {
    safeErrorLog("sendToWhatsApp", err);
    return null;
  }
}

export async function sendTextMessage(to: string, body: string): Promise<string | null> {
  return sendToWhatsApp({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body },
  });
}

export async function sendImageMessage(
  to: string,
  imageUrl: string,
  caption?: string
): Promise<string | null> {
  return sendToWhatsApp({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "image",
    image: {
      link: imageUrl,
      caption: caption || undefined,
    },
  });
}

export async function sendButtonMessage(
  to: string,
  body: string,
  buttons: WhatsAppButton[],
  header?: string,
  footer?: string
): Promise<string | null> {
  // WhatsApp allows max 3 buttons, each title max 20 chars
  const safeButtons = buttons.slice(0, 3).map((b) => ({
    type: "reply",
    reply: {
      id: b.reply.id.substring(0, 256),
      title: b.reply.title.substring(0, 20),
    },
  }));

  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: { buttons: safeButtons },
    },
  };

  const interactive = payload.interactive as Record<string, unknown>;
  if (header) interactive.header = { type: "text", text: header.substring(0, 60) };
  if (footer) interactive.footer = { text: footer.substring(0, 60) };

  return sendToWhatsApp(payload);
}

export async function sendListMessage(
  to: string,
  body: string,
  buttonText: string,
  sections: WhatsAppListSection[],
  header?: string,
  footer?: string
): Promise<string | null> {
  // WhatsApp rule: Max 10 rows total across all sections
  let totalRows = 0;
  const safeSections: WhatsAppListSection[] = [];

  for (const sec of sections) {
    if (totalRows >= 10) break;
    const remaining = 10 - totalRows;
    const safeRows = sec.rows.slice(0, remaining).map((r) => ({
      id: r.id.substring(0, 200),
      title: r.title.substring(0, 24), // Max 24 chars
      description: r.description ? r.description.substring(0, 72) : undefined, // Max 72 chars
    }));

    if (safeRows.length > 0) {
      safeSections.push({
        title: sec.title.substring(0, 24),
        rows: safeRows,
      });
      totalRows += safeRows.length;
    }
  }

  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body },
      action: {
        button: buttonText.substring(0, 20),
        sections: safeSections,
      },
    },
  };

  const interactive = payload.interactive as Record<string, unknown>;
  if (header) interactive.header = { type: "text", text: header.substring(0, 60) };
  if (footer) interactive.footer = { text: footer.substring(0, 60) };

  return sendToWhatsApp(payload);
}

export async function sendDocumentMessage(
  to: string,
  documentUrl: string,
  filename: string,
  caption?: string
): Promise<string | null> {
  return sendToWhatsApp({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "document",
    document: {
      link: documentUrl,
      filename,
      caption: caption || undefined,
    },
  });
}

export async function markAsRead(messageId: string): Promise<void> {
  try {
    await sendToWhatsApp({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    });
  } catch (err) {
    safeErrorLog("markAsRead", err);
  }
}

export function makeButton(id: string, title: string): WhatsAppButton {
  return {
    type: "reply",
    reply: {
      id: id.substring(0, 256),
      title: title.substring(0, 20),
    },
  };
}

export function makeListRow(id: string, title: string, description?: string): WhatsAppListRow {
  return {
    id: id.substring(0, 200),
    title: title.substring(0, 24),
    description: description?.substring(0, 72),
  };
}
