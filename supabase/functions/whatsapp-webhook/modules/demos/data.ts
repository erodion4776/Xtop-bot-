// supabase/functions/whatsapp-webhook/modules/demos/data.ts
// All Demo Configurations + Fictional Data

import { DemoConfig } from "./engine.ts";

// ═══════════════════════════════════════════════════════
// FICTIONAL DEMO DATA
// ═══════════════════════════════════════════════════════

const STORE_PRODUCTS = [
  { id: "p1", name: "Wireless Earbuds", price: 8500, category: "Electronics", stock: 24 },
  { id: "p2", name: "Phone Case (iPhone)", price: 2500, category: "Accessories", stock: 150 },
  { id: "p3", name: "USB-C Charger 65W", price: 6000, category: "Electronics", stock: 45 },
  { id: "p4", name: "Laptop Stand", price: 12000, category: "Accessories", stock: 18 },
  { id: "p5", name: "Bluetooth Speaker", price: 15000, category: "Electronics", stock: 30 },
  { id: "p6", name: "Screen Protector", price: 1500, category: "Accessories", stock: 200 },
];

const RESTAURANT_MENU = [
  { id: "f1", name: "Jollof Rice & Chicken", price: 3500, category: "Mains" },
  { id: "f2", name: "Egusi Soup & Pounded Yam", price: 4000, category: "Mains" },
  { id: "f3", name: "Pepper Soup (Goat)", price: 3000, category: "Soups" },
  { id: "f4", name: "Suya Platter", price: 2500, category: "Starters" },
  { id: "f5", name: "Chapman Drink", price: 1500, category: "Drinks" },
  { id: "f6", name: "Meat Pie (3 pcs)", price: 2000, category: "Snacks" },
];

const PROPERTIES = [
  { id: "r1", name: "3BR Duplex, Lekki", price: "₦85M", type: "Sale", location: "Lagos" },
  { id: "r2", name: "2BR Flat, Wuse 2", price: "₦2.5M/yr", type: "Rent", location: "Abuja" },
  { id: "r3", name: "4BR Mansion, GRA", price: "₦150M", type: "Sale", location: "Port Harcourt" },
  { id: "r4", name: "1BR Studio, Ikeja", price: "₦800K/yr", type: "Rent", location: "Lagos" },
];

const AUTO_SERVICES = [
  { id: "a1", name: "Full Car Service", price: "₦25,000 – ₦60,000", duration: "4–6 hours" },
  { id: "a2", name: "Oil Change", price: "₦8,000 – ₦15,000", duration: "30 mins" },
  { id: "a3", name: "Brake Inspection", price: "₦5,000 – ₦12,000", duration: "1 hour" },
  { id: "a4", name: "Engine Diagnostics", price: "₦10,000 – ₦20,000", duration: "1–2 hours" },
  { id: "a5", name: "AC Repair", price: "₦15,000 – ₦40,000", duration: "2–4 hours" },
];

// ═══════════════════════════════════════════════════════
// DEMO CONFIGURATIONS
// ═══════════════════════════════════════════════════════

