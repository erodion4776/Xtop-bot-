// supabase/functions/whatsapp-webhook/database.ts
// Complete Upgraded Database Layer (Aligned with Schema v2.0)

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { safeErrorLog } from "./utils.ts";

// ═══════════════════════════════════════════════════════
// TYPES — PHASES 1 & 2
// ═══════════════════════════════════════════════════════

export interface Contact {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  business_name: string | null;
  business_type: string | null;
}

export interface Conversation {
  id: string;
  contact_id: string;
  current_module: string;
  current_state: string;
  context_json: Record<string, unknown>;
  last_message_at: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  features: string[];
  target_audience: string;
  price: number | null;
  price_text: string | null;
  website_url: string | null;
  demo_url: string | null;
  status: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  features: string[];
  base_price: number | null;
  price_range: string | null;
  display_order: number;
  status: string;
}

export interface DemoItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  demo_type: string;
  steps_json: Array<{ step: number; title: string; bot_message: string; options: string[] }>;
  display_order: 
