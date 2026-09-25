// supabase/functions/whatsapp-webhook/modules/tools.ts
// Phase 6 — Free Utility Tools (Weather, News, Calculator, Currency, QR, Quotes)

import {
  Contact,
  Conversation,
  updateConversation,
} from "../database.ts";
import {
  sendButtonMessage,
  sendListMessage,
  sendTextMessage,
  sendImageMessage,
  makeButton,
  makeListRow,
} from "../whatsapp.ts";
import { normalise, isBack, extractSelection, safeErrorLog } from "../utils.ts";
import { showMainMenu } from "./main-menu.ts";

// ═══════════════════════════════════════════════════════
// MAIN TOOLS HANDLER
// ═══════════════════════════════════════════════════════

export async function handleTools(
  phone: string,
  text: string,
  contact: Contact,
  conv: Conversation,
  interactiveId?: string
): Promise<void> {
  const rawInput = (interactiveId || text || "").trim();
  const n = normalise(rawInput);
  const state = conv.current_state;

  // 1. Explicit Navigation to Main Menu
  if (n === "menu_home" || n === "main_menu" || n === "main menu") {
    await updateConversation(conv.id, {
      current_module: "MAIN_MENU",
      current_state: "IDLE",
      context_json: {},
    });
    await showMainMenu(phone, conv.id);
    return;
  }

  // 2. Explicit Navigation to Tools Menu (Never route to Main Menu!)
  if (
    rawInput === "tools_all" ||
    rawInput === "tool_menu" ||
    rawInput === "tools_menu" ||
    n === "all tools" ||
    n === "tools" ||
    n === "free tools"
  ) {
    await showToolsMenu(phone, conv.id);
    return;
  }

  // 3. Handle Back Button cleanly
  if (isBack(rawInput) || rawInput === "tool_back_menu" || rawInput === "tools_back_menu") {
    if (state && state !== "SHOWING_TOOLS" && state !== "ENTRY" && state !== "IDLE") {
      await showToolsMenu(phone, conv.id);
    } else {
      await updateConversation(conv.id, {
        current_module: "MAIN_MENU",
        current_state: "IDLE",
        context_json: {},
      });
      await showMainMenu(phone, conv.id);
    }
    return;
  }

  // 4. Action Buttons (Re-run tools)
  if (rawInput === "tool_weather" || n.includes("check another")) {
    await prepareWeather(phone, conv.id);
    return;
  }
  if (rawInput === "tool_calc" || n.includes("calculate again")) {
    await prepareCalculator(phone, conv.id);
    return;
  }
  if (rawInput === "tool_currency" || n.includes("convert again")) {
    await prepareCurrency(phone, conv.id);
    return;
  }
  if (rawInput === "tool_qr" || n.includes("generate another")) {
    await prepareQR(phone, conv.id);
    return;
  }
  if (rawInput === "tool_quote" || n.includes("new quote") || n.includes("another quote")) {
    await fetchAndSendQuote(phone, conv.id);
    return;
  }

  // 5. State-based Input Processing
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

  // 6. Tool Selection from Menu
  await processToolSelection(phone, rawInput, conv);
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
    `🧰 *Xtop Free Utilities & Tools*\n\nUseful daily tools you can use directly on WhatsApp without leaving the chat.\n\n👇 *Select a tool below to begin:*`,
    "Choose Tool",
    [
      {
        title: "Information & Updates",
        rows: [
          makeListRow("tool_weather", "1️⃣ Weather Forecast", "Live weather for any Nigerian or world city"),
          makeListRow("tool_news", "2️⃣ News Headlines", "Latest Nigerian & global news"),
          makeListRow("tool_quote", "3️⃣ Quote of the Day", "Daily motivation & inspiration"),
        ],
      },
      {
        title: "Calculators & Utilities",
        rows: [
          makeListRow("tool_calc", "4️⃣ Quick Calculator", "Solve math & percentage calculations"),
          makeListRow("tool_currency", "5️⃣ Currency Converter", "Convert USD, GBP, EUR to NGN"),
          makeListRow("tool_qr", "6️⃣ QR Code Generator", "Create QR code image from URL or text"),
          makeListRow("tool_compress", "7️⃣ Image Compressor", "How to compress images for web"),
          makeListRow("tool_back_menu", "🔙 Main Menu", "Return to main home screen"),
        ],
      },
    ],
    "Xtop Free Tools",
    "Powered by Sabi"
  );
}

