import { useState } from "react";
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
  Store
} from "lucide-react";

const navigation = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Products", icon: Package },
  { label: "Orders", icon: ShoppingCart },
  { label: "Inbox", icon: MessageSquare },
  { label: "Wallet", icon: Wallet },
  { label: "Analytics", icon: BarChart3 },
  { label: "Settings", icon: Settings }
];

export default function App() {
  const [activePage, setActivePage] = useState("Overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-icon"><Store size={22} /></div>
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
              className={`nav-item ${activePage === label ? "active" : ""}`}
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
          <div className="sidebar-footer">XTOP Retail Technologies</div>
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
              Dashboard preview
            </span>
            <div className="avatar">S</div>
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
            <div className="welcome-icon"><Store size={28} /></div>
          </div>

          {activePage === "Overview" ? (
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
                    <Package size={18} /> Add a product
                  </button>
                  <button onClick={() => setActivePage("Orders")}>
                    <ShoppingCart size={18} /> View orders
                  </button>
                  <button onClick={() => setActivePage("Wallet")}>
                    <Wallet size={18} /> Fund wallet
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="panel placeholder-panel">
              <div className="placeholder-icon">
                {activePage === "Products" && <Package size={28} />}
                {activePage === "Orders" && <ShoppingCart size={28} />}
                {activePage === "Inbox" && <MessageSquare size={28} />}
                {activePage === "Wallet" && <Wallet size={28} />}
                {activePage === "Analytics" && <BarChart3 size={28} />}
                {activePage === "Settings" && <Settings size={28} />}
              </div>
              <h2>{activePage}</h2>
              <p>
                This section is part of the Sabi merchant dashboard build.
                We will connect it to your existing Supabase backend.
              </p>
              <span className="coming-soon">Under development</span>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
