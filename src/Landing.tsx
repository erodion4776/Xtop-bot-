import { useState } from "react";
import {
  ArrowRight,
  MessageCircle,
  ShoppingBag,
  CreditCard,
  BarChart3,
  Store,
  CheckCircle2,
  Play,
  Zap,
  Menu,
  X
} from "lucide-react";
import "./Landing.css";

const LOGO_URL =
  "https://i.ibb.co/N2b6rJnY/Untitled-design-20261030-044935-0000.png";
// Place the homepage demo video at public/videos/sabi-homepage-demo-web.mp4.
const DEMO_VIDEO_URL = "/videos/sabi-homepage-demo-web.mp4";
const DEMO_POSTER_URL = "/images/sabi-homepage-demo-poster.svg";
const SABI_WHATSAPP_NUMBER = "2348024988555";
const WHATSAPP_DEMO_URL = `https://wa.me/${SABI_WHATSAPP_NUMBER}?text=DEMO`;
const DASHBOARD_SIGNUP_URL = "/?signup=1";

function getVideoEmbed(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return `https://www.youtube-nocookie.com/embed/${parsed.pathname.slice(1)}`;
    }
    if (parsed.hostname.includes("youtube.com")) {
      const id = parsed.searchParams.get("v");
      if (id) return `https://www.youtube-nocookie.com/embed/${id}`;
      if (parsed.pathname.startsWith("/embed/")) return url;
    }
    if (parsed.hostname.includes("vimeo.com")) {
      const id = parsed.pathname.split("/").filter(Boolean).pop();
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
  } catch {
    return "";
  }
  return "";
}

const benefits = [
  { icon: MessageCircle, title: "WhatsApp-first customer service", body: "Let customers browse products, ask questions and place orders through a guided business conversation." },
  { icon: ShoppingBag, title: "A product catalogue customers can browse", body: "Show clear product photos, prices and availability, and share product links from WhatsApp or social media." },
  { icon: CreditCard, title: "Payments and orders in one workspace", body: "Accept supported online payments, review order records and offer pay-on-delivery when your business has enabled it." },
  { icon: BarChart3, title: "A dashboard that keeps you organised", body: "Manage products, follow customer orders and keep important business details easier to find."
  }
];

const steps = [
  ["01", "Create your merchant account", "Set up your Sabi dashboard and business details. There is no monthly Sabi subscription."],
  ["02", "Add your products", "Upload product names, photos, prices and stock. You can prepare your shop before WhatsApp is connected."],
  ["03", "Connect your business WhatsApp", "Connect an eligible dedicated business number through Meta. Approval and connection time depend on Meta and number eligibility; we do not promise instant activation."]
];

const faqs = [
  ["What does Sabi charge per transaction?", "There is no monthly Sabi subscription. For supported Paystack checkout, Sabi's sales commission is calculated on the product subtotal, not the delivery fee: below ₦1,000 = ₦20; ₦1,000–₦2,500 = ₦70; above ₦2,500–₦10,000 = ₦130; above ₦10,000 = ₦250. A ₦50 Sabi service fee and the applicable Paystack processing fee are also included where shown in the checkout summary. Delivery is separate. The full amount is displayed before the customer pays."],
  ["Are there any WhatsApp or Meta charges?", "Meta/WhatsApp may apply third-party messaging charges under its current pricing and account rules. Those charges are separate from a Sabi monthly subscription. Any applicable payment-provider charges are shown in the checkout summary."],
  ["Is there a monthly subscription or free trial?", "No. Sabi does not require a monthly subscription or paid trial. Transaction and third-party service charges may still apply as explained above."],
  ["Why does Sabi ask for a dedicated business WhatsApp number?", "Sabi connects to the WhatsApp Business Platform to automate shop conversations. Use a business number you control and are authorised to connect. Keep your personal WhatsApp separate. Meta must approve the connection, and timing can vary; we cannot guarantee approval within a fixed number of minutes."],
  ["Can I prepare my shop before connecting WhatsApp?", "Yes. Create your merchant account and add products first. You can connect an eligible business WhatsApp number later from Settings."],
  ["Do customers need to download an app?", "No extra shopping app is required for the WhatsApp shopping conversation. Customers can chat with your business and follow the product or payment links provided in the order flow."],
  ["Can customers pay on delivery?", "Pay-on-delivery can be offered when the merchant has enabled the option and configured delivery settings. Availability depends on the merchant's setup."],
  ["Does Sabi support bank transfers?", "Sabi's supported checkout and payment methods are shown to the customer at the time of order. Do not treat a transfer screenshot as confirmation; rely on the verified payment status recorded by Sabi."],
  ["Can I promote products on Facebook?", "Yes. The merchant Products area includes Facebook sharing and copy-ready advert captions for active products, alongside WhatsApp sharing."]
];

