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
  return '<!doctype html><html><body style="margin:0;background:#f3f7f4;font-family:Arial,sans-serif;color:#26372d"><table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:14px;overflow:hidden"><tr><td align="center" style="background:#145b3b;padding:24px 30px;color:#fff"><img src="https://i.ibb.co/N2b6rJnY/Untitled-design-20261030-044935-0000.png" alt="Sabi by XTOP logo" width="150" style="display:block;width:150px;max-width:100%;height:auto;margin:0 auto 12px;border:0"><div style="font-size:12px;color:#dceee3">Sell smarter. Serve better.</div></td></tr><tr><td style="padding:30px"><h1 style="font-size:22px;color:#183d2b">' + esc(title) + '</h1>' + content + action + '<p style="font-size:13px;color:#68776e">Need help? Visit <a href="' + SITE + '" style="color:#176b45">sabibyxtop.com.ng</a>.</p></td></tr><tr><td style="padding:18px 30px;background:#f7faf8;color:#7b8981;font-size:11px">© ' + new Date().getFullYear() + ' XTOP Retail Technologies · Sabi by XTOP</td></tr></table></td></tr></table></body></html>';
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
    '<p>Hello ' + esc(ownerName || "there") + ',</p>' +
    '<p>Your Sabi merchant workspace for <strong>' + esc(businessName || "your business") + '</strong> has been created successfully.</p>' +
    '<p><strong>Here is how to get your shop ready:</strong></p>' +
    '<ol style="padding-left:22px;line-height:1.8">' +
    '<li><strong>Sign in</strong> to your Sabi merchant dashboard.</li>' +
    '<li><strong>Add your products</strong> with clear names, prices, photos and available stock.</li>' +
    '<li><strong>Set up delivery and payment</strong> options in Settings.</li>' +
    '<li><strong>Preview your shop</strong> and share your shop link with customers.</li>' +
    '</ol>' +
    '<p>You do not need to connect a dedicated business WhatsApp number immediately. You can connect it later from your dashboard settings.</p>' +
    '<p>Your Sabi workspace is ready to use. There is no subscription or trial activation required.</p>' +
    '<p>We are glad to support your business.</p>',
    "Open your Sabi dashboard", DASHBOARD);
  return sendSabiEmail(email, "Welcome to Sabi by XTOP — your shop is ready", html,
    "Hello " + (ownerName || "there") + ". Welcome to Sabi by XTOP. Your merchant workspace for " +
    businessName + " has been created. Sign in at " + DASHBOARD +
    ". Add products with prices, photos and stock, configure delivery and payment in Settings, preview your shop and share its link. You can connect your dedicated business WhatsApp number later. No subscription or trial activation is required.");
}

