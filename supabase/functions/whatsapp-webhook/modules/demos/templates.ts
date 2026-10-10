// modules/demos/templates.ts
// Generic, data-driven business template registry.
// 14 industry categories. No hardcoded business names.
// All sample responses use function-based rendering to prevent scope errors.

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
  welcomeMessage: (biz: string) => string;
  menuBody: (biz: string) => string;
  menuOptions: DemoMenuOption[];
  relatedDemoIds: string[];
  sampleResponses: Record<string, (biz: string) => string>;
  dataFields: string[];
  agentHandover: (biz: string) => string;
}

// ─────────────────────────────────────────────
// TEMPLATE REGISTRY
// ─────────────────────────────────────────────

const T: Record<string, IndustryTemplate> = {

  // ── 1. HOTEL & ACCOMMODATION ──
  hotel: {
    key: "hotel",
    label: "Hotel & Accommodation",
    icon: "🏨",
    existingDemoId: "appointment_booking",
    welcomeMessage: (b) =>
      `Welcome to the *${b}* hotel demo! 🏨\n\n` +
      `Imagine your guests could use WhatsApp to explore room options, ` +
      `check availability, and request reservations — all automatically.\n\n` +
      `⚠️ _This is a demonstration with sample data. No real bookings are made._`,
    menuBody: (b) => `*${b} — Hotel Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_rooms", title: "🛏️ View Rooms", description: "Sample room types & rates" },
      { id: "demo_booking", title: "📅 Booking Enquiry", description: "Simulate a reservation" },
      { id: "demo_call", title: "📞 Request a Call", description: "Ask the hotel to call back" },
      { id: "demo_staff", title: "💬 Talk to Staff", description: "Simulate live chat handoff" },
    ],
    relatedDemoIds: ["appointment_booking", "restaurant", "real_estate"],
    sampleResponses: {
      demo_rooms: (b) =>
        `🛏️ *Sample Room Options — ${b}*\n\n` +
        `1. *Standard Room* — ₦25,000/night\n   AC, TV, WiFi, Ensuite\n\n` +
        `2. *Deluxe Suite* — ₦55,000/night\n   King bed, Lounge, Balcony\n\n` +
        `3. *Executive Suite* — ₦95,000/night\n   2 Rooms, Jacuzzi, City View\n\n` +
        `⚠️ _Sample rates for demonstration._`,
      demo_booking: () =>
        `📅 *Booking Enquiry Received!*\n\n` +
        `✅ Check-in: Sample Date\n✅ Room: Deluxe Suite\n✅ Guests: 2 Adults\n\n` +
        `In a live system, this would check real availability and send confirmations.\n\n` +
        `⚠️ _No real booking was made._`,
      demo_call: () =>
        `📞 *Callback Request Logged!*\n\nA staff member would call within 15 minutes during business hours.\n\n⚠️ _Demo only._`,
      demo_staff: () =>
        `💬 *Live Chat Simulation*\n\n_"Welcome! How can I assist you today?"_\n\nIn a live system, this connects to a real staff member.\n\n⚠️ _Demo only._`,
    },
    dataFields: ["business_name", "room_count", "location", "star_rating"],
    agentHandover: (b) => `Hotel demo lead for *${b}*. Interested in guest enquiry automation.`,
  },

  // ── 2. SHORT-LET APARTMENTS ──
  shortlet: {
    key: "shortlet",
    label: "Short-Let Apartments",
    icon: "🏠",
    existingDemoId: "appointment_booking",
    welcomeMessage: (b) =>
      `Welcome to the *${b}* short-let demo! 🏠\n\n` +
      `Imagine guests could browse your apartments, check availability, ` +
      `and book stays — all through WhatsApp.\n\n` +
      `⚠️ _Demonstration with sample data only._`,
    menuBody: (b) => `*${b} — Short-Let Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_apartments", title: "🏘️ View Apartments", description: "Sample listings & rates" },
      { id: "demo_booking", title: "📅 Check Availability", description: "Simulate a booking" },
      { id: "demo_rules", title: "📋 House Rules", description: "Sample guest guidelines" },
      { id: "demo_contact", title: "📞 Contact Host", description: "Request a callback" },
    ],
    relatedDemoIds: ["appointment_booking", "hotel", "real_estate"],
    sampleResponses: {
      demo_apartments: (b) =>
        `🏘️ *Sample Apartments — ${b}*\n\n` +
        `1. *1BR Lekki* — ₦45,000/night\n   WiFi, DSTV, Generator\n\n` +
        `2. *2BR Victoria Island* — ₦75,000/night\n   Pool, Gym, Security\n\n` +
        `3. *Studio Ikeja* — ₦25,000/night\n   Compact, AC, Kitchenette\n\n` +
        `⚠️ _Sample listings for demonstration._`,
      demo_booking: () =>
        `📅 *Availability Check*\n\n✅ Dates: Sample weekend\n✅ Unit: 1BR Lekki\n✅ Status: Available\n\n⚠️ _No real booking made._`,
      demo_rules: () =>
        `📋 *Sample House Rules*\n\n• Check-in: 2 PM | Check-out: 11 AM\n• No smoking\n• No parties after 10 PM\n• Max 4 guests\n\n⚠️ _Sample rules._`,
      demo_contact: () =>
        `📞 *Host Callback Logged!*\n\n⚠️ _Demo only — no actual call placed._`,
    },
    dataFields: ["business_name", "unit_count", "locations", "price_range"],
    agentHandover: (b) => `Short-let demo lead for *${b}*. Interested in booking automation.`,
  },

  // ── 3. SCHOOLS & EDUCATION ──
  school: {
    key: "school",
    label: "School & Education",
    icon: "🎓",
    existingDemoId: null,
    welcomeMessage: (b) =>
      `Welcome to the *${b}* education demo! 🎓\n\n` +
      `Imagine parents and students could use WhatsApp to enquire about ` +
      `admissions, check fees, and get instant answers.\n\n` +
      `⚠️ _Demonstration with sample data._`,
    menuBody: (b) => `*${b} — School Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_admissions", title: "📝 Admissions", description: "Sample requirements" },
      { id: "demo_fees", title: "💰 School Fees", description: "Sample fee structure" },
      { id: "demo_enquiry", title: "❓ Submit Enquiry", description: "Simulate parent enquiry" },
      { id: "demo_contact", title: "📞 Contact School", description: "Request a callback" },
    ],
    relatedDemoIds: ["appointment_booking", "customer_support"],
    sampleResponses: {
      demo_admissions: () =>
        `📝 *Sample Admission Requirements*\n\n` +
        `• Completed application form\n• Birth certificate\n• Previous school report\n` +
        `• Passport photographs (4)\n• Entrance examination\n\n` +
        `📅 *Next intake:* September 2025\n\n⚠️ _Sample data._`,
      demo_fees: () =>
        `💰 *Sample Fee Structure (Per Term)*\n\n` +
        `• Nursery: ₦75,000\n• Primary: ₦95,000\n• Secondary: ₦120,000\n\n` +
        `⚠️ _Sample figures._`,
      demo_enquiry: () =>
        `❓ *Enquiry Received!*\n\nIn a live system, this would be forwarded to admissions with a 24hr response SLA.\n\n⚠️ _Demo only._`,
      demo_contact: () =>
        `📞 *Callback Request Logged!*\n\n⚠️ _Demo only._`,
    },
    dataFields: ["business_name", "school_type", "student_count", "levels"],
    agentHandover: (b) => `School demo lead for *${b}*. Interested in admissions automation.`,
  },

  // ── 4. EVENT CENTRES & PLANNERS ──
  event_centre: {
    key: "event_centre",
    label: "Event Centre & Planner",
    icon: "🎉",
    existingDemoId: "appointment_booking",
    welcomeMessage: (b) =>
      `Welcome to the *${b}* event demo! 🎉\n\n` +
      `Imagine clients could check venue availability, view packages, ` +
      `and submit booking enquiries through WhatsApp.\n\n` +
      `⚠️ _Demonstration with sample data._`,
    menuBody: (b) => `*${b} — Event Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_venues", title: "🏛️ View Venues", description: "Sample halls & capacity" },
      { id: "demo_packages", title: "📦 Packages", description: "Sample pricing tiers" },
      { id: "demo_booking", title: "📅 Booking Enquiry", description: "Simulate a reservation" },
      { id: "demo_contact", title: "📞 Request a Call", description: "Speak to a planner" },
    ],
    relatedDemoIds: ["appointment_booking", "restaurant", "hotel"],
    sampleResponses: {
      demo_venues: (b) =>
        `🏛️ *Sample Venues — ${b}*\n\n` +
        `1. *Grand Hall* — 500 guests\n   Stage, AC, Sound\n\n` +
        `2. *Banquet Room* — 150 guests\n   Round tables, Projector\n\n` +
        `3. *Garden Pavilion* — 300 guests\n   Outdoor, Canopy\n\n⚠️ _Sample data._`,
      demo_packages: () =>
        `📦 *Sample Packages*\n\n🥉 Basic: ₦250,000\n🥈 Standard: ₦500,000\n🥇 Premium: ₦1,000,000\n\n⚠️ _Sample pricing._`,
      demo_booking: () =>
        `📅 *Booking Enquiry Received!*\n\nIn a live system, this checks real calendar availability.\n\n⚠️ _No real booking._`,
      demo_contact: () =>
        `📞 *Planner Callback Logged!*\n\n⚠️ _Demo only._`,
    },
    dataFields: ["business_name", "venue_count", "capacity", "event_types"],
    agentHandover: (b) => `Event centre demo lead for *${b}*. Interested in booking automation.`,
  },

  // ── 5. CAR DEALERS & AUTOMOBILE ──
  car_dealer: {
    key: "car_dealer",
    label: "Car Dealer & Automobile",
    icon: "🚗",
    existingDemoId: "auto_workshop",
    welcomeMessage: (b) =>
      `Welcome to the *${b}* auto demo! 🚗\n\n` +
      `Imagine customers could browse your vehicle inventory, request test ` +
      `drives, and submit purchase enquiries through WhatsApp.\n\n` +
      `⚠️ _Demonstration with sample data._`,
    menuBody: (b) => `*${b} — Auto Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_inventory", title: "🚘 View Vehicles", description: "Sample catalogue" },
      { id: "demo_testdrive", title: "🔑 Test Drive", description: "Simulate a request" },
      { id: "demo_quote", title: "💰 Get a Quote", description: "Simulate price enquiry" },
      { id: "demo_contact", title: "📞 Talk to Sales", description: "Connect with a rep" },
    ],
    relatedDemoIds: ["auto_workshop", "inventory", "crm"],
    sampleResponses: {
      demo_inventory: (b) =>
        `🚘 *Sample Inventory — ${b}*\n\n` +
        `1. *Toyota Camry 2022* — ₦18.5M\n   Auto, 15k km\n\n` +
        `2. *Honda CR-V 2021* — ₦22M\n   SUV, 22k km\n\n` +
        `3. *Mercedes C300 2023* — ₦38M\n   Brand New\n\n⚠️ _Sample inventory._`,
      demo_testdrive: () =>
        `🔑 *Test Drive Request Logged!*\n\nIn a live system, this schedules and notifies sales.\n\n⚠️ _Demo only._`,
      demo_quote: () =>
        `💰 *Quote Request Received!*\n\nA rep would prepare financing options within 1 hour.\n\n⚠️ _Demo only._`,
      demo_contact: () =>
        `📞 *Sales Rep Callback Logged!*\n\n⚠️ _Demo only._`,
    },
    dataFields: ["business_name", "vehicle_types", "brands", "showroom_location"],
    agentHandover: (b) => `Auto dealer demo lead for *${b}*. Interested in vehicle catalogue & lead capture.`,
  },

  // ── 6. REAL ESTATE ──
  real_estate: {
    key: "real_estate",
    label: "Real Estate",
    icon: "🏗️",
    existingDemoId: "real_estate",
    welcomeMessage: (b) =>
      `Welcome to the *${b}* property demo! 🏗️\n\n` +
      `Imagine clients could browse listings, schedule inspections, ` +
      `and submit enquiries through WhatsApp.\n\n` +
      `⚠️ _Demonstration with sample data._`,
    menuBody: (b) => `*${b} — Real Estate Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_listings", title: "🏘️ View Properties", description: "Sample listings" },
      { id: "demo_inspection", title: "🔍 Inspection", description: "Schedule a viewing" },
      { id: "demo_enquiry", title: "❓ Enquiry", description: "Submit a request" },
      { id: "demo_agent", title: "📞 Talk to Agent", description: "Connect with an agent" },
    ],
    relatedDemoIds: ["real_estate", "appointment_booking", "crm"],
    sampleResponses: {
      demo_listings: (b) =>
        `🏘️ *Sample Listings — ${b}*\n\n` +
        `1. *3BR Duplex, Lekki* — ₦85M\n   BQ, Fitted Kitchen\n\n` +
        `2. *2BR Flat, Ikeja* — ₦1.8M/yr\n   Serviced, Gated\n\n` +
        `3. *5BR Mansion, BI* — ₦350M\n   Pool, Smart Home\n\n⚠️ _Sample listings._`,
      demo_inspection: () =>
        `🔍 *Inspection Request Logged!*\n\nAn agent would confirm within 2 hours.\n\n⚠️ _Demo only._`,
      demo_enquiry: () =>
        `❓ *Property Enquiry Received!*\n\n⚠️ _Demo only._`,
      demo_agent: () =>
        `📞 *Agent Callback Logged!*\n\n⚠️ _Demo only._`,
    },
    dataFields: ["business_name", "property_types", "locations", "price_range"],
    agentHandover: (b) => `Real estate demo lead for *${b}*. Interested in property enquiry automation.`,
  },

  // ── 7. RETAIL & SUPERMARKET ──
  retail: {
    key: "retail",
    label: "Retail Shop & Supermarket",
    icon: "🛒",
    existingDemoId: "online_store",
    welcomeMessage: (b) =>
      `Welcome to the *${b}* retail demo! 🛒\n\n` +
      `Imagine customers could browse your catalogue, place orders, ` +
      `and track deliveries through WhatsApp.\n\n` +
      `⚠️ _Demonstration with sample data._`,
    menuBody: (b) => `*${b} — Retail Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_catalogue", title: "📦 Catalogue", description: "Browse sample products" },
      { id: "demo_order", title: "🛍️ Place Order", description: "Simulate an order" },
      { id: "demo_delivery", title: "🚚 Track Delivery", description: "Sample tracking" },
      { id: "demo_support", title: "💬 Support", description: "Simulate support chat" },
    ],
    relatedDemoIds: ["online_store", "inventory", "payment_collection"],
    sampleResponses: {
      demo_catalogue: (b) =>
        `📦 *Sample Catalogue — ${b}*\n\n` +
        `1. *Indomie Carton (40pk)* — ₦6,800\n` +
        `2. *Golden Penny Flour 10kg* — ₦8,500\n` +
        `3. *Peak Milk 900g* — ₦5,200\n\n⚠️ _Sample products._`,
      demo_order: () =>
        `🛍️ *Order Placed!*\n\n✅ Order #XTD-SAMPLE-001\n✅ Items: 3\n✅ Total: ₦20,500\n✅ Payment: POD\n\n⚠️ _No real order._`,
      demo_delivery: () =>
        `🚚 *Sample Tracking*\n\n📦 #XTD-SAMPLE-001\n📍 Out for Delivery\n🕐 ETA: 45 mins\n\n⚠️ _Sample data._`,
      demo_support: () =>
        `💬 *Support Simulation*\n\n_"Welcome to customer support! How can I help?"_\n\n⚠️ _Demo only._`,
    },
    dataFields: ["business_name", "product_categories", "branch_count", "delivery_area"],
    agentHandover: (b) => `Retail demo lead for *${b}*. Interested in catalogue & ordering automation.`,
  },

  // ── 8. RESTAURANT & FOOD ──
  restaurant: {
    key: "restaurant",
    label: "Restaurant & Food Business",
    icon: "🍽️",
    existingDemoId: "restaurant",
    welcomeMessage: (b) =>
      `Welcome to the *${b}* restaurant demo! 🍽️\n\n` +
      `Imagine customers could view your menu, place orders, ` +
      `and make reservations through WhatsApp.\n\n` +
      `⚠️ _Demonstration with sample data._`,
    menuBody: (b) => `*${b} — Restaurant Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_menu", title: "📋 View Menu", description: "Sample food & prices" },
      { id: "demo_order", title: "🍔 Order Food", description: "Simulate an order" },
      { id: "demo_reserve", title: "📅 Reserve Table", description: "Simulate a booking" },
      { id: "demo_contact", title: "📞 Contact Us", description: "Speak to the restaurant" },
    ],
    relatedDemoIds: ["restaurant", "appointment_booking", "payment_collection"],
    sampleResponses: {
      demo_menu: (b) =>
        `📋 *Sample Menu — ${b}*\n\n` +
        `🍚 Jollof Rice & Chicken — ₦3,500\n` +
        `🍗 Pepper Soup (Goat) — ₦4,000\n` +
        `🍕 Margherita Pizza — ₦5,000\n` +
        `🥤 Chapman — ₦1,500\n\n⚠️ _Sample menu._`,
      demo_order: () =>
        `🍔 *Order Received!*\n\n✅ 2x Jollof + 1x Chapman\n✅ Total: ₦8,500\n🕐 Prep: 25 mins\n\n⚠️ _No real order._`,
      demo_reserve: () =>
        `📅 *Reservation Logged!*\n\n✅ Saturday 7 PM\n✅ 4 Guests\n\n⚠️ _No real reservation._`,
      demo_contact: () =>
        `📞 *Callback Logged!*\n\n⚠️ _Demo only._`,
    },
    dataFields: ["business_name", "cuisine_type", "seating_capacity", "delivery_available"],
    agentHandover: (b) => `Restaurant demo lead for *${b}*. Interested in menu & ordering automation.`,
  },

  // ── 9. DIGITAL AGENCY & IT ──
  digital_agency: {
    key: "digital_agency",
    label: "Digital Agency & IT Services",
    icon: "💻",
    existingDemoId: "custom_automation",
    welcomeMessage: (b) =>
      `Welcome to the *${b}* agency demo! 💻\n\n` +
      `Imagine clients could explore your services, request quotes, ` +
      `and submit project briefs through WhatsApp.\n\n` +
      `⚠️ _Demonstration with sample data._`,
    menuBody: (b) => `*${b} — Agency Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_services", title: "⚙️ Services", description: "Sample offerings" },
      { id: "demo_quote", title: "💰 Request Quote", description: "Simulate a quote" },
      { id: "demo_portfolio", title: "🎨 Portfolio", description: "Sample past work" },
      { id: "demo_contact", title: "📞 Contact Team", description: "Talk to a PM" },
    ],
    relatedDemoIds: ["custom_automation", "crm", "customer_support"],
    sampleResponses: {
      demo_services: (b) =>
        `⚙️ *Sample Services — ${b}*\n\n` +
        `1. Website Design — from ₦150,000\n` +
        `2. WhatsApp Bot — from ₦200,000\n` +
        `3. Social Media — ₦80,000/mo\n` +
        `4. Brand Identity — from ₦100,000\n\n⚠️ _Sample pricing._`,
      demo_quote: () =>
        `💰 *Quote Request Received!*\n\nA PM would send a proposal within 24hrs.\n\n⚠️ _Demo only._`,
      demo_portfolio: () =>
        `🎨 *Sample Portfolio*\n\n• E-commerce for FashionBrand NG\n• WhatsApp bot for LagosHotel\n• Rebrand for TechStart Africa\n\n⚠️ _Sample projects._`,
      demo_contact: () =>
        `📞 *Team Callback Logged!*\n\n⚠️ _Demo only._`,
    },
    dataFields: ["business_name", "service_types", "team_size", "target_clients"],
    agentHandover: (b) => `Agency demo lead for *${b}*. Interested in client enquiry automation.`,
  },

  // ── 10. CLINICS & HEALTHCARE ──
  clinic: {
    key: "clinic",
    label: "Clinic & Healthcare",
    icon: "🏥",
    existingDemoId: "appointment_booking",
    welcomeMessage: (b) =>
      `Welcome to the *${b}* healthcare demo! 🏥\n\n` +
      `Imagine patients could book appointments, receive reminders, ` +
      `and ask health questions through WhatsApp.\n\n` +
      `⚠️ _Demonstration with sample data. No real medical advice._`,
    menuBody: (b) => `*${b} — Clinic Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_departments", title: "🩺 Departments", description: "Sample specialties" },
      { id: "demo_appointment", title: "📅 Book Appointment", description: "Simulate a booking" },
      { id: "demo_reminder", title: "🔔 Reminders", description: "Sample reminder flow" },
      { id: "demo_contact", title: "📞 Contact Clinic", description: "Request a callback" },
    ],
    relatedDemoIds: ["appointment_booking", "customer_support", "crm"],
    sampleResponses: {
      demo_departments: (b) =>
        `🩺 *Sample Departments — ${b}*\n\n` +
        `• General Practice\n• Paediatrics\n• Dental\n• Optometry\n• Lab Services\n\n⚠️ _Sample data._`,
      demo_appointment: () =>
        `📅 *Appointment Booked!*\n\n✅ Doctor: Dr. Sample\n✅ Date: Tomorrow 10 AM\n✅ Dept: General\n\n⚠️ _No real appointment._`,
      demo_reminder: () =>
        `🔔 *Sample Reminder*\n\n_"Hi! Your appointment with Dr. Sample is tomorrow at 10 AM. Reply YES to confirm."_ \n\n⚠️ _Demo only._`,
      demo_contact: () =>
        `📞 *Clinic Callback Logged!*\n\n⚠️ _Demo only._`,
    },
    dataFields: ["business_name", "specialties", "doctor_count", "operating_hours"],
    agentHandover: (b) => `Clinic demo lead for *${b}*. Interested in appointment & reminder automation.`,
  },

  // ── 11. PROFESSIONAL SERVICES ──
  professional: {
    key: "professional",
    label: "Professional Services",
    icon: "💼",
    existingDemoId: "crm",
    welcomeMessage: (b) =>
      `Welcome to the *${b}* professional services demo! 💼\n\n` +
      `Imagine clients could book consultations, submit enquiries, ` +
      `and receive follow-ups through WhatsApp.\n\n` +
      `⚠️ _Demonstration with sample data._`,
    menuBody: (b) => `*${b} — Services Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_services", title: "📋 Services", description: "Sample offerings" },
      { id: "demo_consult", title: "📅 Book Consultation", description: "Simulate a booking" },
      { id: "demo_enquiry", title: "❓ Enquiry", description: "Submit a question" },
      { id: "demo_contact", title: "📞 Request Call", description: "Speak to a consultant" },
    ],
    relatedDemoIds: ["crm", "appointment_booking", "customer_support"],
    sampleResponses: {
      demo_services: (b) =>
        `📋 *Sample Services — ${b}*\n\n` +
        `• Business Registration\n• Tax Advisory\n• Legal Consultation\n• Financial Planning\n\n⚠️ _Sample data._`,
      demo_consult: () =>
        `📅 *Consultation Booked!*\n\n✅ Weekday 10 AM\n✅ 30 mins\n\n⚠️ _No real booking._`,
      demo_enquiry: () =>
        `❓ *Enquiry Received!*\n\n⚠️ _Demo only._`,
      demo_contact: () =>
        `📞 *Callback Logged!*\n\n⚠️ _Demo only._`,
    },
    dataFields: ["business_name", "service_types", "consultant_count", "certifications"],
    agentHandover: (b) => `Professional services demo lead for *${b}*. Interested in consultation automation.`,
  },

  // ── 12. BEAUTY & PERSONAL CARE ──
  beauty: {
    key: "beauty",
    label: "Beauty & Personal Care",
    icon: "💇",
    existingDemoId: "appointment_booking",
    welcomeMessage: (b) =>
      `Welcome to the *${b}* beauty demo! 💇\n\n` +
      `Imagine clients could browse your services, book appointments, ` +
      `and receive aftercare tips through WhatsApp.\n\n` +
      `⚠️ _Demonstration with sample data._`,
    menuBody: (b) => `*${b} — Beauty Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_services", title: "💅 Services & Prices", description: "Sample service menu" },
      { id: "demo_booking", title: "📅 Book Appointment", description: "Simulate a booking" },
      { id: "demo_gallery", title: "📸 Gallery", description: "Sample portfolio" },
      { id: "demo_contact", title: "📞 Contact Salon", description: "Request a callback" },
    ],
    relatedDemoIds: ["appointment_booking", "crm", "customer_support"],
    sampleResponses: {
      demo_services: (b) =>
        `💅 *Sample Services — ${b}*\n\n` +
        `• Hair Styling — ₦5,000\n• Braiding — ₦8,000\n` +
        `• Manicure & Pedicure — ₦7,000\n• Facial — ₦10,000\n` +
        `• Makeup (Bridal) — ₦35,000\n\n⚠️ _Sample pricing._`,
      demo_booking: () =>
        `📅 *Appointment Booked!*\n\n✅ Service: Braiding\n✅ Stylist: Sample Stylist\n✅ Tomorrow 2 PM\n\n⚠️ _No real booking._`,
      demo_gallery: () =>
        `📸 *Sample Gallery*\n\nIn a live system, this would show real before/after photos from your portfolio.\n\n⚠️ _Demo only._`,
      demo_contact: () =>
        `📞 *Salon Callback Logged!*\n\n⚠️ _Demo only._`,
    },
    dataFields: ["business_name", "service_types", "stylist_count", "location"],
    agentHandover: (b) => `Beauty demo lead for *${b}*. Interested in booking & client management.`,
  },

  // ── 13. LOGISTICS & DELIVERY ──
  logistics: {
    key: "logistics",
    label: "Logistics & Delivery",
    icon: "🚚",
    existingDemoId: "inventory",
    welcomeMessage: (b) =>
      `Welcome to the *${b}* logistics demo! 🚚\n\n` +
      `Imagine customers could request pickups, track deliveries, ` +
      `and get instant quotes through WhatsApp.\n\n` +
      `⚠️ _Demonstration with sample data._`,
    menuBody: (b) => `*${b} — Logistics Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_quote", title: "💰 Get a Quote", description: "Sample delivery pricing" },
      { id: "demo_track", title: "📍 Track Delivery", description: "Simulate tracking" },
      { id: "demo_pickup", title: "📦 Request Pickup", description: "Simulate a pickup" },
      { id: "demo_contact", title: "📞 Contact Dispatch", description: "Talk to operations" },
    ],
    relatedDemoIds: ["inventory", "online_store", "payment_collection"],
    sampleResponses: {
      demo_quote: (b) =>
        `💰 *Sample Delivery Quotes — ${b}*\n\n` +
        `• Same City (≤10km): ₦1,500\n• Same City (>10km): ₦2,500\n` +
        `• Interstate: ₦5,000–₦15,000\n• Express (+50%)\n\n⚠️ _Sample rates._`,
      demo_track: () =>
        `📍 *Sample Tracking*\n\n📦 #LOG-SAMPLE-001\n📍 Status: In Transit\n🕐 ETA: 2 hours\n👤 Rider: Emeka\n\n⚠️ _Sample data._`,
      demo_pickup: () =>
        `📦 *Pickup Request Logged!*\n\n✅ Address: Sample Location\n✅ Time: Within 1 hour\n✅ Package: Medium\n\n⚠️ _No real pickup._`,
      demo_contact: () =>
        `📞 *Dispatch Callback Logged!*\n\n⚠️ _Demo only._`,
    },
    dataFields: ["business_name", "coverage_areas", "fleet_size", "delivery_types"],
    agentHandover: (b) => `Logistics demo lead for *${b}*. Interested in delivery tracking & quoting.`,
  },

  // ── 14. OTHER / GENERIC ──
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
      `⚠️ _Demonstration with sample data._`,
    menuBody: (b) => `*${b} — Business Demo*\n\nWhat would you like to explore?`,
    menuOptions: [
      { id: "demo_services", title: "📋 Services", description: "Sample offerings" },
      { id: "demo_enquiry", title: "❓ Enquiry", description: "Submit a question" },
      { id: "demo_quote", title: "💰 Request Quote", description: "Simulate a quote" },
      { id: "demo_contact", title: "📞 Contact Us", description: "Request a callback" },
    ],
    relatedDemoIds: ["crm", "customer_support", "business_calculator"],
    sampleResponses: {
      demo_services: (b) =>
        `📋 *Sample Services — ${b}*\n\nYour custom service catalogue would appear here, tailored to your business.\n\n⚠️ _Sample data._`,
      demo_enquiry: () =>
        `❓ *Enquiry Received!*\n\n⚠️ _Demo only._`,
      demo_quote: () =>
        `💰 *Quote Request Logged!*\n\n⚠️ _Demo only._`,
      demo_contact: () =>
        `📞 *Callback Logged!*\n\n⚠️ _Demo only._`,
    },
    dataFields: ["business_name", "industry", "main_service", "target_customers"],
    agentHandover: (b) => `Business demo lead for *${b}*. Interested in WhatsApp automation.`,
  },
};

