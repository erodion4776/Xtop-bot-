// Sabi AI Core — isolated first milestone
// Authenticated web chat foundation. This function does not modify orders,
// products, payments, WhatsApp routing, or support tickets.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("SABI_AI_ALLOWED_ORIGIN") ?? "https://app.sabibyxtop.com.ng",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ error: "Sign in to use Sabi AI." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Sabi AI is not configured yet." }, 503);
  }

  // Validate the caller's JWT with Supabase Auth. Never trust a role or user ID
  // supplied in the request body.
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "Your session is invalid. Please sign in again." }, 401);

  let payload: { message?: unknown; tenant_id?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  if (!message) return json({ error: "Please enter a message." }, 400);
  if (message.length > 4000) return json({ error: "Message is too long. Please keep it under 4,000 characters." }, 413);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolve merchant access from the database. A tenant ID from the browser
  // is only a selector; it never grants access by itself.
  const requestedTenantId = typeof payload.tenant_id === "string" ? payload.tenant_id : null;
  const { data: memberships, error: membershipError } = await admin
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", authData.user.id)
    .eq("is_active", true);

  if (membershipError) {
    console.error("Sabi AI membership lookup failed:", membershipError.message);
    return json({ error: "We could not verify your workspace access." }, 500);
  }

  const eligible = memberships ?? [];
  const membership = requestedTenantId
    ? eligible.find((item) => item.tenant_id === requestedTenantId)
    : eligible.length === 1 ? eligible[0] : null;

  let role: "merchant" | "customer" = membership ? "merchant" : "customer";
  let tenantContext = "";

  if (requestedTenantId && !membership) {
    return json({ error: "You do not have access to that merchant workspace." }, 403);
  }

  if (membership) {
    const { data: tenant, error: tenantError } = await admin
      .from("tenants")
      .select("id, name, business_name, industry")
      .eq("id", membership.tenant_id)
      .eq("is_active", true)
      .maybeSingle();

    if (tenantError || !tenant) return json({ error: "The merchant workspace is unavailable." }, 403);
    tenantContext = [
      `Workspace: ${tenant.business_name || tenant.name}`,
      `Industry: ${tenant.industry || "not specified"}`,
      `Workspace role: ${membership.role || "member"}`,
    ].join("\n");
  } else if (eligible.length > 1) {
    return json({
      error: "You belong to more than one merchant workspace. Select the workspace before starting a chat.",
      requires_tenant_selection: true,
      workspaces: eligible.map((item) => ({ tenant_id: item.tenant_id, role: item.role })),
    }, 409);
  }

  const cfAccountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  const cfApiToken = Deno.env.get("CLOUDFLARE_API_TOKEN");
  if (!cfAccountId || !cfApiToken) {
    return json({
      error: "Sabi AI's language model is not configured. The secure identity check succeeded, but chat is not enabled yet.",
      role,
    }, 503);
  }

  const systemPrompt = [
    "You are Sabi AI, the helpful assistant for Sabi by XTOP, a Nigerian commerce platform.",
    "Be warm, practical, concise, and clear. You may use simple Nigerian English or Nigerian Pidgin when appropriate.",
    "The user role has been verified by the server. Do not claim to have performed an action.",
    "Never invent product prices, stock, delivery fees, order status, payment confirmation, or merchant account information.",
    "You currently have no live commerce tools in this milestone. Explain that you cannot yet inspect or change orders, products, payments, or account settings.",
    "Never request passwords, OTPs, API keys, card details, or payment PINs.",
    role === "merchant"
      ? "You are speaking with a verified merchant. Help with general Sabi usage and business questions, but do not claim to change their store or orders."
      : "You are speaking with a customer. Help with general Sabi usage and shopping questions, but do not claim to access private orders or customer records.",
    tenantContext,
  ].filter(Boolean).join("\n");

  try {
    const aiResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfApiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
          ],
          max_tokens: 700,
          temperature: 0.4,
        }),
      },
    );

    if (!aiResponse.ok) {
      console.error("Cloudflare AI returned status:", aiResponse.status);
      return json({ error: "Sabi AI is temporarily unavailable. Please try again shortly." }, 502);
    }

    const result = await aiResponse.json();
    const reply = result?.result?.response;
    if (typeof reply !== "string" || !reply.trim()) {
      return json({ error: "Sabi AI could not produce a response. Please try again." }, 502);
    }

    return json({
      reply: reply.trim(),
      role,
      tenant_id: membership?.tenant_id ?? null,
      capabilities: {
        chat: true,
        read_products: false,
        read_orders: false,
        change_products: false,
        change_orders: false,
        payments: false,
      },
    });
  } catch (error) {
    console.error("Sabi AI request failed:", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Sabi AI is temporarily unavailable. Please try again shortly." }, 502);
  }
});
