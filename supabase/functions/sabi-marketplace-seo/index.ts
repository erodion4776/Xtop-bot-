import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function xmlEscape(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function xmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=900, s-maxage=900",
      "X-Robots-Tag": "all",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: { ...corsHeaders, "Allow": "GET, OPTIONS" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Sitemap service is not configured.", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const requestUrl = new URL(req.url);
  const requestedPage = requestUrl.searchParams.get("page");

  const { data: countData, error: countError } = await supabase.rpc("sabi_get_public_marketplace_sitemap_count");
  if (countError) {
    console.error("Sabi sitemap count failed", countError.message);
    return new Response("Unable to generate sitemap.", { status: 502 });
  }

  const totalUrls = Number(countData || 0);
  const urlsPerSitemap = 10000;
  const pageCount = Math.max(1, Math.ceil(totalUrls / urlsPerSitemap));
  const today = new Date().toISOString();

  if (!requestedPage) {
    const entries = Array.from({ length: pageCount }, (_, index) => {
      const pageUrl = `https://discover.sabibyxtop.com.ng/sitemap-${index + 1}.xml`;
      return `  <sitemap><loc>${pageUrl}</loc><lastmod>${today}</lastmod></sitemap>`;
    });
    return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</sitemapindex>`);
  }

  const pageNumber = Number(requestedPage);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
    return new Response("Sitemap page not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const pageOffset = (pageNumber - 1) * urlsPerSitemap;
  const rows: { url: string; last_modified: string | null }[] = [];
  const batchSize = 1000;
  const rowsToFetch = Math.min(urlsPerSitemap, Math.max(0, totalUrls - pageOffset));

  for (let fetched = 0; fetched < rowsToFetch; fetched += batchSize) {
    const limit = Math.min(batchSize, rowsToFetch - fetched);
    const { data, error } = await supabase.rpc("sabi_get_public_marketplace_sitemap", {
      p_limit: limit,
      p_offset: pageOffset + fetched,
    });
    if (error) {
      console.error("Sabi sitemap page query failed", error.message);
      return new Response("Unable to generate sitemap.", { status: 502 });
    }
    rows.push(...((data || []) as { url: string; last_modified: string | null }[]));
  }

  const entries: string[] = [];
  if (pageNumber === 1) {
    entries.push(`  <url><loc>https://discover.sabibyxtop.com.ng/</loc><lastmod>${today}</lastmod><changefreq>hourly</changefreq><priority>1.0</priority></url>`);
  }
  for (const item of rows) {
    const lastmod = item.last_modified ? new Date(item.last_modified).toISOString() : today;
    const priority = item.url.includes("?store=") ? "0.7" : "0.8";
    entries.push(`  <url><loc>${xmlEscape(item.url)}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>${priority}</priority></url>`);
  }

  return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>`);
});
