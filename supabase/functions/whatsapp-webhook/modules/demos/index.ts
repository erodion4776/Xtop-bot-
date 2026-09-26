// supabase/functions/whatsapp-webhook/modules/demos/index.ts
// Demo Centre — Main Router & Category Menus

import {
  Contact, Conversation, updateConversation,
  getActiveDemoSession,
} from "../../database.ts";
import {
  sendListMessage, sendButtonMessage, sendTextMessage,
  makeListRow, makeButton,
} from "../../whatsapp.ts";
import { normalise, isBack, safeErrorLog } from "../../utils.ts";
import { showMainMenu } from "../main-menu.ts";
import { startDemo, processDemoInput, handlePostDemoAction, processLeadCapture } from "./engine.ts";
import { getAllDemos, getDemoConfig, getDemosByCategory, getDemoCategories } from "./data.ts";

// ═══════════════════════════════════════════════════════
// DEMO CENTRE MAIN MENU
// ═══════════════════════════════════════════════════════

export async function showDemoCentreMenu(phone: string, conversationId: string): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "DEMOS",
    current_state: "DEMO_CENTRE_MENU",
    context_json: {},
  });

  const categories = getDemoCategories();
  const categoryIcons: Record<string, string> = {
    "Sales & Commerce": "🛒",
    "Customer Management": "👥",
    "Operations": "📦",
    "Payments & Finance": "💳",
    "Booking & Services": "📅",
    "Community & Events": "⛪",
    "Business Intelligence": "📊",
    "Custom Automation": "⚙️",
  };

  const rows = categories.map((cat, i) =>
    makeListRow(
      `democat_${cat.replace(/\s+/g, "_").toLowerCase()}`,
      `${categoryIcons[cat] || "📁"} ${cat}`.substring(0, 24),
      `${getDemosByCategory()[cat]?.length || 0} demos available`
    )
  );
  rows.push(makeListRow("democat_all", "📋 All Demos", "Browse every demo"));
  rows.push(makeListRow("democat_back", "🔙 Main Menu", "Return to home"));

  await sendListMessage(
    phone,
    `🎮 *XTOP DEMO CENTRE*\n\n` +
    `Experience live WhatsApp automation demos.\n` +
    `Each demo shows a real workflow Xtop can build for your business.\n\n` +
    `⚠️ _All demos use fictional data._\n\n` +
    `👇 *Select a category:*`,
    "Demo Categories",
    [{ title: "Categories", rows }],
    "Xtop Demo Centre",
    "Powered by Sabi"
  );
}

// ═══════════════════════════════════════════════════════
// CATEGORY SUB-MENU
// ═══════════════════════════════════════════════════════

async function showCategoryDemos(phone: string, conversationId: string, category: string): Promise<void> {
  const demosByCategory = getDemosByCategory();
  const demos = category === "ALL" ? getAllDemos() : (demosByCategory[category] || []);

  if (demos.length === 0) {
    await sendTextMessage(phone, `⚠️ No demos available in this category yet.`);
    await showDemoCentreMenu(phone, conversationId);
    return;
  }

  await updateConversation(conversationId, {
    current_module: "DEMOS",
    current_state: "DEMO_CATEGORY",
    context_json: { selectedCategory: category },
  });

  const rows = demos.map((d) =>
    makeListRow(
      `demostart_${d.id}`,
      `${d.icon} ${d.name}`.substring(0, 24),
      d.description.substring(0, 72)
    )
  );
  rows.push(makeListRow("democat_back_centre", "🔙 Demo Centre", "Back to categories"));

  const title = category === "ALL" ? "All Demos" : category;

  await sendListMessage(
    phone,
    `🎮 *${title}*\n\nSelect a demo to experience:\n\n⚠️ _Fictional data — no real transactions._`,
    "Choose Demo",
    [{ title: "Available Demos", rows }],
    "Xtop Demo Centre",
    title
  );
}

// ═══════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════

