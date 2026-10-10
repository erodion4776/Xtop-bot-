
 // supabase/functions/whatsapp-webhook/modules/demos/index.ts
// Demo Centre — Main Router, Category Menus & Pagination

import {
  Contact,
  Conversation,
  updateConversation,
  getActiveDemoSession,
} from "../../database.ts";

import {
  sendListMessage,
  sendTextMessage,
  makeListRow,
} from "../../whatsapp.ts";

import { normalise, safeErrorLog } from "../../utils.ts";
import { showMainMenu } from "../main-menu.ts";

import {
  startDemo,
  processDemoInput,
  handlePostDemoAction,
  processLeadCapture,
} from "./engine.ts";

import {
  getAllDemos,
  getDemoConfig,
  getDemosByCategory,
  getDemoCategories,
} from "./data.ts";

import {
  handlePersonalizedDemoAction,
  handlePersonalizedDemoToken,
} from "./personalized.ts";

import {
  processOnboarding,
  startOnboarding,
  handleChangeDetails,
} from "./onboarding.ts";

import { extractTokenFromText } from "./tokens.ts";

const CATEGORY_PAGE_SIZE = 8;
const DEMO_PAGE_SIZE = 7;

const categoryIcons: Record<string, string> = {
  "Sales & Commerce": "🛒",
  "Customer Management": "👥",
  Operations: "📦",
  "Payments & Finance": "💳",
  "Booking & Services": "📅",
  "Community & Events": "⛪",
  "Business Intelligence": "📊",
  "Custom Automation": "⚙️",
};

function getPageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

function clampPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.max(1, Math.min(Math.floor(page), pageCount));
}

/**
 * Main Demo Centre menu.
 *
 * Page 1: categories, All Demos, Next.
 * Page 2: personalized onboarding, Main Menu, Previous.
 *
 * Never sends more than 10 list rows.
 */
export async function showDemoCentreMenu(
  phone: string,
  conversationId: string,
  requestedPage = 1,
): Promise<void> {
  const page = requestedPage === 2 ? 2 : 1;

  await updateConversation(conversationId, {
    current_module: "DEMOS",
    current_state: "DEMO_CENTRE_MENU",
    context_json: { demoCentrePage: page },
  });

  const categories = getDemoCategories();
  const categoryCounts = getDemosByCategory();

  const rows = [];

  if (page === 1) {
    for (const category of categories.slice(0, CATEGORY_PAGE_SIZE)) {
      rows.push(
        makeListRow(
          `democat_${category.replace(/\s+/g, "_").toLowerCase()}`,
          `${categoryIcons[category] || "📁"} ${category}`,
          `${categoryCounts[category]?.length || 0} demos available`,
        ),
      );
    }

    rows.push(
      makeListRow("democat_all", "📋 All Demos", "Browse every demo"),
    );

    rows.push(
      makeListRow(
        "democat_page_2",
        "➡️ More Options",
        "Personalized demo and main menu",
      ),
    );
  } else {
    rows.push(
      makeListRow(
        "demo_onboard_start",
        "✨ Demo for My Business",
        "Get a personalized demo",
      ),
    );

    rows.push(
      makeListRow(
        "democat_back",
        "🔙 Main Menu",
        "Return to home",
      ),
    );

    rows.push(
      makeListRow(
        "democat_page_1",
        "⬅️ Previous",
        "Back to demo categories",
      ),
    );
  }

  await sendListMessage(
    phone,
    `🎮 *XTOP DEMO CENTRE*\n\n` +
      "Experience WhatsApp automation demos built around real business workflows.\n\n" +
      "⚠️ _All demos use fictional data._\n\n" +
      (page === 1
        ? "👇 *Choose a category or browse all demos:*"
        : "👇 *Choose an option:*"),
    "Demo Categories",
    [{ title: page === 1 ? "Categories" : "More Options", rows }],
    "Xtop Demo Centre",
    `Page ${page} of 2 • Powered by Sabi`,
  );
}

/**
 * Displays a paginated list of demos for a selected category.
 * Seven demos per page leave room for Previous, Next and Back.
 */