export async function sendNewOrderEmails(db: any, d: {
  tenantId: string; orderId: string; orderNumber: string; customerName: string;
  customerEmail: string; subtotal: number; deliveryFee: number; total: number;
  paymentMethod: string;
}): Promise<void> {
  const { data: tenant } = await db.from("tenants")
    .select("business_name,name").eq("id", d.tenantId).maybeSingle();
  const store = tenant?.business_name || tenant?.name || "the store";
  const money = (n: number) => new Intl.NumberFormat("en-NG", {
    style: "currency", currency: "NGN", maximumFractionDigits: 2,
  }).format(Number(n || 0));

  const { data: orderDetails } = await db.from("tenant_orders")
    .select("customer_phone,delivery_address,payment_status")
    .eq("tenant_id", d.tenantId).eq("id", d.orderId).maybeSingle();

  // An ONLINE checkout is only an order request until Paystack confirms payment.
  // Do not send an "order received" email to the customer or a "new order"
  // email to the merchant while it remains unpaid. The abandoned-cart reminder
  // handles unpaid checkouts; payment confirmation sends the receipt later.
  const paymentStatus = String(orderDetails?.payment_status || "UNPAID").toUpperCase();
  const isUnpaidOnlineCheckout =
    String(d.paymentMethod || "").toUpperCase() === "ONLINE" &&
    paymentStatus !== "PAID";
  if (isUnpaidOnlineCheckout) {
    console.log("Order emails suppressed: online checkout has not been paid.", d.orderNumber);
    return;
  }

  const { data: items } = await db.from("tenant_order_items")
    .select("product_name,quantity,unit_price,line_total")
    .eq("tenant_id", d.tenantId).eq("order_id", d.orderId)
    .order("created_at", { ascending: true });

  const customerHtml = layout("We received your order " + esc(d.orderNumber),
    '<p>Hello ' + esc(d.customerName) + ',</p><p>Thank you for shopping with <strong>' +
    esc(store) + '</strong>. Your order has been received.</p><p>Items subtotal: ' +
    money(d.subtotal) + '<br>Delivery fee: ' + money(d.deliveryFee) +
    '<br><strong>Order total: ' + money(d.total) +
    '</strong></p><p>Payment method: ' + esc(d.paymentMethod) +
    '. We will update you as your order progresses.</p>',
    "Visit Sabi", SITE);
  await sendSabiEmail(d.customerEmail, "Order received: " + d.orderNumber, customerHtml,
    "Your order " + d.orderNumber + " with " + store + " has been received. Total: " + money(d.total));

  const { data: membership } = await db.from("tenant_members").select("user_id")
    .eq("tenant_id", d.tenantId).eq("role", "OWNER").eq("is_active", true)
    .limit(1).maybeSingle();
  if (membership?.user_id) {
    const { data: userData } = await db.auth.admin.getUserById(membership.user_id);
    const merchantEmail = userData?.user?.email;
    if (merchantEmail) {
      const itemRows = (items || []).map((item: any) =>
        '<tr><td style="padding:9px 6px;border-bottom:1px solid #e8eee9">' +
        esc(item.product_name || "Product") + '</td><td align="center" style="padding:9px 6px;border-bottom:1px solid #e8eee9">' +
        esc(item.quantity) + '</td><td align="right" style="padding:9px 6px;border-bottom:1px solid #e8eee9">' +
        money(Number(item.unit_price || 0)) + '</td><td align="right" style="padding:9px 6px;border-bottom:1px solid #e8eee9">' +
        money(Number(item.line_total ?? Number(item.unit_price || 0) * Number(item.quantity || 0))) +
        '</td></tr>'
      ).join("");
      const itemTable = '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0">' +
        '<thead><tr><th align="left">Product</th><th>Qty</th><th align="right">Unit price</th><th align="right">Amount</th></tr></thead>' +
        '<tbody>' + (itemRows || '<tr><td colspan="4">Order item details are not available.</td></tr>') + '</tbody></table>';
      const paymentStatus = String(orderDetails?.payment_status || "PENDING").replace(/_/g, " ");
      const merchantHtml = layout("New order: " + esc(d.orderNumber),
        '<p>Your store <strong>' + esc(store) + '</strong> has received a new order.</p>' +
        '<p><strong>Customer details</strong><br>Name: ' + esc(d.customerName) +
        '<br>Phone: ' + esc(orderDetails?.customer_phone || "Not provided") +
        '<br>Email: ' + esc(d.customerEmail) +
        '<br>Delivery address: ' + esc(orderDetails?.delivery_address || "Not provided") + '</p>' +
        '<p><strong>Order items</strong></p>' + itemTable +
        '<p>Items subtotal: ' + money(d.subtotal) + '<br>Delivery fee: ' + money(d.deliveryFee) +
        '<br><strong>Order total: ' + money(d.total) + '</strong></p>' +
        '<p>Payment method: ' + esc(d.paymentMethod) + '<br>Payment status: ' + esc(paymentStatus) + '</p>',
        "Open merchant dashboard", DASHBOARD);
      await sendSabiEmail(merchantEmail, "New customer order: " + d.orderNumber, merchantHtml,
        "New order " + d.orderNumber + " from " + d.customerName +
        ". Items: " + (items || []).map((item: any) =>
          String(item.product_name || "Product") + " x " + String(item.quantity)
        ).join(", ") + ". Total: " + money(d.total) +
        ". Payment: " + d.paymentMethod + " (" + paymentStatus + "). Dashboard: " + DASHBOARD);
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

  // Notify the merchant as well, using the active tenant OWNER account.
  const { data: membership } = await db.from("tenant_members").select("user_id")
    .eq("tenant_id", d.tenantId).eq("role", "OWNER").eq("is_active", true)
    .limit(1).maybeSingle();

  if (membership?.user_id) {
    const { data: userData } = await db.auth.admin.getUserById(membership.user_id);
    const merchantEmail = userData?.user?.email;
    if (merchantEmail) {
      const merchantHtml = layout("Payment received for order " + esc(order),
        '<p>Your store <strong>' + esc(store) + '</strong> has received a confirmed payment.</p>' +
        '<p>Order: <strong>' + esc(order) + '</strong><br>Amount paid: <strong>' + amount +
        '</strong><br>Customer: ' + esc(d.customerName || "Customer") + '</p>' +
        '<p>The payment has been verified and the order payment status has been updated.</p>',
        "Open merchant dashboard", DASHBOARD);
      await sendSabiEmail(merchantEmail, "Payment received: " + order, merchantHtml,
        "Payment received for order " + order + " at " + store + ". Amount: " + amount +
        ". Customer: " + (d.customerName || "Customer") + ". Dashboard: " + DASHBOARD);
    }
  }
}


export async function sendOrderStatusEmail(
  db: any,
  tenantId: string,
  orderId: string,
  status: "DISPATCHED" | "COMPLETED" | "CANCELLED",
): Promise<boolean> {
  // Customer email is stored on the tenant contact, not tenant_orders.
  const { data: order, error: orderError } = await db.from("tenant_orders")
    .select("order_number,customer_name,customer_email,contact_id,shipping_required")
    .eq("tenant_id", tenantId).eq("id", orderId).maybeSingle();

  if (orderError || !order) {
    console.error("Order status email: order lookup failed.", orderError);
    return false;
  }

  let customerEmail = String(order.customer_email || "").trim();
  if (!customerEmail && order.contact_id) {
    const { data: contact, error: contactError } = await db.from("contacts")
      .select("email")
      .eq("tenant_id", tenantId)
      .eq("id", order.contact_id)
      .maybeSingle();
    if (contactError) {
      console.warn("Order status email contact lookup failed.", contactError);
    }
    customerEmail = String(contact?.email || "").trim();
  }

  if (!customerEmail) {
    console.warn("Order status email skipped: customer email is unavailable.");
    return false;
  }

  const { data: tenant } = await db.from("tenants")
    .select("business_name,name").eq("id", tenantId).maybeSingle();
  const store = tenant?.business_name || tenant?.name || "the store";

  const isCompleted = status === "COMPLETED";
  const isCancelled = status === "CANCELLED";
  const requiresShipping = order.shipping_required === true;
  const title = isCancelled
    ? "Your order has been cancelled"
    : isCompleted
      ? "Your order is complete"
      : requiresShipping
        ? "Your order has been dispatched"
        : "Your order is ready for pickup";

  const message = isCancelled
    ? "The store has cancelled this unpaid order. No payment was taken for this order. If you need help or would like to place a new order, please contact the store."
    : isCompleted
      ? (requiresShipping
        ? "Your order has been marked as delivered. Thank you for shopping with us."
        : "Your order has been marked as collected. Thank you for shopping with us.")
      : requiresShipping
        ? "Good news! Your order has been dispatched and is on its way to you. Please contact the store if you need help with delivery."
        : "Good news! Your order is ready for pickup. Please contact the store to arrange collection.";

  const html = layout(title,
    '<p>Hello ' + esc(order.customer_name || "there") + ',</p><p>' + esc(message) +
    '</p><p>Store: <strong>' + esc(store) + '</strong><br>Order: <strong>' +
    esc(order.order_number) + '</strong></p>',
    "Visit Sabi", SITE);

  return sendSabiEmail(
    customerEmail,
    title + ": " + order.order_number,
    html,
    message + " Store: " + store + ". Order: " + order.order_number,
  );
}


export async function sendMerchantSettlementEmail(db: any, d: {
  tenantId: string;
  orderId: string;
  orderNumber?: string;
  paymentReference?: string;
  settlementId?: string;
  settlementDate?: string | null;
}): Promise<boolean> {
  const { data: tenant } = await db.from("tenants")
    .select("business_name,name").eq("id", d.tenantId).maybeSingle();
  const store = tenant?.business_name || tenant?.name || "your store";

  const { data: membership } = await db.from("tenant_members")
    .select("user_id")
    .eq("tenant_id", d.tenantId)
    .eq("role", "OWNER")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!membership?.user_id) {
    console.warn("Settlement email skipped: active merchant owner not found.");
    return false;
  }

  const { data: userData, error: userError } = await db.auth.admin
    .getUserById(membership.user_id);
  const merchantEmail = userData?.user?.email;
  if (userError || !merchantEmail) {
    console.warn("Settlement email skipped: merchant email unavailable.", userError);
    return false;
  }

  const { data: order } = await db.from("tenant_orders")
    .select("order_number")
    .eq("tenant_id", d.tenantId)
    .eq("id", d.orderId)
    .maybeSingle();

  const orderNumber = d.orderNumber || order?.order_number || d.orderId;
  const settlementDate = d.settlementDate
    ? new Date(d.settlementDate).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })
    : "Not provided by Paystack";

  const html = layout("Your merchant settlement is confirmed",
    '<p>Hello,</p><p>Paystack has reported a successful settlement containing the payment for an order in <strong>' +
    esc(store) + '</strong>.</p><p>Order: <strong>' + esc(orderNumber) +
    '</strong><br>Payment reference: ' + esc(d.paymentReference || "Not available") +
    '<br>Paystack settlement ID: ' + esc(d.settlementId || "Not available") +
    '<br>Settlement date: ' + esc(settlementDate) +
    '</p><p>This confirms Paystack reported the settlement as successful. Please check your bank account for the credit entry.</p>',
    "Open merchant dashboard", DASHBOARD);

  return sendSabiEmail(
    merchantEmail,
    "Paystack settlement confirmed: " + orderNumber,
    html,
    "Paystack reported a successful settlement containing payment for order " +
      orderNumber + " at " + store + ". Payment reference: " +
      (d.paymentReference || "Not available") + ". Settlement ID: " +
      (d.settlementId || "Not available") + ". Settlement date: " +
      settlementDate + ". Check your bank account for the credit entry. Dashboard: " + DASHBOARD,
  );
}


