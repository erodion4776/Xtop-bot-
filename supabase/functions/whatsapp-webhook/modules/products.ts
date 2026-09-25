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
    makeListRow(`prod_${p.slug}`, `${idx + 1}️⃣ ${p.name}`.substring(0, 24), p.category.substring(0, 72))
  );
  rows.push(makeListRow("prod_back_menu", "🔙 Main Menu", "Return to home"));

  const body = `📦 *Xtop Retail Technologies — Our Products & Platforms*\n\nExplore our proprietary web platforms, AI tools, and applications built for Nigerian businesses and education:\n\n👇 *Select a product below for full details and live links:*`;

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

  const s = slug.toLowerCase();
  let directLinks = "";

  if (s.includes("naijashop")) {
    directLinks = `🌐 *Website:* https://naijashop.com.ng\n`;
  } else if (s.includes("edu") || s.includes("learning")) {
    directLinks = `📱 *WhatsApp Demo:* +2348073158887\n👉 *Direct Link:* https://wa.me/2348073158887?text=Hi%20Engr%20Ero\n`;
  } else if (s.includes("edvenia") || s.includes("tutorial") || s.includes("jamb")) {
    directLinks = `🌐 *Platform Website:* https://edvenia.com\n`;
  } else if (s.includes("barprep") || s.includes("coach") || s.includes("law")) {
    directLinks = `🌐 *Portal Website:* https://barprep.cybarcoach.com\n`;
  } else if (product.website_url) {
    directLinks = `🌐 *Website:* ${product.website_url}\n`;
  }

  const message =
    `🚀 *${product.name.toUpperCase()}*\n` +
    `_${product.category}_\n\n` +
    `📖 *Overview:*\n${product.description}\n\n` +
    `🎯 *Target Users:*\n${product.target_audience}\n\n` +
    `⚡ *Key Features:*\n${featuresFormatted}\n\n` +
    `💰 *Pricing:* ${product.price_text || "Custom quotation available"}\n` +
    directLinks;

  await sendButtonMessage(
    phone,
    message,
    [
      makeButton(`prod_demo_${product.slug}`, "🔗 Visit / Test Demo"),
      makeButton(`prod_req_${product.slug}`, "📝 Request Project"),
      makeButton("prod_list_back", "🔙 All Products"),
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
  const s = slug.toLowerCase();

  if (n === "prod_list_back" || isBack(text)) {
    await showProductsList(phone, conversation.id);
    return;
  }

  if (n.startsWith("prod_req_") || n.includes("request")) {
    await updateConversation(conversation.id, {
      current_module: "AGENT",
      current_state: "COLLECT_MESSAGE",
      context_json: { request_type: "START_PROJECT", preset_message: `Inquiry for ${slug.toUpperCase()} development / deployment.` },
    });
    await sendTextMessage(
      phone,
      `📝 *Requesting ${slug.toUpperCase()}*\n\nPlease describe your school/business name and required features. An engineer will follow up shortly:`
    );
    return;
  }

  if (n.startsWith("prod_demo_") || n.includes("demo") || n.includes("visit") || n.includes("test")) {
    if (s.includes("edu") || s.includes("learning")) {
      await sendTextMessage(
        phone,
        `🎓 *XTOP EDU — LIVE WHATSAPP BOT*\n\nExperience automated lecture delivery, attendance, and CBT exams live:\n\n📱 *WhatsApp Demo Line:* +2348073158887\n👉 *Click to Launch:* https://wa.me/2348073158887?text=Hi%20Engr%20Ero\n\n_Send *Engr Ero* to start studying!_`
      );
      await showProductDetail(phone, conversation.id, slug);
      return;
    }

    if (s.includes("naijashop")) {
      await sendTextMessage(
        phone,
        `🛒 *NAIJASHOP — LIVE STORE*\n\nExplore our e-commerce platform and inventory system:\n\n🌐 *Visit Store:* https://naijashop.com.ng\n\n_Browse categories, test checkout flow, and automated receipts!_`
      );
      await showProductDetail(phone, conversation.id, slug);
      return;
    }

    if (s.includes("edvenia")) {
      await sendTextMessage(
        phone,
        `📚 *EDVENIA — WAEC / NECO / JAMB AI CBT*\n\nPractice past exam questions with instant AI scoring:\n\n🌐 *Visit Edvenia:* https://edvenia.com\n\n_Take full CBT mock exams on web or mobile!_`
      );
      await showProductDetail(phone, conversation.id, slug);
      return;
    }

    if (s.includes("barprep")) {
      await sendTextMessage(
        phone,
        `⚖️ *CYBERCOACH BARPREP — AI LAW TUTOR*\n\nPrepare for Law School and Bar Examinations:\n\n🌐 *Visit BarPrep:* https://barprep.cybarcoach.com\n\n_Access case law reviews and bar exam simulation drills!_`
      );
      await showProductDetail(phone, conversation.id, slug);
      return;
    }

    if (s.includes("app")) {
      await sendTextMessage(
        phone,
        `📱 *CUSTOM WEB & MOBILE APP DEVELOPMENT*\n\nWe build and publish custom Android, iOS, and Web platforms for businesses.\n\n🌐 *Learn More:* https://naijashop.com.ng\n\n_Tap *Request Project* below to get a custom architectural quote!_`
      );
      await showProductDetail(phone, conversation.id, slug);
      return;
    }
  }

  await sendTextMessage(phone, "Please choose an action below:");
  await showProductDetail(phone, conversation.id, slug);
}