// ═══════════════════════════════════════════════════════
// TOOL SELECTION ROUTER
// ═══════════════════════════════════════════════════════

async function processToolSelection(
  phone: string,
  input: string,
  conv: Conversation
): Promise<void> {
  const n = normalise(input);
  const num = extractSelection(input);

  // 1. Weather
  if (input === "tool_weather" || num === 1 || n.includes("weather")) {
    await prepareWeather(phone, conv.id);
    return;
  }

  // 2. News
  if (input === "tool_news" || num === 2 || n.includes("news") || n.includes("headline")) {
    await fetchAndSendNews(phone, conv.id);
    return;
  }

  // 3. Quote
  if (input === "tool_quote" || num === 3 || n.includes("quote") || n.includes("motivation")) {
    await fetchAndSendQuote(phone, conv.id);
    return;
  }

  // 4. Calculator
  if (input === "tool_calc" || num === 4 || n.includes("calc") || n.includes("math")) {
    await prepareCalculator(phone, conv.id);
    return;
  }

  // 5. Currency
  if (input === "tool_currency" || num === 5 || n.includes("currency") || n.includes("convert") || n.includes("fx")) {
    await prepareCurrency(phone, conv.id);
    return;
  }

  // 6. QR Code
  if (input === "tool_qr" || num === 6 || n.includes("qr")) {
    await prepareQR(phone, conv.id);
    return;
  }

  // 7. Image Compressor
  if (input === "tool_compress" || num === 7 || n.includes("compress") || n.includes("image")) {
    await sendTextMessage(
      phone,
      `🖼️ *Image Compressor*\n\n` +
      `To compress an image for fast loading:\n\n` +
      `1️⃣ Open your *Xtop Portal / Admin Panel*\n` +
      `2️⃣ Go to *Media Upload*\n` +
      `3️⃣ Select your photo — our automated compression pipeline will reduce the file size up to *90%* under 300KB while preserving crisp resolution!`
    );
    await sendButtonMessage(
      phone,
      "Would you like to try another tool?",
      [
        makeButton("tools_all", "🧰 All Tools"),
        makeButton("menu_home", "🏠 Main Menu"),
      ],
      "Image Compressor"
    );
    await updateConversation(conv.id, {
      current_module: "TOOLS",
      current_state: "SHOWING_TOOLS",
      context_json: {},
    });
    return;
  }

  // Fallback: Re-show Tools Menu
  await showToolsMenu(phone, conv.id);
}

// ═══════════════════════════════════════════════════════
// PREPARATION PROMPTS
// ═══════════════════════════════════════════════════════

async function prepareWeather(phone: string, conversationId: string): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "TOOLS",
    current_state: "WAITING_WEATHER_CITY",
    context_json: { activeTool: "weather" },
  });
  await sendTextMessage(
    phone,
    `🌤️ *Weather Forecast*\n\nEnter the name of any city to get today's forecast:\n\n_Examples:_\n• *Lagos*\n• *Abuja*\n• *Benin City*\n• *Port Harcourt*\n• *London*`
  );
}

async function prepareCalculator(phone: string, conversationId: string): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "TOOLS",
    current_state: "WAITING_CALC_INPUT",
    context_json: { activeTool: "calculator" },
  });
  await sendTextMessage(
    phone,
    `🧮 *Quick Calculator*\n\nType any arithmetic expression and I will solve it:\n\n_Examples:_\n• *250000 * 0.075* (Calculate 7.5% VAT)\n• *(450000 - 65000) / 4*\n• *12500 * 12*\n• *3500 + 4200 + 8900*`
  );
}

async function prepareCurrency(phone: string, conversationId: string): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "TOOLS",
    current_state: "WAITING_CURRENCY_INPUT",
    context_json: { activeTool: "currency" },
  });
  await sendTextMessage(
    phone,
    `💱 *Currency Converter*\n\nEnter the amount and currencies you want to convert:\n\n_Examples:_\n• *100 USD to NGN*\n• *50 GBP to NGN*\n• *200 EUR to NGN*\n• *50000 NGN to USD*`
  );
}

