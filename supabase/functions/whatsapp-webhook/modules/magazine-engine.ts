// supabase/functions/whatsapp-webhook/modules/magazine-engine.ts
// Deterministic Magazine Content Engine

import { buildImagePrompt } from "./magazine-images.ts";

export interface PagePlan {
  page_number: number;
  page_type: string;
  title: string;
  layout_type: string;
}

// ═══════════════════════════════════════════════════════
// PAGE STRUCTURE GENERATOR
// ═══════════════════════════════════════════════════════

export function generatePagePlan(pageCount: number, magazineType: string, topic: string): PagePlan[] {
  const plans: PagePlan[] = [];
  const t = magazineType.toLowerCase();

  plans.push({ page_number: 1, page_type: "cover", title: "Cover", layout_type: "cover" });

  if (pageCount >= 2) {
    plans.push({ page_number: 2, page_type: "editorial", title: "Editor's Note", layout_type: "standard" });
  }

  if (pageCount >= 3) {
    plans.push({ page_number: 3, page_type: "feature", title: `Main Feature: ${trimTopic(topic)}`, layout_type: "feature" });
  }

  if (pageCount >= 4) {
    plans.push({ page_number: 4, page_type: "article", title: `In-Depth: ${trimTopic(topic)}`, layout_type: "standard" });
  }

  if (pageCount >= 5) {
    plans.push({ page_number: 5, page_type: "article", title: getSecondaryTitle(t, topic), layout_type: "standard" });
  }

  if (pageCount >= 6) {
    plans.push({ page_number: 6, page_type: "tips", title: getTipsTitle(t), layout_type: "tips" });
  }

  if (pageCount >= 7) {
    plans.push({ page_number: 7, page_type: "interview", title: getInterviewTitle(t), layout_type: "interview" });
  }

  if (pageCount >= 8) {
    plans.push({ page_number: 8, page_type: "conclusion", title: "Conclusion & Contact", layout_type: "standard" });
  }

  // Fill extra pages (9+)
  if (pageCount > 8) {
    const extras = getExtraPages(t, topic, pageCount - 8);
    extras.forEach((ep, i) => {
      plans.push({ page_number: 9 + i, ...ep });
    });
  }

  // Ensure last page is always conclusion for longer magazines
  if (plans.length > 8 && plans[plans.length - 1].page_type !== "conclusion") {
    plans[plans.length - 1] = {
      page_number: plans.length,
      page_type: "conclusion",
      title: "Conclusion & Contact",
      layout_type: "standard",
    };
  }

  return plans.slice(0, pageCount);
}

function trimTopic(topic: string): string {
  const words = topic.split(" ");
  return words.length > 6 ? words.slice(0, 6).join(" ") + "..." : topic;
}

function getSecondaryTitle(type: string, topic: string): string {
  const map: Record<string, string> = {
    business: "Growth Strategies for Modern Enterprises",
    technology: "Emerging Technologies Shaping the Future",
    education: "Innovative Teaching Methods",
    school: "Student Achievements & Activities",
    church: "Community Outreach & Ministry",
    fashion: "Trending Styles & Emerging Designers",
    entertainment: "Industry Spotlight & Reviews",
    "health & lifestyle": "Wellness & Healthy Living",
    agriculture: "Sustainable Farming Practices",
    "news/current affairs": "In-Depth Analysis & Reports",
  };
  return map[type] || `Exploring ${trimTopic(topic)}`;
}

function getTipsTitle(type: string): string {
  const map: Record<string, string> = {
    business: "5 Business Growth Tips",
    technology: "Top Tech Tools You Should Know",
    education: "Study Tips for Success",
    school: "Academic Excellence Tips",
    church: "Faith & Community Tips",
    fashion: "Style Tips for Every Occasion",
    "health & lifestyle": "Daily Health Tips",
    agriculture: "Farming Best Practices",
  };
  return map[type] || "Key Tips & Takeaways";
}

function getInterviewTitle(type: string): string {
  const map: Record<string, string> = {
    business: "Entrepreneur Spotlight Interview",
    technology: "Tech Leader Q&A",
    education: "Educator's Perspective",
    church: "Pastor's Message",
    fashion: "Designer Interview",
    "health & lifestyle": "Health Expert Q&A",
  };
  return map[type] || "Featured Interview";
}

