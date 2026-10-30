
import { useEffect, useState } from "react";
import {
  ShoppingBag,
  MessageCircle,
  Package,
  ArrowLeft,
  RefreshCw,
  Store
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

export default function PublicProduct() {
  const [product, setProduct] = useState<PublicProductData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      setLoading(false);
    }

    loadProduct();

    return () => {
      cancelled = true;
    };
  }, [productId]);

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

  const price =
    product?.product_price !== null &&
    product?.product_price !== undefined
      ? `₦${Number(product.product_price).toLocaleString("en-NG", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}`
      : "Contact merchant";

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

          <h1 style={styles.productName}>
            {product.product_name}
          </h1>

          <h2 style={{ ...styles.price, color: brandColor }}>
            {price}
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

          {whatsappNumber && product.product_stock > 0 ? (
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                ...styles.orderButton,
                background: brandColor
              }}
            >
              <MessageCircle size={20} />
              Order on WhatsApp
            </a>
          ) : (
            <div style={styles.unavailableButton}>
              <MessageCircle size={19} />
              {product.product_stock <= 0
                ? "Currently unavailable"
                : "WhatsApp ordering not available"}
            </div>
          )}

          {!whatsappNumber && product.product_stock > 0 && (
            <p style={styles.notice}>
              This merchant has not connected a business WhatsApp number yet.
              Please check back later.
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
  powered: {
    color: "#64748b",
    fontSize: 12
  },
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
  imageContainer: {
    minHeight: 300,
    background: "#f1f5f9"
  },
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
  price: {
    fontSize: 27,
    margin: "8px 0 15px"
  },
  stock: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "#475569"
  },
  stockDot: {
    width: 9,
    height: 9,
    borderRadius: "50%"
  },
  description: {
    marginTop: 25,
    width: "100%",
    lineHeight: 1.7,
    color: "#475569"
  },
  orderButton: {
    marginTop: 28,
    minHeight: 50,
    padding: "0 20px",
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    boxSizing: "border-box",
    color: "#fff",
    fontWeight: 700,
    textDecoration: "none"
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
    marginTop: 12
  },
  footerText: {
    marginTop: 24,
    fontSize: 11,
    color: "#94a3b8"
  },
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