async function showCategoryDemos(
  phone: string,
  conversationId: string,
  category: string,
  requestedPage = 1,
): Promise<void> {
  const demosByCategory = getDemosByCategory();

  const demos =
    category === "ALL"
      ? getAllDemos()
      : demosByCategory[category] || [];

  if (demos.length === 0) {
    await sendTextMessage(
      phone,
      "⚠️ No demos are available in this category yet.",
    );
    await showDemoCentreMenu(phone, conversationId);
    return;
  }

  const pageCount = getPageCount(demos.length, DEMO_PAGE_SIZE);
  const page = clampPage(requestedPage, pageCount);
  const startIndex = (page - 1) * DEMO_PAGE_SIZE;
  const pageDemos = demos.slice(
    startIndex,
    startIndex + DEMO_PAGE_SIZE,
  );

  await updateConversation(conversationId, {
    current_module: "DEMOS",
    current_state: "DEMO_CATEGORY",
    context_json: {
      selectedCategory: category,
      demoPage: page,
    },
  });

  const rows = pageDemos.map((demo) =>
    makeListRow(
      `demostart_${demo.id}`,
      `${demo.icon} ${demo.name}`,
      demo.description,
    )
  );

  if (page > 1) {
    rows.push(
      makeListRow(
        "demopage_prev",
        "⬅️ Previous Demos",
        `Go to page ${page - 1}`,
      ),
    );
  }

  if (page < pageCount) {
    rows.push(
      makeListRow(
        "demopage_next",
        "➡️ More Demos",
        `Go to page ${page + 1}`,
      ),
    );
  }

  rows.push(
    makeListRow(
      "democat_back_centre",
      "🔙 Demo Centre",
      "Back to categories",
    ),
  );

  await sendListMessage(
    phone,
    `🎮 *${category === "ALL" ? "All Demos" : category}*\n\n` +
      `Showing demos ${startIndex + 1}–${startIndex + pageDemos.length} of ${demos.length}.\n\n` +
      "⚠️ _All demo data is fictional._\n\nSelect a demo:",
    "Choose Demo",
    [{ title: "Available Demos", rows }],
    "Xtop Demo Centre",
    `Page ${page} of ${pageCount}`,
  );
}

