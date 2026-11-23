import { useEffect, useMemo, useState } from "react";
import {
  Search, ShoppingBag, Store, ArrowRight, RefreshCw,
  ShieldCheck, Package, Sparkles, SlidersHorizontal
} from "lucide-react";
import { supabase } from "./lib/supabase";
import "./Discover.css";

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
};

const LOGO_URL = "https://i.ibb.co/N2b6rJnY/Untitled-design-20261030-044935-0000.png";
const money = (value: number) => `₦${value.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

export default function Discover() {
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadProducts() {
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc(
      "sabi_get_public_marketplace_products",
      { p_search: null, p_category: null, p_limit: 100, p_offset: 0 }
    );
    if (rpcError) {
      setError("We could not load the marketplace right now. Please try again.");
      setProducts([]);
    } else {
      setProducts((data || []) as MarketplaceProduct[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    document.title = "Sabi Discover | Shop Nigerian Businesses";
    const description = "Discover products and independent businesses on Sabi Discover. Shop participating Nigerian merchants.";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", description);
    loadProducts();
  }, []);

  const visibleProducts = useMemo(() => products.filter(product => {
    const matchesCategory = !category || (product.product_category || "").toLowerCase() === category.toLowerCase();
    const term = search.toLowerCase();
    const matchesSearch = !term || [product.product_name, product.product_description || "", product.product_category || "", product.business_name].some(value => value.toLowerCase().includes(term));
    return matchesCategory && matchesSearch;
  }), [products, category, search]);

  const categories = useMemo(() => {
    const values = products.map(p => p.product_category?.trim()).filter(Boolean) as string[];
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }, [products]);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput.trim());
  }

  return (
    <main className="sabi-discover">
      <header className="sd-header">
        <a href="/" className="sd-brand">
          <img src={LOGO_URL} alt="Sabi by XTOP" />
          <span><strong>Sabi</strong><small>DISCOVER</small></span>
        </a>
        <nav className="sd-nav">
          <a href="#discover-products">Explore products</a>
          <a href="https://sabibyxtop.com">About Sabi</a>
        </nav>
        <a className="sd-merchant-link" href="https://app.sabibyxtop.com.ng">Merchant login <ArrowRight size={15} /></a>
      </header>

      <section className="sd-hero">
        <div className="sd-hero-content">
          <span className="sd-eyebrow"><Sparkles size={14} /> DISCOVER LOCAL BUSINESSES</span>
          <h1>Find what you need.<br /><em>Shop businesses you trust.</em></h1>
          <p>Explore products from participating Nigerian businesses, all in one place. Find a product, discover a store and shop directly.</p>
          <form className="sd-search" onSubmit={submitSearch}>
            <Search size={20} />
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="What are you looking for today?" aria-label="Search products and stores" />
            <button type="submit">Search</button>
          </form>
          <div className="sd-hero-trust">
            <span><ShieldCheck size={15} /> Participating merchants</span>
            <span><ShoppingBag size={15} /> Shop directly from stores</span>
          </div>
        </div>
        <div className="sd-hero-art" aria-hidden="true">
          <div className="sd-art-orbit sd-orbit-one" />
          <div className="sd-art-orbit sd-orbit-two" />
          <div className="sd-art-card sd-art-main"><ShoppingBag size={42} /><strong>Discover more</strong><span>Products from Nigerian stores</span></div>
          <div className="sd-art-bubble sd-bubble-one"><Store size={19} /> Local stores</div>
          <div className="sd-art-bubble sd-bubble-two"><Package size={19} /> Great finds</div>
        </div>
      </section>

      <section className="sd-market" id="discover-products">
        <div className="sd-section-heading">
          <div><span className="sd-eyebrow">THE SABI MARKETPLACE</span><h2>Explore products</h2><p>Browse items published by merchants on Sabi.</p></div>
          <button className="sd-refresh" onClick={loadProducts} disabled={loading}><RefreshCw size={15} className={loading ? "sd-spin" : ""} /> Refresh</button>
        </div>

        {categories.length > 0 && (
          <div className="sd-categories">
            <button className={!category ? "selected" : ""} onClick={() => setCategory("")}>All products</button>
            {categories.map(item => <button key={item} className={category === item ? "selected" : ""} onClick={() => setCategory(item)}>{item}</button>)}
          </div>
        )}

        {search && <div className="sd-filter-note"><SlidersHorizontal size={14} /> Results for “{search}” <button onClick={() => { setSearch(""); setSearchInput(""); }}>Clear</button></div>}

        {error && <div className="sd-error" role="alert">{error} <button onClick={loadProducts}>Try again</button></div>}

        {loading ? (
          <div className="sd-state"><RefreshCw size={26} className="sd-spin" /><p>Finding products for you...</p></div>
        ) : visibleProducts.length === 0 ? (
          <div className="sd-empty">
            <span><ShoppingBag size={30} /></span>
            <h3>{search || category ? "No matching products yet" : "Sabi Discover is getting ready"}</h3>
            <p>{search || category ? "Try another search or choose a different category." : "As merchants choose to publish their products on Sabi Discover, their stores and products will appear here."}</p>
            {(search || category) && <button onClick={() => { setSearch(""); setSearchInput(""); setCategory(""); }}>View all products</button>}
          </div>
        ) : (
          <div className="sd-product-grid">
            {visibleProducts.map(product => (
              <a className="sd-product-card" href={`/?product=${encodeURIComponent(product.product_id)}`} key={product.product_id}>
                <div className="sd-product-image">
                  {product.product_image_url ? <img src={product.product_image_url} alt={product.product_name} loading="lazy" /> : <div className="sd-no-image"><ShoppingBag size={32} /></div>}
                  {product.product_category && <span>{product.product_category}</span>}
                </div>
                <div className="sd-product-info">
                  <small className="sd-store-name"><Store size={12} /> {product.business_name}</small>
                  <h3>{product.product_name}</h3>
                  <strong className="sd-price">{money(Number(product.product_price || 0))}</strong>
                  <span className="sd-view-product">View product <ArrowRight size={14} /></span>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="sd-merchant-cta">
        <div><span className="sd-eyebrow">OWN A BUSINESS?</span><h2>Put your products where customers can discover them.</h2><p>Manage your store with Sabi and choose when your products are ready to appear on Discover.</p></div>
        <a href="https://app.sabibyxtop.com.ng">Open merchant workspace <ArrowRight size={17} /></a>
      </section>

      <footer className="sd-footer">
        <a href="/" className="sd-footer-brand"><img src={LOGO_URL} alt="" /> Sabi by XTOP</a>
        <span>Discover Nigerian businesses and products.</span>
        <small>© {new Date().getFullYear()} XTOP Retail Technologies</small>
      </footer>
    </main>
  );
}