export default function Landing() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const videoEmbed = DEMO_VIDEO_URL ? getVideoEmbed(DEMO_VIDEO_URL) : "";
  const isMp4 = !!DEMO_VIDEO_URL && /\.mp4($|\?)/i.test(DEMO_VIDEO_URL);

  return (
    <main className="sabi-landing">
      <header className="lp-nav">
        <a className="lp-brand" href="/" aria-label="Sabi by XTOP home">
          <img src={LOGO_URL} alt="" />
          <span>Sabi <small>by XTOP</small></span>
        </a>
        <nav className={mobileMenuOpen ? "lp-nav-menu lp-nav-menu-open" : "lp-nav-menu"} aria-label="Main navigation">
          <a href="https://discover.sabibyxtop.com.ng" onClick={() => setMobileMenuOpen(false)}>Shop on Discover</a>
          <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)}>How it works</a>
          <a href="#features" onClick={() => setMobileMenuOpen(false)}>Why Sabi</a>
          <a href="#demo" onClick={() => setMobileMenuOpen(false)}>See the demo</a>
          <a href="#faq" onClick={() => setMobileMenuOpen(false)}>FAQs</a>
        </nav>
        <div className="lp-nav-actions">
          <a className="lp-nav-cta" href={DASHBOARD_SIGNUP_URL}>Register <ArrowRight size={15} /></a>
          <a className="lp-nav-login" href="/app">Login</a>
          <button className="lp-nav-toggle" type="button" aria-label={mobileMenuOpen ? "Close menu" : "Open menu"} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(value => !value)}>
            {mobileMenuOpen ? <X size={21}/> : <Menu size={21}/>}
          </button>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-copy">
          <div className="lp-kicker"><span /> MADE FOR THE WAY AFRICA DOES BUSINESS</div>
          <h1>Your customers are on WhatsApp. <em>Your business should be ready.</em></h1>
          <p className="lp-hero-lead">
            You work hard to find customers. You post on Facebook, reply to messages,
            send prices, confirm orders and chase delivery details. Sabi by XTOP helps
            bring those moving parts into one simple WhatsApp-powered shop. Sabi connects to an eligible dedicated business WhatsApp number through Meta; your personal WhatsApp stays separate. Connection approval depends on Meta and may take time.
          </p>
          <div className="lp-hero-actions">
            <a className="lp-button lp-button-primary" href={DASHBOARD_SIGNUP_URL}>Register your business <ArrowRight size={18} /></a>
            <a className="lp-button lp-button-whatsapp" href={WHATSAPP_DEMO_URL} target="_blank" rel="noreferrer"><MessageCircle size={17} /> Try Sabi on WhatsApp</a>
          </div>
          <div className="lp-reassurance">
            <span><CheckCircle2 size={16} /> No monthly Sabi subscription</span>
            <span><CheckCircle2 size={16} /> Your shop, your customers</span>
          </div>
        </div>

        <div className="lp-hero-art" aria-label="Illustration of a customer shopping with a WhatsApp business store">
          <div className="lp-glow" />
          <div className="lp-chat-card lp-chat-back">
            <div className="lp-chat-top"><span className="lp-chat-avatar">S</span><div><b>Sabi Store</b><small>Business shopping</small></div><span className="lp-online">●</span></div>
            <div className="lp-chat-bubble">Good afternoon 👋 Welcome! What are you looking for today?</div>
            <div className="lp-chat-bubble lp-chat-in">I want to see your products.</div>
            <div className="lp-product-mini"><div className="lp-product-photo">🛍️</div><div><b>New arrivals</b><small>Browse products and prices</small></div></div>
            <div className="lp-chat-input">Message Sabi Store… <span>➤</span></div>
          </div>
          <div className="lp-hero-note"><Zap size={15} /> Less repetitive typing. More time for your business.</div>
        </div>
      </section>

      <section className="lp-section lp-pain-section">
        <div className="lp-section-heading">
          <span className="lp-eyebrow">WE UNDERSTAND THE DAILY HUSTLE</span>
          <h2>You didn't start your business to spend all day typing the same answers.</h2>
          <p>Repeated price and availability questions, scattered order details and missed enquiries make it harder to serve customers. Sabi brings the product catalogue, guided WhatsApp conversations and order records closer together.</p>
        </div>
        <div className="lp-pain-grid">
          <article><span>01</span><h3>Messages pile up</h3><p>Customers want quick answers, but you cannot be online every minute of the day.</p></article>
          <article><span>02</span><h3>Orders get scattered</h3><p>A name in one chat, an address in another, a payment screenshot somewhere below. It is easy to miss a detail.</p></article>
          <article><span>03</span><h3>Good products go unseen</h3><p>You post and promote, but customers still need a simple way to see the item, understand the price and order.</p></article>
        </div>
        <p className="lp-empathy-line">Your hustle deserves a better system. Not another complicated tool that gives you more work.</p>
      </section>

      <section className="lp-section lp-feature-section" id="features">
        <div className="lp-section-heading lp-center">
          <span className="lp-eyebrow">MEET SABI BY XTOP</span>
          <h2>A more organised way to sell, serve and grow.</h2>
          <p>One WhatsApp-first shop, supported by a practical merchant dashboard.</p>
        </div>
        <div className="lp-feature-grid">
          {benefits.map(({ icon: Icon, title, body }) => (
            <article className="lp-feature-card" key={title}>
              <span className="lp-feature-icon"><Icon size={22} /></span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-trust-strip" aria-label="How Sabi protects the shopping process">
        <div><CheckCircle2 size={20}/><span><strong>Payment status checks</strong><small>Paystack confirmation is checked before an online payment is treated as successful.</small></span></div>
        <div><MessageCircle size={20}/><span><strong>WhatsApp Business Platform</strong><small>Connect an eligible business number through Meta's supported connection flow.</small></span></div>
        <div><Store size={20}/><span><strong>Clear merchant records</strong><small>Keep products, order details and payment references easier to review.</small></span></div>
      </section>

      <section className="lp-demo-section" id="demo">
        <div className="lp-demo-copy">
          <span className="lp-eyebrow">DON'T JUST TAKE OUR WORD FOR IT</span>
          <h2>See the customer journey, from “Hello” to order.</h2>
          <p>See how a customer can browse products, place an order and continue the conversation with your business.</p>
          <ul>
            <li><CheckCircle2 size={17} /> A welcoming WhatsApp store conversation</li>
            <li><CheckCircle2 size={17} /> Product browsing and guided ordering</li>
            <li><CheckCircle2 size={17} /> Payment options configured by the merchant</li>
          </ul>
        </div>
        <div className="lp-video-frame">
          {isMp4 ? (
            <video controls playsInline preload="metadata" poster={DEMO_POSTER_URL} src={DEMO_VIDEO_URL} />
          ) : videoEmbed ? (
            <iframe src={videoEmbed} title="Sabi by XTOP product demo" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
          ) : (
            <div className="lp-video-placeholder">
              <div className="lp-video-screen">
                <span className="lp-video-play"><Play size={25} fill="currentColor" /></span>
                <b>Sabi in action</b>
                <small>Customer browsing · Cart · Checkout · Order tracking</small>
              </div>
              <p>The video walkthrough will appear here.</p>
              <span className="lp-video-caption">A real product demonstration — not stock footage.</span>
            </div>
          )}
        </div>
      </section>

      <section className="lp-section lp-steps-section" id="how-it-works">
        <div className="lp-section-heading lp-center">
          <span className="lp-eyebrow">GETTING STARTED</span>
          <h2>Start free. Connect your number. Start selling.</h2>
          <p>Create your dashboard, list your products, then connect an eligible dedicated business WhatsApp number through Meta. Connection approval times vary.</p>
        </div>
        <div className="lp-steps-grid">
          {steps.map(([number, title, body]) => (
            <article key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></article>
          ))}
        </div>
      </section>

      <section className="lp-section lp-faq-section" id="faq">
        <div className="lp-section-heading lp-center"><span className="lp-eyebrow">GOOD QUESTIONS</span><h2>Before you bring your business to Sabi.</h2></div>
        <div className="lp-faq-list">
          {faqs.map(([question, answer]) => <details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}
        </div>
      </section>

      <section className="lp-final-cta">
        <div className="lp-final-icon"><Store size={27} /></div>
        <span className="lp-eyebrow">SABI BY XTOP · WHATSAPP COMMERCE FOR MERCHANTS</span>
        <h2>Give your customers a simpler way to shop with your business.</h2>
        <p>Create your merchant workspace and see how Sabi can organise product discovery, WhatsApp enquiries and customer orders.</p>
        <div className="lp-final-actions"><a className="lp-button lp-button-light" href={DASHBOARD_SIGNUP_URL}>Register your business <ArrowRight size={18} /></a><a className="lp-final-login" href="/app">Already registered? Merchant login</a></div>
        <small>Sabi by XTOP · A product of XTOP Retail Technologies</small>
      </section>

      <footer className="lp-footer">
        <a className="lp-brand" href="/"><img src={LOGO_URL} alt="" /><span>Sabi <small>by XTOP</small></span></a>
        <p>Helping businesses turn conversations into better customer experiences.</p>
        <div><a href="https://discover.sabibyxtop.com.ng">Sabi Discover</a><a href="#features">Why Sabi</a><a href="#demo">Demo</a><a href="#faq">FAQs</a><a href="/app">Merchant login</a><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a><a href="/data-deletion">Data deletion</a><a href="/cookies">Cookie Policy</a><a href="https://wa.me/2348024988555?text=SUPPORT" target="_blank" rel="noreferrer">Contact support</a></div>
        <small>© {new Date().getFullYear()} XTOP Retail Technologies. All rights reserved.</small>
      </footer>
    </main>
  );
}
