// supabase/functions/whatsapp-webhook/modules/magazine-studio.ts
// Magazine Studio — Main Handler & Wizard

import {
  Contact, Conversation, updateConversation,
  createMagazineDraft, updateMagazine, getMagazine, getUserMagazines,
  saveMagazinePage, getMagazinePages, updateMagazinePage,
  saveMagazineAsset, deleteMagazine, uploadMagazinePdf,
} from "../database.ts";
import {
  sendButtonMessage, sendListMessage, sendTextMessage, sendImageMessage, sendDocumentMessage,
  makeButton, makeListRow,
} from "../whatsapp.ts";
import { normalise, safeErrorLog } from "../utils.ts";
import { showMainMenu } from "./main-menu.ts";
import { generatePagePlan, generatePageContent, generateTitleSuggestions, PagePlan, MagazineConfig } from "./magazine-engine.ts";
import { generateImage, getCoverImageUrl, buildImagePrompt } from "./magazine-images.ts";
import { buildMagazinePdf } from "./magazine-pdf.ts";

// ═══════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════

export async function handleMagazineStudio(
  phone: string, text: string, contact: Contact, conv: Conversation, interactiveId?: string
): Promise<void> {
  const raw = (interactiveId || text || "").trim();
  const n = normalise(raw);
  const state = conv.current_state;
  const ctx = (conv.context_json || {}) as Record<string, any>;

  try {
    // ── Navigation ──
    if (n === "menu_home" || n === "main menu" || raw === "mag_back_main") {
      await updateConversation(conv.id, { current_module: "MAIN_MENU", current_state: "IDLE", context_json: {} });
      await showMainMenu(phone, conv.id);
      return;
    }
    if (raw === "mag_back" || n === "back") {
      await showStudioMenu(phone, conv.id);
      return;
    }

    // ── Studio Menu ──
    if (raw === "mag_create" || n === "create magazine") { await startWizard(phone, conv.id); return; }
    if (raw === "mag_my" || n === "my magazines") { await showMyMagazines(phone, conv.id); return; }
    if (raw === "mag_delete" || n === "delete draft") { await showDeleteList(phone, conv.id); return; }

    // ── View / Actions on individual magazine ──
    if (raw.startsWith("magview_")) {
      const magId = raw.replace("magview_", "");
      await showMagazineDetail(phone, conv.id, magId);
      return;
    }
    if (raw.startsWith("magdel_")) {
      const magId = raw.replace("magdel_", "");
      await confirmDelete(phone, conv.id, magId);
      return;
    }
    if (raw.startsWith("magdelconfirm_")) {
      const magId = raw.replace("magdelconfirm_", "");
      await deleteMagazine(magId, phone);
      await sendTextMessage(phone, "🗑️ Magazine deleted successfully.");
      await showStudioMenu(phone, conv.id);
      return;
    }
    if (raw.startsWith("magexport_")) {
      const magId = raw.replace("magexport_", "");
      await exportPdf(phone, conv.id, magId);
      return;
    }
    if (raw.startsWith("magpreview_")) {
      const magId = raw.replace("magpreview_", "");
      await showPreview(phone, conv.id, magId);
      return;
    }
    if (raw.startsWith("magregen_img_")) {
      const pageId = raw.replace("magregen_img_", "");
      await regenerateImage(phone, conv.id, pageId, ctx.activeMagId);
      return;
    }

    // ── Wizard Steps ──
    if (state === "MAG_STEP_TYPE") { await processType(phone, raw, conv); return; }
    if (state === "MAG_STEP_TYPE_CUSTOM") { await processCustomType(phone, text, conv); return; }
    if (state === "MAG_STEP_PAGES") { await processPages(phone, raw, conv); return; }
    if (state === "MAG_STEP_PAGES_CUSTOM") { await processCustomPages(phone, text, conv); return; }
    if (state === "MAG_STEP_TOPIC") { await processTopic(phone, text, conv); return; }
    if (state === "MAG_STEP_TITLE_CHOICE") { await processTitleChoice(phone, raw, conv); return; }
    if (state === "MAG_STEP_TITLE_CUSTOM") { await processCustomTitle(phone, text, conv); return; }
    if (state === "MAG_STEP_TITLE_SELECT") { await processTitleSelect(phone, raw, conv); return; }
    if (state === "MAG_STEP_AUDIENCE") { await processAudience(phone, raw, conv); return; }
    if (state === "MAG_STEP_AUDIENCE_CUSTOM") { await processCustomAudience(phone, text, conv); return; }
    if (state === "MAG_STEP_STYLE") { await processStyle(phone, raw, conv); return; }
    if (state === "MAG_STEP_VISUAL") { await processVisual(phone, raw, conv); return; }
    if (state === "MAG_STEP_LOGO") { await processLogo(phone, raw, conv); return; }
    if (state === "MAG_STEP_APPROVE") { await processApproval(phone, raw, conv); return; }
    if (state === "MAG_STEP_GENERATING") {
      await sendTextMessage(phone, "⏳ Your magazine is still being generated. Please wait a moment...");
      return;
    }

    await showStudioMenu(phone, conv.id);
  } catch (err) {
    safeErrorLog("handleMagazineStudio", err);
    await sendTextMessage(phone, "⚠️ Something went wrong. Please try again.");
    await showStudioMenu(phone, conv.id);
  }
}

