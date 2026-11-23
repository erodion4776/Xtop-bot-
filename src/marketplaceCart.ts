export type SabiMarketplaceCartItem = {
  product_id: string;
  product_name: string;
  product_price: number;
  product_image_url: string | null;
  business_name: string;
  business_slug: string | null;
  product_stock: number;
  quantity: number;
};

const CART_KEY = "sabi_marketplace_cart";
const CART_COOKIE = "sabi_marketplace_cart";

function readCookieCart(): SabiMarketplaceCartItem[] | null {
  try {
    const entry = document.cookie.split("; ").find((part) => part.startsWith(CART_COOKIE + "="));
    if (!entry) return null;
    const raw = decodeURIComponent(entry.slice(CART_COOKIE.length + 1));
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return null;
    return value.filter((item) => item && typeof item.product_id === "string" && Number(item.quantity) > 0);
  } catch {
    return null;
  }
}

function readLocalCart(): SabiMarketplaceCartItem[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(CART_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item) => item && typeof item.product_id === "string" && Number(item.quantity) > 0);
  } catch {
    return [];
  }
}

export function getMarketplaceCart(): SabiMarketplaceCartItem[] {
  // The public product page and Discover checkout use different subdomains.
  // A parent-domain cookie keeps the same cart available across both origins.
  const sharedCart = readCookieCart();
  if (sharedCart !== null) return sharedCart;
  return readLocalCart();
}

export function saveMarketplaceCart(items: SabiMarketplaceCartItem[]) {
  const serialized = JSON.stringify(items);
  try {
    window.localStorage.setItem(CART_KEY, serialized);
  } catch {
    // The shared cookie below may still be available.
  }
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${CART_COOKIE}=${encodeURIComponent(serialized)}; Domain=.sabibyxtop.com.ng; Path=/; Max-Age=2592000; SameSite=Lax${secure}`;
  } catch {
    // Local storage remains available on this origin if cookies are blocked.
  }
  window.dispatchEvent(new Event("sabi-cart-updated"));
}

export function addToMarketplaceCart(item: Omit<SabiMarketplaceCartItem, "quantity">, quantity = 1) {
  const cart = getMarketplaceCart();
  const existing = cart.find((entry) => entry.product_id === item.product_id);
  if (existing) {
    existing.quantity = Math.min(Math.max(1, item.product_stock), existing.quantity + quantity);
    existing.product_stock = item.product_stock;
  } else {
    cart.push({ ...item, quantity: Math.min(Math.max(1, item.product_stock), Math.max(1, quantity)) });
  }
  saveMarketplaceCart(cart);
  return cart;
}
