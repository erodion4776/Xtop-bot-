import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertCircle, BadgeCheck, MessageCircle, Send,
  CheckCircle2, ChevronRight, CircleDollarSign, CreditCard, LayoutDashboard,
  LogOut, Menu, MessageSquare, Package, RefreshCw, Search, ShieldCheck,
  ShoppingBag, Store, Users, Wallet, X, Ban, PlayCircle, Mail
} from "lucide-react";
import { supabase } from "./lib/supabase";
import "./SuperAdmin.css";

type Page = "Overview" | "Merchants" | "Orders & Payments" | "Live Support" | "Activity Log" | "WhatsApp Usage" | "Platform Controls" | "Platform Email";
type WhatsAppUsageRow = {
  phone_number_id: string; billing_month: string; source_app: string;
  outbound_messages: number; inbound_messages: number; delivered_messages: number;
  read_messages: number; failed_messages: number; billable_messages: number;
  non_billable_messages: number; estimated_cost: number; currency: string;
};
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
  sales_fee_amount: number | null; sales_fee_status: string | null;
  sabi_fee_amount?: number; sabi_fee_status?: string; sabi_fee_source?: string;
  created_at: string; merchant_name: string;
};
type DemoSupportMessage = { id: string; direction: string; type: string; text: string; created_at: string };
type DemoSupportChat = { conversation_id: string; contact_id: string; state: string; kind: "DEMO" | "SABI"; last_message_at: string; contact: { id: string; phone: string; name: string | null }; messages: DemoSupportMessage[] };
type ActivityItem = {
  id: string; admin_user: string | null; action: string; entity: string | null;
  entity_id: string | null; metadata: Record<string, unknown> | null; created_at: string;
};

