import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, ShoppingBag, Store, ArrowRight, RefreshCw, ShieldCheck,
  Star, UserRound, LogOut, X, Heart, Zap, Truck, CircleUserRound, MessageCircle
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import "./Discover.css";
import { addToMarketplaceCart, getMarketplaceCart } from "./marketplaceCart";

type ReviewableOrder = { order_id: string; order_number: string; business_name: string; ordered_at: string; rating: number | null; review_text: string | null; };

type MarketplaceProduct = {
  product_id: string;
  product_name: string;
  product_description: string | null;
  product_category: string | null;
  product_price: number | string | null;
  product_stock: number;
  product_image_url: string | null;
  business_name: string;
  business_logo: string | null;
  business_slug: string | null;
  business_whatsapp: string | null;
  seller_rating: number | string | null;
  seller_review_count: number;
  sold_quantity: number;
  created_at?: string | null;
};

const LOGO_URL = "https://i.ibb.co/N2b6rJnY/Untitled-design-20261030-044935-0000.png";
const money = (value: number) => `₦${value.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

export default function Discover() {
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<{ name: string; count: number }[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountMode, setAccountMode] = useState<"login" | "signup" | "profile">("login");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailConsent, setEmailConsent] = useState(false);
  const [reviewOrders, setReviewOrders] = useState<ReviewableOrder[]>([]);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, number>>({});
  const [reviewTexts, setReviewTexts] = useState<Record<string, string>>({});
  const [cartCount, setCartCount] = useState(() => getMarketplaceCart().reduce((sum, item) => sum + item.quantity, 0));
  const [sortBy, setSortBy] = useState<"featured" | "price-asc" | "price-desc">("featured");
  const [heroSlide, setHeroSlide] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const PAGE_SIZE = 24;

  async function loadProducts(reset = true) {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    setError("");
    const offset = reset ? 0 : products.length;
    const { data, error: rpcError } = await supabase.rpc(
      "sabi_get_public_marketplace_products_v3",
      { p_search: search || null, p_category: category || null, p_limit: PAGE_SIZE, p_offset: offset, p_sort: sortBy }
    );
    if (rpcError) {
      setError("We could not load the marketplace right now. Please try again.");
      if (reset) setProducts([]);
    } else {
      const page = (data || []) as MarketplaceProduct[];
      setProducts(current => reset ? page : [...current, ...page]);
      setHasMore(page.length === PAGE_SIZE);
    }
    setLoading(false);
    setLoadingMore(false);
  }

  async function loadCategories() {
    const { data, error: categoryError } = await supabase.rpc("sabi_get_public_marketplace_categories");
    if (!categoryError) {
      setCategoryCounts((data || []).map((item: { category_name: string; product_count: number }) => ({
        name: item.category_name,
        count: Number(item.product_count || 0)
      })));
    }
  }

  useEffect(() => {
    loadCategories();
    const updateCartCount = () => setCartCount(getMarketplaceCart().reduce((sum, item) => sum + item.quantity, 0));
    window.addEventListener("sabi-cart-updated", updateCartCount);
    window.addEventListener("storage", updateCartCount);
    return () => { window.removeEventListener("sabi-cart-updated", updateCartCount); window.removeEventListener("storage", updateCartCount); };
  }, []);

  useEffect(() => {
    loadProducts();
  }, [category, search, sortBy]);

  useEffect(() => {
    const timer = window.setInterval(() => setHeroSlide(current => (current + 1) % 6), 5600);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.title = "Sabi Discover | Shop Products from Nigerian Businesses";
    const description = "Discover products, best sellers and trusted Nigerian businesses across Nigeria. Shop fashion, electronics, home essentials and more on Sabi Discover.";
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
    setMeta('meta[property="og:type"]', "og:type", "website");
    setMeta('meta[property="og:title"]', "og:title", document.title);
    setMeta('meta[property="og:description"]', "og:description", description);
    setMeta('meta[property="og:url"]', "og:url", "https://discover.sabibyxtop.com.ng/");
    setMeta('meta[property="og:site_name"]', "og:site_name", "Sabi Discover");
    setMeta('meta[property="og:image"]', "og:image", LOGO_URL);
    setMeta('meta[name="twitter:card"]', "twitter:card", "summary_large_image");
    setMeta('meta[name="twitter:title"]', "twitter:title", document.title);
    setMeta('meta[name="twitter:description"]', "twitter:description", description);
    let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = "https://discover.sabibyxtop.com.ng/";
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        setEmail(data.session.user.email || "");
        setFullName(String(data.session.user.user_metadata?.full_name || ""));
        loadCustomerProfile(data.session);
        finishPendingCustomerSetup(data.session);
        loadReviewableOrders();
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        setEmail(nextSession.user.email || "");
        setFullName(String(nextSession.user.user_metadata?.full_name || ""));
        window.setTimeout(() => {
          loadCustomerProfile(nextSession);
          finishPendingCustomerSetup(nextSession);
          loadReviewableOrders();
        }, 0);
      } else {
        setFullName("");
        setPhone("");
        setEmailConsent(false);
        setReviewOrders([]);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadReviewableOrders() {
    const { data } = await supabase.rpc("sabi_get_my_reviewable_orders");
    setReviewOrders((data || []) as ReviewableOrder[]);
  }

  async function finishPendingCustomerSetup(activeSession: Session) {
    const pending = window.localStorage.getItem("sabi_discover_pending_consent");
    if (pending === null) return;
    const name = window.localStorage.getItem("sabi_discover_pending_name") || String(activeSession.user.user_metadata?.full_name || "");
    const mobile = window.localStorage.getItem("sabi_discover_pending_phone") || "";
    try {
      await saveCustomerProfile(activeSession, name, mobile, pending === "yes");
      window.localStorage.removeItem("sabi_discover_pending_consent");
      window.localStorage.removeItem("sabi_discover_pending_name");
      window.localStorage.removeItem("sabi_discover_pending_phone");
    } catch (error) {
      console.warn("Sabi customer profile setup could not be completed yet.", error);
    }
  }

  async function submitSellerReview(orderId: string) {
    const rating = reviewDrafts[orderId] || 5;
    const reviewText = reviewTexts[orderId] || "";
    setAuthBusy(true);
    setAuthMessage("");
    const { error: reviewError } = await supabase.rpc("sabi_submit_seller_review", {
      p_order_id: orderId,
      p_rating: rating,
      p_review_text: reviewText
    });
    setAuthBusy(false);
    if (reviewError) setAuthMessage(reviewError.message);
    else {
      setAuthMessage("Thank you. Your verified seller review has been saved.");
      await loadReviewableOrders();
      await loadProducts();
    }
  }

  async function loadCustomerProfile(activeSession: Session) {
    const { data } = await supabase
      .from("sabi_discover_customer_profiles")
      .select("full_name,phone,email_marketing_consent")
      .eq("user_id", activeSession.user.id)
      .maybeSingle();
    if (data) {
      setFullName(data.full_name || "");
      setPhone(data.phone || "");
      setEmailConsent(data.email_marketing_consent === true);
    }
  }

  const visibleProducts = useMemo(() => products.filter(product => {
    const matchesCategory = !category || categoryFor(product.product_category) === category;
    const term = search.toLowerCase();
    const matchesSearch = !term || [product.product_name, product.product_description || "", product.product_category || "", product.business_name].some(value => value.toLowerCase().includes(term));
    return matchesCategory && matchesSearch;
  }), [products, category, search]);

  const bestSellers = useMemo(
    () => products.filter(p => Number(p.sold_quantity || 0) > 0).sort((a, b) => Number(b.sold_quantity || 0) - Number(a.sold_quantity || 0)).slice(0, 8),
    [products]
  );

  const sortedProducts = useMemo(() => {
    const items = [...visibleProducts];
    if (sortBy === "price-asc") return items.sort((a, b) => Number(a.product_price || 0) - Number(b.product_price || 0));
    if (sortBy === "price-desc") return items.sort((a, b) => Number(b.product_price || 0) - Number(a.product_price || 0));
    return items;
  }, [visibleProducts, sortBy]);

  const sortedCategories = useMemo(() => [...categoryCounts].sort((a, b) => {
    if (a.name.trim().toLowerCase() === "other") return 1;
    if (b.name.trim().toLowerCase() === "other") return -1;
    return a.name.localeCompare(b.name);
  }), [categoryCounts]);
  const popularCategories = useMemo(() => sortedCategories.slice(0, 7), [sortedCategories]);
  const filteredCategories = useMemo(() => sortedCategories.filter(item =>
    item.name.toLowerCase().includes(categorySearch.trim().toLowerCase())
  ), [sortedCategories, categorySearch]);

  function categoryFor(rawCategory: string | null): string {
    const value = (rawCategory || "").trim().toLowerCase();
    if (!value) return "Other";
    const rules: [string, string[]][] = [
      ["Fashion", ["fashion", "cloth", "clothing", "wear", "shoe", "footwear", "bag", "jewel", "accessor", "textile"]],
      ["Phones & Electronics", ["phone", "mobile", "electronic", "computer", "laptop", "tablet", "camera", "audio", "tv", "gadget"]],
      ["Home & Living", ["home", "furniture", "kitchen", "bedding", "decor", "appliance", "household", "garden"]],
      ["Beauty & Personal Care", ["beauty", "cosmetic", "makeup", "skin", "hair", "personal care", "perfume", "fragrance"]],
      ["Food & Groceries", ["food", "grocery", "drink", "beverage", "snack", "farm", "produce", "fruit", "vegetable"]],
      ["Health & Wellness", ["health", "wellness", "medical", "fitness", "supplement", "pharmacy"]],
      ["Baby, Kids & Toys", ["baby", "kids", "children", "toy", "maternity", "school"]],
      ["Sports & Outdoors", ["sport", "outdoor", "gym", "camping", "fitness gear"]],
      ["Automotive", ["auto", "car", "vehicle", "motor", "automotive", "spare part"]],
      ["Books & Learning", ["book", "education", "learning", "stationery", "course"]],
      ["Real Estate", ["real estate", "property", "land", "building", "house for sale"]]
    ];
    const match = rules.find(([, words]) => words.some(word => value.includes(word)));
    return match?.[0] || "Other";
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput.trim());
    document.getElementById("discover-products")?.scrollIntoView({ behavior: "smooth" });
  }

  async function handleAccountSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthMessage("");
    try {
      if (accountMode === "signup") {
        if (!fullName.trim()) throw new Error("Please enter your full name.");
        window.localStorage.setItem("sabi_discover_pending_consent", emailConsent ? "yes" : "no");
        window.localStorage.setItem("sabi_discover_pending_name", fullName.trim());
        window.localStorage.setItem("sabi_discover_pending_phone", phone.trim());
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin + "/",
            data: { full_name: fullName.trim(), account_type: "customer" }
          }
        });
        if (signUpError) throw signUpError;
        if (data.session) {
          await saveCustomerProfile(data.session, fullName.trim(), phone.trim(), emailConsent);
          setSession(data.session);
          setAccountMode("profile");
          setAuthMessage("Your Sabi customer account is ready.");
        } else {
          setAccountMode("login");
          setAuthMessage("Check your email to confirm your account. Then sign in here to finish setting up your customer profile.");
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });
        if (signInError) throw signInError;
        if (data.session) {
          const pendingConsent = window.localStorage.getItem("sabi_discover_pending_consent") === "yes";
          const pendingName = window.localStorage.getItem("sabi_discover_pending_name") || String(data.session.user.user_metadata?.full_name || "");
          const pendingPhone = window.localStorage.getItem("sabi_discover_pending_phone") || "";
          await saveCustomerProfile(data.session, pendingName, pendingPhone, pendingConsent);
          window.localStorage.removeItem("sabi_discover_pending_consent");
          window.localStorage.removeItem("sabi_discover_pending_name");
          window.localStorage.removeItem("sabi_discover_pending_phone");
          setSession(data.session);
          setAccountMode("profile");
          setAuthMessage("Welcome back to Sabi Discover.");
        }
      }
    } catch (err) {
      setAuthMessage(err instanceof Error ? err.message : "We could not complete that request.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function saveCustomerProfile(activeSession: Session, name: string, mobile: string, consent: boolean) {
    const { error: profileError } = await supabase.rpc("sabi_save_discover_customer_profile", {
      p_full_name: name,
      p_phone: mobile || null,
      p_email_marketing_consent: consent
    });
    if (profileError) throw profileError;
    setFullName(name);
    setPhone(mobile);
    setEmailConsent(consent);
    setEmail(activeSession.user.email || "");
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setAuthBusy(true);
    setAuthMessage("");
    const { error: profileError } = await supabase.rpc("sabi_save_discover_customer_profile", {
      p_full_name: fullName,
      p_phone: phone || null,
      p_email_marketing_consent: emailConsent
    });
    setAuthBusy(false);
    setAuthMessage(profileError ? profileError.message : "Your customer profile has been updated.");
  }

  async function logout() {
    await supabase.auth.signOut();
    setAccountOpen(false);
    setAccountMode("login");
    setAuthMessage("You have signed out.");
  }

  function ProductCard({ product }: { product: MarketplaceProduct }) {
    const rating = Number(product.seller_rating || 0);
    const reviews = Number(product.seller_review_count || 0);
    const sold = Number(product.sold_quantity || 0);
    const rawWhatsapp = String(product.business_whatsapp || "").replace(/\D/g, "");
    const whatsappNumber = rawWhatsapp.startsWith("0") ? `234${rawWhatsapp.slice(1)}` : rawWhatsapp.startsWith("234") ? rawWhatsapp : rawWhatsapp.length === 10 ? `234${rawWhatsapp}` : rawWhatsapp;
    const whatsappMessage = `Hello ${product.business_name}, I found your shop on Sabi Discover and I am interested in ${product.product_name}. Please help me check availability and how to order. Product: https://discover.sabibyxtop.com.ng/?product=${encodeURIComponent(product.product_id)}`;
    const whatsappLink = whatsappNumber.length >= 12 && whatsappNumber.length <= 15 ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}` : "";
    return (
      <a className="sd-product-card" href={`/?product=${encodeURIComponent(product.product_id)}`} key={product.product_id}>
        <div className="sd-product-image">
          {product.product_image_url ? <img src={product.product_image_url} alt={product.product_name} loading="lazy" /> : <div className="sd-no-image"><ShoppingBag size={32} /></div>}
          {sold > 0 && <span className="sd-product-ribbon"><Zap size={11} /> BEST SELLER</span>}
          <button className="sd-wishlist" type="button" aria-label="Sign in to save favourites" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setAccountMode(session ? "profile" : "login"); if (session) loadReviewableOrders(); setAccountOpen(true); }}><Heart size={17} /></button>
        </div>
        <div className="sd-product-info">
          <small className="sd-store-name"><Store size={12} /> {product.business_name}</small>
          <h3 title={product.product_name}>{product.product_name}</h3>
          <div className="sd-product-bottom">
            <strong className="sd-price">{money(Number(product.product_price || 0))}</strong>
            <div className="sd-seller-rating">
              {reviews > 0 ? <><span className="sd-stars"><Star size={12} fill="currentColor" /> {rating.toFixed(1)}</span><span>({reviews} seller {reviews === 1 ? "review" : "reviews"})</span></> : <span>New seller · Be the first to review</span>}
            </div>
            <button className="sd-add-cart" type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); addToMarketplaceCart({ product_id: product.product_id, product_name: product.product_name, product_price: Number(product.product_price || 0), product_image_url: product.product_image_url, business_name: product.business_name, business_slug: product.business_slug, product_stock: Number(product.product_stock || 0) }, 1); }} disabled={Number(product.product_stock || 0) < 1}><ShoppingBag size={14}/> Add to cart</button>
            {whatsappLink && <button className="sd-whatsapp-chat" type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); window.open(whatsappLink, "_blank", "noopener,noreferrer"); }}><MessageCircle size={14}/> Chat with shop</button>}
          </div>
        </div>
      </a>
    );
  }

  return (
    <main className="sabi-discover">
      <div className="sd-top-strip"><span>Discover trusted Nigerian merchants</span><span><MessageCircle size={13} /> Chat with each shop on its connected Sabi WhatsApp bot</span><span><ShieldCheck size={13} /> Verified payment records</span></div>
      <header className="sd-header">
        <a href="/" className="sd-brand"><img src={LOGO_URL} alt="Sabi by XTOP" /><span><strong>Sabi</strong><small>DISCOVER</small></span></a>
        <form className="sd-search" onSubmit={submitSearch}>
          <Search size={19} />
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search products, categories and stores" aria-label="Search products and stores" />
          <button type="submit">Search</button>
        </form>
        <a className="sd-cart-button" href="https://discover.sabibyxtop.com.ng/?cart=1" aria-label={`Shopping cart with ${cartCount} items`}><ShoppingBag size={19}/><span>Cart</span>{cartCount > 0 && <b>{cartCount}</b>}</a>
        <button className="sd-account-button" onClick={() => { setAccountMode(session ? "profile" : "login"); setAccountOpen(true); }}>
          {session ? <CircleUserRound size={19} /> : <UserRound size={19} />}
          <span>{session ? (fullName.split(" ")[0] || "My account") : "Sign in"}<small>{session ? "My account" : "Customer account"}</small></span>
        </button>
        <a className="sd-merchant-link" href="https://app.sabibyxtop.com.ng">Sell on Sabi <ArrowRight size={15} /></a>
      </header>

      <nav className="sd-category-nav" aria-label="Marketplace categories">
        <button className={!category ? "active" : ""} onClick={() => { setCategory(""); setShowAllCategories(false); document.getElementById("discover-products")?.scrollIntoView({ behavior: "smooth" }); }}>All products</button>
        {popularCategories.map(item => <button key={item.name} className={category === item.name ? "active" : ""} onClick={() => { setCategory(item.name); setShowAllCategories(false); document.getElementById("discover-products")?.scrollIntoView({ behavior: "smooth" }); }}>{item.name}</button>)}
        <button className={showAllCategories ? "active sd-browse-trigger" : "sd-browse-trigger"} onClick={() => setShowAllCategories(value => !value)}>Browse all categories</button>
      </nav>
      {showAllCategories && <section className="sd-category-browser" aria-label="Browse all marketplace categories">
        <div className="sd-category-browser-head"><div><strong>Browse categories</strong><small>Explore products from all published Sabi stores.</small></div><button onClick={() => setShowAllCategories(false)} aria-label="Close categories"><X size={18} /></button></div>
        <label className="sd-category-search"><Search size={16} /><input value={categorySearch} onChange={event => setCategorySearch(event.target.value)} placeholder="Find a category..." /></label>
        <div className="sd-category-browser-grid">
          <button className={!category ? "selected" : ""} onClick={() => { setCategory(""); setShowAllCategories(false); }}><span>All products</span><small>{categoryCounts.reduce((total, item) => total + item.count, 0).toLocaleString("en-NG")} products</small></button>
          {filteredCategories.map(item => <button key={item.name} className={category === item.name ? "selected" : ""} onClick={() => { setCategory(item.name); setShowAllCategories(false); document.getElementById("discover-products")?.scrollIntoView({ behavior: "smooth" }); }}><span>{item.name}</span><small>{item.count} {item.count === 1 ? "product" : "products"}</small></button>)}
          {filteredCategories.length === 0 && <p className="sd-category-no-results">No category matches that search.</p>}
        </div>
      </section>}

      <section className="sd-whatsapp-promo"><MessageCircle size={22}/><div><strong>Every shop has its own Sabi WhatsApp bot.</strong><span>Tap “Chat with shop” on a product to ask questions, check availability and continue shopping directly with the merchant.</span></div></section>

      <section className="sd-feature-slider" aria-label="Sabi features">
        <div className="sd-feature-slide" key={heroSlide} onTouchStart={event => { touchStartX.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={event => { const start = touchStartX.current; const end = event.changedTouches[0]?.clientX; touchStartX.current = null; if (start !== null && end !== undefined && Math.abs(end - start) > 45) setHeroSlide(current => (current + (end < start ? 1 : 5)) % 6); }}>
          <div className="sd-feature-copy">
            <div className="sd-feature-meta"><span className="sd-feature-tag">{["DISCOVER MORE","FOR BUSINESSES","SHOP SMART","WHATSAPP SHOPPING","PAYMENT RECORDS","MERCHANT TOOLS"][heroSlide]}</span><span className="sd-feature-pill">{["Fresh finds daily","Sell on Sabi","Verified rankings","Your shop on WhatsApp","Payment verification","Store operations"][heroSlide]}</span></div>
            <h1>{["Find your next favourite.","Run your store & reach more buyers.","Compare sellers & real ratings.","Chat directly with trusted shops.","Shop with confidence and clear order records.","Manage products, orders & fulfilment."][heroSlide]}</h1>
            <p>{[
              "Search products, categories, and verified Nigerian stores all in one marketplace.",
              "Manage products and stock, run your storefront, and choose which items to publish straight to Sabi Discover. Share product links with customers.",
              "Check seller ratings and review counts, compare product options across local businesses, and explore best sellers ranked by completed sales.",
              "Browse products, then open each merchant’s connected Sabi WhatsApp bot to ask questions and continue the conversation.",
              "Sabi verifies Paystack payment results and records marketplace orders. Sellers arrange delivery and fulfilment; Sabi support can help investigate transaction complaints.",
              "Set delivery fees, enable supported online or pay-on-delivery options, track order statuses, and manage your business payout settings."
            ][heroSlide]}</p>
            <div className="sd-feature-actions">
              {heroSlide === 0 && <button onClick={() => document.getElementById("discover-products")?.scrollIntoView({ behavior: "smooth" })}>Explore products ↓</button>}
              {heroSlide === 1 && <a href="https://app.sabibyxtop.com.ng">Start selling on Sabi <ArrowRight size={15}/></a>}
              {heroSlide === 3 && <button onClick={() => document.getElementById("discover-products")?.scrollIntoView({ behavior: "smooth" })}>Find a shop to chat with <ArrowRight size={15}/></button>}
              {heroSlide === 4 && <button onClick={() => document.getElementById("buyer-protection")?.scrollIntoView({ behavior: "smooth" })}>How it works <ArrowRight size={15}/></button>}
              {heroSlide === 5 && <a href="https://app.sabibyxtop.com.ng">Open merchant workspace <ArrowRight size={15}/></a>}
            </div>
          </div>
          <div className="sd-feature-art" aria-hidden="true">
            <div className="sd-feature-art-icon">{[<ShoppingBag size={48}/>,<Store size={48}/>,<Star size={48}/>,<MessageCircle size={48}/>,<ShieldCheck size={48}/>,<Truck size={48}/>][heroSlide]}</div>
            <span>SABI <b>BY XTOP</b></span>
            <small>{["Discover Nigerian businesses","Your store, your customers","Shop with more information","Chat with your merchant","Payment and order records","Tools for growing businesses"][heroSlide]}</small>
          </div>
        </div>
        <div className="sd-feature-controls">
          <div className="sd-feature-dots">{Array.from({ length: 6 }, (_, index) => <button key={index} className={heroSlide === index ? "active" : ""} onClick={() => setHeroSlide(index)} aria-label={"Show slide " + (index + 1)} />)}</div>
          <div className="sd-feature-arrows"><button onClick={() => setHeroSlide(current => (current + 5) % 6)} aria-label="Previous feature"><ArrowRight className="sd-arrow-back" size={16}/></button><button onClick={() => setHeroSlide(current => (current + 1) % 6)} aria-label="Next feature"><ArrowRight size={16}/></button></div>
        </div>
      </section>

      <section className="sd-market" id="discover-products">
        {bestSellers.length >= 2 && !search && !category && sortBy === "featured" && (
          <div className="sd-best-sellers">
            <div className="sd-section-heading"><div><span className="sd-eyebrow"><Zap size={13} /> POPULAR WITH CUSTOMERS</span><h2>Best sellers</h2><p>Ranked using completed, paid orders.</p></div><span className="sd-live-label">Based on real sales</span></div>
            <div className="sd-product-grid">{bestSellers.map(product => <ProductCard product={product} key={product.product_id} />)}</div>
          </div>
        )}

        <div className="sd-section-heading sd-all-heading">
          <div><span className="sd-eyebrow">THE SABI MARKETPLACE</span><h2>{search ? "Search results" : category || "Explore all products"}</h2><p>Products from stores that have chosen to publish on Sabi Discover.</p></div>
          <label className="sd-sort-control">Sort by <select value={sortBy} onChange={event => setSortBy(event.target.value as typeof sortBy)}><option value="featured">Featured</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select></label>
        </div>

        {category && <div className="sd-active-category">Showing <strong>{category}</strong><button onClick={() => setCategory("")}>Clear category</button></div>}
        {search && <div className="sd-filter-note"><Search size={14} /> Results for “{search}” <button onClick={() => { setSearch(""); setSearchInput(""); }}>Clear</button></div>}
        {error && <div className="sd-error" role="alert">{error} <button onClick={() => loadProducts()}>Try again</button></div>}
        {loading ? <div className="sd-state"><RefreshCw size={26} className="sd-spin" /><p>Finding products for you...</p></div> : visibleProducts.length === 0 ? (
          <div className="sd-empty"><span><ShoppingBag size={30} /></span><h3>{search || category ? "No matching products yet" : "Sabi Discover is getting ready"}</h3><p>{search || category ? "Try another search or choose a different category." : "As merchants publish their products, their stores and products will appear here."}</p>{(search || category) && <button onClick={() => { setSearch(""); setSearchInput(""); setCategory(""); }}>View all products</button>}</div>
        ) : <>
          <div className="sd-product-grid">{sortedProducts.map(product => <ProductCard product={product} key={product.product_id} />)}</div>
          {hasMore && <div className="sd-load-more-wrap"><button className="sd-load-more" onClick={() => loadProducts(false)} disabled={loadingMore}>{loadingMore ? "Loading more products..." : "Load more products"} <ArrowRight size={15}/></button></div>}
          {!hasMore && products.length > 0 && <p className="sd-end-of-results">You’re all caught up. Showing {products.length} products.</p>}
        </>}
      </section>

      <footer className="sd-footer">
        <div className="sd-footer-about"><a href="/" className="sd-footer-brand"><img src={LOGO_URL} alt="" /> Sabi by XTOP</a><p>Discover Nigerian businesses and products.</p></div>
        <div className="sd-footer-legal">
          <details id="buyer-protection"><summary>Buyer protection</summary><p>Shop through Sabi Discover and review the seller's store information before ordering. Keep your order confirmation and payment receipt. If an order has a problem, contact the seller using the details provided with your order.</p></details>
          <details id="returns-refunds"><summary>Returns &amp; refunds</summary><p>Return eligibility, delivery arrangements and refund handling may vary by seller and product. Contact the seller promptly using the contact details on your order confirmation and keep your proof of purchase.</p></details>
          <details id="customer-support"><summary>Customer support</summary><p>Need help with Sabi Discover? Chat with our customer support team on WhatsApp. For order-specific issues, please include your order reference.</p><p><a href="https://wa.me/2348024988555" target="_blank" rel="noopener noreferrer">WhatsApp: +234 802 498 8555</a></p></details>
          <details id="terms"><summary>Terms of service</summary><p>Sabi Discover helps customers discover products published by independent businesses. Product descriptions, stock, fulfilment and delivery are managed by the respective sellers. Confirm product details and delivery terms with the seller before completing a purchase.</p></details>
          <details id="privacy"><summary>Privacy policy</summary><p>Customer account details are used to support account access, order-related experiences and any optional email updates you explicitly choose to receive. Marketing consent is optional and can be withdrawn.</p></details>
          <details id="seller-guide"><summary>How selling works</summary><p>Businesses create a Sabi merchant workspace, add products and publish selected items to Sabi Discover. Customers can browse published products and place orders through the marketplace checkout.</p></details>
        </div>
        <div className="sd-footer-bottom"><small>© {new Date().getFullYear()} XTOP Retail Technologies</small><small>Built for Nigerian businesses and shoppers.</small></div>
      </footer>

      {accountOpen && <div className="sd-modal-backdrop" onClick={() => setAccountOpen(false)}>
        <section className="sd-account-modal" role="dialog" aria-modal="true" aria-label="Sabi customer account" onClick={event => event.stopPropagation()}>
          <button className="sd-modal-close" onClick={() => setAccountOpen(false)} aria-label="Close"><X size={20} /></button>
          <div className="sd-modal-brand"><img src={LOGO_URL} alt="" /><strong>Sabi <span>Discover</span></strong></div>
          <a className="sd-account-sell-link" href="https://app.sabibyxtop.com.ng">Own a business? Sell on Sabi <ArrowRight size={15}/></a>
          {session ? <>
            <h2>Your customer account</h2><p>Manage your details, email preferences and seller reviews.</p>
            <form onSubmit={saveProfile} className="sd-account-form">
              <label>Full name<input value={fullName} onChange={e => setFullName(e.target.value)} required /></label>
              <label>Email address<input value={session.user.email || ""} disabled /></label>
              <label>Phone number<input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+234..." /></label>
              <label className="sd-consent"><input type="checkbox" checked={emailConsent} onChange={e => setEmailConsent(e.target.checked)} /><span><strong>Email updates (optional)</strong><small>Send me Sabi news, marketplace highlights and promotional offers. I can unsubscribe at any time.</small></span></label>
              <button className="sd-auth-submit" disabled={authBusy}>{authBusy ? "Saving..." : "Save my preferences"}</button>
            </form>
            <div className="sd-review-orders">
              <h3>Rate a seller</h3>
              <p>Reviews are available after a completed, paid order linked to your account email.</p>
              {reviewOrders.length === 0 ? <small className="sd-no-review-orders">No completed orders are linked to this email yet.</small> : reviewOrders.map(order => (
                <div className="sd-review-order" key={order.order_id}>
                  <div><strong>{order.business_name}</strong><small>Order {order.order_number}</small></div>
                  <div className="sd-rating-picker" aria-label="Choose seller rating">
                    {[1,2,3,4,5].map(star => <button type="button" key={star} className={(reviewDrafts[order.order_id] || order.rating || 5) >= star ? "chosen" : ""} onClick={() => setReviewDrafts(current => ({ ...current, [order.order_id]: star }))} aria-label={`Rate ${star} stars`}><Star size={17} fill="currentColor" /></button>)}
                  </div>
                  <textarea value={reviewTexts[order.order_id] ?? order.review_text ?? ""} onChange={event => setReviewTexts(current => ({ ...current, [order.order_id]: event.target.value }))} placeholder="Share your experience (optional)" rows={2} />
                  <button type="button" className="sd-submit-review" disabled={authBusy} onClick={() => submitSellerReview(order.order_id)}>{order.rating ? "Update review" : "Submit review"}</button>
                </div>
              ))}
            </div>
            <button className="sd-signout" onClick={logout}><LogOut size={15} /> Sign out</button>
          </> : <>
            <h2>{accountMode === "signup" ? "Create your customer account" : "Welcome back"}</h2>
            <p>{accountMode === "signup" ? "Save your details and enjoy a more convenient way to shop." : "Sign in to your Sabi Discover customer account."}</p>
            <div className="sd-auth-tabs"><button className={accountMode === "login" ? "active" : ""} onClick={() => { setAccountMode("login"); setAuthMessage(""); }}>Sign in</button><button className={accountMode === "signup" ? "active" : ""} onClick={() => { setAccountMode("signup"); setAuthMessage(""); }}>Create account</button></div>
            <form onSubmit={handleAccountSubmit} className="sd-account-form">
              {accountMode === "signup" && <><label>Full name<input value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name" required /></label><label>Phone number (optional)<input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+234..." /></label></>}
              <label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label>
              <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={accountMode === "login" ? "current-password" : "new-password"} minLength={8} required /></label>
              {accountMode === "signup" && <label className="sd-consent"><input type="checkbox" checked={emailConsent} onChange={e => setEmailConsent(e.target.checked)} /><span><strong>Yes, email me Sabi updates (optional)</strong><small>Receive Sabi news, marketplace highlights and promotional offers. This is optional and unchecked by default. You can unsubscribe at any time.</small></span></label>}
              {authMessage && <div className="sd-auth-message" role="status">{authMessage}</div>}
              <button className="sd-auth-submit" disabled={authBusy}>{authBusy ? "Please wait..." : accountMode === "signup" ? "Create customer account" : "Sign in"}</button>
            </form>
            <small className="sd-privacy-note">Your account is separate from merchant accounts. Marketing emails are sent only if you actively opt in.</small>
          </>}
          {authMessage && session && <div className="sd-auth-message" role="status">{authMessage}</div>}
        </section>
      </div>}
    </main>
  );
}
