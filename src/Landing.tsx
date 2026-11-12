import {
  ArrowRight,
  MessageCircle,
  ShoppingBag,
  Smartphone,
  CreditCard,
  Truck,
  BarChart3,
  Store,
  Facebook,
  CheckCircle2,
  Play,
  Zap,
  HeartHandshake,
  MapPin,
  PackageCheck
} from "lucide-react";
import "./Landing.css";

const LOGO_URL =
  "https://i.ibb.co/N2b6rJnY/Untitled-design-20261030-044935-0000.png";
// Place the homepage demo video at public/videos/sabi-homepage-demo-web.mp4.
const DEMO_VIDEO_URL = "/videos/sabi-homepage-demo-web.mp4";
const SABI_WHATSAPP_NUMBER = "2348024988555";
const WHATSAPP_DEMO_URL = `https://wa.me/${SABI_WHATSAPP_NUMBER}?text=DEMO`;
const WHATSAPP_REGISTER_URL = `https://wa.me/${SABI_WHATSAPP_NUMBER}?text=REGISTER%20MY%20BUSINESS`;

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
  {
    icon: MessageCircle,
    title: "Sell where your customers already are",
    body: "Your customers are already chatting on WhatsApp. Sabi helps turn those everyday conversations into product discovery, orders and customer support."
  },
  {
    icon: ShoppingBag,
    title: "Your shop is open beyond shop hours",
    body: "Show products, prices and details even when you are busy, on the road, attending to customers or taking a well-deserved rest."
  },
  {
    icon: CreditCard,
    title: "Make payment and order handling clearer",
    body: "Give customers a guided way to place orders and pay online or choose pay-on-delivery where your business has enabled it."
  },
  {
    icon: Truck,
    title: "Keep delivery details in one flow",
    body: "Collect customer contact and delivery information with the order, so fewer important details get lost inside long chats."
  },
  {
    icon: Facebook,
    title: "Turn social attention into real enquiries",
    body: "Share product links and Facebook-ready captions. Let people discover an item on social media and continue to your Sabi product page or WhatsApp."
  },
  {
    icon: BarChart3,
    title: "See the business, not just the messages",
    body: "Manage products and orders from a merchant dashboard, with a clearer view of what is listed and what customers have ordered."
  }
];

const steps = [
  ["01", "Connect your number — free to start", "Get started without a monthly Sabi subscription. Use a dedicated business number for automation and keep your personal WhatsApp separate."],
  ["02", "Add the products you sell", "Upload product details, prices, categories and pictures so customers can browse what is available."],
  ["03", "Share your shop and start serving", "Share product links, receive customer orders and manage the work from your dashboard."]
];

const faqs = [
  ["Is it free to start using Sabi?", "Yes. You can get started with Sabi at no monthly Sabi subscription cost. Connect your dedicated business WhatsApp number, add your products and start selling. Any charges set by WhatsApp/Meta or payment providers are separate third-party charges, not a Sabi monthly subscription."],
  ["Do I pay a monthly subscription to Sabi?", "No. Sabi does not require a monthly subscription or paid trial. Connect your dedicated business WhatsApp number, set up your products and begin serving customers."],
  ["Is Sabi only for big businesses?", "No. Sabi is designed for the everyday business owner too: a fashion seller, food vendor, beauty store, phone dealer, home business, distributor or growing retail shop."],
  ["Do my customers need to download an app?", "No extra shopping app is required for the WhatsApp shopping conversation. Customers can chat with your business on WhatsApp and follow the product or payment links provided in the order flow."],
  ["Can I use my personal WhatsApp number?", "Sabi automation is intended for a dedicated business WhatsApp number. Your personal WhatsApp can remain personal and separate."],
  ["Can customers pay on delivery?", "Pay-on-delivery can be offered when the merchant has enabled the option and configured delivery settings. Availability depends on the merchant's setup."],
  ["Does Sabi replace me or my staff?", "No. Sabi helps with repeatable tasks such as showing products, guiding orders and collecting details. You remain in charge of your business and can handle customers who need a human conversation."],
  ["Can I promote products on Facebook?", "Yes. The merchant Products area includes Facebook sharing and copy-ready advert captions for active products, alongside WhatsApp sharing."]
];

