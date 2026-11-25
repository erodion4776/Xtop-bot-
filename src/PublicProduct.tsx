
import { useEffect, useRef, useState } from "react";
import {
  ShoppingBag,
  MessageCircle,
  Package,
  ArrowLeft,
  RefreshCw,
  CreditCard,
  Truck,
  CheckCircle,
  AlertCircle,
  Share2,
  ShoppingCart
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { addToMarketplaceCart, getMarketplaceCart } from "./marketplaceCart";

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
  const [imageError, setImageError] = useState(false);
  const [sellerReviews, setSellerReviews] = useState<{ rating: number; review_text: string | null; created_at: string }[]>([]);
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
  const [cartAdded, setCartAdded] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const verificationStarted = useRef(false);

  useEffect(() => {
    if (checkoutOpen) {
      document.getElementById("product-checkout")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [checkoutOpen]);

  useEffect(() => {
    const updateCartCount = () => setCartCount(getMarketplaceCart().reduce((total, item) => total + Number(item.quantity || 0), 0));
    updateCartCount();
    window.addEventListener("sabi-cart-updated", updateCartCount);
    window.addEventListener("storage", updateCartCount);
    return () => {
      window.removeEventListener("sabi-cart-updated", updateCartCount);
      window.removeEventListener("storage", updateCartCount);
    };
  }, []);

  const productId = new URLSearchParams(
    window.location.search
  ).get("product");

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return;
      if (data.user.email) setCustomerEmail(current => current || data.user!.email || "");
      const savedName = String(data.user.user_metadata?.full_name || "");
      if (savedName) setCustomerName(current => current || savedName);
    });
    return () => { cancelled = true; };
  }, []);

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
      setImageError(false);
      const { data: reviewData } = await supabase.rpc("sabi_get_public_product_seller_reviews", { p_product_id: productId });
      if (!cancelled) setSellerReviews((reviewData || []) as { rating: number; review_text: string | null; created_at: string }[]);

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

  useEffect(() => {
    if (!product) return;
    const pageUrl = `https://discover.sabibyxtop.com.ng/?product=${encodeURIComponent(product.product_id)}`;
    const productSummary = (product.product_description || "").split(/\r?\n/).filter(line => !/(super\s*admin|paystack.{0,30}debug|debug.{0,30}paystack|internal.{0,20}(test|debug)|test.{0,20}(admin|paystack))/i.test(line)).join(" ").replace(/\s+/g, " ").trim();
    const productPrice = money(Number(product.product_price || 0));
    const stockSummary = Number(product.product_stock || 0) > 0 ? "In stock and available to order." : "Currently out of stock.";
    const description = [
      `Shop ${product.product_name} from ${product.business_name} on Sabi Discover.`,
      productSummary,
      `Price: ${productPrice}.`,
      stockSummary
    ].filter(Boolean).join(" ").slice(0, 300);
    const title = `${product.product_name} | ${productPrice} | ${product.business_name} on Sabi`;
    document.title = title;
    const setMeta = (selector: string, attribute: string, value: string) => {
      let element = document.head.querySelector(selector) as HTMLMetaElement | null;
      if (!element) {
        element = document.createElement("meta");
        if (selector.startsWith('meta[property=')) element.setAttribute("property", attribute);
        else element.setAttribute("name", attribute);
        document.head.appendChild(element);
      }
      element.setAttribute("content", value);
    };
    setMeta('meta[name="description"]', "description", description);
    setMeta('meta[property="og:type"]', "og:type", "product");
    setMeta('meta[property="og:title"]', "og:title", title);
    setMeta('meta[property="og:description"]', "og:description", description);
    setMeta('meta[property="og:url"]', "og:url", pageUrl);
    setMeta('meta[property="og:site_name"]', "og:site_name", "Sabi Discover");
    setMeta('meta[property="product:price:amount"]', "product:price:amount", Number(product.product_price || 0).toFixed(2));
    setMeta('meta[property="product:price:currency"]', "product:price:currency", "NGN");
    setMeta('meta[property="og:image"]', "og:image", product.product_image_url || "https://i.ibb.co/N2b6rJnY/Untitled-design-20261030-044935-0000.png");
    setMeta('meta[name="twitter:card"]', "twitter:card", "summary_large_image");
    setMeta('meta[name="twitter:title"]', "twitter:title", title);
    setMeta('meta[name="twitter:description"]', "twitter:description", description);
    let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = pageUrl;
    document.getElementById("sabi-product-jsonld")?.remove();
    const structuredData = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.product_name,
      description,
      image: product.product_image_url ? [product.product_image_url] : undefined,
      sku: product.product_id,
      category: product.product_category || undefined,
      brand: { "@type": "Brand", name: product.business_name },
      offers: {
        "@type": "Offer",
        url: pageUrl,
        priceCurrency: "NGN",
        price: Number(product.product_price || 0).toFixed(2),
        availability: product.product_stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        seller: { "@type": "Organization", name: product.business_name }
      }
    };
    const schema = document.createElement("script");
    schema.id = "sabi-product-jsonld";
    schema.type = "application/ld+json";
    schema.textContent = JSON.stringify(structuredData);
    document.head.appendChild(schema);
    return () => document.getElementById("sabi-product-jsonld")?.remove();
  }, [product]);

  async function shareProduct() {
    if (!product) return;
    const url = `https://discover.sabibyxtop.com.ng/share/product/${encodeURIComponent(product.product_id)}`;
    const shareData = {
      title: product.product_name,
      text: `Check out ${product.product_name} from ${product.business_name} on Sabi Discover.`,
      url
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShareMessage("Product shared.");
      } else {
        await navigator.clipboard.writeText(url);
        setShareMessage("Product link copied. Share it on WhatsApp or social media.");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        setShareMessage("Product link copied. Share it on WhatsApp or social media.");
      } catch {
        setShareMessage("Copy the product link from your browser address bar to share it.");
      }
    }
  }

  const brandColor = product?.business_brand_color || "#25D366";
  const maxQuantity = Math.max(1, Math.min(100, Number(product?.product_stock || 1)));
  const displayDescription = (product?.product_description || "")
    .split(/\r?\n/)
    .filter(line => !/(super\s*admin|paystack.{0,30}debug|debug.{0,30}paystack|internal.{0,20}(test|debug)|test.{0,20}(admin|paystack))/i.test(line))
    .join("\n")
    .trim();

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

  async function saveAbandonedCart() {
    const email = customerEmail.trim().toLowerCase();
    if (!product || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) return;
    try {
      const { error: cartError } = await supabase.rpc("sabi_capture_abandoned_cart", {
        p_product_id: product.product_id,
        p_customer_email: email,
        p_customer_name: customerName.trim(),
        p_customer_phone: customerPhone.trim(),
        p_quantity: quantity,
        p_checkout_url: window.location.href
      });
      if (cartError) console.warn("Sabi cart reminder tracking was not saved.", cartError);
    } catch (cartError) {
      console.warn("Sabi cart reminder tracking was not saved.", cartError);
    }
  }

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
      await saveAbandonedCart();
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

      // Link this public-store order to the signed-in Discover account only
      // when the verified account email matches the checkout email. This is
      // best-effort so a customer can still complete checkout if not signed in.
      const { data: authData } = await supabase.auth.getUser();
      if (
        authData.user &&
        authData.user.email?.toLowerCase() === customerEmail.trim().toLowerCase() &&
        data.order_id
      ) {
        const { error: linkError } = await supabase.rpc(
          "sabi_link_discover_customer_order",
          { p_order_id: data.order_id }
        );
        if (linkError) console.warn("Could not link this order to the Discover account for later seller review.", linkError);
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
          <img src="https://i.ibb.co/N2b6rJnY/Untitled-design-20261030-044935-0000.png" alt="Sabi by XTOP" style={styles.logo} />
          <span><strong style={{display:"block",fontSize:18,color:"#176b4b"}}>Sabi</strong><small style={{fontSize:9,letterSpacing:1.2,color:"#64748b"}}>DISCOVER</small></span>
        </a>

        <div style={styles.headerActions}>
          <a href="/?cart=1" aria-label={`Open cart, ${cartCount} items`} style={styles.headerCart}>
            <ShoppingCart size={21} /> <span>Cart</span>
            {cartCount > 0 && <span style={styles.cartBadge}>{cartCount > 99 ? "99+" : cartCount}</span>}
          </a>
          <span style={styles.powered}>Powered by Sabi</span>
        </div>
      </header>

      <nav aria-label="Breadcrumb" style={{width:"min(100% - 32px,1200px)",boxSizing:"border-box",padding:"0 0",margin:"18px auto 12px",fontSize:12,color:"#64748b",display:"flex",alignItems:"center",gap:4,flexWrap:"wrap",minWidth:0}}>
        <a href="/" style={{color:"#176b4b",textDecoration:"none",fontWeight:600}}>Sabi Discover</a>
        <span>›</span>
        <a href={`/?store=${encodeURIComponent(product.business_slug)}`} style={{color:"#176b4b",textDecoration:"none",fontWeight:600}}>{product.business_name}</a>
        {product.product_category && product.product_category.trim().toLowerCase() !== product.product_name.trim().toLowerCase() && <><span>›</span><span>{product.product_category}</span></>}
        <span>›</span><span title={product.product_name} style={{color:"#334155",minWidth:0,maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{product.product_name}</span>
      </nav>

      <section style={styles.productCard}>
        <div style={styles.imageContainer}>
          {product.product_image_url && !imageError ? (
            <img
              src={product.product_image_url}
              alt={product.product_name}
              style={styles.productImage}
              onError={() => setImageError(true)}
            />
          ) : (
            <div style={styles.noImage}>
              <ShoppingBag size={54} color="#94a3b8" />
              <span>{product.product_image_url ? "Product image unavailable" : "No product image"}</span>
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

          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",margin:"0 0 12px",fontSize:12,color:"#64748b"}}>
            <span style={{color:"#176b4b",fontWeight:700}}>Sold by {product.business_name}</span>
            <a href={`/?store=${encodeURIComponent(product.business_slug)}`} style={{color:"#176b4b",textDecoration:"none",fontWeight:700}}>Visit store</a>
          </div>

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

          {product.product_stock > 0 && (
            <div style={styles.purchaseActions}>
              <div style={styles.quantityStepper} aria-label="Choose quantity">
                <span style={styles.quantityLabel}>Quantity</span>
                <button type="button" aria-label="Decrease quantity" onClick={() => setQuantity(value => Math.max(1, value - 1))} disabled={quantity <= 1} style={styles.stepperButton}>−</button>
                <strong style={styles.quantityValue}>{quantity}</strong>
                <button type="button" aria-label="Increase quantity" onClick={() => setQuantity(value => Math.min(maxQuantity, value + 1))} disabled={quantity >= maxQuantity} style={styles.stepperButton}>+</button>
              </div>
              <button type="button" onClick={() => {
                const updated = addToMarketplaceCart({ product_id: product.product_id, product_name: product.product_name, product_price: unitPrice, product_image_url: product.product_image_url, business_name: product.business_name, business_slug: product.business_slug, product_stock: Number(product.product_stock || 0) }, quantity);
                setCartCount(updated.reduce((total, item) => total + Number(item.quantity || 0), 0));
                setCartAdded(true);
              }} style={styles.addCartButton}>
                <ShoppingBag size={18} /> {cartAdded ? "Added to cart" : "Add to cart"}
              </button>
              <button type="button" onClick={() => setCheckoutOpen(true)} style={{...styles.buyNowButton, background: brandColor}}>
                <CreditCard size={18} /> Buy now
              </button>
              {whatsappNumber && <a href={whatsappLink} target="_blank" rel="noopener noreferrer" style={styles.whatsappButton}><MessageCircle size={18} aria-hidden="true" /> <span>Chat with seller on WhatsApp</span></a>}
              {cartAdded && <a href="/?cart=1" style={styles.viewCartLink}>View cart and checkout</a>}
            </div>
          )}

          <div style={{display:"flex",gap:16,flexWrap:"wrap",marginTop:18,padding:"14px 0",borderTop:"1px solid #edf0f2",borderBottom:"1px solid #edf0f2",fontSize:12,color:"#526b5d"}}>
            <span>✓ Secure checkout</span>
            <span>✓ Paystack protected payment</span>
            <span>✓ Order directly from seller</span>
          </div>

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
            <section style={styles.checkout} id="product-checkout" hidden={!checkoutOpen}>
              <h2 style={styles.sectionTitle}>
                <ShoppingBag size={21} />
                Place your order
              </h2>

              <form onSubmit={submitOrder} style={styles.form}>
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
                    onBlur={saveAbandonedCart}
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
                      <strong style={{display:"block",lineHeight:1.35,marginBottom:4}}>Pay online</strong>
                      <small style={{display:"block",lineHeight:1.5,color:"#64748b"}}>
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
                    : `Pay ${money(paymentAmount)} now`}
                </button>

                <div style={styles.paymentTrust}>
                  <div style={styles.paymentTrustIcon}><CreditCard size={18} /></div>
                  <div>
                    <strong style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Secure payment powered by Paystack</strong>
                    <span style={{ display: "block", fontSize: 12, lineHeight: 1.55, color: "#526b5d" }}>You will complete payment on Paystack's protected checkout. Sabi does not ask for or store your card PIN or one-time password.</span>
                  </div>
                </div>
                <p style={styles.secureNote}>
                  Your order is linked to {product.business_name} and is confirmed only after payment verification.
                </p>
              </form>
            </section>
          )}

          {!whatsappNumber && (
            <p style={styles.notice}>
              This merchant has not connected a business WhatsApp number yet.
              You can still place an order using Buy now.
            </p>
          )}

          <button
            type="button"
            onClick={shareProduct}
            style={{ width: "100%", minHeight: 46, marginTop: 12, border: "1px solid #cbd9cf", borderRadius: 9, background: "#f5faf6", color: "#176b4b", fontWeight: 750, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, cursor: "pointer" }}
          >
            <Share2 size={18} /> Share this product
          </button>
          {shareMessage && <p role="status" style={{ textAlign: "center", color: "#176b4b", fontSize: 12 }}>{shareMessage}</p>}


        </div>
      </section>

      <section style={{width:"min(100% - 32px,1200px)",margin:"0 auto 28px",background:"#fff",border:"1px solid #e5e7eb",borderRadius:10,padding:20,boxSizing:"border-box"}}>
        <h2 style={{fontSize:18,margin:"0 0 12px"}}>About this product</h2>
        <p style={{fontSize:14,lineHeight:1.7,color:"#526b5d",margin:0,whiteSpace:"pre-line"}}>{displayDescription || `Buy ${product.product_name} from ${product.business_name} on Sabi Discover.`}</p>
        <p style={{fontSize:12,color:"#64748b",margin:"12px 0 0"}}>Product information provided by the seller. Contact the merchant for more details.</p>
      </section>

      <section style={{width:"min(100% - 32px,1200px)",margin:"0 auto 28px",background:"#fff",border:"1px solid #e5e7eb",borderRadius:12,padding:20,boxSizing:"border-box"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <div><p style={{margin:"0 0 5px",fontSize:11,fontWeight:800,letterSpacing:1,color:"#176b4b"}}>SABI SELLER RATINGS</p>
            <h2 style={{fontSize:20,margin:"0 0 7px"}}>Customer reviews for {product.business_name}</h2>
            <p style={{margin:0,fontSize:13,color:"#64748b"}}>{sellerReviews.length ? "Based on " + sellerReviews.length + " verified purchase " + (sellerReviews.length===1?"review":"reviews") : "Be among the first customers to review this seller."}</p></div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:8,flexWrap:"wrap",textAlign:"right",minWidth:0}}>
            <span aria-label={sellerReviews.length ? "Average seller rating" : "No seller reviews yet"} style={{color:"#f59e0b",fontSize:18,letterSpacing:2,lineHeight:1}}>{sellerReviews.length ? "★".repeat(Math.round(sellerReviews.reduce((sum,r)=>sum+Number(r.rating),0)/sellerReviews.length)) + "☆".repeat(5-Math.round(sellerReviews.reduce((sum,r)=>sum+Number(r.rating),0)/sellerReviews.length)) : "☆☆☆☆☆"}</span>
            <strong style={{fontSize:14,color:"#176b4b",fontWeight:750}}>{sellerReviews.length ? (sellerReviews.reduce((sum,r)=>sum+Number(r.rating),0)/sellerReviews.length).toFixed(1) : "0.0"}{sellerReviews.length ? "" : " (No reviews yet)"}</strong>
          </div>
        </div>
        <div style={{display:"grid",gap:12,marginTop:sellerReviews.length ? 18 : 12}}>
          {sellerReviews.length ? sellerReviews.map((review,index)=><article key={index} style={{borderTop:"1px solid #edf1ee",paddingTop:13}}>
            <div style={{display:"flex",alignItems:"center",gap:9,flexWrap:"wrap"}}><strong style={{fontSize:13,color:"#24372c"}}>Verified Sabi buyer</strong>
              <span style={{color:"#f59e0b",letterSpacing:1}}>{"★".repeat(Number(review.rating))}{"☆".repeat(5-Number(review.rating))}</span>
              <small style={{color:"#94a3b8"}}>{new Date(review.created_at).toLocaleDateString("en-NG",{day:"numeric",month:"short",year:"numeric"})}</small></div>
            {review.review_text && <p style={{fontSize:13,lineHeight:1.65,color:"#526b5d",margin:"8px 0 0",whiteSpace:"pre-wrap"}}>{review.review_text}</p>}</article>) : <p style={{margin:0,padding:14,background:"#f7faf8",borderRadius:9,fontSize:13,color:"#64748b"}}>No seller reviews yet. Reviews from verified, completed orders will appear here.</p>}
        </div>
        <p style={{margin:"16px 0 0",paddingTop:13,borderTop:"1px solid #edf1ee",fontSize:12,lineHeight:1.6,color:"#64748b"}}>Only customers with a paid and completed order can submit a seller rating. Sign in to your Sabi Discover customer account and open your order reviews after delivery.</p>
        <a href="/" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",marginTop:10,minHeight:40,padding:"0 15px",borderRadius:8,background:"#176b4b",color:"#fff",fontSize:12,fontWeight:800,textDecoration:"none"}}>Go to Sabi Discover</a>
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
    background: "#f4f6f8",
    color: "#282c34",
    fontFamily: "Arial, sans-serif"
  },
  header: {
    minHeight: 68,
    padding: "12px max(5%, calc((100% - 1200px)/2))",
    background: "#fff",
    borderBottom: "1px solid #e5e7eb",
    boxShadow: "0 2px 8px rgba(0,0,0,.04)",
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
  headerActions: { display: "flex", alignItems: "center", gap: 16 },
  headerCart: { position: "relative", display: "inline-flex", alignItems: "center", gap: 6, color: "#176b4b", textDecoration: "none", fontWeight: 700, fontSize: 13, padding: "9px 11px", border: "1px solid #dbe7df", borderRadius: 9, whiteSpace: "nowrap" },
  cartBadge: { position: "absolute", top: -7, right: -7, minWidth: 18, height: 18, padding: "0 4px", borderRadius: 99, background: "#dc2626", color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" },
  purchaseActions: { width: "100%", display: "flex", flexDirection: "column", gap: 10, marginTop: 18 },
  quantityStepper: { display: "flex", alignItems: "center", gap: 0, alignSelf: "flex-start", border: "1px solid #cbd5e1", borderRadius: 9, overflow: "hidden", background: "#fff" },
  quantityLabel: { fontSize: 12, color: "#64748b", fontWeight: 600, padding: "0 12px" },
  stepperButton: { width: 42, height: 42, border: 0, borderLeft: "1px solid #e2e8f0", background: "#f8fafc", color: "#176b4b", fontSize: 22, fontWeight: 700, cursor: "pointer" },
  quantityValue: { minWidth: 38, textAlign: "center", fontSize: 15, color: "#17211d" },
  addCartButton: { width: "100%", minHeight: 48, padding: "0 12px", border: "1px solid #cbd9cf", borderRadius: 9, background: "#fff", color: "#176b4b", fontWeight: 750, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, cursor: "pointer", whiteSpace: "nowrap", fontSize: 14 },
  buyNowButton: { width: "100%", minHeight: 48, padding: "0 12px", border: 0, borderRadius: 9, color: "#fff", fontWeight: 750, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, cursor: "pointer", whiteSpace: "nowrap", fontSize: 14 },
  viewCartLink: { display: "block", textAlign: "center", color: "#176b4b", fontSize: 13, fontWeight: 700, textDecoration: "none" },
  productCard: {
    width: "min(100% - 32px, 1200px)",
    margin: "0 auto 28px",
    background: "#fff",
    borderRadius: 10,
    overflow: "hidden",
    border: "1px solid #e5e7eb",
    boxShadow: "0 3px 14px rgba(0,0,0,.045)",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))"
  },
  imageContainer: { width: "100%", aspectRatio: "1 / 1", minHeight: 0, maxHeight: 560, boxSizing: "border-box", overflow: "hidden", borderRadius: 12, background: "#fff", padding: 16, display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid #edf0f2" },
  productImage: {
    width: "100%",
    height: "100%",
    minWidth: 0,
    minHeight: 0,
    maxHeight: "100%",
    objectFit: "contain",
    padding: 16,
    boxSizing: "border-box",
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
    padding: "24px clamp(16px, 3vw, 30px)",
    minWidth: 0,
    boxSizing: "border-box",
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
    fontSize: "clamp(24px, 3vw, 32px)",
    lineHeight: 1.2,
    margin: "16px 0 8px"
  },
  price: { fontSize: 30, lineHeight: 1.2, margin: "8px 0 12px", fontWeight: 800 },
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
    marginTop: 18,
    width: "100%",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    background: "#fbfcfd",
    padding: 18,
    boxSizing: "border-box"
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
    minHeight: 52,
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
    marginTop: 10,
    minHeight: 48,
    padding: "12px 16px",
    borderRadius: 10,
    background: "#e8f8ee",
    color: "#15803d",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    fontWeight: 700,
    fontSize: 14,
    lineHeight: 1.35,
    textAlign: "center",
    textDecoration: "none",
    whiteSpace: "normal",
    overflowWrap: "anywhere"
  },
  paymentTrust: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    width: "100%",
    boxSizing: "border-box",
    padding: 14,
    border: "1px solid #dce8e2",
    borderRadius: 12,
    background: "#f6faf8",
    color: "#1f5138"
  },
  paymentTrustIcon: {
    width: 36,
    height: 36,
    flex: "0 0 36px",
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#e2f3e9",
    color: "#16804a"
  },
  secureNote: {
    margin: 0,
    fontSize: 11,
    lineHeight: 1.55,
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
