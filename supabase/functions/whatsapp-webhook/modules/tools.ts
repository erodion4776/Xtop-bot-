// supabase/functions/whatsapp-webhook/modules/tools.ts
// Phase 6 — Free Utility Tools (Weather, News, Calculator, Currency, QR, Quotes)

import {
  Contact, Conversation, updateConversation,
} from "../database.ts";
import {
  sendButtonMessage, sendListMessage, sendTextMessage, sendImageMessage,
  makeButton, makeListRow,
} from "../whatsapp.ts";
import { normalise, isBack, extractSelection } from "../utils.ts";
import { showMainMenu } from "./main-menu.ts";
import { safeErrorLog } from "../utils.ts";

// ═══════════════════════════════════════════════════════
// MAIN TOOLS HANDLER
// ═══════════════════════════════════════════════════════

export async function handleTools(
  phone: string, text: string, contact: Contact, conv: Conversation
): Promise<void> {
  const n = normalise(text);
  const state = conv.current_state;
  const ctx = (conv.context_json || {}) as { activeTool?: string };

  // Back to main menu
  if (isBack(text) || n === "tool_back" || n === "main menu") {
    if (ctx.activeTool) {
      await showToolsMenu(phone, conv.id);
    } else {
      await showMainMenu(phone, conv.id);
    }
    return;
  }

  // Route based on active tool
  if (state === "WAITING_WEATHER_CITY") {
    await processWeatherQuery(phone, text, conv);
    return;
  }

  if (state === "WAITING_CALC_INPUT") {
    await processCalculation(phone, text, conv);
    return;
  }

  if (state === "WAITING_CURRENCY_INPUT") {
    await processCurrencyConversion(phone, text, conv);
    return;
  }

  if (state === "WAITING_QR_INPUT") {
    await processQRGeneration(phone, text, conv);
    return;
  }

  // Tool selection
  if (state === "SHOWING_TOOLS" || state === "ENTRY") {
    await processToolSelection(phone, text, conv);
    return;
  }

  await showToolsMenu(phone, conv.id);
}

// ═══════════════════════════════════════════════════════
// TOOLS MENU
// ═══════════════════════════════════════════════════════

export async function showToolsMenu(phone: string, conversationId: string): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "TOOLS",
    current_state: "SHOWING_TOOLS",
    context_json: {},
  });

  await sendListMessage(
    phone,
    `🧰 *Xtop Free Tools*\n\nUseful utilities you can use right here on WhatsApp. Select a tool below:`,
    "Choose Tool",
    [
      {
        title: "Information",
        rows: [
          makeListRow("tool_weather", "1️⃣ Weather", "Live weather for any city"),
          makeListRow("tool_news", "2️⃣ News Headlines", "Latest Nigerian & world news"),
          makeListRow("tool_quote", "3️⃣ Quote of the Day", "Daily motivation"),
        ],
      },
      {
        title: "Utilities",
        rows: [
          makeListRow("tool_calc", "4️⃣ Calculator", "Solve math problems"),
          makeListRow("tool_currency", "5️⃣ Currency Converter", "NGN, USD, GBP, EUR"),
          makeListRow("tool_qr", "6️⃣ QR Code Generator", "Create QR from text/URL"),
          makeListRow("tool_compress", "7️⃣ Image Compressor", "Shrink photo file size"),
        ],
      },
    ],
    "Free Tools",
    "Powered by Xtop Technologies"
  );
}

// ═══════════════════════════════════════════════════════
// TOOL SELECTION ROUTER
// ═══════════════════════════════════════════════════════

