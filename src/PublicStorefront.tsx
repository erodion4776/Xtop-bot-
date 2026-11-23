import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Search, Share2, ShoppingBag, ShoppingCart, Store, Star, Zap, MessageCircle } from "lucide-react";
import { supabase } from "./lib/supabase";
import { addToMarketplaceCart, getMarketplaceCart } from "./marketplaceCart";

type StorefrontRow = {
  store_id: string;
  business_name: string;
  business_slug: string;
  business_logo: string | null;
  brand_color: string | null;
  industry: string | null;
  welcome_greeting: string | null;
  product_id: string | null;
  product_name: string | null;
  product_description: string | null;
  product_category: string | null;
  product_price: number | string | null;
  product_stock: number | null;
  product_image_url: string | null;
  seller_rating: number | string | null;
  seller_review_count: number | null;
  sold_quantity: number | null;
  product_updated_at: string | null;
};

type StorefrontProduct = {
  product_id: string;
  product_name: string;
  product_description: string | null;
  product_category: string | null;
  product_price: number;
  product_stock: number;
  product_image_url: string | null;
  seller_rating: number;
  seller_review_count: number;
  sold_quantity: number;
};

const LOGO_URL = "https://i.ibb.co/N2b6rJnY/Untitled-design-20261030-044935-0000.png";
const money = (value: number) => `₦${value.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

export default function PublicStorefront() {
  const slug = new URLSearchParams(window.location.search).get("store") || "";
  const [store, setStore] = useState<StorefrontRow | null>(null);
  const [products, setProducts] = useState<StorefrontProduct[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [cartMessage, setCartMessage] = useState("");
  const [cartCount, setCartCount] = useState(0);
  const [category, setCategory] = useState("All");
  const [sortBy, setSortBy] = useState("featured");

  useEffect(() => {
    const updateCartCount = () => setCartCount(getMarketplaceCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0));
    updateCartCount();
    window.addEventListener("sabi-cart-updated", updateCartCount);
    window.addEventListener("storage", updateCartCount);
    return () => { window.removeEventListener("sabi-cart-updated", updateCartCount); window.removeEventListener("storage", updateCartCount); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadStorefront() {
      if (!slug.trim()) {
        setError("No store was specified.");
        setLoading(false);
        return;
      }
      const { data, error: lookupError } = await supabase.rpc("sabi_get_public_storefront", { p_slug: slug });
      if (cancelled) return;
      if (lookupError) {
        setError("We could not load this store right now. Please try again.");
        setLoading(false);
        return;
      }
      const rows = (data || []) as StorefrontRow[];
      if (!rows.length) {
        setError("This store is not published or is currently unavailable.");
        setLoading(false);
        return;
      }
      const first = rows[0];
      setStore(first);
      setProducts(rows.filter(row => row.product_id && row.product_name).map(row => ({
        product_id: row.product_id as string,
        product_name: row.product_name as string,
        product_description: row.product_description,
        product_category: row.product_category,
        product_price: Number(row.product_price || 0),
        product_stock: Number(row.product_stock || 0),
        product_image_url: row.product_image_url,
        seller_rating: Number(row.seller_rating || 0),
        seller_review_count: Number(row.seller_review_count || 0),
        sold_quantity: Number(row.sold_quantity || 0)
      })));
      setLoading(false);
    }
    loadStorefront();
    return () => { cancelled = true; };
  }, [slug]);

  const categories = useMemo(() => ["All", ...Array.from(new Set(products.map(product => product.product_category?.trim()).filter((value): value is string => Boolean(value))))], [products]);
  const visibleProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = products.filter(product => {
      const matchesSearch = !term || [product.product_name, product.product_description || "", product.product_category || ""].some(value => value.toLowerCase().includes(term));
      return matchesSearch && (category === "All" || product.product_category?.trim() === category);
    });
    if (sortBy === "price-low") return [...filtered].sort((a,b) => a.product_price-b.product_price);
    if (sortBy === "price-high") return [...filtered].sort((a,b) => b.product_price-a.product_price);
    if (sortBy === "name") return [...filtered].sort((a,b) => a.product_name.localeCompare(b.product_name));
    if (sortBy === "popular") return [...filtered].sort((a,b) => b.sold_quantity-a.sold_quantity);
    return filtered;
  }, [products, search, category, sortBy]);

  useEffect(() => {
    if (!store) return;
    const storeUrl = `https://discover.sabibyxtop.com.ng/?store=${encodeURIComponent(store.business_slug)}`;
    const industryText = (store.industry || "").replace(/\\s+/g, " ").trim();
    const productNames = products.slice(0, 5).map(product => product.product_name).filter(Boolean);
    const catalogueText = productNames.length
      ? `Featured products include ${productNames.join(", ")}.`
      : "Discover products from this Sabi merchant.";
    const description = [
      `Shop ${store.business_name}`,
      industryText ? `(${industryText})` : "",
      `on Sabi Discover. Browse ${products.length} available ${products.length === 1 ? "product" : "products"}.`,
      catalogueText
    ].filter(Boolean).join(" ").slice(0, 300);
    const title = `${store.business_name} Store | Shop ${industryText || "products"} on Sabi Discover`;
    document.title = title;
    const setMeta = (selector: string, attribute: string, value: string) => {
      let element = document.head.querySelector(selector) as HTMLMetaElement | null;
      if (!element) {
        element = document.createElement("meta");
        if (selector.startsWith("meta[property=")) element.setAttribute("property", attribute);
        else element.setAttribute("name", attribute);
        document.head.appendChild(element);
      }
      element.setAttribute("content", value);
    };
    setMeta('meta[name="description"]', "description", description);
    setMeta('meta[property="og:type"]', "og:type", "website");
    setMeta('meta[property="og:title"]', "og:title", title);
    setMeta('meta[property="og:description"]', "og:description", description);
    setMeta('meta[property="og:url"]', "og:url", storeUrl);
    setMeta('meta[property="og:site_name"]', "og:site_name", "Sabi Discover");
    setMeta('meta[property="og:image"]', "og:image", store.business_logo || LOGO_URL);
    setMeta('meta[property="og:image:alt"]', "og:image:alt", `${store.business_name} store on Sabi Discover`);
    setMeta('meta[name="twitter:card"]', "twitter:card", "summary_large_image");
    setMeta('meta[name="twitter:title"]', "twitter:title", title);
    setMeta('meta[name="twitter:description"]', "twitter:description", description);
    setMeta('meta[name="twitter:image"]', "twitter:image", store.business_logo || LOGO_URL);
    let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = storeUrl;
    document.getElementById("sabi-store-jsonld")?.remove();
    const schema = document.createElement("script");
    schema.id = "sabi-store-jsonld";
    schema.type = "application/ld+json";
    schema.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Store",
      name: store.business_name,
      url: storeUrl,
      image: store.business_logo || LOGO_URL,
      description,
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: `${store.business_name} products`,
        itemListElement: products.map((product, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "Product",
            name: product.product_name,
            description: product.product_description || undefined,
            category: product.product_category || undefined,
            url: `https://discover.sabibyxtop.com.ng/?product=${encodeURIComponent(product.product_id)}`,
            image: product.product_image_url || undefined,
            brand: { "@type": "Brand", name: store.business_name },
            offers: {
              "@type": "Offer",
              url: `https://discover.sabibyxtop.com.ng/?product=${encodeURIComponent(product.product_id)}`,
              priceCurrency: "NGN",
              price: product.product_price.toFixed(2),
              availability: product.product_stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
              seller: { "@type": "Organization", name: store.business_name }
            }
          }
        }))
      }
    });
    document.head.appendChild(schema);
    return () => document.getElementById("sabi-store-jsonld")?.remove();
  }, [store, products]);

  async function shareStore() {
    if (!store) return;
    const url = `https://discover.sabibyxtop.com.ng/share/store/${encodeURIComponent(store.business_slug)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: store.business_name, text: `Shop ${store.business_name} on Sabi Discover.`, url });
        setShareMessage("Store shared.");
      } else {
        await navigator.clipboard.writeText(url);
        setShareMessage("Store link copied. Share it with your customers.");
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setShareMessage("Copy the store link from your browser address bar to share it.");
    }
  }

  if (loading) return <main style={styles.center}><div style={styles.spinner} /><p>Loading store...</p></main>;
  if (error || !store) return <main style={styles.center}><Store size={42} color="#94a3b8" /><h2>Store unavailable</h2><p>{error || "We could not find this store."}</p><a href="/" style={styles.back}><ArrowLeft size={17}/> Back to Sabi Discover</a></main>;

  const brandColor = store.brand_color || "#176b4b";
  const rating = Number(store.seller_rating || 0);
  const reviewCount = Number(store.seller_review_count || 0);
  const whatsappValue = (store as StorefrontRow & { business_whatsapp?: string | null; whatsapp_number?: string | null; whatsapp_phone?: string | null }).business_whatsapp || (store as StorefrontRow & { whatsapp_number?: string | null }).whatsapp_number || (store as StorefrontRow & { whatsapp_phone?: string | null }).whatsapp_phone || "";
  const whatsappDigits = whatsappValue.replace(/\\D/g, "");
  const whatsappLink = whatsappDigits ? `https://wa.me/${whatsappDigits.startsWith("0") ? "234" + whatsappDigits.slice(1) : whatsappDigits}` : "";

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <a href="/" style={styles.brand}><img src={LOGO_URL} alt="Sabi by XTOP"/><span><strong>Sabi</strong><small>DISCOVER</small></span></a>
        <div style={styles.headerRight}>
          <a href="/" style={styles.back}><ArrowLeft size={15}/> Back to Discover</a>
          <a href="/?cart=1" aria-label={`Open cart, ${cartCount} items`} style={styles.cartLink}><ShoppingCart size={19}/><span>Cart</span>{cartCount > 0 && <b style={styles.cartBadge}>{cartCount > 99 ? "99+" : cartCount}</b>}</a>
        </div>
      </header>

      <section style={{...styles.storeHero, borderTop: `5px solid ${brandColor}`}}>
        <div style={styles.storeIdentity}>
          {store.business_logo ? <img src={store.business_logo} alt={store.business_name} style={styles.storeLogo}/> : <div style={{...styles.storeLogoPlaceholder, background: brandColor}}><Store size={34} color="#fff"/></div>}
          <div style={{minWidth:0}}>
            <span style={styles.eyebrow}>OFFICIAL SABI STORE</span>
            <h1>{store.business_name}</h1>
            {store.industry && <p style={styles.industry}>{store.industry}</p>}
            <div style={styles.rating}>{reviewCount > 0 ? <><Star size={15} fill="#f59e0b" color="#f59e0b"/> {rating.toFixed(1)} · {reviewCount} seller {reviewCount === 1 ? "review" : "reviews"}</> : "New store on Sabi Discover"}</div>
          </div>
        </div>
        <div style={styles.storeActions}>
          <span>{products.length} {products.length === 1 ? "product" : "products"}</span>
          <div style={styles.actionButtons}>
            {whatsappLink && <a href={whatsappLink} target="_blank" rel="noopener noreferrer" style={styles.chatButton}><MessageCircle size={16}/> Chat on WhatsApp</a>}
            <button onClick={shareStore} style={{...styles.shareButton, borderColor: "#fff", color: "#176b4b"}}><Share2 size={17}/> Share store</button>
          </div>
        </div>
        {shareMessage && <p role="status" style={styles.status}>{shareMessage}</p>}
      </section>

      <section style={styles.catalogue}>
        <div style={styles.catalogueHeading}>
          <div><span style={styles.eyebrow}>SHOP THIS BUSINESS</span><h2>Products from {store.business_name}</h2><p>Browse available products from this Sabi merchant.</p></div>
          <div style={styles.catalogueTools}>
            <label style={styles.search}><Search size={17}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search this store"/></label>
            <select aria-label="Filter by category" value={category} onChange={event => setCategory(event.target.value)} style={styles.filterSelect}>{categories.map(item => <option key={item} value={item}>{item === "All" ? "All categories" : item}</option>)}</select>
            <select aria-label="Sort products" value={sortBy} onChange={event => setSortBy(event.target.value)} style={styles.filterSelect}><option value="featured">Featured</option><option value="popular">Best sellers</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Name: A–Z</option></select>
          </div>
        </div>
        {visibleProducts.length > 0 ? <div style={styles.grid}>
          {visibleProducts.map(product => <article key={product.product_id} style={styles.productCard}>
            <a href={`/?product=${encodeURIComponent(product.product_id)}`} style={styles.productLink}>
              <div style={styles.productImage}>
                {product.product_image_url ? <img src={product.product_image_url} alt={product.product_name} loading="lazy" style={styles.productImageElement}/> : <ShoppingBag size={35} color="#94a3b8"/>}
                {product.sold_quantity > 0 && <span style={styles.bestSeller}><Zap size={11}/> BEST SELLER</span>}
              </div>
              <div style={styles.productInfo}>
                {product.product_category && <small style={styles.category}>{product.product_category}</small>}
                <h3>{product.product_name}</h3>
                <strong style={{...styles.price,color:brandColor}}>{money(product.product_price)}</strong>
                <small style={styles.productRating}>{product.seller_review_count > 0 ? `★ ${product.seller_rating.toFixed(1)} · ${product.seller_review_count} reviews` : "New seller"}</small>
              </div>
            </a>
            <button style={{...styles.addButton,background:brandColor}} disabled={product.product_stock < 1} onClick={() => { addToMarketplaceCart({ product_id: product.product_id, product_name: product.product_name, product_price: product.product_price, product_image_url: product.product_image_url, business_name: store.business_name, business_slug: store.business_slug, product_stock: product.product_stock }, 1); setCartMessage(`${product.product_name} added to your cart.`); }}><ShoppingBag size={15}/> Add to cart</button>
          </article>)}
        </div> : <div style={styles.empty}><ShoppingBag size={32}/><h3>{products.length ? "No matching products" : "This store is getting ready"}</h3><p>{products.length ? "Try another product name or category." : "This merchant has not published any available products yet. Check back soon."}</p></div>}
        {cartMessage && <p role="status" style={styles.status}>{cartMessage} <a href="/?cart=1">View cart</a></p>}
      </section>

      <footer style={styles.footer}>Store powered by <strong>Sabi by XTOP</strong> · <a href="/" style={styles.footerLink}>Discover more Nigerian businesses</a></footer>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page:{minHeight:"100vh",background:"#f5f7f6",color:"#14231b",fontFamily:"Inter,system-ui,sans-serif",padding:"0 16px 40px"},
  center:{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,color:"#64748b",fontFamily:"system-ui,sans-serif",padding:24,textAlign:"center"},
  spinner:{width:30,height:30,border:"3px solid #dce8df",borderTopColor:"#176b4b",borderRadius:"50%",animation:"sabi-store-spin 1s linear infinite"},
  header:{maxWidth:1180,margin:"0 auto",height:74,display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,position:"sticky",top:0,zIndex:20,background:"#f5f7f6"},
  headerRight:{display:"flex",alignItems:"center",gap:12},
  cartLink:{position:"relative",display:"inline-flex",alignItems:"center",gap:6,padding:"9px 11px",border:"1px solid #dce7df",borderRadius:9,color:"#176b4b",fontWeight:750,fontSize:13,textDecoration:"none",whiteSpace:"nowrap"},
  cartBadge:{position:"absolute",top:-7,right:-7,minWidth:18,height:18,padding:"0 4px",borderRadius:99,background:"#dc2626",color:"#fff",fontSize:10,display:"grid",placeItems:"center"},
  brand:{display:"flex",alignItems:"center",gap:9,textDecoration:"none",color:"#14231b"},
  brandImg:{width:42,height:42,objectFit:"contain"},
  back:{display:"inline-flex",alignItems:"center",gap:7,color:"#176b4b",fontWeight:700,textDecoration:"none",fontSize:13},
  storeHero:{maxWidth:1180,margin:"14px auto 26px",background:"#0D3B26",color:"#fff",borderRadius:18,padding:"26px 24px",boxShadow:"0 8px 28px rgba(20,35,27,.08)"},
  storeIdentity:{display:"flex",alignItems:"center",gap:18},
  storeLogo:{width:86,height:86,borderRadius:18,objectFit:"contain",background:"#fff"},
  storeLogoPlaceholder:{width:86,height:86,borderRadius:18,display:"grid",placeItems:"center"},
  eyebrow:{fontSize:10,letterSpacing:1.3,fontWeight:800,color:"#c6e6d2"},
  industry:{margin:"5px 0",color:"#e0eee5",fontSize:13},
  rating:{display:"flex",alignItems:"center",gap:5,color:"#e0eee5",fontSize:12,marginTop:8},
  storeActions:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginTop:20,paddingTop:16,borderTop:"1px solid rgba(255,255,255,.2)",color:"#e0eee5",fontSize:13},
  actionButtons:{display:"flex",alignItems:"center",gap:9,flexWrap:"wrap"},
  chatButton:{display:"inline-flex",alignItems:"center",gap:7,background:"#fff",border:"1px solid #fff",borderRadius:9,padding:"10px 13px",fontWeight:750,color:"#176b4b",textDecoration:"none",fontSize:13,whiteSpace:"nowrap"},
  shareButton:{display:"inline-flex",alignItems:"center",gap:8,background:"#fff",border:"1px solid",borderRadius:9,padding:"10px 14px",fontWeight:750,cursor:"pointer"},
  status:{color:"#176b4b",fontSize:13,margin:"12px 0 0"},
  catalogue:{maxWidth:1180,margin:"0 auto"},
  catalogueHeading:{display:"flex",alignItems:"end",justifyContent:"space-between",gap:18,flexWrap:"wrap",marginBottom:18,paddingTop:8},
  catalogueTools:{display:"flex",alignItems:"center",gap:9,flexWrap:"wrap"},
  search:{display:"flex",alignItems:"center",gap:9,background:"#fff",border:"1px solid #dfe7e1",borderRadius:10,padding:"0 12px",height:44,minWidth:250,color:"#718278",boxSizing:"border-box"},
  filterSelect:{height:44,minWidth:132,maxWidth:"100%",padding:"0 10px",border:"1px solid #dfe7e1",borderRadius:10,background:"#fff",color:"#334155",fontSize:13},
  grid:{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12,alignItems:"stretch"},
  productCard:{background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:"0 5px 18px rgba(20,35,27,.05)",display:"flex",flexDirection:"column"},
  productLink:{textDecoration:"none",color:"inherit",display:"flex",flexDirection:"column",flex:1,minWidth:0},
  productImage:{width:"100%",aspectRatio:"1 / 1",background:"#f0f4f1",display:"grid",placeItems:"center",position:"relative",overflow:"hidden"},
  productImageElement:{display:"block",width:"100%",height:"100%",maxWidth:"100%",maxHeight:"100%",objectFit:"contain",objectPosition:"center"},
  bestSeller:{position:"absolute",left:9,top:9,display:"flex",alignItems:"center",gap:4,background:"#176b4b",color:"#fff",fontSize:9,fontWeight:800,padding:"5px 7px",borderRadius:5},
  productInfo:{padding:"11px 11px 7px",display:"flex",flexDirection:"column",gap:7,flex:1,minWidth:0},
  category:{fontSize:10,color:"#718278",textTransform:"uppercase",letterSpacing:.5},
  price:{fontSize:17},
  productRating:{fontSize:11,color:"#718278"},
  addButton:{border:0,color:"#fff",borderRadius:8,padding:"10px 8px",fontWeight:750,display:"flex",alignItems:"center",justifyContent:"center",gap:7,margin:"auto 10px 10px",cursor:"pointer",fontSize:12,whiteSpace:"nowrap"},
  empty:{background:"#fff",borderRadius:14,padding:35,textAlign:"center",color:"#718278"},
  footer:{maxWidth:1180,margin:"38px auto 0",paddingTop:18,borderTop:"1px solid #e2e9e4",fontSize:12,color:"#718278",textAlign:"center"},
  footerLink:{color:"#176b4b",textDecoration:"none"}
};