export async function sendAbandonedCartEmail(d: {
  email: string;
  customerName?: string | null;
  businessName?: string | null;
  productName?: string | null;
  productPrice?: number | string | null;
  quantity: number;
  checkoutUrl: string;
  orderNumber?: string | null;
}): Promise<boolean> {
  const money = new Intl.NumberFormat("en-NG", {
    style: "currency", currency: "NGN", maximumFractionDigits: 2,
  }).format(Number(d.productPrice || 0));
  const name = d.customerName || "there";
  const store = d.businessName || "the store";
  const product = d.productName || "the item you viewed";
  const hasOrder = Boolean(d.orderNumber);
  const intro = hasOrder
    ? '<p>Your order <strong>' + esc(d.orderNumber || "") + '</strong> at <strong>' + esc(store) +
      '</strong> is awaiting payment. We have not received payment confirmation yet.</p>'
    : '<p>You recently showed interest in <strong>' + esc(product) + '</strong> at <strong>' +
      esc(store) + '</strong>. Your checkout is still available if you would like to continue.</p>';
  const html = layout(hasOrder ? "Your Sabi order is awaiting payment" : "You left something in your cart",
    '<p>Hello ' + esc(name) + ',</p>' + intro +
    '<p>Quantity: ' + esc(d.quantity) + '<br>Cart value: ' + money +
    '</p><p>' + (hasOrder
      ? 'No payment has been confirmed. If you have already paid, please allow time for verification.'
      : 'No order has been placed and no payment has been taken.') + '</p>',
    "Continue checkout", d.checkoutUrl);
  return sendSabiEmail(
    d.email,
    hasOrder ? "Payment pending for order " + d.orderNumber : "Your " + product + " is waiting at " + store,
    html,
    "Hello " + name + ". " + (hasOrder
      ? "Order " + d.orderNumber + " at " + store + " is awaiting payment. No payment has been confirmed yet. "
      : "You recently viewed " + product + " at " + store + ". No order has been placed and no payment has been taken. ") +
      "Cart value: " + money + ". Continue checkout: " + d.checkoutUrl
  );
}


