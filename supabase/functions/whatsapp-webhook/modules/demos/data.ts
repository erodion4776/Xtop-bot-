// supabase/functions/whatsapp-webhook/modules/demos/data.ts
// All Demo Configurations + Fictional Data (26 Complete Demos)

import { DemoConfig } from "./engine.ts";

// ═══════════════════════════════════════════════════════
// FICTIONAL DEMO DATA SETS
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

const CLINIC_DEPARTMENTS = [
  { id: "cd1", name: "General Consultation", fee: "₦5,000" },
  { id: "cd2", name: "Dental", fee: "₦10,000" },
  { id: "cd3", name: "Eye / Optometry", fee: "₦8,000" },
  { id: "cd4", name: "Paediatrics", fee: "₦6,000" },
  { id: "cd5", name: "Antenatal / Maternity", fee: "₦7,000" },
];

const LAW_SERVICES = [
  { id: "ls1", name: "Business Registration", fee: "₦50,000 – ₦150,000" },
  { id: "ls2", name: "Contract Drafting", fee: "₦30,000 – ₦100,000" },
  { id: "ls3", name: "Property / Conveyancing", fee: "₦100,000 – ₦500,000" },
  { id: "ls4", name: "Family Law / Estate", fee: "₦80,000 – ₦300,000" },
  { id: "ls5", name: "Corporate Retainer", fee: "₦150,000+/mo" },
];

const JOB_VACANCIES = [
  { id: "jv1", title: "Frontend Developer", dept: "Engineering", type: "Full-time", salary: "₦400K – ₦700K" },
  { id: "jv2", title: "Sales Executive", dept: "Business", type: "Full-time", salary: "₦250K – ₦400K" },
  { id: "jv3", title: "Customer Support Agent", dept: "Operations", type: "Remote", salary: "₦150K – ₦250K" },
  { id: "jv4", title: "Graphic Designer", dept: "Creative", type: "Contract", salary: "₦200K – ₦350K" },
];

const EVENTS_LIST = [
  { id: "ev1", name: "Tech Summit Lagos 2026", date: "Oct 15, 2026", venue: "Eko Convention Centre", price: "₦10,000" },
  { id: "ev2", name: "SME Business Workshop", date: "Oct 22, 2026", venue: "Landmark Centre", price: "₦5,000" },
  { id: "ev3", name: "AI & Automation Conference", date: "Nov 5, 2026", venue: "Virtual", price: "Free" },
  { id: "ev4", name: "Startup Pitch Night", date: "Nov 12, 2026", venue: "Co-Creation Hub", price: "₦3,000" },
];

// ═══════════════════════════════════════════════════════
// CART HELPERS (shared by any demo that needs a real
// multi-item cart/order — online_store, restaurant, and
// any future demo that reuses the same pattern)
// ═══════════════════════════════════════════════════════

interface CartLine {
  id: string;
  name: string;
  price: number;
  qty: number;
}

function cartTotal(cart?: CartLine[]): number {
  return (cart || []).reduce((sum, item) => sum + item.price * item.qty, 0);
}

function formatCartLines(cart?: CartLine[]): string {
  if (!cart || cart.length === 0) return "_Nothing added yet._";
  return cart
    .map((item, i) => `${i + 1}. *${item.name}* × ${item.qty} — ₦${(item.price * item.qty).toLocaleString()}`)
    .join("\n");
}

// Mutates ctx.cart in place — merges quantity if the item is already there.
function addToCart(
  ctx: Record<string, any>,
  product: { id: string; name: string; price: number },
  qty: number
): void {
  const cart: CartLine[] = ctx.cart || [];
  const existing = cart.find((c) => c.id === product.id);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({ id: product.id, name: product.name, price: product.price, qty });
  }
  ctx.cart = cart;
}

// ═══════════════════════════════════════════════════════
// DEMO CONFIGURATIONS (All 26 Demos)
// ═══════════════════════════════════════════════════════

