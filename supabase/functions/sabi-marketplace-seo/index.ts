import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function xmlEscape(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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

  const urls: { url: string; last_modified: string | null }[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.rpc("sabi_get_public_marketplace_sitemap", {
      p_limit: pageSize,
      p_offset: offset,
    });
    if (error) {
      console.error("Sabi sitemap query failed", error.message);
      return new Response("Unable to generate sitemap.", { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }

    const page = (data || []) as { url: string; last_modified: string | null }[];
    urls.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
    if (offset >= 1000000) break;
  }

  const today = new Date().toISOString();
  const entries = [
    `  <url><loc>https://discover.sabibyxtop.com.ng/</loc><lastmod>${today}</lastmod><changefreq>hourly</changefreq><priority>1.0</priority></url>`,
    ...urls.map(item => {
      const lastmod = item.last_modified ? new Date(item.last_modified).toISOString() : today;
      const priority = item.url.includes("?store=") ? "0.7" : "0.8";
      return `  <url><loc>${xmlEscape(item.url)}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>${priority}</priority></url>`;
    })
  ];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>`;
  return new Response(sitemap, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=900, s-maxage=900",
      "X-Robots-Tag": "all",
    },
  });
});
