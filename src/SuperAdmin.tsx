import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertCircle, BadgeCheck,
  CheckCircle2, ChevronRight, CircleDollarSign, CreditCard, LayoutDashboard,
  LogOut, Menu, MessageSquare, Package, RefreshCw, Search, ShieldCheck,
  ShoppingBag, Store, Users, Wallet, X, Ban, PlayCircle
} from "lucide-react";
import { supabase } from "./lib/supabase";
import "./SuperAdmin.css";

type Page = "Overview" | "Merchants" | "Orders & Payments" | "Activity Log" | "Platform Controls";
type Stats = {
  activeMerchants: number; inactiveMerchants: number; products: number; orders: number;
  paidOrders: number; whatsappConnections: number; pendingPayouts: number; verifiedPayouts: number;
  paidOrderRevenue: number; recordedSalesFees: number; globalHandoff: boolean;
};
type Merchant = {
  id: string; name: string; business_name: string | null; industry: string | null;
  contact_name: string | null; contact_email: string | null; contact_phone: string | null;
  is_active: boolean; created_at: string; paystack_subaccount_status: string | null;
  order_count: number; paid_order_count: number; product_count: number; whatsapp_connected: boolean;
};
type Order = {
  id: string; tenant_id: string; order_number: string | null; customer_name: string | null;
  status: string; payment_status: string; subtotal: number; delivery_fee: number; total: number;
  sales_fee_amount: number | null; sales_fee_status: string | null; created_at: string; merchant_name: string;
};
type ActivityItem = {
  id: string; admin_user: string | null; action: string; entity: string | null;
  entity_id: string | null; metadata: Record<string, unknown> | null; created_at: string;
};

const pages: { label: Page; icon: any }[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Merchants", icon: Store },
  { label: "Orders & Payments", icon: CreditCard },
  { label: "Activity Log", icon: Activity },
  { label: "Platform Controls", icon: ShieldCheck },
];

const money = (value: number) => new Intl.NumberFormat("en-NG", {
  style: "currency", currency: "NGN", maximumFractionDigits: 0,
}).format(Number(value) || 0);

const dateLabel = (value: string) => new Date(value).toLocaleString("en-NG", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos",
});

