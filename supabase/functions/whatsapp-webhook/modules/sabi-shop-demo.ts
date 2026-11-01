
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
};

const CATEGORIES = [
  {
    id: "cat_fashion",
    name: "Fashion & Clothing",
    description: "Clothing and fashion items",
  },
  {
    id: "cat_bags",
    name: "Bags & Accessories",
    description: "Bags and everyday accessories",
  },
  {
    id: "cat_watches",
    name: "Watches",
    description: "Elegant watches and timepieces",
  },
  {
    id: "cat_shoes",
    name: "Shoes & Sneakers",
    description: "Footwear for every occasion",
  },
  {
    id: "cat_electronics",
    name: "Phones & Electronics",
    description: "Gadgets and electronic devices",
  },
  {
    id: "cat_home",
    name: "Home & Living",
    description: "Useful home products",
  },
];

const PRODUCTS: Product[] = [
  {
    id: "demo_shirt",
    name: "Classic Casual Shirt",
    price: 9500,
    image: "https://images.unsplash.com/photo-1603252109303-2751441dd157?w=800",
    description: "A smart casual shirt for everyday wear.",
    category: "cat_fashion",
  },
  {
    id: "demo_dress",
    name: "Elegant Fashion Dress",
    price: 16500,
    image: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800",
    description: "A stylish dress for special occasions.",
    category: "cat_fashion",
  },
  {
    id: "demo_bag",
    name: "Classic Leather Bag",
    price: 18500,
    image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800",
    description: "A stylish everyday handbag.",
    category: "cat_bags",
  },
  {
    id: "demo_backpack",
    name: "Urban Travel Backpack",
    price: 22000,
    image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800",
    description: "A practical backpack for work and travel.",
    category: "cat_bags",
  },
  {
    id: "demo_watch",
    name: "Classic Wristwatch",
    price: 12500,
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800",
    description: "A simple, elegant wristwatch.",
    category: "cat_watches",
  },
  {
    id: "demo_smartwatch",
    name: "Modern Smartwatch",
    price: 28000,
    image: "https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=800",
    description: "A modern watch for your everyday lifestyle.",
    category: "cat_watches",
  },
  {
    id: "demo_shoes",
    name: "Casual Sneakers",
    price: 22000,
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800",
    description: "Comfortable everyday sneakers.",
    category: "cat_shoes",
  },
  {
    id: "demo_formal_shoes",
    name: "Classic Formal Shoes",
    price: 26500,
    image: "https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?w=800",
    description: "Smart footwear for formal occasions.",
    category: "cat_shoes",
  },
  {
    id: "demo_headphones",
    name: "Wireless Headphones",
    price: 19500,
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800",
    description: "Wireless audio for music and entertainment.",
    category: "cat_electronics",
  },
  {
    id: "demo_phone",
    name: "Smartphone",
    price: 145000,
    image: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800",
    description: "A modern smartphone for everyday use.",
    category: "cat_electronics",
  },
  {
    id: "demo_lamp",
    name: "Modern Table Lamp",
    price: 14500,
    image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800",
    description: "A stylish lamp for your living space.",
    category: "cat_home",
  },
  {
    id: "demo_chair",
    name: "Modern Home Chair",
    price: 42000,
    image: "https://images.unsplash.com/photo-1503602642458-232111445657?w=800",
    description: "A comfortable chair for your home.",
    category: "cat_home",
  },
];

const DEMO_DELIVERY_FEE = 1500;

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
  return PRODUCTS.filter(
    (product) => product.category === categoryId,
  );
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

    return `${product.name} × ${item.quantity} — ${money(
      product.price * item.quantity,
    )}`;
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

async function showProducts(
  phone: string,
  context?: DemoContext,
): Promise<void> {
  await sendTextMessage(
    phone,
    "🛍️ *Welcome to the Sabi Demo Shop!*\n\nExplore our product categories below. Select a category to see its products, pictures and prices.\n\nAdd your favourite items to your cart and experience a sample WhatsApp checkout.",
  );

  await sendListMessage(
    phone,
    "Which category would you like to explore?",
    "Browse Categories",
    [
      {
        title: "Shop by Category",
        rows: CATEGORIES.map((category) =>
          makeListRow(
            category.id,
            category.name,
            category.description,
          )
        ),
      },
      {
        title: "Shop Options",
        rows: [
          makeListRow("demo_cart", "🛒 View My Cart"),
          makeListRow("demo_exit", "Exit Demo"),
        ],
      },
    ],
    "Sabi Demo Shop",
    "12 sample products across 6 categories",
  );
}