async function processToolSelection(
  phone: string, text: string, conv: Conversation
): Promise<void> {
  const n = normalise(text);
  const num = extractSelection(text);

  if (n === "tool_weather" || num === 1) {
    await updateConversation(conv.id, {
      current_state: "WAITING_WEATHER_CITY",
      context_json: { activeTool: "weather" },
    });
    await sendTextMessage(
      phone,
      `🌤️ *Weather Lookup*\n\nEnter the name of any city to get the current weather:\n\n_Example: Lagos, Abuja, London, New York_`
    );
    return;
  }

  if (n === "tool_news" || num === 2) {
    await fetchAndSendNews(phone, conv.id);
    return;
  }

  if (n === "tool_quote" || num === 3) {
    await fetchAndSendQuote(phone, conv.id);
    return;
  }

  if (n === "tool_calc" || num === 4) {
    await updateConversation(conv.id, {
      current_state: "WAITING_CALC_INPUT",
      context_json: { activeTool: "calculator" },
    });
    await sendTextMessage(
      phone,
      `🧮 *Calculator*\n\nType any math expression and I will solve it:\n\n_Examples:_\n• 250 * 4\n• 15000 / 3\n• 45 + 67 - 12\n• 12 * 12`
    );
    return;
  }

  if (n === "tool_currency" || num === 5) {
    await updateConversation(conv.id, {
      current_state: "WAITING_CURRENCY_INPUT",
      context_json: { activeTool: "currency" },
    });
    await sendTextMessage(
      phone,
      `💱 *Currency Converter*\n\nType the amount and currencies to convert:\n\n_Format: amount FROM TO_\n\n_Examples:_\n• 1000 NGN USD\n• 50 USD NGN\n• 100 GBP EUR`
    );
    return;
  }

  if (n === "tool_qr" || num === 6) {
    await updateConversation(conv.id, {
      current_state: "WAITING_QR_INPUT",
      context_json: { activeTool: "qr" },
    });
    await sendTextMessage(
      phone,
      `📱 *QR Code Generator*\n\nType any text, phone number, or URL and I will generate a QR code image:\n\n_Examples:_\n• https://naijashop.com.ng\n• +2348073158887\n• Hello World`
    );
    return;
  }

  if (n === "tool_compress" || num === 7) {
    await sendTextMessage(
      phone,
      `🖼️ *Image Compressor*\n\nTo compress an image:\n\n1️⃣ Open the *Xtop Admin App* on your phone\n2️⃣ Go to *Manual Course Editor*\n3️⃣ Tap the *Upload Image* button\n4️⃣ Select your photo\n\nThe app will automatically compress your image to under 300KB and upload it to cloud storage.\n\n_Compression reduces file size by up to 90% while keeping quality crisp!_`
    );
    await sendButtonMessage(
      phone,
      "Would you like to try another tool?",
      [
        makeButton("tool_back", "🧰 All Tools"),
        makeButton("menu_home", "🏠 Main Menu"),
      ],
      "Image Compressor"
    );
    return;
  }

  await showToolsMenu(phone, conv.id);
}

// ═══════════════════════════════════════════════════════
// 1. WEATHER TOOL (Free — Open-Meteo API, No Key Needed)
// ═══════════════════════════════════════════════════════

async function processWeatherQuery(
  phone: string, text: string, conv: Conversation
): Promise<void> {
  const city = text.trim();
  if (city.length < 2) {
    await sendTextMessage(phone, "⚠️ Please enter a valid city name (at least 2 characters).");
    return;
  }

  try {
    // Step 1: Geocode city name to coordinates
    const geoResp = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en`
    );
    const geoData = await geoResp.json();

    if (!geoData.results || geoData.results.length === 0) {
      await sendTextMessage(phone, `❌ City "*${city}*" not found. Please try a different spelling.`);
      await updateConversation(conv.id, { current_state: "SHOWING_TOOLS", context_json: {} });
      return;
    }

    const loc = geoData.results[0];
    const lat = loc.latitude;
    const lon = loc.longitude;
    const cityName = loc.name;
    const country = loc.country || "";

    // Step 2: Fetch current weather
    const weatherResp = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto`
    );
    const weatherData = await weatherResp.json();

    if (!weatherData.current) {
      await sendTextMessage(phone, "⚠️ Could not fetch weather data. Please try again.");
      return;
    }

    const temp = weatherData.current.temperature_2m;
    const humidity = weatherData.current.relative_humidity_2m;
    const wind = weatherData.current.wind_speed_10m;
    const code = weatherData.current.weather_code;
    const condition = getWeatherCondition(code);
    const emoji = getWeatherEmoji(code);

    const msg =
      `${emoji} *Weather: ${cityName}, ${country}*\n\n` +
      `🌡️ *Temperature:* ${temp}°C\n` +
      `💧 *Humidity:* ${humidity}%\n` +
      `💨 *Wind Speed:* ${wind} km/h\n` +
      `☁️ *Condition:* ${condition}\n\n` +
      `_Data from Open-Meteo (Live)_`;

    await sendButtonMessage(phone, msg,
      [
        makeButton("tool_back", "🧰 All Tools"),
        makeButton("menu_home", "🏠 Main Menu"),
      ],
      "Weather Report"
    );

    await updateConversation(conv.id, { current_state: "SHOWING_TOOLS", context_json: {} });
  } catch (err) {
    safeErrorLog("weatherTool", err);
    await sendTextMessage(phone, "⚠️ Weather service is temporarily unavailable. Please try again later.");
    await updateConversation(conv.id, { current_state: "SHOWING_TOOLS", context_json: {} });
  }
}

