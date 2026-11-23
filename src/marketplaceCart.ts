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

export function getMarketplaceCart(): SabiMarketplaceCartItem[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(CART_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item) => item && typeof item.product_id === "string" && Number(item.quantity) > 0);
  } catch {
    return [];
  }
}

export function saveMarketplaceCart(items: SabiMarketplaceCartItem[]) {
  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event("sabi-cart-updated"));
  } catch {
    // The cart remains usable in memory if browser storage is unavailable.
  }
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