function getExtraPages(type: string, topic: string, count: number): Array<{ page_type: string; title: string; layout_type: string }> {
  const pool = [
    { page_type: "article", title: "Industry Trends & Forecast", layout_type: "standard" },
    { page_type: "tips", title: "Quick Facts & Highlights", layout_type: "tips" },
    { page_type: "article", title: "Case Study: Real-World Success", layout_type: "feature" },
    { page_type: "advertisement", title: "Advertisement", layout_type: "standard" },
    { page_type: "article", title: "Reader's Corner", layout_type: "standard" },
    { page_type: "interview", title: "Expert Roundtable", layout_type: "interview" },
    { page_type: "tips", title: "Resource Guide", layout_type: "tips" },
    { page_type: "article", title: `Special Report: ${trimTopic(topic)}`, layout_type: "feature" },
    { page_type: "article", title: "Community Voices", layout_type: "standard" },
    { page_type: "tips", title: "Did You Know?", layout_type: "tips" },
    { page_type: "article", title: "Looking Ahead", layout_type: "standard" },
    { page_type: "advertisement", title: "Partner Spotlight", layout_type: "standard" },
  ];
  return pool.slice(0, count);
}

// ═══════════════════════════════════════════════════════
// TITLE SUGGESTIONS
// ═══════════════════════════════════════════════════════

export function generateTitleSuggestions(topic: string, magazineType: string): string[] {
  const t = magazineType.toLowerCase();
  const topicShort = topic.split(" ").slice(0, 3).join(" ");

  const templates: Record<string, string[]> = {
    business: [
      `${topicShort} Business Review`,
      `The Growth Quarterly`,
      `Naija Business Insider`,
      `Enterprise ${topicShort}`,
      `The Business Frontier`,
    ],
    technology: [
      `${topicShort} Tech Digest`,
      `Digital ${topicShort} Today`,
      `The Tech Frontier`,
      `Future Tech Nigeria`,
      `Innovation Hub`,
    ],
    education: [
      `${topicShort} Education Review`,
      `The Learning Journal`,
      `EduFocus Magazine`,
      `The Knowledge Hub`,
      `Academic Insights`,
    ],
    school: [
      `${topicShort} School Magazine`,
      `The Campus Chronicle`,
      `Student Voice Weekly`,
      `Academic Excellence Review`,
      `The School Gazette`,
    ],
    church: [
      `${topicShort} Faith Magazine`,
      `The Grace Quarterly`,
      `Community Voice`,
      `Kingdom Living Today`,
      `The Fellowship Journal`,
    ],
    fashion: [
      `${topicShort} Style Magazine`,
      `The Fashion Edit`,
      `AfroStyle Quarterly`,
      `The Look Book`,
      `Vogue ${topicShort}`,
    ],
    "health & lifestyle": [
      `${topicShort} Health & Wellness`,
      `The Wellness Journal`,
      `Healthy Life Nigeria`,
      `The Vitality Report`,
      `Living Well Today`,
    ],
  };

  return templates[t] || [
    `${topicShort} Magazine`,
    `The ${topicShort} Review`,
    `${topicShort} Today`,
    `The ${topicShort} Quarterly`,
    `${topicShort} Digest`,
  ];
}

// ═══════════════════════════════════════════════════════
// CONTENT GENERATOR (Deterministic Templates)
// ═══════════════════════════════════════════════════════

export interface MagazineConfig {
  title: string;
  topic: string;
  audience: string;
  writingStyle: string;
  visualStyle: string;
  magazineType: string;
}

export function generatePageContent(page: PagePlan, config: MagazineConfig): { content: string; imagePrompt: string } {
  const content = generateTextForPage(page, config);
  const imagePrompt = buildImagePrompt(page.page_type, config.topic, config.visualStyle, page.title);
  return { content, imagePrompt };
}