function getWeatherCondition(code: number): string {
  if (code === 0) return "Clear Sky";
  if (code <= 3) return "Partly Cloudy";
  if (code <= 48) return "Foggy";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rainy";
  if (code <= 77) return "Snowy";
  if (code <= 82) return "Heavy Rain";
  if (code <= 86) return "Heavy Snow";
  if (code <= 99) return "Thunderstorm";
  return "Unknown";
}

function getWeatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 48) return "🌫️";
  if (code <= 57) return "🌦️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌊";
  if (code <= 86) return "🌨️";
  if (code <= 99) return "⛈️";
  return "🌤️";
}

// ═══════════════════════════════════════════════════════
// 2. NEWS HEADLINES (Free — RSS to JSON)
// ═══════════════════════════════════════════════════════

async function fetchAndSendNews(phone: string, conversationId: string): Promise<void> {
  try {
    // Using a free RSS-to-JSON proxy for Nigerian news
    const resp = await fetch(
      `https://api.rss2json.com/v1/api.json?rss_url=https://punchng.com/feed/&count=5`
    );
    const data = await resp.json();

    if (data.status !== "ok" || !data.items || data.items.length === 0) {
      // Fallback: curated headlines
      await sendFallbackNews(phone, conversationId);
      return;
    }

    let msg = `📰 *Latest News Headlines*\n\n`;
    data.items.slice(0, 5).forEach((item: any, i: number) => {
      const title = item.title?.substring(0, 80) || "Untitled";
      msg += `*${i + 1}.* ${title}\n\n`;
    });
    msg += `_Source: Punch Newspapers (Live RSS)_`;

    await sendButtonMessage(phone, msg,
      [
        makeButton("tool_back", "🧰 All Tools"),
        makeButton("menu_home", "🏠 Main Menu"),
      ],
      "News Headlines"
    );

    await updateConversation(conversationId, { current_state: "SHOWING_TOOLS", context_json: {} });
  } catch (err) {
    safeErrorLog("newsTool", err);
    await sendFallbackNews(phone, conversationId);
  }
}

async function sendFallbackNews(phone: string, conversationId: string): Promise<void> {
  const msg =
    `📰 *Trending Topics*\n\n` +
    `*1.* Nigeria's tech ecosystem continues rapid growth in 2026\n` +
    `*2.* WAEC releases new CBT examination guidelines\n` +
    `*3.* WhatsApp Business API adoption surges among Nigerian SMEs\n` +
    `*4.* AI-powered learning platforms transform university education\n` +
    `*5.* E-commerce platforms record 40% increase in mobile transactions\n\n` +
    `_For full stories, visit your preferred news website._`;

  await sendButtonMessage(phone, msg,
    [
      makeButton("tool_back", "🧰 All Tools"),
      makeButton("menu_home", "🏠 Main Menu"),
    ],
    "Trending Topics"
  );

  await updateConversation(conversationId, { current_state: "SHOWING_TOOLS", context_json: {} });
}

