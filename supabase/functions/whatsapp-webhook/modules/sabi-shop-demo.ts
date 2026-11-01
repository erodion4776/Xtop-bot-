
import { updateConversation } from "../database.ts";
import {
  sendTextMessage,
  sendImageMessage,
  sendListMessage,
  makeListRow,
  sendButtonMessage,
  makeButton,
} from "../whatsapp.ts";

const PRODUCTS = [
  {
    id: "demo_bag",
    name: "Classic Leather Bag",
    price: 18500,
    image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800",
    description: "A stylish everyday handbag.",
  },
  {
    id: "demo_watch",
    name: "Classic Wristwatch",
    price: 12500,
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800",
    description: "A simple, elegant wristwatch.",
  },
  {
    id: "demo_shoes",
    name: "Casual Sneakers",
    price: 22000,
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800",
    description: "Comfortable everyday sneakers.",
  },
];

type CartItem = {
  productId: string;
  quantity: number;
};

type DemoContext = {
  cart?: CartItem[];
  selectedProduct?: string;
  customerName?: string;
  deliveryAddress?: string;
  demoOrderNumber?: string;
};

function money(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
}

function getProduct(id: string) {
  return PRODUCTS.find((product) => product.id === id);
}

function getTotal(cart: CartItem[]): number {
  return cart.reduce((total, item) => {
    const product = getProduct(item.productId);
    return total + (product?.price || 0) * item.quantity;
  }, 0);
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

async function showProducts(phone: string): Promise<void> {
  await sendTextMessage(
    phone,
    "🛍️ *Welcome to the Sabi Demo Shop!*\n\nHere are some sample products. Select a product from the catalogue to explore.",
  );

  for (const product of PRODUCTS) {
    await sendImageMessage(
      phone,
      product.image,
      `*${product.name}*\n${product.description}\nPrice: ${money(product.price)}`,
    );
  }

  await sendListMessage(
    phone,
    "Which product would you like to view?",
    "View Products",
    [
      {
        title: "Sample Products",
        rows: PRODUCTS.map((product) =>
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
    await sendTextMessage(phone, "That product was not found. Please choose another.");
    await showProducts(phone);
    return;
  }

  await saveDemoState(conversationId, "PRODUCT_SELECTED", {
    ...context,
    selectedProduct: productId,
  });

  await sendImageMessage(
    phone,
    product.image,
    `*${product.name}*\n${product.description}\n\nPrice: ${money(product.price)}`,
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
    "Demo shop",
  );
}

async function showCart(
  phone: string,
  conversationId: string,
  context: DemoContext,
): Promise<void> {
  const cart = context.cart || [];

  if (cart.length === 0) {
    await saveDemoState(conversationId, "SHOPPING", context);
    await sendTextMessage(phone, "🛒 Your demo cart is empty.");
    await showProducts(phone);
    return;
  }

  const lines = cart.map((item) => {
    const product = getProduct(item.productId);
    if (!product) return "";

    return `${product.name} × ${item.quantity} — ${money(product.price * item.quantity)}`;
  }).filter(Boolean);

  const total = getTotal(cart);

  await saveDemoState(conversationId, "CART", context);

  await sendTextMessage(
    phone,
    `🛒 *Your Demo Cart*\n\n${lines.join("\n")}\n\n*Subtotal: ${money(total)}*`,
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

export async function startSabiShopDemo(
  phone: string,
  conversationId: string,
): Promise<void> {
  const context: DemoContext = { cart: [] };

  await saveDemoState(conversationId, "SHOPPING", context);
  await showProducts(phone);
}

export async function handleSabiShopDemo(
  phone: string,
  text: string,
  conversationId: string,
  savedContext?: Record<string, unknown> | null,
): Promise<boolean> {
  const action = text.trim().toLowerCase();

  const context = (
    savedContext?.sabi_shop_demo
      ? savedContext
      : savedContext || {}
  ) as DemoContext;

  const cart = context.cart || [];

  if (
    action === "demo_exit" ||
    action === "exit demo" ||
    action === "sabi_home"
  ) {
    await saveDemoState(conversationId, "EXITED", {});
    await sendTextMessage(
      phone,
      "You have left the Sabi Shop Demo. Type *Hi* to see the Sabi welcome menu again.",
    );
    return true;
  }

  if (
    action === "demo_products" ||
    action === "shop" ||
    action === "continue shopping"
  ) {
    await saveDemoState(conversationId, "SHOPPING", context);
    await showProducts(phone);
    return true;
  }

  const selected = PRODUCTS.find((product) => product.id === action);

  if (selected) {
    await showProduct(phone, conversationId, selected.id, context);
    return true;
  }

  if (action === "demo_add_one") {
    const product = getProduct(context.selectedProduct || "");

    if (!product) {
      await showProducts(phone);
      return true;
    }

    const updated = [...cart];
    const existing = updated.find((item) => item.productId === product.id);

    if (existing) {
      existing.quantity += 1;
    } else {
      updated.push({
        productId: product.id,
        quantity: 1,
      });
    }

    const nextContext = {
      ...context,
      cart: updated,
    };

    await saveDemoState(conversationId, "SHOPPING", nextContext);
    await sendTextMessage(phone, `✅ ${product.name} added to your cart.`);
    await showCart(phone, conversationId, nextContext);
    return true;
  }

  if (action === "demo_cart" || action === "cart") {
    await showCart(phone, conversationId, context);
    return true;
  }

  if (action === "demo_empty_cart") {
    const nextContext = { ...context, cart: [] };
    await saveDemoState(conversationId, "SHOPPING", nextContext);
    await sendTextMessage(phone, "Your demo cart has been cleared.");
    await showProducts(phone);
    return true;
  }

  if (action === "demo_checkout" || action === "checkout") {
    if (!cart.length) {
      await sendTextMessage(phone, "Your cart is empty. Please select a product first.");
      await showProducts(phone);
      return true;
    }

    await saveDemoState(conversationId, "WAITING_CUSTOMER_NAME", context);
    await sendTextMessage(
      phone,
      "📦 *Demo Checkout*\n\nPlease enter your full name.",
    );
    return true;
  }

  const currentState = String(
    (savedContext as Record<string, unknown> | null)?.sabi_shop_demo
      ? "UNKNOWN"
      : "",
  );

  // Customer name is collected as ordinary text.
  // The router will pass the conversation's current_state separately
  // in the next integration step.
  if (currentState === "WAITING_CUSTOMER_NAME") {
    return false;
  }

  return false;
}
