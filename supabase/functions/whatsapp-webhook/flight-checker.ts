// supabase/functions/whatsapp-webhook/flight-checker.ts
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
import { showMainMenu } from "./modules/main-menu.ts";

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
  await updateConversation(convId, { current_module: "TOOLS", current_state:
