// supabase/functions/whatsapp-webhook/modules/flight-checker.ts
// Flight Checker — Production-Ready, No AI, Provider-Abstracted

import {
  Contact, Conversation, updateConversation,
  logFlightSearch,
} from "./database.ts";
import {
  sendButtonMessage, sendListMessage, sendTextMessage,
  makeButton, makeListRow,
} from "./whatsapp.ts";
import { normalise, safeErrorLog } from "./utils.ts";
import { showMainMenu } from "./main-menu.ts";

// ═══════════════════════════════════════════════════════
// FLIGHT PROVIDER ABSTRACTION (Future-Ready)
// ═══════════════════════════════════════════════════════
// To swap providers later (e.g. FlightAware, AeroDataBox),
// only replace the FlightProvider implementation below.

interface FlightInfo {
  flight_number: string;
  airline: string;
  status: string;
  departure_airport: string;
  departure_iata: string;
  departure_scheduled: string;
  departure_actual: string | null;
  arrival_airport: string;
  arrival_iata: string;
  arrival_scheduled: string;
  arrival_actual: string | null;
}

interface AirportFlight {
  flight_number: string;
  airline: string;
  status: string;
  counterpart_airport: string;
  counterpart_iata: string;
  scheduled_time: string;
  actual_time: string | null;
}

interface FlightProvider {
  checkFlight(flightNumber: string): Promise<FlightInfo | null>;
  getDepartures(airportCode: string, date: string): Promise<AirportFlight[]>;
  getArrivals(airportCode: string, date: string): Promise<AirportFlight[]>;
}

// ── AviationStack Implementation (Default Provider) ──

class AviationStackProvider implements FlightProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = Deno.env.get("FLIGHT_API_KEY") || "";
    this.baseUrl = Deno.env.get("FLIGHT_API_BASE_URL") || "http://api.aviationstack.com/v1";
  }

  private async callApi(params: Record<string, string>): Promise<any> {
    if (!this.apiKey) {
      console.error("[FlightProvider] FLIGHT_API_KEY not configured in Supabase Secrets.");
      return null;
    }

    const query = new URLSearchParams({ access_key: this.apiKey, ...params });
    const url = `${this.baseUrl}/flights?${query.toString()}`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);

    try {
      const resp = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);

      if (!resp.ok) {
        console.error(`[FlightProvider] API returned ${resp.status}`);
        return null;
      }

      const data = await resp.json();

      if (data.error) {
        console.error(`[FlightProvider] API error: ${data.error.message}`);
        return null;
      }

      return data;
    } catch (err) {
      clearTimeout(timer);
      console.error("[FlightProvider] Request failed:", err);
      return null;
    }
  }

  async checkFlight(flightNumber: string): Promise<FlightInfo | null> {
    // Parse airline code + number (e.g. "BA75" -> iata="BA", number="75")
    const match = flightNumber.match(/^([A-Z]{2,3})(\d{1,5})$/);
    if (!match) return null;

    const airlineIata = match[1];
    const flightNum = match[2];

    const data = await this.callApi({
      flight_iata: `${airlineIata}${flightNum}`,
      limit: "1",
    });

    if (!data || !data.data || data.data.length === 0) return null;

    const f = data.data[0];
    return {
      flight_number: f.flight?.iata || flightNumber,
      airline: f.airline?.name || airlineIata,
      status: f.flight_status || "unknown",
      departure_airport: f.departure?.airport || "Unknown",
      departure_iata: f.departure?.iata || "—",
      departure_scheduled: f.departure?.scheduled || "—",
      departure_actual: f.departure?.actual || null,
      arrival_airport: f.arrival?.airport || "Unknown",
      arrival_iata: f.arrival?.iata || "—",
      arrival_scheduled: f.arrival?.scheduled || "—",
      arrival_actual: f.arrival?.actual || null,
    };
  }

  async getDepartures(airportCode: string, date: string): Promise<AirportFlight[]> {
    const data = await this.callApi({
      dep_iata: airportCode.toUpperCase(),
      flight_status: "active",
      limit: "10",
    });

    if (!data || !data.data) return [];

    return data.data.slice(0, 8).map((f: any) => ({
      flight_number: f.flight?.iata || "—",
      airline: f.airline?.name || "—",
      status: f.flight_status || "unknown",
      counterpart_airport: f.arrival?.airport || "Unknown",
      counterpart_iata: f.arrival?.iata || "—",
      scheduled_time: f.departure?.scheduled || "—",
      actual_time: f.departure?.actual || null,
    }));
  }

  async getArrivals(airportCode: string, date: string): Promise<AirportFlight[]> {
    const data = await this.callApi({
      arr_iata: airportCode.toUpperCase(),
      flight_status: "active",
      limit: "10",
    });

    if (!data || !data.data) return [];

    return data.data.slice(0, 8).map((f: any) => ({
      flight_number: f.flight?.iata || "—",
      airline: f.airline?.name || "—",
      status: f.flight_status || "unknown",
      counterpart_airport: f.departure?.airport || "Unknown",
      counterpart_iata: f.departure?.iata || "—",
      scheduled_time: f.arrival?.scheduled || "—",
      actual_time: f.arrival?.actual || null,
    }));
  }
}

