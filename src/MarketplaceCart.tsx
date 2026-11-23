import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, CreditCard, Minus, Plus, ShoppingBag, Trash2, Truck, ShieldCheck, Store } from "lucide-react";
import { supabase } from "./lib/supabase";
import { getMarketplaceCart, saveMarketplaceCart, type SabiMarketplaceCartItem } from "./marketplaceCart";
import "./MarketplaceCart.css";

const money = (value: number) => `₦${value.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

export default function MarketplaceCart() {
  const [items, setItems] = useState<SabiMarketplaceCartItem[]>(() => getMarketplaceCart());
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const sync = () => setItems(getMarketplaceCart());
    window.addEventListener("sabi-cart-updated", sync);
    window.addEventListener("storage", sync);
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setEmail(current => current || data.user?.email || "");
      setName(current => current || String(data.user?.user_metadata?.full_name || ""));
    });
    return () => {
      window.removeEventListener("sabi-cart-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + Number(item.product_price) * item.quantity, 0), [items]);
  const sellers = useMemo(() => {
    const grouped = new Map<string, { name: string; items: SabiMarketplaceCartItem[]; subtotal: number }>();
    for (const item of items) {
      const key = item.business_name || item.business_slug || item.product_id;
      const group = grouped.get(key) || { name: item.business_name || "Sabi seller", items: [], subtotal: 0 };
      group.items.push(item);
      group.subtotal += Number(item.product_price) * item.quantity;
      grouped.set(key, group);
    }
    return Array.from(grouped.values());
  }, [items]);

  function updateQuantity(productId: string, quantity: number) {
    const next = items.map(item => item.product_id === productId
      ? { ...item, quantity: Math.min(item.product_stock, Math.max(1, quantity)) }
      : item);
    setItems(next);
    saveMarketplaceCart(next);
  }

  function removeItem(productId: string) {
    const next = items.filter(item => item.product_id !== productId);
    setItems(next);
    saveMarketplaceCart(next);
  }

  async function checkout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!items.length) return;
    setBusy(true);
    setError("");
    const deliveryAddress = [address.trim(), city.trim(), state.trim(), "Nigeria"].filter(Boolean).join(", ");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("order-api", {
        body: {
          action: "create_marketplace_checkout",
          items: items.map(item => ({ product_id: item.product_id, quantity: item.quantity })),
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          customer_email: email.trim().toLowerCase(),
          delivery_address: deliveryAddress,
          notes: notes.trim() || null
        }
      });
      if (invokeError) throw new Error(data?.message || invokeError.message || "We could not create your checkout.");
      if (!data?.success || !data?.authorization_url) {
        throw new Error(data?.message || "We could not start your combined payment. Please try again.");
      }
      window.location.assign(data.authorization_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout could not be completed.");
      setBusy(false);
    }
  }

  return (
    <main className="sabi-cart-page">
      <header className="sabi-cart-header">
        <a className="sabi-cart-brand" href="/"><img src="https://i.ibb.co/N2b6rJnY/Untitled-design-20261030-044935-0000.png" alt="Sabi" /><span><strong>Sabi</strong><small>DISCOVER</small></span></a>
        <a className="sabi-cart-back" href="/"><ArrowLeft size={16}/> Continue shopping</a>
      </header>
      <div className="sabi-cart-wrap">
        <div className="sabi-cart-heading"><span>YOUR SHOPPING BAG</span><h1>Checkout</h1><p>One secure payment. Separate orders and delivery arrangements for each seller.</p></div>
        {items.length === 0 ? (
          <section className="sabi-cart-empty"><ShoppingBag size={34}/><h2>Your cart is empty</h2><p>Discover products from Nigerian businesses and add your favourites.</p><a href="/">Explore Sabi Discover</a></section>
        ) : (
          <div className="sabi-cart-layout">
            <div className="sabi-cart-main">
              {sellers.map(seller => (
                <section className="sabi-cart-seller" key={seller.name}>
                  <div className="sabi-cart-seller-title"><Store size={17}/><strong>{seller.name}</strong><span>{seller.items.length} {seller.items.length === 1 ? "item" : "items"}</span></div>
                  {seller.items.map(item => (
                    <div className="sabi-cart-item" key={item.product_id}>
                      {item.product_image_url ? <img src={item.product_image_url} alt={item.product_name}/> : <div className="sabi-cart-no-image"><ShoppingBag size={23}/></div>}
                      <div className="sabi-cart-item-info"><strong>{item.product_name}</strong><b>{money(Number(item.product_price))}</b><small>{item.product_stock} available</small>
                        <div className="sabi-cart-quantity"><button type="button" onClick={() => updateQuantity(item.product_id,item.quantity-1)} aria-label="Decrease quantity"><Minus size={14}/></button><span>{item.quantity}</span><button type="button" onClick={() => updateQuantity(item.product_id,item.quantity+1)} disabled={item.quantity>=item.product_stock} aria-label="Increase quantity"><Plus size={14}/></button></div>
                      </div>
                      <div className="sabi-cart-item-actions"><strong>{money(Number(item.product_price)*item.quantity)}</strong><button type="button" onClick={() => removeItem(item.product_id)} aria-label="Remove item"><Trash2 size={16}/> Remove</button></div>
                    </div>
                  ))}
                  <div className="sabi-cart-delivery"><Truck size={15}/><span>Delivery fee set by this seller and included in the final checkout total.</span></div>
                </section>
              ))}
              <section className="sabi-cart-address">
                <div className="sabi-cart-section-heading"><span>01</span><div><h2>Delivery address</h2><p>Where should your sellers deliver your order?</p></div></div>
                <form id="sabi-marketplace-checkout" onSubmit={checkout}>
                  <div className="sabi-cart-fields">
                    <label>Full name<input value={name} onChange={e=>setName(e.target.value)} autoComplete="name" required placeholder="Your full name"/></label>
                    <label>Phone number<input value={phone} onChange={e=>setPhone(e.target.value)} autoComplete="tel" required placeholder="080..."/></label>
                    <label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required placeholder="you@example.com"/></label>
                    <label>State<input value={state} onChange={e=>setState(e.target.value)} required placeholder="e.g. Edo"/></label>
                    <label>City / town<input value={city} onChange={e=>setCity(e.target.value)} required placeholder="e.g. Benin City"/></label>
                    <label className="sabi-cart-full">Street address<input value={address} onChange={e=>setAddress(e.target.value)} required placeholder="House number, street, area"/></label>
                    <label className="sabi-cart-full">Delivery notes (optional)<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Landmark or delivery instructions"/></label>
                  </div>
                </form>
              </section>
            </div>
            <aside className="sabi-cart-summary">
              <h2>Order summary</h2>
              <div className="sabi-cart-summary-line"><span>Items ({items.reduce((n,item)=>n+item.quantity,0)})</span><strong>{money(subtotal)}</strong></div>
              <div className="sabi-cart-summary-line"><span>Delivery</span><strong>Calculated per seller</strong></div>
              <div className="sabi-cart-summary-note">Each seller's delivery fee is calculated securely from their store settings before payment.</div>
              <div className="sabi-cart-summary-total"><span>Items subtotal</span><strong>{money(subtotal)}</strong></div>
              <div className="sabi-cart-protection"><ShieldCheck size={18}/><span>Secure Paystack payment. Sabi confirms every seller order after payment verification.</span></div>
              {error && <div className="sabi-cart-error" role="alert">{error}</div>}
              <button className="sabi-cart-pay" form="sabi-marketplace-checkout" disabled={busy || items.length===0}><CreditCard size={18}/>{busy ? "Preparing secure checkout..." : "Continue to secure payment"}</button>
              <small className="sabi-cart-payment-note"><CheckCircle2 size={13}/> One payment for {sellers.length} {sellers.length===1?"seller":"sellers"} · Online payment only</small>
            </aside>
          </div>
        )}
      </div>
      <footer className="sabi-cart-footer">Sabi by XTOP · Nigeria's marketplace for local businesses</footer>
    </main>
  );
}
