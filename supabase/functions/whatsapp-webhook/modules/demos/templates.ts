// supabase/functions/whatsapp-webhook/modules/demos/templates.ts
// Scalable business template registry & database-backed template engine.
// All template strings are compiled dynamically with strict placeholder mappings.

import { getSupabaseClient, safeErrorLog } from "../../database.ts";

export interface DemoMenuOption {
  id: string;
  title: string;
  description: string;
}

export interface IndustryTemplate {
  key: string;
  label: string;
  icon: string;
  existingDemoId: string | null;
  welcomeMessage: (biz: string, need?: string) => string;
  menuBody: (biz: string) => string;
  menuOptions: DemoMenuOption[];
  relatedDemoIds: string[];
  sampleResponses: Record<string, (biz: string) => string>;
  dataFields: string[];
  agentHandover: (biz: string) => string;
}

// ─────────────────────────────────────────────
// LOCAL SYNCHRONOUS FALLBACK REGISTRY
// ─────────────────────────────────────────────

const T: Record<string, IndustryTemplate> = {
  hotel: {
    key: "hotel",
    label: "Hotel & Accommodation",
    icon: "🏨",
    existingDemoId: "appointment_booking",
    welcomeMessage: (b, n) =>
      `Welcome to the *${b}* hotel demo! 🏨\n\n` +
      `Explore how guests could browse room options, enquire about availability, ` +
      `and request reservations through WhatsApp.` +
      (n ? `\n\n*Your Main Need:* ${n}` : "") +
      `\n\n⚠️ _Demo only. Sample data is illustrative; no real bookings are made._`,
    menuBody: (b) => `*${b} — Hotel Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_rooms", title: "🛏️ View Rooms", description: "Sample room types and rates" },
      { id: "demo_booking", title: "📅 Booking Enquiry", description: "Simulate a reservation" },
      { id: "demo_call", title: "📞 Request a Call", description: "Simulate a callback request" },
      { id: "demo_staff", title: "💬 Talk to Staff", description: "Simulate staff handover" },
    ],
    relatedDemoIds: ["shortlet", "restaurant", "event_centre"],
    sampleResponses: {
      demo_rooms: (b) =>
        `🛏️ *Sample Room Options — ${b}*\n\n` +
        "1. *Standard Room* — ₦25,000/night\n   AC, TV, WiFi, ensuite\n\n" +
        "2. *Deluxe Suite* — ₦55,000/night\n   King bed, lounge, balcony\n\n" +
        "3. *Executive Suite* — ₦95,000/night\n   Two rooms, jacuzzi, city view\n\n" +
        "⚠️ _Illustrative prices only; not verified hotel rates._",
      demo_booking: () =>
        "📅 *Sample Booking Enquiry*\n\n" +
        "Room: Deluxe Suite\nGuests: 2 adults\nDate: Sample date\n\n" +
        "A live system could check real availability and send a confirmation.\n\n" +
        "⚠️ _No real reservation has been made._",
      demo_call: () =>
        "📞 *Sample Callback Request*\n\n" +
        "This illustrates how a guest could request a callback.\n\n" +
        "⚠️ _No call has been placed and no staff member has been notified._",
      demo_staff: () =>
        "💬 *Live Chat Demonstration*\n\n" +
        "“Welcome! How can we assist you today?”\n\n" +
        "⚠️ _This is a simulation, not a live staff connection._",
    },
    dataFields: ["business_name", "room_count", "location", "star_rating"],
    agentHandover: (b) => `Hotel demo lead for *${b}*. Interested in guest enquiry automation.`,
  },

  shortlet: {
    key: "shortlet",
    label: "Short-Let Apartments",
    icon: "🏠",
    existingDemoId: "appointment_booking",
    welcomeMessage: (b, n) =>
      `Welcome to the *${b}* short-let demo! 🏠\n\n` +
      `Explore how guests could browse apartments, enquire about dates, ` +
      `and submit booking requests through WhatsApp.` +
      (n ? `\n\n*Your Main Need:* ${n}` : "") +
      `\n\n⚠️ _Demo only. Sample listings and rates are illustrative._`,
    menuBody: (b) => `*${b} — Short-Let Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_apartments", title: "🏘️ View Apartments", description: "Sample listings and rates" },
      { id: "demo_booking", title: "📅 Check Availability", description: "Simulate a booking enquiry" },
      { id: "demo_rules", title: "📋 House Rules", description: "Sample guest guidelines" },
      { id: "demo_contact", title: "📞 Contact Host", description: "Simulate a callback request" },
    ],
    relatedDemoIds: ["hotel", "real_estate", "event_centre"],
    sampleResponses: {
      demo_apartments: (b) =>
        `🏘️ *Sample Apartments — ${b}*\n\n` +
        "1. *1-bedroom apartment* — ₦45,000/night\n   WiFi, DSTV, generator\n\n" +
        "2. *2-bedroom apartment* — ₦75,000/night\n   Pool, gym, security\n\n" +
        "3. *Studio apartment* — ₦25,000/night\n   AC, kitchenette\n\n" +
        "⚠️ _Illustrative listings and prices only._",
      demo_booking: () =>
        "📅 *Sample Availability Check*\n\n" +
        "Unit: Sample 1-bedroom apartment\nDates: Sample weekend\nStatus: Not verified\n\n" +
        "⚠️ _No live availability was checked and no booking was made._",
      demo_rules: () =>
        "📋 *Sample House Rules*\n\n" +
        "• Check-in: 2 PM\n• Check-out: 11 AM\n• No smoking indoors\n" +
        "• Observe quiet hours\n\n⚠️ _Example rules only; each property sets its own policies._",
      demo_contact: () =>
        "📞 *Sample Host Contact Request*\n\n" +
        "A live system could record the request and notify the host.\n\n" +
        "⚠️ _No actual call or notification was made._",
    },
    dataFields: ["business_name", "unit_count", "locations", "price_range"],
    agentHandover: (b) => `Short-let demo lead for *${b}*. Interested in booking automation.`,
  },

  school: {
    key: "school",
    label: "School & Education",
    icon: "🎓",
    existingDemoId: null,
    welcomeMessage: (b, n) =>
      `Welcome to the *${b}* education demo! 🎓\n\n` +
      `Explore how parents and students could enquire about admissions, ` +
      `check school information, and receive announcements through WhatsApp.` +
      (n ? `\n\n*Your Main Need:* ${n}` : "") +
      `\n\n⚠️ _Demo only. School information and figures are sample data._`,
    menuBody: (b) => `*${b} — School Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_admissions", title: "📝 Admissions", description: "Sample requirements" },
      { id: "demo_fees", title: "💰 School Fees", description: "Sample fee structure" },
      { id: "demo_enquiry", title: "❓ Submit Enquiry", description: "Simulate a parent enquiry" },
      { id: "demo_contact", title: "📞 Contact School", description: "Simulate a callback request" },
    ],
    relatedDemoIds: ["professional", "digital_agency"],
    sampleResponses: {
      demo_admissions: () =>
        "📝 *Sample Admission Requirements*\n\n" +
        "• Completed application form\n• Birth certificate\n• Previous school report\n" +
        "• Passport photographs\n• Entrance examination, where applicable\n\n" +
        "⚠️ _Illustrative requirements only. Contact the school for current dates and policies._",
      demo_fees: () =>
        "💰 *Sample Fee Structure — Per Term*\n\n" +
        "• Nursery: ₦75,000\n• Primary: ₦95,000\n• Secondary: ₦120,000\n\n" +
        "⚠️ _Illustrative figures only; these are not verified school fees._",
      demo_enquiry: () =>
        "❓ *Sample Parent Enquiry*\n\n" +
        "A live system could capture the question and route it to the admissions team.\n\n" +
        "⚠️ _No real enquiry has been submitted to a school._",
      demo_contact: () =>
        "📞 *Sample School Contact Request*\n\n" +
        "⚠️ _No actual call or notification was made._",
    },
    dataFields: ["business_name", "school_type", "student_count", "levels"],
    agentHandover: (b) => `School demo lead for *${b}*. Interested in admissions automation.`,
  },

  event_centre: {
    key: "event_centre",
    label: "Event Centre & Planner",
    icon: "🎉",
    existingDemoId: "appointment_booking",
    welcomeMessage: (b, n) =>
      `Welcome to the *${b}* event demo! 🎉\n\n` +
      `Explore how clients could view venues, compare packages, ` +
      `and submit booking enquiries through WhatsApp.` +
      (n ? `\n\n*Your Main Need:* ${n}` : "") +
      `\n\n⚠️ _Demo only. Venue details and prices are illustrative._`,
    menuBody: (b) => `*${b} — Event Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_venues", title: "🏛️ View Venues", description: "Sample halls and capacities" },
      { id: "demo_packages", title: "📦 Packages", description: "Sample pricing tiers" },
      { id: "demo_booking", title: "📅 Booking Enquiry", description: "Simulate a booking request" },
      { id: "demo_contact", title: "📞 Request a Call", description: "Simulate a planner callback" },
    ],
    relatedDemoIds: ["hotel", "restaurant", "shortlet"],
    sampleResponses: {
      demo_venues: (b) =>
        `🏛️ *Sample Venues — ${b}*\n\n` +
        "1. *Grand Hall* — 500 guests\n   Stage, AC, sound system\n\n" +
        "2. *Banquet Room* — 150 guests\n   Round tables, projector\n\n" +
        "3. *Garden Pavilion* — 300 guests\n   Outdoor venue, canopy\n\n" +
        "⚠️ _Illustrative capacities and facilities only._",
      demo_packages: () =>
        "📦 *Sample Event Packages*\n\n" +
        "🥉 Basic: ₦250,000\n🥈 Standard: ₦500,000\n🥇 Premium: ₦1,000,000\n\n" +
        "⚠️ _Illustrative prices only; no quotation has been issued._",
      demo_booking: () =>
        "📅 *Sample Booking Enquiry*\n\n" +
        "A live system could check the venue calendar and collect event details.\n\n" +
        "⚠️ _No real booking or availability check has occurred._",
      demo_contact: () =>
        "📞 *Sample Planner Contact Request*\n\n" +
        "⚠️ _No actual call or notification was made._",
    },
    dataFields: ["business_name", "venue_count", "capacity", "event_types"],
    agentHandover: (b) => `Event centre demo lead for *${b}*. Interested in booking automation.`,
  },

  car_dealer: {
    key: "car_dealer",
    label: "Car Dealer & Automobile",
    icon: "🚗",
    existingDemoId: "auto_workshop",
    welcomeMessage: (b, n) =>
      `Welcome to the *${b}* auto demo! 🚗\n\n` +
      `Explore how customers could browse vehicles, request test drives, ` +
      `and submit purchase enquiries through WhatsApp.` +
      (n ? `\n\n*Your Main Need:* ${n}` : "") +
      `\n\n⚠️ _Demo only. Vehicles and prices are illustrative._`,
    menuBody: (b) => `*${b} — Auto Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_inventory", title: "🚘 View Vehicles", description: "Sample catalogue" },
      { id: "demo_testdrive", title: "🔑 Test Drive", description: "Simulate a request" },
      { id: "demo_quote", title: "💰 Get a Quote", description: "Simulate a price enquiry" },
      { id: "demo_contact", title: "📞 Talk to Sales", description: "Simulate sales contact" },
    ],
    relatedDemoIds: ["retail", "logistics", "professional"],
    sampleResponses: {
      demo_inventory: (b) =>
        `🚘 *Sample Inventory — ${b}*\n\n` +
        "1. *Toyota Camry 2022* — ₦18.5M\n   Automatic transmission, sample mileage\n\n" +
        "2. *Honda CR-V 2021* — ₦22M\n   SUV, sample mileage\n\n" +
        "3. *Mercedes-Benz C-Class 2023* — ₦38M\n   Sample listing\n\n" +
        "⚠️ _Illustrative vehicles and prices only. No live stock was checked._",
      demo_testdrive: () =>
        "🔑 *Sample Test Drive Request*\n\n" +
        "A live system could collect a preferred vehicle, date, and contact details.\n\n" +
        "⚠️ _No appointment has been scheduled._",
      demo_quote: () =>
        "💰 *Sample Price Enquiry*\n\n" +
        "A sales representative could prepare a quotation after confirming the vehicle and terms.\n\n" +
        "⚠️ _No quotation or financing offer has been issued._",
      demo_contact: () =>
        "📞 *Sample Sales Contact Request*\n\n" +
        "⚠️ _No actual call or notification was made._",
    },
    dataFields: ["business_name", "vehicle_types", "brands", "showroom_location"],
    agentHandover: (b) => `Auto dealer demo lead for *${b}*. Interested in vehicle catalogue and lead capture.`,
  },

  real_estate: {
    key: "real_estate",
    label: "Real Estate",
    icon: "🏗️",
    existingDemoId: "real_estate",
    welcomeMessage: (b, n) =>
      `Welcome to the *${b}* property demo! 🏗️\n\n` +
      `Explore how clients could browse property listings, request inspections, ` +
      `and submit enquiries through WhatsApp.` +
      (n ? `\n\n*Your Main Need:* ${n}` : "") +
      `\n\n⚠️ _Demo only. Listings and prices are illustrative._`,
    menuBody: (b) => `*${b} — Real Estate Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_listings", title: "🏘️ View Properties", description: "Sample listings" },
      { id: "demo_inspection", title: "🔍 Inspection", description: "Simulate a viewing request" },
      { id: "demo_enquiry", title: "❓ Enquiry", description: "Simulate a property enquiry" },
      { id: "demo_agent", title: "📞 Talk to Agent", description: "Simulate agent contact" },
    ],
    relatedDemoIds: ["shortlet", "professional", "hotel"],
    sampleResponses: {
      demo_listings: (b) =>
        `🏘️ *Sample Listings — ${b}*\n\n` +
        "1. *3-bedroom duplex, Lekki* — ₦85M\n   BQ, fitted kitchen\n\n" +
        "2. *2-bedroom flat, Ikeja* — ₦1.8M/year\n   Serviced, gated estate\n\n" +
        "3. *5-bedroom mansion* — ₦350M\n   Pool, smart-home features\n\n" +
        "⚠️ _Illustrative listings and prices only. Availability and ownership are unverified._",
      demo_inspection: () =>
        "🔍 *Sample Inspection Request*\n\n" +
        "A live system could record your preferred property and viewing time.\n\n" +
        "⚠️ _No inspection has been scheduled._",
      demo_enquiry: () =>
        "❓ *Sample Property Enquiry*\n\n" +
        "⚠️ _No real enquiry has been submitted to an agent._",
      demo_agent: () =>
        "📞 *Sample Agent Contact Request*\n\n" +
        "⚠️ _No actual call or notification was made._",
    },
    dataFields: ["business_name", "property_types", "locations", "price_range"],
    agentHandover: (b) => `Real estate demo lead for *${b}*. Interested in property enquiry automation.`,
  },

  retail: {
    key: "retail",
    label: "Retail Shop & Supermarket",
    icon: "🛒",
    existingDemoId: "online_store",
    welcomeMessage: (b, n) =>
      `Welcome to the *${b}* retail demo! 🛒\n\n` +
      `Explore how customers could browse a catalogue, submit orders, ` +
      `and enquire about deliveries through WhatsApp.` +
      (n ? `\n\n*Your Main Need:* ${n}` : "") +
      `\n\n⚠️ _Demo only. Product details and prices are illustrative._`,
    menuBody: (b) => `*${b} — Retail Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_catalogue", title: "📦 Catalogue", description: "Browse sample products" },
      { id: "demo_order", title: "🛍️ Place Order", description: "Simulate an order" },
      { id: "demo_delivery", title: "🚚 Track Delivery", description: "View sample tracking" },
      { id: "demo_support", title: "💬 Support", description: "Simulate support chat" },
    ],
    relatedDemoIds: ["logistics", "restaurant", "digital_agency"],
    sampleResponses: {
      demo_catalogue: (b) =>
        `📦 *Sample Catalogue — ${b}*\n\n` +
        "• Indomie carton (40 pack) — ₦6,800\n" +
        "• Golden Penny flour (10 kg) — ₦8,500\n" +
        "• Peak milk (900 g) — ₦5,200\n\n" +
        "⚠️ _Illustrative products and prices only; stock was not checked._",
      demo_order: () =>
        "🛍️ *Sample Order Summary*\n\n" +
        "Reference: XTD-SAMPLE-001\nItems: 3\nTotal: ₦20,500\n\n" +
        "⚠️ _This is not a real order. No payment was collected._",
      demo_delivery: () =>
        "🚚 *Sample Delivery Tracking*\n\n" +
        "Reference: XTD-SAMPLE-001\nStatus: Sample status\nETA: Not verified\n\n" +
        "⚠️ _No real delivery is being tracked._",
      demo_support: () =>
        "💬 *Support Simulation*\n\n" +
        "“Welcome to customer support! How can we help?”\n\n" +
        "⚠️ _This is not a live support conversation._",
    },
    dataFields: ["business_name", "product_categories", "branch_count", "delivery_area"],
    agentHandover: (b) => `Retail demo lead for *${b}*. Interested in catalogue and ordering automation.`,
  },

  restaurant: {
    key: "restaurant",
    label: "Restaurant & Food Business",
    icon: "🍽️",
    existingDemoId: "restaurant",
    welcomeMessage: (b, n) =>
      `🍽️ Welcome to the *${b}* WhatsApp demo!\n\n` +
      `See how your restaurant could use WhatsApp to:\n` +
      `• Display food menus and catalogs.\n` +
      `• Answer food and pricing enquiries.\n` +
      `• Receive customer booking requests.\n` +
      `• Guide customers through interactive food ordering.` +
      (n ? `\n\n*Your Main Need:* ${n}` : "") +
      `\n\n⚠️ _This is an interactive demonstration. No real orders or bookings will be created._`,
    menuBody: (b) => `*${b} — Dynamic Food Catalog*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_menu", title: "📋 View Menu", description: "Sample food and prices" },
      { id: "demo_order", title: "🍔 Order Food", description: "Simulate an order" },
      { id: "demo_reserve", title: "📅 Reserve Table", description: "Simulate a reservation" },
      { id: "demo_contact", title: "📞 Contact Us", description: "Simulate a contact request" },
    ],
    relatedDemoIds: ["retail", "hotel", "event_centre"],
    sampleResponses: {
      demo_menu: (b) =>
        `📋 *Sample Menu — ${b}*\n\n` +
        "🍚 Jollof rice and chicken — ₦3,500\n" +
        "🍗 Goat meat pepper soup — ₦4,000\n" +
        "🍕 Margherita pizza — ₦5,000\n" +
        "🥤 Chapman — ₦1,500\n\n" +
        "⚠️ _Illustrative menu and prices only._",
      demo_order: () =>
        "🍔 *Sample Order Summary*\n\n" +
        "2 × Jollof rice + 1 × Chapman\nIllustrative total: ₦8,500\n\n" +
        "⚠️ _No real order was placed and no payment was taken._",
      demo_reserve: () =>
        "📅 *Sample Table Reservation*\n\n" +
        "Date: Sample Saturday\nTime: 7 PM\nGuests: 4\n\n" +
        "⚠️ _No real reservation was made and no table availability was checked._",
      demo_contact: () =>
        "📞 *Sample Restaurant Contact Request*\n\n" +
        "⚠️ _No actual call or notification was made._",
    },
    dataFields: ["business_name", "cuisine_type", "seating_capacity", "delivery_available"],
    agentHandover: (b) => `Restaurant demo lead for *${b}*. Interested in menu and ordering automation.`,
  },

  digital_agency: {
    key: "digital_agency",
    label: "Digital Agency & IT Services",
    icon: "💻",
    existingDemoId: "custom_automation",
    welcomeMessage: (b, n) =>
      `Welcome to the *${b}* agency demo! 💻\n\n` +
      `Explore how clients could review services, request quotations, ` +
      `and submit project briefs through WhatsApp.` +
      (n ? `\n\n*Your Main Need:* ${n}` : "") +
      `\n\n⚠️ _Demo only. Services and prices are illustrative._`,
    menuBody: (b) => `*${b} — Agency Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_services", title: "⚙️ Services", description: "Sample offerings" },
      { id: "demo_quote", title: "💰 Request Quote", description: "Simulate a quote request" },
      { id: "demo_portfolio", title: "🎨 Portfolio", description: "Sample projects" },
      { id: "demo_contact", title: "📞 Contact Team", description: "Simulate a team contact request" },
    ],
    relatedDemoIds: ["professional", "retail", "school"],
    sampleResponses: {
      demo_services: (b) =>
        `⚙️ *Sample Services — ${b}*\n\n` +
        "1. Website design — from ₦150,000\n" +
        "2. WhatsApp bot — from ₦200,000\n" +
        "3. Social media management — ₦80,000/month\n" +
        "4. Brand identity — from ₦100,000\n\n" +
        "⚠️ _Illustrative prices only; not a formal quotation._",
      demo_quote: () =>
        "💰 *Sample Quote Request*\n\n" +
        "A live system could collect project requirements for a quotation.\n\n" +
        "⚠️ _No quote has been prepared or sent._",
      demo_portfolio: () =>
        "🎨 *Sample Portfolio*\n\n" +
        "• E-commerce project\n• WhatsApp automation project\n• Brand identity project\n\n" +
        "⚠️ _Illustrative examples, not verified client projects._",
      demo_contact: () =>
        "📞 *Sample Team Contact Request*\n\n" +
        "⚠️ _No actual call or notification was made._",
    },
    dataFields: ["business_name", "service_types", "team_size", "target_clients"],
    agentHandover: (b) => `Agency demo lead for *${b}*. Interested in client enquiry automation.`,
  },

  clinic: {
    key: "clinic",
    label: "Clinic & Healthcare",
    icon: "🏥",
    existingDemoId: "appointment_booking",
    welcomeMessage: (b, n) =>
      `Welcome to the *${b}* healthcare demo! 🏥\n\n` +
      `Explore how patients could view clinic information, enquire about appointments, ` +
      `and receive reminders through WhatsApp.` +
      (n ? `\n\n*Your Main Need:* ${n}` : "") +
      `\n\n⚠️ _Demo only. This system does not provide medical advice or book real appointments._`,
    menuBody: (b) => `*${b} — Clinic Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_departments", title: "🩺 Departments", description: "Sample specialties" },
      { id: "demo_appointment", title: "📅 Appointment Enquiry", description: "Simulate an appointment request" },
      { id: "demo_reminder", title: "🔔 Reminders", description: "Sample reminder message" },
      { id: "demo_contact", title: "📞 Contact Clinic", description: "Simulate a contact request" },
    ],
    relatedDemoIds: ["professional", "school", "beauty"],
    sampleResponses: {
      demo_departments: (b) =>
        `🩺 *Sample Departments — ${b}*\n\n` +
        "• General practice\n• Paediatrics\n• Dental services\n• Optometry\n• Laboratory services\n\n" +
        "⚠️ _Illustrative departments only._",
      demo_appointment: () =>
        "📅 *Sample Appointment Enquiry*\n\n" +
        "A live system could collect a preferred date and route the request to clinic staff.\n\n" +
        "⚠️ _No appointment has been booked. No doctor or time has been confirmed._",
      demo_reminder: () =>
        "🔔 *Sample Reminder Message*\n\n" +
        "“This is a sample reminder for an upcoming appointment. Please contact your clinic to confirm your details.”\n\n" +
        "⚠️ _No reminder has been sent to a patient._",
      demo_contact: () =>
        "📞 *Sample Clinic Contact Request*\n\n" +
        "⚠️ _No actual call or notification was made._",
    },
    dataFields: ["business_name", "specialties", "doctor_count", "operating_hours"],
    agentHandover: (b) => `Clinic demo lead for *${b}*. Interested in appointment and reminder automation.`,
  },

  professional: {
    key: "professional",
    label: "Professional Services",
    icon: "💼",
    existingDemoId: "crm",
    welcomeMessage: (b, n) =>
      `Welcome to the *${b}* professional services demo! 💼\n\n` +
      `Explore how clients could review services, request consultations, ` +
      `and submit enquiries through WhatsApp.` +
      (n ? `\n\n*Your Main Need:* ${n}` : "") +
      `\n\n⚠️ _Demo only. Service details are illustrative._`,
    menuBody: (b) => `*${b} — Services Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_services", title: "📋 Services", description: "Sample offerings" },
      { id: "demo_consult", title: "📅 Consultation Enquiry", description: "Simulate a consultation request" },
      { id: "demo_enquiry", title: "❓ Enquiry", description: "Simulate a question" },
      { id: "demo_contact", title: "📞 Request Call", description: "Simulate a callback request" },
    ],
    relatedDemoIds: ["digital_agency", "clinic", "school"],
    sampleResponses: {
      demo_services: (b) =>
        `📋 *Sample Services — ${b}*\n\n` +
        "• Business advisory\n• Tax advisory\n• Professional consultation\n• Financial planning\n\n" +
        "⚠️ _Illustrative examples only. Actual services depend on the business and its qualifications._",
      demo_consult: () =>
        "📅 *Sample Consultation Request*\n\n" +
        "A live system could collect a preferred date and contact details.\n\n" +
        "⚠️ _No consultation has been booked._",
      demo_enquiry: () =>
        "❓ *Sample Enquiry*\n\n" +
        "⚠️ _No real enquiry has been sent to a professional._",
      demo_contact: () =>
        "📞 *Sample Callback Request*\n\n" +
        "⚠️ _No actual call or notification was made._",
    },
    dataFields: ["business_name", "service_types", "consultant_count", "certifications"],
    agentHandover: (b) => `Professional services demo lead for *${b}*. Interested in consultation automation.`,
  },

  beauty: {
    key: "beauty",
    label: "Beauty & Personal Care",
    icon: "💇",
    existingDemoId: "appointment_booking",
    welcomeMessage: (b, n) =>
      `Welcome to the *${b}* beauty demo! 💇\n\n` +
      `Explore how clients could view services, enquire about appointments, ` +
      `and receive aftercare information through WhatsApp.` +
      (n ? `\n\n*Your Main Need:* ${n}` : "") +
      `\n\n⚠️ _Demo only. Services and prices are illustrative._`,
    menuBody: (b) => `*${b} — Beauty Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_services", title: "💅 Services & Prices", description: "Sample service menu" },
      { id: "demo_booking", title: "📅 Appointment Enquiry", description: "Simulate a booking request" },
      { id: "demo_gallery", title: "📸 Gallery", description: "Sample portfolio information" },
      { id: "demo_contact", title: "📞 Contact Salon", description: "Simulate a callback request" },
    ],
    relatedDemoIds: ["professional", "retail", "hotel"],
    sampleResponses: {
      demo_services: (b) =>
        `💅 *Sample Services — ${b}*\n\n` +
        "• Hair styling — ₦5,000\n• Braiding — ₦8,000\n" +
        "• Manicure and pedicure — ₦7,000\n• Facial — ₦10,000\n" +
        "• Bridal makeup — ₦35,000\n\n" +
        "⚠️ _Illustrative prices only._",
      demo_booking: () =>
        "📅 *Sample Appointment Enquiry*\n\n" +
        "Service: Braiding\nStylist: Sample stylist\nTime: Sample time\n\n" +
        "⚠️ _No appointment has been booked or confirmed._",
      demo_gallery: () =>
        "📸 *Gallery Demonstration*\n\n" +
        "A live system could display approved images from the salon's portfolio.\n\n" +
        "⚠️ _No real salon photos are included in this sample._",
      demo_contact: () =>
        "📞 *Sample Salon Contact Request*\n\n" +
        "⚠️ _No actual call or notification was made._",
    },
    dataFields: ["business_name", "service_types", "stylist_count", "location"],
    agentHandover: (b) => `Beauty demo lead for *${b}*. Interested in booking and client management.`,
  },

  logistics: {
    key: "logistics",
    label: "Logistics & Delivery",
    icon: "🚚",
    existingDemoId: "inventory",
    welcomeMessage: (b, n) =>
      `Welcome to the *${b}* logistics demo! 🚚\n\n` +
      `Explore how customers could request pickups, enquire about delivery costs, ` +
      `and track shipments through WhatsApp.` +
      (n ? `\n\n*Your Main Need:* ${n}` : "") +
      `\n\n⚠️ _Demo only. Prices and tracking information are illustrative._`,
    menuBody: (b) => `*${b} — Logistics Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_quote", title: "💰 Get a Quote", description: "Sample delivery pricing" },
      { id: "demo_track", title: "📍 Track Delivery", description: "Simulate tracking" },
      { id: "demo_pickup", title: "📦 Request Pickup", description: "Simulate a pickup request" },
      { id: "demo_contact", title: "📞 Contact Dispatch", description: "Simulate an operations enquiry" },
    ],
    relatedDemoIds: ["retail", "shortlet", "digital_agency"],
    sampleResponses: {
      demo_quote: (b) =>
        `💰 *Sample Delivery Quotes — ${b}*\n\n` +
        "• Same city (up to 10 km): ₦1,500\n" +
        "• Same city (over 10 km): ₦2,500\n" +
        "• Interstate: ₦5,000–₦15,000\n" +
        "• Express option: sample surcharge\n\n" +
        "⚠️ _Illustrative rates only; no route or live quotation was checked._",
      demo_track: () =>
        "📍 *Sample Shipment Tracking*\n\n" +
        "Reference: LOG-SAMPLE-001\nStatus: Sample status\nETA: Not verified\n\n" +
        "⚠️ _This is not a real shipment and no live tracking was performed._",
      demo_pickup: () =>
        "📦 *Sample Pickup Request*\n\n" +
        "Address: Sample location\nTime: Not scheduled\nPackage: Sample package\n\n" +
        "⚠️ _No pickup has been requested from a real courier._",
      demo_contact: () =>
        "📞 *Sample Dispatch Contact Request*\n\n" +
        "⚠️ _No actual call or notification was made._",
    },
    dataFields: ["business_name", "coverage_areas", "fleet_size", "delivery_types"],
    agentHandover: (b) => `Logistics demo lead for *${b}*. Interested in delivery tracking and quoting.`,
  },

  other: {
    key: "other",
    label: "Other Business",
    icon: "🏢",
    existingDemoId: "business_calculator",
    welcomeMessage: (b, n) =>
      `Welcome to the *${b}* business demo! 🏢\n\n` +
      `Explore how customers could browse services, submit enquiries, ` +
      `and receive information about a business through WhatsApp.` +
      (n ? `\n\n*Your Main Need:* ${n}` : "") +
      `\n\n⚠️ _Demo only. All sample content is illustrative._`,
    menuBody: (b) => `*${b} — Business Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_services", title: "📋 Services", description: "Sample offerings" },
      { id: "demo_enquiry", title: "❓ Enquiry", description: "Simulate a question" },
      { id: "demo_quote", title: "💰 Request Quote", description: "Simulate a quote request" },
      { id: "demo_contact", title: "📞 Contact Us", description: "Simulate a callback request" },
    ],
    relatedDemoIds: ["professional", "retail", "digital_agency"],
    sampleResponses: {
      demo_services: (b) =>
        `📋 *Sample Services — ${b}*\n\n` +
        "Your business's approved service catalogue could appear here.\n\n" +
        "⚠️ _Illustrative placeholder only._",
      demo_enquiry: () =>
        "❓ *Sample Enquiry*\n\n" +
        "⚠️ _No real enquiry has been submitted._",
      demo_quote: () =>
        "💰 *Sample Quote Request*\n\n" +
        "⚠️ _No quotation has been prepared or sent._",
      demo_contact: () =>
        "📞 *Sample Callback Request*\n\n" +
        "⚠️ _No actual call or notification was made._",
    },
    dataFields: ["business_name", "industry", "main_service", "target_customers"],
    agentHandover: (b) => `Business demo lead for *${b}*. Interested in WhatsApp automation.`,
  },
};