export default function SuperAdmin({ email, onLogout }: { email: string; onLogout: () => void }) {
  const [page, setPage] = useState<Page>("Overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const callAdmin = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error: invokeError } = await supabase.functions.invoke("sabi-super-admin", {
      body: { action, ...extra },
    });
    if (invokeError) {
      let message = invokeError.message || "The Super Admin request failed.";
      try {
        const context = (invokeError as any).context;
        if (context && typeof context.json === "function") {
          const payload = await context.json();
          if (payload?.error) message = payload.error;
        }
      } catch { /* keep the original error */ }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const loadPage = useCallback(async (target: Page = page) => {
    setLoading(true);
    setError("");
    try {
      if (target === "Overview") {
        const result = await callAdmin("overview");
        setStats(result.data);
      } else if (target === "Merchants") {
        const result = await callAdmin("merchants");
        setMerchants(result.data || []);
      } else if (target === "Orders & Payments") {
        const result = await callAdmin("orders");
        setOrders(result.data || []);
      } else if (target === "Activity Log") {
        const result = await callAdmin("activity");
        setActivity(result.data || []);
      } else if (target === "Platform Controls") {
        const result = await callAdmin("overview");
        setStats(result.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Super Admin data.");
    } finally {
      setLoading(false);
    }
  }, [callAdmin, page]);

  useEffect(() => { void loadPage(page); }, [page, loadPage]);

  const filteredMerchants = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return merchants;
    return merchants.filter((m) => [
      m.business_name, m.name, m.contact_name, m.contact_email, m.contact_phone, m.industry,
    ].some((value) => String(value || "").toLowerCase().includes(term)));
  }, [merchants, search]);

  async function changeMerchantStatus(merchant: Merchant) {
    const next = !merchant.is_active;
    const reason = window.prompt(
      next ? "Reason for reactivating this merchant:" : "Reason for suspending this merchant:",
    );
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setError("Please enter a reason of at least 3 characters.");
      return;
    }
    const confirmed = window.confirm(
      next
        ? "Reactivate this merchant workspace?"
        : "Suspend this merchant workspace? The merchant will lose access while it is inactive.",
    );
    if (!confirmed) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await callAdmin("set-merchant-status", {
        tenant_id: merchant.id, is_active: next, reason: reason.trim(),
      });
      setMerchants((current) => current.map((m) => m.id === merchant.id ? { ...m, is_active: next } : m));
      setNotice(next ? "Merchant reactivated." : "Merchant suspended. The action was sent to the audit log.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update merchant status.");
    } finally { setBusy(false); }
  }

  async function toggleGlobalHandoff() {
    const next = !(stats?.globalHandoff === true);
    const confirmed = window.confirm(
      next
        ? "Enable global human handoff? This changes the platform-wide Sabi handoff behaviour."
        : "Disable global human handoff? Sabi automation may resume for conversations not individually handed to an agent.",
    );
    if (!confirmed) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await callAdmin("toggle-global-handoff", { enabled: next });
      setStats((current) => current ? { ...current, globalHandoff: next } : current);
      setNotice(next ? "Global human handoff enabled." : "Global human handoff disabled.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update platform control.");
    } finally { setBusy(false); }
  }

  return (
    <div className="sa-shell">
      <aside className={`sa-sidebar ${mobileOpen ? "sa-sidebar-open" : ""}`}>
        <div className="sa-brand">
          <img src="https://i.ibb.co/N2b6rJnY/Untitled-design-20261030-044935-0000.png" alt="Sabi" />
          <div><strong>Sabi</strong><span>PLATFORM ADMIN</span></div>
          <button className="sa-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={19}/></button>
        </div>
        <div className="sa-sidebar-label">OWNER CONSOLE</div>
        <nav className="sa-nav">
          {pages.map(({ label, icon: Icon }) => (
            <button key={label} className={page === label ? "active" : ""} onClick={() => { setPage(label); setMobileOpen(false); }}>
              <Icon size={18}/><span>{label}</span>{page === label && <ChevronRight size={16}/>}
            </button>
          ))}
        </nav>
        <div className="sa-sidebar-bottom">
          <div className="sa-secure-note"><ShieldCheck size={17}/><span>Restricted owner access</span></div>
          <div className="sa-user"><div className="sa-avatar">{email.charAt(0).toUpperCase() || "A"}</div><div><strong>Super Admin</strong><small>{email}</small></div></div>
          <button className="sa-logout" onClick={onLogout}><LogOut size={17}/> Sign out</button>
        </div>
      </aside>
      {mobileOpen && <button className="sa-overlay" onClick={() => setMobileOpen(false)} aria-label="Close menu"/>}
      <main className="sa-main">
        <header className="sa-topbar">
          <button className="sa-menu" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={21}/></button>
          <div><span> SABI BY XTOP </span><b>/ {page}</b></div>
          <div className="sa-top-right"><span className="sa-live"><i/>Owner console</span><button onClick={() => void loadPage(page)} disabled={loading}><RefreshCw size={16}/> Refresh</button></div>
        </header>
        <section className="sa-content">
          <div className="sa-heading">
            <div><p>PLATFORM MANAGEMENT</p><h1>{page}</h1><span>Manage Sabi merchants, transactions and platform operations.</span></div>
            <div className="sa-heading-mark"><ShieldCheck size={25}/><span>SECURE ADMIN</span></div>
          </div>

          {error && <div className="sa-alert sa-error"><AlertCircle size={18}/>{error}</div>}
          {notice && <div className="sa-alert sa-success"><CheckCircle2 size={18}/>{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15}/></button></div>}

          {loading ? <div className="sa-loading"><RefreshCw className="sa-spin" size={22}/><strong>Loading platform data…</strong><span>Verifying access and retrieving records.</span></div> : (
            <>
              {page === "Overview" && stats && <Overview stats={stats} onOpenMerchants={() => setPage("Merchants")} onOpenOrders={() => setPage("Orders & Payments")}/>}
              {page === "Merchants" && (
                <div className="sa-panel">
                  <div className="sa-panel-head"><div><h2>Merchant directory</h2><p>Merchant workspaces only. The internal XTOP system tenant is excluded.</p></div><span>{merchants.length} merchants</span></div>
                  <div className="sa-search"><Search size={17}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search business, owner, email or phone"/></div>
                  <div className="sa-table-wrap"><table><thead><tr><th>Business</th><th>Owner / Contact</th><th>Orders</th><th>Products</th><th>WhatsApp</th><th>Paystack</th><th>Status</th><th>Action</th></tr></thead><tbody>
                    {filteredMerchants.map((m) => <tr key={m.id}>
                      <td><strong>{m.business_name || m.name || "Unnamed business"}</strong><small>{m.industry || "Business"} · {dateLabel(m.created_at)}</small></td>
                      <td>{m.contact_name || "—"}<small>{m.contact_email || m.contact_phone || "No contact details"}</small></td>
                      <td>{m.order_count} <small>{m.paid_order_count} paid</small></td><td>{m.product_count}</td>
                      <td><span className={m.whatsapp_connected ? "sa-pill good" : "sa-pill neutral"}>{m.whatsapp_connected ? "Connected" : "Pending"}</span></td>
                      <td><span className="sa-pill neutral">{m.paystack_subaccount_status || "Not configured"}</span></td>
                      <td><span className={m.is_active ? "sa-pill good" : "sa-pill danger"}>{m.is_active ? "Active" : "Suspended"}</span></td>
                      <td><button className={m.is_active ? "sa-action danger" : "sa-action good"} disabled={busy} onClick={() => void changeMerchantStatus(m)}>{m.is_active ? <><Ban size={14}/> Suspend</> : <><PlayCircle size={14}/> Reactivate</>}</button></td>
                    </tr>)}
                    {filteredMerchants.length === 0 && <tr><td colSpan={8} className="sa-empty">No matching merchants found.</td></tr>}
                  </tbody></table></div>
                </div>
              )}
              {page === "Orders & Payments" && (
                <div className="sa-panel">
                  <div className="sa-panel-head"><div><h2>Platform orders</h2><p>Latest 100 orders across merchant workspaces. Delivery fees are displayed separately from sales fees.</p></div><span>{orders.length} records</span></div>
                  <div className="sa-table-wrap"><table><thead><tr><th>Order</th><th>Merchant</th><th>Customer</th><th>Subtotal</th><th>Delivery</th><th>Total</th><th>Payment</th><th>Sabi fee</th><th>Date</th></tr></thead><tbody>
                    {orders.map((o) => <tr key={o.id}><td><strong>{o.order_number || o.id.slice(0,8)}</strong><small>{o.status || "—"}</small></td><td>{o.merchant_name}</td><td>{o.customer_name || "—"}</td><td>{money(o.subtotal)}</td><td>{money(o.delivery_fee)}</td><td><strong>{money(o.total)}</strong></td><td><span className={o.payment_status === "PAID" ? "sa-pill good" : "sa-pill neutral"}>{o.payment_status || "Pending"}</span></td><td>{money(o.sales_fee_amount || 0)}<small>{o.sales_fee_status || "Not recorded"}</small></td><td>{dateLabel(o.created_at)}</td></tr>)}
                    {orders.length === 0 && <tr><td colSpan={9} className="sa-empty">No orders have been recorded yet.</td></tr>}
                  </tbody></table></div>
                </div>
              )}
              {page === "Activity Log" && (
                <div className="sa-panel">
                  <div className="sa-panel-head"><div><h2>Administrative activity</h2><p>Recent platform-level changes and their recorded reasons.</p></div><span>{activity.length} records</span></div>
                  <div className="sa-activity-list">{activity.map((item) => <div className="sa-activity-row" key={item.id}><div className="sa-activity-icon"><Activity size={17}/></div><div className="sa-activity-body"><strong>{item.action.replace(/_/g, " ")}</strong><span>{item.admin_user || "Admin"} · {item.entity || "Platform"} · {item.entity_id || "—"}</span>{item.metadata?.reason ? <p>Reason: {String(item.metadata.reason)}</p> : null}</div><time>{dateLabel(item.created_at)}</time></div>)}{activity.length === 0 && <div className="sa-empty">No administrative activity has been recorded yet.</div>}</div>
                </div>
              )}
              {page === "Platform Controls" && stats && (
                <div className="sa-panel sa-control-panel">
                  <div className="sa-panel-head"><div><h2>Global platform controls</h2><p>These controls affect Sabi platform operations, not an individual merchant setting.</p></div><span>Owner only</span></div>
                  <div className="sa-control-row"><div className="sa-control-icon"><MessageSquare size={21}/></div><div className="sa-control-copy"><strong>Global human handoff</strong><p>When enabled, Sabi's platform-wide handoff mode is active. This is separate from merchant-level bot pause and individual customer takeover.</p><span className={stats.globalHandoff ? "sa-pill good" : "sa-pill neutral"}>{stats.globalHandoff ? "Enabled" : "Disabled"}</span></div><button className={stats.globalHandoff ? "sa-toggle on" : "sa-toggle"} disabled={busy} onClick={() => void toggleGlobalHandoff()}>{stats.globalHandoff ? "Disable" : "Enable"}</button></div>
                  <div className="sa-control-warning"><AlertCircle size={18}/><span>Changes are confirmed before saving and recorded in the admin activity log. Merchant credentials and payment secrets are never displayed here.</span></div>
                </div>
              )}
            </>
          )}
        </section>
        <footer className="sa-footer">Sabi by XTOP · XTOP Retail Technologies <span>Super Admin Console</span></footer>
      </main>
    </div>
  );
}