export async function handleDemos(
  phone: string,
  text: string,
  contact: Contact,
  conv: Conversation,
  interactiveId?: string
): Promise<void> {
  const rawInput = (interactiveId || text || "").trim();
  const n = normalise(rawInput);

  try {
    // ── EXIT ──
    if (n === "menu_home" || n === "main menu" || rawInput === "democat_back") {
      await updateConversation(conv.id, {
        current_module: "MAIN_MENU",
        current_state: "IDLE",
        context_json: {},
      });
      await showMainMenu(phone, conv.id);
      return;
    }

    if (n === "demo_centre" || n === "demo_menu" || rawInput === "democat_back_centre") {
      await showDemoCentreMenu(phone, conv.id);
      return;
    }

    // ── POST-DEMO ACTIONS (Build Lead, Restart, Agent) ──
    if (rawInput.startsWith("demo_restart_") || n === "demo_build_lead" || n === "demo_agent") {
      const handled = await handlePostDemoAction(phone, text, rawInput, conv.id, contact.name);
      if (handled) return;
    }

    // ── LEAD CAPTURE FLOW ──
    const activeDemo = await getActiveDemoSession(phone);
    if (activeDemo && activeDemo.demo_id === "LEAD_CAPTURE") {
      const handled = await processLeadCapture(phone, text, activeDemo, conv.id);
      if (handled) return;
    }

    // ── ACTIVE DEMO SESSION ──
    if (activeDemo && activeDemo.demo_id !== "LEAD_CAPTURE") {
      const config = getDemoConfig(activeDemo.demo_id);
      if (config) {
        await processDemoInput(phone, text, rawInput, activeDemo, config, conv.id);
        return;
      }
    }

    // ── START DEMO ──
    if (rawInput.startsWith("demostart_")) {
      const demoId = rawInput.replace("demostart_", "");
      const config = getDemoConfig(demoId);
      if (config) {
        await startDemo(phone, conv.id, config);
        return;
      }
    }

    // ── CATEGORY SELECTION ──
    if (rawInput.startsWith("democat_")) {
      const catSlug = rawInput.replace("democat_", "");
      if (catSlug === "all") {
        await showCategoryDemos(phone, conv.id, "ALL");
        return;
      }
      // Map slug back to category name
      const categories = getDemoCategories();
      const matched = categories.find((c) =>
        c.replace(/\s+/g, "_").toLowerCase() === catSlug
      );
      if (matched) {
        await showCategoryDemos(phone, conv.id, matched);
        return;
      }
    }

    // ── TEXT-BASED DEMO SEARCH ──
    if (n.includes("store") || n.includes("shop")) { await startDemoById(phone, conv.id, "online_store"); return; }
    if (n.includes("restaurant") || n.includes("food")) { await startDemoById(phone, conv.id, "restaurant"); return; }
    if (n.includes("real estate") || n.includes("property")) { await startDemoById(phone, conv.id, "real_estate"); return; }
    if (n.includes("auto") || n.includes("workshop") || n.includes("car")) { await startDemoById(phone, conv.id, "auto_workshop"); return; }
    if (n.includes("crm") || n.includes("customer management")) { await startDemoById(phone, conv.id, "crm"); return; }
    if (n.includes("support") || n.includes("ticket")) { await startDemoById(phone, conv.id, "customer_support"); return; }
    if (n.includes("payment") || n.includes("pay")) { await startDemoById(phone, conv.id, "payment_collection"); return; }
    if (n.includes("calculator") || n.includes("calc")) { await startDemoById(phone, conv.id, "business_calculator"); return; }
    if (n.includes("appointment") || n.includes("booking")) { await startDemoById(phone, conv.id, "appointment_booking"); return; }
    if (n.includes("church")) { await startDemoById(phone, conv.id, "church_management"); return; }
    if (n.includes("inventory") || n.includes("stock")) { await startDemoById(phone, conv.id, "inventory"); return; }
    if (n.includes("custom") || n.includes("automat")) { await startDemoById(phone, conv.id, "custom_automation"); return; }

    // ── FALLBACK ──
    await showDemoCentreMenu(phone, conv.id);

  } catch (err) {
    safeErrorLog("handleDemos", err);
    await sendTextMessage(
      phone,
      "⚠️ Something went wrong in the Demo Centre.\n\nPlease try again or type *menu*."
    );
  }
}

// ═══════════════════════════════════════════════════════
// HELPER: START DEMO BY ID
// ═══════════════════════════════════════════════════════

async function startDemoById(phone: string, conversationId: string, demoId: string): Promise<void> {
  const config = getDemoConfig(demoId);
  if (config) {
    await startDemo(phone, conversationId, config);
  } else {
    await sendTextMessage(phone, "⚠️ Demo not found.");
    await showDemoCentreMenu(phone, conversationId);
  }
}

// ═══════════════════════════════════════════════════════
// LEGACY EXPORTS (preserve backward compatibility)
// ═══════════════════════════════════════════════════════

export async function showDemosList(phone: string, conversationId: string): Promise<void> {
  await showDemoCentreMenu(phone, conversationId);
}