// ─────────────────────────────────────────────
// COMPILER CORE: COMPILING THE DYNAMIC PLACEHOLDERS
// ─────────────────────────────────────────────

export function compileTemplateString(
  templateStr: string,
  bizName: string,
  mainNeed?: string
): string {
  if (!templateStr) return "";
  return templateStr
    .replace(/\{\{business_name\}\}/gi, bizName)
    .replace(/\{\{main_need\}\}/gi, mainNeed || "General Enquiry");
}

// ─────────────────────────────────────────────
// HIGHLY OPTIMIZED ASYNC DATABASE RESOLVER (SCALABLE TO 50K+)
// ─────────────────────────────────────────────

export async function resolveTemplate(
  key: string,
  bizName: string,
  mainNeed?: string
): Promise<IndustryTemplate> {
  const normalizedKey = typeof key === "string" ? key.trim().toLowerCase() : "";
  const sb = getSupabaseClient();

  try {
    const { data: dbTemplate, error } = await sb
      .from("demo_templates")
      .select("*, demo_menu_options(*), demo_sample_responses(*)")
      .eq("key", normalizedKey)
      .eq("is_active", true)
      .maybeSingle();

    if (error || !dbTemplate) {
      if (error) safeErrorLog("resolveTemplate.dbFetch", error);
      return getTemplate(key); // Fallback cleanly to local in-memory template
    }

    // Dynamic reconstruction of database-backed configs
    const menuOptions: DemoMenuOption[] = (dbTemplate.demo_menu_options || [])
      .sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0))
      .map((opt: any) => ({
        id: opt.option_id,
        title: opt.title,
        description: opt.description,
      }));

    const sampleResponses: Record<string, (biz: string) => string> = {};
    if (Array.isArray(dbTemplate.demo_sample_responses)) {
      dbTemplate.demo_sample_responses.forEach((resp: any) => {
        sampleResponses[resp.option_id] = (biz: string) =>
          compileTemplateString(resp.response_template, biz, mainNeed);
      });
    }

    return {
      key: dbTemplate.key,
      label: dbTemplate.label,
      icon: dbTemplate.icon,
      existingDemoId: dbTemplate.existing_demo_id || null,
      welcomeMessage: (biz: string, need?: string) =>
        compileTemplateString(dbTemplate.welcome_message_template, biz, need || mainNeed),
      menuBody: (biz: string) =>
        compileTemplateString(dbTemplate.menu_body_template, biz, mainNeed),
      menuOptions,
      relatedDemoIds: dbTemplate.related_demo_keys || [],
      sampleResponses,
      dataFields: dbTemplate.data_fields || [],
      agentHandover: (biz: string) =>
        compileTemplateString(dbTemplate.agent_handover_template, biz, mainNeed),
    };
  } catch (err) {
    safeErrorLog("resolveTemplate.catch", err);
    return getTemplate(key); // Gracefully return synchronous fallback on exception
  }
}