// ═══════════════════════════════════════════════════════
// STUDIO MENU
// ═══════════════════════════════════════════════════════

export async function showStudioMenu(phone: string, convId: string): Promise<void> {
  await updateConversation(convId, { current_module: "MAGAZINE", current_state: "MAG_MENU", context_json: {} });

  await sendListMessage(phone,
    `📖 *MAGAZINE STUDIO*\n\nCreate and manage professional magazines directly from WhatsApp.\n\n👇 *Select an option:*`,
    "Magazine Studio",
    [{ title: "Options", rows: [
      makeListRow("mag_create", "1️⃣ Create Magazine", "Start a new magazine"),
      makeListRow("mag_my", "2️⃣ My Magazines", "View saved magazines"),
      makeListRow("mag_delete", "3️⃣ Delete Draft", "Remove a draft"),
      makeListRow("mag_back_main", "🔙 Main Menu", "Return to home"),
    ]}],
    "Magazine Studio", "Xtop Retail Technologies"
  );
}

// ═══════════════════════════════════════════════════════
// WIZARD — STEP 1: TYPE
// ═══════════════════════════════════════════════════════

async function startWizard(phone: string, convId: string): Promise<void> {
  await updateConversation(convId, {
    current_module: "MAGAZINE",
    current_state: "MAG_STEP_TYPE",
    context_json: { step: 1 }
  });
  await sendListMessage(phone,
    `📖 *STEP 1/8 — Magazine Type*\n\nWhat type of magazine do you want to create?`,
    "Magazine Type",
    [{ title: "Types", rows: [
      makeListRow("magtype_business", "💼 Business", ""),
      makeListRow("magtype_technology", "💻 Technology", ""),
      makeListRow("magtype_education", "🎓 Education", ""),
      makeListRow("magtype_school", "🏫 School", ""),
      makeListRow("magtype_church", "⛪ Church", ""),
      makeListRow("magtype_fashion", "👗 Fashion", ""),
      makeListRow("magtype_entertainment", "🎬 Entertainment", ""),
      makeListRow("magtype_health", "🏥 Health & Lifestyle", ""),
      makeListRow("magtype_agriculture", "🌾 Agriculture", ""),
      makeListRow("magtype_news", "📰 News / Current Affairs", ""),
      makeListRow("magtype_custom", "✏️ Custom", ""),
    ]}],
    "Step 1: Type", "Magazine Studio"
  );
}

const TYPE_MAP: Record<string, string> = {
  magtype_business: "Business", magtype_technology: "Technology",
  magtype_education: "Education", magtype_school: "School",
  magtype_church: "Church", magtype_fashion: "Fashion",
  magtype_entertainment: "Entertainment", magtype_health: "Health & Lifestyle",
  magtype_agriculture: "Agriculture", magtype_news: "News/Current Affairs",
};

async function processType(phone: string, raw: string, conv: Conversation): Promise<void> {
  const ctx = (conv.context_json as Record<string, any>) || {};
  if (raw === "magtype_custom") {
    await updateConversation(conv.id, { current_state: "MAG_STEP_TYPE_CUSTOM", context_json: ctx });
    await sendTextMessage(phone, `✏️ Enter your custom magazine type:`);
    return;
  }
  const type = TYPE_MAP[raw];
  if (!type) { await startWizard(phone, conv.id); return; }
  ctx.magazineType = type;
  await goToPagesStep(phone, conv.id, ctx);
}

async function processCustomType(phone: string, text: string, conv: Conversation): Promise<void> {
  const ctx = (conv.context_json as Record<string, any>) || {};
  if (text.trim().length < 2) { await sendTextMessage(phone, "⚠️ Please enter a valid type:"); return; }
  ctx.magazineType = text.trim();
  await goToPagesStep(phone, conv.id, ctx);
}

// ═══════════════════════════════════════════════════════
// WIZARD — STEP 2: PAGES
// ═══════════════════════════════════════════════════════

