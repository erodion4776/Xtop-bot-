
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

    const token = authorization.substring(7).trim();

    if (!token) {
      return jsonResponse({ error: "Invalid authentication token" }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify the actual logged-in Supabase user
    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ error: "Invalid or expired session" }, 401);
    }

    const metadata = user.user_metadata || {};

    const ownerName = String(metadata.owner_name || "").trim();
    const businessName = String(metadata.business_name || "").trim();
    const businessWhatsApp = String(
      metadata.business_whatsapp || ""
    ).trim();
    const personalWhatsApp = String(
      metadata.personal_whatsapp || ""
    ).trim();

    if (!user.email || !ownerName || !businessName || !businessWhatsApp) {
      return jsonResponse({
        error: "Your registration details are incomplete. Please update your registration information.",
      }, 400);
    }

    const cleanBusinessPhone = businessWhatsApp.replace(/[^0-9]/g, "");
    const cleanPersonalPhone = personalWhatsApp.replace(/[^0-9]/g, "");

    if (cleanBusinessPhone.length < 10) {
      return jsonResponse({
        error: "Please provide a valid business WhatsApp number.",
      }, 400);
    }

    if (
      cleanPersonalPhone &&
      cleanPersonalPhone === cleanBusinessPhone
    ) {
      return jsonResponse({
        error: "Your personal and business WhatsApp numbers must be different.",
      }, 400);
    }

    // Create the workspace through the protected database function
    const { data: tenantId, error: registrationError } = await admin.rpc(
      "sabi_create_merchant_workspace",
      {
        p_user_id: user.id,
        p_owner_name: ownerName,
        p_business_name: businessName,
        p_email: user.email,
        p_business_whatsapp: cleanBusinessPhone,
        p_personal_whatsapp: cleanPersonalPhone || null,
      }
    );

    if (registrationError || !tenantId) {
      console.error("Merchant workspace registration failed:", registrationError);
      return jsonResponse({
        error: "Unable to create your merchant workspace. Please try again.",
      }, 500);
    }

    return jsonResponse({
      success: true,
      tenant_id: tenantId,
      message: "Merchant workspace is ready.",
    }, 200);
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