function generateTextForPage(page: PagePlan, config: MagazineConfig): string {
  const { title: magTitle, topic, audience, writingStyle, magazineType } = config;
  const styleTone = getStyleTone(writingStyle);

  switch (page.page_type) {
    case "cover":
      return [
        magTitle,
        "",
        topic,
        "",
        `Issue 1 | ${new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`,
        "",
        `For ${audience}`,
      ].join("\n");

    case "editorial":
      return [
        `Welcome to ${magTitle}`,
        "",
        `Dear Reader,`,
        "",
        `${styleTone.greeting} In this edition, we take a close look at ${topic}. Our aim is to provide ${audience} with practical insights, thoughtful perspectives, and useful information.`,
        "",
        `Whether you are just beginning to explore this area or you already have deep experience, we hope you will find something valuable in these pages.`,
        "",
        `Thank you for reading, and we wish you an enjoyable and informative experience.`,
        "",
        `— The Editorial Team`,
      ].join("\n");

    case "feature":
      return [
        page.title,
        "",
        `Introduction`,
        "",
        `In today's world, ${topic} has become one of the most important subjects for ${audience}. This feature examines the key developments, opportunities, and considerations that define this space.`,
        "",
        `The Current Landscape`,
        "",
        `The landscape of ${topic} has changed significantly in recent years. ${audience} across the region are increasingly recognizing the importance of understanding and engaging with these developments.`,
        "",
        `Key Themes`,
        "",
        `Several themes stand out:`,
        "",
        `• Innovation is reshaping the way ${audience} approach this space.`,
        `• Accessibility to relevant tools and resources continues to expand.`,
        `• Community and collaboration play a growing role in progress.`,
        "",
        `Practical Considerations`,
        "",
        `For ${audience} who want to engage meaningfully with ${topic}, consider these practical steps: stay informed through credible sources, connect with peers and mentors, and take small, deliberate actions that build over time.`,
        "",
        `Looking Ahead`,
        "",
        `As ${topic} continues to evolve, ${audience} who remain curious, adaptable, and engaged will be best positioned to benefit from what comes next.`,
      ].join("\n");

    case "interview":
      return [
        page.title,
        "",
        `A conversation on ${topic}, with insights for ${audience}.`,
        "",
        `Q: Tell us about your work in this area.`,
        "",
        `A: My journey began with a strong interest in ${topic}. Over the years, I have seen how much can change and how much opportunity exists, particularly for ${audience} who take the time to engage seriously.`,
        "",
        `Q: What are the biggest challenges you see today?`,
        "",
        `A: The biggest challenge is staying current. The pace of change in ${topic} is significant, and ${audience} benefit greatly from reliable, well-organized information.`,
        "",
        `Q: What advice would you give to someone just starting out?`,
        "",
        `A: Start with the fundamentals. Build a strong foundation, learn from others, and stay patient. Progress compounds over time.`,
        "",
        `Q: Where do you see this field going in the next few years?`,
        "",
        `A: I am optimistic. ${topic} will become more integrated into everyday life, and ${audience} will have access to tools and opportunities that we can only begin to imagine.`,
      ].join("\n");

    case "tips":
      return [
        page.title,
        "",
        `Practical guidance for ${audience} interested in ${topic}:`,
        "",
        `1. Start Small`,
        `Begin with manageable steps. You do not need to master everything about ${topic} at once.`,
        "",
        `2. Stay Informed`,
        `Follow reliable sources and thought leaders. Good information is a strong foundation.`,
        "",
        `3. Build a Network`,
        `Connect with other ${audience} who share your interest. Learning together is powerful.`,
        "",
        `4. Use the Right Tools`,
        `Take advantage of digital tools and platforms that make your work easier and more effective.`,
        "",
        `5. Be Consistent`,
        `Regular, steady engagement usually produces better results than short bursts of intense activity.`,
      ].join("\n");

    case "conclusion":
      return [
        `Thank You for Reading`,
        "",
        `Thank you for spending time with this issue of ${magTitle}.`,
        "",
        `We hope the articles and insights in these pages have offered valuable perspectives on ${topic}. Our commitment is to continue delivering relevant, useful content for ${audience}.`,
        "",
        `Get in Touch`,
        "",
        `We would love to hear from you. Share your feedback, story ideas, or questions:`,
        "",
        `Email: info@xtopretail.com`,
        `WhatsApp: +234 807 315 8887`,
        `Website: naijashop.com.ng`,
        "",
        `Next Issue`,
        "",
        `Stay tuned for our next edition, where we will continue exploring new angles on ${topic}.`,
        "",
        `Published by Xtop Retail Technologies`,
        `Powered by Magazine Studio`,
      ].join("\n");

    case "advertisement":
      return [
        page.title,
        "",
        `[Advertisement Space]`,
        "",
        `This premium space is available for your brand.`,
        "",
        `Reach ${audience} directly through ${magTitle}.`,
        "",
        `Contact us for advertising rates and packages:`,
        "",
        `Email: info@xtopretail.com`,
        `WhatsApp: +234 807 315 8887`,
      ].join("\n");

    default:
      return [
        page.title,
        "",
        `${topic} continues to be a subject of significant interest for ${audience}.`,
        "",
        `In this section, we examine recent developments and offer practical perspectives that ${audience} can apply.`,
        "",
        `Key Points`,
        "",
        `• The area of ${topic} continues to evolve.`,
        `• ${audience} are finding new ways to engage with it.`,
        `• Practical tools and resources are increasingly accessible.`,
        "",
        `Reflection`,
        "",
        `Taking time to understand ${topic} more deeply can lead to meaningful insights and opportunities for ${audience} who invest in the learning process.`,
      ].join("\n");
  }
}

function getStyleTone(style: string): { greeting: string } {
  const map: Record<string, { greeting: string }> = {
    Professional: { greeting: "We are pleased to bring you this edition." },
    Educational: { greeting: "This edition is designed to inform and educate." },
    "Simple & Friendly": { greeting: "It's great to have you with us again!" },
    Inspirational: { greeting: "May this edition inspire fresh thinking and new possibilities." },
    "News Style": { greeting: "This edition brings you the latest developments and analysis." },
    "Business Style": { greeting: "This edition delivers focused, actionable business intelligence." },
  };
  return map[style] || map["Professional"];
}