// Singleton provider instance
const flightProvider: FlightProvider = new AviationStackProvider();

// ═══════════════════════════════════════════════════════
// INPUT VALIDATION & NORMALIZATION
// ═══════════════════════════════════════════════════════

function normalizeFlightNumber(raw: string): string | null {
  let f = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (/^[A-Z]{2,3}\d{1,5}$/.test(f)) return f;
  return null;
}

function normalizeAirportCode(raw: string): string | null {
  let a = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (/^[A-Z]{3}$/.test(a)) return a;
  return null;
}

function formatTime(isoString: string | null): string {
  if (!isoString || isoString === "—") return "—";
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
  } catch {
    return isoString;
  }
}

function statusEmoji(status: string): string {
  const s = status.toLowerCase();
  if (s === "scheduled" || s === "active") return "🟢";
  if (s === "delayed") return "🟠";
  if (s === "cancelled") return "🔴";
  if (s === "landed" || s === "arrived") return "🔵";
  if (s === "diverted") return "🟡";
  return "⚪";
}

function statusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === "scheduled") return "Scheduled";
  if (s === "active") return "In Flight";
  if (s === "delayed") return "Delayed";
  if (s === "cancelled") return "Cancelled";
  if (s === "landed" || s === "arrived") return "Landed";
  if (s === "diverted") return "Diverted";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// ═══════════════════════════════════════════════════════
// RATE LIMITER (20 searches per phone per hour)
// ═══════════════════════════════════════════════════════

const rlMap = new Map<string, number[]>();

function rateOk(phone: string, max = 20, windowMs = 3600000): boolean {
  const now = Date.now();
  const hits = (rlMap.get(phone) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) return false;
  hits.push(now);
  rlMap.set(phone, hits);
  return true;
}

// ═══════════════════════════════════════════════════════
// DISCLAIMER
// ═══════════════════════════════════════════════════════

const DISCLAIMER =
  "\n\n_⚠️ Flight information is provided through third-party aviation data services and may change. Confirm critical travel information with the airline or airport._";

// ═══════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════

export async function handleFlightChecker(
  phone: string, text: string,
  contact: Contact, conv: Conversation,
  interactiveId?: string
): Promise<void> {
  const raw = (interactiveId || text || "").trim();
  const n = normalise(raw);
  const state = conv.current_state;

  // ── Navigation ──
  if (n === "menu_home" || n === "main menu" || raw === "flight_back_main") {
    await updateConversation(conv.id, { current_module: "MAIN_MENU", current_state: "IDLE", context_json: {} });
    await showMainMenu(phone, conv.id);
    return;
  }
  if (raw === "flight_back" || n === "back" || n === "tools menu") {
    await showFlightMenu(phone, conv.id);
    return;
  }

  // ── Tool Selection ──
  if (raw === "flight_check" || n === "check flight") { await promptFlightNumber(phone, conv.id); return; }
  if (raw === "flight_departures" || n === "departures") { await promptDepartureAirport(phone, conv.id); return; }
  if (raw === "flight_arrivals" || n === "arrivals") { await promptArrivalAirport(phone, conv.id); return; }

  // ── Retries ──
  if (raw === "flight_retry_check") { await promptFlightNumber(phone, conv.id); return; }
  if (raw === "flight_retry_dep") { await promptDepartureAirport(phone, conv.id); return; }
  if (raw === "flight_retry_arr") { await promptArrivalAirport(phone, conv.id); return; }

  // ── State-based Input ──
  if (state === "FLIGHT_WAIT_NUMBER") {
    await doFlightCheck(phone, text, conv);
    return;
  }
  if (state === "FLIGHT_WAIT_DEP_AIRPORT") {
    await doDepartureAirport(phone, text, conv);
    return;
  }
  if (state === "FLIGHT_WAIT_DEP_DATE") {
    await doDepartureDate(phone, raw, conv);
    return;
  }
  if (state === "FLIGHT_WAIT_ARR_AIRPORT") {
    await doArrivalAirport(phone, text, conv);
    return;
  }
  if (state === "FLIGHT_WAIT_ARR_DATE") {
    await doArrivalDate(phone, raw, conv);
    return;
  }

  await showFlightMenu(phone, conv.id);
}

