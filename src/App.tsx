
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  MessageSquare,
  BarChart3,
  Settings,
  Menu,
  X,
  LogOut,
  Bot,
  Send,
  Headset,
  Mail,
  Store
} from "lucide-react";

import Auth from "./Auth";
import Products from "./Products";
import Orders from "./Orders";
import SettingsPage from "./Settings";
import Inbox from "./Inbox";
import Analytics from "./Analytics";
import Newsletter from "./Newsletter";
import PublicProduct from "./PublicProduct";
import PublicStorefront from "./PublicStorefront";
import PublicNewsletter from "./PublicNewsletter";
import Landing from "./Landing";
import Discover from "./Discover";
import MarketplaceCart from "./MarketplaceCart";
import SuperAdmin from "./SuperAdmin";
import { supabase } from "./lib/supabase";

const navigation = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Products", icon: Package },
  { label: "Orders", icon: ShoppingCart },
  { label: "Customer Service", icon: MessageSquare },
  { label: "Analytics", icon: BarChart3 },
  { label: "Newsletter", icon: Mail },
  { label: "Settings", icon: Settings }
];

const LOGO_URL =
  "https://i.ibb.co/N2b6rJnY/Untitled-design-20261030-044935-0000.png";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [tenantId, setTenantId] = useState("");
  const [registrationError, setRegistrationError] = useState("");
  const [registrationRetry, setRegistrationRetry] = useState(0);

  const registeredUser = useRef("");
  const authUserId = useRef("");

  const query = new URLSearchParams(window.location.search);
  const hostname = window.location.hostname.toLowerCase();
  const isDashboardHost = hostname === "app.sabibyxtop.com.ng";
  const isDiscoverPage = hostname === "discover.sabibyxtop.com.ng" || window.location.pathname === "/discover" || query.get("cart") === "1";
  const isMarketplaceCartPage = isDiscoverPage && query.get("cart") === "1";
  const isSuperAdminHost = hostname === "admin.sabibyxtop.com.ng";
  const isConnectPortalHost = hostname === "connect.sabibyxtop.com.ng";
  const isEngrPortalHost = hostname === "engr.sabibyxtop.com.ng";
  const isDedicatedPortalHost = isConnectPortalHost || isEngrPortalHost;
  const isPublicProductPage = query.has("product");
  const isPublicStorefrontPage = query.has("store");
  const isPublicNewsletterPage = query.has("newsletter");
  // The owner portal is available on its dedicated hostname and on the
  // protected /super-admin path for setup and recovery.
  const isSuperAdminPage =
    isSuperAdminHost ||
    window.location.pathname.replace(/\/+$/, "") === "/super-admin";
  const isPasswordRecovery = query.get("recovery") === "1";
  const isMarketingPage =
    !isDashboardHost &&
    !isSuperAdminHost &&
    !isDedicatedPortalHost &&
    window.location.pathname === "/" &&
    !query.has("login") &&
    !query.has("signup") &&
    !isPasswordRecovery &&
    !query.has("session_token") &&
    !isPublicProductPage &&
    !isPublicNewsletterPage &&
    !isDiscoverPage;

  const registrationToken = new URLSearchParams(
    window.location.search
  ).get("session_token")?.trim() || "";

  useEffect(() => {
    if (isPublicProductPage || isPublicStorefrontPage || isPublicNewsletterPage || isMarketingPage || isDiscoverPage || isDedicatedPortalHost) return;

    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;

      if (error) {
        setRegistrationError(error.message);
      }

      authUserId.current = data.session?.user?.id || "";
      setSession(data.session);
      setCheckingSession(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;

      const nextUserId = newSession?.user?.id || "";

      // Token refreshes and repeated INITIAL_SESSION events for the same
      // user must not clear an already loaded merchant workspace.
      if (authUserId.current !== nextUserId) {
        authUserId.current = nextUserId;
        setTenantId("");
        setRegistrationError("");
        setRegistering(false);
        registeredUser.current = "";
      }

      setSession(newSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [isPublicProductPage, isPublicStorefrontPage, isPublicNewsletterPage, isMarketingPage, isDiscoverPage, isDedicatedPortalHost, isPasswordRecovery]);

  useEffect(() => {
    if (isPublicProductPage || isPublicStorefrontPage || isPublicNewsletterPage || isMarketingPage || isDiscoverPage || isSuperAdminPage || isDedicatedPortalHost || isPasswordRecovery) return;

    if (!session?.user?.id) {
      setTenantId("");
      setRegistering(false);
      return;
    }

    const userId = session.user.id;

    if (registeredUser.current === userId) return;

    let cancelled = false;

    async function registerMerchant() {
      setRegistering(true);
      setRegistrationError("");

      if (cancelled) return;

      const { data, error } = await supabase.functions.invoke(
        "merchant-register",
        {
          body: {
            session_token: registrationToken || null
          }
        }
      );

      if (cancelled) return;

      if (error || !data?.success || !data?.tenant_id) {
        registeredUser.current = "";

        setRegistrationError(
          data?.error ||
            error?.message ||
            "Unable to load your merchant workspace."
        );

        setRegistering(false);
        return;
      }

      registeredUser.current = userId;
      setTenantId(data.tenant_id);
      setRegistering(false);
    }

    registerMerchant();

    return () => {
      cancelled = true;
    };
  }, [
    session?.user?.id,
    registrationRetry,
    isPublicProductPage,
    isPublicStorefrontPage,
    isPublicNewsletterPage,
    isMarketingPage,
    isDiscoverPage,
    isSuperAdminPage,
    isDedicatedPortalHost,
    registrationToken,
    isPasswordRecovery
  ]);

  async function refreshSession() {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
  }

  async function logout() {
    await supabase.auth.signOut();
    setSession(null);
    setTenantId("");
    setRegistrationError("");
    registeredUser.current = "";
  }

  if (isConnectPortalHost) {
    if (window.location.pathname !== "/connect-whatsapp.html") {
      window.location.replace(`/connect-whatsapp.html${window.location.search}`);
    }
    return null;
  }

  if (isEngrPortalHost) {
    if (window.location.pathname !== "/engr-ero-portal.html") {
      window.location.replace(`/engr-ero-portal.html${window.location.search}`);
    }
    return null;
  }

  if (isPublicProductPage) {
    return <PublicProduct />;
  }

  if (isPublicStorefrontPage) {
    return <PublicStorefront />;
  }

  if (isPublicNewsletterPage) {
    return <PublicNewsletter />;
  }

  if (isDiscoverPage) {
    return isMarketplaceCartPage ? <MarketplaceCart /> : <Discover />;
  }

  if (isMarketingPage) {
    return <Landing />;
  }

  if (checkingSession) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h2>Loading Sabi...</h2>
          <p>Checking your account.</p>
        </div>
      </div>
    );
  }

  if (isPasswordRecovery) {
    return <Auth onAuthenticated={refreshSession} isPasswordRecovery />;
  }

  if (!session) {
    return <Auth onAuthenticated={refreshSession} />;
  }

  if (isSuperAdminPage) {
    return <SuperAdmin email={session.user.email || ""} onLogout={logout} />;
  }

  if (registering || (!tenantId && !registrationError)) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <img
            src={LOGO_URL}
            alt="Sabi by XTOP"
            style={{ width: 90, height: 90, objectFit: "contain" }}
          />
          <h2>Preparing your workspace</h2>
          <p>Setting up your merchant workspace.</p>
        </div>
      </div>
    );
  }

  if (registrationError) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h2>Workspace setup issue</h2>

          <div className="auth-message" role="alert">
            {registrationError}
          </div>

          <button
            className="auth-submit"
            onClick={() => {
              registeredUser.current = "";
              setRegistrationError("");
              setTenantId("");
              setRegistering(true);
              setRegistrationRetry((value) => value + 1);
            }}
          >
            Try again
          </button>

          <button className="forgot-password" onClick={logout}>
            Log out
          </button>
        </div>
      </div>
    );
  }

  return (
    <Dashboard
      tenantId={tenantId}
      email={session.user.email || ""}
      onLogout={logout}
    />
  );
}