async function prepareQR(phone: string, conversationId: string): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "TOOLS",
    current_state: "WAITING_QR_INPUT",
    context_json: { activeTool: "qr" },
  });
  await sendTextMessage(
    phone,
    `📱 *QR Code Generator*\n\nEnter any website link, WhatsApp number, or text to generate a QR code:\n\n_Examples:_\n• *https://naijashop.com.ng*\n• *https://wa.me/2348073158887*\n• *Payment Ref: XTR-89212*`
  );
}

// ═══════════════════════════════════════════════════════
// 1. WEATHER TOOL (Free — Open-Meteo API)
// ═══════════════════════════════════════════════════════

async function processWeatherQuery(
  phone: string,
  text: string,
  conv: Conversation
): Promise<void> {
  const city = text.trim();
  if (city.length < 2) {
    await sendTextMessage(phone, "⚠️ Please enter a valid city name (at least 2 characters):");
    return;
  }

  try {
    const geoResp = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en`
    );
    const geoData = await geoResp.json();

    if (!geoData.results || geoData.results.length === 0) {
      await sendTextMessage(phone, `❌ City "*${city}*" not found. Please check spelling and try again:`);
      return;
    }

    const loc = geoData.results[0];
    const weatherResp = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto`
    );
    const weatherData = await weatherResp.json();

    if (!weatherData.current) {
      await sendTextMessage(phone, "⚠️ Could not retrieve weather data. Please try again.");
      return;
    }

    const temp = weatherData.current.temperature_2m;
    const humidity = weatherData.current.relative_humidity_2m;
    const wind = weatherData.current.wind_speed_10m;
    const code = weatherData.current.weather_code;

    const msg =
      `${getWeatherEmoji(code)} *Weather in ${loc.name}, ${loc.country || ""}*\n\n` +
      `🌡️ *Temperature:* ${temp}°C\n` +
      `💧 *Humidity:* ${humidity}%\n` +
      `💨 *Wind Speed:* ${wind} km/h\n` +
      `☁️ *Condition:* ${getWeatherCondition(code)}\n\n` +
      `_Live forecast via Open-Meteo_`;

    await sendButtonMessage(
      phone,
      msg,
      [
        makeButton("tool_weather", "🌤️ Check Another"),
        makeButton("tools_all", "🧰 All Tools"),
        makeButton("menu_home", "🏠 Main Menu"),
      ],
      "Weather Report"
    );

    await updateConversation(conv.id, {
      current_module: "TOOLS",
      current_state: "SHOWING_TOOLS",
      context_json: {},
    });
  } catch (err) {
    safeErrorLog("weatherTool", err);
    await sendTextMessage(phone, "⚠️ Weather service is temporarily busy. Please try again in a moment.");
    await showToolsMenu(phone, conv.id);
  }
}

function getWeatherCondition(code: number): string {
  if (code === 0) return "Clear Sky ☀️";
  if (code <= 3) return "Partly Cloudy ⛅";
  if (code <= 48) return "Foggy 🌫️";
  if (code <= 57) return "Light Drizzle 🌦️";
  if (code <= 67) return "Rainy 🌧️";
  if (code <= 77) return "Snowy ❄️";
  if (code <= 82) return "Heavy Showers 🌊";
  if (code <= 99) return "Thunderstorm ⛈️";
  return "Sunny Intervals 🌤️";
}

function getWeatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 57) return "🌦️";
  if (code <= 82) return "🌧️";
  if (code <= 99) return "⛈️";
  return "🌤️";
}

// ═══════════════════════════════════════════════════════
// 2. NEWS HEADLINES (Free RSS)
// ═══════════════════════════════════════════════════════

async function fetchAndSendNews(phone: string, conversationId: string): Promise<void> {
  try {
    const resp = await fetch("https://api.rss2json.com/v1/api.json?rss_url=https://punchng.com/feed/&count=5");
    const data = await resp.json();

    if (data.status === "ok" && data.items && data.items.length > 0) {
      let msg = `📰 *Latest Nigerian News Headlines*\n\n`;
      data.items.slice(0, 5).forEach((item: any, i: number) => {
        msg += `*${i + 1}.* ${item.title?.trim() || "News Update"}\n\n`;
      });
      msg += `_Source: Punch Nigeria (Live Feed)_`;

      await sendButtonMessage(
        phone,
        msg,
        [
          makeButton("tool_news", "🔄 Refresh News"),
          makeButton("tools_all", "🧰 All Tools"),
          makeButton("menu_home", "🏠 Main Menu"),
        ],
        "News Headlines"
      );
    } else {
      await sendFallbackNews(phone);
    }
  } catch {
    await sendFallbackNews(phone);
  }

  await updateConversation(conversationId, {
    current_module: "TOOLS",
    current_state: "SHOWING_TOOLS",
    context_json: {},
  });
}

