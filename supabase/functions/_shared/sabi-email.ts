const API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM = "Sabi by XTOP <noreply@mail.sabibyxtop.com.ng>";
const SITE = "https://sabibyxtop.com.ng";
const DASHBOARD = "https://app.sabibyxtop.com.ng";

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c
  );
}

function layout(title: string, content: string, button?: string, url?: string): string {
  const action = button && url
    ? '<p style="margin:26px 0"><a href="' + esc(url) + '" style="background:#176b45;color:#fff;padding:13px 22px;border-radius:8px;text-decoration:none;font-weight:bold">' + esc(button) + '</a></p>'
    : "";
  return '<!doctype html><html><body style="margin:0;background:#f3f7f4;font-family:Arial,sans-serif;color:#26372d"><table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:14px;overflow:hidden"><tr><td style="background:#145b3b;padding:24px 30px;color:#fff"><div style="font-size:23px;font-weight:800">Sabi <span style="color:#b9e7c9">by XTOP</span></div><div style="font-size:12px;margin-top:5px;color:#dceee3">Sell smarter. Serve better.</div></td></tr><tr><td style="padding:30px"><h1 style="font-size:22px;color:#183d2b">' + esc(title) + '</h1>' + content + action + '<p style="font-size:13px;color:#68776e">Need help? Visit <a href="' + SITE + '" style="color:#176b45">sabibyxtop.com.ng</a>.</p></td></tr><tr><td style="padding:18px 30px;background:#f7faf8;color:#7b8981;font-size:11px">© ' + new Date().getFullYear() + ' XTOP Retail Technologies · Sabi by XTOP</td></tr></table></td></tr></table></body></html>';
}

export async function sendSabiEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  if (!API_KEY) {
    console.warn("RESEND_API_KEY is missing; email skipped.");
    return false;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject, html, text })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Resend send failed:", response.status, result);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Resend request failed:", error);
    return false;
  }
}

export async function sendMerchantWelcomeEmail(email: string, ownerName: string, businessName: string): Promise<boolean> {
  const html = layout("Welcome to Sabi by XTOP!", 
    '<p>Hello ' + esc(ownerName || "there") + ',</p><p>Your merchant account for <strong>' + esc(businessName || "your business") + '</strong> is ready.</p><p>You can sign in, add your products and prices, and prepare your shop. You do not need to connect a dedicated business WhatsApp number immediately; you can connect it later from your dashboard settings.</p><p>We are happy to have you with us.</p>',
    "Open your Sabi dashboard", DASHBOARD);
  return sendSabiEmail(email, "Welcome to Sabi by XTOP", html,
    "Welcome to Sabi by XTOP. Your merchant account for " + businessName + " is ready. Sign in: " + DASHBOARD);
}

export async function sendNewOrderEmails(db: any, d: {
  tenantId: string; orderNumber: string; customerName: string; customerEmail: string;
  subtotal: number; deliveryFee: number; total: number; paymentMethod: string;
}): Promise<void> {
  const { data: tenant } = await db.from("tenants").select("business_name,name").eq("id", d.tenantId).maybeSingle();
  const store = tenant?.business_name || tenant?.name || "the store";
  const money = (n: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(Number(n || 0));
  const customerHtml = layout("We received your order " + esc(d.orderNumber),
    '<p>Hello ' + esc(d.customerName) + ',</p><p>Thank you for shopping with <strong>' + esc(store) + '</strong>. Your order has been received.</p><p>Items subtotal: ' + money(d.subtotal) + '<br>Delivery fee: ' + money(d.deliveryFee) + '<br><strong>Order total: ' + money(d.total) + '</strong></p><p>Payment method: ' + esc(d.paymentMethod) + '. We will update you as your order progresses.</p>',
    "Visit Sabi", SITE);
  await sendSabiEmail(d.customerEmail, "Order received: " + d.orderNumber, customerHtml,
    "Your order " + d.orderNumber + " with " + store + " has been received. Total: " + money(d.total));

  const { data: membership } = await db.from("tenant_members").select("user_id")
    .eq("tenant_id", d.tenantId).eq("role", "OWNER").eq("is_active", true).limit(1).maybeSingle();
  if (membership?.user_id) {
    const { data: userData } = await db.auth.admin.getUserById(membership.user_id);
    const merchantEmail = userData?.user?.email;
    if (merchantEmail) {
      const merchantHtml = layout("New order: " + esc(d.orderNumber),
        '<p>Your store <strong>' + esc(store) + '</strong> has received a new order.</p><p>Customer: ' + esc(d.customerName) + '<br>Customer email: ' + esc(d.customerEmail) + '<br>Order total: <strong>' + money(d.total) + '</strong><br>Payment method: ' + esc(d.paymentMethod) + '</p>',
        "Open merchant dashboard", DASHBOARD);
      await sendSabiEmail(merchantEmail, "New customer order: " + d.orderNumber, merchantHtml,
        "New order " + d.orderNumber + " from " + d.customerName + ". Total: " + money(d.total) + ". Dashboard: " + DASHBOARD);
    }
  }
}

export async function sendPaymentReceiptEmail(db: any, d: {
  tenantId: string; orderId: string; orderNumber?: string; customerEmail: string;
  customerName?: string; amount: number;
}): Promise<void> {
  const { data: tenant } = await db.from("tenants").select("business_name,name").eq("id", d.tenantId).maybeSingle();
  const store = tenant?.business_name || tenant?.name || "the store";
  const order = d.orderNumber || d.orderId;
  const amount = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(d.amount);
  const html = layout("Payment confirmed",
    '<p>Hello ' + esc(d.customerName || "there") + ',</p><p>Your payment of <strong>' + amount + '</strong> for order <strong>' + esc(order) + '</strong> with ' + esc(store) + ' has been confirmed.</p><p>Thank you for shopping with us.</p>',
    "Visit Sabi", SITE);
  await sendSabiEmail(d.customerEmail, "Payment confirmed: " + order, html,
    "Your payment of " + amount + " for order " + order + " with " + store + " has been confirmed.");
}


export async function sendOrderStatusEmail(db: any, tenantId: string, orderId: string, status: "DISPATCHED" | "COMPLETED"): Promise<boolean> {
  const { data: order } = await db.from("tenant_orders")
    .select("order_number,customer_name,customer_email")
    .eq("tenant_id", tenantId).eq("id", orderId).maybeSingle();
  if (!order?.customer_email) return false;
  const { data: tenant } = await db.from("tenants")
    .select("business_name,name").eq("id", tenantId).maybeSingle();
  const store = tenant?.business_name || tenant?.name || "the store";
  const isReady = status === "DISPATCHED";
  const title = isReady ? "Your order is on its way" : "Your order is complete";
  const message = isReady
    ? "Your order has been dispatched. Please contact the store if you need help with delivery or pickup."
    : "Your order has been marked as delivered or collected. Thank you for shopping with us.";
  const html = layout(title,
    '<p>Hello ' + esc(order.customer_name || "there") + ',</p><p>' + esc(message) + '</p><p>Store: <strong>' + esc(store) + '</strong><br>Order: <strong>' + esc(order.order_number) + '</strong></p>',
    "Visit Sabi", SITE);
  return sendSabiEmail(order.customer_email, title + ": " + order.order_number, html,
    message + " Store: " + store + ". Order: " + order.order_number);
}
