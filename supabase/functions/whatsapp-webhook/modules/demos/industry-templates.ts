// modules/demos/industry-templates.ts
// Reusable industry-specific demo templates.
// These are EXAMPLE demonstrations — no real transactions are performed.

export interface IndustryTemplate {
  key: string;
  label: string;
  icon: string;
  /** Maps to an existing demo ID in data.ts where possible */
  existingDemoId: string | null;
  welcomeMessage: (businessName: string) => string;
  menuBody: (businessName: string) => string;
  menuOptions: { id: string; title: string; description: string }[];
  relatedDemoIds: string[];
  /** Sample responses for each menu option */
  sampleResponses: Record<string, string>;
}

const TEMPLATES: Record<string, IndustryTemplate> = {
  hotel: {
    key: "hotel",
    label: "Hotel or Accommodation",
    icon: "🏨",
    existingDemoId: "appointment_booking",
    welcomeMessage: (b) =>
      `Welcome to the *${b}* hotel demo! 🏨\n\n` +
      `Imagine your guests could use WhatsApp to explore room options, ` +
      `check availability, and request reservations — all automatically.\n\n` +
      `⚠️ _This is a demonstration with sample data. No real bookings are made._`,
    menuBody: (b) => `*${b} — Hotel Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_view_rooms", title: "🛏️ View Room Options", description: "See sample room types & rates" },
      { id: "demo_booking", title: "📅 Booking Enquiry", description: "Simulate a reservation request" },
      { id: "demo_call", title: "📞 Request a Call", description: "Ask the hotel to call you back" },
      { id: "demo_staff", title: "💬 Talk to Staff", description: "Simulate a live chat handoff" },
    ],
    relatedDemoIds: ["appointment_booking", "restaurant", "real_estate"],
    sampleResponses: {
      demo_view_rooms:
        `🛏️ *Sample Room Options*\n\n` +
        `1. *Standard Room* — ₦25,000/night\n` +
        `   AC, TV, WiFi, Ensuite\n\n` +
        `2. *Deluxe Suite* — ₦55,000/night\n` +
        `   King bed, Lounge, Balcony, Mini-bar\n\n` +
        `3. *Executive Suite* — ₦95,000/night\n` +
        `   2 Rooms, Jacuzzi, City View\n\n` +
        `⚠️ _These are sample rates for demonstration purposes._`,
      demo_booking:
        `📅 *Booking Enquiry Received!*\n\n` +
        `✅ Check-in: Sample Date\n` +
        `✅ Room: Deluxe Suite\n` +
        `✅ Guests: 2 Adults\n\n` +
        `In a live system, this would check real availability and ` +
        `send a confirmation to both the guest and front desk.\n\n` +
        `⚠️ _No real booking was made._`,
      demo_call:
        `📞 *Callback Request Logged!*\n\n` +
        `A staff member would call you back within 15 minutes ` +
        `during business hours.\n\n` +
        `⚠️ _This is a demo — no actual call will be placed._`,
      demo_staff:
        `💬 *Live Chat Simulation*\n\n` +
        `In a live system, this would connect you to a real ` +
        `staff member via WhatsApp.\n\n` +
        `For now, imagine a friendly receptionist saying:\n` +
        `_"Welcome! How can I assist you today?"_\n\n` +
        `⚠️ _Demo only — no real agent connected._`,
    },
  },

  school: {
    key: "school",
    label: "School or Education",
    icon: "🎓",
    existingDemoId: null,
    welcomeMessage: (b) =>
      `Welcome to the *${b}* education demo! 🎓\n\n` +
      `Imagine parents and students could use WhatsApp to enquire ` +
      `about admissions, check school fees, and get instant answers ` +
      `to common questions.\n\n` +
      `⚠️ _This is a demonstration with sample data._`,
    menuBody: (b) => `*${b} — School Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_admissions", title: "📝 Admissions Info", description: "Sample admission requirements" },
      { id: "demo_fees", title: "💰 School Fees", description: "Sample fee structure" },
      { id: "demo_enquiry", title: "❓ Submit Enquiry", description: "Simulate a parent enquiry" },
      { id: "demo_contact", title: "📞 Contact School", description: "Request a callback" },
    ],
    relatedDemoIds: ["appointment_booking", "customer_support"],
    sampleResponses: {
      demo_admissions:
        `📝 *Sample Admission Requirements*\n\n` +
        `• Completed application form\n` +
        `• Birth certificate\n` +
        `• Previous school report\n` +
        `• Passport photographs (4)\n` +
        `• Entrance examination\n\n` +
        `📅 *Next intake:* September 2025\n\n` +
        `⚠️ _Sample data for demonstration._`,
      demo_fees:
        `💰 *Sample Fee Structure (Per Term)*\n\n` +
        `• Nursery: ₦75,000\n` +
        `• Primary: ₦95,000\n` +
        `• Secondary: ₦120,000\n` +
        `• Uniform & Books: ₦25,000\n\n` +
        `⚠️ _These are sample figures for demonstration._`,
      demo_enquiry:
        `❓ *Enquiry Received!*\n\n` +
        `Thank you for your interest. In a live system, ` +
        `this enquiry would be forwarded to the admissions ` +
        `office and you'd receive a response within 24 hours.\n\n` +
        `⚠️ _Demo only — no real enquiry sent._`,
      demo_contact:
        `📞 *Callback Request Logged!*\n\n` +
        `The school admin would contact you during office hours.\n\n` +
        `⚠️ _Demo only — no actual call will be placed._`,
    },
  },

  event_centre: {
    key: "event_centre",
    label: "Event Centre",
    icon: "🎉",
    existingDemoId: "appointment_booking",
    welcomeMessage: (b) =>
      `Welcome to the *${b}* event demo! 🎉\n\n` +
      `Imagine clients could use WhatsApp to check venue availability, ` +
      `view packages, and submit booking enquiries — all automatically.\n\n` +
      `⚠️ _This is a demonstration with sample data._`,
    menuBody: (b) => `*${b} — Event Centre Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_venues", title: "🏛️ View Venues", description: "Sample halls & capacities" },
      { id: "demo_packages", title: "📦 Event Packages", description: "Sample pricing tiers" },
      { id: "demo_book", title: "📅 Booking Enquiry", description: "Simulate a date reservation" },
      { id: "demo_contact", title: "📞 Request a Call", description: "Speak to an event planner" },
    ],
    relatedDemoIds: ["appointment_booking", "restaurant", "hotel"],
    sampleResponses: {
      demo_venues:
        `🏛️ *Sample Venues*\n\n` +
        `1. *Grand Hall* — 500 guests\n` +
        `   Stage, AC, Sound System\n\n` +
        `2. *Banquet Room* — 150 guests\n` +
        `   Round tables, Projector\n\n` +
        `3. *Garden Pavilion* — 300 guests\n` +
        `   Outdoor, Canopy, Parking\n\n` +
        `⚠️ _Sample data for demonstration._`,
      demo_packages:
        `📦 *Sample Event Packages*\n\n` +
        `🥉 *Basic:* ₦250,000\n` +
        `   Venue + Chairs + Tables\n\n` +
        `🥈 *Standard:* ₦500,000\n` +
        `   + Sound + Lighting + Decor\n\n` +
        `🥇 *Premium:* ₦1,000,000\n` +
        `   + Catering + DJ + Photography\n\n` +
        `⚠️ _Sample pricing for demonstration._`,
      demo_book:
        `📅 *Booking Enquiry Received!*\n\n` +
        `In a live system, this would check real calendar ` +
        `availability and hold the date provisionally.\n\n` +
        `⚠️ _No real booking was made._`,
      demo_contact:
        `📞 *Callback Request Logged!*\n\n` +
        `An event planner would reach out within 2 hours.\n\n` +
        `⚠️ _Demo only — no actual call placed._`,
    },
  },

  car_dealer: {
    key: "car_dealer",
    label: "Car Dealer or Automobile",
    icon: "🚗",
    existingDemoId: "auto_workshop",
    welcomeMessage: (b) =>
      `Welcome to the *${b}* auto demo! 🚗\n\n` +
      `Imagine customers could browse your vehicle inventory, ` +
      `request test drives, and submit purchase enquiries — ` +
      `all through WhatsApp.\n\n` +
      `⚠️ _This is a demonstration with sample data._`,
    menuBody: (b) => `*${b} — Auto Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_inventory", title: "🚘 View Vehicles", description: "Sample vehicle catalogue" },
      { id: "demo_testdrive", title: "🔑 Test Drive", description: "Simulate a test drive request" },
      { id: "demo_quote", title: "💰 Get a Quote", description: "Simulate a price enquiry" },
      { id: "demo_contact", title: "📞 Talk to Sales", description: "Connect with a sales rep" },
    ],
    relatedDemoIds: ["auto_workshop", "inventory", "crm"],
    sampleResponses: {
      demo_inventory:
        `🚘 *Sample Vehicle Catalogue*\n\n` +
        `1. *Toyota Camry 2022* — ₦18.5M\n` +
        `   Automatic, 15k km, Foreign Used\n\n` +
        `2. *Honda CR-V 2021* — ₦22M\n` +
        `   SUV, 22k km, Nigerian Used\n\n` +
        `3. *Mercedes C300 2023* — ₦38M\n` +
        `   Brand New, Full Option\n\n` +
        `⚠️ _Sample inventory for demonstration._`,
      demo_testdrive:
        `🔑 *Test Drive Request Logged!*\n\n` +
        `In a live system, this would schedule a test drive ` +
        `and notify the sales team.\n\n` +
        `⚠️ _Demo only — no real test drive scheduled._`,
      demo_quote:
        `💰 *Quote Request Received!*\n\n` +
        `A sales rep would prepare a detailed quote ` +
        `including financing options within 1 hour.\n\n` +
        `⚠️ _Demo only — no real quote generated._`,
      demo_contact:
        `📞 *Sales Rep Callback Logged!*\n\n` +
        `⚠️ _Demo only — no actual call placed._`,
    },
  },

  real_estate: {
    key: "real_estate",
    label: "Real Estate",
    icon: "🏠",
    existingDemoId: "real_estate",
    welcomeMessage: (b) =>
      `Welcome to the *${b}* property demo! 🏠\n\n` +
      `Imagine clients could browse property listings, ` +
      `schedule inspections, and submit enquiries — ` +
      `all through WhatsApp.\n\n` +
      `⚠️ _This is a demonstration with sample data._`,
    menuBody: (b) => `*${b} — Real Estate Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_listings", title: "🏘️ View Properties", description: "Sample property listings" },
      { id: "demo_inspection", title: "🔍 Schedule Inspection", description: "Simulate a viewing request" },
      { id: "demo_enquiry", title: "❓ Property Enquiry", description: "Submit a specific request" },
      { id: "demo_agent", title: "📞 Talk to Agent", description: "Connect with a property agent" },
    ],
    relatedDemoIds: ["real_estate", "appointment_booking", "crm"],
    sampleResponses: {
      demo_listings:
        `🏘️ *Sample Property Listings*\n\n` +
        `1. *3BR Duplex, Lekki* — ₦85M\n` +
        `   BQ, Fitted Kitchen, 24hr Power\n\n` +
        `2. *2BR Flat, Ikeja* — ₦1.8M/yr\n` +
        `   Serviced, Gated Estate\n\n` +
        `3. *5BR Mansion, Banana Island* — ₦350M\n` +
        `   Pool, Gym, Smart Home\n\n` +
        `⚠️ _Sample listings for demonstration._`,
      demo_inspection:
        `🔍 *Inspection Request Logged!*\n\n` +
        `An agent would confirm the viewing schedule ` +
        `within 2 hours.\n\n` +
        `⚠️ _Demo only — no real inspection scheduled._`,
      demo_enquiry:
        `❓ *Property Enquiry Received!*\n\n` +
        `⚠️ _Demo only — no real enquiry sent._`,
      demo_agent:
        `📞 *Agent Callback Logged!*\n\n` +
        `⚠️ _Demo only — no actual call placed._`,
    },
  },

  retail: {
    key: "retail",
    label: "Retail Shop or Supermarket",
    icon: "🛒",
    existingDemoId: "online_store",
    welcomeMessage: (b) =>
      `Welcome to the *${b}* retail demo! 🛒\n\n` +
      `Imagine your customers could browse your product catalogue, ` +
      `place orders, and track deliveries — all through WhatsApp.\n\n` +
      `⚠️ _This is a demonstration with sample data._`,
    menuBody: (b) => `*${b} — Retail Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_catalogue", title: "📦 Product Catalogue", description: "Browse sample products" },
      { id: "demo_order", title: "🛍️ Place an Order", description: "Simulate an order flow" },
      { id: "demo_delivery", title: "🚚 Track Delivery", description: "Sample delivery tracking" },
      { id: "demo_support", title: "💬 Customer Support", description: "Simulate a support chat" },
    ],
    relatedDemoIds: ["online_store", "inventory", "payment_collection"],
    sampleResponses: {
      demo_catalogue:
        `📦 *Sample Product Catalogue*\n\n` +
        `1. *Indomie Carton (40pk)* — ₦6,800\n` +
        `2. *Golden Penny Flour 10kg* — ₦8,500\n` +
        `3. *Peak Milk 900g* — ₦5,200\n` +
        `4. *Dettol Soap 70g (6pk)* — ₦1,800\n\n` +
        `⚠️ _Sample products and prices for demonstration._`,
      demo_order:
        `🛍️ *Order Placed!*\n\n` +
        `✅ Order #XTD-20250615-001\n` +
        `✅ Items: 3 products\n` +
        `✅ Total: ₦20,500\n` +
        `✅ Payment: Pay on Delivery\n\n` +
        `In a live system, this would deduct stock and ` +
        `notify the dispatch team.\n\n` +
        `⚠️ _No real order was placed._`,
      demo_delivery:
        `🚚 *Sample Delivery Status*\n\n` +
        `📦 Order #XTD-20250615-001\n` +
        `📍 Status: Out for Delivery\n` +
        `🕐 ETA: 45 minutes\n` +
        `👤 Rider: Chinedu (+234...)\n\n` +
        `⚠️ _Sample tracking data for demonstration._`,
      demo_support:
        `💬 *Support Chat Simulation*\n\n` +
        `_"Welcome to ${b} support! How can I help?"_\n\n` +
        `⚠️ _Demo only — no real agent connected._`,
    },
  },

  restaurant: {
    key: "restaurant",
    label: "Restaurant or Food Business",
    icon: "🍽️",
    existingDemoId: "restaurant",
    welcomeMessage: (b) =>
      `Welcome to the *${b}* restaurant demo! 🍽️\n\n` +
      `Imagine customers could view your menu, place orders, ` +
      `and make reservations — all through WhatsApp.\n\n` +
      `⚠️ _This is a demonstration with sample data._`,
    menuBody: (b) => `*${b} — Restaurant Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_menu", title: "📋 View Menu", description: "Sample food menu & prices" },
      { id: "demo_order_food", title: "🍔 Order Food", description: "Simulate a food order" },
      { id: "demo_reserve", title: "📅 Reserve a Table", description: "Simulate a reservation" },
      { id: "demo_contact", title: "📞 Contact Us", description: "Speak to the restaurant" },
    ],
    relatedDemoIds: ["restaurant", "appointment_booking", "payment_collection"],
    sampleResponses: {
      demo_menu:
        `📋 *Sample Menu*\n\n` +
        `🍚 *Jollof Rice & Chicken* — ₦3,500\n` +
        `🍗 *Pepper Soup (Goat)* — ₦4,000\n` +
        `🥗 *Caesar Salad* — ₦2,500\n` +
        `🍕 *Margherita Pizza* — ₦5,000\n` +
        `🥤 *Chapman* — ₦1,500\n\n` +
        `⚠️ _Sample menu for demonstration._`,
      demo_order_food:
        `🍔 *Food Order Received!*\n\n` +
        `✅ 2x Jollof Rice & Chicken\n` +
        `✅ 1x Chapman\n` +
        `✅ Total: ₦8,500\n` +
        `🕐 Estimated prep: 25 mins\n\n` +
        `⚠️ _No real order was placed._`,
      demo_reserve:
        `📅 *Table Reservation Logged!*\n\n` +
        `✅ Date: Sample Saturday\n` +
        `✅ Time: 7:00 PM\n` +
        `✅ Guests: 4\n\n` +
        `⚠️ _No real reservation was made._`,
      demo_contact:
        `📞 *Callback Request Logged!*\n\n` +
        `⚠️ _Demo only — no actual call placed._`,
    },
  },

  digital_agency: {
    key: "digital_agency",
    label: "Digital Agency or IT Services",
    icon: "💻",
    existingDemoId: "custom_automation",
    welcomeMessage: (b) =>
      `Welcome to the *${b}* agency demo! 💻\n\n` +
      `Imagine your clients could explore your services, ` +
      `request quotes, and submit project briefs — ` +
      `all through WhatsApp.\n\n` +
      `⚠️ _This is a demonstration with sample data._`,
    menuBody: (b) => `*${b} — Agency Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_services", title: "⚙️ View Services", description: "Sample service offerings" },
      { id: "demo_quote", title: "💰 Request a Quote", description: "Simulate a quote request" },
      { id: "demo_portfolio", title: "🎨 Portfolio", description: "Sample past projects" },
      { id: "demo_contact", title: "📞 Contact Team", description: "Talk to a project manager" },
    ],
    relatedDemoIds: ["custom_automation", "crm", "customer_support"],
    sampleResponses: {
      demo_services:
        `⚙️ *Sample Services*\n\n` +
        `1. *Website Design* — from ₦150,000\n` +
        `2. *WhatsApp Bot Development* — from ₦200,000\n` +
        `3. *Social Media Management* — ₦80,000/mo\n` +
        `4. *Brand Identity* — from ₦100,000\n\n` +
        `⚠️ _Sample pricing for demonstration._`,
      demo_quote:
        `💰 *Quote Request Received!*\n\n` +
        `A project manager would review your brief ` +
        `and send a detailed proposal within 24 hours.\n\n` +
        `⚠️ _Demo only — no real quote generated._`,
      demo_portfolio:
        `🎨 *Sample Portfolio*\n\n` +
        `• E-commerce site for FashionBrand NG\n` +
        `• WhatsApp bot for LagosHotel\n` +
        `• Rebrand for TechStart Africa\n\n` +
        `⚠️ _Sample projects for demonstration._`,
      demo_contact:
        `📞 *Team Callback Logged!*\n\n` +
        `⚠️ _Demo only — no actual call placed._`,
    },
  },

  professional: {
    key: "professional",
    label: "Professional Services",
    icon: "💼",
    existingDemoId: "crm",
    welcomeMessage: (b) =>
      `Welcome to the *${b}* professional services demo! 💼\n\n` +
      `Imagine clients could book consultations, ` +
      `submit enquiries, and receive automated follow-ups ` +
      `— all through WhatsApp.\n\n` +
      `⚠️ _This is a demonstration with sample data._`,
    menuBody: (b) => `*${b} — Services Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_services", title: "📋 Our Services", description: "Sample service list" },
      { id: "demo_consult", title: "📅 Book Consultation", description: "Simulate a booking" },
      { id: "demo_enquiry", title: "❓ Submit Enquiry", description: "Ask a question" },
      { id: "demo_contact", title: "📞 Request a Call", description: "Speak to a consultant" },
    ],
    relatedDemoIds: ["crm", "appointment_booking", "customer_support"],
    sampleResponses: {
      demo_services:
        `📋 *Sample Services*\n\n` +
        `• Business Registration\n` +
        `• Tax Advisory\n` +
        `• Legal Consultation\n` +
        `• Financial Planning\n\n` +
        `⚠️ _Sample services for demonstration._`,
      demo_consult:
        `📅 *Consultation Booked!*\n\n` +
        `✅ Date: Sample Weekday\n` +
        `✅ Time: 10:00 AM\n` +
        `✅ Duration: 30 mins\n\n` +
        `⚠️ _No real booking was made._`,
      demo_enquiry:
        `❓ *Enquiry Received!*\n\n` +
        `⚠️ _Demo only — no real enquiry sent._`,
      demo_contact:
        `📞 *Callback Logged!*\n\n` +
        `⚠️ _Demo only — no actual call placed._`,
    },
  },

  other: {
    key: "other",
    label: "Other Business",
    icon: "🏢",
    existingDemoId: "business_calculator",
    welcomeMessage: (b) =>
      `Welcome to the *${b}* business demo! 🏢\n\n` +
      `Imagine your customers could interact with your business ` +
      `through WhatsApp — browsing services, submitting enquiries, ` +
      `and getting instant responses.\n\n` +
      `⚠️ _This is a demonstration with sample data._`,
    menuBody: (b) => `*${b} — Business Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_services", title: "📋 View Services", description: "Sample service offerings" },
      { id: "demo_enquiry", title: "❓ Submit Enquiry", description: "Simulate an enquiry" },
      { id: "demo_quote", title: "💰 Request a Quote", description: "Simulate a quote request" },
      { id: "demo_contact", title: "📞 Contact Us", description: "Request a callback" },
    ],
    relatedDemoIds: ["crm", "customer_support", "business_calculator"],
    sampleResponses: {
      demo_services:
        `📋 *Sample Services*\n\n` +
        `Your custom service catalogue would appear here, ` +
        `tailored to your specific business.\n\n` +
        `⚠️ _Sample data for demonstration._`,
      demo_enquiry:
        `❓ *Enquiry Received!*\n\n` +
        `⚠️ _Demo only — no real enquiry sent._`,
      demo_quote:
        `💰 *Quote Request Logged!*\n\n` +
        `⚠️ _Demo only — no real quote generated._`,
      demo_contact:
        `📞 *Callback Logged!*\n\n` +
        `⚠️ _Demo only — no actual call placed._`,
    },
  },
};

