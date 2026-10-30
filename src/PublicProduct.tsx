
import { useEffect, useRef, useState } from "react";
import {
  ShoppingBag,
  MessageCircle,
  Package,
  ArrowLeft,
  RefreshCw,
  Store,
  CreditCard,
  Truck,
  CheckCircle,
  AlertCircle
} from "lucide-react";
import { supabase } from "./lib/supabase";

type PublicProductData = {
  product_id: string;
  product_name: string;
  product_description: string | null;
  product_category: string | null;
  product_price: number | string | null;
  product_stock: number;
  product_image_url: string | null;
  business_name: string;
  business_logo: string | null;
  business_brand_color: string | null;
  business_slug: string;
  business_whatsapp: string | null;
};

type CheckoutSettings = {
  shipping_enabled: boolean;
  shipping_fee: number | string;
  pod_enabled: boolean;
  require_shipping_payment_before_dispatch: boolean;
};

const money = (value: number) =>
  `₦${value.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

export default function PublicProduct() {
  const [product, setProduct] = useState<PublicProductData | null>(null);
  const [settings, setSettings] = useState<CheckoutSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"ONLINE" | "POD">("ONLINE");
  const [submitting, setSubmitting] = useState(false);
  const [paymentChecking, setPaymentChecking] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentWarning, setPaymentWarning] = useState(false);
  const verificationStarted = useRef(false);

  const productId = new URLSearchParams(
    window.location.search
  ).get("product");

  useEffect(() => {
    let cancelled = false;

    async function loadProduct() {
      if (!productId) {
        setError("No product was specified.");
        setLoading(false);
        return;
      }

      const { data, error: lookupError } = await supabase.rpc(
        "sabi_get_public_product",
        { p_product_id: productId }
      );

      if (cancelled) return;

      if (lookupError) {
        setError("Unable to load this product. Please try again.");
        setLoading(false);
        return;
      }

      const result = Array.isArray(data) ? data[0] : null;

      if (!result) {
        setError("This product is unavailable or no longer exists.");
        setLoading(false);
        return;
      }

      setProduct(result as PublicProductData);

      const { data: checkoutData } = await supabase.rpc(
        "sabi_get_public_checkout_settings",
        { p_product_id: productId }
      );

      if (cancelled) return;

      const checkout = Array.isArray(checkoutData)
        ? checkoutData[0]
        : null;

      if (checkout) {
        setSettings(checkout as CheckoutSettings);
      }

      setLoading(false);
    }

    loadProduct();

    return () => {
      cancelled = true;
    };
  }, [productId]);

  // Verify a Paystack payment when the customer returns to this page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnedReference = params.get("reference");
    const returnedFromPayment = params.get("payment") === "return";

    if (
      !returnedFromPayment ||
      !returnedReference ||
      verificationStarted.current
    ) {
      return;
    }

    verificationStarted.current = true;

    // Remove callback parameters so refresh does not repeat verification.
    params.delete("reference");
    params.delete("payment");

    const cleanQuery = params.toString();
    const cleanUrl =
      window.location.pathname +
      (cleanQuery ? `?${cleanQuery}` : "") +
      window.location.hash;

    window.history.replaceState({}, document.title, cleanUrl);

    async function verifyPayment() {
      setPaymentChecking(true);
      setPaymentMessage("Verifying your payment with Paystack. Please wait.");

      const { data, error: verifyError } =
        await supabase.functions.invoke("order-api", {
          body: {
            action: "verify",
            reference: returnedReference
          }
        });

      setPaymentChecking(false);

      if (verifyError) {
        setPaymentMessage(
          "We could not complete payment verification. Please contact the merchant with your payment reference: " +
          returnedReference
        );
        setPaymentWarning(true);
        return;
      }

      if (data?.payment_confirmed === true) {
        setPaymentSuccess(true);

        if (data?.commission_paid === false) {
          setPaymentWarning(true);
          setPaymentMessage(
            "Your payment was received. The merchant's Sabi wallet needs a top-up before this order can be dispatched. Please contact the merchant."
          );
        } else if (data?.dispatch_allowed === false) {
          setPaymentMessage(
            "Your payment was confirmed. Your order is awaiting the next processing step."
          );
        } else {
          setPaymentMessage(
            "Your payment has been confirmed successfully. Your order has been recorded."
          );
        }

        return;
      }

      setPaymentWarning(true);
      setPaymentMessage(
        data?.message ||
        "Payment has not yet been confirmed. Please contact the merchant if your account was debited."
      );
    }

    verifyPayment();
  }, []);

  const brandColor = product?.business_brand_color || "#25D366";

  const whatsappNumber = product?.business_whatsapp
    ? product.business_whatsapp.replace(/\D/g, "")
    : "";

  const productLink = window.location.href;

  const whatsappMessage = product
    ? `Hello ${product.business_name}, I am interested in ${product.product_name}.\n\nProduct link: ${productLink}\n\nPlease provide more information.`
    : "";

  const whatsappLink = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
        whatsappMessage
      )}`
    : "";

  const unitPrice = Number(product?.product_price || 0);
  const subtotal = unitPrice * quantity;
  const shippingEnabled =
    settings?.shipping_enabled === true &&
    Number(settings?.shipping_fee || 0) > 0;
  const deliveryFee = shippingEnabled
    ? Number(settings?.shipping_fee || 0)
    : 0;

  const podAvailable =
    shippingEnabled &&
    settings?.pod_enabled === true &&
    settings?.require_shipping_payment_before_dispatch === true;

  const onlinePaymentAmount = subtotal + deliveryFee;
  const paymentAmount =
    paymentMethod === "POD" ? deliveryFee : onlinePaymentAmount;

  async function submitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!product) return;

    if (quantity < 1 || quantity > 100 || quantity > product.product_stock) {
      setPaymentWarning(true);
      setPaymentMessage("Please select a valid quantity within available stock.");
      return;
    }

    if (paymentMethod === "POD" && !podAvailable) {
      setPaymentWarning(true);
      setPaymentMessage("Pay on Delivery is not available for this product.");
      return;
    }

    setSubmitting(true);
    setPaymentMessage("");
    setPaymentWarning(false);

    try {
      const { data, error: orderError } =
        await supabase.functions.invoke("order-api", {
          body: {
            action: "create",
            product_id: product.product_id,
            quantity,
            customer_name: customerName.trim(),
            customer_phone: customerPhone.trim(),
            customer_email: customerEmail.trim(),
            delivery_address: deliveryAddress.trim(),
            notes: notes.trim(),
            payment_method: paymentMethod
          }
        });

      if (orderError) {
        throw new Error(orderError.message || "Could not create your order.");
      }

      if (!data?.success || !data?.authorization_url) {
        throw new Error(
          data?.message ||
          "Your order could not proceed to payment. Please contact the merchant before trying again."
        );
      }

      window.location.href = data.authorization_url;
    } catch (err) {
      setPaymentWarning(true);
      setPaymentMessage(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main style={styles.centerPage}>
        <RefreshCw size={30} className="public-spin" />
        <p>Loading product...</p>
      </main>
    );
  }

  if (error || !product) {
    return (
      <main style={styles.centerPage}>
        <Package size={42} color="#94a3b8" />
        <h2>Product unavailable</h2>
        <p>{error || "We could not find this product."}</p>
        <a href="/" style={styles.backLink}>
          <ArrowLeft size={17} />
          Back to Sabi
        </a>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <a href="/" style={styles.brand}>
          {product.business_logo ? (
            <img
              src={product.business_logo}
              alt={product.business_name}
              style={styles.logo}
            />
          ) : (
            <span
              style={{
                ...styles.logoPlaceholder,
                background: brandColor
              }}
            >
              <Store size={22} color="#fff" />
            </span>
          )}

          <strong>{product.business_name}</strong>
        </a>

        <span style={styles.powered}>Powered by Sabi</span>
      </header>

      <section style={styles.productCard}>
        <div style={styles.imageContainer}>
          {product.product_image_url ? (
            <img
              src={product.product_image_url}
              alt={product.product_name}
              style={styles.productImage}
            />
          ) : (
            <div style={styles.noImage}>
              <ShoppingBag size={54} color="#94a3b8" />
              <span>No product image</span>
            </div>
          )}
        </div>

        <div style={styles.details}>
          {product.product_category && (
            <span style={styles.category}>
              {product.product_category}
            </span>
          )}

          <h1 style={styles.productName}>{product.product_name}</h1>

          <h2 style={{ ...styles.price, color: brandColor }}>
            {money(unitPrice)}
          </h2>

          <div style={styles.stock}>
            <span
              style={{
                ...styles.stockDot,
                background:
                  product.product_stock > 0 ? "#16a34a" : "#dc2626"
              }}
            />
            {product.product_stock > 0
              ? `${product.product_stock} available`
              : "Currently out of stock"}
          </div>

          {product.product_description && (
            <div style={styles.description}>
              <h3>Product description</h3>
              <p>{product.product_description}</p>
            </div>
          )}

          {paymentChecking && (
            <div style={styles.messageBox}>
              <RefreshCw size={19} />
              {paymentMessage}
            </div>
          )}

          {paymentMessage && !paymentChecking && (
            <div
              style={{
                ...styles.messageBox,
                background: paymentSuccess && !paymentWarning
                  ? "#f0fdf4"
                  : "#fff7ed",
                color: paymentSuccess && !paymentWarning
                  ? "#166534"
                  : "#9a3412"
              }}
            >
              {paymentSuccess && !paymentWarning
                ? <CheckCircle size={20} />
                : <AlertCircle size={20} />}
              <span>{paymentMessage}</span>
            </div>
          )}

          {product.product_stock > 0 && (
            <section style={styles.checkout}>
              <h2 style={styles.sectionTitle}>
                <ShoppingBag size={21} />
                Place your order
              </h2>

              <form onSubmit={submitOrder} style={styles.form}>
                <label style={styles.label}>
                  Quantity
                  <input
                    style={styles.input}
                    type="number"
                    min="1"
                    max={Math.min(100, product.product_stock)}
                    value={quantity}
                    onChange={(e) =>
                      setQuantity(
                        Math.max(1, Number(e.target.value) || 1)
                      )
                    }
                    required
                  />
                </label>

                <label style={styles.label}>
                  Your full name
                  <input
                    style={styles.input}
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Enter your name"
                    required
                  />
                </label>

                <label style={styles.label}>
                  Phone number
                  <input
                    style={styles.input}
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="e.g. 08012345678"
                    required
                  />
                </label>

                <label style={styles.label}>
                  Email address
                  <input
                    style={styles.input}
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </label>

                <label style={styles.label}>
                  Delivery address
                  <textarea
                    style={styles.textarea}
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Enter your delivery address"
                    required
                    rows={3}
                  />
                </label>

                <label style={styles.label}>
                  Additional notes (optional)
                  <textarea
                    style={styles.textarea}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any special instructions?"
                    rows={2}
                  />
                </label>

                <div style={styles.paymentChoices}>
                  <strong>Payment method</strong>

                  <label style={styles.paymentOption}>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="ONLINE"
                      checked={paymentMethod === "ONLINE"}
                      onChange={() => setPaymentMethod("ONLINE")}
                    />
                    <span>
                      <strong>Pay online</strong>
                      <small>
                        Pay for your product and delivery (if applicable) now.
                      </small>
                    </span>
                  </label>

                  {podAvailable && (
                    <label style={styles.paymentOption}>
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="POD"
                        checked={paymentMethod === "POD"}
                        onChange={() => setPaymentMethod("POD")}
                      />
                      <span>
                        <strong>Pay on Delivery</strong>
                        <small>
                          Pay the delivery fee online now. Pay the product amount
                          to the merchant when it is delivered.
                        </small>
                      </span>
                    </label>
                  )}
                </div>

                <div style={styles.summary}>
                  <div style={styles.summaryRow}>
                    <span>Product subtotal</span>
                    <strong>{money(subtotal)}</strong>
                  </div>

                  <div style={styles.summaryRow}>
                    <span>
                      <Truck size={15} style={{ verticalAlign: "middle" }} />
                      {" "}Delivery fee
                    </span>
                    <strong>
                      {deliveryFee > 0 ? money(deliveryFee) : "Not applicable"}
                    </strong>
                  </div>

                  <div style={styles.summaryDivider} />

                  <div style={styles.summaryRow}>
                    <strong>
                      {paymentMethod === "POD"
                        ? "Pay now"
                        : "Total payable"}
                    </strong>
                    <strong style={{ color: brandColor, fontSize: 20 }}>
                      {money(paymentAmount)}
                    </strong>
                  </div>

                  {paymentMethod === "POD" && (
                    <p style={styles.podNote}>
                      The product amount of {money(subtotal)} is payable directly
                      to the merchant when your order is delivered. Only the
                      delivery fee is collected online now.
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={submitting || paymentChecking}
                  style={{
                    ...styles.orderButton,
                    background: brandColor,
                    opacity: submitting ? 0.65 : 1
                  }}
                >
                  <CreditCard size={19} />
                  {submitting
                    ? "Preparing your payment..."
                    : `Continue to Paystack — ${money(paymentAmount)}`}
                </button>

                <p style={styles.secureNote}>
                  Your payment will be processed securely through Paystack.
                </p>
              </form>
            </section>
          )}

          {whatsappNumber && (
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.whatsappButton}
            >
              <MessageCircle size={19} />
              Contact merchant on WhatsApp
            </a>
          )}

          {!whatsappNumber && (
            <p style={styles.notice}>
              This merchant has not connected a business WhatsApp number yet.
              You can still place an order using the checkout form above.
            </p>
          )}

          <p style={styles.footerText}>
            Secure product information provided by {product.business_name}.
          </p>
        </div>
      </section>

      <footer style={styles.pageFooter}>
        <span>© {new Date().getFullYear()} {product.business_name}</span>
        <span>Store powered by Sabi by XTOP</span>
      </footer>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f4f7f6",
    color: "#17211d",
    fontFamily: "Arial, sans-serif"
  },
  header: {
    minHeight: 68,
    padding: "12px 5%",
    background: "#fff",
    borderBottom: "1px solid #e5e7eb",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: "#17211d",
    textDecoration: "none",
    fontSize: 15
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 10,
    objectFit: "cover"
  },
  logoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  powered: { color: "#64748b", fontSize: 12 },
  productCard: {
    width: "min(100% - 32px, 950px)",
    margin: "35px auto",
    background: "#fff",
    borderRadius: 18,
    overflow: "hidden",
    boxShadow: "0 8px 35px rgba(0,0,0,0.06)",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))"
  },
  imageContainer: { minHeight: 300, background: "#f1f5f9" },
  productImage: {
    width: "100%",
    height: "100%",
    minHeight: 300,
    maxHeight: 560,
    objectFit: "cover",
    display: "block"
  },
  noImage: {
    minHeight: 350,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    color: "#64748b"
  },
  details: {
    padding: "32px 26px",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start"
  },
  category: {
    padding: "6px 11px",
    background: "#f0fdf4",
    color: "#15803d",
    borderRadius: 20,
    fontSize: 12
  },
  productName: {
    fontSize: "clamp(25px, 5vw, 36px)",
    lineHeight: 1.2,
    margin: "16px 0 8px"
  },
  price: { fontSize: 27, margin: "8px 0 15px" },
  stock: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "#475569"
  },
  stockDot: { width: 9, height: 9, borderRadius: "50%" },
  description: {
    marginTop: 25,
    width: "100%",
    lineHeight: 1.7,
    color: "#475569"
  },
  checkout: {
    marginTop: 30,
    width: "100%",
    borderTop: "1px solid #e5e7eb",
    paddingTop: 22
  },
  sectionTitle: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    fontSize: 20,
    margin: "0 0 20px"
  },
  form: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 15
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 7,
    width: "100%",
    fontSize: 13,
    fontWeight: 600,
    color: "#334155"
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 46,
    padding: "11px 12px",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    fontSize: 15,
    background: "#fff",
    color: "#17211d"
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 12px",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    fontSize: 14,
    minHeight: 65,
    resize: "vertical",
    fontFamily: "Arial, sans-serif",
    background: "#fff",
    color: "#17211d"
  },
  paymentChoices: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginTop: 5
  },
  paymentOption: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: 13,
    border: "1px solid #dbe3e8",
    borderRadius: 9,
    cursor: "pointer",
    fontSize: 14
  },
  summary: {
    width: "100%",
    boxSizing: "border-box",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: 15,
    display: "flex",
    flexDirection: "column",
    gap: 12
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    fontSize: 14
  },
  summaryDivider: { borderTop: "1px solid #cbd5e1" },
  podNote: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.6,
    color: "#92400e"
  },
  orderButton: {
    minHeight: 50,
    padding: "12px 16px",
    border: 0,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    width: "100%",
    boxSizing: "border-box",
    color: "#fff",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer"
  },
  whatsappButton: {
    marginTop: 18,
    minHeight: 48,
    padding: "0 15px",
    borderRadius: 10,
    background: "#e8f8ee",
    color: "#15803d",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    width: "100%",
    boxSizing: "border-box",
    fontWeight: 700,
    fontSize: 14,
    textDecoration: "none"
  },
  secureNote: {
    margin: 0,
    fontSize: 11,
    color: "#64748b",
    textAlign: "center"
  },
  messageBox: {
    marginTop: 18,
    width: "100%",
    boxSizing: "border-box",
    padding: 13,
    borderRadius: 9,
    background: "#eff6ff",
    color: "#1d4ed8",
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    fontSize: 13,
    lineHeight: 1.6
  },
  unavailableButton: {
    marginTop: 28,
    minHeight: 50,
    padding: "0 15px",
    borderRadius: 10,
    background: "#e5e7eb",
    color: "#64748b",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    width: "100%",
    boxSizing: "border-box",
    fontWeight: 600,
    fontSize: 14
  },
  notice: {
    fontSize: 12,
    lineHeight: 1.6,
    color: "#64748b",
    marginTop: 15
  },
  footerText: { marginTop: 24, fontSize: 11, color: "#94a3b8" },
  pageFooter: {
    padding: 20,
    display: "flex",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 12,
    color: "#94a3b8",
    fontSize: 11
  },
  centerPage: {
    minHeight: "100vh",
    padding: 24,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    fontFamily: "Arial, sans-serif",
    color: "#475569"
  },
  backLink: {
    marginTop: 15,
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "#15803d",
    textDecoration: "none"
  }
};
