
import { updateConversation } from "../database.ts";
import {
  sendTextMessage,
  sendImageMessage,
  sendListMessage,
  makeListRow,
  sendButtonMessage,
  makeButton,
} from "../whatsapp.ts";

type Product = {
  id: string;
  name: string;
  price: number;
  image: string;
  description: string;
  category: string;
  keywords: string[];
};

const CATEGORIES = [
  { id: "cat_fashion", name: "Fashion & Clothing", description: "Clothing and fashion items" },
  { id: "cat_bags", name: "Bags & Accessories", description: "Bags and everyday accessories" },
  { id: "cat_watches", name: "Watches", description: "Elegant watches and timepieces" },
  { id: "cat_shoes", name: "Shoes & Sneakers", description: "Footwear for every occasion" },
  { id: "cat_electronics", name: "Phones & Electronics", description: "Gadgets and electronic devices" },
  { id: "cat_home", name: "Home & Living", description: "Useful home products" },
];

const PRODUCTS: Product[] = [
  {
    id: "demo_shirt",
    name: "Classic Casual Shirt",
    price: 9500,
    image: "https://images.unsplash.com/photo-1603252109303-2751441dd157?w=800",
    description: "A smart casual shirt for everyday wear.",
    category: "cat_fashion",
    keywords: ["shirt", "clothing", "men", "casual", "top", "wear"],
  },
  {
    id: "demo_dress",
    name: "Elegant Fashion Dress",
    price: 16500,
    image: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800",
    description: "A stylish dress for special occasions.",
    category: "cat_fashion",
    keywords: ["dress", "gown", "women", "female", "fashion", "clothing"],
  },
  {
    id: "demo_bag",
    name: "Classic Leather Bag",
    price: 18500,
    image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800",
    description: "A stylish everyday handbag.",
    category: "cat_bags",
    keywords: ["bag", "handbag", "purse", "leather", "women", "black", "accessory"],
  },
  {
    id: "demo_backpack",
    name: "Urban Travel Backpack",
    price: 22000,
    image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800",
    description: "A practical backpack for work and travel.",
    category: "cat_bags",
    keywords: ["backpack", "school bag", "school", "travel", "laptop bag", "bag"],
  },
  {
    id: "demo_watch",
    name: "Classic Wristwatch",
    price: 12500,
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800",
    description: "A simple, elegant wristwatch.",
    category: "cat_watches",
    keywords: ["watch", "wristwatch", "timepiece", "men", "women", "classic"],
  },
  {
    id: "demo_smartwatch",
    name: "Modern Smartwatch",
    price: 28000,
    image: "https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=800",
    description: "A modern watch for your everyday lifestyle.",
    category: "cat_watches",
    keywords: ["smartwatch", "smart watch", "watch", "digital", "fitness", "gadget"],
  },
  {
    id: "demo_shoes",
    name: "Casual Sneakers",
    price: 22000,
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800",
    description: "Comfortable everyday sneakers.",
    category: "cat_shoes",
    keywords: ["shoe", "shoes", "sneaker", "sneakers", "sport", "sports", "red", "footwear"],
  },
  {
    id: "demo_formal_shoes",
    name: "Classic Formal Shoes",
    price: 26500,
    image: "https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?w=800",
    description: "Smart black footwear for formal occasions.",
    category: "cat_shoes",
    keywords: ["shoe", "shoes", "formal", "black", "office", "leather", "men", "footwear"],
  },
  {
    id: "demo_headphones",
    name: "Wireless Headphones",
    price: 19500,
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800",
    description: "Wireless audio for music and entertainment.",
    category: "cat_electronics",
    keywords: ["headphones", "headphone", "earphones", "audio", "music", "wireless"],
  },
  {
    id: "demo_phone",
    name: "Smartphone",
    price: 145000,
    image: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800",
    description: "A modern smartphone for everyday use.",
    category: "cat_electronics",
    keywords: ["phone", "smartphone", "mobile", "android", "samsung", "iphone", "electronics"],
  },
  {
    id: "demo_lamp",
    name: "Modern Table Lamp",
    price: 14500,
    image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800",
    description: "A stylish lamp for your living space.",
    category: "cat_home",
    keywords: ["lamp", "light", "lighting", "home", "bedroom", "table"],
  },
  {
    id: "demo_chair",
    name: "Modern Home Chair",
    price: 42000,
    image: "https://images.unsplash.com/photo-1503602642458-232111445657?w=800",
    description: "A comfortable chair for your home.",
    category: "cat_home",
    keywords: ["chair", "furniture", "seat", "home", "living room"],
  },
];

const DEMO_DELIVERY_FEE = 1500;
const PAGE_SIZE = 6;

type CartItem = {
  productId: string;
  quantity: number;
};

