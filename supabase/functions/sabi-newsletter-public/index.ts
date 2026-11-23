import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
function reply(body: unknown, status = 200, contentType = "application/json") {
  return new Response(contentType === "application/json" ? JSON.stringify(body) : String(body), {
    status, headers: { ...cors, "Content-Type": contentType }
  });
}
function validEmail(value: string) {
  return value.length <= 254 && /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value);
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const requestUrl = new URL(req.url);
  const action = requestUrl.searchParams.get("action") || "";
  try {
    if (req.method === "GET" && action === "unsubscribe") {
      const token = requestUrl.searchParams.get("token") || "";
      if (!/^[0-9a-f-]{36}$/i.test(token)) return reply("<h2>Invalid unsubscribe link</h2>", 400, "text/html");
      const { data, error } = await db.from("sabi_newsletter_subscribers")
        .update({ status: "UNSUBSCRIBED", updated_at: new Date().toISOString() })
        .eq("unsubscribe_token", token).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return reply("<main style='font-family:Arial;padding:30px'><h2>Link not found</h2><p>This unsubscribe link may already have been used.</p></main>", 404, "text/html");
      return reply("<main style='font-family:Arial;max-width:520px;margin:60px auto;padding:24px'><h2>You have been unsubscribed</h2><p>You will no longer receive newsletters from this store.</p><p>Powered by Sabi by XTOP</p></main>", 200, "text/html");
    }
    if (req.method !== "POST" || action !== "subscribe") return reply({ success: false, error: "METHOD_OR_ACTION_NOT_ALLOWED" }, 405);
    const body = await req.json();
    const tenantId = String(body.tenant_id || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const consent = body.consent === true;
    const source = String(body.source || "STORE").slice(0, 40);
    if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return reply({ success: false, error: "INVALID_STORE" }, 400);
    if (!validEmail(email)) return reply({ success: false, error: "ENTER_A_VALID_EMAIL" }, 400);
    if (!consent) return reply({ success: false, error: "EXPLICIT_CONSENT_REQUIRED" }, 400);
    const { data: tenant, error: tenantError } = await db.from("tenants")
      .select("id").eq("id", tenantId).eq("is_active", true).eq("is_system", false).maybeSingle();
    if (tenantError) throw tenantError;
    if (!tenant) return reply({ success: false, error: "STORE_NOT_AVAILABLE" }, 404);
    const { data, error } = await db.from("sabi_newsletter_subscribers").upsert({
      tenant_id: tenantId, email, status: "SUBSCRIBED", consent_at: new Date().toISOString(),
      source, updated_at: new Date().toISOString()
    }, { onConflict: "tenant_id,email" }).select("id,status").single();
    if (error) throw error;
    return reply({ success: true, message: "SUBSCRIBED", subscriber_id: data.id });
  } catch (error) {
    console.error("sabi-newsletter-public", error);
    return reply({ success: false, error: "SUBSCRIPTION_FAILED" }, 500);
  }
});