export async function sendWeeklyMerchantSalesReportEmail(d: {
  email: string;
  ownerName?: string | null;
  businessName: string;
  weekLabel: string;
  orderCount: number;
  paidOrderCount: number;
  unpaidOrderCount: number;
  cancelledOrderCount: number;
  paidRevenue: number;
  pendingValue: number;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
}): Promise<boolean> {
  const money = (n: number) => new Intl.NumberFormat("en-NG", {
    style: "currency", currency: "NGN", maximumFractionDigits: 2,
  }).format(Number(n || 0));
  const rows = d.topProducts.slice(0, 5).map((p) =>
    '<tr><td style="padding:9px 6px;border-bottom:1px solid #e8eee9">' + esc(p.name) +
    '</td><td align="center" style="padding:9px 6px;border-bottom:1px solid #e8eee9">' +
    esc(p.quantity) + '</td><td align="right" style="padding:9px 6px;border-bottom:1px solid #e8eee9">' +
    money(p.revenue) + '</td></tr>'
  ).join("");
  const products = '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0">' +
    '<thead><tr><th align="left">Product</th><th>Units sold</th><th align="right">Sales</th></tr></thead>' +
    '<tbody>' + (rows || '<tr><td colspan="3" style="padding:10px 6px">No product sales recorded this week.</td></tr>') +
    '</tbody></table>';
  const html = layout("Your weekly sales report",
    '<p>Hello ' + esc(d.ownerName || "there") + ',</p><p>Here is the sales summary for <strong>' +
    esc(d.businessName) + '</strong> for <strong>' + esc(d.weekLabel) + '</strong>.</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:18px 0">' +
    '<tr><td style="padding:10px;background:#f3f7f4">Orders received</td><td align="right" style="padding:10px;background:#f3f7f4"><strong>' + esc(d.orderCount) + '</strong></td></tr>' +
    '<tr><td style="padding:10px">Paid orders</td><td align="right" style="padding:10px"><strong>' + esc(d.paidOrderCount) + '</strong></td></tr>' +
    '<tr><td style="padding:10px;background:#f3f7f4">Unpaid orders</td><td align="right" style="padding:10px;background:#f3f7f4"><strong>' + esc(d.unpaidOrderCount) + '</strong></td></tr>' +
    '<tr><td style="padding:10px">Cancelled orders</td><td align="right" style="padding:10px"><strong>' + esc(d.cancelledOrderCount) + '</strong></td></tr>' +
    '<tr><td style="padding:10px;background:#f3f7f4">Confirmed paid revenue</td><td align="right" style="padding:10px;background:#f3f7f4"><strong>' + money(d.paidRevenue) + '</strong></td></tr>' +
    '<tr><td style="padding:10px">Value of unpaid orders</td><td align="right" style="padding:10px"><strong>' + money(d.pendingValue) + '</strong></td></tr></table>' +
    '<h2 style="font-size:17px;color:#183d2b">Top products</h2>' + products +
    '<p>Revenue includes only orders whose payment is confirmed. Unpaid and cancelled orders are shown separately and are not counted as revenue.</p>',
    "Open your Sabi dashboard", DASHBOARD);
  const textBody = "Weekly sales report for " + d.businessName + " (" + d.weekLabel + "). Orders: " +
    d.orderCount + ". Paid: " + d.paidOrderCount + ". Unpaid: " + d.unpaidOrderCount +
    ". Cancelled: " + d.cancelledOrderCount + ". Confirmed paid revenue: " + money(d.paidRevenue) +
    ". Unpaid order value: " + money(d.pendingValue) + ". Dashboard: " + DASHBOARD;
  return sendSabiEmail(d.email, "Your weekly Sabi sales report: " + d.weekLabel, html, textBody);
}


