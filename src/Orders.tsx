
import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  Package,
  Truck,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp
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
  const [loading, setLoading] = useState(true);
  const [busyOrder, setBusyOrder] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expandedOrder, setExpandedOrder] = useState("");
  const [filter, setFilter] = useState("ALL");

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

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

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

    setNotice(
      result?.message || successMessages[action]
    );

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
          <p>Review customer orders, dispatch and confirm deliveries.</p>
        </div>

        <button
          className="orders-refresh"
          onClick={loadOrders}
          disabled={loading}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

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