async function goToPagesStep(phone: string, convId: string, ctx: Record<string, any>): Promise<void> {
  ctx.step = 2;
  await updateConversation(convId, { current_state: "MAG_STEP_PAGES", context_json: ctx });
  await sendListMessage(phone,
    `📖 *STEP 2/8 — Number of Pages*\n\nType: *${ctx.magazineType}*\n\nHow many pages should your magazine have?`,
    "Page Count",
    [{ title: "Pages", rows: [
      makeListRow("magpages_4", "4 Pages", "Quick read"),
      makeListRow("magpages_8", "8 Pages", "Standard magazine"),
      makeListRow("magpages_12", "12 Pages", "Detailed"),
      makeListRow("magpages_16", "16 Pages", "Comprehensive"),
      makeListRow("magpages_20", "20 Pages", "Full edition"),
      makeListRow("magpages_custom", "✏️ Custom", "Enter your own"),
    ]}],
    "Step 2: Pages", "Magazine Studio"
  );
}

const PAGES_MAP: Record<string, number> = { magpages_4: 4, magpages_8: 8, magpages_12: 12, magpages_16: 16, magpages_20: 20 };

async function processPages(phone: string, raw: string, conv: Conversation): Promise<void> {
  const ctx = (conv.context_json as Record<string, any>) || {};
  if (raw === "magpages_custom") {
    await updateConversation(conv.id, { current_state: "MAG_STEP_PAGES_CUSTOM", context_json: ctx });
    await sendTextMessage(phone, `✏️ Enter the number of pages (4–40):`);
    return;
  }
  const pages = PAGES_MAP[raw];
  if (!pages) { await sendTextMessage(phone, "⚠️ Please select a valid option."); return; }
  ctx.pageCount = pages;
  await goToTopicStep(phone, conv.id, ctx);
}

async function processCustomPages(phone: string, text: string, conv: Conversation): Promise<void> {
  const ctx = (conv.context_json as Record<string, any>) || {};
  const num = parseInt(text.trim(), 10);
  if (isNaN(num) || num < 4 || num > 40) {
    await sendTextMessage(phone, "⚠️ Please enter a number between 4 and 40:");
    return;
  }
  ctx.pageCount = num;
  await goToTopicStep(phone, conv.id, ctx);
}

// ═══════════════════════════════════════════════════════
// WIZARD — STEP 3: TOPIC
// ═══════════════════════════════════════════════════════

async function goToTopicStep(phone: string, convId: string, ctx: Record<string, any>): Promise<void> {
  ctx.step = 3;
  await updateConversation(convId, { current_state: "MAG_STEP_TOPIC", context_json: ctx });
  await sendTextMessage(phone,
    `📖 *STEP 3/8 — Topic*\n\nType: *${ctx.magazineType}* | Pages: *${ctx.pageCount}*\n\nWhat should the magazine be about?\n\n_Example:_ Small businesses in Nigeria and how they can use technology to grow.`
  );
}

async function processTopic(phone: string, text: string, conv: Conversation): Promise<void> {
  const ctx = (conv.context_json as Record<string, any>) || {};
  if (text.trim().length < 5) {
    await sendTextMessage(phone, "⚠️ Please enter a more detailed topic (at least 5 characters):");
    return;
  }
  ctx.topic = text.trim();
  ctx.step = 4;
  await updateConversation(conv.id, { current_state: "MAG_STEP_TITLE_CHOICE", context_json: ctx });
  await sendButtonMessage(phone,
    `📖 *STEP 4/8 — Title*\n\nTopic captured: _${ctx.topic.substring(0, 60)}${ctx.topic.length > 60 ? "..." : ""}_\n\nHow would you like to name your magazine?`,
    [
      makeButton("mag_title_enter", "✏️ Enter Title"),
      makeButton("mag_title_generate", "✨ Generate for Me"),
    ],
    "Step 4: Title"
  );
}

async function processTitleChoice(phone: string, raw: string, conv: Conversation): Promise<void> {
  const ctx = (conv.context_json as Record<string, any>) || {};
  if (raw === "mag_title_enter") {
    await updateConversation(conv.id, { current_state: "MAG_STEP_TITLE_CUSTOM", context_json: ctx });
    await sendTextMessage(phone, `✏️ Enter your magazine title:`);
    return;
  }
  if (raw === "mag_title_generate") {
    const suggestions = generateTitleSuggestions(ctx.topic, ctx.magazineType);
    ctx.titleSuggestions = suggestions;
    await updateConversation(conv.id, { current_state: "MAG_STEP_TITLE_SELECT", context_json: ctx });
    const rows = suggestions.map((s: string, i: number) => makeListRow(`magtitle_${i}`, s.substring(0, 24), s.substring(0, 72)));
    rows.push(makeListRow("magtitle_custom", "✏️ Enter My Own", ""));
    await sendListMessage(phone,
      `✨ *Suggested Titles*\n\nSelect one or enter your own:`,
      "Choose Title",
      [{ title: "Suggestions", rows }],
      "Step 4: Title", "Magazine Studio"
    );
    return;
  }
  await sendTextMessage(phone, "⚠️ Please tap one of the options above.");
}