function Dashboard({
  tenantId,
  email,
  onLogout
}: {
  tenantId: string;
  email: string;
  onLogout: () => void;
}) {
  const validPages = navigation.map((item) => item.label);
  const pageStorageKey = `sabi:merchant:last-page:${tenantId}`;

  const [activePage, setActivePage] = useState(() => {
    try {
      const savedPage = window.localStorage.getItem(pageStorageKey);
      return savedPage && validPages.includes(savedPage)
        ? savedPage
        : "Overview";
    } catch {
      return "Overview";
    }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Remember the last page separately for each merchant workspace.
  useEffect(() => {
    if (!tenantId || !validPages.includes(activePage)) return;

    try {
      window.localStorage.setItem(pageStorageKey, activePage);
    } catch {
      // The dashboard remains usable when browser storage is unavailable.
    }
  }, [activePage, pageStorageKey, tenantId]);

  const [overviewStats, setOverviewStats] = useState({
    orders: 0,
    products: 0,
    whatsappConnected: false
  });

  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadOverviewStats() {
      setStatsLoading(true);

      const [
        ordersResult,
        productsResult,
        whatsappResult
      ] = await Promise.all([
        supabase
          .from("tenant_orders")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId),

        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId),

        supabase.functions.invoke(
          "xtop-dashboard?action=whatsapp-status",
          { body: {} }
        )
      ]);

      if (cancelled) return;

      setOverviewStats({
        orders: ordersResult.error ? 0 : ordersResult.count || 0,
        products: productsResult.error ? 0 : productsResult.count || 0,
        // WhatsApp account rows are intentionally protected by service-role-only
        // RLS. Read connection status through the authenticated dashboard
        // endpoint, just like the Settings page does.
        whatsappConnected:
          !whatsappResult.error &&
          whatsappResult.data?.connected === true
      });

      setStatsLoading(false);
    }

    loadOverviewStats();

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <img
            className="brand-logo"
            src={LOGO_URL}
            alt="Sabi by XTOP"
          />

          <div>
            <strong>Sabi</strong>
            <span>by XTOP</span>
          </div>

          <button
            className="mobile-close"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <div className="workspace-label">MERCHANT WORKSPACE</div>

        <nav>
          {navigation.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={`nav-item ${
                activePage === label ? "active" : ""
              }`}
              onClick={() => {
                setActivePage(label);
                setMobileMenuOpen(false);
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
          <a className="nav-item" href="https://discover.sabibyxtop.com.ng" target="_blank" rel="noopener noreferrer" onClick={() => setMobileMenuOpen(false)} style={{ textDecoration: "none" }}>
            <Store size={19} />
            <span>Sabi Discover</span>
            <span style={{ marginLeft: "auto", fontSize: 11 }}>↗</span>
          </a>
        </nav>

        <div className="sidebar-bottom">
          <div className="plan-card">
            <span>YOUR BUSINESS</span>
            <strong>Merchant workspace</strong>
            <small>Manage your WhatsApp store</small>
          </div>

          <div className="sidebar-footer">
            XTOP Retail Technologies
          </div>
        </div>
      </aside>

      {mobileMenuOpen && (
        <button
          className="mobile-overlay"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <main className="main-area">
        <header className="topbar">
          <button
            className="menu-toggle"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>

          <div className="breadcrumb">
            <span>Workspace</span>
            <span>/</span>
            <strong>{activePage}</strong>
          </div>

          <div className="topbar-right">
            <span className="connection-status">
              <span className="status-dot" />
              Account connected
            </span>

            <div className="avatar">
              {email.charAt(0).toUpperCase() || "S"}
            </div>

            <button
              className="logout-button"
              onClick={onLogout}
              title="Log out"
              aria-label="Log out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <section className="page-content">
          <div className="welcome-section">
            <div>
              <p className="eyebrow">SABI MERCHANT CENTRE</p>
              <h1>{activePage}</h1>
              <p className="welcome-description">
                Manage your business and WhatsApp commerce from one place.
              </p>
              <a href="https://discover.sabibyxtop.com.ng" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 9, marginTop: 14, padding: "11px 16px", borderRadius: 10, background: "#145c3b", color: "#ffffff", fontWeight: 700, textDecoration: "none" }}>
                <Store size={18} /> Visit Sabi Discover <span aria-hidden="true">↗</span>
              </a>
            </div>

            <img
              className="welcome-logo"
              src={LOGO_URL}
              alt="Sabi by XTOP"
            />
          </div>

          {activePage === "Products" ? (
            <Products tenantId={tenantId} />
          ) : activePage === "Orders" ? (
            <Orders tenantId={tenantId} />
          ) : activePage === "Settings" ? (
            <SettingsPage tenantId={tenantId} />
          ) : activePage === "Customer Service" ? (
            <Inbox />
          ) : activePage === "Analytics" ? (
            <Analytics />
          ) : activePage === "Newsletter" ? (
            <Newsletter tenantId={tenantId} />
          ) : activePage === "Overview" ? (
            <>
              <div className="stats-grid">
                <div className="stat-card">
                  <span>Total orders</span>
                  <strong>
                    {statsLoading ? "…" : overviewStats.orders}
                  </strong>
                  <small>Orders received</small>
                </div>

                <div className="stat-card">
                  <span>Products</span>
                  <strong>
                    {statsLoading ? "…" : overviewStats.products}
                  </strong>
                  <small>Products listed</small>
                </div>

                <div className="stat-card">
                  <span>WhatsApp status</span>
                  <strong className="status-text">
                    {statsLoading
                      ? "Checking..."
                      : overviewStats.whatsappConnected
                        ? "Connected"
                        : "Not connected"}
                  </strong>
                  <small>
                    {overviewStats.whatsappConnected
                      ? "Business number connected"
                      : "Connect your business number"}
                  </small>
                </div>
              </div>

              <div className="content-grid">
                <div className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Get started with Sabi</h2>
                      <p>Set up your merchant workspace.</p>
                    </div>
                  </div>

                  <div className="setup-list">
                    <div className="setup-item">
                      <span className="setup-number">1</span>
                      <div>
                        <strong>Connect WhatsApp</strong>
                        <p>Link your business WhatsApp number.</p>
                      </div>
                      <span className="setup-state">{overviewStats.whatsappConnected ? "Connected" : "Pending"}</span>
                    </div>

                    <div className="setup-item">
                      <span className="setup-number">2</span>
                      <div>
                        <strong>Add your products</strong>
                        <p>Build your WhatsApp product catalogue.</p>
                      </div>
                      <span className="setup-state">{overviewStats.products > 0 ? "Started" : "Pending"}</span>
                    </div>

                    <div className="setup-item">
                      <span className="setup-number">3</span>
                      <div>
                        <strong>Receive your first order</strong>
                        <p>Manage customer orders in one place.</p>
                      </div>
                      <span className="setup-state">{overviewStats.orders > 0 ? "Received" : "Pending"}</span>
                    </div>
                  </div>
                </div>

                <div className="panel quick-panel">
                  <h2>Quick actions</h2>
                  <p>Common merchant tasks.</p>

                  <button onClick={() => setActivePage("Products")}>
                    <Package size={18} />
                    Add a product
                  </button>

                  <button onClick={() => setActivePage("Orders")}>
                    <ShoppingCart size={18} />
                    View orders
                  </button>
                  <a href="https://discover.sabibyxtop.com.ng" target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", boxSizing: "border-box", padding: "12px 14px", marginTop: 8, borderRadius: 10, background: "#e8f4ee", color: "#145c3b", fontWeight: 700, textDecoration: "none" }}>
                    <Store size={18} /> Open Sabi Discover <span style={{ marginLeft: "auto" }}>↗</span>
                  </a>
                </div>
              </div>
            </>
          ) : (
            <div className="panel placeholder-panel">
              <div className="placeholder-icon">
                {activePage === "Customer Service" && <MessageSquare size={28} />}
                {activePage === "Analytics" && <BarChart3 size={28} />}
              </div>

              <h2>{activePage}</h2>

              <p>
                This section is part of the Sabi merchant dashboard build.
                We will connect it to your Supabase backend.
              </p>

              <span className="coming-soon">Under development</span>
            </div>
          )}
        </section>
      </main>
      <SupportChat tenantId={tenantId} />
    </div>
  );
}


function SupportChat({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ id?: string; sender_role: string; content: string; created_at?: string }>>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadHistory() {
    setLoading(true);
    setError("");
    const { data, error: invokeError } = await supabase.functions.invoke("sabi-support", {
      body: { action: "history", tenant_id: tenantId }
    });
    if (invokeError || !data?.success) {
      setError(data?.error || invokeError?.message || "Unable to open Sabi Support.");
    } else {
      setMessages(data.messages || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (open && tenantId) loadHistory();
  }, [open, tenantId]);

  async function sendMessage() {
    const message = draft.trim();
    if (!message || loading) return;
    setDraft("");
    setLoading(true);
    setError("");
    setMessages((current) => [...current, { sender_role: "merchant", content: message }]);
    const { data, error: invokeError } = await supabase.functions.invoke("sabi-support", {
      body: { action: "send", tenant_id: tenantId, message }
    });
    if (invokeError || !data?.success) {
      setError(data?.error || invokeError?.message || "Message could not be sent.");
    } else if (data.reply) {
      setMessages((current) => [...current, data.reply]);
    }
    setLoading(false);
  }

  return (
    <>
      {open && (
        <section style={{ position: "fixed", zIndex: 10000, right: 18, bottom: 88, width: "min(370px, calc(100vw - 28px))", height: "min(540px, calc(100vh - 120px))", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 18, boxShadow: "0 18px 55px rgba(15,23,42,.22)", display: "flex", flexDirection: "column", overflow: "hidden", color: "#172033" }} aria-label="Sabi Help and Support">
          <header style={{ padding: "14px 16px", background: "#123d32", color: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 36, height: 36, borderRadius: 12, background: "rgba(255,255,255,.15)", display: "grid", placeItems: "center" }}><Bot size={21} /></span>
            <div style={{ flex: 1 }}>
              <strong style={{ display: "block", fontSize: 14 }}>Sabi Help &amp; Support</strong>
              <small style={{ opacity: .82 }}>AI assistant · Platform support</small>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close support" style={{ border: 0, background: "transparent", color: "#fff", padding: 6 }}><X size={20} /></button>
          </header>
          <div style={{ padding: 14, background: "#f8fafc", flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ alignSelf: "flex-start", maxWidth: "92%", background: "#fff", border: "1px solid #e5e7eb", borderRadius: "4px 14px 14px 14px", padding: "10px 12px", fontSize: 13, lineHeight: 1.5 }}>
              Hello! I’m Sabi Support. Ask me about your merchant dashboard, products, orders, WhatsApp setup or payments. I’ll use your workspace information where available.
            </div>
            {messages.map((item, index) => (
              <div key={item.id || index} style={{ alignSelf: item.sender_role === "merchant" ? "flex-end" : "flex-start", maxWidth: "92%", background: item.sender_role === "merchant" ? "#dff4e9" : "#fff", border: "1px solid #e5e7eb", borderRadius: item.sender_role === "merchant" ? "14px 4px 14px 14px" : "4px 14px 14px 14px", padding: "10px 12px", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {item.content.replace(/\\s+(?=\\d+\\.\\s)/g, "\
").split("\
").map((line, lineIndex, allLines) => (
                  <span key={lineIndex}>
                    {line}
                    {lineIndex < allLines.length - 1 && <br />}
                  </span>
                ))}
              </div>
            ))}
            {loading && <small style={{ color: "#64748b" }}>Sabi Support is working…</small>}
            {error && <div role="alert" style={{ color: "#b42318", fontSize: 12 }}>{error}</div>}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); sendMessage(); }} style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #e5e7eb", background: "#fff" }}>
            <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Type your message…" maxLength={3000} aria-label="Message Sabi Support" style={{ minWidth: 0, flex: 1, border: "1px solid #d1d5db", borderRadius: 12, padding: "11px 12px", fontSize: 13, outline: "none" }} />
            <button type="submit" disabled={!draft.trim() || loading} aria-label="Send message" style={{ width: 42, border: 0, borderRadius: 12, background: "#123d32", color: "#fff", display: "grid", placeItems: "center", opacity: !draft.trim() || loading ? .5 : 1 }}><Send size={17} /></button>
          </form>
        </section>
      )}
      <button onClick={() => setOpen((value) => !value)} aria-label="Open Sabi Help and Support" title="Sabi Help & Support" style={{ position: "fixed", zIndex: 10001, right: 20, bottom: 20, width: 58, height: 58, borderRadius: 50, border: 0, background: "#123d32", color: "#fff", boxShadow: "0 8px 24px rgba(15,23,42,.25)", display: "grid", placeItems: "center", cursor: "pointer" }}>
        {open ? <X size={24} /> : <Headset size={25} />}
      </button>
    </>
  );
}