function Overview({ stats, onOpenMerchants, onOpenOrders }: {
  stats: Stats; onOpenMerchants: () => void; onOpenOrders: () => void;
}) {
  const cards = [
    { label: "Active merchants", value: stats.activeMerchants, note: `${stats.inactiveMerchants} inactive / suspended`, icon: Store },
    { label: "Total orders", value: stats.orders, note: `${stats.paidOrders} marked paid`, icon: ShoppingBag },
    { label: "Products listed", value: stats.products, note: "Across merchant stores", icon: Package },
    { label: "WhatsApp connections", value: stats.whatsappConnections, note: "Active merchant numbers", icon: MessageSquare },
  ];
  return <>
    <div className="sa-stat-grid">{cards.map(({ label, value, note, icon: Icon }) => <div className="sa-stat-card" key={label}><div className="sa-stat-top"><span>{label}</span><Icon size={19}/></div><strong>{value.toLocaleString("en-NG")}</strong><small>{note}</small></div>)}</div>
    <div className="sa-overview-grid">
      <div className="sa-panel sa-finance-panel"><div className="sa-panel-head"><div><h2>Platform transaction snapshot</h2><p>Calculated from recorded paid orders; not a bank settlement statement.</p></div><CircleDollarSign size={21}/></div>
        <div className="sa-finance-main"><span>Paid order value</span><strong>{money(stats.paidOrderRevenue)}</strong></div>
        <div className="sa-finance-sub"><div><span>Recorded Sabi sales fees</span><strong>{money(stats.recordedSalesFees)}</strong></div><div><span>Orders marked paid</span><strong>{stats.paidOrders}</strong></div></div>
        <button className="sa-link-button" onClick={onOpenOrders}>View orders and payments <ChevronRight size={16}/></button>
      </div>
      <div className="sa-panel sa-payout-panel"><div className="sa-panel-head"><div><h2>Merchant payout verification</h2><p>Paystack subaccount onboarding status.</p></div><Wallet size={21}/></div>
        <div className="sa-payout-number"><strong>{stats.verifiedPayouts}</strong><span>Verified payout accounts</span></div>
        <div className="sa-payout-number pending"><strong>{stats.pendingPayouts}</strong><span>Awaiting verification</span></div>
        <div className="sa-payout-note"><BadgeCheck size={17}/> Payout status only. This does not confirm that a transfer has settled.</div>
      </div>
    </div>
    <div className="sa-panel sa-shortcuts"><div><h2>Platform operations</h2><p>Open the management areas you need.</p></div><button onClick={onOpenMerchants}><Users size={18}/><span><strong>Manage merchants</strong><small>Review business status and onboarding</small></span><ChevronRight size={17}/></button><button onClick={onOpenOrders}><CreditCard size={18}/><span><strong>Monitor orders and payments</strong><small>Review paid orders and recorded sales fees</small></span><ChevronRight size={17}/></button></div>
  </>;
}