async function processTitleSelect(phone: string, raw: string, conv: Conversation): Promise<void> {
  const ctx = (conv.context_json as Record<string, any>) || {};
  if (raw === "magtitle_custom") {
    await updateConversation(conv.id, { current_state: "MAG_STEP_TITLE_CUSTOM", context_json: ctx });
    await sendTextMessage(phone, `✏️ Enter your magazine title:`);
    return;
  }
  const idx = parseInt(raw.replace("magtitle_", ""), 10);
  if (!isNaN(idx) && ctx.titleSuggestions?.[idx]) {
    ctx.title = ctx.titleSuggestions[idx];
    await goToAudienceStep(phone, conv.id, ctx);
    return;
  }
  await sendTextMessage(phone, "⚠️ Please select a valid title.");
}

async function processCustomTitle(phone: string, text: string, conv: Conversation): Promise<void> {
  const ctx = (conv.context_json as Record<string, any>) || {};
  if (text.trim().length < 2) { await sendTextMessage(phone, "⚠️ Please enter a valid title:"); return; }
  ctx.title = text.trim();
  await goToAudienceStep(phone, conv.id, ctx);
}

// ═══════════════════════════════════════════════════════
// WIZARD — STEP 5: AUDIENCE
// ═══════════════════════════════════════════════════════

async function goToAudienceStep(phone: string, convId: string, ctx: Record<string, any>): Promise<void> {
  ctx.step = 5;
  await updateConversation(convId, { current_state: "MAG_STEP_AUDIENCE", context_json: ctx });
  await sendListMessage(phone,
    `📖 *STEP 5/8 — Audience*\n\nTitle: *${ctx.title}*\n\nWho is this magazine for?`,
    "Target Audience",
    [{ title: "Audience", rows: [
      makeListRow("magaud_students", "🎓 Students", ""),
      makeListRow("magaud_parents", "👨‍👩‍👧 Parents", ""),
      makeListRow("magaud_business", "💼 Business Owners", ""),
      makeListRow("magaud_professionals", "👔 Professionals", ""),
      makeListRow("magaud_teachers", "👩‍🏫 Teachers", ""),
      makeListRow("magaud_entrepreneurs", "🚀 Entrepreneurs", ""),
      makeListRow("magaud_general", "🌍 General Public", ""),
      makeListRow("magaud_custom", "✏️ Custom", ""),
    ]}],
    "Step 5: Audience", "Magazine Studio"
  );
}

const AUD_MAP: Record<string, string> = {
  magaud_students: "Students", magaud_parents: "Parents", magaud_business: "Business Owners",
  magaud_professionals: "Professionals", magaud_teachers: "Teachers",
  magaud_entrepreneurs: "Entrepreneurs", magaud_general: "General Public",
};

async function processAudience(phone: string, raw: string, conv: Conversation): Promise<void> {
  const ctx = (conv.context_json as Record<string, any>) || {};
  if (raw === "magaud_custom") {
    await updateConversation(conv.id, { current_state: "MAG_STEP_AUDIENCE_CUSTOM", context_json: ctx });
    await sendTextMessage(phone, `✏️ Enter your target audience:`);
    return;
  }
  const aud = AUD_MAP[raw];
  if (!aud) { await sendTextMessage(phone, "⚠️ Please select a valid option."); return; }
  ctx.audience = aud;
  await goToStyleStep(phone, conv.id, ctx);
}

async function processCustomAudience(phone: string, text: string, conv: Conversation): Promise<void> {
  const ctx = (conv.context_json as Record<string, any>) || {};
  if (text.trim().length < 2) { await sendTextMessage(phone, "⚠️ Please enter a valid audience:"); return; }
  ctx.audience = text.trim();
  await goToStyleStep(phone, conv.id, ctx);
}

// ═══════════════════════════════════════════════════════
// WIZARD — STEP 6: WRITING STYLE
// ═══════════════════════════════════════════════════════