// ═══════════════════════════════════════════════════════
// MENU
// ═══════════════════════════════════════════════════════

export async function showFlightMenu(phone: string, convId: string): Promise<void> {
  await updateConversation(convId, { current_module: "TOOLS", current_state: "FLIGHT_MENU", context_json: {} });

  await sendListMessage(
    phone,
    `✈️ *FLIGHT TOOLS*\n\nCheck real-time flight status, departures, and arrivals.\n\n👇 *Select an option:*`,
    "Flight Tools",
    [{ title: "Available Tools", rows: [
      makeListRow("flight_check", "1️⃣ Check Flight", "Search by flight number"),
      makeListRow("flight_departures", "2️⃣ Departures", "View airport departures"),
      makeListRow("flight_arrivals", "3️⃣ Arrivals", "View airport arrivals"),
      makeListRow("flight_back_main", "🏠 Main Menu", "Return to home"),
    ]}],
    "Flight Tools", "Xtop Free Tools"
  );
}

// ═══════════════════════════════════════════════════════
// 1. CHECK FLIGHT
// ═══════════════════════════════════════════════════════

async function promptFlightNumber(phone: string, convId: string): Promise<void> {
  await updateConversation(convId, { current_module: "TOOLS", current_state: "FLIGHT_WAIT_NUMBER", context_json: {} });
  await sendTextMessage(phone,
    `✈️ *FLIGHT CHECKER*\n\nEnter the flight number.\n\n_Examples:_\n• BA75\n• AA123\n• TK628\n• ET901`
  );
}

async function doFlightCheck(phone: string, text: string, conv: Conversation): Promise<void> {
  if (!rateOk(phone)) {
    await sendTextMessage(phone, "⏳ You have reached the limit of 20 flight searches per hour. Please try again later.");
    await showFlightMenu(phone, conv.id);
    return;
  }

  const flightNumber = normalizeFlightNumber(text);
  if (!flightNumber) {
    await sendTextMessage(phone,
      "⚠️ Invalid flight number format.\n\nPlease enter a valid flight number like *BA75* or *AA123*:"
    );
    return;
  }

  await sendTextMessage(phone, `✈️ Checking flight *${flightNumber}*...\n\n_Please wait._`);

  const result = await flightProvider.checkFlight(flightNumber);

  if (!result) {
    await logFlightSearch(phone, "check_flight", flightNumber, null, "not_found");
    await sendButtonMessage(phone,
      `✈️ *FLIGHT STATUS*\n\nI couldn't obtain current information for *${flightNumber}*.\n\nPlease check the flight number and try again.${DISCLAIMER}`,
      [
        makeButton("flight_retry_check", "🔄 Try Again"),
        makeButton("flight_back", "✈️ Flight Menu"),
        makeButton("flight_back_main", "🏠 Main Menu"),
      ],
      "Flight Not Found"
    );
    await updateConversation(conv.id, { current_state: "FLIGHT_MENU", context_json: {} });
    return;
  }

  await logFlightSearch(phone, "check_flight", flightNumber, null, result.status);

  const depTime = formatTime(result.departure_actual || result.departure_scheduled);
  const arrTime = formatTime(result.arrival_actual || result.arrival_scheduled);
  const depLabel = result.departure_actual ? "Actual" : "Scheduled";
  const arrLabel = result.arrival_actual ? "Actual" : "Scheduled";

  const msg =
    `✈️ *FLIGHT STATUS*\n\n` +
    `*Flight:* ${result.flight_number}\n` +
    `*Airline:* ${result.airline}\n\n` +
    `🛫 *${result.departure_airport}* (${result.departure_iata})\n` +
    `${depLabel}: ${depTime}\n\n` +
    `🛬 *${result.arrival_airport}* (${result.arrival_iata})\n` +
    `${arrLabel}: ${arrTime}\n\n` +
    `*Status:*\n${statusEmoji(result.status)} ${statusLabel(result.status)}` +
    DISCLAIMER;

  await sendButtonMessage(phone, msg,
    [
      makeButton("flight_retry_check", "🔄 Check Another"),
      makeButton("flight_back", "✈️ Flight Menu"),
      makeButton("flight_back_main", "🏠 Main Menu"),
    ],
    "Flight Status"
  );

  await updateConversation(conv.id, { current_state: "FLIGHT_MENU", context_json: {} });
}