async function sendFallbackNews(phone: string): Promise<void> {
  const msg =
    `📰 *Top Technology & Business Trends*\n\n` +
    `*1.* WhatsApp Business API adoption grows 300% among retail vendors in Nigeria.\n\n` +
    `*2.* EdTech platforms record surge in automated CBT examinations.\n\n` +
    `*3.* Central Bank expands digital payment rails for SMEs.\n\n` +
    `*4.* AI-driven customer service bots reduce business response times under 60 seconds.`;

  await sendButtonMessage(
    phone,
    msg,
    [
      makeButton("tools_all", "🧰 All Tools"),
      makeButton("menu_home", "🏠 Main Menu"),
    ],
    "Business & Tech Trends"
  );
}

// ═══════════════════════════════════════════════════════
// 3. QUOTE OF THE DAY
// ═══════════════════════════════════════════════════════

async function fetchAndSendQuote(phone: string, conversationId: string): Promise<void> {
  const fallbackQuotes = [
    { q: "The secret of getting ahead is getting started.", a: "Mark Twain" },
    { q: "Opportunities don't happen. You create them.", a: "Chris Grosser" },
    { q: "Don't watch the clock; do what it does. Keep going.", a: "Sam Levenson" },
    { q: "Success is walking from failure to failure with no loss of enthusiasm.", a: "Winston Churchill" },
    { q: "Action is the foundational key to all success.", a: "Pablo Picasso" },
  ];

  let quote = fallbackQuotes[Math.floor(Math.random() * fallbackQuotes.length)];

  try {
    const resp = await fetch("https://zenquotes.io/api/random");
    const data = await resp.json();
    if (data && data[0] && data[0].q) {
      quote = { q: data[0].q, a: data[0].a || "Unknown" };
    }
  } catch (_) {}

  await sendButtonMessage(
    phone,
    `💡 *Quote of the Day*\n\n_"${quote.q}"_\n\n— *${quote.a}*`,
    [
      makeButton("tool_quote", "🔄 Another Quote"),
      makeButton("tools_all", "🧰 All Tools"),
      makeButton("menu_home", "🏠 Main Menu"),
    ],
    "Daily Inspiration"
  );

  await updateConversation(conversationId, {
    current_module: "TOOLS",
    current_state: "SHOWING_TOOLS",
    context_json: {},
  });
}

// ═══════════════════════════════════════════════════════
// 4. CALCULATOR
// ═══════════════════════════════════════════════════════

async function processCalculation(
  phone: string,
  text: string,
  conv: Conversation
): Promise<void> {
  const input = text.trim();
  let sanitized = input
    .replace(/x/gi, "*")
    .replace(/%/g, "/100*")
    .replace(/of/gi, "*")
    .replace(/,/g, "");

  if (!/^[\d\s\+\-\*\/\.\(\)]+$/.test(sanitized)) {
    await sendTextMessage(
      phone,
      "⚠️ Invalid expression. Please enter numbers and operators (+, -, *, /):\n\n_Example: 5000 * 12 or (250000 - 45000) / 4_"
    );
    return;
  }

  try {
    const result = Function(`"use strict"; return (${sanitized})`)();

    if (typeof result !== "number" || !isFinite(result)) {
      throw new Error("Math error");
    }

    const formatted = Number.isInteger(result)
      ? result.toLocaleString("en-NG")
      : result.toLocaleString("en-NG", { maximumFractionDigits: 4 });

    await sendButtonMessage(
      phone,
      `🧮 *Calculation Result:*\n\n*Expression:* \`${input}\`\n*Answer:* *${formatted}*`,
      [
        makeButton("tool_calc", "🧮 Calculate Again"),
        makeButton("tools_all", "🧰 All Tools"),
        makeButton("menu_home", "🏠 Main Menu"),
      ],
      "Quick Calculator"
    );

    await updateConversation(conv.id, {
      current_module: "TOOLS",
      current_state: "SHOWING_TOOLS",
      context_json: {},
    });
  } catch {
    await sendTextMessage(
      phone,
      "❌ Could not solve that expression. Please try a calculation like *5000 * 12* or *15000 / 3*:"
    );
  }
}