type DemoContext = {
  sabi_shop_demo?: boolean;
  cart?: CartItem[];
  selectedProduct?: string;
  selectedCategory?: string;
  customerName?: string;
  deliveryAddress?: string;
  demoOrderNumber?: string;
  demoOrderStatus?: string;
  searchQuery?: string;
  searchResults?: string[];
  searchPage?: number;
  productPage?: number;
  paymentMethod?: "PAY_ON_DELIVERY" | "PAY_NOW";
  paymentStatus?: string;
  deliveryFeePaid?: number;
  productBalanceDue?: number;
};

function money(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
}

function getProduct(id: string) {
  return PRODUCTS.find((product) => product.id === id);
}

function getCategory(id: string) {
  return CATEGORIES.find((category) => category.id === id);
}

function getCategoryProducts(categoryId: string) {
  return PRODUCTS.filter((product) => product.category === categoryId);
}

function getTotal(cart: CartItem[]): number {
  return cart.reduce((total, item) => {
    const product = getProduct(item.productId);
    return total + (product?.price || 0) * item.quantity;
  }, 0);
}

function getCartLines(cart: CartItem[]): string {
  return cart.map((item) => {
    const product = getProduct(item.productId);
    if (!product) return "";
    return `${product.name} × ${item.quantity} — ${money(product.price * item.quantity)}`;
  }).filter(Boolean).join("\n");
}

async function saveDemoState(
  conversationId: string,
  state: string,
  context: DemoContext,
): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "SABI_SHOP_DEMO",
    current_state: state,
    context_json: {
      sabi_shop_demo: true,
      ...context,
    },
  });
}

function extractPriceLimit(query: string): {
  maximum?: number;
  minimum?: number;
} {
  const cleaned = query.toLowerCase().replace(/,/g, "");
  const match = cleaned.match(
    /(?:under|below|less than|up to|maximum|max|within|above|over|more than|at least)\s*₦?\s*(\d+(?:\.\d+)?)\s*(k)?/,
  );

  if (!match) return {};

  let amount = Number(match[1]);
  if (match[2]) amount *= 1000;

  if (!Number.isFinite(amount)) return {};

  if (/above|over|more than|at least/.test(cleaned)) {
    return { minimum: amount };
  }

  return { maximum: amount };
}

function searchProducts(query: string): Product[] {
  const cleaned = query
    .toLowerCase()
    .replace(/[₦,]/g, "")
    .replace(/[?!.,]/g, " ")
    .trim();

  const price = extractPriceLimit(query);

  const stopWords = new Set([
    "i", "want", "need", "a", "an", "the", "please",
    "show", "me", "do", "you", "have", "any", "some",
    "find", "get", "buy", "looking", "for", "can",
    "could", "give", "available", "product", "products",
    "under", "below", "less", "than", "up", "to",
    "maximum", "max", "within", "above", "over",
    "more", "at", "least", "₦",
  ]);

  const terms = cleaned
    .split(/\s+/)
    .filter((word) => word.length > 1 && !stopWords.has(word) && !/^\d+$/.test(word));

  const matches = PRODUCTS.map((product) => {
    const category = getCategory(product.category);

    const searchable = [
      product.name,
      product.description,
      ...(product.keywords || []),
      category?.name || "",
    ].join(" ").toLowerCase();

    let score = 0;

    for (const term of terms) {
      if (product.name.toLowerCase().includes(term)) score += 5;
      else if ((product.keywords || []).some((word) => word.includes(term) || term.includes(word))) score += 4;
      else if (searchable.includes(term)) score += 2;
    }

    if (price.maximum !== undefined && product.price > price.maximum) {
      score = 0;
    }

    if (price.minimum !== undefined && product.price < price.minimum) {
      score = 0;
    }

    return { product, score };
  });

  // If the customer only entered a price filter, return products
  // that satisfy that price instead of returning no results.
  if (terms.length === 0 && (price.maximum !== undefined || price.minimum !== undefined)) {
    return PRODUCTS.filter((product) => {
      if (price.maximum !== undefined && product.price > price.maximum) return false;
      if (price.minimum !== undefined && product.price < price.minimum) return false;
      return true;
    }).sort((a, b) => a.price - b.price);
  }

  return matches
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.product.price - b.product.price)
    .map((item) => item.product);
}

async function showProducts(
  phone: string,
  context: DemoContext = {},
): Promise<void> {
  await sendTextMessage(
    phone,
    "🛍️ *Welcome to the Sabi Demo Shop!*\n\nExplore sample products, search by typing what you want, place a demo order, track an order or see how Sabi transfers a conversation to a human agent.\n\nYou can type something like:\n• I want a black shoe\n• Show me a wristwatch\n• Bags under 20k\n• I need a smartphone",
  );

  await sendListMessage(
    phone,
    "What would you like to do?",
    "Explore Sabi Shop",
    [
      {
        title: "Shop by Category",
        rows: CATEGORIES.map((category) =>
          makeListRow(category.id, category.name, category.description)
        ),
      },
      {
        title: "Shopping & Customer Service",
        rows: [
          makeListRow("demo_cart", "🛒 View My Cart"),
          makeListRow("demo_track_order", "📦 Track My Order"),
          makeListRow("demo_agent", "👨‍💼 Speak to an Agent"),
          makeListRow("demo_exit", "🏠 Return to Sabi Home"),
        ],
      },
    ],
    "Sabi Demo Shop",
    "You can also type a product name to search",
  );
}