// ═══════════════════════════════════════════════════════
// 2. DEPARTURES
// ═══════════════════════════════════════════════════════

async function promptDepartureAirport(phone: string, convId: string): Promise<void> {
  await updateConversation(convId, { current_module: "TOOLS", current_state: "FLIGHT_WAIT_DEP_AIRPORT", context_json: {} });
  await sendTextMessage(phone,
    `🛫 *DEPARTURES*\n\nEnter the 3-letter airport code.\n\n_Examples:_\n• LOS (Lagos)\n• ABV (Abuja)\n• LHR (London Heathrow)\n• JFK (New York)`
  );
}

async function doDepartureAirport(phone: string, text: string, conv: Conversation): Promise<void> {
  const code = normalizeAirportCode(text);
  if (!code) {
    await sendTextMessage(phone, "⚠️ Invalid airport code. Please enter a 3-letter code like *LOS* or *LHR*:");
    return;
  }

  await updateConversation(conv.id, {
    current_state: "FLIGHT_WAIT_DEP_DATE",
    context_json: { airportCode: code },
  });

  await sendButtonMessage(phone,
    `🛫 *DEPARTURES FROM ${code}*\n\nSelect date:`,
    [
      makeButton("flight_dep_today", "📅 Today"),
      makeButton("flight_dep_tomorrow", "📅 Tomorrow"),
      makeButton("flight_back", "✈️ Flight Menu"),
    ],
    "Select Date"
  );
}

async function doDepartureDate(phone: string, raw: string, conv: Conversation): Promise<void> {
  if (!rateOk(phone)) {
    await sendTextMessage(phone, "⏳ Search limit reached (20/hour). Try again later.");
    await showFlightMenu(phone, conv.id);
    return;
  }

  const ctx = (conv.context_json || {}) as { airportCode?: string };
  const code = ctx.airportCode;
  if (!code) { await promptDepartureAirport(phone, conv.id); return; }

  const isToday = raw.includes("today");
  const date = isToday
    ? new Date().toISOString().split("T")[0]
    : new Date(Date.now() + 86400000).toISOString().split("T")[0];

  await sendTextMessage(phone, `🛫 Fetching departures from *${code}* for *${date}*...\n\n_Please wait._`);

  const flights = await flightProvider.getDepartures(code, date);

  await logFlightSearch(phone, "departures", null, code, flights.length > 0 ? "found" : "empty");

  if (flights.length === 0) {
    await sendButtonMessage(phone,
      `🛫 *DEPARTURES FROM ${code}*\n\nNo active departures found for *${date}*.\n\nThis may be because the airport code is incorrect or there are no scheduled flights.${DISCLAIMER}`,
      [
        makeButton("flight_retry_dep", "🔄 Try Another Airport"),
        makeButton("flight_back", "✈️ Flight Menu"),
        makeButton("flight_back_main", "🏠 Main Menu"),
      ],
      "No Departures"
    );
  } else {
    let msg = `🛫 *DEPARTURES FROM ${code}*\n📅 *${date}*\n\n`;

    flights.slice(0, 5).forEach((f, i) => {
      const time = formatTime(f.actual_time || f.scheduled_time);
      msg +=
        `*${i + 1}. ${f.flight_number}* — ${f.airline}\n` +
        `   Destination: ${f.counterpart_airport} (${f.counterpart_iata})\n` +
        `   Time: ${time}\n` +
        `   ${statusEmoji(f.status)} ${statusLabel(f.status)}\n\n`;
    });

    if (flights.length > 5) msg += `_...and ${flights.length - 5} more flights_`;
    msg += DISCLAIMER;

    await sendButtonMessage(phone, msg,
      [
        makeButton("flight_retry_dep", "🔄 Check Another"),
        makeButton("flight_back", "✈️ Flight Menu"),
        makeButton("flight_back_main", "🏠 Main Menu"),
      ],
      "Departures"
    );
  }

  await updateConversation(conv.id, { current_state: "FLIGHT_MENU", context_json: {} });
}

