// supabase/functions/whatsapp-webhook/modules/demos/templates_test.ts

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { classifyCategory, getTemplate, compileTemplateString } from "./templates.ts";
import { getBusinessName } from "./personalized.ts";

Deno.test("Template Engine: Input Classification Mapping", () => {
  // Test dynamic category mapping logic
  assertEquals(classifyCategory("restaurant"), "restaurant");
  assertEquals(classifyCategory("food boutique"), "restaurant");
  assertEquals(classifyCategory("short-let rental"), "shortlet");
  assertEquals(classifyCategory("Grand luxury Hotel"), "hotel");
  assertEquals(classifyCategory("School of Computing"), "school");
  assertEquals(classifyCategory("unknown industry"), "other");
});

Deno.test("Template Engine: Placeholder Substitutions", () => {
  const welcomeRaw = "🍽️ Welcome to the *{{business_name}}* WhatsApp demo!\n\nMain need: {{main_need}}.";
  
  const rendered = compileTemplateString(
    welcomeRaw,
    "Sunrise restaurant Demo",
    "food catalogs enquiries and booking requests"
  );

  assertEquals(
    rendered,
    "🍽️ Welcome to the *Sunrise restaurant Demo* WhatsApp demo!\n\nMain need: food catalogs enquiries and booking requests."
  );
});

Deno.test("Template Engine: Safe Business Name Parses", () => {
  assertEquals(getBusinessName({ businessName: "Joe's Pizza & Grill" }), "Joe's Pizza & Grill");
  assertEquals(getBusinessName({ businessName: "undefined" }), "Your Business");
  assertEquals(getBusinessName({ businessName: "null" }), "Your Business");
  assertEquals(getBusinessName({ businessName: "" }), "Your Business");
  assertEquals(getBusinessName({ businessName: "XTD_ABC123XYZ" }), "Your Business");
});

Deno.test("Template Engine: Synchronous Fallback Protection", () => {
  const fallback = getTemplate("non_existent_key_99");
  assertEquals(fallback.key, "other");
  assertNotEquals(fallback.welcomeMessage("Test Business"), "");
});
