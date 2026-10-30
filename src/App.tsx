
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  MessageSquare,
  Wallet,
  BarChart3,
  Settings,
  Menu,
  X,
  LogOut
} from "lucide-react";

import Auth from "./Auth";
import Products from "./Products";
import { supabase } from "./lib/supabase";

const navigation = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Products", icon: Package },
  { label: "Orders", icon: ShoppingCart },
  { label: "Inbox", icon: MessageSquare },
  { label: "Wallet", icon: Wallet },
  { label: "Analytics", icon: BarChart3 },
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

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;

      if (error) {
        setRegistrationError(error.message);
      }

      setSession(data.session);
      setCheckingSession(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;

      setSession(newSession);
      setTenantId("");
      setRegistrationError("");
      setRegistering(false);
      registeredUser.current = "";
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
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

      const { data, error } = await supabase.functions.invoke(
        "merchant-register"
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
  }, [session?.user?.id, registrationRetry]);

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

  if (!session) {
    return <Auth onAuthenticated={refreshSession} />;
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
          <p>Setting up your merchant account and wallet.</p>
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

          <button
            className="forgot-password"
            onClick={logout}
          >
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
  const [activePage, setActivePage] = useState("Overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
            </div>

            <img
              className="welcome-logo"
              src={LOGO_URL}
              alt="Sabi by XTOP"
            />
          </div>

          {activePage === "Products" ? (
            <Products tenantId={tenantId} />
          ) : activePage === "Overview" ? (
            <>
              <div className="stats-grid">
                <div className="stat-card">
                  <span>Total orders</span>
                  <strong>0</strong>
                  <small>Orders received</small>
                </div>

                <div className="stat-card">
                  <span>Products</span>
                  <strong>0</strong>
                  <small>Products listed</small>
                </div>

                <div className="stat-card">
                  <span>Wallet balance</span>
                  <strong>₦0.00</strong>
                  <small>Available balance</small>
                </div>

                <div className="stat-card">
                  <span>WhatsApp status</span>
                  <strong className="status-text">Not connected</strong>
                  <small>Connect your business number</small>
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
                      <span className="setup-state">Pending</span>
                    </div>

                    <div className="setup-item">
                      <span className="setup-number">2</span>
                      <div>
                        <strong>Add your products</strong>
                        <p>Build your WhatsApp product catalogue.</p>
                      </div>
                      <span className="setup-state">Pending</span>
                    </div>

                    <div className="setup-item">
                      <span className="setup-number">3</span>
                      <div>
                        <strong>Receive your first order</strong>
                        <p>Manage customer orders in one place.</p>
                      </div>
                      <span className="setup-state">Pending</span>
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

                  <button onClick={() => setActivePage("Wallet")}>
                    <Wallet size={18} />
                    Fund wallet
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="panel placeholder-panel">
              <div className="placeholder-icon">
                {activePage === "Orders" && <ShoppingCart size={28} />}
                {activePage === "Inbox" && <MessageSquare size={28} />}
                {activePage === "Wallet" && <Wallet size={28} />}
                {activePage === "Analytics" && <BarChart3 size={28} />}
                {activePage === "Settings" && <Settings size={28} />}
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
    </div>
  );
}