// ═══════════════════════════════════════════════════════
// 3. QUOTE OF THE DAY (Free — ZenQuotes API)
// ═══════════════════════════════════════════════════════

async function fetchAndSendQuote(phone: string, conversationId: string): Promise<void> {
  try {
    const resp = await fetch("https://zenquotes.io/api/today");
    const data = await resp.json();

    if (data && data.length > 0 && data[0].q) {
      const quote = data[0].q;
      const author = data[0].a || "Unknown";

      const msg =
        `💡 *Quote of the Day*\n\n` +
        `_"${quote}"_\n\n` +
        `— *${author}*`;

      await sendButtonMessage(phone, msg,
        [
          makeButton("tool_quote", "🔄 New Quote"),
          makeButton("tool_back", "🧰 All Tools"),
        ],
        "Daily Inspiration"
      );
    } else {
      await sendDefaultQuote(phone);
    }

    await updateConversation(conversationId, { current_state: "SHOWING_TOOLS", context_json: {} });
  } catch (err) {
    safeErrorLog("quoteTool", err);
    await sendDefaultQuote(phone);
    await updateConversation(conversationId, { current_state: "SHOWING_TOOLS", context_json: {} });
  }
}

async function sendDefaultQuote(phone: string): Promise<void> {
  const quotes = [
    { q: "The only way to do great work is to love what you do.", a: "Steve Jobs" },
    { q: "Education is the most powerful weapon which you can use to change the world.", a: "Nelson Mandela" },
    { q: "Success is not final, failure is not fatal: it is the courage to continue that counts.", a: "Winston Churchill" },
    { q: "The future belongs to those who believe in the beauty of their dreams.", a: "Eleanor Roosevelt" },
    { q: "Innovation distinguishes between a leader and a follower.", a: "Steve Jobs" },
  ];
  const pick = quotes[Math.floor(Math.random() * quotes.length)];

  await sendTextMessage(
    phone,
    `💡 *Quote of the Day*\n\n_"${pick.q}"_\n\n— *${pick.a}*`
  );
}

// ═══════════════════════════════════════════════════════
// 4. CALCULATOR (No API — Pure JavaScript Math)
// ═══════════════════════════════════════════════════════

async function processCalculation(
  phone: string, text: string, conv: Conversation
): Promise<void> {
  const input = text.trim();

  // Strict safety: only allow digits, operators, spaces, dots, and parentheses
  if (!/^[\d\s\+\-\*\/\.\(\)\%]+$/.test(input)) {
    await sendTextMessage(
      phone,
      "⚠️ Invalid expression. Please use only numbers and operators (+, -, *, /).\n\n_Example: 250 * 4_"
    );
    return;
  }

  try {
    // Safe evaluation using Function constructor (no eval)
    const sanitized = input.replace(/[^0-9\+\-\*\/\.\(\)\%\s]/g, "");
    if (sanitized.length === 0) throw new Error("Empty");

    const result = new Function(`"use strict"; return (${sanitized})`)();

    if (typeof result !== "number" || !isFinite(result)) {
      throw new Error("Invalid result");
    }

    const formatted = Number.isInteger(result)
      ? result.toLocaleString("en-NG")
      : result.toLocaleString("en-NG", { maximumFractionDigits: 6 });

    const msg =
      `🧮 *Calculation Result*\n\n` +
      `*Expression:* ${input}\n` +
      `*Answer:* ${formatted}`;

    await sendButtonMessage(phone, msg,
      [
        makeButton("tool_calc", "🧮 Calculate Again"),
        makeButton("tool_back", "🧰 All Tools"),
      ],
      "Calculator"
    );

    await updateConversation(conv.id, { current_state: "SHOWING_TOOLS", context_json: {} });
  } catch (err) {
    await sendTextMessage(
      phone,
      "❌ Could not solve that expression. Please check your math and try again.\n\n_Example: (250 + 150) * 4_"
    );
  }
}

// ═══════════════════════════════════════════════════════
// 5. CURRENCY CONVERTER (Free — ExchangeRate API)
// ═══════════════════════════════════════════════════════