export async function sendMonthlyMerchantSalesReportEmail(d: {
  email: string;
  ownerName?: string | null;
  businessName: string;
  monthLabel: string;
  orderCount: number;
  paidOrderCount: number;
  unpaidOrderCount: number;
  cancelledOrderCount: number;
  paidRevenue: number;
  pendingValue: number;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
}): Promise<boolean> {
  const money = (n: number) => new Intl.NumberFormat("en-NG", {
    style: "currency", currency: "NGN", maximumFractionDigits: 2,
  }).format(Number(n || 0));
  const rows = d.topProducts.slice(0, 5).map((p) =>
    '<tr><td style="padding:9px 6px;border-bottom:1px solid #e8eee9">' + esc(p.name) +
    '</td><td align="center" style="padding:9px 6px;border-bottom:1px solid #e8eee9">' +
    esc(p.quantity) + '</td><td align="right" style="padding:9px 6px;border-bottom:1px solid #e8eee9">' +
    money(p.revenue) + '</td></tr>'
  ).join("");
  const products = '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0">' +
    '<thead><tr><th align="left">Product</th><th>Units sold</th><th align="right">Sales</th></tr></thead>' +
    '<tbody>' + (rows || '<tr><td colspan="3" style="padding:10px 6px">No product sales recorded this month.</td></tr>') +
    '</tbody></table>';
  const html = layout("Your monthly sales report",
    '<p>Hello ' + esc(d.ownerName || "there") + ',</p><p>Here is the monthly performance summary for <strong>' +
    esc(d.businessName) + '</strong> for <strong>' + esc(d.monthLabel) + '</strong>.</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:18px 0">' +
    '<tr><td style="padding:10px;background:#f3f7f4">Orders received</td><td align="right" style="padding:10px;background:#f3f7f4"><strong>' + esc(d.orderCount) + '</strong></td></tr>' +
    '<tr><td style="padding:10px">Paid orders</td><td align="right" style="padding:10px"><strong>' + esc(d.paidOrderCount) + '</strong></td></tr>' +
    '<tr><td style="padding:10px;background:#f3f7f4">Unpaid orders</td><td align="right" style="padding:10px;background:#f3f7f4"><strong>' + esc(d.unpaidOrderCount) + '</strong></td></tr>' +
    '<tr><td style="padding:10px">Cancelled orders</td><td align="right" style="padding:10px"><strong>' + esc(d.cancelledOrderCount) + '</strong></td></tr>' +
    '<tr><td style="padding:10px;background:#f3f7f4">Confirmed paid revenue</td><td align="right" style="padding:10px;background:#f3f7f4"><strong>' + money(d.paidRevenue) + '</strong></td></tr>' +
    '<tr><td style="padding:10px">Value of unpaid orders</td><td align="right" style="padding:10px"><strong>' + money(d.pendingValue) + '</strong></td></tr></table>' +
    '<h2 style="font-size:17px;color:#183d2b">Top five products</h2>' + products +
    '<p>Only orders with confirmed payment are counted as revenue. Unpaid and cancelled orders are listed separately and are not included in paid revenue.</p>' +
    '<p>Thank you for growing your business with Sabi by XTOP.</p>',
    "Open your Sabi dashboard", DASHBOARD);
  const textBody = "Monthly sales report for " + d.businessName + " (" + d.monthLabel + "). Orders: " +
    d.orderCount + ". Paid: " + d.paidOrderCount + ". Unpaid: " + d.unpaidOrderCount +
    ". Cancelled: " + d.cancelledOrderCount + ". Confirmed paid revenue: " + money(d.paidRevenue) +
    ". Unpaid order value: " + money(d.pendingValue) + ". Dashboard: " + DASHBOARD;
  return sendSabiEmail(d.email, "Your monthly Sabi sales report: " + d.monthLabel, html, textBody);
}