async function goToStyleStep(phone: string, convId: string, ctx: Record<string, any>): Promise<void> {
  ctx.step = 6;
  await updateConversation(convId, { current_state: "MAG_STEP_STYLE", context_json: ctx });
  await sendListMessage(phone,
    `📖 *STEP 6/8 — Writing Style*\n\nAudience: *${ctx.audience}*\n\nWhat writing style?`,
    "Writing Style",
    [{ title: "Styles", rows: [
      makeListRow("magstyle_professional", "Professional", ""),
      makeListRow("magstyle_educational", "Educational", ""),
      makeListRow("magstyle_friendly", "Simple & Friendly", ""),
      makeListRow("magstyle_inspirational", "Inspirational", ""),
      makeListRow("magstyle_news", "News Style", ""),
      makeListRow("magstyle_business", "Business Style", ""),
    ]}],
    "Step 6: Style", "Magazine Studio"
  );
}

const STYLE_MAP: Record<string, string> = {
  magstyle_professional: "Professional", magstyle_educational: "Educational",
  magstyle_friendly: "Simple & Friendly", magstyle_inspirational: "Inspirational",
  magstyle_news: "News Style", magstyle_business: "Business Style",
};

async function processStyle(phone: string, raw: string, conv: Conversation): Promise<void> {
  const ctx = (conv.context_json as Record<string, any>) || {};
  const style = STYLE_MAP[raw];
  if (!style) { await sendTextMessage(phone, "⚠️ Please select a valid style."); return; }
  ctx.writingStyle = style;
  ctx.step = 7;
  await updateConversation(conv.id, { current_state: "MAG_STEP_VISUAL", context_json: ctx });
  await sendListMessage(phone,
    `📖 *STEP 7/8 — Visual Style*\n\nWhat visual style should the magazine use?`,
    "Visual Style",
    [{ title: "Visual Styles", rows: [
      makeListRow("magvis_modern", "🎨 Modern", ""),
      makeListRow("magvis_corporate", "💼 Corporate", ""),
      makeListRow("magvis_minimal", "⚪ Minimal", ""),
      makeListRow("magvis_luxury", "💎 Luxury", ""),
      makeListRow("magvis_african", "🌍 African", ""),
      makeListRow("magvis_school", "🏫 School / Education", ""),
      makeListRow("magvis_tech", "💻 Technology", ""),
      makeListRow("magvis_fashion", "👗 Fashion", ""),
      makeListRow("magvis_church", "⛪ Church", ""),
    ]}],
    "Step 7: Visual", "Magazine Studio"
  );
}

const VIS_MAP: Record<string, string> = {
  magvis_modern: "modern", magvis_corporate: "corporate", magvis_minimal: "minimal",
  magvis_luxury: "luxury", magvis_african: "african", magvis_school: "school",
  magvis_tech: "technology", magvis_fashion: "fashion", magvis_church: "church",
};

async function processVisual(phone: string, raw: string, conv: Conversation): Promise<void> {
  const ctx = (conv.context_json as Record<string, any>) || {};
  const vis = VIS_MAP[raw];
  if (!vis) { await sendTextMessage(phone, "⚠️ Please select a valid style."); return; }
  ctx.visualStyle = vis;
  ctx.template = vis;
  ctx.step = 8;
  await updateConversation(conv.id, { current_state: "MAG_STEP_LOGO", context_json: ctx });
  await sendButtonMessage(phone,
    `📖 *STEP 8/8 — Branding*\n\nChoose your magazine branding:`,
    [
      makeButton("maglogo_xtop", "🏢 Use Xtop Branding"),
      makeButton("maglogo_none", "❌ No Logo"),
    ],
    "Step 8: Branding"
  );
}

async function processLogo(phone: string, raw: string, conv: Conversation): Promise<void> {
  const ctx = (conv.context_json as Record<string, any>) || {};
  ctx.logo = raw === "maglogo_xtop" ? "xtop" : "none";

  // Generate plan
  const plan = generatePagePlan(ctx.pageCount, ctx.magazineType, ctx.topic);
  ctx.plan = plan;

  await updateConversation(conv.id, { current_state: "MAG_STEP_APPROVE", context_json: ctx });

  let planMsg =
    `📖 *YOUR MAGAZINE PLAN*\n\n` +
    `*Title:* ${ctx.title}\n` +
    `*Type:* ${ctx.magazineType}\n` +
    `*Pages:* ${ctx.pageCount}\n` +
    `*Audience:* ${ctx.audience}\n` +
    `*Style:* ${ctx.writingStyle}\n` +
    `*Visual:* ${ctx.visualStyle}\n\n` +
    `*Page Structure:*\n`;
  plan.forEach((p: PagePlan) => {
    planMsg += `Page ${p.page_number}: ${p.title}\n`;
  });

  await sendButtonMessage(phone, planMsg,
    [
      makeButton("mag_approve", "✅ Approve & Generate"),
      makeButton("mag_back", "🔙 Cancel"),
    ],
    "Magazine Plan"
  );
}