// ═══════════════════════════════════════════════════════
// 5. CURRENCY CONVERTER
// ═══════════════════════════════════════════════════════

async function processCurrencyConversion(
  phone: string,
  text: string,
  conv: Conversation
): Promise<void> {
  const input = text.trim().toUpperCase();
  const numMatch = input.match(/\d+(\.\d+)?/);
  const amount = numMatch ? parseFloat(numMatch[0]) : 100;

  let from = "USD";
  let to = "NGN";

  if (input.includes("GBP") || input.includes("£") || input.includes("POUND")) from = "GBP";
  else if (input.includes("EUR") || input.includes("€") || input.includes("EURO")) from = "EUR";
  else if (input.includes("NGN") && (input.includes("TO USD") || input.includes("IN USD"))) {
    from = "NGN";
    to = "USD";
  }

  try {
    const resp = await fetch(`https://open.er-api.com/v6/latest/${from}`);
    const data = await resp.json();

    if (data.result === "success" && data.rates && data.rates[to]) {
      const rate = data.rates[to];
      const converted = amount * rate;

      await sendButtonMessage(
        phone,
        `💱 *Live Currency Conversion*\n\n` +
        `• *Amount:* ${amount.toLocaleString()} ${from}\n` +
        `• *Exchange Rate:* 1 ${from} = ${rate.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${to}\n` +
        `• *Converted Total:* *${converted.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${to}*\n\n` +
        `_Rates updated: ${new Date().toLocaleDateString("en-GB")}_`,
        [
          makeButton("tool_currency", "💱 Convert Again"),
          makeButton("tools_all", "🧰 All Tools"),
          makeButton("menu_home", "🏠 Main Menu"),
        ],
        "Currency Converter"
      );
    } else {
      throw new Error("FX API issue");
    }
  } catch {
    const fallbackRates: Record<string, number> = { USD: 1485, GBP: 1920, EUR: 1615 };
    const rate = fallbackRates[from] || 1485;
    const converted = amount * rate;

    await sendButtonMessage(
      phone,
      `💱 *Indicative FX Conversion*\n\n` +
      `• *Amount:* ${amount.toLocaleString()} ${from}\n` +
      `• *Indicative Rate:* 1 ${from} ≈ ₦${rate.toLocaleString()} NGN\n` +
      `• *Estimated Total:* *₦${converted.toLocaleString()} NGN*`,
      [
        makeButton("tool_currency", "💱 Convert Again"),
        makeButton("tools_all", "🧰 All Tools"),
        makeButton("menu_home", "🏠 Main Menu"),
      ],
      "Currency Converter"
    );
  }

  await updateConversation(conv.id, {
    current_module: "TOOLS",
    current_state: "SHOWING_TOOLS",
    context_json: {},
  });
}

// ═══════════════════════════════════════════════════════
// 6. QR CODE GENERATOR
// ═══════════════════════════════════════════════════════

async function processQRGeneration(
  phone: string,
  text: string,
  conv: Conversation
): Promise<void> {
  const input = text.trim();
  if (!input) {
    await sendTextMessage(phone, "⚠️ Please enter a URL or text to generate a QR code:");
    return;
  }

  try {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(input)}`;

    await sendTextMessage(phone, `⏳ *Generating QR Code for:* \`${input.substring(0, 50)}\`...`);
    await sendImageMessage(phone, qrUrl, `QR Code: ${input.substring(0, 30)}`);

    await sendButtonMessage(
      phone,
      "✅ QR code generated! Scan using any smartphone camera.",
      [
        makeButton("tool_qr", "📱 Generate Another"),
        makeButton("tools_all", "🧰 All Tools"),
        makeButton("menu_home", "🏠 Main Menu"),
      ],
      "QR Generator"
    );

    await updateConversation(conv.id, {
      current_module: "TOOLS",
      current_state: "SHOWING_TOOLS",
      context_json: {},
    });
  } catch (err) {
    safeErrorLog("qrTool", err);
    await sendTextMessage(phone, "⚠️ Failed to generate QR code. Please try again.");
    await showToolsMenu(phone, conv.id);
  }
}