// ─────────────────────────────────────────────
// PUBLIC REGISTRY FALLBACK API
// ─────────────────────────────────────────────

/** Get a template by key synchronously. Falls back to 'other'. */
export function getTemplate(key: string): IndustryTemplate {
  const normalizedKey = typeof key === "string" ? key.trim().toLowerCase() : "";
  return T[normalizedKey] || T.other;
}

/** Get all template keys, labels, and icons for selection menus. */
export function getAllTemplateOptions(): { key: string; label: string; icon: string }[] {
  return Object.values(T).map(({ key, label, icon }) => ({ key, label, icon }));
}

/** Get selectable templates, excluding the generic fallback. */
export function getSelectableTemplates(): { key: string; label: string; icon: string }[] {
  return Object.values(T)
    .filter((template) => template.key !== "other")
    .map(({ key, label, icon }) => ({ key, label, icon }));
}

/**
 * Normalize user input so classification is based on whole words/phrases,
 * rather than accidental substring matches.
 */
function normalizeCategoryInput(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function containsPhrase(normalizedInput: string, keyword: string): boolean {
  const normalizedKeyword = normalizeCategoryInput(keyword);
  if (!normalizedInput || !normalizedKeyword) return false;

  return (` ${normalizedInput} `).includes(` ${normalizedKeyword} `);
}

/**
 * Deterministic classifier: maps category text to a template key.
 * Uses keyword matching and does not require an AI API.
 */
export function classifyCategory(input: string): string {
  const s = normalizeCategoryInput(typeof input === "string" ? input : "");
  if (!s) return "other";

  // More specific categories are checked before broad categories.
  const rules: [string[], string][] = [
    [["short-let", "shortlet", "short let", "airbnb", "apartment rental", "furnished apartment"], "shortlet"],
    [["real estate", "property", "estate agent", "realtor", "housing", "land sale", "property sales", "apartment sale"], "real_estate"],
    [["hotel", "accommodation", "lodge", "resort", "motel", "guest house", "inn"], "hotel"],
    [["school", "education", "academy", "college", "university", "nursery", "creche", "tutor", "daycare"], "school"],
    [["event centre", "event center", "event planner", "event planning", "venue hire", "banquet hall", "wedding planner", "conference venue", "party planning"], "event_centre"],
    [["car dealer", "auto dealer", "vehicle dealer", "car sales", "automobile", "motor dealer", "auto workshop", "garage", "car repair", "mechanic", "showroom"], "car_dealer"],
    [["supermarket", "retail shop", "grocery", "shop", "store", "wholesale", "retail", "market"], "retail"],
    [["restaurant", "food business", "cafe", "catering", "kitchen", "eatery", "bistro", "fast food", "bakery"], "restaurant"],
    [["digital agency", "it services", "information technology", "software", "web design", "website design", "app development", "digital marketing", "seo", "tech company", "technology company", "marketing agency"], "digital_agency"],
    [["clinic", "healthcare", "hospital", "doctor", "medical", "dental", "pharmacy", "diagnostic", "laboratory", "health centre", "health center"], "clinic"],
    [["professional services", "consultancy", "consulting", "law firm", "lawyer", "legal services", "accountant", "accounting", "tax advisory", "audit", "financial advisory"], "professional"],
    [["beauty", "salon", "spa", "hair styling", "makeup", "nail studio", "skincare", "barber", "cosmetics"], "beauty"],
    [["logistics", "delivery company", "courier", "shipping", "dispatch", "freight", "transport company", "haulage"], "logistics"],
  ];

  for (const [keywords, key] of rules) {
    if (keywords.some((keyword) => containsPhrase(s, keyword))) {
      return key;
    }
  }

  // Handle short terms only as whole words.
  if (containsPhrase(s, "car") || containsPhrase(s, "auto") ||
      containsPhrase(s, "vehicle") || containsPhrase(s, "motor")) {
    return "car_dealer";
  }

  if (containsPhrase(s, "it") || containsPhrase(s, "tech") ||
      containsPhrase(s, "web") || containsPhrase(s, "app") ||
      containsPhrase(s, "software")) {
    return "digital_agency";
  }

  if (containsPhrase(s, "beauty") || containsPhrase(s, "hair") ||
      containsPhrase(s, "barber") || containsPhrase(s, "nail")) {
    return "beauty";
  }

  return "other";
}

/**
 * Get related industry templates.
 */
export function getRelatedTemplates(
  categoryKey: string
): { key: string; label: string; icon: string }[] {
  const template = getTemplate(categoryKey);
  const seen = new Set<string>([template.key]);
  const related: { key: string; label: string; icon: string }[] = [];

  for (const key of template.relatedDemoIds) {
    const match = T[key];

    // Ignore unknown keys and prevent duplicate/self recommendations.
    if (!match || seen.has(match.key)) continue;

    seen.add(match.key);
    related.push({
      key: match.key,
      label: match.label,
      icon: match.icon,
    });
  }

  return related;
}
