// Arena intent layer for each isolated Sabi merchant WhatsApp store.
// The model may interpret language, but all commerce mutations remain in the
// existing tenant-scoped deterministic store/checkout code in router.ts.

type MerchantProduct = {
  id: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  category?: string | null;
  price?: number | string | null;
  price_text?: string | null;
  stock_quantity?: number | null;
  is_active?: boolean;
};

type CartItem = { name: string; quantity: number };

export type MerchantAIResult =
  | { type: "command"; command: string }
  | { type: "reply"; reply: string };

function directCommand(text: string): boolean {
  const value = text.trim().toLowerCase()
    .replace(/^[\"'“”‘’]+|[\"'“”‘’]+$/g, "")
    .replace(/[.!?]+$/g, "")
    .trim();
  return !value ||
    /^(hi|hello|hey|menu|start|shop|catalogue|catalog|products|cart|my cart|view cart|checkout|cancel|cancel checkout|stop|clear cart|online|pod|pay now|pay on delivery|agent|human|talk to human|customer service|speak to an agent)(\b|$)/
      .test(value) ||
    /^(?:(?:hi|hello|hey)[,!. ]*)?(?:what products (?:do you have|are available)|show me (?:the )?products|list (?:your )?products|i want to browse products|let me see (?:your )?products)\??$/i
      .test(value) ||
    /^(search|add|remove|category)\s+/i.test(value) ||
    /^(track(?:\s+SABI-\d{8}-[A-Z0-9]+)?)$/i.test(value) ||
    /^store_[a-z0-9_:.-]+$/i.test(value) ||
    /^sabi-order-[a-z0-9-]+$/i.test(value) ||
    /SABI-\d{8}-[A-Z0-9]+/i.test(value) ||
    /\b(payment\s+(?:has\s+been\s+)?confirmed|i\s+(?:have\s+)?paid|payment\s+(?:was\s+)?successful)\b/i
      .test(value);
}

function safeCommand(value: unknown, products: MerchantProduct[]): string | null {
  if (typeof value !== "string") return null;
  const command = value.trim().replace(/\s+/g, " ").slice(0, 180);
  if (/^(menu|cart|checkout|track|agent|clear cart)$/i.test(command)) return command.toLowerCase();

  const search = command.match(/^search\s+(.{2,100})$/i);
  if (search) return `search ${search[1]}`;

  const remove = command.match(/^remove\s+(.{2,100})$/i);
  if (remove) return `remove ${remove[1]}`;

  const category = command.match(/^category\s+(.{2,70})$/i);
  if (category) return `category ${category[1]}`;

  const add = command.match(/^add\s+(.{2,100}?)(?:\s+x(\d{1,2}))?$/i);
  if (add) {
    const requested = add[1].trim().toLowerCase();
    const product = products.find((p) =>
      String(p.name || "").trim().toLowerCase() === requested ||
      String(p.slug || "").trim().toLowerCase() === requested
    );
    if (!product) return null;
    const quantity = Math.max(1, Math.min(100, Number(add[2] || 1)));
    return `add ${product.name} x${quantity}`;
  }
  return null;
}

export async function interpretMerchantMessage(input: {
  message: string;
  businessName: string;
  products: MerchantProduct[];
  cart: CartItem[];
  state: string;
}): Promise<MerchantAIResult | null> {
  const message = String(input.message || "").trim();
  if (!message || input.state !== "IDLE" || directCommand(message)) return null;

  const apiKey = Deno.env.get("ARENA_API_KEY") || "";
  if (!apiKey) return null;
  const model = Deno.env.get("ARENA_MODEL") || "gpt-6-luna";

  const productFacts = input.products.slice(0, 60).map((p) => ({
    name: String(p.name || "").slice(0, 100),
    slug: String(p.slug || "").slice(0, 100),
    description: String(p.description || "").slice(0, 450),
    category: String(p.category || "").slice(0, 70),
    price: p.price == null ? null : Number(p.price),
    price_text: String(p.price_text || "").slice(0, 80),
    stock: p.stock_quantity == null ? null : Number(p.stock_quantity),
  }));
  const cartFacts = input.cart.map((item) => ({
    name: String(item.name || "").slice(0, 100),
    quantity: Math.max(0, Number(item.quantity || 0)),
  }));

  const system = [
    "You are the natural-language shopping assistant for one Sabi by XTOP merchant store.",
    "Interpret the customer's message and return ONLY one JSON object. Never use markdown or prose outside JSON.",
    'Allowed output shapes: {"type":"command","command":"..."} or {"type":"reply","reply":"..."}.',
    "Allowed commands only: menu, search <terms>, add <exact product name> x<quantity>, cart, checkout, remove <exact cart item name>, clear cart, track, agent, category <name>.",
    "Use a command when the customer wants to browse/search/add/remove/view cart/checkout/track/contact a human. Use exact product names from the supplied catalogue for add commands. If a product name is uncertain, use search <customer's words> instead.",
    "For questions about products, answer only from the supplied catalogue facts. Never invent products, prices, stock, discounts, delivery fees, return policies, order status, or payment status.",
    "If the requested product is unavailable in the catalogue, use search <terms>. If a business policy or detail is not supplied, say you cannot confirm it and offer the shop's human agent.",
    "Never claim that an order was placed, payment was made, stock reserved, delivery booked, or a refund issued. Commands are merely requests; the Sabi backend will perform and verify them.",
    "Be warm, concise, natural Nigerian English. Reply in the customer's language style when possible. Keep replies under 650 characters.",
    "Business: " + input.businessName,
    "Live product catalogue (source of truth): " + JSON.stringify(productFacts),
    "Customer's current cart: " + JSON.stringify(cartFacts),
  ].join("\n");

  try {
    const response = await fetch("https://api.arena.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          { role: "system", content: system },
          { role: "user", content: message.slice(0, 1600) },
        ],
      }),
    });
    if (!response.ok) {
      console.error(
        "[SABI_MERCHANT_AI] Arena request failed:",
        response.status,
        (await response.text()).slice(0, 250),
      );
      return null;
    }
    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;
    const jsonText = content.trim().replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, "");
    const parsed = JSON.parse(jsonText);
    if (parsed?.type === "command") {
      const command = safeCommand(parsed.command, input.products);
      return command ? { type: "command", command } : null;
    }
    if (parsed?.type === "reply" && typeof parsed.reply === "string") {
      const reply = parsed.reply.trim().slice(0, 850);
      return reply ? { type: "reply", reply } : null;
    }
    return null;
  } catch (error) {
    console.error(
      "[SABI_MERCHANT_AI] Intent interpretation failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return null;
  }
}