// ═══════════════════════════════════════════════════════
// GENERATION
// ═══════════════════════════════════════════════════════

async function processApproval(phone: string, raw: string, conv: Conversation): Promise<void> {
  const ctx = (conv.context_json as Record<string, any>) || {};
  if (raw !== "mag_approve") { await showStudioMenu(phone, conv.id); return; }

  await updateConversation(conv.id, { current_state: "MAG_STEP_GENERATING", context_json: ctx });
  await sendTextMessage(phone,
    `📖 *Creating your magazine...*\n\n` +
    `1/5 Planning content ✅\n` +
    `2/5 Writing articles 🔄\n` +
    `3/5 Generating images ⏳\n` +
    `4/5 Building pages ⏳\n` +
    `5/5 Creating PDF ⏳\n\n` +
    `_This may take 1–2 minutes. Please wait..._`
  );

  try {
    // Create magazine record
    const mag = await createMagazineDraft(phone, {
      title: ctx.title,
      magazine_type: ctx.magazineType,
      topic: ctx.topic,
      page_count: ctx.pageCount,
      audience: ctx.audience,
      writing_style: ctx.writingStyle,
      visual_style: ctx.visualStyle,
      template: ctx.template,
      plan_json: ctx.plan,
      status: "generating",
    });

    if (!mag) {
      await sendTextMessage(phone, "⚠️ Failed to create magazine. Please try again.");
      await showStudioMenu(phone, conv.id);
      return;
    }

    const config: MagazineConfig = {
      title: ctx.title, topic: ctx.topic, audience: ctx.audience,
      writingStyle: ctx.writingStyle, visualStyle: ctx.visualStyle, magazineType: ctx.magazineType,
    };

    const plan = ctx.plan as PagePlan[];
    const generatedPages: any[] = [];
    let imagesCount = 0;

    // Generate all pages with content and images
    for (const p of plan) {
      const { content, imagePrompt } = generatePageContent(p, config);
      let imageUrl: string | null = null;

      if (p.page_type !== "advertisement" || p.page_number === 1) {
        imageUrl = await generateImage(imagePrompt, 1024, p.page_type === "cover" ? 1400 : 768);
        if (imageUrl) imagesCount++;
      }

      const savedPage = await saveMagazinePage(mag.id, {
        page_number: p.page_number,
        page_type: p.page_type,
        title: p.title,
        content,
        image_url: imageUrl,
        image_prompt: imagePrompt,
        layout_type: p.layout_type,
      });

      if (savedPage) generatedPages.push(savedPage);
    }

    // Set cover image
    const coverImage = generatedPages[0]?.image_url || getCoverImageUrl(ctx.topic, ctx.visualStyle, ctx.title);
    await updateMagazine(mag.id, phone, {
      status: "completed",
      cover_image_url: coverImage,
      stats_json: { imagesGenerated: imagesCount, pagesGenerated: generatedPages.length },
    });

    await updateConversation(conv.id, {
      current_module: "MAGAZINE",
      current_state: "MAG_MENU",
      context_json: { activeMagId: mag.id },
    });

    await sendTextMessage(phone,
      `✅ *Magazine Completed!*\n\n` +
      `*Title:* ${ctx.title}\n` +
      `*Pages:* ${ctx.pageCount}\n` +
      `*Images:* ${imagesCount} generated\n\n` +
      `_Sending preview..._`
    );

    // Send cover image
    if (coverImage) {
      try {
        await sendImageMessage(phone, coverImage, `${ctx.title} — Cover`);
      } catch (_) {}
    }

    await sendButtonMessage(phone,
      `📖 *${ctx.title}* is ready!\n\nWhat would you like to do?`,
      [
        makeButton(`magexport_${mag.id}`, "📄 Export PDF"),
        makeButton(`magpreview_${mag.id}`, "👁️ Preview"),
        makeButton("mag_back", "🔙 Studio Menu"),
      ],
      "Magazine Complete"
    );
  } catch (err) {
    safeErrorLog("magazineGeneration", err);
    await sendTextMessage(phone, "⚠️ An error occurred during generation. Your draft has been saved. Please try again.");
    await showStudioMenu(phone, conv.id);
  }
}

// ═══════════════════════════════════════════════════════
// MY MAGAZINES
// ═══════════════════════════════════════════════════════