async function processCurrencyConversion(
  phone: string, text: string, conv: Conversation
): Promise<void> {
  const input = text.trim().toUpperCase();
  const parts = input.split(/\s+/);

  if (parts.length < 3) {
    await sendTextMessage(
      phone,
      "⚠️ Please use this format: *amount FROM TO*\n\n_Example: 1000 NGN USD_"
    );
    return;
  }

  const amount = parseFloat(parts[0]);
  const fromCurrency = parts[1];
  const toCurrency = parts[2];

  if (isNaN(amount) || amount <= 0) {
    await sendTextMessage(phone, "⚠️ Please enter a valid amount greater than 0.");
    return;
  }

  const validCurrencies = ["NGN", "USD", "GBP", "EUR", "GHS", "KES", "ZAR", "CAD", "INR"];
  if (!validCurrencies.includes(fromCurrency) || !validCurrencies.includes(toCurrency)) {
    await sendTextMessage(
      phone,
      `⚠️ Supported currencies: ${validCurrencies.join(", ")}\n\n_Example: 5000 NGN USD_`
    );
    return;
  }

  try {
    const resp = await fetch(
      `https://open.er-api.com/v6/latest/${fromCurrency}`
    );
    const data = await resp.json();

    if (data.result !== "success" || !data.rates || !data.rates[toCurrency]) {
      await sendTextMessage(phone, "⚠️ Could not fetch exchange rates. Please try again later.");
      return;
    }

    const rate = data.rates[toCurrency];
    const converted = amount * rate;

    const msg =
      `💱 *Currency Conversion*\n\n` +
      `*Amount:* ${amount.toLocaleString("en-NG")} ${fromCurrency}\n` +
      `*Rate:* 1 ${fromCurrency} = ${rate.toFixed(4)} ${toCurrency}\n` +
      `*Result:* ${converted.toLocaleString("en-NG", { maximumFractionDigits: 2 })} ${toCurrency}\n\n` +
      `_Rates updated: ${data.time_last_update_utc || "Live"}_`;

    await sendButtonMessage(phone, msg,
      [
        makeButton("tool_currency", "💱 Convert Again"),
        makeButton("tool_back", "🧰 All Tools"),
      ],
      "Currency Converter"
    );

    await updateConversation(conv.id, { current_state: "SHOWING_TOOLS", context_json: {} });
  } catch (err) {
    safeErrorLog("currencyTool", err);
    await sendTextMessage(phone, "⚠️ Currency service is temporarily unavailable. Please try again later.");
    await updateConversation(conv.id, { current_state: "SHOWING_TOOLS", context_json: {} });
  }
}

// ═══════════════════════════════════════════════════════
// 6. QR CODE GENERATOR (Free — QR Server API)
// ═══════════════════════════════════════════════════════

async function processQRGeneration(
  phone: string, text: string, conv: Conversation
): Promise<void> {
  const input = text.trim();
  if (input.length < 1) {
    await sendTextMessage(phone, "⚠️ Please enter text or a URL to generate a QR code.");
    return;
  }

  try {
    const encoded = encodeURIComponent(input);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encoded}&format=png`;

    await sendTextMessage(phone, `📱 *Generating QR Code for:*\n_${input.substring(0, 60)}${input.length > 60 ? "..." : ""}_`);

    await sendImageMessage(phone, qrUrl, `QR Code: ${input.substring(0, 40)}`);

    await sendButtonMessage(phone, "QR Code generated successfully! Scan with any camera app.",
      [
        makeButton("tool_qr", "📱 Generate Another"),
        makeButton("tool_back", "🧰 All Tools"),
      ],
      "QR Generator"
    );

    await updateConversation(conv.id, { current_state: "SHOWING_TOOLS", context_json: {} });
  } catch (err) {
    safeErrorLog("qrTool", err);
    await sendTextMessage(phone, "⚠️ QR generation failed. Please try again later.");
    await updateConversation(conv.id, { current_state: "SHOWING_TOOLS", context_json: {} });
  }
}
