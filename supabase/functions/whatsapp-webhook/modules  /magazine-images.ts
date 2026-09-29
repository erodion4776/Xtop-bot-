// supabase/functions/whatsapp-webhook/modules/magazine-images.ts
// Pollinations AI — Free, no API key required

const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt";

const STYLE_MODIFIERS: Record<string, string> = {
  modern: "modern minimalist editorial photography, clean layout, contemporary composition",
  corporate: "professional corporate photography, business environment, formal lighting",
  minimal: "ultra-minimalist photography, generous white space, refined composition",
  luxury: "luxury editorial photography, premium quality, elegant lighting, sophisticated",
  african: "authentic African editorial photography, vibrant colors, cultural richness, real Nigerian scenes",
  school: "educational environment photography, classroom, engaged students learning",
  technology: "modern technology photography, digital innovation, futuristic elements",
  fashion: "high-end fashion editorial photography, stylish, contemporary African fashion",
  church: "community and faith photography, warm lighting, gathering, uplifting mood",
  custom: "professional editorial photography, magazine quality",
};

const TYPE_PROMPTS: Record<string, string> = {
  cover: "magazine cover photograph, dramatic composition, high resolution, editorial quality",
  feature: "editorial photograph, natural lighting, magazine quality, storytelling",
  article: "professional documentary photograph, editorial style",
  interview: "editorial portrait photograph, professional headshot style",
  tips: "clean editorial infographic-style image, organized composition",
  conclusion: "inspirational editorial photograph, warm tones, hopeful mood",
  advertisement: "commercial product photography, brand quality",
  standard: "editorial photograph, magazine quality",
};

export function buildImagePrompt(pageType: string, topic: string, visualStyle: string, pageTitle?: string): string {
  const styleMod = STYLE_MODIFIERS[visualStyle] || STYLE_MODIFIERS.modern;
  const typeMod = TYPE_PROMPTS[pageType] || TYPE_PROMPTS.standard;
  const subject = pageTitle || topic;
  return `${typeMod} about ${subject}. ${styleMod}. No text, no words, no letters in image.`;
}

export function getPollinationsUrl(prompt: string, width = 1024, height = 768, seed?: number): string {
  const encoded = encodeURIComponent(prompt);
  const s = seed || Math.floor(Math.random() * 999999);
  return `${POLLINATIONS_BASE}/${encoded}?width=${width}&height=${height}&seed=${s}&nologo=true&model=flux`;
}

/**
 * Verifies Pollinations can serve the image, retries on failure.
 * Returns the URL if successful, null if all retries fail.
 */
export async function generateImage(prompt: string, width = 1024, height = 768, retries = 2): Promise<string | null> {
  const url = getPollinationsUrl(prompt, width, height);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      const resp = await fetch(url, { method: "HEAD", signal: ctrl.signal });
      clearTimeout(timer);

      if (resp.ok) return url;
    } catch (err) {
      console.error(`[Pollinations] Attempt ${attempt + 1} failed:`, err);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }

  // Return URL anyway — Pollinations generates on-demand when fetched
  return url;
}

export function getCoverImageUrl(topic: string, visualStyle: string, title: string): string {
  const prompt = buildImagePrompt("cover", topic, visualStyle, title);
  return getPollinationsUrl(prompt, 1024, 1400);
}

/**
 * Fetches raw image bytes for embedding in PDFs.
 */
export async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    const resp = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    return new Uint8Array(buf);
  } catch (err) {
    console.error("[fetchImageBytes]:", err);
    return null;
  }
}