async function showMyMagazines(phone: string, convId: string): Promise<void> {
  const mags = await getUserMagazines(phone);

  if (mags.length === 0) {
    await sendButtonMessage(phone,
      `📚 *My Magazines*\n\nYou haven't created any magazines yet.\n\nTap below to create your first magazine!`,
      [
        makeButton("mag_create", "🆕 Create Magazine"),
        makeButton("mag_back", "🔙 Studio Menu"),
      ],
      "My Magazines"
    );
    return;
  }

  const rows = mags.slice(0, 10).map((m: any) =>
    makeListRow(`magview_${m.id}`, (m.title || "Untitled").substring(0, 24), `${m.page_count}p • ${m.status}`.substring(0, 72))
  );
  rows.push(makeListRow("mag_back", "🔙 Studio Menu", ""));

  await sendListMessage(phone,
    `📚 *My Magazines (${mags.length})*\n\nTap a magazine to view details:`,
    "Your Magazines",
    [{ title: "Magazines", rows }],
    "My Magazines", "Magazine Studio"
  );
}

async function showMagazineDetail(phone: string, convId: string, magId: string): Promise<void> {
  const mag = await getMagazine(magId, phone);
  if (!mag) {
    await sendTextMessage(phone, "⚠️ Magazine not found.");
    await showStudioMenu(phone, convId);
    return;
  }

  await updateConversation(convId, {
    current_module: "MAGAZINE",
    current_state: "MAG_MENU",
    context_json: { activeMagId: magId },
  });

  const msg =
    `📖 *${mag.title}*\n\n` +
    `*Type:* ${mag.magazine_type}\n` +
    `*Pages:* ${mag.page_count}\n` +
    `*Audience:* ${mag.audience}\n` +
    `*Style:* ${mag.visual_style}\n` +
    `*Status:* ${mag.status}\n` +
    `*Created:* ${new Date(mag.created_at).toLocaleDateString("en-GB")}`;

  if (mag.cover_image_url) {
    try {
      await sendImageMessage(phone, mag.cover_image_url, `${mag.title} — Cover`);
    } catch (_) {}
  }

  await sendButtonMessage(phone, msg,
    [
      makeButton(`magexport_${magId}`, "📄 Export PDF"),
      makeButton(`magpreview_${magId}`, "👁️ Preview"),
      makeButton("mag_my", "🔙 My Magazines"),
    ],
    "Magazine Details"
  );
}

// ═══════════════════════════════════════════════════════
// PREVIEW
// ═══════════════════════════════════════════════════════

async function showPreview(phone: string, convId: string, magId: string): Promise<void> {
  const mag = await getMagazine(magId, phone);
  if (!mag) { await sendTextMessage(phone, "⚠️ Magazine not found."); return; }

  const pages = await getMagazinePages(magId);
  if (pages.length === 0) {
    await sendTextMessage(phone, "⚠️ No pages found for this magazine.");
    return;
  }

  await sendTextMessage(phone, `👁️ *Preview: ${mag.title}*\n\nSending page samples...`);

  // Send first 3 page previews
  const previewPages = pages.slice(0, 3);
  for (const p of previewPages) {
    let preview = `*Page ${p.page_number}: ${p.title}*\n\n`;
    preview += p.content.split("\n").slice(0, 8).join("\n");
    if (p.content.split("\n").length > 8) preview += "\n\n_...continued in PDF_";
    await sendTextMessage(phone, preview);

    if (p.image_url) {
      try {
        await sendImageMessage(phone, p.image_url, `Page ${p.page_number}`);
      } catch (_) {}
    }
  }

  await sendButtonMessage(phone,
    `📖 Preview complete!\n\n*${pages.length}* pages total.\n\nExport the full magazine as PDF?`,
    [
      makeButton(`magexport_${magId}`, "📄 Export PDF"),
      makeButton("mag_my", "🔙 My Magazines"),
    ],
    "Preview Complete"
  );
}

// ═══════════════════════════════════════════════════════
// EXPORT PDF
// ═══════════════════════════════════════════════════════

