import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE = "https://discover.sabibyxtop.com.ng";
const merchantSite = (slugValue: unknown) => {
  const slug = String(slugValue || "").trim().toLowerCase();
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)
    ? `https://${slug}.sabibyxtop.com.ng`
    : SITE;
};
const FALLBACK_IMAGE = "https://i.ibb.co/N2b6rJnY/Untitled-design-20261030-044935-0000.png";

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] as string);
}

function htmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "index, follow",
    },
  });
}

function page(title: string, description: string, image: string, canonical: string, redirect: string) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeImage = escapeHtml(image);
  const safeCanonical = escapeHtml(canonical);
  const safeRedirect = escapeHtml(redirect);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title><meta name="description" content="${safeDescription}">
<link rel="canonical" href="${safeCanonical}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Sabi Discover">
<meta property="og:title" content="${safeTitle}"><meta property="og:description" content="${safeDescription}">
<meta property="og:image" content="${safeImage}"><meta property="og:image:alt" content="${safeTitle}">
<meta property="og:url" content="${safeCanonical}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDescription}"><meta name="twitter:image" content="${safeImage}">
<meta http-equiv="refresh" content="0;url=${safeRedirect}">
<script>window.location.replace(${JSON.stringify(redirect)});</script>
</head><body><p>Opening Sabi Discover… <a href="${safeRedirect}">Continue to ${safeTitle}</a></p></body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const id = url.searchParams.get("id")?.trim() || "";
  if (!id || (kind !== "product" && kind !== "store")) return htmlResponse("Not found", 404);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return htmlResponse("Sabi preview service is not configured.", 500);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (kind === "product") {
    const { data, error } = await supabase.rpc("sabi_get_public_product", { p_product_id: id });
    if (error) {
      console.error("Sabi product preview lookup failed", error.message);
      return htmlResponse("Unable to load this product.", 502);
    }
    const product = Array.isArray(data) ? data[0] : null;
    if (!product) return htmlResponse("This product is unavailable.", 404);
    const productId = String(product.product_id || id);
    const canonical = `${merchantSite(product.business_slug)}/?product=${encodeURIComponent(productId)}`;
    const redirect = canonical;
    const price = Number(product.product_price || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 });
    const descriptionText = String(product.product_description || `Available from ${product.business_name || "a Sabi merchant"} on Sabi Discover.`).trim();
    const description = `${descriptionText} Price: ₦${price}. Shop on Sabi Discover.`.slice(0, 280);
    const title = `${product.product_name || "Product"} | ₦${price} | ${product.business_name || "Sabi Discover"}`;
    return htmlResponse(page(title, description, product.product_image_url || product.business_logo || FALLBACK_IMAGE, canonical, redirect));
  }

  const { data, error } = await supabase.rpc("sabi_get_public_storefront", { p_slug: id });
  if (error) {
    console.error("Sabi store preview lookup failed", error.message);
    return htmlResponse("Unable to load this store.", 502);
  }
  const rows = Array.isArray(data) ? data : [];
  const store = rows[0];
  if (!store) return htmlResponse("This store is unavailable.", 404);
  const slug = String(store.business_slug || id);
  const canonical = `${merchantSite(slug)}/`;
  const title = `${store.business_name || "Store"} | Shop on Sabi Discover`;
  const productCount = rows.filter((row: Record<string, unknown>) => row.product_id && row.product_name).length;
  const description = `Shop ${store.business_name || "this Nigerian business"} on Sabi Discover. Browse ${productCount} available products.`;
  return htmlResponse(page(title, description, store.business_logo || FALLBACK_IMAGE, canonical, canonical));
});
