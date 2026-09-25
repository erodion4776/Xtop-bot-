// supabase/functions/whatsapp-webhook/modules/products.ts

import {
  Contact,
  Conversation,
  getActiveProducts,
  getProductBySlug,
  updateConversation,
} from "../database.ts";
import {
  sendButtonMessage,
  sendListMessage,
  sendTextMessage,
  makeButton,
  makeListRow,
} from "../whatsapp.ts";
import { extractSelection, normalise, isBack } from "../utils.ts";
import { showMainMenu } from "./main-menu.ts";

export async function handleProducts(
  phone: string,
  text: string,
  contact: Contact,
  conversation: Conversation
): Promise<void> {
  const state = conversation.current_state;
  const context = conversation.context_json as { selectedProductSlug?: string };

  if (isBack(text) && state === "VIEWING_DETAIL") {
    await showProductsList(phone, conversation.id);
    return;
  }

  switch (state) {
    case "ENTRY":
    case "SHOWING_LIST":
      await processProductSelection(phone, text, conversation);
      break;

    case "VIEWING_DETAIL":
      await processProductDetailAction(phone, text, contact, conversation, context.selectedProductSlug);
      break;

    default:
      await showProductsList(phone, conversation.id);
      break;
  }
}

export async function showProductsList(phone: string, conversationId: string): Promise<void> {
  const products = await getActiveProducts();

  if (products.length === 0) {
    await sendTextMessage(phone, "📦 Products are currently being updated. Please check back shortly.");
    await showMainMenu(phone, conversationId);
    return;
  }

  await updateConversation(conversationId, {
    current_module: "PRODUCTS",
    current_state: "SHOWING_LIST",
    context_json: {},
  });

  const rows = products.map((p, idx) =>
    makeListRow(`prod_${p.slug}`, `${idx + 1}️⃣ ${p.name}`, p.category)
  );
  rows.push(makeListRow("prod_back_menu", "🔙 Main Menu", "Return to home"));

  const body = `📦 *Xtop Retail Technologies — Our Products*\n\nExplore our proprietary platforms engineered for Nigerian businesses and institutions.\n\n👇 *Select a product below for full details:*`;

  await sendListMessage(phone, body, "Choose Product", [
    { title: "Proprietary Platforms", rows },
  ]);
}

async function processProductSelection(
  phone: string,
  text: string,
  conversation: Conversation
): Promise<void> {
  const n = normalise(text);

  if (n === "prod_back_menu" || n.includes("main menu")) {
    await showMainMenu(phone, conversation.id);
    return;
  }

  const products = await getActiveProducts();
  let selectedProduct = products.find((p) => n === `prod_${p.slug}` || n.includes(p.slug) || n.includes(normalise(p.name)));

  if (!selectedProduct) {
    const num = extractSelection(text);
    if (num && num >= 1 && num <= products.length) {
      selectedProduct = products[num - 1];
    }
  }

  if (!selectedProduct) {
    await sendTextMessage(phone, "Please select one of the available products from the list.");
    await showProductsList(phone, conversation.id);
    return;
  }

  await showProductDetail(phone, conversation.id, selectedProduct.slug);
}

