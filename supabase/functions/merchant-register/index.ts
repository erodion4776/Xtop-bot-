
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing Supabase server configuration");
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Authentication required" }, 401);
    }

    const authToken = authorization.substring(7).trim();

    if (!authToken) {
      return jsonResponse({ error: "Invalid authentication token" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const sessionToken = String(body.session_token || "").trim();

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(authToken);

    if (authError || !user) {
      return jsonResponse({ error: "Invalid or expired session" }, 401);
    }

    // Existing merchants should continue to access their workspace.
    const { data: memberships, error: membershipError } = await admin
      .from("tenant_members")
      .select("tenant_id, role")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .eq("role", "OWNER")
      .limit(1);

    if (membershipError) {
      console.error("Membership lookup failed:", membershipError);
      return jsonResponse({ error: "Unable to load your business account" }, 500);
    }

    if (memberships && memberships.length > 0) {
      return jsonResponse({
        success: true,
        tenant_id: memberships[0].tenant_id,
        existing_account: true,
        message: "Merchant workspace is ready.",
      });
    }

    // New registrations must have a valid WhatsApp onboarding session.
    if (!sessionToken) {
      return jsonResponse({
        error: "Your WhatsApp registration session is missing. Please return to Sabi on WhatsApp and start registration again.",
      }, 400);
    }

    const metadata = user.user_metadata || {};

    const ownerName = String(metadata.owner_name || "").trim();
    const businessName = String(metadata.business_name || "").trim();
    const personalWhatsApp = String(
      metadata.personal_whatsapp || ""
    ).replace(/[^0-9]/g, "");

    if (!user.email || !ownerName || !businessName) {
      return jsonResponse({
        error: "Your registration details are incomplete. Please sign up again with your owner name and business name.",
      }, 400);
    }

    if (personalWhatsApp && personalWhatsApp.length < 10) {
      return jsonResponse({
        error: "Please provide a valid personal WhatsApp number or leave it blank.",
      }, 400);
    }

    // Attach this authenticated owner to the existing WhatsApp-connected tenant.
    const { data: tenantId, error: registrationError } = await admin.rpc(
      "sabi_complete_merchant_registration",
      {
        p_user_id: user.id,
        p_session_token: sessionToken,
        p_owner_name: ownerName,
        p_business_name: businessName,
        p_email: user.email,
        p_personal_whatsapp: personalWhatsApp || null,
      }
    );

    if (registrationError || !tenantId) {
      console.error("Merchant registration failed:", registrationError);

      return jsonResponse({
        error: registrationError?.message ||
          "Unable to complete your merchant registration. Please try again.",
      }, 400);
    }

    return jsonResponse({
      success: true,
      tenant_id: tenantId,
      existing_account: false,
      message: "Your Sabi merchant workspace is ready.",
    });

  } catch (error) {
    console.error("Merchant registration error:", error);

    return jsonResponse({
      error: "An unexpected registration error occurred.",
    }, 500);
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
