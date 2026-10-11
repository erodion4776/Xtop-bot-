/**
 * supabase/functions/whatsapp-webhook/modules/demos/personalized.ts
 *
 * Personalized business demo token handling, structured business requests,
 * and interactive demo actions with robust multi-format field extraction.
 */

import {
  Contact,
  Conversation,
  updateConversation,
  createDemoLead,
} from "../../database.ts";

import {
  sendTextMessage,
  sendButtonMessage,
  sendListMessage,
  makeButton,
  makeListRow,
} from "../../whatsapp.ts";

import { normalise, safeErrorLog } from "../../utils.ts";

import {
  validateToken,
  type ValidatedToken,
} from "./tokens.ts";

import {
  getTemplate,
  getRelatedTemplates,
  classifyCategory,
} from "./templates.ts";

/**
 * Small local event logger.
 */
function logEvent(
  phone: string,
  event: string,
  leadId: string | null,
  metadata: Record<string, unknown> = {},
): void {
  console.log("[PersonalizedDemo]", {
    phone,
    event,
    leadId,
    metadata,
  });
}

/**
 * Field pattern definitions allowing flexible user inputs (with/without colons, dashes, etc.)
 */
const FIELD_LABELS = {
  name: [
    "business\\s*name",
    "company\\s*name",
    "brand\\s*name",
    "restaurant\\s*name",
    "hotel\\s*name",
    "business",
  ],
  category: [
    "business\\s*category",
    "business\\s*type",
    "category",
    "industry",
    "sector",
  ],
  need: [
    "main\\s*need",
    "business\\s*need",
    "main\\s*needs",
    "needs?",
    "requirements?",
    "use\\s*case",
    "goal",
  ],
};

const ALL_LABEL_PATTERNS = [
  ...FIELD_LABELS.name,
  ...FIELD_LABELS.category,
  ...FIELD_LABELS.need,
].join("|");

/**
 * Clean and sanitize extracted user values.
 */