async function showCategory(
  phone: string,
  conversationId: string,
  categoryId: string,
  context: DemoContext,
): Promise<void> {
  const category = getCategory(categoryId);

  if (!category) {
    await sendTextMessage(phone, "That category was not found.");
    await showProducts(phone, context);
    return;
  }

  const products = getCategoryProducts(categoryId);

  await saveDemoState(conversationId, "CATEGORY_SELECTED", {
    ...context,
    selectedCategory: categoryId,
  });

  await sendTextMessage(
    phone,
    `🛍️ *${category.name}*\n\nHere are the products available in this category. Select an item to see its details.`,
  );

  for (const product of products) {
    await sendImageMessage(
      phone,
      product.image,
      `*${product.name}*\n${product.description}\n\nPrice: ${money(product.price)}`,
    );
  }

  await sendListMessage(
    phone,
    "Select a product to view more details.",
    "View Products",
    [
      {
        title: category.name,
        rows: products.map((product) =>
          makeListRow(
            product.id,
            product.name,
            money(product.price),
          )
        ),
      },
      {
        title: "Shop Options",
        rows: [
          makeListRow("demo_categories", "Browse Categories"),
          makeListRow("demo_cart", "View My Cart"),
          makeListRow("demo_exit", "Exit Demo"),
        ],
      },
    ],
    "Sabi Demo Shop",
    "Sample products only",
  );
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

  await saveDemoState(conversationId, "CART", context);

  await sendTextMessage(
    phone,
    `🛒 *Your Demo Cart*\n\n${getCartLines(cart)}\n\n*Subtotal: ${money(subtotal)}*`,
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
  await saveDemoState(
    conversationId,
    "WAITING_CUSTOMER_NAME",
    context,
  );

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
  await saveDemoState(
    conversationId,
    "WAITING_DELIVERY_ADDRESS",
    context,
  );

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

  await saveDemoState(
    conversationId,
    "WAITING_DEMO_PAYMENT",
    context,
  );

  await sendTextMessage(
    phone,
    `🧾 *Demo Order Summary*\n\n` +
    `Customer: ${context.customerName}\n` +
    `Delivery address: ${context.deliveryAddress}\n\n` +
    `${getCartLines(context.cart || [])}\n\n` +
    `Product subtotal: ${money(subtotal)}\n` +
    `Sample delivery fee: ${money(DEMO_DELIVERY_FEE)}\n` +
    `*Demo total: ${money(total)}*\n\n` +
    `This is a demonstration. No real payment will be collected.`,
  );

  await sendButtonMessage(
    phone,
    "Would you like to simulate a successful payment?",
    [
      makeButton("demo_confirm_payment", "Pay Demo Order"),
      makeButton("demo_cart", "View Cart"),
      makeButton("demo_exit", "Exit Demo"),
    ],
    "Demo Checkout",
    "Simulation only — no real charge",
  );
}

async function confirmDemoPayment(
  phone: string,
  conversationId: string,
  context: DemoContext,
): Promise<void> {
  const orderNumber = `SABI-DEMO-${Date.now().toString().slice(-6)}`;

  const nextContext: DemoContext = {
    ...context,
    demoOrderNumber: orderNumber,
    demoOrderStatus: "CONFIRMED",
  };

  await saveDemoState(
    conversationId,
    "DEMO_ORDER_PLACED",
    nextContext,
  );

  const total = getTotal(context.cart || []) + DEMO_DELIVERY_FEE;

  await sendTextMessage(
    phone,
    `🎉 *Demo Order Confirmed!*\n\n` +
    `Order number: *${orderNumber}*\n` +
    `Customer: ${context.customerName}\n` +
    `Amount: ${money(total)}\n\n` +
    `✅ Simulated payment successful.\n` +
    `📦 Your sample order has been received.\n\n` +
    `This is a demonstration order. No real payment or delivery has been created.`,
  );

  await sendButtonMessage(
    phone,
    "What would you like to do next?",
    [
      makeButton("demo_track_order", "Track Order"),
      makeButton("demo_new_order", "New Order"),
      makeButton("demo_exit", "Exit Demo"),
    ],
    "Order Confirmation",
    orderNumber,
  );
}

async function trackDemoOrder(
  phone: string,
  context: DemoContext,
): Promise<void> {
  await sendTextMessage(
    phone,
    `📍 *Demo Order Tracking*\n\n` +
    `Order: *${context.demoOrderNumber || "SABI-DEMO"}*\n\n` +
    `✅ Order received\n` +
    `✅ Simulated payment confirmed\n` +
    `🟡 Order being prepared\n` +
    `⚪ Out for delivery\n` +
    `⚪ Delivered\n\n` +
    `This is sample tracking information, not a real delivery.`,
  );

  await sendButtonMessage(
    phone,
    "Would you like to place another sample order?",
    [
      makeButton("demo_new_order", "New Order"),
      makeButton("demo_products", "View Categories"),
      makeButton("demo_exit", "Exit Demo"),
    ],
    "Demo Tracking",
    "Sabi by XTOP",
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

  await saveDemoState(
    conversationId,
    "SHOPPING",
    context,
  );

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

  const context = (
    savedContext || {}
  ) as DemoContext;

  const cart = context.cart || [];

  if (
    action === "demo_exit" ||
    action === "exit demo" ||
    action === "sabi_home"
  ) {
    await updateConversation(conversationId, {
      current_module: "SABI_GATEWAY",
      current_state: "SHOWING_WELCOME",
      context_json: {
        sabi_gateway: true,
      },
    });

    await sendTextMessage(
      phone,
      "You have left the shop demo. Type *Hi* to return to the Sabi welcome menu.",
    );

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
    action === "demo_categories" ||
    action === "demo_products" ||
    action === "shop" ||
    action === "continue shopping"
  ) {
    await saveDemoState(
      conversationId,
      "SHOPPING",
      context,
    );

    await showProducts(phone, context);
    return true;
  }

  if (action === "demo_track_order") {
    await trackDemoOrder(phone, context);
    return true;
  }

  if (action === "demo_confirm_payment") {
    if (currentState !== "WAITING_DEMO_PAYMENT") {
      await sendTextMessage(
        phone,
        "There is no pending demo checkout. Please start a new sample order.",
      );
      return true;
    }

    await confirmDemoPayment(
      phone,
      conversationId,
      context,
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
    };

    await saveDemoState(
      conversationId,
      "SHOPPING",
      nextContext,
    );

    await sendTextMessage(
      phone,
      "Your demo cart has been cleared.",
    );

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

    await askForCustomerName(
      phone,
      conversationId,
      context,
    );

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
    const product = getProduct(
      context.selectedProduct || "",
    );

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

    await showCart(
      phone,
      conversationId,
      nextContext,
    );

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

    const nextContext: DemoContext = {
      ...context,
      customerName: text.trim(),
    };

    await askForDeliveryAddress(
      phone,
      conversationId,
      nextContext,
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

    const nextContext: DemoContext = {
      ...context,
      deliveryAddress: text.trim(),
    };

    await showCheckoutSummary(
      phone,
      conversationId,
      nextContext,
    );

    return true;
  }

  if (currentState === "WAITING_DEMO_PAYMENT") {
    await sendTextMessage(
      phone,
      "Please use the *Pay Demo Order* button to simulate payment, or choose View Cart.",
    );
    return true;
  }

  if (currentState === "DEMO_ORDER_PLACED") {
    await sendButtonMessage(
      phone,
      "Your sample order has already been confirmed. You can track it or start another demo order.",
      [
        makeButton("demo_track_order", "Track Order"),
        makeButton("demo_new_order", "New Order"),
        makeButton("demo_exit", "Exit Demo"),
      ],
      "Demo Order",
      context.demoOrderNumber || "Sabi Demo",
    );

    return true;
  }

  return false;
}