export async function showProductDetail(phone: string, conversationId: string, slug: string): Promise<void> {
  const product = await getProductBySlug(slug);
  if (!product) {
    await sendTextMessage(phone, "Product not found.");
    await showProductsList(phone, conversationId);
    return;
  }

  await updateConversation(conversationId, {
    current_module: "PRODUCTS",
    current_state: "VIEWING_DETAIL",
    context_json: { selectedProductSlug: product.slug },
  });

  const featuresFormatted = (product.features || [])
    .map((f) => `  • ${f}`)
    .join("\n");

  // Dynamic link overrides for Naijashop & Xtop Edu
  const isNaijashop = slug.toLowerCase().includes("naijashop");
  const isXtopEdu = slug.toLowerCase().includes("edu") || slug.toLowerCase().includes("learning");

  const websiteUrl = isNaijashop ? "https://naijashop.com.ng" : (product.website_url || "https://naijashop.com.ng");
  const demoContactInfo = isXtopEdu
    ? `📱 *Live WhatsApp Demo:* +2348073158887\n👉 *Direct Link:* https://wa.me/2348073158887?text=Hi%20Engr%20Ero\n`
    : (isNaijashop ? `🌐 *Live Store Demo:* https://naijashop.com.ng\n` : "");

  const message =
    `🚀 *${product.name.toUpperCase()}*\n` +
    `_${product.category}_\n\n` +
    `📖 *Overview:*\n${product.description}\n\n` +
    `🎯 *Who It Is For:*\n${product.target_audience}\n\n` +
    `⚡ *Key Features:*\n${featuresFormatted}\n\n` +
    `💰 *Pricing:* ${product.price_text || "Custom quotation available"}\n` +
    `🌐 *Website:* ${websiteUrl}\n` +
    demoContactInfo;

  await sendButtonMessage(
    phone,
    message,
    [
      makeButton(`prod_req_${product.slug}`, "Request Product"),
      makeButton(`prod_demo_${product.slug}`, "View Demo"),
      makeButton("prod_list_back", "Back to Products"),
    ],
    product.name,
    "Xtop Retail Technologies"
  );
}

async function processProductDetailAction(
  phone: string,
  text: string,
  contact: Contact,
  conversation: Conversation,
  productSlug?: string
): Promise<void> {
  const n = normalise(text);
  const slug = productSlug || "xtopedu";

  if (n === "prod_list_back" || isBack(text)) {
    await showProductsList(phone, conversation.id);
    return;
  }

  if (n.startsWith("prod_req_") || n.includes("request")) {
    await updateConversation(conversation.id, {
      current_module: "AGENT",
      current_state: "COLLECT_MESSAGE",
      context_json: { request_type: "START_PROJECT", preset_message: `Interested in purchasing/deploying ${slug.toUpperCase()}` },
    });
    await sendTextMessage(
      phone,
      `📝 *Requesting ${slug.toUpperCase()}*\n\nPlease type your business/school name and any specific requirements you have:\n\n_(An agent will follow up with complete onboarding details)_`
    );
    return;
  }

  if (n.startsWith("prod_demo_") || n.includes("demo")) {
    const isEdu = slug.toLowerCase().includes("edu") || slug.toLowerCase().includes("learning");
    const isNaijashop = slug.toLowerCase().includes("naijashop");

    if (isEdu) {
      await sendTextMessage(
        phone,
        `🎓 *XTOP EDU — LIVE WHATSAPP DEMO*\n\nExperience our interactive automated lecture delivery, CBT exam engine, and attendance system directly:\n\n📱 *WhatsApp Demo Line:* +2348073158887\n👉 *Click to Chat:* https://wa.me/2348073158887?text=Hi%20Engr%20Ero\n\n_Send *Engr Ero* to the number above to start studying instantly!_`
      );
      await showProductDetail(phone, conversation.id, slug);
      return;
    }

    if (isNaijashop) {
      await sendTextMessage(
        phone,
        `🛒 *NAIJASHOP — LIVE STORE DEMO*\n\nExplore our online e-commerce platform and inventory system live:\n\n🌐 *Visit Store:* https://naijashop.com.ng\n\n_Browse products, test order placements, and experience the checkout flow!_`
      );
      await showProductDetail(phone, conversation.id, slug);
      return;
    }

    // Default interactive demo handler
    const demoSlug = slug === "xtopedu" ? "demo_xtopedu" : "demo_naijashop";
    await updateConversation(conversation.id, {
      current_module: "DEMOS",
      current_state: "RUNNING_STEP",
      context_json: { selectedDemoSlug: demoSlug, currentStep: 1 },
    });
    const { runDemoStep } = await import("./demos.ts");
    await runDemoStep(phone, conversation.id, demoSlug, 1);
    return;
  }

  await sendTextMessage(phone, "Please use the buttons below to choose an action:");
  await showProductDetail(phone, conversation.id, slug);
}
