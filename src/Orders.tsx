
import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  Package,
  Truck,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  ShoppingCart
} from "lucide-react";
import { supabase } from "./lib/supabase";

type OrderItem = {
  id?: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type Order = {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_phone: string;
  delivery_address: string | null;
  notes: string | null;
  status: string;
  payment_status: string;
  payment_method: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  shipping_payment_required: boolean;
  shipping_payment_status: string;
  sales_fee_amount: number;
  sales_fee_status: string;
  created_at: string;
  items: OrderItem[];
  cancellation_reason?: string | null;
};

type Product = {
  id: string;
  name: string;
  price: number;
  stock_quantity: number | null;
};

type CartItem = {
  product_id: string;
  quantity: number;
};

type Props = {
  tenantId: string;
};

const money = (amount: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2
  }).format(Number(amount || 0));

const dateTime = (value: string) =>
  value
    ? new Date(value).toLocaleString("en-NG", {
        dateStyle: "medium",
        timeStyle: "short"
      })
    : "—";

function statusClass(value: string) {
  const status = String(value || "").toUpperCase();

  if (["COMPLETED", "PAID", "CHARGED"].includes(status)) {
    return "order-status success";
  }

  if (["CANCELLED", "FAILED", "INSUFFICIENT_FUNDS"].includes(status)) {
    return "order-status danger";
  }

  if (["DISPATCHED", "PENDING", "UNPAID"].includes(status)) {
    return "order-status warning";
  }

  return "order-status";
}