const DEMO_CONFIGS: DemoConfig[] = [

  // ── SALES & COMMERCE ──
  {
    id: "online_store",
    name: "Online Store",
    icon: "🛒",
    category: "Sales & Commerce",
    description: "Experience a full e-commerce flow: browse products, add to cart, checkout, and receive order confirmation.",
    steps: [
      { id: "ENTRY", type: "message", body: "🛒 *Welcome to NaijaShop Demo Store!*\n\nBrowse our fictional product catalogue and experience a complete shopping flow.", nextStep: "BROWSE" },
      { id: "BROWSE", type: "list", title: "Browse Products", body: "🛍️ *Select a category to browse:*", options: [
        { id: "cat_electronics", label: "📱 Electronics", description: "Earbuds, chargers, speakers" },
        { id: "cat_accessories", label: "🎒 Accessories", description: "Cases, stands, protectors" },
        { id: "cat_all", label: "📦 All Products", description: "View everything" },
      ], captureField: "category", nextStep: "PRODUCT_LIST" },
      { id: "PRODUCT_LIST", type: "list", title: "Products", body: (ctx) => {
        const filtered = ctx.category_id === "cat_all" ? STORE_PRODUCTS : STORE_PRODUCTS.filter((p) => p.category.toLowerCase() === (ctx.category || "").replace(/📱|🎒/g, "").trim().toLowerCase());
        return `📦 *Available Products:*\n\n${(filtered.length > 0 ? filtered : STORE_PRODUCTS).map((p, i) => `${i + 1}. *${p.name}* — ₦${p.price.toLocaleString()}`).join("\n")}`;
      }, options: (ctx) => {
        const filtered = ctx.category_id === "cat_all" ? STORE_PRODUCTS : STORE_PRODUCTS.filter((p) => p.category.toLowerCase() === (ctx.category || "").replace(/📱|🎒/g, "").trim().toLowerCase());
        return (filtered.length > 0 ? filtered : STORE_PRODUCTS).slice(0, 5).map((p) => ({ id: p.id, label: `${p.name}`, description: `₦${p.price.toLocaleString()}` }));
      }, captureField: "product", nextStep: "PRODUCT_DETAIL" },
      { id: "PRODUCT_DETAIL", type: "buttons", body: (ctx) => {
        const p = STORE_PRODUCTS.find((x) => x.id === ctx.product_id) || STORE_PRODUCTS[0];
        return `📋 *${p.name}*\n\n💰 *Price:* ₦${p.price.toLocaleString()}\n📦 *In Stock:* ${p.stock} units\n🏷️ *Category:* ${p.category}\n\n_Add to cart or continue browsing?_`;
      }, options: [
        { id: "add_cart", label: "🛒 Add to Cart" },
        { id: "browse_more", label: "🔙 Browse More" },
        { id: "checkout", label: "💳 Checkout" },
      ], captureField: "action", nextStep: (input) => input === "add_cart" ? "QUANTITY" : input === "checkout" ? "CHECKOUT" : "BROWSE" },
      { id: "QUANTITY", type: "input", body: (ctx) => `🔢 *How many ${ctx.product || "items"} would you like?*\n\n_(Type a number, e.g. 2)_`, captureField: "quantity", validation: (v) => isNaN(parseInt(v)) ? "⚠️ Please enter a valid number." : null, nextStep: "CHECKOUT" },
      { id: "CHECKOUT", type: "input", body: (ctx) => {
        const p = STORE_PRODUCTS.find((x) => x.id === ctx.product_id) || STORE_PRODUCTS[0];
        const qty = parseInt(ctx.quantity) || 1;
        const total = p.price * qty;
        return `🧾 *ORDER SUMMARY*\n\n• ${p.name} × ${qty}\n• *Total: ₦${total.toLocaleString()}*\n\n📍 *Enter your delivery address:*\n_(e.g. 12 Admiralty Way, Lekki, Lagos)_`;
      }, captureField: "address", nextStep: "DELIVERY_METHOD" },
      { id: "DELIVERY_METHOD", type: "buttons", body: "🚚 *Choose delivery method:*", options: [
        { id: "delivery", label: "🚚 Home Delivery (₦2,000)" },
        { id: "pickup", label: "🏪 Store Pickup (Free)" },
      ], captureField: "delivery", nextStep: "PAYMENT" },
      { id: "PAYMENT", type: "buttons", body: "💳 *Select payment method:*\n\n⚠️ _DEMO MODE — No real payment will be processed._", options: [
        { id: "transfer", label: "🏦 Bank Transfer" },
        { id: "card", label: "💳 Card Payment" },
        { id: "ussd", label: "📱 USSD" },
      ], captureField: "payment", nextStep: "CONFIRM" },
      { id: "CONFIRM", type: "confirmation", body: (ctx) => {
        const p = STORE_PRODUCTS.find((x) => x.id === ctx.product_id) || STORE_PRODUCTS[0];
        const qty = parseInt(ctx.quantity) || 1;
        return `✅ *CONFIRM ORDER?*\n\n🛒 ${p.name} × ${qty}\n💰 ₦${(p.price * qty).toLocaleString()}\n📍 ${ctx.address || "N/A"}\n🚚 ${ctx.delivery || "N/A"}\n💳 ${ctx.payment || "N/A"}`;
      }, nextStep: "COMPLETE" },
      { id: "COMPLETE", type: "message", body: (ctx) => `🎉 *ORDER CONFIRMED!*\n\n📋 *Order #:* XTR-${Date.now().toString().slice(-6)}\n📦 *Status:* Processing\n🚚 *Estimated Delivery:* 2–3 business days\n\n_Thank you for shopping at NaijaShop Demo!_\n\n⚠️ _This was a demo. No real order was placed._`, nextStep: "DONE" },
    ],
  },

  {
    id: "restaurant",
    name: "Restaurant Ordering",
    icon: "🍽️",
    category: "Sales & Commerce",
    description: "Experience a restaurant ordering flow: browse menu, add items, choose pickup/delivery, and confirm.",
    steps: [
      { id: "ENTRY", type: "message", body: "🍽️ *Welcome to Mama Put Demo Kitchen!*\n\nBrowse our fictional menu and place a demo order.", nextStep: "MENU" },
      { id: "MENU", type: "list", title: "Our Menu", body: "📋 *Select a category:*", options: [
        { id: "mains", label: "🍛 Main Dishes", description: "Jollof, Egusi, Fried Rice" },
        { id: "soups", label: "🥣 Soups", description: "Pepper Soup, Ogbono" },
        { id: "drinks", label: "🥤 Drinks & Snacks", description: "Chapman, Meat Pie" },
      ], captureField: "foodCategory", nextStep: "SELECT_FOOD" },
      { id: "SELECT_FOOD", type: "list", title: "Select Dish", body: (ctx) => `🍛 *${ctx.foodCategory || "Menu"}:*\n\n${RESTAURANT_MENU.map((f, i) => `${i + 1}. *${f.name}* — ₦${f.price.toLocaleString()}`).join("\n")}`, options: RESTAURANT_MENU.map((f) => ({ id: f.id, label: f.name, description: `₦${f.price.toLocaleString()}` })), captureField: "food", nextStep: "FOOD_QTY" },
      { id: "FOOD_QTY", type: "input", body: (ctx) => `🔢 *How many portions of ${ctx.food || "this dish"}?*\n\n_(Type a number)_`, captureField: "foodQty", validation: (v) => isNaN(parseInt(v)) ? "⚠️ Enter a valid number." : null, nextStep: "FOOD_METHOD" },
      { id: "FOOD_METHOD", type: "buttons", body: "🚗 *Pickup or Delivery?*", options: [
        { id: "pickup", label: "🏪 Pickup" },
        { id: "delivery", label: "🚚 Delivery (₦1,500)" },
      ], captureField: "foodMethod", nextStep: "FOOD_CONFIRM" },
      { id: "FOOD_CONFIRM", type: "confirmation", body: (ctx) => {
        const f = RESTAURANT_MENU.find((x) => x.id === ctx.food_id) || RESTAURANT_MENU[0];
        const qty = parseInt(ctx.foodQty) || 1;
        return `✅ *Confirm Order?*\n\n🍛 ${f.name} × ${qty}\n💰 ₦${(f.price * qty).toLocaleString()}\n🚗 ${ctx.foodMethod || "Pickup"}`;
      }, nextStep: "FOOD_DONE" },
      { id: "FOOD_DONE", type: "message", body: `🎉 *Order Received!*\n\n📋 *Order #:* MP-${Date.now().toString().slice(-5)}\n⏱️ *Estimated Time:* 25–35 minutes\n\n_Your food is being prepared!_\n\n⚠️ _Demo mode — no real order placed._`, nextStep: "DONE" },
    ],
  },

  {
    id: "real_estate",
    name: "Real Estate",
    icon: "🏠",
    category: "Sales & Commerce",
    description: "Browse properties, view details, and book inspections.",
    steps: [
      { id: "ENTRY", type: "message", body: "🏠 *Welcome to Xtop Properties Demo!*\n\nBrowse our fictional property listings.", nextStep: "LISTINGS" },
      { id: "LISTINGS", type: "list", title: "Properties", body: "🏘️ *Available Properties:*\n\n" + PROPERTIES.map((p, i) => `${i + 1}. *${p.name}*\n   ${p.type} • ${p.price} • ${p.location}`).join("\n\n"), options: PROPERTIES.map((p) => ({ id: p.id, label: p.name, description: `${p.price} • ${p.location}` })), captureField: "property", nextStep: "PROPERTY_DETAIL" },
      { id: "PROPERTY_DETAIL", type: "buttons", body: (ctx) => {
        const p = PROPERTIES.find((x) => x.id === ctx.property_id) || PROPERTIES[0];
        return `🏠 *${p.name}*\n\n📍 *Location:* ${p.location}\n💰 *Price:* ${p.price}\n📋 *Type:* ${p.type}\n🛏️ *Bedrooms:* 3\n🚗 *Parking:* Yes\n🔒 *Security:* 24/7\n\n_What would you like to do?_`;
      }, options: [
        { id: "inspect", label: "📅 Book Inspection" },
        { id: "info", label: "ℹ️ More Info" },
        { id: "back", label: "🔙 All Properties" },
      ], captureField: "propertyAction", nextStep: (input) => input === "inspect" ? "INSPECT_BOOK" : input === "back" ? "LISTINGS" : "PROPERTY_DETAIL" },
      { id: "INSPECT_BOOK", type: "input", body: "📅 *Enter your preferred inspection date:*\n\n_(e.g. Monday 2pm)_", captureField: "inspectDate", nextStep: "INSPECT_CONFIRM" },
      { id: "INSPECT_CONFIRM", type: "confirmation", body: (ctx) => `✅ *Confirm Inspection?*\n\n🏠 ${ctx.property || "Property"}\n📅 ${ctx.inspectDate || "TBD"}\n\n_An agent will confirm your slot._`, nextStep: "INSPECT_DONE" },
      { id: "INSPECT_DONE", type: "message", body: `✅ *Inspection Booked!*\n\n📋 *Ref:* XPR-${Date.now().toString().slice(-5)}\n📅 *Date:* ${"Pending confirmation"}\n📞 *Agent:* +234 800 DEMO\n\n⚠️ _Demo mode._`, nextStep: "DONE" },
    ],
  },

  {
    id: "auto_workshop",
    name: "Automobile Workshop",
    icon: "🔧",
    category: "Sales & Commerce",
    description: "Book vehicle services, get quotations, and track job status.",
    steps: [
      { id: "ENTRY", type: "message", body: "🔧 *Welcome to Xtop Auto Care Demo!*\n\nBook a vehicle service or request a quotation.", nextStep: "SERVICE_LIST" },
      { id: "SERVICE_LIST", type: "list", title: "Services", body: "🛠️ *Select a service:*", options: AUTO_SERVICES.map((s) => ({ id: s.id, label: s.name, description: s.price })), captureField: "service", nextStep: "VEHICLE_INFO" },
      { id: "VEHICLE_INFO", type: "input", body: "🚗 *Enter your vehicle details:*\n\n_(e.g. Toyota Camry 2018, ABC-123-XY)_", captureField: "vehicle", nextStep: "BOOK_CONFIRM" },
      { id: "BOOK_CONFIRM", type: "confirmation", body: (ctx) => `✅ *Confirm Booking?*\n\n🛠️ ${ctx.service || "Service"}\n🚗 ${ctx.vehicle || "Vehicle"}\n💰 ${AUTO_SERVICES.find((s) => s.id === ctx.service_id)?.price || "TBD"}`, nextStep: "BOOK_DONE" },
      { id: "BOOK_DONE", type: "message", body: `✅ *Service Booked!*\n\n📋 *Job #:* XAC-${Date.now().toString().slice(-5)}\n📊 *Status:* Queued\n⏱️ *Est. Duration:* ${AUTO_SERVICES[0]?.duration || "2 hours"}\n\n⚠️ _Demo mode._`, nextStep: "DONE" },
    ],
  },

  // ── CUSTOMER MANAGEMENT ──
  {
    id: "crm",
    name: "CRM / Customer Management",
    icon: "👥",
    category: "Customer Management",
    description: "Demonstrate lead capture, customer registration, follow-up, and sales pipeline tracking.",
    steps: [
      { id: "ENTRY", type: "message", body: "👥 *Xtop CRM Demo*\n\nExperience customer relationship management automation.", nextStep: "CRM_MENU" },
      { id: "CRM_MENU", type: "list", title: "CRM Features", body: "Select a CRM feature to demo:", options: [
        { id: "lead_capture", label: "📝 Lead Capture", description: "Register a new lead" },
        { id: "pipeline", label: "📊 Sales Pipeline", description: "View pipeline stages" },
        { id: "followup", label: "📞 Follow-up", description: "Schedule follow-up" },
        { id: "history", label: "📋 Customer History", description: "View interaction log" },
      ], captureField: "crmFeature", nextStep: "CRM_ACTION" },
      { id: "CRM_ACTION", type: "input", body: (ctx) => {
        if (ctx.crmFeature_id === "lead_capture") return "📝 *Enter lead name and phone:*\n\n_(e.g. John Doe, 08012345678)_";
        if (ctx.crmFeature_id === "pipeline") return "📊 *DEMO SALES PIPELINE*\n\n🟢 *New Leads:* 12\n🟡 *Contacted:* 8\n🟠 *Proposal Sent:* 5\n🔴 *Negotiation:* 3\n✅ *Closed Won:* 7\n💰 *Total Value:* ₦4.2M";
        if (ctx.crmFeature_id === "followup") return "📞 *Enter customer name to schedule follow-up:*\n\n_(e.g. Jane Smith)_";
        return "📋 *DEMO CUSTOMER HISTORY*\n\n• 2026-09-20: Initial enquiry via WhatsApp\n• 2026-09-22: Product demo scheduled\n• 2026-09-24: Quotation sent (₦250,000)\n• 2026-09-25: Follow-up call completed\n• 2026-09-26: Deal closed ✅";
      }, captureField: "crmInput", nextStep: "CRM_DONE" },
      { id: "CRM_DONE", type: "message", body: (ctx) => `✅ *CRM Action Completed!*\n\n${ctx.crmFeature_id === "lead_capture" ? "📝 Lead registered successfully.\n📊 Pipeline stage: NEW\n🔔 Auto follow-up scheduled for 48 hours." : ctx.crmFeature_id === "followup" ? `📞 Follow-up scheduled for ${ctx.crmInput || "customer"}.\n🔔 Reminder set for tomorrow 9am.` : "CRM demo action completed."}\n\n⚠️ _Demo mode._`, nextStep: "DONE" },
    ],
  },

  {
    id: "customer_support",
    name: "Customer Support",
    icon: "🎧",
    category: "Customer Management",
    description: "FAQs, support tickets, complaint handling, and escalation to human agents.",
    steps: [
      { id: "ENTRY", type: "message", body: "🎧 *Xtop Customer Support Demo*\n\nExperience automated support ticket creation and resolution.", nextStep: "SUPPORT_MENU" },
      { id: "SUPPORT_MENU", type: "list", title: "Support Options", body: "How can we help?", options: [
        { id: "faq", label: "❓ FAQs", description: "Common questions" },
        { id: "ticket", label: "🎫 Create Ticket", description: "Report an issue" },
        { id: "status", label: "📊 Check Ticket", description: "Track existing ticket" },
        { id: "escalate", label: "👤 Talk to Agent", description: "Human escalation" },
      ], captureField: "supportType", nextStep: "SUPPORT_ACTION" },
      { id: "SUPPORT_ACTION", type: "input", body: (ctx) => {
        if (ctx.supportType_id === "faq") return "❓ *DEMO FAQs*\n\n*Q: How do I reset my password?*\nA: Go to Settings > Security > Reset Password.\n\n*Q: What are your business hours?*\nA: Mon–Fri, 8am–6pm WAT.\n\n*Q: How do I request a refund?*\nA: Submit a ticket with your order number.";
        if (ctx.supportType_id === "ticket") return "🎫 *Describe your issue:*\n\n_(e.g. My order hasn't arrived)_";
        if (ctx.supportType_id === "status") return "📊 *DEMO TICKET STATUS*\n\n🎫 *Ticket #XTR-8842*\n📋 *Subject:* Order delivery delay\n📊 *Status:* In Progress\n👤 *Agent:* Sarah\n⏱️ *Est. Resolution:* 24 hours";
        return "👤 *Connecting you to a demo agent...*\n\n⏳ _In a real deployment, this would route to a live human agent._";
      }, captureField: "supportInput", nextStep: "SUPPORT_DONE" },
      { id: "SUPPORT_DONE", type: "message", body: (ctx) => `✅ *Support Action Complete!*\n\n${ctx.supportType_id === "ticket" ? `🎫 *Ticket Created:* XTR-${Date.now().toString().slice(-4)}\n📊 *Status:* Open\n⏱️ *Expected Response:* < 2 hours` : "Demo support action completed."}\n\n⚠️ _Demo mode._`, nextStep: "DONE" },
    ],
  },

  // ── PAYMENTS & FINANCE ──
  {
    id: "payment_collection",
    name: "Payment Collection",
    icon: "💳",
    category: "Payments & Finance",
    description: "Generate payment requests, verify payments, and issue receipts.",
    steps: [
      { id: "ENTRY", type: "message", body: "💳 *Xtop Payment Collection Demo*\n\nExperience automated payment request and verification.", nextStep: "PAY_AMOUNT" },
      { id: "PAY_AMOUNT", type: "input", body: "💰 *Enter the amount to collect:*\n\n_(e.g. 50000)_", captureField: "payAmount", validation: (v) => isNaN(parseInt(v)) ? "⚠️ Enter a valid amount." : null, nextStep: "PAY_PURPOSE" },
      { id: "PAY_PURPOSE", type: "input", body: "📋 *What is this payment for?*\n\n_(e.g. Invoice #1234, Monthly subscription)_", captureField: "payPurpose", nextStep: "PAY_REQUEST" },
      { id: "PAY_REQUEST", type: "buttons", body: (ctx) => `💳 *PAYMENT REQUEST*\n\n💰 *Amount:* ₦${parseInt(ctx.payAmount || "0").toLocaleString()}\n📋 *Purpose:* ${ctx.payPurpose || "N/A"}\n\n⚠️ _DEMO MODE — No real payment link generated._`, options: [
        { id: "generate", label: "🔗 Generate Pay Link" },
        { id: "verify", label: "✅ Verify Payment" },
      ], captureField: "payAction", nextStep: "PAY_RESULT" },
      { id: "PAY_RESULT", type: "message", body: (ctx) => {
        if (ctx.payAction_id === "generate") return `🔗 *DEMO PAYMENT LINK*\n\n💰 ₦${parseInt(ctx.payAmount || "0").toLocaleString()}\n🔗 https://paystack.demo/pay/XTR-${Date.now().toString().slice(-6)}\n\n⚠️ _This is a fictional link. In production, this connects to Paystack/Flutterwave._`;
        return `⚠️ *DEMO PAYMENT VERIFICATION*\n\n🔍 Checking payment status...\n\n❌ *No payment found.*\n\n_In production, this would verify the transaction via Paystack API before confirming._\n\n🔒 *Xtop never marks payments as successful based on user messages alone.*`;
      }, nextStep: "DONE" },
    ],
  },

  {
    id: "business_calculator",
    name: "Business Calculator",
    icon: "🧮",
    category: "Payments & Finance",
    description: "Profit, markup, discount, VAT, commission, loan, and break-even calculators.",
    steps: [
      { id: "ENTRY", type: "message", body: "🧮 *Xtop Business Calculator Demo*\n\nPowerful calculators for Nigerian businesses.", nextStep: "CALC_MENU" },
      { id: "CALC_MENU", type: "list", title: "Calculators", body: "Select a calculator:", options: [
        { id: "profit", label: "💰 Profit Calculator", description: "Revenue - Cost = Profit" },
        { id: "markup", label: "📈 Markup Calculator", description: "Set your profit margin" },
        { id: "vat", label: "🏛️ VAT Calculator", description: "7.5% Nigerian VAT" },
        { id: "discount", label: "🏷️ Discount Calculator", description: "Calculate savings" },
        { id: "commission", label: "🤝 Commission Calculator", description: "Agent commissions" },
        { id: "loan", label: "🏦 Loan Calculator", description: "Monthly repayments" },
      ], captureField: "calcType", nextStep: "CALC_INPUT" },
      { id: "CALC_INPUT", type: "input", body: (ctx) => {
        const prompts: Record<string, string> = {
          profit: "💰 *Profit Calculator*\n\nEnter: cost_price selling_price\n_(e.g. 5000 8000)_",
          markup: "📈 *Markup Calculator*\n\nEnter: cost_price markup_percentage\n_(e.g. 5000 30)_",
          vat: "🏛️ *VAT Calculator (7.5%)*\n\nEnter the amount:\n_(e.g. 100000)_",
          discount: "🏷️ *Discount Calculator*\n\nEnter: original_price discount_percentage\n_(e.g. 15000 20)_",
          commission: "🤝 *Commission Calculator*\n\nEnter: sale_amount commission_percentage\n_(e.g. 500000 10)_",
          loan: "🏦 *Loan Calculator*\n\nEnter: principal monthly_rate months\n_(e.g. 1000000 2 12)_",
        };
        return prompts[ctx.calcType_id || "profit"] || "Enter values:";
      }, captureField: "calcInput", nextStep: "CALC_RESULT" },
      { id: "CALC_RESULT", type: "message", body: (ctx) => {
        const parts = (ctx.calcInput || "0 0").split(/\s+/).map(Number);
        const type = ctx.calcType_id;
        if (type === "profit") { const cost = parts[0] || 5000; const sell = parts[1] || 8000; return `💰 *Profit Result*\n\nCost: ₦${cost.toLocaleString()}\nRevenue: ₦${sell.toLocaleString()}\n*Profit: ₦${(sell - cost).toLocaleString()}*\nMargin: ${(((sell - cost) / sell) * 100).toFixed(1)}%`; }
        if (type === "markup") { const cost = parts[0] || 5000; const pct = parts[1] || 30; const price = cost * (1 + pct / 100); return `📈 *Markup Result*\n\nCost: ₦${cost.toLocaleString()}\nMarkup: ${pct}%\n*Selling Price: ₦${Math.round(price).toLocaleString()}*`; }
        if (type === "vat") { const amt = parts[0] || 100000; return `🏛️ *VAT Result (7.5%)*\n\nAmount: ₦${amt.toLocaleString()}\nVAT: ₦${Math.round(amt * 0.075).toLocaleString()}\n*Total: ₦${Math.round(amt * 1.075).toLocaleString()}*`; }
        if (type === "discount") { const orig = parts[0] || 15000; const pct = parts[1] || 20; return `🏷️ *Discount Result*\n\nOriginal: ₦${orig.toLocaleString()}\nDiscount: ${pct}% (₦${Math.round(orig * pct / 100).toLocaleString()})\n*Final Price: ₦${Math.round(orig * (1 - pct / 100)).toLocaleString()}*`; }
        if (type === "commission") { const sale = parts[0] || 500000; const pct = parts[1] || 10; return `🤝 *Commission Result*\n\nSale: ₦${sale.toLocaleString()}\nRate: ${pct}%\n*Commission: ₦${Math.round(sale * pct / 100).toLocaleString()}*`; }
        if (type === "loan") { const p = parts[0] || 1000000; const r = (parts[1] || 2) / 100; const n = parts[2] || 12; const monthly = Math.round(p * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1)); return `🏦 *Loan Result*\n\nPrincipal: ₦${p.toLocaleString()}\nRate: ${(r * 100).toFixed(1)}% monthly\nTerm: ${n} months\n*Monthly Payment: ₦${monthly.toLocaleString()}*\n*Total Repayment: ₦${(monthly * n).toLocaleString()}*`; }
        return "🧮 Calculation complete.";
      }, nextStep: "DONE" },
    ],
  },

  // ── BOOKING & SERVICES ──
  {
    id: "appointment_booking",
    name: "Appointment Booking",
    icon: "📅",
    category: "Booking & Services",
    description: "Book appointments, view available slots, confirm, cancel, and reschedule.",
    steps: [
      { id: "ENTRY", type: "message", body: "📅 *Xtop Appointment Booking Demo*\n\nExperience automated scheduling and reminders.", nextStep: "BOOK_SERVICE" },
      { id: "BOOK_SERVICE", type: "list", title: "Services", body: "Select a service to book:", options: [
        { id: "consult", label: "💼 Business Consultation", description: "60 mins" },
        { id: "demo", label: "🎮 Product Demo", description: "30 mins" },
        { id: "audit", label: "📊 System Audit", description: "90 mins" },
      ], captureField: "bookService", nextStep: "BOOK_DATE" },
      { id: "BOOK_DATE", type: "input", body: "📅 *Enter preferred date:*\n\n_(e.g. Monday 10am)_", captureField: "bookDate", nextStep: "BOOK_TIME" },
      { id: "BOOK_TIME", type: "buttons", body: (ctx) => `⏰ *Available slots for ${ctx.bookDate || "your date"}:*\n\n_(Demo fictional availability)_`, options: [
        { id: "9am", label: "9:00 AM" },
        { id: "11am", label: "11:00 AM" },
        { id: "2pm", label: "2:00 PM" },
      ], captureField: "bookTime", nextStep: "BOOK_CONFIRM" },
      { id: "BOOK_CONFIRM", type: "confirmation", body: (ctx) => `✅ *Confirm Appointment?*\n\n💼 ${ctx.bookService || "Service"}\n📅 ${ctx.bookDate || "TBD"}\n⏰ ${ctx.bookTime || "TBD"}`, nextStep: "BOOK_DONE" },
      { id: "BOOK_DONE", type: "message", body: `✅ *Appointment Confirmed!*\n\n📋 *Ref:* XAB-${Date.now().toString().slice(-5)}\n🔔 *Reminder:* 24 hours before\n📧 *Confirmation:* Sent via WhatsApp\n\n⚠️ _Demo mode._`, nextStep: "DONE" },
    ],
  },

  // ── COMMUNITY & EVENTS ──
  {
    id: "church_management",
    name: "Church Management",
    icon: "⛪",
    category: "Community & Events",
    description: "Church info, services, events, registration, announcements, and donations.",
    steps: [
      { id: "ENTRY", type: "message", body: "⛪ *Grace Community Church Demo*\n\nExperience church management automation.", nextStep: "CHURCH_MENU" },
      { id: "CHURCH_MENU", type: "list", title: "Church Portal", body: "Welcome! How can we serve you?", options: [
        { id: "services", label: "🙏 Service Times", description: "Sunday & midweek" },
        { id: "events", label: "📅 Upcoming Events", description: "Programmes & retreats" },
        { id: "announce", label: "📢 Announcements", description: "Latest church news" },
        { id: "donate", label: "💝 Give / Donate", description: "Tithes & offerings" },
        { id: "register", label: "📝 New Member", description: "Join our church" },
      ], captureField: "churchAction", nextStep: "CHURCH_RESULT" },
      { id: "CHURCH_RESULT", type: "message", body: (ctx) => {
        const results: Record<string, string> = {
          services: "🙏 *Service Times*\n\n🌅 *Sunday:* 8:00 AM & 10:30 AM\n🌙 *Wednesday (Bible Study):* 6:00 PM\n🙌 *Friday (Prayer):* 7:00 PM\n\n📍 *Address:* 12 Grace Avenue, Lekki, Lagos",
          events: "📅 *Upcoming Events*\n\n• *Oct 5:* Youth Conference\n• *Oct 12:* Marriage Seminar\n• *Oct 20:* Community Outreach\n• *Nov 1:* Thanksgiving Service",
          announce: "📢 *Announcements*\n\n• Cell groups resume next week\n• Choir audition Saturday 4pm\n• Building fund target: 80% reached\n• Volunteer registration now open",
          donate: "💝 *Giving Portal*\n\n🏦 *Bank:* First Bank\n📋 *Account:* 0123456789\n📛 *Name:* Grace Community Church\n\n⚠️ _Demo mode — no real account._",
          register: "📝 *New Member Registration*\n\nWelcome! In production, this would collect your name, phone, address, and assign you to a cell group.",
        };
        return results[ctx.churchAction_id || "services"] || "Church demo.";
      }, nextStep: "DONE" },
    ],
  },

  // ── OPERATIONS ──
  {
    id: "inventory",
    name: "Inventory Management",
    icon: "📦",
    category: "Operations",
    description: "Track stock levels, stock-in, stock-out, low-stock alerts, and reports.",
    steps: [
      { id: "ENTRY", type: "message", body: "📦 *Xtop Inventory Demo*\n\nExperience warehouse and stock management automation.", nextStep: "INV_MENU" },
      { id: "INV_MENU", type: "list", title: "Inventory", body: "Select an action:", options: [
        { id: "levels", label: "📊 Stock Levels", description: "Current inventory" },
        { id: "stockin", label: "📥 Stock In", description: "Add new stock" },
        { id: "stockout", label: "📤 Stock Out", description: "Record sale/dispatch" },
        { id: "alerts", label: "🔔 Low Stock Alerts", description: "Items below threshold" },
      ], captureField: "invAction", nextStep: "INV_RESULT" },
      { id: "INV_RESULT", type: "message", body: (ctx) => {
        if (ctx.invAction_id === "levels") return "📊 *DEMO STOCK LEVELS*\n\n• Wireless Earbuds: *24 units*\n• Phone Cases: *150 units*\n• USB-C Chargers: *45 units*\n• Laptop Stands: *18 units* ⚠️\n• Screen Protectors: *200 units*";
        if (ctx.invAction_id === "alerts") return "🔔 *LOW STOCK ALERTS*\n\n⚠️ Laptop Stands: *18 units* (threshold: 20)\n⚠️ Bluetooth Speakers: *30 units* (threshold: 35)\n\n🔔 _Auto-notification sent to procurement manager._";
        return `✅ *DEMO ${ctx.invAction || "Action"} COMPLETED*\n\n📦 Stock updated successfully.\n🔔 Relevant notifications triggered.\n\n⚠️ _Demo mode._`;
      }, nextStep: "DONE" },
    ],
  },

  // ── CUSTOM AUTOMATION ──
  {
    id: "custom_automation",
    name: "Custom Business Automation",
    icon: "⚙️",
    category: "Custom Automation",
    description: "Tell us what you want to automate and we'll show you how Xtop can build it.",
    steps: [
      { id: "ENTRY", type: "message", body: "⚙️ *Custom Automation Demo*\n\nXtop can automate virtually any business workflow. Tell us what you need!", nextStep: "CUSTOM_AREA" },
      { id: "CUSTOM_AREA", type: "list", title: "What to Automate?", body: "Which area of your business needs automation?", options: [
        { id: "sales", label: "💰 Sales & Orders", description: "Order processing" },
        { id: "customers", label: "👥 Customer Mgmt", description: "CRM & support" },
        { id: "payments", label: "💳 Payments", description: "Invoicing & collection" },
        { id: "bookings", label: "📅 Bookings", description: "Appointments & scheduling" },
        { id: "inventory", label: "📦 Inventory", description: "Stock management" },
        { id: "notifications", label: "🔔 Notifications", description: "Reminders & alerts" },
        { id: "leads", label: "📝 Lead Gen", description: "Capture & qualify" },
        { id: "other", label: "🔧 Other", description: "Custom workflow" },
      ], captureField: "customArea", nextStep: "CUSTOM_DESC" },
      { id: "CUSTOM_DESC", type: "input", body: (ctx) => `📝 *Great choice! ${ctx.customArea || "Custom"} automation.*\n\nDescribe what you want to automate in your own words:\n\n_(e.g. "I want to automatically send payment reminders to customers who owe me money")_`, captureField: "customDesc", nextStep: "CUSTOM_DONE" },
      { id: "CUSTOM_DONE", type: "message", body: (ctx) => `✅ *Requirement Captured!*\n\n⚙️ *Area:* ${ctx.customArea || "Custom"}\n📝 *Description:* ${ctx.customDesc || "N/A"}\n\n🏗️ *What Xtop Can Build:*\n\n• Automated WhatsApp workflows\n• Database-backed state management\n• Payment integrations (Paystack)\n• CRM & lead tracking\n• Scheduled notifications\n• Admin dashboard\n\n💼 _Tap "Build This For My Business" to get a custom quote!_`, nextStep: "DONE" },
    ],
  },
];

// ═══════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════

export function getAllDemos(): DemoConfig[] {
  return DEMO_CONFIGS;
}

export function getDemoConfig(id: string): DemoConfig | undefined {
  return DEMO_CONFIGS.find((d) => d.id === id);
}

export function getDemosByCategory(): Record<string, DemoConfig[]> {
  const map: Record<string, DemoConfig[]> = {};
  for (const d of DEMO_CONFIGS) {
    if (!map[d.category]) map[d.category] = [];
    map[d.category].push(d);
  }
  return map;
}

export function getDemoCategories(): string[] {
  return [...new Set(DEMO_CONFIGS.map((d) => d.category))];
}