function cleanExtractedValue(val: string): string {
  return val
    .trim()
    .replace(/^[:=-]\s*/, "")
    .replace(/[\s.?!;,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

/**
 * Extract field values even when punctuation, colons, or line breaks are omitted.
 */
function extractFieldValue(text: string, labelPatterns: string[]): string {
  const labelGroup = `(?:${labelPatterns.join("|")})`;
  const separatorGroup = `(?:\\s*[:=-]\\s*|\\s+is\\s+|\\s+)`;
  const nextFieldBoundary = `(?=\\s*(?:[.;\\n]+\\s*|\\s+)(?:${ALL_LABEL_PATTERNS})(?:\\s*[:=-]|\\s+is|\\s+[A-Za-z0-9]|$)|$)`;

  const pattern = new RegExp(
    `${labelGroup}${separatorGroup}([\\s\\S]*?)${nextFieldBoundary}`,
    "i",
  );

  const match = text.match(pattern);
  if (!match || !match[1]) return "";

  return cleanExtractedValue(match[1]);
}

/**
 * Resolve the selected industry template from conversation context.
 */
function getTemplateKey(context: Record<string, unknown>): string {
  const selected = context.demoTemplate;

  if (typeof selected === "string" && selected.trim()) {
    return selected.trim().toLowerCase();
  }

  const category =
    typeof context.businessCategory === "string"
      ? context.businessCategory
      : "";

  return classifyCategory(category);
}

/**
 * Get the business name stored in the personalized demo context.
 * Gracefully guards against "undefined", "null", or raw token placeholders.
 */
export function getBusinessName(context: Record<string, unknown>): string {
  const value = context.businessName;

  if (typeof value === "string" && value.trim()) {
    const clean = cleanExtractedValue(value);
    if (
      clean.length > 0 &&
      !/^(?:undefined|null|none|n\/a|your business|xtd_[a-z0-9_-]+)$/i.test(clean)
    ) {
      return clean;
    }
  }

  return "Your Business";
}

/**
 * Show the welcome message and interactive menu for the selected template.
 */
async function showPersonalizedTemplate(
  phone: string,
  conversationId: string,
  context: Record<string, unknown>,
  templateKey = getTemplateKey(context),
): Promise<void> {
  const businessName = getBusinessName(context);
  const template = getTemplate(templateKey);

  const updatedContext = {
    ...context,
    demoTemplate: template.key,
    personalizedDemo: true,
  };

  await updateConversation(conversationId, {
    current_module: "DEMOS",
    current_state: "PERSONALIZED_MENU",
    context_json: updatedContext,
  });

  // 1. Send personalized welcome greeting
  await sendTextMessage(
    phone,
    template.welcomeMessage(businessName, typeof context.businessNeed === "string" ? context.businessNeed : undefined),
  );

  // 2. Build Interactive List menu
  const rows = template.menuOptions.map((option) =>
    makeListRow(
      option.id,
      option.title,
      option.description,
    )
  );

  rows.push(
    makeListRow(
      "demo_try_related",
      "Related Demos",
      "Explore similar industries",
    ),
  );

  rows.push(
    makeListRow(
      "demo_try_tools",
      "Free Xtop Tools",
      "Explore available tools",
    ),
  );

  rows.push(
    makeListRow(
      "demo_agent",
      "Talk to an Agent",
      "Contact the Xtop team",
    ),
  );

  await sendListMessage(
    phone,
    template.menuBody(businessName) +
      "\n\n⚠️ _Demonstration only. No real transactions are processed._",
    "Explore Demo",
    [
      {
        title: `${businessName} Demo`,
        rows,
      },
    ],
    "Xtop Demo Centre",
    "Personalized Demo",
  );
}

/**
 * Display related industry templates.
 */
async function showRelatedTemplates(
  phone: string,
  conversationId: string,
  context: Record<string, unknown>,
): Promise<void> {
  const templateKey = getTemplateKey(context);
  const related = getRelatedTemplates(templateKey);

  if (related.length === 0) {
    await sendTextMessage(
      phone,
      "No related demos are available for this category yet.",
    );

    await showPersonalizedTemplate(
      phone,
      conversationId,
      context,
      templateKey,
    );
    return;
  }

  const rows = related.map((item) =>
    makeListRow(
      `demo_related_${item.key}`,
      `${item.icon} ${item.label}`,
      "Explore this business demo",
    )
  );

  rows.push(
    makeListRow(
      "demo_view_my_biz",
      "Back to My Demo",
      "Return to your business demo",
    ),
  );

  await updateConversation(conversationId, {
    current_module: "DEMOS",
    current_state: "PERSONALIZED_RELATED",
    context_json: {
      ...context,
      personalizedDemo: true,
    },
  });

  await sendListMessage(
    phone,
    "🔎 *Related Business Demos*\n\nChoose another industry to explore. This changes the example you are viewing, not your saved business details.",
    "Related Demos",
    [
      {
        title: "Suggested Demos",
        rows,
      },
    ],
    "Xtop Demo Centre",
    "Related Industries",
  );
}

/**
 * Handle a complete structured personalized demo request.
 */
export async function handleStructuredPersonalizedDemoRequest(
  phone: string,
  text: string,
  contact: Contact,
  conversation: Conversation,
): Promise<boolean> {
  if (!text || text.length > 10000) {
    return false;
  }

  const looksLikeDemoRequest =
    /personali[sz]ed\s+(?:whatsapp\s+)?demo/i.test(text) ||
    (/demo/i.test(text) &&
      /business\s*name|company\s*name/i.test(text) &&
      (/category|industry|type/i.test(text) || /need|requirement/i.test(text)));

  if (!looksLikeDemoRequest) {
    return false;
  }

  const businessName = extractFieldValue(text, FIELD_LABELS.name);
  const businessCategory = extractFieldValue(text, FIELD_LABELS.category);
  const businessNeed = extractFieldValue(text, FIELD_LABELS.need);

  // If core fields cannot be resolved, allow other handlers to process
  if (!businessName || (!businessCategory && !businessNeed)) {
    return false;
  }

  const effectiveCategory = businessCategory || "General Business";
  const templateKey = classifyCategory(effectiveCategory);
  const template = getTemplate(templateKey);

  let leadId: string | null = null;

  try {
    const lead = await createDemoLead(
      phone,
      contact.name || "Prospect",
      businessName,
      effectiveCategory,
      template.existingDemoId || template.key,
      `${businessName} — ${template.label} Personalized Demo`,
      `Main need: ${businessNeed || "General Enquiry"}`,
    );

    leadId = typeof lead?.id === "string" ? lead.id : null;
  } catch (error) {
    safeErrorLog(
      "handleStructuredPersonalizedDemoRequest: lead creation failed",
      error,
    );
  }

  const context: Record<string, unknown> = {
    personalizedDemo: true,
    businessName,
    businessCategory: effectiveCategory,
    demoTemplate: template.key,
    businessNeed: businessNeed || "General Enquiry",
    requirements: `Main need: ${businessNeed || "General Enquiry"}`,
    businessConfigId: null,
    tokenPrefix: "DIRECT",
    leadId,
    onboardingComplete: true,
  };

  await updateConversation(conversation.id, {
    current_module: "DEMOS",
    current_state: "PERSONALIZED_MENU",
    context_json: context,
  });

  logEvent(phone, "structured_demo_request", leadId, {
    business: businessName,
    category: effectiveCategory,
    template: template.key,
    mainNeed: businessNeed,
  });

  // Acknowledgment message with captured business details
  await sendTextMessage(
    phone,
    `Thank you! I have your personalized demo request.\n\n` +
      `*Business:* ${businessName}\n` +
      `*Category:* ${effectiveCategory}\n` +
      `*Main need:* ${businessNeed || "General Demo"}\n\n` +
      `Opening your ${template.label} demo now.` +
      (leadId
        ? "\n\nYour enquiry has also been recorded for the Xtop team."
        : "\n\n_Note: Your enquiry could not be saved just now, but you can still explore the demo._"),
  );

  // Open the customized category template
  await showPersonalizedTemplate(
    phone,
    conversation.id,
    context,
    template.key,
  );

  return true;
}

/**
 * Handle actions within an active personalized business demo.
 */
export async function handlePersonalizedDemoAction(
  phone: string,
  text: string,
  interactiveId: string,
  conversation: Conversation,
): Promise<boolean> {
  const rawInput = (interactiveId || text || "").trim();
  const normalized = normalise(rawInput);

  const context = (conversation.context_json || {}) as Record<string, unknown>;

  if (context.personalizedDemo !== true) {
    return false;
  }

  try {
    if (
      rawInput === "demo_view_my_biz" ||
      normalized === "view my demo" ||
      normalized === "my demo"
    ) {
      await showPersonalizedTemplate(phone, conversation.id, context);
      return true;
    }

    if (
      rawInput === "demo_try_related" ||
      normalized === "related demos" ||
      normalized === "related demo"
    ) {
      await showRelatedTemplates(phone, conversation.id, context);
      return true;
    }

    if (
      rawInput === "demo_try_tools" ||
      normalized === "free xtop tools" ||
      normalized === "xtop tools"
    ) {
      const { showToolsMenu } = await import("../tools.ts");
      await showToolsMenu(phone, conversation.id);
      return true;
    }

    if (
      rawInput === "demo_agent" ||
      normalized === "agent" ||
      normalized === "talk to an agent" ||
      normalized === "talk to agent"
    ) {
      const { showAgentCategories } = await import("../agents.ts");
      await showAgentCategories(phone, conversation.id);
      return true;
    }

    if (rawInput.startsWith("demo_related_")) {
      const selectedKey = rawInput.slice("demo_related_".length);
      const related = getRelatedTemplates(getTemplateKey(context));
      const selected = related.find((item) => item.key === selectedKey);

      if (!selected) {
        await sendTextMessage(
          phone,
          "That related demo is unavailable. Please choose an option from the list.",
        );
        return true;
      }

      await showPersonalizedTemplate(
        phone,
        conversation.id,
        context,
        selected.key,
      );
      return true;
    }

    // Handle template sample responses with the dynamic business name
    const template = getTemplate(getTemplateKey(context));
    const sampleResponse = template.sampleResponses[rawInput];

    if (sampleResponse) {
      const businessName = getBusinessName(context);

      await sendTextMessage(phone, sampleResponse(businessName));

      await sendButtonMessage(
        phone,
        "What would you like to do next?",
        [
          makeButton("demo_view_my_biz", "Business Menu"),
          makeButton("demo_try_related", "Related Demos"),
          makeButton("demo_try_tools", "Free Tools"),
        ],
        "Personalized Demo",
      );

      return true;
    }

    return false;
  } catch (error) {
    safeErrorLog("handlePersonalizedDemoAction", error);
    await sendTextMessage(
      phone,
      "⚠️ We could not open that demo option right now. Please try again or type *menu*.",
    );
    return true;
  }
}

/**
 * Handle a customer opening a personalized demo using a pre-generated link/token.
 */
export async function handlePersonalizedDemoToken(
  phone: string,
  text: string,
  token: string,
  contact: Contact,
  conversation: Conversation,
): Promise<boolean> {
  let validated: ValidatedToken | null;

  try {
    validated = await validateToken(token, text);
  } catch (error) {
    safeErrorLog("handlePersonalizedDemoToken: validation failed", error);
    await sendTextMessage(
      phone,
      "⚠️ We could not verify that demo reference right now.\n\nPlease try again shortly, or type *menu* to explore our demos.",
    );
    return true;
  }

  if (!validated) {
    logEvent(phone, "invalid_token", null, {
      prefix: token.substring(0, 8),
    });

    await sendTextMessage(
      phone,
      "⚠️ This demo reference is invalid, expired, or unavailable.\n\nYou can still explore our demos. Type *menu* to continue.",
    );
    return true;
  }

  let leadId: string | null = null;

  try {
    const lead = await createDemoLead(
      phone,
      contact.name || "Prospect",
      validated.businessName,
      validated.businessCategory,
      validated.demoTemplate,
      `${validated.businessName} Demo`,
      `Token ${validated.tokenPrefix}`,
    );

    leadId = lead?.id || null;
  } catch (error) {
    safeErrorLog("handlePersonalizedDemoToken: lead creation failed", error);
  }

  const templateKey =
    validated.demoTemplate || classifyCategory(validated.businessCategory);

  const updatedContext = {
    personalizedDemo: true,
    businessName: validated.businessName,
    businessCategory: validated.businessCategory,
    demoTemplate: templateKey,
    businessConfigId: validated.businessConfigId,
    tokenPrefix: validated.tokenPrefix,
    leadId,
  };

  logEvent(phone, "inbound_demo_request", leadId, {
    business: validated.businessName,
    campaign: validated.campaignSource,
  });

  await updateConversation(conversation.id, {
    current_module: "DEMOS",
    current_state: "PERSONALIZED_WELCOME",
    context_json: updatedContext,
  });

  await showPersonalizedTemplate(
    phone,
    conversation.id,
    updatedContext,
    templateKey,
  );

  return true;
}