const DEMO_CONFIGS: DemoConfig[] = [

  // ─────────────────────────────────────────────────────
  // 1. SALES & COMMERCE
  // ─────────────────────────────────────────────────────

  {
    id: "online_store",
    name: "Online Store",
    icon: "🛒",
    category: "Sales & Commerce",
    description: "Browse products, add multiple items to a real cart, edit or remove items, choose delivery, and complete a full checkout.",
    steps: [
      { id: "ENTRY", type: "message", body: "🛒 *Welcome to NaijaShop Demo Store!*\n\nBrowse our fictional product catalogue and build a real shopping cart, just like a live store.", nextStep: "BROWSE" },

      { id: "BROWSE", type: "list", title: "Browse Products", body: (ctx) => `🛍️ *Select a category to browse:*${(ctx.cart && ctx.cart.length) ? `\n\n🧺 _${ctx.cart.length} item(s) already in your cart_` : ""}`, options: [
        { id: "cat_electronics", label: "📱 Electronics", description: "Earbuds, chargers, speakers" },
        { id: "cat_accessories", label: "🎒 Accessories", description: "Cases, stands, protectors" },
        { id: "cat_all", label: "📦 All Products", description: "View everything" },
      ], captureField: "category", nextStep: "PRODUCT_LIST" },

      { id: "PRODUCT_LIST", type: "list", title: "Products", body: (ctx) => {
        const catName = ctx.category_id === "cat_electronics" ? "Electronics" : ctx.category_id === "cat_accessories" ? "Accessories" : null;
        const items = catName ? STORE_PRODUCTS.filter((p) => p.category === catName) : STORE_PRODUCTS;
        return `📦 *${ctx.category || "All Products"}:*\n\n${items.map((p, i) => `${i + 1}. *${p.name}* — ₦${p.price.toLocaleString()}`).join("\n")}`;
      }, options: (ctx) => {
        const catName = ctx.category_id === "cat_electronics" ? "Electronics" : ctx.category_id === "cat_accessories" ? "Accessories" : null;
        const items = catName ? STORE_PRODUCTS.filter((p) => p.category === catName) : STORE_PRODUCTS;
        return items.map((p) => ({ id: p.id, label: p.name, description: `₦${p.price.toLocaleString()} • ${p.stock} in stock` }));
      }, captureField: "product", nextStep: "PRODUCT_DETAIL" },

      { id: "PRODUCT_DETAIL", type: "buttons", body: (ctx) => {
        const p = STORE_PRODUCTS.find((x) => x.id === ctx.product_id) || STORE_PRODUCTS[0];
        return `📋 *${p.name}*\n\n💰 ₦${p.price.toLocaleString()}\n📦 In Stock: ${p.stock} units\n🏷️ Category: ${p.category}`;
      }, options: [
        { id: "add_cart", label: "🛒 Add to Cart" },
        { id: "browse_more", label: "🔙 Browse More" },
        { id: "view_cart", label: "🧺 View Cart" },
      ], nextStep: (input) => input === "add_cart" ? "QUANTITY" : input === "view_cart" ? "VIEW_CART" : "BROWSE" },

      { id: "QUANTITY", type: "input", body: (ctx) => `🔢 *How many ${ctx.product || "items"}?*\n_(Type a number, e.g. 2)_`, captureField: "quantity", validation: (v) => (isNaN(parseInt(v)) || parseInt(v) < 1) ? "⚠️ Enter a valid number (1 or more)." : null,
        onSelect: (input, ctx) => {
          const product = STORE_PRODUCTS.find((p) => p.id === ctx.product_id);
          if (product) addToCart(ctx, product, parseInt(input) || 1);
        }, nextStep: "ITEM_ADDED" },

      { id: "ITEM_ADDED", type: "message", body: (ctx) => `✅ *Added to cart!*\n\n${formatCartLines(ctx.cart)}\n\n💰 *Cart Total: ₦${cartTotal(ctx.cart).toLocaleString()}*`, nextStep: "CART_MENU" },

      { id: "CART_MENU", type: "buttons", body: "🧺 *What would you like to do next?*", options: [
        { id: "addmore", label: "➕ Add More Items" },
        { id: "editcart", label: "✏️ View / Edit Cart" },
        { id: "checkout", label: "💳 Checkout" },
      ], nextStep: (input) => input === "checkout" ? "CHECKOUT_ADDRESS" : input === "editcart" ? "VIEW_CART" : "BROWSE" },

      { id: "VIEW_CART", type: "list", title: "Your Cart", body: (ctx) => (ctx.cart && ctx.cart.length)
        ? `🧺 *Your Cart:*\n\n${formatCartLines(ctx.cart)}\n\n💰 *Total: ₦${cartTotal(ctx.cart).toLocaleString()}*\n\n_Tap an item below to remove it, or choose an action._`
        : "🧺 _Your cart is empty. Add something first!_",
        options: (ctx) => {
          const removeRows = (ctx.cart || []).map((item: CartLine, i: number) => ({
            id: `remove_${i}`,
            label: `❌ Remove ${item.name}`.substring(0, 24),
            description: `${item.qty} × ₦${item.price.toLocaleString()}`,
          }));
          return [
            ...removeRows,
            { id: "addmore", label: "➕ Add More Items" },
            ...((ctx.cart && ctx.cart.length) ? [{ id: "checkout", label: "💳 Checkout" }] : []),
          ];
        },
        onSelect: (input, ctx) => {
          if (input.startsWith("remove_")) {
            const idx = parseInt(input.replace("remove_", ""));
            if (!isNaN(idx) && ctx.cart) ctx.cart.splice(idx, 1);
          }
        },
        nextStep: (input) => input.startsWith("remove_") ? "VIEW_CART" : input === "checkout" ? "CHECKOUT_ADDRESS" : "BROWSE" },

      { id: "CHECKOUT_ADDRESS", type: "input", body: (ctx) => (!ctx.cart || ctx.cart.length === 0)
        ? "🧺 _Your cart is empty — let's add something first!_"
        : `🧾 *ORDER SUMMARY*\n\n${formatCartLines(ctx.cart)}\n\n*Subtotal: ₦${cartTotal(ctx.cart).toLocaleString()}*\n\n📍 *Enter delivery address:*`,
        captureField: "address", nextStep: (input, ctx) => (!ctx.cart || ctx.cart.length === 0) ? "BROWSE" : "DELIVERY_METHOD" },

      { id: "DELIVERY_METHOD", type: "buttons", body: "🚚 *Choose delivery method:*", options: [
        { id: "delivery", label: "🚚 Home Delivery (₦2,000)" },
        { id: "pickup", label: "🏪 Store Pickup (Free)" },
      ], captureField: "delivery", nextStep: "PAYMENT" },

      { id: "PAYMENT", type: "buttons", body: "💳 *Select payment method:*\n\n⚠️ _DEMO MODE — No real payment processed._", options: [
        { id: "transfer", label: "🏦 Bank Transfer" },
        { id: "card", label: "💳 Card Payment" },
        { id: "ussd", label: "📱 USSD" },
      ], captureField: "payment", nextStep: "CONFIRM" },

      { id: "CONFIRM", type: "confirmation", body: (ctx) => {
        const deliveryFee = ctx.delivery_id === "delivery" ? 2000 : 0;
        const grandTotal = cartTotal(ctx.cart) + deliveryFee;
        return `✅ *Confirm Order?*\n\n${formatCartLines(ctx.cart)}\n\n💰 Subtotal: ₦${cartTotal(ctx.cart).toLocaleString()}\n🚚 Delivery: ₦${deliveryFee.toLocaleString()}\n*Grand Total: ₦${grandTotal.toLocaleString()}*\n\n📍 ${ctx.address || "N/A"}\n💳 ${ctx.payment || "N/A"}`;
      }, nextStep: "ORDER_DONE" },

      // NOTE: this used to be named "COMPLETE" and its receipt never actually
      // rendered — the engine intercepts the literal string "COMPLETE" as a
      // shortcut straight to the generic post-demo menu. Renamed so this
      // message step actually executes before that menu appears.
      { id: "ORDER_DONE", type: "message", body: (ctx) => {
        const deliveryFee = ctx.delivery_id === "delivery" ? 2000 : 0;
        const grandTotal = cartTotal(ctx.cart) + deliveryFee;
        return `🎉 *ORDER CONFIRMED!*\n\n📋 Order #: XTR-${Date.now().toString().slice(-6)}\n\n${formatCartLines(ctx.cart)}\n\n*Total Paid: ₦${grandTotal.toLocaleString()}*\n📦 Status: Processing\n🚚 ${ctx.delivery || "Delivery"}: 2–3 business days\n\n⚠️ _Demo mode — no real order placed._`;
      }, nextStep: "DONE" },
    ],
  },

  {
    id: "restaurant",
    name: "Restaurant Ordering",
    icon: "🍽️",
    category: "Sales & Commerce",
    description: "Browse the menu, add multiple dishes to a real order, edit or remove items, then complete pickup or delivery checkout.",
    steps: [
      { id: "ENTRY", type: "message", body: "🍽️ *Mama Put Demo Kitchen!*\n\nBrowse our fictional menu and build a full order, just like on a live ordering platform.", nextStep: "MENU" },

      { id: "MENU", type: "list", title: "Menu", body: (ctx) => `📋 *Select a category:*${(ctx.cart && ctx.cart.length) ? `\n\n🧺 _${ctx.cart.length} item(s) already in your order_` : ""}`, options: [
        { id: "mains", label: "🍛 Main Dishes", description: "Jollof, Egusi, Pounded Yam" },
        { id: "soups", label: "🥣 Soups", description: "Pepper Soup" },
        { id: "drinks", label: "🥤 Drinks & Snacks", description: "Chapman, Meat Pie" },
      ], captureField: "foodCat", nextStep: "SELECT_FOOD" },

      { id: "SELECT_FOOD", type: "list", title: "Dishes", body: "🍛 *Select your dish:*", options: (ctx) => {
        const filterMap: Record<string, string[]> = { mains: ["Mains"], soups: ["Soups"], drinks: ["Drinks", "Snacks"] };
        const cats = filterMap[ctx.foodCat_id] || [];
        const items = cats.length ? RESTAURANT_MENU.filter((f) => cats.includes(f.category)) : RESTAURANT_MENU;
        return items.map((f) => ({ id: f.id, label: f.name, description: `₦${f.price.toLocaleString()}` }));
      }, captureField: "food", nextStep: "FOOD_QTY" },

      { id: "FOOD_QTY", type: "input", body: (ctx) => `🔢 *How many portions of ${ctx.food || "this dish"}?*\n_(Type a number)_`, captureField: "foodQty", validation: (v) => (isNaN(parseInt(v)) || parseInt(v) < 1) ? "⚠️ Enter a valid number (1 or more)." : null,
        onSelect: (input, ctx) => {
          const dish = RESTAURANT_MENU.find((f) => f.id === ctx.food_id);
          if (dish) addToCart(ctx, dish, parseInt(input) || 1);
        }, nextStep: "DISH_ADDED" },

      { id: "DISH_ADDED", type: "message", body: (ctx) => `✅ *Added to your order!*\n\n${formatCartLines(ctx.cart)}\n\n💰 *Order Total: ₦${cartTotal(ctx.cart).toLocaleString()}*`, nextStep: "ORDER_MENU" },

      { id: "ORDER_MENU", type: "buttons", body: "🧺 *What next?*", options: [
        { id: "addmore", label: "➕ Add Another Dish" },
        { id: "editorder", label: "✏️ View / Edit Order" },
        { id: "checkout", label: "💳 Checkout" },
      ], nextStep: (input) => input === "checkout" ? "FOOD_METHOD" : input === "editorder" ? "VIEW_ORDER" : "MENU" },

      { id: "VIEW_ORDER", type: "list", title: "Your Order", body: (ctx) => (ctx.cart && ctx.cart.length)
        ? `🧺 *Your Order:*\n\n${formatCartLines(ctx.cart)}\n\n💰 *Total: ₦${cartTotal(ctx.cart).toLocaleString()}*`
        : "🧺 _Your order is empty. Add a dish first!_",
        options: (ctx) => {
          const removeRows = (ctx.cart || []).map((item: CartLine, i: number) => ({
            id: `remove_${i}`,
            label: `❌ Remove ${item.name}`.substring(0, 24),
            description: `${item.qty} × ₦${item.price.toLocaleString()}`,
          }));
          return [
            ...removeRows,
            { id: "addmore", label: "➕ Add Another Dish" },
            ...((ctx.cart && ctx.cart.length) ? [{ id: "checkout", label: "💳 Checkout" }] : []),
          ];
        },
        onSelect: (input, ctx) => {
          if (input.startsWith("remove_")) {
            const idx = parseInt(input.replace("remove_", ""));
            if (!isNaN(idx) && ctx.cart) ctx.cart.splice(idx, 1);
          }
        },
        nextStep: (input) => input.startsWith("remove_") ? "VIEW_ORDER" : input === "checkout" ? "FOOD_METHOD" : "MENU" },

      { id: "FOOD_METHOD", type: "buttons", body: (ctx) => (!ctx.cart || ctx.cart.length === 0)
        ? "🧺 _Your order is empty — add a dish first!_"
        : `🧾 *ORDER SUMMARY*\n\n${formatCartLines(ctx.cart)}\n\n*Subtotal: ₦${cartTotal(ctx.cart).toLocaleString()}*\n\n🚗 *Pickup or Delivery?*`,
        options: [
          { id: "pickup", label: "🏪 Pickup" },
          { id: "delivery", label: "🚚 Delivery (₦1,500)" },
        ], captureField: "foodMethod", nextStep: (input, ctx) => (!ctx.cart || ctx.cart.length === 0) ? "MENU" : "FOOD_CONFIRM" },

      { id: "FOOD_CONFIRM", type: "confirmation", body: (ctx) => {
        const deliveryFee = ctx.foodMethod_id === "delivery" ? 1500 : 0;
        const grandTotal = cartTotal(ctx.cart) + deliveryFee;
        return `✅ *Confirm Order?*\n\n${formatCartLines(ctx.cart)}\n\n💰 Subtotal: ₦${cartTotal(ctx.cart).toLocaleString()}\n🚗 ${ctx.foodMethod || "Pickup"}: ₦${deliveryFee.toLocaleString()}\n*Grand Total: ₦${grandTotal.toLocaleString()}*`;
      }, nextStep: "FOOD_DONE" },

      { id: "FOOD_DONE", type: "message", body: (ctx) => {
        const deliveryFee = ctx.foodMethod_id === "delivery" ? 1500 : 0;
        const grandTotal = cartTotal(ctx.cart) + deliveryFee;
        return `🎉 *Kitchen Order Received!*\n\n📋 Order #: MP-${Date.now().toString().slice(-5)}\n\n${formatCartLines(ctx.cart)}\n\n*Total: ₦${grandTotal.toLocaleString()}*\n⏱️ Est. Preparation: 25–35 mins\n\n⚠️ _Demo mode — no real food ordered._`;
      }, nextStep: "DONE" },
    ],
  },

  {
    id: "real_estate",
    name: "Real Estate",
    icon: "🏠",
    category: "Sales & Commerce",
    description: "Browse verified properties, check prices and locations, request info, and book physical inspections.",
    steps: [
      { id: "ENTRY", type: "message", body: "🏠 *Xtop Properties Demo!*\nBrowse fictional property listings across Nigeria.", nextStep: "LISTINGS" },
      { id: "LISTINGS", type: "list", title: "Properties", body: "🏘️ *Available Listings:*\n\n" + PROPERTIES.map((p, i) => `${i + 1}. *${p.name}*\n   ${p.type} • ${p.price}`).join("\n\n"), options: PROPERTIES.map((p) => ({ id: p.id, label: p.name, description: `${p.price} • ${p.location}` })), captureField: "property", nextStep: "PROP_DETAIL" },
      { id: "PROP_DETAIL", type: "buttons", body: (ctx) => {
        const p = PROPERTIES.find((x) => x.id === ctx.property_id) || PROPERTIES[0];
        return `🏠 *${p.name}*\n\n📍 Location: ${p.location}\n💰 Price: ${p.price}\n📋 Type: ${p.type}\n🛏️ 3 Bedrooms • 🚗 Parking • 🔒 24/7 Security`;
      }, options: [
        { id: "inspect", label: "📅 Book Inspection" },
        { id: "info", label: "ℹ️ More Info" },
        { id: "back", label: "🔙 All Properties" },
      ], captureField: "propAction", nextStep: (input) => input === "inspect" ? "INSPECT" : input === "back" ? "LISTINGS" : "PROP_DETAIL" },
      { id: "INSPECT", type: "input", body: "📅 *Enter preferred inspection date and time:*\n_(e.g. Saturday 2:00 PM)_", captureField: "inspectDate", nextStep: "INSPECT_DONE" },
      { id: "INSPECT_DONE", type: "message", body: (ctx) => `✅ *Inspection Booked!*\n\n📋 Ref: XPR-${Date.now().toString().slice(-5)}\n🏠 Property: ${ctx.property || "Selected Property"}\n📅 Scheduled: ${ctx.inspectDate || "Pending confirmation"}\n📞 Assigned Agent: +234 800 DEMO\n\n⚠️ _Demo mode._`, nextStep: "DONE" },
    ],
  },

  {
    id: "auto_workshop",
    name: "Automobile Workshop",
    icon: "🔧",
    category: "Sales & Commerce",
    description: "Book vehicle services, get maintenance quotations, track workshop job status, and set service history.",
    steps: [
      { id: "ENTRY", type: "message", body: "🔧 *Xtop Auto Care Workshop Demo!*\nBook maintenance services or request diagnostic estimates.", nextStep: "SERVICES" },
      { id: "SERVICES", type: "list", title: "Services", body: "🛠️ *Select a service:*", options: AUTO_SERVICES.map((s) => ({ id: s.id, label: s.name, description: s.price })), captureField: "service", nextStep: "VEHICLE" },
      { id: "VEHICLE", type: "input", body: "🚗 *Enter vehicle details:*\n_(e.g. Toyota Camry 2018, ABC-123-XY)_", captureField: "vehicle", nextStep: "AUTO_CONFIRM" },
      { id: "AUTO_CONFIRM", type: "confirmation", body: (ctx) => `✅ *Confirm Booking?*\n\n🛠️ Service: ${ctx.service || "Service"}\n🚗 Vehicle: ${ctx.vehicle || "N/A"}\n💰 Estimate: ${AUTO_SERVICES.find((s) => s.id === ctx.service_id)?.price || "TBD"}`, nextStep: "AUTO_DONE" },
      { id: "AUTO_DONE", type: "message", body: `✅ *Service Job Created!*\n\n📋 Job Card #: XAC-${Date.now().toString().slice(-5)}\n📊 Status: Queued in Workshop\n🔔 Automated stage notifications: Active\n\n⚠️ _Demo mode._`, nextStep: "DONE" },
    ],
  },

  {
    id: "lead_quotation",
    name: "Lead-to-Quotation",
    icon: "📝",
    category: "Sales & Commerce",
    description: "Capture inbound leads, qualify requirements, generate automated PDF quotes, and trigger follow-ups.",
    steps: [
      { id: "ENTRY", type: "message", body: "📝 *Lead-to-Quotation Automation Demo*\nExperience rapid qualification and instant quotation generation.", nextStep: "LQ_CAPTURE" },
      { id: "LQ_CAPTURE", type: "input", body: "👤 *Enter prospect name:*\n_(e.g. John Adeyemi)_", captureField: "prospectName", nextStep: "LQ_BUSINESS" },
      { id: "LQ_BUSINESS", type: "input", body: "🏢 *Enter business name and industry:*\n_(e.g. Adeyemi Stores, Retail)_", captureField: "prospectBiz", nextStep: "LQ_NEED" },
      { id: "LQ_NEED", type: "list", title: "Prospect Need", body: "Select requirement:", options: [
        { id: "website", label: "🌐 Business Website" },
        { id: "bot", label: "🤖 WhatsApp Chatbot" },
        { id: "crm", label: "👥 CRM Integration" },
        { id: "ecommerce", label: "🛒 E-Commerce Platform" },
      ], captureField: "prospectNeed", nextStep: "LQ_BUDGET" },
      { id: "LQ_BUDGET", type: "buttons", body: "💰 *Planned Budget Range:*", options: [
        { id: "low", label: "₦150K – ₦300K" },
        { id: "mid", label: "₦300K – ₦700K" },
        { id: "high", label: "₦700K – ₦2M" },
      ], captureField: "prospectBudget", nextStep: "LQ_DONE" },
      { id: "LQ_DONE", type: "message", body: (ctx) => `✅ *Quotation Generated & Dispatched!*\n\n📋 Quote #: XTR-Q-${Date.now().toString().slice(-5)}\n👤 Client: ${ctx.prospectName || "Prospect"}\n🏢 Business: ${ctx.prospectBiz || "N/A"}\n📌 Scope: ${ctx.prospectNeed || "N/A"}\n💰 Estimate: ${ctx.prospectBudget || "TBD"}\n🔔 48-hour follow-up automation: Scheduled\n\n⚠️ _Demo mode._`, nextStep: "DONE" },
    ],
  },

  // ─────────────────────────────────────────────────────
  // 2. CUSTOMER MANAGEMENT
  // ─────────────────────────────────────────────────────

  {
    id: "crm",
    name: "CRM / Customer Management",
    icon: "👥",
    category: "Customer Management",
    description: "Lead capture, customer profiles, pipeline stages, activity history, and task assignments.",
    steps: [
      { id: "ENTRY", type: "message", body: "👥 *Xtop CRM Automation Demo*\nCentralized contact database and pipeline management.", nextStep: "CRM_MENU" },
      { id: "CRM_MENU", type: "list", title: "CRM Actions", body: "Select a CRM feature to test:", options: [
        { id: "lead", label: "📝 Lead Capture" },
        { id: "pipeline", label: "📊 Sales Pipeline" },
        { id: "followup", label: "📞 Schedule Follow-up" },
        { id: "history", label: "📋 Customer History Log" },
      ], captureField: "crmFeature", nextStep: "CRM_ACTION" },
      { id: "CRM_ACTION", type: "message", body: (ctx) => {
        if (ctx.crmFeature_id === "lead") return "📝 *DEMO: Lead Captured!*\n\n👤 Name: Jane Smith\n📞 Phone: +234-800-DEMO-001\n🏢 Company: Smith Global\n📊 Status: NEW LEAD\n🔔 Next Action: Auto-introduction sent";
        if (ctx.crmFeature_id === "pipeline") return "📊 *DEMO SALES PIPELINE*\n\n🟢 New Leads: 18\n🟡 Qualified: 11\n🟠 Proposal Sent: 6\n🔴 Negotiation: 3\n✅ Won: 9\n💰 Pipeline Value: ₦6.8M";
        if (ctx.crmFeature_id === "followup") return "📞 *DEMO FOLLOW-UP*\n\n📅 Scheduled: Tomorrow 10:00 AM\n👤 Contact: Chuka Eze\n📋 Notes: Review quotation terms\n🔔 WhatsApp reminder: Active";
        return "📋 *DEMO CUSTOMER TIMELINE*\n\n• Sep 20: Inbound WhatsApp enquiry\n• Sep 21: Auto-brochure delivered\n• Sep 23: Demo session held\n• Sep 25: Quotation accepted\n• Sep 26: Deposit confirmed ✅";
      }, nextStep: "DONE" },
    ],
  },

  {
    id: "customer_support",
    name: "Customer Support",
    icon: "🎧",
    category: "Customer Management",
    description: "Automated FAQs, ticket creation, SLA monitoring, and live human agent escalations.",
    steps: [
      { id: "ENTRY", type: "message", body: "🎧 *Xtop Support Desk Demo*\nInstant resolution workflows and automated ticketing.", nextStep: "SUP_MENU" },
      { id: "SUP_MENU", type: "list", title: "Support", body: "How can we assist you today?", options: [
        { id: "faq", label: "❓ Instant FAQs" },
        { id: "ticket", label: "🎫 Open Support Ticket" },
        { id: "status", label: "📊 Track Existing Ticket" },
        { id: "escalate", label: "👤 Human Agent Handoff" },
      ], captureField: "supType", nextStep: "SUP_ACTION" },
      { id: "SUP_ACTION", type: "input", body: (ctx) => {
        if (ctx.supType_id === "faq") return "❓ *DEMO KNOWLEDGE BASE*\n\n*Q: How do I update delivery address?*\nA: Reply with 'address' and your order number.\n\n*Q: What are your operational hours?*\nA: Mon–Sat, 8:00 AM – 7:00 PM WAT.";
        if (ctx.supType_id === "ticket") return "🎫 *Describe your technical or billing issue:*";
        if (ctx.supType_id === "status") return "📊 *TICKET STATUS: #XTR-4491*\n\n📋 Issue: Delayed dispatch\n📊 Status: IN PROGRESS\n👤 Handler: Agent Michael\n⏱️ Resolution Target: < 4 hours";
        return "👤 *Connecting you to a representative...*\n\n_In production, this initiates a live dashboard agent handoff._";
      }, captureField: "supInput", nextStep: "SUP_DONE" },
      { id: "SUP_DONE", type: "message", body: (ctx) => `✅ *${ctx.supType_id === "ticket" ? `Ticket Created: #XTR-${Date.now().toString().slice(-4)}\n📊 Priority: Medium\n⏱️ First response SLA: 30 mins` : "Support request logged."}*\n\n⚠️ _Demo mode._`, nextStep: "DONE" },
    ],
  },

  {
    id: "survey_feedback",
    name: "Survey & Feedback",
    icon: "📊",
    category: "Customer Management",
    description: "Collect CSAT ratings, NPS scores, open-ended feedback, and aggregated metrics.",
    steps: [
      { id: "ENTRY", type: "message", body: "📊 *Xtop Survey & CSAT Demo*\nGather customer insights directly on WhatsApp.", nextStep: "SURVEY_Q1" },
      { id: "SURVEY_Q1", type: "buttons", body: "⭐ *Q1/3: How would you rate your overall experience?*", options: [
        { id: "5", label: "⭐⭐⭐⭐⭐ 5 Stars" },
        { id: "3", label: "⭐⭐⭐ 3 Stars" },
        { id: "1", label: "⭐ 1 Star" },
      ], captureField: "rating", nextStep: "SURVEY_Q2" },
      { id: "SURVEY_Q2", type: "buttons", body: "👍 *Q2/3: Would you recommend our services?*", options: [
        { id: "yes", label: "✅ Definitely" },
        { id: "maybe", label: "🤔 Maybe" },
        { id: "no", label: "❌ No" },
      ], captureField: "recommend", nextStep: "SURVEY_Q3" },
      { id: "SURVEY_Q3", type: "input", body: "💬 *Q3/3: What is one thing we could improve?*\n_(Type your suggestions)_", captureField: "comments", nextStep: "SURVEY_DONE" },
      { id: "SURVEY_DONE", type: "message", body: (ctx) => `✅ *Feedback Logged!*\n\n⭐ Rating: ${ctx.rating || "5"}/5\n👍 Recommendation: ${ctx.recommend || "Yes"}\n💬 Feedback: "${ctx.comments || "No comments"}"\n\n📊 _Aggregated into real-time BI reports._\n\n⚠️ _Demo mode._`, nextStep: "DONE" },
    ],
  },

  {
    id: "recruitment",
    name: "Recruitment & Hiring",
    icon: "💼",
    category: "Customer Management",
    description: "Browse job openings, candidate screening, CV ingestion, and interview bookings.",
    steps: [
      { id: "ENTRY", type: "message", body: "💼 *Xtop Recruitment Automation Demo*\nEnd-to-end applicant screening and management.", nextStep: "JOBS" },
      { id: "JOBS", type: "list", title: "Open Positions", body: "📋 *Current Openings:*\n\n" + JOB_VACANCIES.map((j) => `• *${j.title}*\n  ${j.dept} • ${j.type} • ${j.salary}`).join("\n\n"), options: JOB_VACANCIES.map((j) => ({ id: j.id, label: j.title, description: `${j.salary} • ${j.type}` })), captureField: "job", nextStep: "APPLY_INFO" },
      { id: "APPLY_INFO", type: "input", body: (ctx) => `📝 *Applying for: ${ctx.job || "Position"}*\n\nEnter your full name and email address:`, captureField: "applicantInfo", nextStep: "APPLY_CV" },
      { id: "APPLY_CV", type: "buttons", body: "📄 *CV / Resume Submission*\n\n_Candidates can upload PDF or DOCX files directly in WhatsApp._", options: [
        { id: "uploaded", label: "✅ CV Uploaded (Demo)" },
        { id: "later", label: "⏳ Provide Later" },
      ], captureField: "cvStatus", nextStep: "APPLY_DONE" },
      { id: "APPLY_DONE", type: "message", body: (ctx) => `✅ *Application Registered!*\n\n📋 Ref: XHR-${Date.now().toString().slice(-5)}\n💼 Role: ${ctx.job || "Position"}\n👤 Candidate: ${ctx.applicantInfo || "Applicant"}\n📊 Status: Screening / Pending Review\n\n⚠️ _Demo mode._`, nextStep: "DONE" },
    ],
  },

  // ─────────────────────────────────────────────────────
  // 3. OPERATIONS
  // ─────────────────────────────────────────────────────

  {
    id: "inventory",
    name: "Inventory Management",
    icon: "📦",
    category: "Operations",
    description: "Warehouse stock management, stock-in/out logs, SKU thresholds, and low-stock alerts.",
    steps: [
      { id: "ENTRY", type: "message", body: "📦 *Xtop Inventory Control Demo*\nReal-time stock auditing and reorder notifications.", nextStep: "INV_MENU" },
      { id: "INV_MENU", type: "list", title: "Inventory", body: "Select inventory operation:", options: [
        { id: "levels", label: "📊 Current Stock Levels" },
        { id: "stockin", label: "📥 Record Stock-In" },
        { id: "stockout", label: "📤 Record Stock-Out" },
        { id: "alerts", label: "🔔 Low Stock Warnings" },
      ], captureField: "invAction", nextStep: "INV_RESULT" },
      { id: "INV_RESULT", type: "message", body: (ctx) => {
        if (ctx.invAction_id === "levels") return "📊 *DEMO WAREHOUSE LEVELS*\n\n• Wireless Earbuds: 24 units\n• Phone Cases: 150 units\n• 65W Chargers: 45 units\n• Laptop Stands: 18 units ⚠️\n• Screen Protectors: 200 units";
        if (ctx.invAction_id === "alerts") return "🔔 *LOW STOCK WARNINGS*\n\n⚠️ Laptop Stands: 18 left (Threshold: 20)\n⚠️ Bluetooth Speakers: 30 left (Threshold: 35)\n\n🔔 Automatic supplier reorder draft triggered.";
        if (ctx.invAction_id === "stockin") return "📥 *STOCK-IN REGISTERED*\n\n✅ +50 Fast Chargers added\n📦 New SKU Total: 95\n👤 Operator: Warehouse Admin\n🕐 Timestamp: Just now";
        return "📤 *STOCK-OUT REGISTERED*\n\n✅ -10 Earbuds dispatched\n📦 Remaining SKU Total: 14\n📋 Order Ref: #ORD-9981\n🕐 Timestamp: Just now";
      }, nextStep: "DONE" },
    ],
  },

  {
    id: "delivery_logistics",
    name: "Delivery & Logistics",
    icon: "🚚",
    category: "Operations",
    description: "Waybill creation, distance fare calculators, rider dispatch, and live milestone tracking.",
    steps: [
      { id: "ENTRY", type: "message", body: "🚚 *Xtop Logistics & Dispatch Demo*\nManage pickup, delivery, and real-time parcel tracking.", nextStep: "DEL_TYPE" },
      { id: "DEL_TYPE", type: "buttons", body: "📦 *Choose operation:*", options: [
        { id: "send", label: "📤 Dispatch Parcel" },
        { id: "track", label: "🔍 Track Waybill" },
      ], captureField: "delType", nextStep: (input) => input === "send" ? "DEL_SENDER" : "DEL_TRACK" },
      { id: "DEL_SENDER", type: "input", body: "👤 *Enter Sender Name & Pickup Address:*\n_(e.g. Tunde, 14 Admiralty Way, Lekki)_", captureField: "sender", nextStep: "DEL_RECEIVER" },
      { id: "DEL_RECEIVER", type: "input", body: "📍 *Enter Receiver Name & Drop-off Address:*\n_(e.g. Mary, 8 Allen Avenue, Ikeja)_", captureField: "receiver", nextStep: "DEL_PACKAGE" },
      { id: "DEL_PACKAGE", type: "list", title: "Package Size", body: "Select weight category:", options: [
        { id: "small", label: "📦 Small (< 2kg)", description: "₦1,500 Base" },
        { id: "medium", label: "📦 Medium (2–10kg)", description: "₦3,000 Base" },
        { id: "large", label: "📦 Large (10–30kg)", description: "₦5,500 Base" },
      ], captureField: "package", nextStep: "DEL_FEE" },
      { id: "DEL_FEE", type: "buttons", body: (ctx) => `💰 *Calculated Delivery Fee: ₦${ctx.package_id === "medium" ? "3,000" : ctx.package_id === "large" ? "5,500" : "1,500"}*\n\n📍 Route: Lekki ➔ Ikeja\n⏱️ Est. Transit: 2–3 Hours\n\n*Confirm dispatch booking?*`, options: [
        { id: "confirm", label: "✅ Confirm Dispatch" },
        { id: "cancel", label: "❌ Cancel" },
      ], captureField: "delConfirm", nextStep: "DEL_DONE" },
      { id: "DEL_TRACK", type: "message", body: "🔍 *DEMO WAYBILL TRACKING*\n\n📋 Waybill: #XDL-88201\n📦 Status: *OUT FOR DELIVERY* 🛵\n📍 Current Location: Maryland Junction\n👤 Rider: Musa (080-DEMO-RIDER)\n⏱️ Estimated Drop-off: 25 mins\n\n⚠️ _Demo mode._", nextStep: "DONE" },
      { id: "DEL_DONE", type: "message", body: `✅ *Dispatch Booking Confirmed!*\n\n📋 Waybill: #XDL-${Date.now().toString().slice(-5)}\n🛵 Rider Assigned: En-route to pickup\n🔔 Automated SMS/WhatsApp milestones: Enabled\n\n⚠️ _Demo mode._`, nextStep: "DONE" },
    ],
  },

  {
    id: "hr_automation",
    name: "HR Automation",
    icon: "👔",
    category: "Operations",
    description: "Employee self-service, leave applications, attendance logs, announcements, and payroll slips.",
    steps: [
      { id: "ENTRY", type: "message", body: "👔 *Xtop Employee Self-Service Demo*\nStreamline internal HR workflows and approvals.", nextStep: "HR_MENU" },
      { id: "HR_MENU", type: "list", title: "HR Portal", body: "Select self-service action:", options: [
        { id: "leave", label: "🏖️ Apply for Leave" },
        { id: "attendance", label: "✅ Check-In Attendance" },
        { id: "announce", label: "📢 Company Broadcasts" },
        { id: "payslip", label: "📄 Request Payslip" },
      ], captureField: "hrAction", nextStep: "HR_ACTION" },
      { id: "HR_ACTION", type: "input", body: (ctx) => {
        if (ctx.hrAction_id === "leave") return "🏖️ *Leave Application*\n\nEnter leave category and duration:\n_(e.g. Annual Leave, 5 days, Oct 10–15)_";
        if (ctx.hrAction_id === "attendance") return "✅ *DEMO ATTENDANCE LOG*\n\n🟢 Timestamp: 08:14 AM\n📍 Location: HQ Office (GPS Verified)\n📊 Status: On-Time\n\n_Have a productive workday!_";
        if (ctx.hrAction_id === "announce") return "📢 *COMPANY BROADCASTS*\n\n• 🏢 Q4 Strategy All-Hands: Thursday 2:00 PM\n• 🌴 Public Holiday Notice: Oct 1\n• 🏆 Employee of the Month: Emmanuel O.";
        return "📄 *DEMO PAYSLIP DISPATCH*\n\n📋 Period: August 2026\n💼 Basic Salary: Confirmed\n🏛️ Pension & Tax: Deducted\n\n_In production, encrypted PDF payslips are delivered instantly via WhatsApp._";
      }, captureField: "hrInput", nextStep: "HR_DONE" },
      { id: "HR_DONE", type: "message", body: (ctx) => `✅ *${ctx.hrAction_id === "leave" ? "Leave Application Forwarded!\n📊 Status: Pending Line Manager Sign-off\n🔔 Notification dispatched to supervisor." : "HR request processed."}*\n\n⚠️ _Demo mode._`, nextStep: "DONE" },
    ],
  },

  {
    id: "document_collection",
    name: "Document Collection",
    icon: "📄",
    category: "Operations",
    description: "Automated KYC checklist, file validation, OCR status, missing item prompts, and approval notices.",
    steps: [
      { id: "ENTRY", type: "message", body: "📄 *Xtop KYC & Document Verification Demo*\nAutomate document collection and onboarding checks.", nextStep: "DOC_LIST" },
      { id: "DOC_LIST", type: "message", body: "📋 *Onboarding Checklist Status:*\n\n1. ✅ *Valid National ID / Passport* — Verified\n2. ✅ *Proof of Residential Address* — Verified\n3. ⏳ *Bank Statement (6 Months)* — Pending Upload\n4. ❌ *Tax Identification Form* — Missing\n5. 🔴 *CAC Certificate* — Rejected (Blurry Scan)\n\n_Choose next action below:_", nextStep: "DOC_ACTION" },
      { id: "DOC_ACTION", type: "list", title: "Action", body: "Select document action:", options: [
        { id: "upload", label: "📤 Submit Missing File" },
        { id: "status", label: "📊 Detailed Checklist Status" },
        { id: "resubmit", label: "🔄 Replace Rejected Document" },
      ], captureField: "docAction", nextStep: "DOC_RESULT" },
      { id: "DOC_RESULT", type: "message", body: (ctx) => {
        if (ctx.docAction_id === "upload") return "📤 *DOCUMENT RECEIVED*\n\n✅ 6-Month Bank Statement uploaded.\n🔍 Automated OCR & Compliance Check: Running\n⏱️ Est. Review Time: < 30 minutes";
        if (ctx.docAction_id === "resubmit") return "🔄 *RESUBMISSION PORTAL*\n\n🔴 File: CAC Certificate\n❌ Rejection Reason: Signature page was illegible.\n📤 Please provide a clear, high-resolution scan.";
        return "📊 *COMPLIANCE OVERVIEW*\n\n• Verified Files: 2/5\n• Pending Items: 1/5\n• Action Required: 2/5\n📈 *Onboarding Progress: 40%*";
      }, nextStep: "DONE" },
    ],
  },

  // ─────────────────────────────────────────────────────
  // 4. PAYMENTS & FINANCE
  // ─────────────────────────────────────────────────────

  {
    id: "payment_collection",
    name: "Payment Collection",
    icon: "💳",
    category: "Payments & Finance",
    description: "Dynamic payment links, Paystack checkout integration, anti-cheat verification, and receipts.",
    steps: [
      { id: "ENTRY", type: "message", body: "💳 *Xtop Payment Collection Demo*\nSecure checkout generation and webhook-based verification.", nextStep: "PAY_AMOUNT" },
      { id: "PAY_AMOUNT", type: "input", body: "💰 *Enter amount to collect (NGN):*\n_(e.g. 75000)_", captureField: "payAmount", validation: (v) => isNaN(parseInt(v)) ? "⚠️ Enter numbers only." : null, nextStep: "PAY_PURPOSE" },
      { id: "PAY_PURPOSE", type: "input", body: "📋 *Specify purpose or invoice reference:*\n_(e.g. Web Hosting Renewal #442)_", captureField: "payPurpose", nextStep: "PAY_REQUEST" },
      { id: "PAY_REQUEST", type: "buttons", body: (ctx) => `💳 *PAYMENT REQUEST SUMMARY*\n\n💰 Amount: ₦${parseInt(ctx.payAmount || "0").toLocaleString()}\n📋 Reference: ${ctx.payPurpose || "Direct Payment"}\n\n⚠️ _DEMO MODE — Fictional gateway simulator._`, options: [
        { id: "generate", label: "🔗 Generate Payment Link" },
        { id: "verify", label: "✅ Verify Transaction" },
      ], captureField: "payAction", nextStep: "PAY_RESULT" },
      { id: "PAY_RESULT", type: "message", body: (ctx) => {
        if (ctx.payAction_id === "generate") return `🔗 *SECURE PAYMENT LINK*\n\n💰 Amount: ₦${parseInt(ctx.payAmount || "0").toLocaleString()}\n👉 https://paystack.demo/checkout/XTR-${Date.now().toString().slice(-6)}\n\n🔒 Supports Cards, Bank Transfer, Apple Pay, & USSD.`;
        return `⚠️ *PAYMENT STATUS VERIFICATION*\n\n🔍 Querying gateway webhooks...\n❌ *No settled transaction detected yet.*\n\n🔒 *Security Note: Xtop never marks invoices paid based on manual user claims.*`;
      }, nextStep: "DONE" },
    ],
  },

  {
    id: "invoice_quotation",
    name: "Invoice & Quotation",
    icon: "🧾",
    category: "Payments & Finance",
    description: "Automated billing, itemized sub-totals, discounts, VAT calculation, and PDF dispatch.",
    steps: [
      { id: "ENTRY", type: "message", body: "🧾 *Xtop Invoicing & Quotation Engine*\nGenerate professional, itemized commercial documents.", nextStep: "IQ_TYPE" },
      { id: "IQ_TYPE", type: "buttons", body: "📋 *Select document to generate:*", options: [
        { id: "quote", label: "📄 Commercial Quotation" },
        { id: "invoice", label: "🧾 Final Tax Invoice" },
      ], captureField: "iqType", nextStep: "IQ_CUSTOMER" },
      { id: "IQ_CUSTOMER", type: "input", body: "👤 *Enter Client / Company Name:*\n_(e.g. Horizon Logistics Ltd)_", captureField: "iqCustomer", nextStep: "IQ_ITEMS" },
      { id: "IQ_ITEMS", type: "message", body: "📦 *DEMO BILLING BREAKDOWN:*\n\n1. WhatsApp Automation Suite — ₦250,000\n2. Custom CRM Dashboard — ₦150,000\n3. Dedicated Server Setup — ₦50,000\n\n• *Subtotal:* ₦450,000\n• *Special Discount (5%):* -₦22,500\n• *VAT (7.5%):* +₦32,062.50\n\n*TOTAL DUE: ₦459,562.50*", nextStep: "IQ_SEND" },
      { id: "IQ_SEND", type: "buttons", body: (ctx) => `📤 *Ready to dispatch ${ctx.iqType === "invoice" ? "Invoice" : "Quotation"}?*\n\n👤 Recipient: ${ctx.iqCustomer || "Client"}\n💰 Payable: ₦459,562.50\n📅 Validity: 14 Calendar Days`, options: [
        { id: "send", label: "📤 Send to WhatsApp" },
        { id: "pdf", label: "📄 Export PDF" },
      ], captureField: "iqSend", nextStep: "IQ_DONE" },
      { id: "IQ_DONE", type: "message", body: (ctx) => `✅ *${ctx.iqType === "invoice" ? "Tax Invoice" : "Commercial Quotation"} Generated!*\n\n📋 Document #: XTR-${ctx.iqType === "invoice" ? "INV" : "QTO"}-${Date.now().toString().slice(-5)}\n👤 Client: ${ctx.iqCustomer || "Client"}\n💰 Balance: ₦459,562.50\n🔔 Automated due reminder: Set for +7 days\n\n⚠️ _Demo mode._`, nextStep: "DONE" },
    ],
  },

  {
    id: "loan_application",
    name: "Loan Application",
    icon: "🏦",
    category: "Payments & Finance",
    description: "Credit intake, tenor calculations, KYC uploads, risk verification, and underwriting queues.",
    steps: [
      { id: "ENTRY", type: "message", body: "🏦 *Xtop Micro-Credit & Loan Portal*\nStructured applicant evaluation workflow.\n\n⚠️ _Loans undergo manual underwriting and are never auto-approved._", nextStep: "LOAN_AMOUNT" },
      { id: "LOAN_AMOUNT", type: "input", body: "💰 *Enter requested loan principal (NGN):*\n_(e.g. 500000)_", captureField: "loanAmount", validation: (v) => isNaN(parseInt(v)) ? "⚠️ Enter valid numbers." : null, nextStep: "LOAN_PURPOSE" },
      { id: "LOAN_PURPOSE", type: "list", title: "Loan Purpose", body: "Select capital purpose:", options: [
        { id: "business", label: "💼 Inventory & Working Capital" },
        { id: "equipment", label: "🔧 Heavy Equipment Purchase" },
        { id: "emergency", label: "🚨 Business Emergency Facility" },
        { id: "project", label: "🏗️ Contract Execution" },
      ], captureField: "loanPurpose", nextStep: "LOAN_TERM" },
      { id: "LOAN_TERM", type: "buttons", body: "📅 *Select repayment tenor:*", options: [
        { id: "3m", label: "3 Months (4.5%)" },
        { id: "6m", label: "6 Months (4.0%)" },
        { id: "12m", label: "12 Months (3.5%)" },
      ], captureField: "loanTerm", nextStep: "LOAN_SUBMIT" },
      { id: "LOAN_SUBMIT", type: "confirmation", body: (ctx) => `📋 *Confirm Credit Submission?*\n\n💰 Principal: ₦${parseInt(ctx.loanAmount || "0").toLocaleString()}\n📌 Purpose: ${ctx.loanPurpose || "Working Capital"}\n📅 Tenor: ${ctx.loanTerm || "6 Months"}\n\n⚠️ _Application will be queued for credit officer appraisal._`, nextStep: "LOAN_DONE" },
      { id: "LOAN_DONE", type: "message", body: `✅ *Loan Dossier Logged!*\n\n📋 Application ID: #XLN-${Date.now().toString().slice(-5)}\n📊 Status: Underwriting Review\n⏱️ SLA Decision Window: 48–72 Hours\n🔔 Status updates dispatched via WhatsApp\n\n⚠️ _Demo mode — no credit facility issued._`, nextStep: "DONE" },
    ],
  },

  {
    id: "cooperative_savings",
    name: "Cooperative / Savings",
    icon: "🏛️",
    category: "Payments & Finance",
    description: "Thrift collections, Ajo/Esusu contribution ledgers, balance statements, and payout rosters.",
    steps: [
      { id: "ENTRY", type: "message", body: "🏛️ *Xtop Thrift & Cooperative Automation*\nManage recurring contributions, dividend shares, and balances.", nextStep: "COOP_MENU" },
      { id: "COOP_MENU", type: "list", title: "Cooperative", body: "Select member service:", options: [
        { id: "register", label: "📝 Member Enrollment" },
        { id: "contribute", label: "💰 Log Contribution" },
        { id: "balance", label: "📊 Balance & Dividends" },
        { id: "statement", label: "📋 Full Statement of Account" },
      ], captureField: "coopAction", nextStep: "COOP_ACTION" },
      { id: "COOP_ACTION", type: "message", body: (ctx) => {
        if (ctx.coopAction_id === "register") return "📝 *MEMBER ENROLLMENT CONFIRMED*\n\n👤 Member: Chinedu Okonkwo\n🏛️ Society: Premier SME Multi-Purpose Co-Op\n💰 Monthly Share: ₦25,000\n📅 Next Remittance: 1st of Month";
        if (ctx.coopAction_id === "contribute") return "💰 *CONTRIBUTION SETTLED*\n\n✅ Remittance: ₦25,000 (September Batch)\n📊 Cumulative Thrift Balance: ₦275,000\n🧾 Automated receipt generated.";
        if (ctx.coopAction_id === "balance") return "📊 *MEMBER STATEMENT SUMMARY*\n\n👤 Member: Chinedu Okonkwo\n💰 Total Savings: ₦275,000\n📈 Accrued Dividends: ₦18,450\n🛡️ Loan Eligibility: Up to ₦550,000 (2x)";
        return "📋 *HISTORICAL THRIFT LEDGER*\n\n• May 2026: +₦25,000\n• Jun 2026: +₦25,000\n• Jul 2026: +₦25,000\n• Aug 2026: +₦25,000\n• Sep 2026: +₦25,000\n\n*Net Balance: ₦275,000*";
      }, nextStep: "DONE" },
    ],
  },

  {
    id: "business_calculator",
    name: "Business Calculator",
    icon: "🧮",
    category: "Payments & Finance",
    description: "Instant formulas for gross margins, markup pricing, VAT, commissions, and loan amortizations.",
    steps: [
      { id: "ENTRY", type: "message", body: "🧮 *Xtop Commercial Business Calculators*\nInstant mathematical computations for financial planning.", nextStep: "CALC_MENU" },
      { id: "CALC_MENU", type: "list", title: "Calculators", body: "Choose calculation model:", options: [
        { id: "profit", label: "💰 Profit Margin" },
        { id: "markup", label: "📈 Selling Price Markup" },
        { id: "vat", label: "🏛️ Statutory VAT (7.5%)" },
        { id: "discount", label: "🏷️ Promotional Discount" },
        { id: "commission", label: "🤝 Broker Commission" },
        { id: "loan", label: "🏦 Amortization Schedule" },
      ], captureField: "calcType", nextStep: "CALC_INPUT" },
      { id: "CALC_INPUT", type: "input", body: (ctx) => {
        const prompts: Record<string, string> = {
          profit: "💰 *Profit Calculator*\nEnter: cost_price selling_price\n_(e.g. 6000 9500)_",
          markup: "📈 *Markup Calculator*\nEnter: cost_price markup_percentage\n_(e.g. 8000 35)_",
          vat: "🏛️ *VAT Calculator (7.5%)*\nEnter subtotal amount:\n_(e.g. 240000)_",
          discount: "🏷️ *Discount Calculator*\nEnter: original_price discount_percent\n_(e.g. 50000 15)_",
          commission: "🤝 *Commission Calculator*\nEnter: transaction_value commission_percent\n_(e.g. 1200000 5)_",
          loan: "🏦 *Loan Schedule*\nEnter: principal monthly_interest_percent months\n_(e.g. 2000000 2.5 12)_",
        };
        return prompts[ctx.calcType_id || "profit"] || "Enter formula parameters:";
      }, captureField: "calcInput", nextStep: "CALC_RESULT" },
      { id: "CALC_RESULT", type: "message", body: (ctx) => {
        const v = (ctx.calcInput || "0 0").split(/\s+/).map(Number);
        const t = ctx.calcType_id;
        if (t === "profit") { const c = v[0] || 6000; const s = v[1] || 9500; return `💰 *PROFIT ANALYSIS*\n\nCost: ₦${c.toLocaleString()}\nSelling Price: ₦${s.toLocaleString()}\n*Net Profit: ₦${(s - c).toLocaleString()}*\nMargin: ${(((s - c) / s) * 100).toFixed(1)}%`; }
        if (t === "markup") { const c = v[0] || 8000; const m = v[1] || 35; return `📈 *MARKUP ANALYSIS*\n\nBase Cost: ₦${c.toLocaleString()}\nTarget Markup: ${m}%\n*Recommended Price: ₦${Math.round(c * (1 + m / 100)).toLocaleString()}*`; }
        if (t === "vat") { const a = v[0] || 240000; return `🏛️ *VAT COMPUTATION (7.5%)*\n\nSubtotal: ₦${a.toLocaleString()}\nVAT Amount: ₦${Math.round(a * 0.075).toLocaleString()}\n*Gross Invoiced: ₦${Math.round(a * 1.075).toLocaleString()}*`; }
        if (t === "discount") { const p = v[0] || 50000; const d = v[1] || 15; return `🏷️ *PROMOTION COMPUTATION*\n\nRegular Price: ₦${p.toLocaleString()}\nDiscount: ${d}% (-₦${Math.round(p * d / 100).toLocaleString()})\n*Discounted Price: ₦${Math.round(p * (1 - d / 100)).toLocaleString()}*`; }
        if (t === "commission") { const val = v[0] || 1200000; const r = v[1] || 5; return `🤝 *COMMISSION VALUATION*\n\nDeal Value: ₦${val.toLocaleString()}\nCommission Rate: ${r}%\n*Agent Payout: ₦${Math.round(val * r / 100).toLocaleString()}*`; }
        if (t === "loan") { const p = v[0] || 2000000; const r = (v[1] || 2.5) / 100; const n = v[2] || 12; const emi = Math.round(p * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1)); return `🏦 *AMORTIZATION SCHEDULE*\n\nPrincipal: ₦${p.toLocaleString()}\nRate: ${(r * 100).toFixed(1)}%/mo\nTenor: ${n} Months\n*Monthly Repayment: ₦${emi.toLocaleString()}*\n*Total Repayable: ₦${(emi * n).toLocaleString()}*`; }
        return "🧮 Computation complete.";
      }, nextStep: "DONE" },
    ],
  },

  // ─────────────────────────────────────────────────────
  // 5. BOOKING & SERVICES
  // ─────────────────────────────────────────────────────

  {
    id: "appointment_booking",
    name: "Appointment Booking",
    icon: "📅",
    category: "Booking & Services",
    description: "Calendar availability, automated slot reservation, reschedules, and sync reminders.",
    steps: [
      { id: "ENTRY", type: "message", body: "📅 *Xtop Appointment Scheduling Demo*\nAutomated calendar reservation and reminder workflows.", nextStep: "BOOK_SVC" },
      { id: "BOOK_SVC", type: "list", title: "Select Service", body: "Choose consultation category:", options: [
        { id: "strategy", label: "💼 Business Strategy Review", description: "60 mins • Lead Consultant" },
        { id: "tech", label: "🛠️ Technical Architecture Audit", description: "90 mins • Solution Architect" },
        { id: "product", label: "📱 Product Feature Demo", description: "30 mins • Sales Engineer" },
      ], captureField: "bookSvc", nextStep: "BOOK_DATE" },
      { id: "BOOK_DATE", type: "input", body: "📅 *Enter preferred appointment date:*\n_(e.g. Next Tuesday)_", captureField: "bookDate", nextStep: "BOOK_TIME" },
      { id: "BOOK_TIME", type: "buttons", body: "⏰ *Select open calendar slot:*", options: [
        { id: "10am", label: "10:00 AM" },
        { id: "1:30pm", label: "1:30 PM" },
        { id: "4:00pm", label: "4:00 PM" },
      ], captureField: "bookTime", nextStep: "BOOK_CONFIRM" },
      { id: "BOOK_CONFIRM", type: "confirmation", body: (ctx) => `✅ *Confirm Calendar Booking?*\n\n📌 Service: ${ctx.bookSvc || "Consultation"}\n📅 Date: ${ctx.bookDate || "Selected Date"}\n⏰ Slot: ${ctx.bookTime || "10:00 AM"}`, nextStep: "BOOK_DONE" },
      { id: "BOOK_DONE", type: "message", body: `✅ *Session Confirmed!*\n\n📋 Booking Ref: #XAB-${Date.now().toString().slice(-5)}\n🔔 Automated Calendar Reminders: Set for T-24h & T-1h\n📍 Location: Virtual Google Meet Link dispatched via WhatsApp\n\n⚠️ _Demo mode._`, nextStep: "DONE" },
    ],
  },

  {
    id: "clinic",
    name: "Clinic & Healthcare",
    icon: "🏥",
    category: "Booking & Services",
    description: "Triage registration, doctor appointments, department routing, and prescription reminders.",
    steps: [
      { id: "ENTRY", type: "message", body: "🏥 *St. Jude Clinic Patient Portal Demo*\nAutomated hospital triage and consultation scheduling.\n\n⚠️ _DEMO SYSTEM — Does not provide real medical care._", nextStep: "CLINIC_MENU" },
      { id: "CLINIC_MENU", type: "list", title: "Clinic Portal", body: "Select patient service:", options: [
        { id: "book", label: "📅 Book Doctor Consultation" },
        { id: "register", label: "📝 New Patient Registration" },
        { id: "departments", label: "🏥 Specialties & Tariffs" },
        { id: "reminders", label: "🔔 Prescription Reminders" },
      ], captureField: "clinicAction", nextStep: "CLINIC_ACTION" },
      { id: "CLINIC_ACTION", type: "input", body: (ctx) => {
        if (ctx.clinicAction_id === "departments") return "🏥 *CLINIC SPECIALTIES & TARIFFS*\n\n" + CLINIC_DEPARTMENTS.map((d) => `• ${d.name} — Consultation: ${d.fee}`).join("\n");
        if (ctx.clinicAction_id === "register") return "📝 *NEW PATIENT INTAKE*\n\nEnter Full Name, Age, and Blood Group:\n_(e.g. Obioma Adeleke, 32, O+)_";
        if (ctx.clinicAction_id === "reminders") return "🔔 *ACTIVE PRESCRIPTION SCHEDULE*\n\n• 💊 Amoxicillin (500mg): 8:00 AM & 8:00 PM\n• 💧 Paracetamol: As required for fever\n• 📅 Follow-up Vitals Check: Friday, 10:00 AM";
        return "📅 *BOOK CONSULTATION*\n\nSelect department and preferred day:\n\n" + CLINIC_DEPARTMENTS.map((d) => `• ${d.name} (${d.fee})`).join("\n");
      }, captureField: "clinicInput", nextStep: "CLINIC_DONE" },
      { id: "CLINIC_DONE", type: "message", body: `✅ *Patient Record Updated!*\n\n📋 Hospital File #: #XCL-${Date.now().toString().slice(-5)}\n🔔 Automated SMS/WhatsApp care alerts: Activated\n\n⚠️ _Demo mode — not medical advice._`, nextStep: "DONE" },
    ],
  },

  {
    id: "law_firm",
    name: "Law Firm & Legal",
    icon: "⚖️",
    category: "Booking & Services",
    description: "Confidential client intake, practice retainers, attorney consultation booking, and NDAs.",
    steps: [
      { id: "ENTRY", type: "message", body: "⚖️ *Sterling Chambers Legal Practice Demo*\nStreamline client intake, consultation briefs, and retainers.\n\n⚠️ _DEMO SYSTEM — Does not constitute attorney-client privilege or legal advice._", nextStep: "LAW_MENU" },
      { id: "LAW_MENU", type: "list", title: "Practice Areas", body: "Select practice area:", options: LAW_SERVICES.map((s) => ({ id: s.id, label: s.name, description: s.fee })), captureField: "lawService", nextStep: "LAW_INTAKE" },
      { id: "LAW_INTAKE", type: "input", body: (ctx) => `📝 *Client Brief: ${ctx.lawService || "Legal Matter"}*\n\nEnter your full legal name and brief overview of the matter:\n_(e.g. Samuel Kalu, Commercial lease contract review)_`, captureField: "lawIntake", nextStep: "LAW_APPOINT" },
      { id: "LAW_APPOINT", type: "buttons", body: "📅 *Choose consultation session:*", options: [
        { id: "morning", label: "🌅 In-Chambers (Morning)" },
        { id: "afternoon", label: "☀️ In-Chambers (Afternoon)" },
        { id: "virtual", label: "💻 Encrypted Video Call" },
      ], captureField: "lawTime", nextStep: "LAW_DONE" },
      { id: "LAW_DONE", type: "message", body: (ctx) => `✅ *Intake Brief Logged!*\n\n📋 Matter Ref: #XLW-${Date.now().toString().slice(-5)}\n⚖️ Area: ${ctx.lawService || "Commercial"}\n📅 Scheduled Session: ${ctx.lawTime || "Confirmed"}\n📄 Non-Disclosure Agreement (NDA): Draft dispatched via email\n\n⚠️ _Demo mode — not legal advice._`, nextStep: "DONE" },
    ],
  },

  // ─────────────────────────────────────────────────────
  // 6. COMMUNITY & EVENTS
  // ─────────────────────────────────────────────────────

  {
    id: "church_management",
    name: "Church Management",
    icon: "⛪",
    category: "Community & Events",
    description: "Worship schedules, online tithes/pledges, prayer requests, and member directory.",
    steps: [
      { id: "ENTRY", type: "message", body: "⛪ *Grace Community Church Portal Demo*\nMinistry communication, event updates, and giving.", nextStep: "CHURCH_MENU" },
      { id: "CHURCH_MENU", type: "list", title: "Church Portal", body: "Welcome to our fellowship! Select an option:", options: [
        { id: "services", label: "🙏 Service & Fellowship Times" },
        { id: "events", label: "📅 Upcoming Ministry Events" },
        { id: "prayer", label: "🕊️ Submit Prayer Request" },
        { id: "donate", label: "💝 Tithes, Offering & Pledges" },
        { id: "register", label: "📝 New Member Welcome Card" },
      ], captureField: "churchAction", nextStep: "CHURCH_RESULT" },
      { id: "CHURCH_RESULT", type: "message", body: (ctx) => {
        const results: Record<string, string> = {
          services: "🙏 *SERVICE & FELLOWSHIP SCHEDULE*\n\n🌅 *Sunday Celebration:* 8:00 AM & 10:30 AM\n🌙 *Wednesday Midweek Word:* 6:00 PM\n🙌 *Friday Deliverance Vigil:* 11:00 PM\n📍 Sanctuary: 12 Grace Boulevard, Lekki Phase 1",
          events: "📅 *UPCOMING CONFERENCES*\n\n• *Oct 14–16:* Annual Kingdom Breakthrough Summit\n• *Oct 28:* Couples & Family Enrichment Dinner\n• *Nov 12:* Community Youth Medical Outreach",
          prayer: "🕊️ *PRAYER REQUEST SUBMISSION*\n\n_Your petition has been forwarded to the Pastoral Intercession Team. God bless you!_",
          donate: "💝 *KINGDOM GIVING PORTAL*\n\n🏦 *Bank:* First Bank Nigeria\n📋 *Account:* 0123456789 (Fictional Demo Account)\n📛 *Account Name:* Grace Community Assembly\n\n🔒 Automated receipt generated on confirmation.",
          register: "📝 *NEW CONVERT / FIRST-TIMER INTAKE*\n\n_We welcome you into our family! A follow-up minister will reach out shortly._",
        };
        return results[ctx.churchAction_id || "services"] || "Church portal session logged.";
      }, nextStep: "DONE" },
    ],
  },

  {
    id: "event_registration",
    name: "Event Registration & Tickets",
    icon: "🎟️",
    category: "Community & Events",
    description: "Conference ticketing, QR check-in badges, attendee rosters, and reminder broadcasts.",
    steps: [
      { id: "ENTRY", type: "message", body: "🎟️ *Xtop Event Ticketing & Registration Demo*\nAutomated ticket generation and event check-in passes.", nextStep: "EVENTS" },
      { id: "EVENTS", type: "list", title: "Featured Events", body: "Select an event to register:", options: EVENTS_LIST.map((e) => ({ id: e.id, label: e.name, description: `${e.date} • ${e.price}` })), captureField: "event", nextStep: "TICKET_TIER" },
      { id: "TICKET_TIER", type: "buttons", body: "🎫 *Select Ticket Access Category:*", options: [
        { id: "regular", label: "🎟️ Regular Pass" },
        { id: "vip", label: "⭐ VIP Delegate Pass" },
        { id: "table", label: "👑 Corporate Table" },
      ], captureField: "ticketTier", nextStep: "ATTENDEE_INFO" },
      { id: "ATTENDEE_INFO", type: "input", body: "👤 *Enter Attendee Full Name & Badge Title:*\n_(e.g. David Alabi, Head of Growth)_", captureField: "attendee", nextStep: "EVENT_DONE" },
      { id: "EVENT_DONE", type: "message", body: (ctx) => `🎉 *REGISTRATION CONFIRMED!*\n\n🎫 Event: ${ctx.event || "Tech Summit"}\n⭐ Access: ${ctx.ticketTier || "Regular"}\n👤 Attendee: ${ctx.attendee || "Guest"}\n📲 Digital QR Badge: #TKT-${Date.now().toString().slice(-6)}\n\n_Show your WhatsApp QR badge at the registration desk for instant badging._\n\n⚠️ _Demo mode._`, nextStep: "DONE" },
    ],
  },

  {
    id: "news_information",
    name: "News & Information Broadcast",
    icon: "📰",
    category: "Community & Events",
    description: "Subscription categories, daily digests, breaking alerts, and preference management.",
    steps: [
      { id: "ENTRY", type: "message", body: "📰 *Xtop News & Information Alert Demo*\nAutomated broadcast channels and category subscriptions.", nextStep: "NEWS_MENU" },
      { id: "NEWS_MENU", type: "list", title: "News Channels", body: "Select digest category:", options: [
        { id: "biz", label: "💼 Business & Economy" },
        { id: "tech", label: "🚀 Tech & Innovation" },
        { id: "crypto", label: "🪙 Web3 & Fintech" },
        { id: "sports", label: "⚽ Sports & Entertainment" },
        { id: "sub", label: "🔔 Manage Subscriptions" },
      ], captureField: "newsChannel", nextStep: "NEWS_RESULT" },
      { id: "NEWS_RESULT", type: "message", body: (ctx) => {
        if (ctx.newsChannel_id === "biz") return "💼 *BUSINESS DIGEST (TOP HEADLINES)*\n\n1. CBN expands cross-border settlement rails for regional trade.\n2. Non-oil exports rise 18% in Q3 commercial performance.\n3. Manufacturing PMI indicates steady industrial expansion.";
        if (ctx.newsChannel_id === "tech") return "🚀 *TECH & INNOVATION WIRE*\n\n1. Nigerian AI startups secure $45M seed investments.\n2. Telecom operators deploy expanded 5G fibre rings in state capitals.\n3. Local developer ecosystem hits 200,000 active builders.";
        if (ctx.newsChannel_id === "sub") return "🔔 *SUBSCRIPTION PREFERENCES*\n\n✅ Morning 8:00 AM Daily Brief: ACTIVE\n✅ Real-time Breaking Alerts: ACTIVE\n\n_Reply 'UNSUB' anytime to pause broadcasts._";
        return "📰 *TOP GENERAL HEADLINES*\n\n1. Federal Infrastructure Highway upgrades reach 75% completion.\n2. National energy grid records improved continuous uptime.\n3. Regional agricultural harvest yields outpace forecasts.";
      }, nextStep: "DONE" },
    ],
  },

  // ─────────────────────────────────────────────────────
  // 7. BUSINESS INTELLIGENCE
  // ─────────────────────────────────────────────────────

  {
    id: "business_reporting",
    name: "Business Reporting & Analytics",
    icon: "📈",
    category: "Business Intelligence",
    description: "Automated executive KPI dashboards, revenue summaries, order volumes, and expense trends.",
    steps: [
      { id: "ENTRY", type: "message", body: "📈 *Xtop Executive BI Reporting Demo*\nReceive automated performance metric snapshots on WhatsApp.", nextStep: "REPORT_MENU" },
      { id: "REPORT_MENU", type: "list", title: "Analytics", body: "Select report view:", options: [
        { id: "daily", label: "📊 Daily Sales Snapshot" },
        { id: "monthly", label: "📈 Monthly Revenue Breakdown" },
        { id: "inventory", label: "📦 SKU Velocity & Turnover" },
        { id: "cac", label: "🎯 Customer Acquisition Costs" },
      ], captureField: "reportType", nextStep: "REPORT_RESULT" },
      { id: "REPORT_RESULT", type: "message", body: (ctx) => {
        if (ctx.reportType_id === "daily") return "📊 *DAILY PERFORMANCE SNAPSHOT*\n\n• Gross Revenue: *₦842,500* (+14% vs yesterday)\n• Orders Completed: *38 Transactions*\n• Average Order Value (AOV): *₦22,170*\n• Top Product: Wireless Earbuds (14 units)\n• Failed Payments: 0";
        if (ctx.reportType_id === "monthly") return "📈 *MONTH-TO-DATE EXECUTIVE METRICS*\n\n• Total Revenue: *₦18,450,000*\n• Gross Margin: *34.2%*\n• Operating Overhead: *₦4,200,000*\n• Net Profit: *₦2,109,900*\n• Active Customer Base: *1,420*";
        if (ctx.reportType_id === "inventory") return "📦 *SKU VELOCITY & TURNOVER*\n\n• Fast Movers: Chargers (Turnover: 4.2 days)\n• Slow Movers: Heavy Laptop Stands (Turnover: 28 days)\n• Capital Locked in Stock: ₦3,400,000";
        return "🎯 *MARKETING & ACQUISITION METRICS*\n\n• Inbound Leads: 148\n• Conversion Rate: 24.3%\n• Cost Per Acquisition (CPA): ₦1,850\n• Customer Lifetime Value (LTV): ₦115,000";
      }, nextStep: "DONE" },
    ],
  },

  {
    id: "reminder_notification",
    name: "Reminder & Notification Engine",
    icon: "🔔",
    category: "Business Intelligence",
    description: "Automated customer nudges for debts, recurring renewals, deliveries, and bookings.",
    steps: [
      { id: "ENTRY", type: "message", body: "🔔 *Xtop Automated Nudge & Notification Demo*\nTrigger scheduled, multi-channel customer reminders.", nextStep: "NUDGE_MENU" },
      { id: "NUDGE_MENU", type: "list", title: "Reminders", body: "Select notification template:", options: [
        { id: "debt", label: "💵 Outstanding Debt Reminder" },
        { id: "sub", label: "🔄 Subscription Renewal Due" },
        { id: "booking", label: "📅 Service Appointment T-24h" },
        { id: "delivery", label: "🚚 Live Delivery Arrival Alert" },
      ], captureField: "nudgeType", nextStep: "NUDGE_RESULT" },
      { id: "NUDGE_RESULT", type: "message", body: (ctx) => {
        if (ctx.nudgeType_id === "debt") return "💵 *TEMPLATE: OUTSTANDING DEBT NUDGE*\n\n_\"Dear Customer, this is a friendly reminder that Invoice #INV-8821 for ₦45,000 was due on Sep 20. Tap here to settle securely via Paystack: https://paystack.demo/pay/8821\"_";
        if (ctx.nudgeType_id === "sub") return "🔄 *TEMPLATE: RENEWAL ALERT*\n\n_\"Hello! Your Annual Domain & Hosting plan renews in 3 days. Your card ending in 4102 will be charged ₦35,000 on Oct 1. Reply 'UPDATE' to change payment method.\"_";
        if (ctx.nudgeType_id === "booking") return "📅 *TEMPLATE: APPOINTMENT CONFIRMATION*\n\n_\"Reminder: Your consultation with Dr. Adeyemi is scheduled for tomorrow at 10:00 AM. Reply '1' to Confirm or '2' to Reschedule.\"_";
        return "🚚 *TEMPLATE: DISPATCH MILESTONE*\n\n_\"Your courier rider Musa is 5 minutes away with Parcel #XDL-9912. Please have your verification PIN: 4892 ready at the gate.\"_";
      }, nextStep: "DONE" },
    ],
  },

  // ─────────────────────────────────────────────────────
  // 8. CUSTOM AUTOMATION
  // ─────────────────────────────────────────────────────

  {
    id: "custom_automation",
    name: "Custom Business Automation",
    icon: "⚙️",
    category: "Custom Automation",
    description: "Design bespoke WhatsApp business engines tailored to your unique operational workflow.",
    steps: [
      { id: "ENTRY", type: "message", body: "⚙️ *Xtop Custom Architecture Engine*\nWe design and deploy tailored enterprise workflows.", nextStep: "CUSTOM_AREA" },
      { id: "CUSTOM_AREA", type: "list", title: "Target Area", body: "What workflow do you want to automate?", options: [
        { id: "sales", label: "💰 Sales, Orders & POS" },
        { id: "customers", label: "👥 Inbound CRM & Tickets" },
        { id: "payments", label: "💳 Automated Billing & Paystack" },
        { id: "bookings", label: "📅 Appointments & Schedules" },
        { id: "inventory", label: "📦 Warehousing & Stocks" },
        { id: "notifications", label: "🔔 Scheduled Push Reminders" },
        { id: "leads", label: "📝 Lead Generation Funnels" },
        { id: "other", label: "🔧 Bespoke Proprietary Flow" },
      ], captureField: "customArea", nextStep: "CUSTOM_DESC" },
      { id: "CUSTOM_DESC", type: "input", body: (ctx) => `📝 *Designing: ${ctx.customArea || "Bespoke"} Automation*\n\nDescribe your ideal workflow in a few sentences:\n_(e.g. "I want customers to send bank transfer receipts and have our database automatically verify and update their order status")_`, captureField: "customDesc", nextStep: "CUSTOM_DONE" },
      { id: "CUSTOM_DONE", type: "message", body: (ctx) => `✅ *Custom Architecture Blueprint Formulated!*\n\n⚙️ Functional Domain: ${ctx.customArea || "Bespoke"}\n📝 Specified Workflow: "${ctx.customDesc || "Custom Engine"}"\n\n🏗️ *Xtop Production Deliverables:*\n• Fully managed WhatsApp Edge Runtime\n• PostgreSQL database schema & API endpoints\n• Webhook payment integrations\n• Real-time operator dashboard\n\n💼 _Tap "Build This For My Business" below to speak with an engineer._`, nextStep: "DONE" },
    ],
  },
];

// ═══════════════════════════════════════════════════════
// EXPORTS & QUERY HELPERS
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