export default function Orders({ tenantId }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [busyOrder, setBusyOrder] = useState("");
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expandedOrder, setExpandedOrder] = useState("");
  const [filter, setFilter] = useState("ALL");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"ONLINE" | "POD">("ONLINE");
  const [cart, setCart] = useState<CartItem[]>([]);

  const loadOrders = useCallback(async () => {
    if (!tenantId) return;

    setLoading(true);
    setError("");

    const { data, error: rpcError } = await supabase.rpc(
      "sabi_get_merchant_orders",
      {
        p_tenant_id: tenantId,
        p_limit: 100,
        p_offset: 0
      }
    );

    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }

    const result = data as
      | { success?: boolean; orders?: Order[]; data?: Order[] }
      | Order[]
      | null;

    let rows: Order[] = [];

    if (Array.isArray(result)) {
      rows = result;
    } else if (result) {
      rows = result.orders || result.data || [];
    }

    setOrders(rows);
    setLoading(false);
  }, [tenantId]);

  const loadProducts = useCallback(async () => {
    if (!tenantId) return;

    setLoadingProducts(true);

    const { data, error: productError } = await supabase
      .from("products")
      .select("id, name, price, stock_quantity")
      .eq("tenant_id", tenantId)
      .eq("status", "ACTIVE")
      .eq("is_active", true)
      .order("name", { ascending: true });

    setLoadingProducts(false);

    if (productError) {
      setError(`Could not load products: ${productError.message}`);
      return;
    }

    setProducts((data || []) as Product[]);
  }, [tenantId]);

  useEffect(() => {
    loadOrders();
    loadProducts();
  }, [loadOrders, loadProducts]);

  function resetCreateForm() {
    setCustomerName("");
    setCustomerPhone("");
    setCustomerEmail("");
    setDeliveryAddress("");
    setOrderNotes("");
    setPaymentMethod("ONLINE");
    setCart([]);
  }

  function addProduct(productId: string) {
    if (!productId) return;

    const product = products.find((item) => item.id === productId);
    if (!product) return;

    if (
      product.stock_quantity !== null &&
      product.stock_quantity <= 0
    ) {
      setError(`${product.name} is out of stock.`);
      return;
    }

    setError("");

    setCart((current) => {
      const existing = current.find(
        (item) => item.product_id === productId
      );

      if (existing) {
        return current.map((item) =>
          item.product_id === productId
            ? {
                ...item,
                quantity: item.quantity + 1
              }
            : item
        );
      }

      return [
        ...current,
        {
          product_id: productId,
          quantity: 1
        }
      ];
    });
  }

  function changeQuantity(productId: string, quantity: number) {
    if (quantity < 1) {
      setCart((current) =>
        current.filter((item) => item.product_id !== productId)
      );
      return;
    }

    const product = products.find((item) => item.id === productId);

    if (
      product?.stock_quantity !== null &&
      product?.stock_quantity !== undefined &&
      quantity > product.stock_quantity
    ) {
      setError(`Only ${product.stock_quantity} units of ${product.name} are in stock.`);
      return;
    }

    setError("");

    setCart((current) =>
      current.map((item) =>
        item.product_id === productId
          ? { ...item, quantity }
          : item
      )
    );
  }

  function removeCartItem(productId: string) {
    setCart((current) =>
      current.filter((item) => item.product_id !== productId)
    );
  }

  const cartSubtotal = cart.reduce((total, item) => {
    const product = products.find(
      (productItem) => productItem.id === item.product_id
    );

    return total + Number(product?.price || 0) * item.quantity;
  }, 0);

  async function createOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setNotice("");

    if (!customerName.trim()) {
      setError("Enter the customer's name.");
      return;
    }

    if (!customerPhone.trim()) {
      setError("Enter the customer's phone number.");
      return;
    }

    if (!customerEmail.trim()) {
      setError("Enter the customer's email address.");
      return;
    }

    if (!deliveryAddress.trim()) {
      setError("Enter the delivery address.");
      return;
    }

    if (cart.length === 0) {
      setError("Add at least one product to the order.");
      return;
    }

    setCreatingOrder(true);

    try {
      const items = cart.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity
      }));

      const { data: orderData, error: orderError } =
        await supabase.rpc("sabi_create_merchant_order", {
          p_tenant_id: tenantId,
          p_items: items,
          p_customer_name: customerName.trim(),
          p_customer_phone: customerPhone.trim(),
          p_customer_email: customerEmail.trim(),
          p_delivery_address: deliveryAddress.trim(),
          p_payment_method: paymentMethod,
          p_notes: orderNotes.trim() || null
        });

      if (orderError) {
        throw new Error(orderError.message);
      }

      const orderResult = Array.isArray(orderData)
        ? orderData[0]
        : orderData;

      if (!orderResult?.success || !orderResult?.order_id) {
        throw new Error(
          orderResult?.message ||
          orderResult?.error ||
          "The order could not be created."
        );
      }

      const { data: paymentData, error: paymentError } =
        await supabase.functions.invoke("order-api", {
          body: {
            action: "initialize_merchant",
            tenant_id: tenantId,
            order_id: orderResult.order_id
          }
        });

      if (paymentError) {
        throw new Error(
          `Order ${orderResult.order_number} was created, but Paystack initialization failed: ${paymentError.message}. Refresh and contact support before creating another order.`
        );
      }

      if (!paymentData?.success || !paymentData?.authorization_url) {
        throw new Error(
          paymentData?.error ||
          paymentData?.message ||
          `Order ${orderResult.order_number} was created, but a Paystack checkout link was not returned.`
        );
      }

      setNotice(
        `Order ${orderResult.order_number} created. Redirecting to Paystack...`
      );

      window.location.assign(paymentData.authorization_url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create the order."
      );
    } finally {
      setCreatingOrder(false);
    }
  }

  async function runOrderAction(
    orderId: string,
    action: "dispatch" | "confirm" | "cancel"
  ) {
    const messages = {
      dispatch: "Dispatch this order? Sabi will check payment and wallet commission first.",
      confirm: "Confirm that this order has been delivered?",
      cancel: "Cancel this order? Stock will be restored and any eligible Sabi commission refunded."
    };

    if (!window.confirm(messages[action])) return;

    setBusyOrder(orderId);
    setError("");
    setNotice("");

    const rpcNames = {
      dispatch: "sabi_merchant_dispatch_order",
      confirm: "sabi_merchant_confirm_delivery",
      cancel: "sabi_merchant_cancel_order"
    };

    const params: Record<string, unknown> = {
      p_tenant_id: tenantId,
      p_order_id: orderId
    };

    if (action === "cancel") {
      params.p_reason = "Cancelled by merchant";
    }

    const { data, error: rpcError } = await supabase.rpc(
      rpcNames[action],
      params
    );

    setBusyOrder("");

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    const result = data as {
      success?: boolean;
      message?: string;
      error?: string;
      reason?: string;
    } | null;

    if (result && result.success === false) {
      setError(
        result.message ||
        result.error ||
        result.reason ||
        "The requested action could not be completed."
      );
      return;
    }

    const successMessages = {
      dispatch: "Order dispatched successfully.",
      confirm: "Delivery confirmed. The order is now completed.",
      cancel: "Order cancelled successfully."
    };

    setNotice(result?.message || successMessages[action]);

    await loadOrders();
  }

  const filteredOrders = orders.filter((order) => {
    if (filter === "ALL") return true;
    return String(order.status).toUpperCase() === filter;
  });

  const pendingCount = orders.filter(
    (order) => order.status === "PENDING"
  ).length;

  const dispatchedCount = orders.filter(
    (order) => order.status === "DISPATCHED"
  ).length;

  const completedCount = orders.filter(
    (order) => order.status === "COMPLETED"
  ).length;

  return (
    <div className="orders-page">
      <div className="orders-toolbar">
        <div>
          <h2>Order management</h2>
          <p>Review customer orders, create orders, dispatch and confirm deliveries.</p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="orders-refresh"
            onClick={() => {
              setShowCreateForm((current) => !current);
              setError("");
              setNotice("");
              if (!showCreateForm) loadProducts();
            }}
          >
            <Plus size={16} />
            {showCreateForm ? "Close form" : "Create order"}
          </button>

          <button
            className="orders-refresh"
            onClick={loadOrders}
            disabled={loading}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="orders-alert orders-alert-error">
          {error}
        </div>
      )}

      {notice && (
        <div className="orders-alert orders-alert-success">
          {notice}
        </div>
      )}

      {showCreateForm && (
        <div className="orders-list-panel" style={{ marginBottom: 20 }}>
          <div className="orders-list-heading">
            <div>
              <h3>Create a customer order</h3>
              <p>Add products and enter the customer's delivery details.</p>
            </div>
            <ShoppingCart size={22} />
          </div>

          <form onSubmit={createOrder} style={{ padding: 16 }}>
            <h4>Customer information</h4>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12
            }}>
              <label>
                Customer name *
                <input
                  required
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Full name"
                  style={fieldStyle}
                />
              </label>

              <label>
                Phone number *
                <input
                  required
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  placeholder="08012345678"
                  style={fieldStyle}
                />
              </label>

              <label>
                Customer email *
                <input
                  required
                  type="email"
                  value={customerEmail}
                  onChange={(event) => setCustomerEmail(event.target.value)}
                  placeholder="customer@example.com"
                  style={fieldStyle}
                />
              </label>

              <label>
                Delivery address *
                <input
                  required
                  value={deliveryAddress}
                  onChange={(event) => setDeliveryAddress(event.target.value)}
                  placeholder="Full delivery address"
                  style={fieldStyle}
                />
              </label>
            </div>

            <div style={{ marginTop: 18 }}>
              <h4>Add products</h4>

              {loadingProducts ? (
                <p>Loading products...</p>
              ) : products.length === 0 ? (
                <p>No active products found. Add and activate products first.</p>
              ) : (
                <select
                  value=""
                  onChange={(event) => addProduct(event.target.value)}
                  style={fieldStyle}
                >
                  <option value="">Select a product to add</option>
                  {products.map((product) => (
                    <option
                      key={product.id}
                      value={product.id}
                      disabled={
                        product.stock_quantity !== null &&
                        product.stock_quantity <= 0
                      }
                    >
                      {product.name} — {money(product.price)}
                      {product.stock_quantity !== null
                        ? ` (Stock: ${product.stock_quantity})`
                        : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {cart.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h4>Order items</h4>

                {cart.map((item) => {
                  const product = products.find(
                    (entry) => entry.id === item.product_id
                  );

                  if (!product) return null;

                  return (
                    <div
                      key={item.product_id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) 90px 90px 36px",
                        gap: 8,
                        alignItems: "center",
                        padding: "12px 0",
                        borderBottom: "1px solid #e5e7eb"
                      }}
                    >
                      <div>
                        <strong>{product.name}</strong>
                        <div>{money(product.price)} each</div>
                      </div>

                      <input
                        type="number"
                        min="1"
                        max={product.stock_quantity ?? 100}
                        value={item.quantity}
                        onChange={(event) =>
                          changeQuantity(
                            item.product_id,
                            Number(event.target.value)
                          )
                        }
                        aria-label={`Quantity for ${product.name}`}
                        style={fieldStyle}
                      />

                      <strong>
                        {money(Number(product.price) * item.quantity)}
                      </strong>

                      <button
                        type="button"
                        onClick={() => removeCartItem(item.product_id)}
                        title="Remove product"
                        style={removeButtonStyle}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  );
                })}

                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "16px 0",
                  fontSize: 17
                }}>
                  <strong>Products subtotal</strong>
                  <strong>{money(cartSubtotal)}</strong>
                </div>
              </div>
            )}

            <div style={{ marginTop: 18 }}>
              <h4>Payment method</h4>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12
              }}>
                <label style={paymentOptionStyle}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="ONLINE"
                    checked={paymentMethod === "ONLINE"}
                    onChange={() => setPaymentMethod("ONLINE")}
                  />
                  <span>
                    <strong>ONLINE</strong>
                    <small style={{ display: "block" }}>
                      Customer pays the full order total through Paystack.
                    </small>
                  </span>
                </label>

                <label style={paymentOptionStyle}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="POD"
                    checked={paymentMethod === "POD"}
                    onChange={() => setPaymentMethod("POD")}
                  />
                  <span>
                    <strong>POD</strong>
                    <small style={{ display: "block" }}>
                      Customer pays delivery fee through Paystack first; product payment is due on delivery.
                    </small>
                  </span>
                </label>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <label>
                Order notes (optional)
                <textarea
                  value={orderNotes}
                  onChange={(event) => setOrderNotes(event.target.value)}
                  placeholder="Additional instructions"
                  rows={3}
                  style={{ ...fieldStyle, resize: "vertical" }}
                />
              </label>
            </div>

            <div style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              marginTop: 20
            }}>
              <button
                type="submit"
                className="order-action-primary"
                disabled={creatingOrder || cart.length === 0}
              >
                <ShoppingCart size={16} />
                {creatingOrder ? "Creating order..." : "Create order and open Paystack"}
              </button>

              <button
                type="button"
                className="orders-refresh"
                disabled={creatingOrder}
                onClick={resetCreateForm}
              >
                Clear form
              </button>
            </div>

            <p style={{ fontSize: 12, marginTop: 12, opacity: 0.75 }}>
              Product prices and stock are validated by Supabase when the order is created. Delivery charges are calculated using your business shipping settings.
            </p>
          </form>
        </div>
      )}

      <div className="orders-summary">
        <div className="orders-summary-card">
          <span>Total orders</span>
          <strong>{orders.length}</strong>
        </div>

        <div className="orders-summary-card">
          <span>Pending</span>
          <strong>{pendingCount}</strong>
        </div>

        <div className="orders-summary-card">
          <span>Dispatched</span>
          <strong>{dispatchedCount}</strong>
        </div>

        <div className="orders-summary-card">
          <span>Completed</span>
          <strong>{completedCount}</strong>
        </div>
      </div>

      <div className="orders-list-panel">
        <div className="orders-list-heading">
          <div>
            <h3>Customer orders</h3>
            <p>Latest 100 orders</p>
          </div>

          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            aria-label="Filter orders"
          >
            <option value="ALL">All orders</option>
            <option value="PENDING">Pending</option>
            <option value="DISPATCHED">Dispatched</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        {loading ? (
          <div className="orders-empty">
            Loading orders...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="orders-empty">
            <Package size={34} />
            <strong>No orders found</strong>
            <p>Customer orders will appear here when received.</p>
          </div>
        ) : (
          <div className="orders-list">
            {filteredOrders.map((order) => {
              const expanded = expandedOrder === order.id;
              const isBusy = busyOrder === order.id;
              const status = String(order.status).toUpperCase();

              const paymentReady =
                order.payment_method === "POD"
                  ? order.shipping_payment_required &&
                    order.shipping_payment_status === "PAID"
                  : order.payment_status === "PAID";

              return (
                <article className="order-card" key={order.id}>
                  <div className="order-card-top">
                    <div>
                      <strong className="order-number">
                        {order.order_number}
                      </strong>
                      <small>{dateTime(order.created_at)}</small>
                    </div>

                    <span className={statusClass(status)}>
                      {status}
                    </span>
                  </div>

                  <div className="order-customer">
                    <strong>{order.customer_name || "Customer"}</strong>
                    <a href={`tel:${order.customer_phone}`}>
                      {order.customer_phone}
                    </a>
                    {order.delivery_address && (
                      <span>{order.delivery_address}</span>
                    )}
                  </div>

                  <div className="order-financials">
                    <div>
                      <span>Products</span>
                      <strong>{money(order.subtotal)}</strong>
                    </div>

                    <div>
                      <span>Delivery</span>
                      <strong>{money(order.delivery_fee)}</strong>
                    </div>

                    <div>
                      <span>Order total</span>
                      <strong>{money(order.total)}</strong>
                    </div>
                  </div>

                  <div className="order-payment-info">
                    <span>
                      Payment:{" "}
                      <strong>{order.payment_method || "ONLINE"}</strong>
                    </span>

                    <span className={statusClass(
                      order.payment_method === "POD"
                        ? order.shipping_payment_status
                        : order.payment_status
                    )}>
                      {order.payment_method === "POD"
                        ? `Delivery fee: ${order.shipping_payment_status}`
                        : `Payment: ${order.payment_status}`}
                    </span>

                    <span className={statusClass(order.sales_fee_status)}>
                      Commission: {order.sales_fee_status}
                    </span>
                  </div>

                  <button
                    className="order-details-toggle"
                    onClick={() =>
                      setExpandedOrder(expanded ? "" : order.id)
                    }
                  >
                    {expanded ? "Hide details" : "View order details"}
                    {expanded ? (
                      <ChevronUp size={17} />
                    ) : (
                      <ChevronDown size={17} />
                    )}
                  </button>

                  {expanded && (
                    <div className="order-details">
                      <h4>Items ordered</h4>

                      {(order.items || []).map((item, index) => (
                        <div
                          className="order-item"
                          key={item.id || `${order.id}-${index}`}
                        >
                          <span>
                            {item.product_name} × {item.quantity}
                          </span>
                          <strong>{money(item.line_total)}</strong>
                        </div>
                      ))}

                      <div className="order-detail-row">
                        <span>Payment status</span>
                        <strong>{order.payment_status}</strong>
                      </div>

                      <div className="order-detail-row">
                        <span>Shipping payment</span>
                        <strong>{order.shipping_payment_status}</strong>
                      </div>

                      <div className="order-detail-row">
                        <span>Sabi commission</span>
                        <strong>
                          {money(order.sales_fee_amount)} — {order.sales_fee_status}
                        </strong>
                      </div>

                      {order.notes && (
                        <div className="order-notes">
                          <strong>Customer note</strong>
                          <p>{order.notes}</p>
                        </div>
                      )}

                      {order.cancellation_reason && (
                        <div className="order-notes">
                          <strong>Cancellation reason</strong>
                          <p>{order.cancellation_reason}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {status !== "CANCELLED" &&
                    status !== "COMPLETED" && (
                    <div className="order-actions">
                      {status === "PENDING" && (
                        <button
                          className="order-action-primary"
                          disabled={isBusy || !paymentReady}
                          onClick={() =>
                            runOrderAction(order.id, "dispatch")
                          }
                          title={
                            !paymentReady
                              ? "Required payment has not been verified."
                              : "Dispatch order"
                          }
                        >
                          <Truck size={16} />
                          {isBusy ? "Please wait..." : "Dispatch order"}
                        </button>
                      )}

                      {status === "DISPATCHED" && (
                        <button
                          className="order-action-primary"
                          disabled={isBusy}
                          onClick={() =>
                            runOrderAction(order.id, "confirm")
                          }
                        >
                          <CheckCircle size={16} />
                          {isBusy ? "Please wait..." : "Confirm delivery"}
                        </button>
                      )}

                      {status === "PENDING" && (
                        <button
                          className="order-action-danger"
                          disabled={isBusy}
                          onClick={() =>
                            runOrderAction(order.id, "cancel")
                          }
                        >
                          <XCircle size={16} />
                          Cancel order
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 12px",
  marginTop: 6,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  background: "transparent",
  color: "inherit",
  fontSize: 14
};

const paymentOptionStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  padding: 12,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  cursor: "pointer"
};

const removeButtonStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#dc2626",
  cursor: "pointer",
  padding: 6
};