// ─────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────

/** Get a template by key. Falls back to 'other'. */
export function getTemplate(key: string): IndustryTemplate {
  return T[key] || T["other"];
}

/** Get all template keys, labels, and icons for selection menus. */
export function getAllTemplateOptions(): { key: string; label: string; icon: string }[] {
  return Object.values(T).map((t) => ({ key: t.key, label: t.label, icon: t.icon }));
}

/** Get the subset of templates excluding 'other'. */
export function getSelectableTemplates(): { key: string; label: string; icon: string }[] {
  return Object.values(T)
    .filter((t) => t.key !== "other")
    .map((t) => ({ key: t.key, label: t.label, icon: t.icon }));
}

/**
 * Deterministic classifier: maps free-text category input to a template key.
 * Uses keyword matching — no AI API required.
 */
export function classifyCategory(input: string): string {
  const s = input.toLowerCase().trim();

  const rules: [string[], string][] = [
    [["hotel", "accommodation", "lodge", "resort", "motel", "guest house", "inn"], "hotel"],
    [["short-let", "shortlet", "short let", "airbnb", "apartment rental", "furnished"], "shortlet"],
    [["school", "education", "academy", "college", "university", "nursery", "creche", "tutor"], "school"],
    [["event", "venue", "hall", "banquet", "party", "wedding", "conference", "planner"], "event_centre"],
    [["car", "auto", "vehicle", "dealer", "showroom", "automobile", "motor", "garage"], "car_dealer"],
    [["real estate", "property", "estate", "realtor", "housing", "land", "apartment sale"], "real_estate"],
    [["retail", "shop", "supermarket", "store", "grocery", "mall", "market", "wholesale"], "retail"],
    [["restaurant", "food", "cafe", "catering", "kitchen", "eatery", "bistro", "fast food", "bakery"], "restaurant"],
    [["digital", "agency", "it", "tech", "web", "software", "app", "marketing", "seo", "design"], "digital_agency"],
    [["clinic", "health", "hospital", "doctor", "medical", "dental", "pharmacy", "diagnostic", "lab"], "clinic"],
    [["professional", "consult", "legal", "law", "account", "tax", "audit", "advisory", "finance"], "professional"],
    [["beauty", "salon", "spa", "hair", "makeup", "nail", "skincare", "barber", "cosmetic"], "beauty"],
    [["logistics", "delivery", "courier", "shipping", "dispatch", "freight", "transport", "haulage"], "logistics"],
  ];

  for (const [keywords, key] of rules) {
    for (const kw of keywords) {
      if (s.includes(kw)) return key;
    }
  }

  return "other";
}

/**
 * Get related templates for cross-selling.
 * Returns template keys that are adjacent to the given category.
 */
export function getRelatedTemplates(categoryKey: string): { key: string; label: string; icon: string }[] {
  const template = getTemplate(categoryKey);
  return template.relatedDemoIds
    .map((id) => {
      // Try to find a template whose existingDemoId matches, or whose key matches
      const match = Object.values(T).find(
        (t) => t.key === id || t.existingDemoId === id
      );
      return match ? { key: match.key, label: match.label, icon: match.icon } : null;
    })
    .filter(Boolean) as { key: string; label: string; icon: string }[];
}