async function showCategory(
  phone: string,
  conversationId: string,
  categoryId: string,
  context: DemoContext,
  page = 0,
): Promise<void> {
  const category = getCategory(categoryId);

  if (!category) {
    await sendTextMessage(phone, "That category was not found.");
    await showProducts(phone, context);
    return;
  }

  const allProducts = getCategoryProducts(categoryId);
  const totalPages = Math.max(1, Math.ceil(allProducts.length / PAGE_SIZE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const products = allProducts.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE,
  );

  await saveDemoState(conversationId, "CATEGORY_SELECTED", {
    ...context,
    selectedCategory: categoryId,
    productPage: safePage,
  });

  await sendTextMessage(
    phone,
    `🛍️ *${category.name}*\n\nPage ${safePage + 1} of ${totalPages}\n\nSelect a product to see its details. You can also type a product description to search.`,
  );

  const rows = products.map((product) =>
    makeListRow(product.id, product.name, money(product.price))
  );

  if (safePage > 0) {
    rows.push(makeListRow("demo_category_prev", "⬅️ Previous Products"));
  }

  if (safePage < totalPages - 1) {
    rows.push(makeListRow("demo_category_next", "Next Products ➡️"));
  }

  rows.push(makeListRow("demo_categories", "Browse Categories"));
  rows.push(makeListRow("demo_cart", "View My Cart"));

  await sendListMessage(
    phone,
    "Select a product or choose another option.",
    "View Products",
    [{ title: category.name, rows }],
    "Sabi Demo Shop",
    "Select a product to view its details",
  );
}

async function showSearchResults(
  phone: string,
  conversationId: string,
  context: DemoContext,
  page = 0,
): Promise<void> {
  const ids = context.searchResults || [];
  const totalPages = Math.max(1, Math.ceil(ids.length / PAGE_SIZE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));

  const products = ids
    .slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
    .map(getProduct)
    .filter((product): product is Product => Boolean(product));

  await saveDemoState(conversationId, "SEARCH_RESULTS", {
    ...context,
    searchPage: safePage,
  });

  await sendTextMessage(
    phone,
    `🔎 *Search Results*\n\nYou searched for: *${context.searchQuery || ""}*\n\nFound ${ids.length} matching product(s).\nPage ${safePage + 1} of ${totalPages}.\n\nYou can type another product description to search again.`,
  );

  const rows = products.map((product) =>
    makeListRow(product.id, product.name, money(product.price))
  );

  if (safePage > 0) {
    rows.push(makeListRow("demo_search_prev", "⬅️ Previous Results"));
  }

  if (safePage < totalPages - 1) {
    rows.push(makeListRow("demo_search_next", "Next Results ➡️"));
  }

  rows.push(makeListRow("demo_categories", "Browse Categories"));
  rows.push(makeListRow("demo_cart", "View My Cart"));

  await sendListMessage(
    phone,
    "Select a product to view its details.",
    "Search Results",
    [{ title: "Matching Products", rows }],
    "Sabi Demo Shop",
    "Search results",
  );
}

async function runProductSearch(
  phone: string,
  conversationId: string,
  query: string,
  context: DemoContext,
): Promise<void> {
  const results = searchProducts(query);

  if (!results.length) {
    await saveDemoState(conversationId, "SHOPPING", {
      ...context,
      searchQuery: query,
      searchResults: [],
      searchPage: 0,
    });

    await sendTextMessage(
      phone,
      `I couldn't find a matching sample product for *${query}*.\n\nTry another description, product name or category.\n\nExamples:\n• black shoe\n• wristwatch\n• backpack\n• smartphone\n• home chair`,
    );

    await sendButtonMessage(
      phone,
      "Would you like to try again?",
      [
        makeButton("demo_search_again", "Search Again"),
        makeButton("demo_categories", "Browse Categories"),
        makeButton("demo_cart", "View Cart"),
      ],
      "No Matching Products",
      "Sabi Demo Shop",
    );

    return;
  }

  const nextContext: DemoContext = {
    ...context,
    searchQuery: query,
    searchResults: results.map((product) => product.id),
    searchPage: 0,
  };

  await showSearchResults(phone, conversationId, nextContext, 0);
}

async function showProduct(
  phone: string,
  conversationId: string,
  productId: string,
  context: DemoContext,
): Promise<void> {
  const product = getProduct(productId);

  if (!product) {
    await sendTextMessage(phone, "That product was not found.");
    await showProducts(phone, context);
    return;
  }

  await saveDemoState(conversationId, "PRODUCT_SELECTED", {
    ...context,
    selectedProduct: productId,
    selectedCategory: product.category,
  });

  await sendImageMessage(
    phone,
    product.image,
    `*${product.name}*\n${product.description}\n\nCategory: ${getCategory(product.category)?.name}\nPrice: ${money(product.price)}`,
  );

  await sendButtonMessage(
    phone,
    "Would you like to add this product to your demo cart?",
    [
      makeButton("demo_add_one", "Add to Cart"),
      makeButton("demo_products", "Keep Shopping"),
      makeButton("demo_cart", "View Cart"),
    ],
    "Product Details",
    "Sabi Demo Shop",
  );
}

async function showCart(
  phone: string,
  conversationId: string,
  context: DemoContext,
): Promise<void> {
  const cart = context.cart || [];

  if (!cart.length) {
    await saveDemoState(conversationId, "SHOPPING", context);
    await sendTextMessage(phone, "🛒 Your demo cart is empty.");
    await showProducts(phone, context);
    return;
  }

  const subtotal = getTotal(cart);
  const total = subtotal + DEMO_DELIVERY_FEE;

  await saveDemoState(conversationId, "CART", context);

  await sendTextMessage(
    phone,
    `🛒 *Your Demo Cart*\n\n${getCartLines(cart)}\n\n` +
    `Product subtotal: ${money(subtotal)}\n` +
    `Sample delivery fee: ${money(DEMO_DELIVERY_FEE)}\n` +
    `*Estimated order total: ${money(total)}*`,
  );

  await sendButtonMessage(
    phone,
    "What would you like to do next?",
    [
      makeButton("demo_products", "Add More"),
      makeButton("demo_checkout", "Checkout"),
      makeButton("demo_empty_cart", "Clear Cart"),
    ],
    "Shopping Cart",
    "No real payment will be made",
  );
}

async function askForCustomerName(
  phone: string,
  conversationId: string,
  context: DemoContext,
): Promise<void> {
  await saveDemoState(conversationId, "WAITING_CUSTOMER_NAME", context);
  await sendTextMessage(
    phone,
    "📦 *Demo Checkout*\n\nPlease enter your full name for this sample order.",
  );
}

async function askForDeliveryAddress(
  phone: string,
  conversationId: string,
  context: DemoContext,
): Promise<void> {
  await saveDemoState(conversationId, "WAITING_DELIVERY_ADDRESS", context);
  await sendTextMessage(
    phone,
    `Thank you, *${context.customerName}*.\n\nPlease enter a sample delivery address, including the area and city.`,
  );
}

async function showCheckoutSummary(
  phone: string,
  conversationId: string,
  context: DemoContext,
): Promise<void> {
  const subtotal = getTotal(context.cart || []);
  const total = subtotal + DEMO_DELIVERY_FEE;

  await saveDemoState(conversationId, "WAITING_DEMO_PAYMENT", {
    ...context,
    paymentMethod: undefined,
    paymentStatus: undefined,
    deliveryFeePaid: 0,
    productBalanceDue: subtotal,
  });

  await sendTextMessage(
    phone,
    `🧾 *Demo Order Summary*\n\n` +
    `Customer: ${context.customerName}\n` +
    `Delivery address: ${context.deliveryAddress}\n\n` +
    `${getCartLines(context.cart || [])}\n\n` +
    `Product subtotal: ${money(subtotal)}\n` +
    `Delivery fee: ${money(DEMO_DELIVERY_FEE)}\n` +
    `*Total order value: ${money(total)}*\n\n` +
    `💡 *Choose how you want to pay:*\n\n` +
    `*Pay on Delivery:* Pay the delivery fee of ${money(DEMO_DELIVERY_FEE)} now. Pay the product balance of ${money(subtotal)} when your order arrives.\n\n` +
    `*Pay Now:* Pay the full ${money(total)} before delivery.\n\n` +
    `This is a demonstration. No real payment will be collected.`,
  );

  await sendButtonMessage(
    phone,
    "Select your preferred payment method.",
    [
      makeButton("demo_pay_on_delivery", "Pay on Delivery"),
      makeButton("demo_pay_now", "Pay Now"),
      makeButton("demo_cart", "View Cart"),
    ],
    "Choose Payment Method",
    "Sabi Demo Checkout",
  );
}

async function confirmDemoPayment(
  phone: string,
  conversationId: string,
  context: DemoContext,
  paymentMethod: "PAY_ON_DELIVERY" | "PAY_NOW",
): Promise<void> {
  const subtotal = getTotal(context.cart || []);
  const total = subtotal + DEMO_DELIVERY_FEE;

  const deliveryFeePaid =
    paymentMethod === "PAY_ON_DELIVERY"
      ? DEMO_DELIVERY_FEE
      : total;

  const productBalanceDue =
    paymentMethod === "PAY_ON_DELIVERY"
      ? subtotal
      : 0;

  const orderNumber = `SABI-DEMO-${Date.now().toString().slice(-6)}`;

  const paymentStatus =
    paymentMethod === "PAY_ON_DELIVERY"
      ? "DELIVERY_FEE_PAID_PRODUCT_BALANCE_DUE"
      : "PAID_IN_FULL";

  const nextContext: DemoContext = {
    ...context,
    demoOrderNumber: orderNumber,
    demoOrderStatus: "CONFIRMED",
    paymentMethod,
    paymentStatus,
    deliveryFeePaid,
    productBalanceDue,
  };

  await saveDemoState(
    conversationId,
    "DEMO_ORDER_PLACED",
    nextContext,
  );

  const paymentDetails =
    paymentMethod === "PAY_ON_DELIVERY"
      ? `Payment method: *Pay on Delivery*\n\n` +
        `✅ Delivery fee paid upfront: ${money(DEMO_DELIVERY_FEE)}\n` +
        `🟡 Product balance due on delivery: ${money(subtotal)}\n` +
        `Total order value: ${money(total)}`
      : `Payment method: *Pay Now*\n\n` +
        `✅ Full payment received: ${money(total)}\n` +
        `Product balance due: ${money(0)}`;

  await sendTextMessage(
    phone,
    `🎉 *Demo Order Confirmed!*\n\n` +
    `Order number: *${orderNumber}*\n` +
    `Customer: ${context.customerName}\n\n` +
    `${paymentDetails}\n\n` +
    `📦 Your sample order has been received.\n\n` +
    `This is a demonstration order. No real payment or delivery has been created.`,
  );

  await sendButtonMessage(
    phone,
    "What would you like to do next?",
    [
      makeButton("demo_track_order", "Track Order"),
      makeButton("demo_agent", "Speak to an Agent"),
      makeButton("demo_new_order", "New Order"),
    ],
    "Order Confirmation",
    orderNumber,
  );
}

async function askForTrackingNumber(
  phone: string,
  conversationId: string,
  context: DemoContext,
): Promise<void> {
  await saveDemoState(conversationId, "WAITING_TRACKING_NUMBER", context);

  if (!context.demoOrderNumber) {
    await sendTextMessage(
      phone,
      "📦 *Track Your Demo Order*\n\nYou have not placed a sample order yet.\n\nPlease browse the products, complete a demo checkout and then return here to track your order.",
    );

    await sendButtonMessage(
      phone,
      "Would you like to start a sample order?",
      [
        makeButton("demo_products", "Browse Products"),
        makeButton("demo_agent", "Speak to an Agent"),
        makeButton("demo_exit", "Exit Demo"),
      ],
      "Sabi Demo Tracking",
      "Sample tracking only",
    );
    return;
  }

  await sendTextMessage(
    phone,
    `📦 *Track My Order*\n\nPlease enter your demo order number.\n\nYour sample order number is:\n*${context.demoOrderNumber}*\n\nEnter that number to view its tracking progress.`,
  );
}

async function trackDemoOrder(
  phone: string,
  context: DemoContext,
): Promise<void> {
  const isPOD = context.paymentMethod === "PAY_ON_DELIVERY";

  const paymentProgress = isPOD
    ? `✅ Delivery fee paid upfront: ${money(context.deliveryFeePaid || 0)}\n` +
      `🟡 Product balance due on delivery: ${money(context.productBalanceDue || 0)}`
    : `✅ Full payment confirmed: ${money(context.deliveryFeePaid || 0)}`;

  await sendTextMessage(
    phone,
    `📍 *Demo Order Tracking*\n\n` +
    `Order: *${context.demoOrderNumber}*\n` +
    `Customer: ${context.customerName || "Demo Customer"}\n\n` +
    `✅ Order received\n` +
    `${paymentProgress}\n` +
    `🟡 Order being prepared\n` +
    `⚪ Out for delivery\n` +
    `⚪ Delivered\n\n` +
    `This is sample tracking information. No real delivery has been created.`,
  );

  await sendButtonMessage(
    phone,
    "What would you like to do next?",
    [
      makeButton("demo_products", "Continue Shopping"),
      makeButton("demo_agent", "Speak to an Agent"),
      makeButton("demo_exit", "Exit Demo"),
    ],
    "Demo Tracking",
    "Sabi by XTOP",
  );
}

async function showAgentHandoffDemo(
  phone: string,
  conversationId: string,
  context: DemoContext,
): Promise<void> {
  await saveDemoState(conversationId, "AGENT_HANDOFF_DEMO", context);

  await sendTextMessage(
    phone,
    "👨‍💼 *Sabi Human Agent Handoff Demonstration*\n\nYou selected Speak to an Agent.\n\nThis sample shows how Sabi can transfer a customer conversation from the AI assistant to a human support agent.",
  );

  await sendTextMessage(
    phone,
    "🤖 *Sabi AI Assistant:*\n\nI understand you would like to speak with a human support agent. I will now hand over this sample conversation.",
  );

  await sendTextMessage(
    phone,
    "⏸️ *AI assistant paused*\n\nIn a real merchant setup, the automated assistant can pause while an authorised human agent handles the conversation.",
  );

  await sendTextMessage(
    phone,
    "👨‍💼 *Sample Human Agent:*\n\nHello! Welcome to our store. My name is Daniel, and I will be assisting you today. How may I help you?",
  );

  await sendTextMessage(
    phone,
    "👤 *Sample Customer:*\n\nI would like to know when my order will be delivered.",
  );

  await sendTextMessage(
    phone,
    "👨‍💼 *Sample Human Agent:*\n\nThank you for contacting us. I have checked your sample order. It is currently being prepared. We appreciate your patience!",
  );

  await sendTextMessage(
    phone,
    "🤖 *Sabi Handoff Demonstration Complete*\n\nThe conversation has been handled by the sample human agent.\n\nIn the real Sabi system, an authorised merchant or staff member can take over customer conversations and return them to the AI assistant when finished.\n\n*This demonstration does not contact a real agent or change your actual WhatsApp handoff settings.*",
  );

  await sendButtonMessage(
    phone,
    "Would you like to return to the Sabi AI shopping assistant?",
    [
      makeButton("demo_agent_return", "Return to Sabi AI"),
      makeButton("demo_products", "Browse Products"),
      makeButton("demo_exit", "Exit Demo"),
    ],
    "Sample Agent Handoff",
    "Simulation only — no real agent connected",
  );
}

export async function startSabiShopDemo(
  phone: string,
  conversationId: string,
): Promise<void> {
  const context: DemoContext = {
    cart: [],
    sabi_shop_demo: true,
  };

  await saveDemoState(conversationId, "SHOPPING", context);
  await showProducts(phone, context);
}

export async function handleSabiShopDemo(
  phone: string,
  text: string,
  conversationId: string,
  currentState: string,
  savedContext?: Record<string, unknown> | null,
): Promise<boolean> {
  const action = text.trim().toLowerCase();
  const context = (savedContext || {}) as DemoContext;
  const cart = context.cart || [];

  if (
    action === "demo_exit" ||
    action === "exit demo" ||
    action === "sabi_home"
  ) {
    await updateConversation(conversationId, {
      current_module: "SABI_GATEWAY",
      current_state: "SHOWING_WELCOME",
      context_json: { sabi_gateway: true },
    });

    await sendTextMessage(
      phone,
      "You have left the shop demo. Type *Hi* to return to the Sabi welcome menu.",
    );
    return true;
  }

  if (
    action === "demo_agent" ||
    action === "speak to an agent" ||
    action === "talk to an agent"
  ) {
    await showAgentHandoffDemo(phone, conversationId, context);
    return true;
  }

  if (
    action === "demo_agent_return" ||
    action === "return to sabi ai"
  ) {
    await saveDemoState(conversationId, "SHOPPING", context);
    await sendTextMessage(
      phone,
      "🤖 *Welcome back to Sabi AI!*\n\nThe sample human agent has finished the demonstration. Sabi's automated shopping assistant is ready to help you again.",
    );
    await showProducts(phone, context);
    return true;
  }

  if (
    action === "demo_new_order" ||
    action === "new order"
  ) {
    await startSabiShopDemo(phone, conversationId);
    return true;
  }

  if (
    action === "demo_search_help" ||
    action === "demo_search_again" ||
    action === "search products"
  ) {
    await saveDemoState(conversationId, "WAITING_PRODUCT_SEARCH", context);
    await sendTextMessage(
      phone,
      "🔎 *Search the Demo Shop*\n\nType the product you are looking for.\n\nExamples:\n• Black shoe\n• Wristwatch\n• Backpack\n• Smartphone under 100k",
    );
    return true;
  }

  if (action === "demo_search_next" || action === "demo_search_prev") {
    const page = context.searchPage || 0;
    const nextPage = action === "demo_search_next" ? page + 1 : page - 1;
    await showSearchResults(phone, conversationId, context, nextPage);
    return true;
  }

  if (action === "demo_category_next" || action === "demo_category_prev") {
    const page = context.productPage || 0;
    const nextPage = action === "demo_category_next" ? page + 1 : page - 1;

    if (context.selectedCategory) {
      await showCategory(
        phone,
        conversationId,
        context.selectedCategory,
        context,
        nextPage,
      );
    } else {
      await showProducts(phone, context);
    }
    return true;
  }

  if (
    action === "demo_categories" ||
    action === "demo_products" ||
    action === "shop" ||
    action === "continue shopping"
  ) {
    await saveDemoState(conversationId, "SHOPPING", context);
    await showProducts(phone, context);
    return true;
  }

  if (
    action === "demo_track_order" ||
    action === "track my order" ||
    action === "track order"
  ) {
    await askForTrackingNumber(phone, conversationId, context);
    return true;
  }

  // Customer selects Pay on Delivery or Pay Now.
  if (
    action === "demo_pay_on_delivery" ||
    action === "demo_pay_now"
  ) {
    if (currentState !== "WAITING_DEMO_PAYMENT") {
      await sendTextMessage(
        phone,
        "There is no pending demo checkout. Please start a new sample order.",
      );
      return true;
    }

    const subtotal = getTotal(cart);

    if (!cart.length) {
      await sendTextMessage(
        phone,
        "Your cart is empty. Please select a product first.",
      );
      return true;
    }

    if (action === "demo_pay_on_delivery") {
      await saveDemoState(
        conversationId,
        "WAITING_DELIVERY_FEE_PAYMENT",
        {
          ...context,
          paymentMethod: "PAY_ON_DELIVERY",
          paymentStatus: "DELIVERY_FEE_PENDING",
          deliveryFeePaid: 0,
          productBalanceDue: subtotal,
        },
      );

      await sendTextMessage(
        phone,
        `🚚 *Pay on Delivery Selected*\n\n` +
        `Your product subtotal is ${money(subtotal)}.\n` +
        `To confirm your order, you must pay the delivery fee upfront.\n\n` +
        `*Delivery fee to pay now: ${money(DEMO_DELIVERY_FEE)}*\n` +
        `Product balance to pay when delivered: ${money(subtotal)}\n\n` +
        `Your order will only be confirmed after the delivery fee payment is successful.`,
      );

      await sendButtonMessage(
        phone,
        `Simulate payment of ${money(DEMO_DELIVERY_FEE)} for delivery.`,
        [
          makeButton("demo_pay_delivery_fee", "Pay Delivery Fee"),
          makeButton("demo_cart", "View Cart"),
          makeButton("demo_exit", "Exit Demo"),
        ],
        "Delivery Fee Payment",
        "Demo payment only",
      );

      return true;
    }

    await saveDemoState(
      conversationId,
      "WAITING_FULL_PAYMENT",
      {
        ...context,
        paymentMethod: "PAY_NOW",
        paymentStatus: "FULL_PAYMENT_PENDING",
        deliveryFeePaid: 0,
        productBalanceDue: 0,
      },
    );

    await sendTextMessage(
      phone,
      `💳 *Pay Now Selected*\n\n` +
      `Product subtotal: ${money(subtotal)}\n` +
      `Delivery fee: ${money(DEMO_DELIVERY_FEE)}\n` +
      `*Full amount to pay: ${money(subtotal + DEMO_DELIVERY_FEE)}*`,
    );

    await sendButtonMessage(
      phone,
      `Simulate full payment of ${money(subtotal + DEMO_DELIVERY_FEE)}.`,
      [
        makeButton("demo_pay_full", "Pay Full Amount"),
        makeButton("demo_cart", "View Cart"),
        makeButton("demo_exit", "Exit Demo"),
      ],
      "Full Payment",
      "Demo payment only",
    );

    return true;
  }

  // Simulate payment of the delivery fee for Pay on Delivery.
  if (action === "demo_pay_delivery_fee") {
    if (
      currentState !== "WAITING_DELIVERY_FEE_PAYMENT" ||
      context.paymentMethod !== "PAY_ON_DELIVERY"
    ) {
      await sendTextMessage(
        phone,
        "There is no pending delivery fee payment. Please complete checkout again.",
      );
      return true;
    }

    await confirmDemoPayment(
      phone,
      conversationId,
      context,
      "PAY_ON_DELIVERY",
    );

    return true;
  }

  // Simulate payment of the full order amount.
  if (
    action === "demo_pay_full" ||
    action === "demo_confirm_payment"
  ) {
    if (
      currentState !== "WAITING_FULL_PAYMENT" ||
      context.paymentMethod !== "PAY_NOW"
    ) {
      await sendTextMessage(
        phone,
        "There is no pending full payment. Please complete checkout again.",
      );
      return true;
    }

    await confirmDemoPayment(
      phone,
      conversationId,
      context,
      "PAY_NOW",
    );

    return true;
  }

  if (action === "demo_cart" || action === "cart") {
    await showCart(phone, conversationId, context);
    return true;
  }

  if (action === "demo_empty_cart") {
    const nextContext: DemoContext = {
      ...context,
      cart: [],
      paymentMethod: undefined,
      paymentStatus: undefined,
      deliveryFeePaid: undefined,
      productBalanceDue: undefined,
    };

    await saveDemoState(conversationId, "SHOPPING", nextContext);
    await sendTextMessage(phone, "Your demo cart has been cleared.");
    await showProducts(phone, nextContext);
    return true;
  }

  if (action === "demo_checkout" || action === "checkout") {
    if (!cart.length) {
      await sendTextMessage(
        phone,
        "Your cart is empty. Please select a product first.",
      );
      await showProducts(phone, context);
      return true;
    }

    await askForCustomerName(phone, conversationId, context);
    return true;
  }

  const selectedCategory = getCategory(action);

  if (selectedCategory) {
    await showCategory(
      phone,
      conversationId,
      selectedCategory.id,
      context,
    );
    return true;
  }

  const selectedProduct = PRODUCTS.find(
    (product) => product.id === action,
  );

  if (selectedProduct) {
    await showProduct(
      phone,
      conversationId,
      selectedProduct.id,
      context,
    );
    return true;
  }

  if (action === "demo_add_one") {
    const product = getProduct(context.selectedProduct || "");

    if (!product) {
      await showProducts(phone, context);
      return true;
    }

    const updatedCart = [...cart];
    const existing = updatedCart.find(
      (item) => item.productId === product.id,
    );

    if (existing) {
      existing.quantity += 1;
    } else {
      updatedCart.push({
        productId: product.id,
        quantity: 1,
      });
    }

    const nextContext: DemoContext = {
      ...context,
      cart: updatedCart,
    };

    await sendTextMessage(
      phone,
      `✅ ${product.name} added to your cart.`,
    );

    await showCart(phone, conversationId, nextContext);
    return true;
  }

  if (currentState === "WAITING_TRACKING_NUMBER") {
    const enteredNumber = text.trim().toUpperCase();
    const savedNumber = (context.demoOrderNumber || "").toUpperCase();

    if (!savedNumber) {
      await sendTextMessage(
        phone,
        "You do not have a sample order to track yet. Please place a demo order first.",
      );
      await showProducts(phone, context);
      return true;
    }

    if (enteredNumber !== savedNumber) {
      await sendTextMessage(
        phone,
        "I could not find that sample order number.\n\nPlease enter the demo order number shown in your order confirmation.",
      );
      return true;
    }

    await saveDemoState(
      conversationId,
      "DEMO_ORDER_PLACED",
      context,
    );

    await trackDemoOrder(phone, context);
    return true;
  }

  if (currentState === "WAITING_CUSTOMER_NAME") {
    if (text.trim().length < 2) {
      await sendTextMessage(
        phone,
        "Please enter a valid customer name.",
      );
      return true;
    }

    await askForDeliveryAddress(
      phone,
      conversationId,
      {
        ...context,
        customerName: text.trim(),
      },
    );
    return true;
  }

  if (currentState === "WAITING_DELIVERY_ADDRESS") {
    if (text.trim().length < 5) {
      await sendTextMessage(
        phone,
        "Please enter a more complete sample delivery address.",
      );
      return true;
    }

    await showCheckoutSummary(
      phone,
      conversationId,
      {
        ...context,
        deliveryAddress: text.trim(),
      },
    );
    return true;
  }

  if (
    currentState === "WAITING_DEMO_PAYMENT" ||
    currentState === "WAITING_DELIVERY_FEE_PAYMENT" ||
    currentState === "WAITING_FULL_PAYMENT"
  ) {
    await sendTextMessage(
      phone,
      "Please select one of the payment buttons shown to complete your demo checkout.",
    );
    return true;
  }

  if (currentState === "AGENT_HANDOFF_DEMO") {
    await sendTextMessage(
      phone,
      "The sample human agent is handling this demonstration. Select *Return to Sabi AI* to continue with the automated assistant.",
    );

    await sendButtonMessage(
      phone,
      "Would you like to return to Sabi AI?",
      [
        makeButton("demo_agent_return", "Return to Sabi AI"),
        makeButton("demo_exit", "Exit Demo"),
      ],
      "Sample Agent Handoff",
      "No real agent is connected",
    );
    return true;
  }

  if (currentState === "DEMO_ORDER_PLACED") {
    await sendButtonMessage(
      phone,
      "Your sample order has already been confirmed. You can track it, speak to a sample agent or start another demo order.",
      [
        makeButton("demo_track_order", "Track Order"),
        makeButton("demo_agent", "Speak to an Agent"),
        makeButton("demo_new_order", "New Order"),
      ],
      "Demo Order",
      context.demoOrderNumber || "Sabi Demo",
    );
    return true;
  }

  if (currentState === "WAITING_PRODUCT_SEARCH") {
    await runProductSearch(
      phone,
      conversationId,
      text,
      context,
    );
    return true;
  }

  // Ordinary customer messages become product searches while in the demo.
  if (
    currentState === "SHOPPING" ||
    currentState === "CATEGORY_SELECTED" ||
    currentState === "SEARCH_RESULTS" ||
    currentState === "PRODUCT_SELECTED" ||
    currentState === "CART"
  ) {
    if (text.trim().length >= 2) {
      await runProductSearch(
        phone,
        conversationId,
        text,
        context,
      );
      return true;
    }
  }

  return false;
}