/**
 * Get a template by key. Falls back to 'other' if not found.
 */
export function getIndustryTemplate(key: string): IndustryTemplate {
  return TEMPLATES[key] || TEMPLATES["other"];
}

/**
 * Get all available template keys and labels (for onboarding selection).
 */
export function getIndustryOptions(): { key: string; label: string; icon: string }[] {
  return Object.values(TEMPLATES).map((t) => ({
    key: t.key,
    label: t.label,
    icon: t.icon,
  }));
}

/**
 * Map a business category string to a template key.
 * Handles fuzzy matching from onboarding input.
 */
export function resolveTemplateKey(category: string): string {
  const lower = category.toLowerCase();
  if (lower.includes("hotel") || lower.includes("accommodation") || lower.includes("lodge")) return "hotel";
  if (lower.includes("school") || lower.includes("education") || lower.includes("academy")) return "school";
  if (lower.includes("event") || lower.includes("venue") || lower.includes("hall")) return "event_centre";
  if (lower.includes("car") || lower.includes("auto") || lower.includes("vehicle") || lower.includes("dealer")) return "car_dealer";
  if (lower.includes("real estate") || lower.includes("property") || lower.includes("estate")) return "real_estate";
  if (lower.includes("retail") || lower.includes("shop") || lower.includes("supermarket") || lower.includes("store")) return "retail";
  if (lower.includes("restaurant") || lower.includes("food") || lower.includes("cafe") || lower.includes("catering")) return "restaurant";
  if (lower.includes("digital") || lower.includes("agency") || lower.includes("it") || lower.includes("tech") || lower.includes("web")) return "digital_agency";
  if (lower.includes("professional") || lower.includes("consult") || lower.includes("legal") || lower.includes("account")) return "professional";
  return "other";
}