export async function sendLowStockAlertEmail(db: any, d: {
  tenantId: string;
  products: Array<{ name: string; remaining: number; alertType: "LOW_STOCK" | "OUT_OF_STOCK" }>;
}): Promise<boolean> {
  if (!d.products.length) return false;

  const { data: membership, error: membershipError } = await db.from("tenant_members")
    .select("user_id")
    .eq("tenant_id", d.tenantId)
    .eq("role", "OWNER")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership?.user_id) {
    console.warn("Low-stock email skipped: active merchant owner not found.", membershipError);
    return false;
  }

  const { data: userData, error: userError } = await db.auth.admin.getUserById(membership.user_id);
  const merchantEmail = userData?.user?.email;
  if (userError || !merchantEmail) {
    console.warn("Low-stock email skipped: merchant email unavailable.", userError);
    return false;
  }

  const { data: tenant } = await db.from("tenants")
    .select("business_name,name").eq("id", d.tenantId).maybeSingle();
  const store = tenant?.business_name || tenant?.name || "your store";

  const rows = d.products.map((p) => {
    const isOut = p.alertType === "OUT_OF_STOCK" || p.remaining <= 0;
    return '<tr><td style="padding:10px 8px;border-bottom:1px solid #e8eee9">' +
      esc(p.name) + '</td><td align="right" style="padding:10px 8px;border-bottom:1px solid #e8eee9"><strong>' +
      (isOut ? "Out of stock" : esc(p.remaining) + " remaining") +
      '</strong></td></tr>';
  }).join("");

  const hasOut = d.products.some((p) => p.alertType === "OUT_OF_STOCK" || p.remaining <= 0);
  const heading = hasOut ? "Stock needs your attention" : "Your product stock is running low";
  const html = layout(heading,
    '<p>Hello,</p><p>This is an inventory alert for <strong>' + esc(store) +
    '</strong>. Please review the following product stock levels.</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0">' +
    '<thead><tr><th align="left">Product</th><th align="right">Stock status</th></tr></thead><tbody>' +
    rows + '</tbody></table><p>Update your quantities or restock these products from your Sabi dashboard.</p>',
    "Manage products", DASHBOARD);

  return sendSabiEmail(
    merchantEmail,
    (hasOut ? "Out of stock alert" : "Low stock alert") + " — " + store,
    html,
    "Inventory alert for " + store + ": " + d.products.map((p) =>
      p.name + " (" + (p.remaining <= 0 ? "out of stock" : p.remaining + " remaining") + ")"
    ).join("; ") + ". Manage products: " + DASHBOARD,
  );
}