export async function handleDemos(
  phone: string,
  text: string,
  contact: Contact,
  conv: Conversation,
  interactiveId?: string,
): Promise<void> {
  const rawInput = (interactiveId || text || "").trim();
  const n = normalise(rawInput);

  try {
    // ── PRIORITY 0: Main menu and Demo Centre navigation ──

    if (
      n === "menu_home" ||
      n === "main menu" ||
      n === "menu" ||
      rawInput === "democat_back"
    ) {
      await updateConversation(conv.id, {
        current_module: "MAIN_MENU",
        current_state: "IDLE",
        context_json: {},
      });

      await showMainMenu(phone, conv.id);
      return;
    }

    if (
      n === "demo_centre" ||
      n === "demo_menu" ||
      rawInput === "democat_back_centre"
    ) {
      await showDemoCentreMenu(phone, conv.id);
      return;
    }

    // ── PRIORITY 0A: Demo Centre pagination ──

    if (rawInput === "democat_page_2") {
      await showDemoCentreMenu(phone, conv.id, 2);
      return;
    }

    if (rawInput === "democat_page_1") {
      await showDemoCentreMenu(phone, conv.id, 1);
      return;
    }

    // ── PRIORITY 0B: Demo list pagination ──

    if (
      rawInput === "demopage_next" ||
      rawInput === "demopage_prev"
    ) {
      const ctx = (conv.context_json || {}) as Record<string, unknown>;
      const selectedCategory =
        typeof ctx.selectedCategory === "string"
          ? ctx.selectedCategory
          : "";

      const currentPage =
        typeof ctx.demoPage === "number" ? ctx.demoPage : 1;

      if (!selectedCategory) {
        await showDemoCentreMenu(phone, conv.id);
        return;
      }

      const nextPage =
        rawInput === "demopage_next"
          ? currentPage + 1
          : currentPage - 1;

      await showCategoryDemos(
        phone,
        conv.id,
        selectedCategory,
        nextPage,
      );
      return;
    }

    // ── PRIORITY 1: Personalized demo tokens ──

    const detectedToken = extractTokenFromText(text || rawInput);

    if (detectedToken) {
      const handled = await handlePersonalizedDemoToken(
        phone,
        text || rawInput,
        detectedToken,
        contact,
        conv,
      );

      if (handled) return;
    }

    // ── PRIORITY 2: Active personalized demo session ──

    const ctx = (conv.context_json || {}) as Record<string, any>;

    if (ctx.personalizedDemo === true) {
      const handled = await handlePersonalizedDemoAction(
        phone,
        text,
        rawInput,
        conv,
      );

      if (handled) return;
    }

    // ── PRIORITY 3: Active onboarding session ──

    if (ctx.onboarding === true && ctx.step) {
      const handled = await processOnboarding(
        phone,
        text,
        contact,
        conv,
        interactiveId,
      );

      if (handled) return;
    }

    // ── PRIORITY 4: Start or edit personalized onboarding ──

    if (rawInput === "demo_onboard_start") {
      await startOnboarding(phone, conv);
      return;
    }

    if (
      rawInput === "demo_change_details" ||
      n.includes("change details")
    ) {
      const handled = await handleChangeDetails(phone, conv);
      if (handled) return;
    }

    // ── PRIORITY 5: Post-demo actions ──

    if (
      rawInput.startsWith("demo_restart_") ||
      n === "demo_build_lead" ||
      n === "demo_agent"
    ) {
      const handled = await handlePostDemoAction(
        phone,
        text,
        rawInput,
        conv.id,
        contact.name,
      );

      if (handled) return;
    }

    // ── PRIORITY 6: Existing demo engines ──

    const activeDemo = await getActiveDemoSession(phone);

    if (activeDemo?.demo_id === "LEAD_CAPTURE") {
      const handled = await processLeadCapture(
        phone,
        text,
        activeDemo,
        conv.id,
      );

      if (handled) return;
    }

    if (activeDemo && activeDemo.demo_id !== "LEAD_CAPTURE") {
      const config = getDemoConfig(activeDemo.demo_id);

      if (config) {
        await processDemoInput(
          phone,
          text,
          rawInput,
          activeDemo,
          config,
          conv.id,
        );
        return;
      }
    }

    // ── PRIORITY 7: Start a selected demo ──

    if (rawInput.startsWith("demostart_")) {
      const demoId = rawInput.slice("demostart_".length);
      const config = getDemoConfig(demoId);

      if (config) {
        await startDemo(phone, conv.id, config);
      } else {
        await sendTextMessage(phone, "⚠️ Demo not found.");
        await showDemoCentreMenu(phone, conv.id);
      }

      return;
    }

    // ── PRIORITY 8: Category selection ──

    if (rawInput.startsWith("democat_")) {
      const categorySlug = rawInput.slice("democat_".length);

      if (categorySlug === "all") {
        await showCategoryDemos(phone, conv.id, "ALL");
        return;
      }

      const categories = getDemoCategories();

      const matchedCategory = categories.find(
        (category) =>
          category.replace(/\s+/g, "_").toLowerCase() ===
          categorySlug,
      );

      if (matchedCategory) {
        await showCategoryDemos(phone, conv.id, matchedCategory);
        return;
      }
    }

    // ── PRIORITY 9: Text-based demo shortcuts ──

    if (n.includes("store") || n.includes("shop")) {
      await startDemoById(phone, conv.id, "online_store");
      return;
    }

    if (n.includes("restaurant") || n.includes("food")) {
      await startDemoById(phone, conv.id, "restaurant");
      return;
    }

    if (n.includes("real estate") || n.includes("property")) {
      await startDemoById(phone, conv.id, "real_estate");
      return;
    }

    if (
      n.includes("auto") ||
      n.includes("workshop") ||
      n.includes("car")
    ) {
      await startDemoById(phone, conv.id, "auto_workshop");
      return;
    }

    if (n.includes("crm") || n.includes("customer management")) {
      await startDemoById(phone, conv.id, "crm");
      return;
    }

    if (n.includes("support") || n.includes("ticket")) {
      await startDemoById(phone, conv.id, "customer_support");
      return;
    }

    if (n.includes("payment") || n.includes("pay")) {
      await startDemoById(phone, conv.id, "payment_collection");
      return;
    }

    if (n.includes("calculator") || n.includes("calc")) {
      await startDemoById(phone, conv.id, "business_calculator");
      return;
    }

    if (n.includes("appointment") || n.includes("booking")) {
      await startDemoById(phone, conv.id, "appointment_booking");
      return;
    }

    if (n.includes("church")) {
      await startDemoById(phone, conv.id, "church_management");
      return;
    }

    if (n.includes("inventory") || n.includes("stock")) {
      await startDemoById(phone, conv.id, "inventory");
      return;
    }

    if (n.includes("custom") || n.includes("automat")) {
      await startDemoById(phone, conv.id, "custom_automation");
      return;
    }

    // ── DEFAULT ──

    await showDemoCentreMenu(phone, conv.id);
  } catch (err) {
    safeErrorLog("handleDemos", err);

    await sendTextMessage(
      phone,
      "⚠️ Something went wrong in the Demo Centre.\n\nPlease try again or type *menu*.",
    );
  }
}

async function startDemoById(
  phone: string,
  conversationId: string,
  demoId: string,
): Promise<void> {
  const config = getDemoConfig(demoId);

  if (config) {
    await startDemo(phone, conversationId, config);
    return;
  }

  await sendTextMessage(phone, "⚠️ Demo not found.");
  await showDemoCentreMenu(phone, conversationId);
}

export async function showDemosList(
  phone: string,
  conversationId: string,
): Promise<void> {
  await showDemoCentreMenu(phone, conversationId);
}
