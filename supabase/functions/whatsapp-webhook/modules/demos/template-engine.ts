
import type { SupabaseClient } from
  "https://esm.sh/@supabase/supabase-js@2.39.8";

export type DemoMenuItem = {
  id: string;
  label: string;
};

export type DemoDefinition = {
  welcome?: string;
  menu?: DemoMenuItem[];
  disclaimer?: string;
  [key: string]: unknown;
};

export type DemoTemplate = {
  id: string;
  slug: string;
  version: number;
  title: string;
  industry_key: string;
  description: string;
  keywords: string[];
  main_needs: string[];
  definition: DemoDefinition;
  status: "draft" | "active" | "archived";
};

export type DemoRequest = {
  businessName: string;
  category: string;
  mainNeed: string;
};

export type RenderedDemo = {
  templateId: string;
  templateSlug: string;
  title: string;
  businessName: string;
  category: string;
  mainNeed: string;
  welcome: string;
  menu: DemoMenuItem[];
  disclaimer: string;
};

const CATEGORY_ALIASES: Record<string, string[]> = {
  hotel: ["hotel", "guest house", "accommodation", "lodging"],
  shortlet: ["shortlet", "short let", "apartment", "holiday rental"],
  school: ["school", "education", "academy", "college"],
  event_centre: ["event centre", "event planner", "venue", "wedding"],
  car_dealer: ["car dealer", "automobile", "vehicle", "car sales"],
  real_estate: ["real estate", "property", "estate agent"],
  retail: ["retail", "shop", "supermarket", "store"],
  restaurant: ["restaurant", "food", "eatery", "catering"],
  digital_agency: ["digital agency", "IT services", "software", "web design"],
  clinic: ["clinic", "healthcare", "hospital", "medical"],
  professional: ["consultant", "lawyer", "accountant", "professional services"],
  beauty: ["salon", "beauty", "barber", "spa", "makeup"],
  logistics: ["logistics", "delivery", "dispatch", "courier"],
  other: ["other", "general business"],
};

const DEFAULT_MENU: DemoMenuItem[] = [
  { id: "services", label: "View services" },
  { id: "enquiries", label: "Make an enquiry" },
  { id: "agent", label: "Talk to an agent" },
];

const DEFAULT_DISCLAIMER =
  "This is a demonstration. No real booking, order, payment, " +
  "or notification has been made.";

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPhrase(text: string, phrase: string): boolean {
  const normalizedText = ` ${normalize(text)} `;
  const normalizedPhrase = ` ${normalize(phrase)} `;

  return normalizedText.includes(normalizedPhrase);
}

function cleanBusinessName(name: string): string {
  const cleaned = name
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.slice(0, 100) || "Your Business";
}

function renderText(
  value: string,
  request: DemoRequest,
): string {
  return value
    .replace(/\{\{business_name\}\}/g, request.businessName)
    .replace(/\{\{category\}\}/g, request.category)
    .replace(/\{\{main_need\}\}/g, request.mainNeed);
}

/**
 * Deterministic category matching.
 * Returns "other" when no known category is matched.
 */
export function classifyDemoCategory(input: string): string {
  const text = normalize(input);

  let bestCategory = "other";
  let bestScore = 0;

  for (const [category, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (category === "other") continue;

    for (const alias of aliases) {
      const normalizedAlias = normalize(alias);

      if (
        text === normalizedAlias ||
        containsPhrase(text, normalizedAlias)
      ) {
        const score = normalizedAlias.length;

        if (score > bestScore) {
          bestCategory = category;
          bestScore = score;
        }
      }
    }
  }

  return bestCategory;
}

/**
 * Load one active template for the selected category.
 * If no category-specific template exists, use the safe fallback.
 */
export async function getDemoTemplate(
  supabase: SupabaseClient,
  categoryKey: string,
): Promise<DemoTemplate> {
  const { data: matching, error: matchingError } = await supabase
    .from("demo_templates")
    .select(
      "id,slug,version,title,industry_key,description," +
      "keywords,main_needs,definition,status",
    )
    .eq("industry_key", categoryKey)
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1);

  if (matchingError) {
    throw new Error(
      `Unable to load demo template: ${matchingError.message}`,
    );
  }

  if (matching?.length) {
    return matching[0] as DemoTemplate;
  }

  const { data: fallback, error: fallbackError } = await supabase
    .from("demo_templates")
    .select(
      "id,slug,version,title,industry_key,description," +
      "keywords,main_needs,definition,status",
    )
    .eq("slug", "generic-business-demo")
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fallbackError) {
    throw new Error(
      `Unable to load fallback demo: ${fallbackError.message}`,
    );
  }

  if (!fallback) {
    throw new Error(
      "No active category template or generic fallback exists.",
    );
  }

  return fallback as DemoTemplate;
}

/**
 * Build the personalized demo response.
 * The business name is always passed into the rendering stage.
 */
export function renderDemo(
  template: DemoTemplate,
  request: DemoRequest,
): RenderedDemo {
  const safeRequest: DemoRequest = {
    businessName: cleanBusinessName(request.businessName),
    category: request.category.trim().slice(0, 80) || "General Business",
    mainNeed: request.mainNeed.trim().slice(0, 300) || "General enquiries",
  };

  const definition = template.definition ?? {};

  const welcomeTemplate =
    typeof definition.welcome === "string"
      ? definition.welcome
      : "Welcome to {{business_name}}.";

  const menu = Array.isArray(definition.menu)
    ? definition.menu.filter((item): item is DemoMenuItem =>
        Boolean(
          item &&
          typeof item.id === "string" &&
          typeof item.label === "string",
        ),
      )
    : DEFAULT_MENU;

  const disclaimer =
    typeof definition.disclaimer === "string"
      ? definition.disclaimer
      : DEFAULT_DISCLAIMER;

  return {
    templateId: template.id,
    templateSlug: template.slug,
    title: template.title,
    businessName: safeRequest.businessName,
    category: safeRequest.category,
    mainNeed: safeRequest.mainNeed,
    welcome: renderText(welcomeTemplate, safeRequest),
    menu: menu.slice(0, 10).map((item) => ({
      id: item.id.slice(0, 50),
      label: renderText(item.label, safeRequest).slice(0, 80),
    })),
    disclaimer: renderText(disclaimer, safeRequest),
  };
}

/**
 * Main entry point for the future personalized-demo router.
 */
export async function buildPersonalizedDemo(
  supabase: SupabaseClient,
  input: DemoRequest,
): Promise<RenderedDemo> {
  const categoryKey = classifyDemoCategory(
    `${input.category} ${input.mainNeed}`,
  );

  const template = await getDemoTemplate(supabase, categoryKey);

  return renderDemo(template, {
    ...input,
    category: input.category || categoryKey,
  });
}