// ═══════════════════════════════════════════════════════
// 3. ARRIVALS
// ═══════════════════════════════════════════════════════

async function promptArrivalAirport(phone: string, convId: string): Promise<void> {
  await updateConversation(convId, { current_module: "TOOLS", current_state: "FLIGHT_WAIT_ARR_AIRPORT", context_json: {} });
  await sendTextMessage(phone,
    `🛬 *ARRIVALS*\n\nEnter the 3-letter airport code.\n\n_Examples:_\n• LOS (Lagos)\n• ABV (Abuja)\n• LHR (London Heathrow)`
  );
}

async function doArrivalAirport(phone: string, text: string, conv: Conversation): Promise<void> {
  const code = normalizeAirportCode(text);
  if (!code) {
    await sendTextMessage(phone, "⚠️ Invalid airport code. Please enter a 3-letter code like *LOS* or *LHR*:");
    return;
  }

  await updateConversation(conv.id, {
    current_state: "FLIGHT_WAIT_ARR_DATE",
    context_json: { airportCode: code },
  });

  await sendButtonMessage(phone,
    `🛬 *ARRIVALS AT ${code}*\n\nSelect date:`,
    [
      makeButton("flight_arr_today", "📅 Today"),
      makeButton("flight_arr_tomorrow", "📅 Tomorrow"),
      makeButton("flight_back", "✈️ Flight Menu"),
    ],
    "Select Date"
  );
}

async function doArrivalDate(phone: string, raw: string, conv: Conversation): Promise<void> {
  if (!rateOk(phone)) {
    await sendTextMessage(phone, "⏳ Search limit reached (20/hour). Try again later.");
    await showFlightMenu(phone, conv.id);
    return;
  }

  const ctx = (conv.context_json || {}) as { airportCode?: string };
  const code = ctx.airportCode;
  if (!code) { await promptArrivalAirport(phone, conv.id); return; }

  const isToday = raw.includes("today");
  const date = isToday
    ? new Date().toISOString().split("T")[0]
    : new Date(Date.now() + 86400000).toISOString().split("T")[0];

  await sendTextMessage(phone, `🛬 Fetching arrivals at *${code}* for *${date}*...\n\n_Please wait._`);

  const flights = await flightProvider.getArrivals(code, date);

  await logFlightSearch(phone, "arrivals", null, code, flights.length > 0 ? "found" : "empty");

  if (flights.length === 0) {
    await sendButtonMessage(phone,
      `🛬 *ARRIVALS AT ${code}*\n\nNo active arrivals found for *${date}*.\n\nThis may be because the airport code is incorrect or there are no scheduled flights.${DISCLAIMER}`,
      [
        makeButton("flight_retry_arr", "🔄 Try Another Airport"),
        makeButton("flight_back", "✈️ Flight Menu"),
        makeButton("flight_back_main", "🏠 Main Menu"),
      ],
      "No Arrivals"
    );
  } else {
    let msg = `🛬 *ARRIVALS AT ${code}*\n📅 *${date}*\n\n`;

    flights.slice(0, 5).forEach((f, i) => {
      const time = formatTime(f.actual_time || f.scheduled_time);
      msg +=
        `*${i + 1}. ${f.flight_number}* — ${f.airline}\n` +
        `   Origin: ${f.counterpart_airport} (${f.counterpart_iata})\n` +
        `   Time: ${time}\n` +
        `   ${statusEmoji(f.status)} ${statusLabel(f.status)}\n\n`;
    });

    if (flights.length > 5) msg += `_...and ${flights.length - 5} more flights_`;
    msg += DISCLAIMER;

    await sendButtonMessage(phone, msg,
      [
        makeButton("flight_retry_arr", "🔄 Check Another"),
        makeButton("flight_back", "✈️ Flight Menu"),
        makeButton("flight_back_main", "🏠 Main Menu"),
      ],
      "Arrivals"
    );
  }

  await updateConversation(conv.id, { current_state: "FLIGHT_MENU", context_json: {} });
}