async function exportPdf(phone: string, convId: string, magId: string): Promise<void> {
  const mag = await getMagazine(magId, phone);
  if (!mag) { await sendTextMessage(phone, "⚠️ Magazine not found."); return; }

  // Return existing PDF if already generated
  if (mag.pdf_url) {
    await sendTextMessage(phone, `📄 Sending your PDF...`);
    try {
      await sendDocumentMessage(phone, mag.pdf_url, `${mag.title.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`, mag.title);
    } catch (e) {
      await sendTextMessage(phone, `📄 Download link: ${mag.pdf_url}`);
    }
    return;
  }

  await sendTextMessage(phone, `📄 *Generating PDF...*\n\nThis may take 30–60 seconds. Please wait...`);

  try {
    const pages = await getMagazinePages(magId);
    if (pages.length === 0) {
      await sendTextMessage(phone, "⚠️ No pages found.");
      return;
    }

    const pdfBytes = await buildMagazinePdf(
      {
        title: mag.title,
        topic: mag.topic,
        magazineType: mag.magazine_type,
        audience: mag.audience,
        visualStyle: mag.visual_style,
        template: mag.template,
        coverImageUrl: mag.cover_image_url,
      },
      pages
    );

    const pdfUrl = await uploadMagazinePdf(magId, pdfBytes);

    if (!pdfUrl) {
      await sendTextMessage(phone, "⚠️ Failed to save PDF. Please try again.");
      return;
    }

    await updateMagazine(magId, phone, { pdf_url: pdfUrl });

    await sendTextMessage(phone, `✅ *PDF Ready!*\n\nSending your magazine...`);
    try {
      await sendDocumentMessage(phone, pdfUrl, `${mag.title.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`, mag.title);
    } catch (e) {
      await sendTextMessage(phone, `📄 Download link:\n${pdfUrl}`);
    }

    await sendButtonMessage(phone,
      `📖 *${mag.title}* PDF delivered!`,
      [
        makeButton("mag_my", "📚 My Magazines"),
        makeButton("mag_create", "🆕 Create Another"),
        makeButton("mag_back_main", "🏠 Main Menu"),
      ],
      "PDF Complete"
    );
  } catch (err) {
    safeErrorLog("exportPdf", err);
    await sendTextMessage(phone, "⚠️ PDF generation failed. Please try again later.");
  }
}

// ═══════════════════════════════════════════════════════
// DELETE
// ═══════════════════════════════════════════════════════

async function showDeleteList(phone: string, convId: string): Promise<void> {
  const mags = await getUserMagazines(phone);
  if (mags.length === 0) {
    await sendButtonMessage(phone,
      `🗑️ *Delete Magazine*\n\nYou have no magazines to delete.`,
      [makeButton("mag_back", "🔙 Studio Menu")],
      "Delete"
    );
    return;
  }

  const rows = mags.slice(0, 10).map((m: any) =>
    makeListRow(`magdel_${m.id}`, (m.title || "Untitled").substring(0, 24), `${m.page_count}p • ${m.status}`)
  );
  rows.push(makeListRow("mag_back", "🔙 Studio Menu", ""));

  await sendListMessage(phone,
    `🗑️ *Delete Magazine*\n\nSelect a magazine to delete:`,
    "Delete",
    [{ title: "Magazines", rows }],
    "Delete", "Magazine Studio"
  );
}

async function confirmDelete(phone: string, convId: string, magId: string): Promise<void> {
  const mag = await getMagazine(magId, phone);
  if (!mag) { await sendTextMessage(phone, "⚠️ Magazine not found."); return; }

  await sendButtonMessage(phone,
    `⚠️ *Confirm Deletion*\n\nAre you sure you want to delete:\n\n*${mag.title}*?\n\nThis cannot be undone.`,
    [
      makeButton(`magdelconfirm_${magId}`, "✅ Yes, Delete"),
      makeButton("mag_back", "❌ Cancel"),
    ],
    "Confirm Delete"
  );
}

// ═══════════════════════════════════════════════════════
// REGENERATE IMAGE
// ═══════════════════════════════════════════════════════

async function regenerateImage(phone: string, convId: string, pageId: string, magId?: string): Promise<void> {
  if (!magId) {
    await sendTextMessage(phone, "⚠️ Active magazine not found.");
    return;
  }

  const pages = await getMagazinePages(magId);
  const page = pages.find((p: any) => p.id === pageId);
  if (!page) { await sendTextMessage(phone, "⚠️ Page not found."); return; }

  await sendTextMessage(phone, `🖼️ Regenerating image for *${page.title}*...`);

  const mag = await getMagazine(magId, phone);
  if (!mag) return;

  const newPrompt = buildImagePrompt(page.page_type, mag.topic, mag.visual_style, page.title);
  const newImage = await generateImage(newPrompt, 1024, 768);

  if (newImage) {
    await updateMagazinePage(pageId, { image_url: newImage, image_prompt: newPrompt });
    await sendImageMessage(phone, newImage, `New image: ${page.title}`);
    await sendTextMessage(phone, `✅ Image regenerated successfully!`);
  } else {
    await sendTextMessage(phone, `⚠️ Image generation failed. Please try again.`);
  }
}
