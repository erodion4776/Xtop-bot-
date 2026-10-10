
/**
 * supabase/functions/whatsapp-webhook/modules/demos/personalized.ts
 *
 * Personalized business demo token handling and interactive demo actions.
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
 *
 * Deliberately avoids writing to an assumed database table.
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
 * Resolve the selected industry template from conversation context.
 */
function getTemplateKey(
  context: Record<string, unknown>,
): string {
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
 */
function getBusinessName(
  context: Record<string, unknown>,
): string {
  const value = context.businessName;

  return typeof value === "string" && value.trim()
    ? value.trim()
    : "Your Business";
}

/**
 * Show the welcome message and menu for the selected template.
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

  await sendTextMessage(
    phone,
    template.welcomeMessage(businessName),
  );

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
        title: "Business Demo",
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
 * Handle actions within an active personalized business demo.
 *
 * Returns true when this function handled the message.
 * Returns false when the message belongs to another workflow.
 */
export async function handlePersonalizedDemoAction(
  phone: string,
  text: string,
  interactiveId: string,
  conversation: Conversation,
): Promise<boolean> {
  const rawInput = (interactiveId || text || "").trim();
  const normalized = normalise(rawInput);

  const context = (
    conversation.context_json || {}
  ) as Record<string, unknown>;

  if (context.personalizedDemo !== true) {
    return false;
  }

  try {
    // View or return to the personalized demo.
    if (
      rawInput === "demo_view_my_biz" ||
      normalized === "view my demo" ||
      normalized === "my demo"
    ) {
      await showPersonalizedTemplate(
        phone,
        conversation.id,
        context,
      );
      return true;
    }

    // Show related industries.
    if (
      rawInput === "demo_try_related" ||
      normalized === "related demos" ||
      normalized === "related demo"
    ) {
      await showRelatedTemplates(
        phone,
        conversation.id,
        context,
      );
      return true;
    }

    // Launch the existing Xtop Tools menu.
    if (
      rawInput === "demo_try_tools" ||
      normalized === "free xtop tools" ||
      normalized === "xtop tools"
    ) {
      const { showToolsMenu } = await import("../tools.ts");

      await showToolsMenu(phone, conversation.id);
      return true;
    }

    // Route agent requests to the existing agent menu.
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

    // Switch to a related industry template.
    if (rawInput.startsWith("demo_related_")) {
      const selectedKey = rawInput.slice(
        "demo_related_".length,
      );

      const related = getRelatedTemplates(
        getTemplateKey(context),
      );

      const selected = related.find(
        (item) => item.key === selectedKey,
      );

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

    // Handle industry-specific sample menu selections.
    const template = getTemplate(getTemplateKey(context));
    const sampleResponse = template.sampleResponses[rawInput];

    if (sampleResponse) {
      const businessName = getBusinessName(context);

      await sendTextMessage(
        phone,
        sampleResponse(businessName),
      );

      await sendButtonMessage(
        phone,
        "What would you like to do next?",
        [
          makeButton(
            "demo_view_my_biz",
            "Business Menu",
          ),
          makeButton(
            "demo_try_related",
            "Related Demos",
          ),
          makeButton(
            "demo_try_tools",
            "Free Tools",
          ),
        ],
        "Personalized Demo",
      );

      return true;
    }

    // Unknown actions are left for the other Demo Centre handlers.
    return false;
  } catch (error) {
    safeErrorLog(
      "handlePersonalizedDemoAction",
      error,
    );

    await sendTextMessage(
      phone,
      "⚠️ We could not open that demo option right now. Please try again or type *menu*.",
    );

    return true;
  }
}

/**
 * Handle a customer opening a personalized demo using a token.
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
    safeErrorLog(
      "handlePersonalizedDemoToken: validation failed",
      error,
    );

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
    safeErrorLog(
      "handlePersonalizedDemoToken: lead creation failed",
      error,
    );
  }

  if (!leadId) {
    await sendTextMessage(
      phone,
      "⚠️ Your demo reference is valid, but we could not save your enquiry right now.\n\nPlease try again shortly or contact Xtop on 08024988555.",
    );

    return true;
  }

  const templateKey =
    validated.demoTemplate ||
    classifyCategory(validated.businessCategory);

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

  await sendTextMessage(
    phone,
    `Hello *${validated.businessName}*! 👋\n\n` +
      "Welcome to your personalized Xtop WhatsApp business demo.\n\n" +
      "Explore how a WhatsApp system could help your business present services, handle enquiries, collect leads, and connect customers to your team.\n\n" +
      "All examples use demonstration data. No real transactions are processed.",
  );

  await sendButtonMessage(
    phone,
    "👇 Choose an option:",
    [
      makeButton(
        "demo_view_my_biz",
        "View My Demo",
      ),
      makeButton(
        "demo_try_related",
        "Related Demos",
      ),
      makeButton(
        "demo_try_tools",
        "Free Xtop Tools",
      ),
    ],
    "Personalized Demo",
  );

  await sendTextMessage(
    phone,
    "Or type *agent* anytime to talk to our team.",
  );

  return true;
}