const pages: { label: Page; icon: any }[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Merchants", icon: Store },
  { label: "Orders & Payments", icon: CreditCard },
  { label: "Live Support", icon: MessageCircle },
  { label: "Activity Log", icon: Activity },
  { label: "WhatsApp Usage", icon: MessageSquare },
  { label: "Platform Controls", icon: ShieldCheck },
  { label: "Platform Email", icon: Mail },
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
  const [supportChats, setSupportChats] = useState<DemoSupportChat[]>([]);
  const [selectedSupportId, setSelectedSupportId] = useState("");
  const [supportDraft, setSupportDraft] = useState("");
  const [whatsappUsage, setWhatsappUsage] = useState<WhatsAppUsageRow[]>([]);
  const [usageSettings, setUsageSettings] = useState<any[]>([]);
  const [emailCampaigns, setEmailCampaigns] = useState<any[]>([]);
  const [emailAudience, setEmailAudience] = useState<"MERCHANTS" | "CUSTOMERS" | "ALL">("MERCHANTS");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailContent, setEmailContent] = useState("");
  const [emailCounts, setEmailCounts] = useState({ merchant_count: 0, customer_count: 0 });
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
      } else if (target === "Live Support") {
        const result = await callAdmin("support-list");
        setSupportChats(result.data || []);
        setSelectedSupportId((current) => current && (result.data || []).some((x: DemoSupportChat) => x.contact_id === current) ? current : (result.data?.[0]?.contact_id || ""));
      } else if (target === "Activity Log") {
        const result = await callAdmin("activity");
        setActivity(result.data || []);
      } else if (target === "WhatsApp Usage") {
        const result = await callAdmin("whatsapp-usage");
        setWhatsappUsage(result.data?.monthly || []);
        setUsageSettings(result.data?.settings || []);
      } else if (target === "Platform Controls") {
        const result = await callAdmin("overview");
        setStats(result.data);
      } else if (target === "Platform Email") {
        const result = await callAdmin("email-campaign-data");
        setEmailCampaigns(result.data?.campaigns || []);
        setEmailCounts({ merchant_count: result.data?.merchant_count || 0, customer_count: result.data?.customer_count || 0 });
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

  async function sendSupportReply() {
    const chat = supportChats.find((x) => x.contact_id === selectedSupportId);
    const message = supportDraft.trim();
    if (!chat || !message) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await callAdmin("support-reply", { contact_id: chat.contact_id, conversation_id: chat.conversation_id, message });
      setSupportDraft("");
      setNotice("Reply sent to the customer's WhatsApp.");
      await loadPage("Live Support");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not send WhatsApp reply."); }
    finally { setBusy(false); }
  }

  async function resumeDemoBot() {
    const chat = supportChats.find((x) => x.contact_id === selectedSupportId);
    if (!chat || !window.confirm(chat.kind === "DEMO" ? "End live support and return this customer to the Sabi demo bot?" : "End this support session and return this customer to the Sabi menu?")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await callAdmin("support-resume", { contact_id: chat.contact_id, conversation_id: chat.conversation_id });
      setNotice("Customer returned to the Sabi demo bot.");
      await loadPage("Live Support");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not resume the demo bot."); }
    finally { setBusy(false); }
  }


  async function sendPlatformEmail() {
    if (!emailSubject.trim() || emailContent.trim().length < 10) {
      setError("Enter an email subject and message of at least 10 characters.");
      return;
    }
    const counts = emailAudience === "MERCHANTS" ? emailCounts.merchant_count
      : emailAudience === "CUSTOMERS" ? emailCounts.customer_count
      : emailCounts.merchant_count + emailCounts.customer_count;
    if (!counts) {
      setError("There are no eligible recipients in this audience yet. Customer recipients must explicitly subscribe to Sabi platform updates.");
      return;
    }
    if (!window.confirm("Send this Sabi-branded email to up to " + counts + " eligible recipients? This action cannot be undone.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await callAdmin("email-campaign-send", {
        audience: emailAudience, subject: emailSubject.trim(), content: emailContent.trim(),
      });
      setNotice("Campaign completed: " + result.sent_count + " sent, " + result.failed_count + " failed, out of " + result.recipient_count + " recipients.");
      setEmailSubject(""); setEmailContent("");
      await loadPage("Platform Email");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not send platform email campaign."); }
    finally { setBusy(false); }
  }

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
    const reason = window.prompt(
      next ? "Reason for enabling global human handoff:" : "Reason for disabling global human handoff:",
    );
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setError("Please enter a reason of at least 3 characters.");
      return;
    }
    const confirmed = window.confirm(
      next
        ? "Enable global human handoff? This changes the platform-wide Sabi handoff behaviour."
        : "Disable global human handoff? Sabi automation may resume for conversations not individually handed to an agent.",
    );
    if (!confirmed) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await callAdmin("toggle-global-handoff", {
        enabled: next,
        expected_enabled: !next,
        reason: reason.trim(),
      });
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
                  <div className="sa-table-wrap"><table><thead><tr><th>Order</th><th>Merchant</th><th>Customer</th><th>Subtotal</th><th>Delivery</th><th>Total</th><th>Payment</th><th>Sabi platform charge</th><th>Date</th></tr></thead><tbody>
                    {orders.map((o) => <tr key={o.id}><td><strong>{o.order_number || o.id.slice(0,8)}</strong><small>{o.status || "—"}</small></td><td>{o.merchant_name}</td><td>{o.customer_name || "—"}</td><td>{money(o.subtotal)}</td><td>{money(o.delivery_fee)}</td><td><strong>{money(o.total)}</strong></td><td><span className={o.payment_status === "PAID" ? "sa-pill good" : "sa-pill neutral"}>{o.payment_status || "Pending"}</span></td><td>{money(o.sabi_fee_amount ?? o.sales_fee_amount ?? 0)}<small>{o.sabi_fee_source === "PAYSTACK_CHARGE_RECORD" ? `Recorded · ${o.sabi_fee_status || "RECORDED"} (settlement not confirmed)` : (o.sabi_fee_status || o.sales_fee_status || "NOT_CHARGED")}</small></td><td>{dateLabel(o.created_at)}</td></tr>)}
                    {orders.length === 0 && <tr><td colSpan={9} className="sa-empty">No orders have been recorded yet.</td></tr>}
                  </tbody></table></div>
                </div>
              )}
              {page === "Live Support" && (
                <div className="sa-panel">
                  <div className="sa-panel-head"><div><h2>Live WhatsApp Support</h2><p>Manage Sabi customer requests and shop-demo handoffs. Replies go directly to each customer’s real WhatsApp chat.</p></div><span>{supportChats.length} waiting</span></div>
                  <div className={`sa-support-layout ${selectedSupportId ? "has-selection" : ""}`} style={{display:"grid",gridTemplateColumns:"minmax(220px,0.8fr) minmax(0,1.7fr)",gap:16,minHeight:420,minWidth:0}}>
                    <div className="sa-support-list" style={{border:"1px solid var(--sa-border, #e5e7eb)",borderRadius:12,overflowY:"auto",maxHeight:560,minWidth:0}}>
                      {supportChats.map((chat) => <button key={chat.contact_id} onClick={() => setSelectedSupportId(chat.contact_id)} style={{display:"block",width:"100%",textAlign:"left",padding:14,border:0,borderBottom:"1px solid #e5e7eb",background:selectedSupportId===chat.contact_id?"#eff6ff":"transparent",color:"inherit",cursor:"pointer"}}>
                        <strong>{chat.contact.name || "WhatsApp customer"}</strong><div style={{fontSize:12,opacity:.75,marginTop:4}}>{chat.contact.phone}</div><div style={{fontSize:11,marginTop:5,opacity:.7}}>{chat.kind === "DEMO" ? "Shop demo" : "Sabi customer support"}</div><div style={{fontSize:12,opacity:.65,marginTop:4}}>{chat.messages[chat.messages.length - 1]?.text?.slice(0,70) || "Waiting for your reply"}</div>
                      </button>)}
                      {supportChats.length===0 && <div className="sa-empty" style={{padding:20}}>No customers are waiting right now. New Sabi support requests and demo handoffs will appear here.</div>}
                    </div>
                    <div className="sa-support-chat" style={{border:"1px solid #e5e7eb",borderRadius:12,padding:14,display:"flex",flexDirection:"column",minHeight:420,minWidth:0}}>
                      {(() => { const chat=supportChats.find((x)=>x.contact_id===selectedSupportId); return chat ? <>
                        <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",paddingBottom:12,borderBottom:"1px solid #e5e7eb"}}><div style={{display:"flex",alignItems:"center",gap:9,minWidth:0}}><button type="button" className="sa-support-back" onClick={()=>setSelectedSupportId("")}>← Customers</button><div><strong>{chat.contact.name || "WhatsApp customer"}</strong><div style={{fontSize:12,opacity:.7}}>{chat.contact.phone}</div><div style={{fontSize:11,opacity:.7,marginTop:4}}>{chat.kind === "DEMO" ? "Shop demo handoff" : "Sabi customer support"}</div></div></div><button className="sa-action good" disabled={busy} onClick={()=>void resumeDemoBot()}>Return to bot</button></div>
                        <div style={{flex:1,overflowY:"auto",padding:"14px 2px",display:"flex",flexDirection:"column",gap:9,maxHeight:390}}>
                          {chat.messages.map((m)=> <div key={m.id} style={{alignSelf:m.direction==="OUTBOUND"?"flex-end":"flex-start",maxWidth:"85%",padding:"9px 12px",borderRadius:12,background:m.direction==="OUTBOUND"?"#dcfce7":"#f3f4f6",color:"#111827",whiteSpace:"pre-wrap",fontSize:14}}>{m.text || (m.type==="image"?"[Image]":"[Message]")}<div style={{fontSize:10,opacity:.6,marginTop:5}}>{m.direction==="OUTBOUND"?"You":"Customer"} · {dateLabel(m.created_at)}</div></div>)}
                        </div>
                        <div style={{display:"flex",gap:8,alignItems:"end",paddingTop:10,borderTop:"1px solid #e5e7eb"}}><textarea value={supportDraft} onChange={(e)=>setSupportDraft(e.target.value)} placeholder="Write your WhatsApp reply…" rows={2} style={{flex:1,resize:"vertical",border:"1px solid #d1d5db",borderRadius:9,padding:10,font:"inherit"}}/><button className="sa-action good" disabled={busy||!supportDraft.trim()} onClick={()=>void sendSupportReply()}><Send size={15}/> Send</button></div>
                      </> : <div className="sa-empty" style={{margin:"auto"}}>Select a waiting customer to open the WhatsApp conversation.</div>; })()}
                    </div>
                  </div>
                  <p style={{fontSize:12,opacity:.7,marginTop:12}}>This inbox refreshes when you tap Refresh. Keep this page open while handling the customer. The customer’s automated experience remains paused until you select Return to bot.</p>
                </div>
              )}
              {page === "Activity Log" && (
                <div className="sa-panel">
                  <div className="sa-panel-head"><div><h2>Administrative activity</h2><p>Recent platform-level changes and their recorded reasons.</p></div><span>{activity.length} records</span></div>
                  <div className="sa-activity-list">{activity.map((item) => <div className="sa-activity-row" key={item.id}><div className="sa-activity-icon"><Activity size={17}/></div><div className="sa-activity-body"><strong>{item.action.replace(/_/g, " ")}</strong><span>{item.admin_user || "Admin"} · {item.entity || "Platform"} · {item.entity_id || "—"}</span>{item.metadata?.previous_enabled !== undefined || item.metadata?.new_enabled !== undefined ? <p>Global handoff: {item.metadata?.previous_enabled === true ? "Enabled" : "Disabled"} → {item.metadata?.new_enabled === true ? "Enabled" : "Disabled"}</p> : null}{item.metadata?.previous_is_active !== undefined || item.metadata?.new_is_active !== undefined ? <p>Merchant status: {item.metadata?.previous_is_active === true ? "Active" : "Suspended"} → {item.metadata?.new_is_active === true ? "Active" : "Suspended"}</p> : null}{item.metadata?.reason ? <p>Reason: {String(item.metadata.reason)}</p> : null}</div><time>{dateLabel(item.created_at)}</time></div>)}{activity.length === 0 && <div className="sa-empty">No administrative activity has been recorded yet.</div>}</div>
                </div>
              )}
              {page === "WhatsApp Usage" && (
                <div className="sa-panel">
                  <div className="sa-panel-head">
                    <div><h2>WhatsApp message usage</h2><p>Meta delivery status and billing category data grouped by phone number, month and application.</p></div>
                    <span>{whatsappUsage.length} usage groups</span>
                  </div>
                  {usageSettings.length > 0 && <div className="sa-usage-settings">
                    {usageSettings.map((setting) => <div key={setting.phone_number_id}>
                      <strong>{setting.display_phone_number || setting.phone_number_id}</strong>
                      <span>Free service allowance configured: {setting.monthly_free_service_allowance} per month</span>
                    </div>)}
                  </div>}
                  <div className="sa-historical-block">
                    <div className="sa-historical-heading"><div><h3>Historical Meta usage · previous 30-day snapshot</h3><p>Imported from the Meta Insights figures you shared earlier. This is a historical summary, not a live feed.</p></div><span className="sa-pill neutral">Historical</span></div>
                    <div className="sa-historical-grid">
                      <div><span>Messages sent / delivered</span><strong>1,732</strong></div>
                      <div><span>Messages received</span><strong>1,073</strong></div>
                      <div><span>Free messages</span><strong>1,116</strong></div>
                      <div><span>Paid delivered messages</span><strong>616</strong></div>
                      <div><span>Estimated Meta billing</span><strong>$4.13</strong></div>
                    </div>
                    <p className="sa-historical-footnote">Meta classified the recorded usage as Service. These figures cover the shared WhatsApp number used by both Sabi and Engr Ero, so they cannot be reliably split by application. The screenshot's exact start and end dates were not retained. Check Meta Billing for the final invoice amount.</p>
                  </div>
                  <div className="sa-usage-note">New usage below is collected from webhook events after monitoring was deployed. Meta Billing remains the authoritative source for charges. Delivered and read are shown as separate status counts.</div>
                  <div className="sa-table-wrap"><table><thead><tr><th>Billing month</th><th>Phone number ID</th><th>Application</th><th>Outbound</th><th>Delivered</th><th>Read</th><th>Failed</th><th>Meta billable</th><th>Meta free</th><th>Estimated cost</th></tr></thead><tbody>
                    {whatsappUsage.map((row, index) => <tr key={row.phone_number_id + row.billing_month + row.source_app + index}>
                      <td>{new Date(row.billing_month).toLocaleDateString("en-NG", { month: "short", year: "numeric", timeZone: "Africa/Lagos" })}</td>
                      <td>{row.phone_number_id}</td><td><span className="sa-pill neutral">{row.source_app}</span></td>
                      <td>{row.outbound_messages}</td><td>{row.delivered_messages}</td><td>{row.read_messages}</td><td>{row.failed_messages}</td>
                      <td>{row.billable_messages}</td><td>{row.non_billable_messages}</td><td>{row.estimated_cost > 0 ? "$" + Number(row.estimated_cost).toFixed(2) : "See Meta invoice"}</td>
                    </tr>)}
                    {whatsappUsage.length === 0 && <tr><td colSpan={10} className="sa-empty">No new WhatsApp delivery-status events have been collected yet. New events will appear after Meta sends webhook status updates.</td></tr>}
                  </tbody></table></div>
                </div>
              )}

              {page === "Platform Email" && (
                <div className="sa-panel">
                  <div className="sa-panel-head"><div><h2>Platform email campaigns</h2><p>Send official Sabi announcements to merchant owners and customers who explicitly subscribed to Sabi platform updates.</p></div><span>Owner only</span></div>
                  <div className="sa-email-audience-grid">
                    <div><span>Active merchant owner emails</span><strong>{emailCounts.merchant_count}</strong></div>
                    <div><span>Opted-in Sabi customers</span><strong>{emailCounts.customer_count}</strong></div>
                  </div>
                  <div className="sa-email-notice">Customer marketing emails are sent only to people who explicitly subscribed to Sabi platform updates. Checkout emails and merchant-specific store newsletter subscribers are not automatically included.</div>
                  <div className="sa-email-form">
                    <label>Recipients</label>
                    <select value={emailAudience} onChange={(e)=>setEmailAudience(e.target.value as "MERCHANTS"|"CUSTOMERS"|"ALL")}>
                      <option value="MERCHANTS">All active merchants ({emailCounts.merchant_count})</option>
                      <option value="CUSTOMERS">Subscribed Sabi customers ({emailCounts.customer_count})</option>
                      <option value="ALL">Merchants and subscribed customers ({emailCounts.merchant_count + emailCounts.customer_count})</option>
                    </select>
                    <label>Email subject</label>
                    <input value={emailSubject} onChange={(e)=>setEmailSubject(e.target.value)} maxLength={120} placeholder="e.g. Important update from Sabi by XTOP"/>
                    <label>Message</label>
                    <textarea value={emailContent} onChange={(e)=>setEmailContent(e.target.value)} rows={8} maxLength={12000} placeholder="Write your announcement here…"/>
                    <div className="sa-email-foot"><span>Sent as Sabi by XTOP · noreply@mail.sabibyxtop.com.ng</span><button className="sa-action good" disabled={busy || !emailSubject.trim() || emailContent.trim().length<10} onClick={()=>void sendPlatformEmail()}><Send size={15}/> Send campaign</button></div>
                  </div>
                  <div className="sa-panel-head" style={{marginTop:28}}><div><h2>Campaign history</h2><p>Latest platform-wide email activity and delivery submission results.</p></div><span>{emailCampaigns.length} campaigns</span></div>
                  <div className="sa-table-wrap"><table><thead><tr><th>Subject</th><th>Audience</th><th>Recipients</th><th>Sent</th><th>Failed</th><th>Status</th><th>Date</th></tr></thead><tbody>
                    {emailCampaigns.map((campaign:any)=><tr key={campaign.id}><td><strong>{campaign.subject}</strong></td><td>{campaign.audience}</td><td>{campaign.recipient_count}</td><td>{campaign.sent_count}</td><td>{campaign.failed_count}</td><td><span className={campaign.status==="SENT"?"sa-pill good":campaign.status==="FAILED"?"sa-pill danger":"sa-pill neutral"}>{campaign.status}</span></td><td>{dateLabel(campaign.created_at)}</td></tr>)}
                    {emailCampaigns.length===0 && <tr><td colSpan={7} className="sa-empty">No platform email campaigns have been sent yet.</td></tr>}
                  </tbody></table></div>
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
        <div className="sa-finance-sub"><div><span>Recorded Sabi platform charges</span><strong>{money(stats.recordedSalesFees)}</strong></div><div><span>Orders marked paid</span><strong>{stats.paidOrders}</strong></div></div>
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