export default function Landing() {
  const videoEmbed = DEMO_VIDEO_URL ? getVideoEmbed(DEMO_VIDEO_URL) : "";
  const isMp4 = !!DEMO_VIDEO_URL && /\.mp4($|\?)/i.test(DEMO_VIDEO_URL);

  return (
    <main className="sabi-landing">
      <header className="lp-nav">
        <a className="lp-brand" href="/" aria-label="Sabi by XTOP home">
          <img src={LOGO_URL} alt="" />
          <span>Sabi <small>by XTOP</small></span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#features">Why Sabi</a>
          <a href="#demo">See the demo</a>
          <a href="#faq">FAQs</a>
        </nav>
        <div className="lp-nav-actions"><a className="lp-nav-demo" href={WHATSAPP_DEMO_URL} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Try Sabi</a><a className="lp-nav-cta" href={WHATSAPP_REGISTER_URL} target="_blank" rel="noreferrer">Register your business <ArrowRight size={16} /></a><a className="lp-nav-login" href="/app">Login</a></div>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-copy">
          <div className="lp-kicker"><span /> MADE FOR THE WAY AFRICA DOES BUSINESS</div>
          <div className="lp-free-start"><strong>₦0 MONTHLY SABI SUBSCRIPTION</strong><span>Start free — connect your business WhatsApp number, add your products and start selling.</span></div>
          <h1>Your customers are on WhatsApp. <em>Your business should be ready.</em></h1>
          <p className="lp-hero-lead">
            You work hard to find customers. You post on Facebook, reply to messages,
            send prices, confirm orders and chase delivery details. Sabi by XTOP helps
            bring those moving parts into one simple WhatsApp-powered shop.
          </p>
          <div className="lp-hero-actions">
            <a className="lp-button lp-button-primary" href={WHATSAPP_REGISTER_URL} target="_blank" rel="noreferrer">Register your business <ArrowRight size={18} /></a>
            <a className="lp-button lp-button-whatsapp" href={WHATSAPP_DEMO_URL} target="_blank" rel="noreferrer"><MessageCircle size={17} /> Try Sabi on WhatsApp</a>
            <a className="lp-button lp-button-ghost" href="#demo"><Play size={16} /> Watch the demo video</a>
          </div>
          <div className="lp-reassurance">
            <span><CheckCircle2 size={16} /> Free to get started</span>
            <span><CheckCircle2 size={16} /> No monthly subscription</span>
            <span><CheckCircle2 size={16} /> Connect and start selling</span>
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
          <div className="lp-order-float"><span><PackageCheck size={18} /></span><div><b>New order received</b><small>Order details organised</small></div><CheckCircle2 size={18} /></div>
          <div className="lp-social-float"><Facebook size={17} /><span>Share a product. Start a conversation.</span></div>
          <div className="lp-hero-note"><Zap size={15} /> Less repetitive typing. More time for your business.</div>
        </div>
      </section>

      <section className="lp-truth-strip">
        <p><strong>For the trader.</strong> The home business. The growing shop. The seller with customers in five different WhatsApp groups.</p>
        <span>From Lagos to Benin, Abuja to Port Harcourt — business moves through conversations.</span>
      </section>

      <section className="lp-section lp-pain-section">
        <div className="lp-section-heading">
          <span className="lp-eyebrow">WE UNDERSTAND THE DAILY HUSTLE</span>
          <h2>You didn't start your business to spend all day typing the same answers.</h2>
          <p>“How much?” “Is it available?” “How do I pay?” “Can you deliver to my area?” You answer one person, another message enters. A serious buyer may move on simply because you were busy serving someone else.</p>
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
          <p>Sabi brings a guided WhatsApp shopping experience together with a merchant dashboard — built for real businesses, real customers and the realities of selling in Nigeria and across Africa.</p>
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

      <section className="lp-demo-section" id="demo">
        <div className="lp-demo-copy">
          <span className="lp-eyebrow">DON'T JUST TAKE OUR WORD FOR IT</span>
          <h2>See the customer journey, from “Hello” to order.</h2>
          <p>See how a customer can discover products, browse a store, add items to a cart, share delivery details and follow an order — without needing to learn a complicated new shopping app.</p>
          <ul>
            <li><CheckCircle2 size={17} /> A welcoming WhatsApp store conversation</li>
            <li><CheckCircle2 size={17} /> Product browsing and cart checkout</li>
            <li><CheckCircle2 size={17} /> Online payment or pay-on-delivery where enabled</li>
            <li><CheckCircle2 size={17} /> Order tracking and a path to human assistance</li>
          </ul>
        </div>
        <div className="lp-video-frame">
          {isMp4 ? (
            <video controls playsInline preload="metadata" src={DEMO_VIDEO_URL} />
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
          <p>No monthly Sabi subscription and no paid trial. Connect your dedicated business WhatsApp number, add your products and let customers start shopping with you.</p>
        </div>
        <div className="lp-steps-grid">
          {steps.map(([number, title, body]) => (
            <article key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></article>
          ))}
        </div>
      </section>

      <section className="lp-africa-section">
        <div className="lp-africa-inner">
          <div><span className="lp-eyebrow">BUILT WITH OUR MARKET IN MIND</span><h2>Business here is personal. Your tools should understand that.</h2></div>
          <div className="lp-africa-copy">
            <p>In Nigeria, a customer may discover your product on Facebook, ask for details on WhatsApp, pay by transfer or checkout, and expect delivery updates. Some customers want to speak to a real person before they trust a purchase. That is normal.</p>
            <p>Sabi is designed around that reality: WhatsApp conversations, product pictures and prices, order details, online payment, pay-on-delivery where enabled, and a route to human assistance. It is technology to support your relationship with customers — not erase it.</p>
            <div className="lp-africa-points"><span><Smartphone size={17} /> Mobile-first shopping habits</span><span><MapPin size={17} /> Delivery details matter</span><span><HeartHandshake size={17} /> Trust and human service matter</span></div>
          </div>
        </div>
      </section>

      <section className="lp-section lp-reviews-section" id="reviews">
        <div className="lp-section-heading lp-center">
          <span className="lp-eyebrow">CUSTOMER VOICES</span>
          <h2>Trust is earned. We intend to earn it.</h2>
          <p>We will publish feedback from real Sabi merchants and customers as they use the service. No invented names, no made-up sales figures and no copied testimonials.</p>
        </div>
        <div className="lp-review-honesty">
          <div className="lp-review-mark">“</div>
          <div><h3>Your experience should be the proof.</h3><p>Are you an early merchant using Sabi? We want to hear what made your work easier, what needs improvement and what your customers think. Honest feedback helps us build something that deserves your trust.</p><a href="/app">Open your merchant dashboard <ArrowRight size={16} /></a></div>
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
        <span className="lp-eyebrow">FREE TO GET STARTED · NO MONTHLY SUBSCRIPTION</span>
        <h2>Connect your business number. Put your products on WhatsApp. Start selling.</h2>
        <p>Start with Sabi at no monthly subscription cost. Connect your dedicated WhatsApp number, add your products and give customers a simple way to browse and order. You run your business — Sabi helps organise the conversations.</p>
        <div className="lp-final-actions"><a className="lp-button lp-button-light" href={WHATSAPP_REGISTER_URL} target="_blank" rel="noreferrer">Register your business <ArrowRight size={18} /></a><a className="lp-button lp-button-final-demo" href={WHATSAPP_DEMO_URL} target="_blank" rel="noreferrer"><MessageCircle size={17} /> Try Sabi on WhatsApp</a><a className="lp-final-login" href="/app">Already registered? Merchant login</a></div>
        <small>Sabi by XTOP · A product of XTOP Retail Technologies</small>
      </section>

      <footer className="lp-footer">
        <a className="lp-brand" href="/"><img src={LOGO_URL} alt="" /><span>Sabi <small>by XTOP</small></span></a>
        <p>Helping businesses turn conversations into better customer experiences.</p>
        <div><a href="#features">Why Sabi</a><a href="#demo">Demo</a><a href="#faq">FAQs</a><a href="/app">Merchant login</a></div>
        <small>© {new Date().getFullYear()} XTOP Retail Technologies. All rights reserved.</small>
      </footer>
    </main>
  );
}
