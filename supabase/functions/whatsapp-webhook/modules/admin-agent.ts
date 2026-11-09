// supabase/functions/whatsapp-webhook/modules/admin-agent.ts
// Private technical, diagnostic, and secure Lead Assistant (Lizzy)
// Enforces strict verification checks, ₦100k minimum qualifying threshold,
// redacted customer PII, explicit two-step approvals, and robust auditing.
// Fully button, list-menu, and text-command driven for mobile efficiency.

import {
  getSupabaseClient,
  SYSTEM_TENANT_ID,
  updateConversation,
  updateLead,
  updateQuotation,
  createAgentRequest,
  logSalesEvent,
  safeErrorLog,
} from "../database.ts";

import {
  sendTextMessage,
  sendButtonMessage,
  sendListMessage,
  makeButton,
  makeListRow,
} from "../whatsapp.ts";

import { callAI } from "../ai.ts";
import { formatNaira } from "./pricing.ts";
import { sendDocumentMessage } from "../whatsapp.ts";
import { PDFDocument, StandardFonts } from "npm:pdf-lib@1.17.1";

const supabase = getSupabaseClient();

const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const MIN_QUALIFYING_PRICE = 100000;

/* =========================================================
   PHONE / ADMIN ACCESS Normalizer and Checker
   ========================================================= */

function normalizePhone(raw: string): string {
  let phone = (raw || "").replace(/\D/g, "");

  if (phone.startsWith("0") && phone.length === 11) {
    phone = "234" + phone.slice(1);
  }

  return phone;
}

export function isAdminPhone(phone: string): boolean {
  const configured = Deno.env.get("XTOP_ADMIN_PHONE") || "";

  if (!configured) {
    console.error("[AdminAgent] XTOP_ADMIN_PHONE is not configured.");
    return false;
  }

  return normalizePhone(phone) === normalizePhone(configured);
}

export function isAdminAgentTrigger(
  text: string,
  interactiveId = "",
): boolean {
  const clean = text.trim().toLowerCase();
  return (
    clean === "lizzy" ||
    clean === "admin" ||
    interactiveId === "admin_agent_open" ||
    interactiveId === "admin_agent_menu"
  );
}

/**
 * Renders Lizzy's primary menu using WhatsApp native List selections.
 */
export async function showAdminAgentMenu(phone: string, page = 0): Promise<void> {
  // WhatsApp interactive lists allow at most 10 rows across all sections.
  // Three pages keep every Sabi and Learning Centre action reachable.
  const safePage = page === 2 ? 2 : page === 1 ? 1 : 0;
  const pageLabels = [
    "Page 1 of 3 — Lead & Quote Desk and core Sabi tools.",
    "Page 2 of 3 — More Sabi tools and System & Learning.",
    "Page 3 of 3 — ELA301 lecturer review tools.",
  ];
  const body =
    "🔐 *XTOP PRIVATE ADMIN ASSISTANT (LIZZY)*\\n\\n" +
    "Welcome, Authorized Admin.\\n\\n" +
    pageLabels[safePage] +
    (safePage === 0
      ? " Select Next Menu to continue."
      : safePage === 1
        ? " Select Next Menu for ELA301 review or Previous Menu to return."
        : " Select Previous Menu to return to System & Learning.");

  const pageOneSections = [
    {
      title: "💼 Lead & Quote Desk",
      rows: [
        makeListRow("admin_leads", "💼 List Leads", "Qualifying enquiries (>= ₦100k)"),
        makeListRow("admin_pending", "⏳ Pending Approvals", "Leads awaiting admin approval"),
        makeListRow("admin_approved", "✅ Approved Archives", "Explicitly approved leads list"),
      ],
    },
    {
      title: "🛍️ Sabi by XTOP Platform",
      rows: [
        makeListRow("admin_sabi_overview", "📊 Sabi Platform Overview", "Merchants, products, orders and WhatsApp"),
        makeListRow("admin_sabi_merchants", "🏪 Merchant Directory", "Business names and payout verification status"),
        makeListRow("admin_sabi_merchant_help", "🔎 Merchant Profile Lookup", "Inspect a merchant by business name or UUID"),
        makeListRow("admin_sabi_status_help", "🛡️ Merchant Status Controls", "Suspend or reactivate with confirmation"),
        makeListRow("admin_sabi_orders_payments", "💳 Orders & Payments Monitor", "Order totals, pending payments and Paystack fee records"),
      ],
    },
  ];

  const pageTwoSections = [
    {
      title: "🛍️ More Sabi by XTOP Tools",
      rows: [
        makeListRow("admin_sabi_payout_reconciliation", "🏦 Payout Verification & Reconciliation", "Merchant Paystack status and recorded settlement fees"),
        makeListRow("admin_sabi_live_payout_help", "🔍 Live Paystack Check", "Check one merchant directly with Paystack"),
        makeListRow("admin_sabi_audit_log", "🧾 Admin Activity Log", "Review merchant and platform-wide changes"),
      ],
    },
    {
      title: "⚙️ System & Learning",
      rows: [
        makeListRow("admin_status", "🟢 DB Connectivity", "Test connection to Supabase database"),
        makeListRow("admin_stats", "📊 Bot Statistics", "View messaging and contacts metrics"),
        makeListRow("admin_learning", "🎓 ENGR ERO Learning Hub", "Courses, lessons, students and publication status"),
        makeListRow("admin_students_pending", "🎓 Student Verification", "Review new student registrations"),
        makeListRow("admin_student_records", "📚 Student Records", "Department • S/N • matric no • results"),
      ],
    },
  ];

  const pageThreeSections = [
    {
      title: "🎓 ELA301 Lecturer Review",
      rows: [
        makeListRow("admin_ela301_questions", "📝 ELA301 Question Review", "Review and approve CBT questions"),
        makeListRow("admin_ela301_lessons", "📖 ELA301 Lesson Review", "Inspect and approve teaching lessons"),
        makeListRow("admin_ela301_controls", "🚦 ELA301 Publish & Pause", "Publish the course or pause course/questions"),
      ],
    },
  ];

  if (safePage === 0) {
    pageOneSections[1].rows.push(
      makeListRow("admin_agent_menu_page_1", "➡️ Next Menu", "Open more Sabi tools and System & Learning")
    );
  } else if (safePage === 1) {
    pageTwoSections[1].rows.push(
      makeListRow("admin_agent_menu_page_0", "⬅️ Previous Menu", "Return to core Sabi tools"),
      makeListRow("admin_agent_menu_page_2", "➡️ Next Menu", "Open ELA301 lecturer review tools")
    );
  } else {
    pageThreeSections[0].rows.push(
      makeListRow("admin_agent_menu_page_1", "⬅️ Previous Menu", "Return to System & Learning")
    );
  }

  const sections = safePage === 0 ? pageOneSections : safePage === 1 ? pageTwoSections : pageThreeSections;
  const totalRows = sections.reduce((total, section) => total + section.rows.length, 0);
  if (totalRows > 10) {
    console.error("[Lizzy] Menu page exceeds WhatsApp's 10-row limit:", safePage, totalRows);
    await sendTextMessage(phone, "⚠️ Lizzy menu configuration needs attention. Please contact the system administrator.");
    return;
  }

  await sendListMessage(
    phone,
    body,
    safePage === 0 ? "Select Action" : safePage === 1 ? "More Admin Tools" : "ELA301 Review",
    sections,
    "Lizzy Operations Suite",
    "Authorized Admin Only",
  );
}

/* =========================================================
   DATABASE DIAGNOSTICS
   ========================================================= */

async function checkBotStatus(): Promise<string> {
  try {
    const { count, error } = await supabase
      .from("contacts")
      .select("id", { count: "exact", head: true });

    if (error) {
      console.error("[AdminAgent] Status check failed:", error.message);

      return [
        "⚠️ *DATABASE CHECK FAILED*",
        "",
        "The contacts query returned an error.",
        `Details: ${error.message.slice(0, 200)}`,
        "",
        "This does not necessarily mean the entire project is down.",
      ].join("\n");
    }

    return [
      "🟢 *DATABASE CONNECTION CHECK PASSED*",
      "",
      "Supabase responded successfully to the contacts query.",
      `Contact records: ${count ?? "Not reported"}`,
      `Checked: ${new Date().toISOString()}`,
    ].join("\n");
  } catch (error) {
    console.error(
      "[AdminAgent] Status exception:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return "🔴 *STATUS CHECK ERROR*\n\nThe diagnostic could not complete. Check the Supabase logs.";
  }
}

async function getBotStats(): Promise<string> {
  const checks = await Promise.all([
    supabase.from("contacts").select("id", { count: "exact", head: true }),
    supabase.from("messages").select("id", { count: "exact", head: true }),
    supabase.from("bot_orders").select("id", { count: "exact", head: true }),
    supabase.from("agent_requests").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
    supabase.from("leads").select("id", { count: "exact", head: true }),
  ]);

  const labels = [
    "Contacts",
    "Messages",
    "Bot orders",
    "Pending agent requests",
    "Total Leads",
  ];

  const lines = checks.map((result, index) => {
    if (result.error) {
      console.error(`[AdminAgent] Stats error (${labels[index]}):`, result.error.message);
      return `${labels[index]}: unavailable — query failed`;
    }
    return `${labels[index]}: ${result.count ?? 0}`;
  });

  return [
    "📊 *XTOP BOT STATISTICS*",
    "",
    ...lines,
    "",
    `Checked: ${new Date().toISOString()}`,
    "",
    "These are database counts, not a financial report.",
  ].join("\n");
}

/* =========================================================
   SABI BY XTOP — SUPER ADMIN READ-ONLY VISIBILITY
   ========================================================= */


async function showSabiAdminActivityLog(phone: string, isSystem: boolean, page = 0): Promise<void> {
  if (!hasSuperAdminAccess(phone, isSystem)) return;

  const pageSize = 8;
  const safePage = Math.max(0, Math.min(24, Math.floor(Number(page) || 0)));
  const from = safePage * pageSize;
  const { data: records, error, count } = await supabase
    .from("audit_logs")
    .select("action,entity,entity_id,metadata,created_at", { count: "exact" })
    .in("action", [
      "SABI_MERCHANT_SUSPENDED",
      "SABI_MERCHANT_REACTIVATED",
      "SABI_GLOBAL_HANDOFF_CHANGED",
      "SABI_CUSTOMER_TAKEOVER_CHANGED",
    ])
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) {
    console.error("[Lizzy][Sabi] Admin activity log query failed:", error.message);
    await sendTextMessage(phone, "⚠️ The Admin Activity Log could not be loaded. No records were changed.");
    return;
  }

  const rows = records || [];
  const tenantIds = [...new Set(rows.map((row: any) => String(row.entity_id || "")).filter((id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ))];
  let tenantNames = new Map<string, string>();
  if (tenantIds.length) {
    const { data: tenants, error: tenantError } = await supabase
      .from("tenants")
      .select("id,name,business_name")
      .in("id", tenantIds);
    if (tenantError) {
      console.error("[Lizzy][Sabi] Activity log merchant names unavailable:", tenantError.message);
    } else {
      tenantNames = new Map((tenants || []).map((tenant: any) => [
        String(tenant.id),
        String(tenant.business_name || tenant.name || "Merchant"),
      ]));
    }
  }

  const lines = rows.map((record: any, index: number) => {
    const metadata = record.metadata && typeof record.metadata === "object" ? record.metadata : {};
    const action = String(record.action || "UNKNOWN").toUpperCase();
    const date = record.created_at
      ? new Date(record.created_at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" })
      : "Date not recorded";

    if (action === "SABI_GLOBAL_HANDOFF_CHANGED") {
      return [
        "*" + (from + index + 1) + ". GLOBAL SABI HANDOFF CHANGED*",
        "New state: " + (metadata.enabled === true ? "ENABLED" : "DISABLED"),
        "Time: " + date,
      ].join("\n");
    }

    if (action === "SABI_CUSTOMER_TAKEOVER_CHANGED") {
      return [
        "*" + (from + index + 1) + ". CUSTOMER CONVERSATION TAKEOVER CHANGED*",
        "New state: " + (metadata.enabled === true ? "ENABLED" : "DISABLED"),
        "Customer details: hidden for privacy",
        "Time: " + date,
      ].join("\n");
    }

    const business = tenantNames.get(String(record.entity_id)) || "Merchant record";
    const previous = typeof metadata.previous_is_active === "boolean"
      ? (metadata.previous_is_active ? "ACTIVE" : "INACTIVE")
      : "Not recorded";
    const next = typeof metadata.new_is_active === "boolean"
      ? (metadata.new_is_active ? "ACTIVE" : "INACTIVE")
      : (action === "SABI_MERCHANT_SUSPENDED" ? "SUSPENDED" : "ACTIVE");
    const title = action === "SABI_MERCHANT_SUSPENDED" ? "MERCHANT SUSPENDED" : "MERCHANT REACTIVATED";
    return [
      "*" + (from + index + 1) + ". " + title + "*",
      "Business: " + business.replace(/[\\r\\n]/g, " ").slice(0, 65),
      "Status: " + previous + " → " + next,
      "Time: " + date,
    ].join("\n");
  });

  const total = count ?? rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const message = [
    "🧾 *SABI ADMIN ACTIVITY LOG*",
    "",
    "Merchant status, global handoff and customer takeover changes recorded by Lizzy.",
    "Total matching records: " + total,
    "Page " + (safePage + 1) + " of " + pageCount,
    "",
    ...(lines.length ? lines : ["No matching Super Admin activity has been recorded yet."]),
    "",
    "Read-only history. No merchant or audit records were changed.",
  ].join("\n");
  await sendTextMessage(phone, message);

  const buttons = [];
  if (safePage > 0) buttons.push(makeButton("admin_sabi_audit_page_" + (safePage - 1), "⬅ Previous"));
  if (from + rows.length < total) buttons.push(makeButton("admin_sabi_audit_page_" + (safePage + 1), "Next ➡"));
  buttons.push(makeButton("admin_agent_menu", "🏠 Lizzy Menu"));
  await sendButtonMessage(phone, "Admin Activity Log navigation:", buttons.slice(0, 3));
}

async function getSabiPlatformOverview(phone: string, isSystem: boolean): Promise<string> {
  if (!hasSuperAdminAccess(phone, isSystem)) return "";
  // Exclude the internal XTOP system tenant from merchant counts.
  const merchantBase = () => supabase.from("tenants").select("id", { count: "exact", head: true }).eq("is_system", false);
  const checks = await Promise.all([
    merchantBase().eq("is_active", true),
    merchantBase().eq("is_active", false),
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("tenant_orders").select("id", { count: "exact", head: true }),
    supabase.from("tenant_orders").select("id", { count: "exact", head: true }).eq("payment_status", "PAID"),
    supabase.from("tenant_whatsapp_accounts").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("tenant_order_payment_intents").select("id", { count: "exact", head: true }),
    merchantBase().in("paystack_subaccount_status", ["PENDING", "PENDING_VERIFICATION"]),
    merchantBase().eq("paystack_subaccount_status", "VERIFIED"),
  ]);

  const labels = [
    "Active merchant businesses",
    "Inactive merchant businesses",
    "Products across Sabi",
    "Orders recorded",
    "Orders marked paid",
    "Active merchant WhatsApp connections",
    "Payment intents recorded",
    "Merchants awaiting Paystack verification",
    "Merchants with verified Paystack payouts",
  ];
  const lines = checks.map((result, index) => {
    if (result.error) {
      console.error("[Lizzy][Sabi] Overview query failed:", labels[index], result.error.message);
      return labels[index] + ": unavailable (query failed)";
    }
    return labels[index] + ": " + (result.count ?? 0);
  });

  return [
    "🛍️ *SABI BY XTOP — PLATFORM OVERVIEW*",
    "",
    ...lines,
    "",
    "🔐 Read-only platform report. No merchant or customer records were changed.",
    "Checked: " + new Date().toISOString(),
  ].join("\n");
}



async function checkLivePaystackSubaccount(phone: string, isSystem: boolean, merchantId: string): Promise<void> {
  if (!hasSuperAdminAccess(phone, isSystem)) {
    console.warn("[Lizzy][Sabi] Unauthorized live Paystack check blocked.");
    return;
  }
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(merchantId)) {
    await sendTextMessage(phone, "Use the exact merchant UUID.\nExample: verify payout <merchant UUID>");
    return;
  }

  const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!secret) {
    await sendTextMessage(phone, "⚠️ Live Paystack verification is unavailable because the server-side Paystack key is not configured for this function. No changes were made.");
    return;
  }

  const { data: merchant, error } = await supabase.from("tenants")
    .select("id,business_name,name,paystack_subaccount_code")
    .eq("id", merchantId)
    .eq("is_system", false)
    .maybeSingle();

  if (error || !merchant) {
    await sendTextMessage(phone, "⚠️ Merchant not found. No changes were made.");
    return;
  }
  if (!merchant.paystack_subaccount_code) {
    await sendTextMessage(phone, "This merchant has no registered Paystack subaccount. No live check was possible.");
    return;
  }

  try {
    const response = await fetch(
      "https://api.paystack.co/subaccount/" + encodeURIComponent(merchant.paystack_subaccount_code),
      { method: "GET", headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" } },
    );
    const payload = await response.json();
    if (!response.ok || payload?.status !== true || !payload?.data) {
      console.error("[Lizzy][Paystack] Live subaccount lookup failed:", response.status);
      await sendTextMessage(phone, "⚠️ Paystack could not confirm this subaccount right now. Try again later. No database changes were made.");
      return;
    }

    const account = payload.data;
    if (String(account.subaccount_code || "") !== String(merchant.paystack_subaccount_code)) {
      console.error("[Lizzy][Paystack] Returned subaccount code did not match stored merchant code.");
      await sendTextMessage(phone, "⚠️ Paystack returned a subaccount record that did not match this merchant. Verification was stopped.");
      return;
    }

    const verified = account.is_verified === true;
    const active = account.active === true;
    const status = verified ? "VERIFIED" : account.active === false ? "INACTIVE" : "PENDING VERIFICATION";
    await sendTextMessage(phone, [
      "🔎 *LIVE PAYSTACK SUBACCOUNT CHECK*",
      "",
      "*Business:* " + String(merchant.business_name || merchant.name || "Merchant").replace(/[\r\n]/g, " ").slice(0, 70),
      "*Paystack status:* " + status,
      "*Verified by Paystack:* " + (verified ? "YES" : "NO"),
      "*Subaccount active:* " + (active ? "YES" : account.active === false ? "NO" : "Not reported"),
      "",
      "Source: Paystack live subaccount API.",
      "This was a read-only check. No payout, transfer, bank-detail change or database update was performed.",
      "Checked: " + new Date().toISOString(),
    ].join("\n"));
  } catch (error) {
    console.error("[Lizzy][Paystack] Live verification request failed:", error instanceof Error ? error.message : "Unknown error");
    await sendTextMessage(phone, "⚠️ The live Paystack check failed due to a network or service error. No changes were made.");
  }
}

async function showSabiPayoutReconciliation(phone: string, isSystem: boolean): Promise<void> {
  if (!hasSuperAdminAccess(phone, isSystem)) return;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [merchants, charges] = await Promise.all([
    supabase.from("tenants")
      .select("id,business_name,name,is_active,paystack_subaccount_code,paystack_subaccount_status,paystack_subaccount_verified_at")
      .eq("is_system", false)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("sabi_order_paystack_charges")
      .select("payment_type,merchant_commission_amount,customer_service_fee,xtop_transaction_charge,settlement_status,currency,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  if (merchants.error) {
    console.error("[Lizzy][Sabi] Payout directory failed:", merchants.error.message);
    await sendTextMessage(phone, "⚠️ I could not read merchant payout verification records. No data was changed.");
    return;
  }

  const naira = (value: unknown, currency = "NGN") => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "Not recorded";
    return currency + " " + amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const rows = (merchants.data || []).map((merchant: any, index: number) => {
    const status = String(merchant.paystack_subaccount_status || "NOT_CONFIGURED").replace(/_/g, " ");
    const configured = !!merchant.paystack_subaccount_code;
    const verifiedAt = merchant.paystack_subaccount_verified_at
      ? new Date(merchant.paystack_subaccount_verified_at).toLocaleDateString("en-NG")
      : "Not verified";
    return [
      (index + 1) + ". *" + String(merchant.business_name || merchant.name || "Unnamed business").replace(/[\r\n]/g, " ").slice(0, 55) + "*",
      "Business: " + (merchant.is_active ? "ACTIVE" : "INACTIVE"),
      "Paystack: " + status,
      "Subaccount code: " + (configured ? "Registered" : "Not registered"),
      "Verified date: " + verifiedAt,
    ].join("\n");
  });

  const chargeRows = charges.error
    ? ["Settlement records: unavailable"]
    : (charges.data || []).map((charge: any, index: number) =>
        (index + 1) + ". " + String(charge.payment_type || "PAYMENT") +
        " • " + String(charge.settlement_status || "STATUS NOT RECORDED") +
        " • Sabi commission: " + naira(charge.merchant_commission_amount, charge.currency || "NGN") +
        " • XTOP charge: " + naira(charge.xtop_transaction_charge, charge.currency || "NGN")
      );

  const statuses = (merchants.data || []).reduce((acc: Record<string, number>, merchant: any) => {
    const key = String(merchant.paystack_subaccount_status || "NOT_CONFIGURED");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const statusSummary = Object.entries(statuses).map(([key, value]) =>
    key.replace(/_/g, " ") + ": " + value
  );

  await sendTextMessage(phone, [
    "🏦 *SABI PAYOUT VERIFICATION & RECONCILIATION*",
    "",
    "*Merchant payout status counts*",
    ...(statusSummary.length ? statusSummary : ["No merchant records found."]),
    "",
    "*Merchant payout verification*",
    ...(rows.length ? rows : ["No merchants found."]),
    "",
    "*Paystack commission / settlement records — last 30 days*",
    ...(chargeRows.length ? chargeRows : ["No charge records found."]),
    "",
    "Important: a registered subaccount is not proof of a successful bank settlement.",
    "This report reads stored verification and settlement records only; it does not contact Paystack or trigger a transfer.",
    "Bank account numbers, customer details and payment references are not displayed.",
    "Checked: " + new Date().toISOString(),
  ].join("\n"));
}

async function showSabiOrdersAndPayments(phone: string, isSystem: boolean): Promise<void> {
  if (!hasSuperAdminAccess(phone, isSystem)) return;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    totalOrders,
    paidOrders,
    unpaidOrders,
    pendingIntents,
    failedIntents,
    recentOrders,
    recentIntents,
    recentCharges,
  ] = await Promise.all([
    supabase.from("tenant_orders").select("id", { count: "exact", head: true }),
    supabase.from("tenant_orders").select("id", { count: "exact", head: true }).eq("payment_status", "PAID"),
    supabase.from("tenant_orders").select("id", { count: "exact", head: true }).neq("payment_status", "PAID"),
    supabase.from("tenant_order_payment_intents").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
    supabase.from("tenant_order_payment_intents").select("id", { count: "exact", head: true }).in("status", ["FAILED", "ABANDONED"]),
    supabase.from("tenant_orders")
      .select("order_number,payment_status,status,subtotal,delivery_fee,total,created_at,sales_fee_amount,sales_fee_status,payment_method")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("tenant_order_payment_intents")
      .select("payment_type,expected_amount,status,paystack_status,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("sabi_order_paystack_charges")
      .select("payment_type,merchant_commission_amount,customer_service_fee,xtop_transaction_charge,settlement_status,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const checks = [
    ["Orders recorded", totalOrders],
    ["Paid orders", paidOrders],
    ["Unpaid / other payment status", unpaidOrders],
    ["Pending payment intents", pendingIntents],
    ["Failed / abandoned payment intents", failedIntents],
  ];
  const lines = checks.map(([label, result]: any) => {
    if (result.error) {
      console.error("[Lizzy][Sabi] Order/payment count failed:", label, result.error.message);
      return label + ": unavailable";
    }
    return label + ": " + (result.count ?? 0);
  });

  const naira = (value: unknown) => {
    const amount = Number(value);
    return Number.isFinite(amount)
      ? "₦" + amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "Not recorded";
  };

  const orderLines = recentOrders.error
    ? ["Recent orders: unavailable"]
    : (recentOrders.data || []).map((order: any, i: number) =>
        (i + 1) + ". " + String(order.order_number || "Order").slice(0, 35) +
        " • " + String(order.payment_status || "UNKNOWN") +
        " • " + naira(order.total) +
        " • " + (order.created_at ? new Date(order.created_at).toLocaleDateString("en-NG") : "Date unknown")
      );

  const intentLines = recentIntents.error
    ? ["Payment intents: unavailable"]
    : (recentIntents.data || []).map((intent: any, i: number) =>
        (i + 1) + ". " + String(intent.payment_type || "PAYMENT") +
        " • " + String(intent.status || "UNKNOWN") +
        " • Paystack: " + String(intent.paystack_status || "Not reported") +
        " • " + naira(intent.expected_amount)
      );

  const chargeLines = recentCharges.error
    ? ["Paystack fee records: unavailable"]
    : (recentCharges.data || []).map((charge: any, i: number) =>
        (i + 1) + ". " + String(charge.payment_type || "PAYMENT") +
        " • Settlement: " + String(charge.settlement_status || "Not recorded") +
        " • Sabi commission: " + naira(charge.merchant_commission_amount) +
        " • XTOP charge: " + naira(charge.xtop_transaction_charge)
      );

  await sendTextMessage(phone, [
    "💳 *SABI ORDERS & PAYMENT MONITOR*",
    "",
    "*Platform totals*",
    ...lines,
    "",
    "*Recent orders — last 30 days*",
    ...(orderLines.length ? orderLines : ["No recent orders."]),
    "",
    "*Recent payment intents — last 30 days*",
    ...(intentLines.length ? intentLines : ["No recent payment intents."]),
    "",
    "*Paystack commission / settlement records — last 30 days*",
    ...(chargeLines.length ? chargeLines : ["No Paystack charge records found."]),
    "",
    "Report window: last 30 days for recent activity; counts cover all recorded history.",
    "Amounts shown are recorded order / fee values, not bank settlement confirmation.",
    "🔐 Read-only report. Customer names, phone numbers, email addresses and payment references are hidden.",
    "Checked: " + new Date().toISOString(),
  ].join("\n"));
}

async function listSabiMerchants(phone: string, isSystem: boolean, page = 0): Promise<void> {
  if (!hasSuperAdminAccess(phone, isSystem)) return;

  const pageSize = 8;
  const safePage = Math.max(0, Math.min(124, Math.floor(Number(page) || 0)));
  const from = safePage * pageSize;
  const { data, error, count } = await supabase
    .from("tenants")
    .select("id,name,business_name,is_active,paystack_subaccount_status,created_at", { count: "exact" })
    .eq("is_system", false)
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) {
    console.error("[Lizzy][Sabi] Merchant directory query failed:", error.message);
    await sendTextMessage(phone, "⚠️ I could not read the Sabi merchant directory. No data was changed.");
    return;
  }

  const merchants = data || [];
  const total = count ?? merchants.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (!merchants.length && safePage > 0) {
    await sendTextMessage(phone, "There are no more merchants on that page.");
    await sendButtonMessage(phone, "Merchant Directory:", [
      makeButton("admin_sabi_merchants_page_" + Math.max(0, safePage - 1), "⬅ Previous"),
      makeButton("admin_agent_menu", "🏠 Lizzy Menu"),
    ]);
    return;
  }

  const lines = merchants.map((tenant: any, index: number) => {
    const business = String(tenant.business_name || tenant.name || "Unnamed business").replace(/[\r\n]/g, " ").slice(0, 70);
    const active = tenant.is_active === true ? "ACTIVE" : "INACTIVE";
    const payout = String(tenant.paystack_subaccount_status || "NOT CONFIGURED").replace(/_/g, " ");
    return (from + index + 1) + ". *" + business + "*\n   Business: " + active + " • Paystack: " + payout;
  });

  await sendTextMessage(phone, [
    "🏪 *SABI MERCHANT DIRECTORY*",
    "",
    ...lines,
    "",
    "Total merchant businesses: " + total,
    "Page " + (safePage + 1) + " of " + pageCount + ". Showing " + merchants.length + " per page.",
    "Internal XTOP system tenant is excluded.",
    "Sensitive owner, customer, bank-account and access-token details are not displayed.",
  ].join("\n"));

  const buttons = [];
  if (safePage > 0) buttons.push(makeButton("admin_sabi_merchants_page_" + (safePage - 1), "⬅ Previous"));
  if (from + merchants.length < total) buttons.push(makeButton("admin_sabi_merchants_page_" + (safePage + 1), "Next ➡"));
  buttons.push(makeButton("admin_agent_menu", "🏠 Lizzy Menu"));
  await sendButtonMessage(phone, "Merchant Directory navigation:", buttons.slice(0, 3));
}

async function showSabiMerchantDetails(phone: string, isSystem: boolean, search: string): Promise<void> {
  if (!hasSuperAdminAccess(phone, isSystem)) return;
  const term = search.trim().slice(0, 100);
  if (!term) {
    await sendTextMessage(phone, "Type a merchant name or UUID. Example: merchant XTOP Retail");
    return;
  }

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const safeTerm = term.replace(/[%_,]/g, " ");
  let query = supabase
    .from("tenants")
    .select("id,name,business_name,industry,is_active,created_at,shipping_enabled,pod_enabled,paystack_subaccount_status,paystack_subaccount_verified_at")
    .eq("is_system", false);
  query = uuidPattern.test(term)
    ? query.eq("id", term)
    : query.or("business_name.ilike.%" + safeTerm + "%,name.ilike.%" + safeTerm + "%");

  const { data, error } = await query.limit(6);
  if (error) {
    console.error("[Lizzy][Sabi] Merchant lookup failed:", error.message);
    await sendTextMessage(phone, "⚠️ Merchant lookup failed. No records were changed.");
    return;
  }
  if (!data?.length) {
    await sendTextMessage(phone, "No Sabi merchant matched: " + term + "\n\nTry another business name or merchant UUID.");
    return;
  }
  if (data.length > 1) {
    const matches = data.map((t: any, i: number) =>
      (i + 1) + ". " + String(t.business_name || t.name || "Unnamed business").replace(/[\r\n]/g, " ").slice(0, 65) + "\n   ID: " + t.id
    );
    await sendTextMessage(phone, "🔎 *MORE THAN ONE MERCHANT MATCHED*\n\n" + matches.join("\n\n") + "\n\nUse: merchant <exact UUID>");
    return;
  }

  const tenant: any = data[0];
  const [products, orders, paidOrders, whatsapp] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
    supabase.from("tenant_orders").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
    supabase.from("tenant_orders").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id).eq("payment_status", "PAID"),
    supabase.from("tenant_whatsapp_accounts").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id).eq("is_active", true),
  ]);
  const countLine = (label: string, result: any) =>
    label + ": " + (result.error ? "unavailable" : (result.count ?? 0));
  const payout = String(tenant.paystack_subaccount_status || "NOT CONFIGURED").replace(/_/g, " ");

  await sendTextMessage(phone, [
    "🏪 *SABI MERCHANT PROFILE*",
    "",
    "*Business:* " + String(tenant.business_name || tenant.name || "Unnamed business").slice(0, 100),
    "*Industry:* " + String(tenant.industry || "Not specified").slice(0, 70),
    "*Business status:* " + (tenant.is_active ? "ACTIVE" : "INACTIVE"),
    "*Joined:* " + (tenant.created_at ? new Date(tenant.created_at).toLocaleDateString("en-NG") : "Unknown"),
    "",
    "*Platform activity*",
    countLine("Products", products),
    countLine("Orders", orders),
    countLine("Paid orders", paidOrders),
    countLine("Active WhatsApp connections", whatsapp),
    "",
    "*Merchant settings*",
    "Shipping: " + (tenant.shipping_enabled ? "Enabled" : "Disabled"),
    "Pay on delivery: " + (tenant.pod_enabled ? "Enabled" : "Disabled"),
    "Paystack payout: " + payout,
    "Payout verified: " + (tenant.paystack_subaccount_verified_at ? new Date(tenant.paystack_subaccount_verified_at).toLocaleDateString("en-NG") : "Not verified"),
    "",
    "Merchant ID: " + tenant.id,
    "",
    "🔐 Read-only profile. No owner contact, bank details, customer details or access tokens are exposed."
  ].join("\n"));
}


/* =========================================================
   SABI MERCHANT STATUS CONTROLS — CONFIRMED + AUDITED
   ========================================================= */

function hasSuperAdminAccess(phone: string, isSystem: boolean): boolean {
  return isSystem === true && isAdminPhone(phone);
}

async function readAdminConversationContext(conversationId: string): Promise<Record<string, any> | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("context_json")
    .eq("id", conversationId)
    .eq("tenant_id", SYSTEM_TENANT_ID)
    .maybeSingle();

  if (error || !data) {
    console.error("[Lizzy][Sabi] Could not read admin confirmation state:", error?.message);
    return null;
  }
  return (data.context_json || {}) as Record<string, any>;
}

async function saveAdminConversationContext(
  conversationId: string,
  context: Record<string, any>,
): Promise<boolean> {
  const updated = await updateConversation(
    conversationId,
    { context_json: context },
    SYSTEM_TENANT_ID,
  );
  return !!updated;
}

async function requestMerchantStatusChange(
  phone: string,
  isSystem: boolean,
  conversationId: string,
  merchantId: string,
  targetActive: boolean,
): Promise<void> {
  if (!hasSuperAdminAccess(phone, isSystem)) {
    console.warn("[Lizzy][Sabi] Unauthorized merchant status request blocked.");
    return;
  }

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(merchantId)) {
    await sendTextMessage(phone, "Use the exact merchant UUID. Example:\nsuspend merchant <UUID>");
    return;
  }

  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("id,name,business_name,is_active,is_system,metadata")
    .eq("id", merchantId)
    .eq("is_system", false)
    .maybeSingle();

  if (error || !tenant) {
    await sendTextMessage(phone, "I couldn't find that merchant. The system tenant is protected and cannot be changed.");
    return;
  }

  if (targetActive && tenant.metadata?.sabi_admin_suspended !== true) {
    await sendTextMessage(phone, "This merchant is not marked as Super Admin-suspended. Reactivation is only available for merchants previously suspended through Lizzy.");
    return;
  }

  if (tenant.is_active === targetActive) {
    await sendTextMessage(
      phone,
      String(tenant.business_name || tenant.name || "Merchant") +
        (targetActive ? " is already ACTIVE." : " is already SUSPENDED.") +
        "\nNo change was made.",
    );
    return;
  }

  const context = await readAdminConversationContext(conversationId);
  if (!context) {
    await sendTextMessage(phone, "⚠️ I couldn't save the confirmation securely. No change was made.");
    return;
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const pending = {
    token,
    tenant_id: tenant.id,
    target_active: targetActive,
    expected_active: tenant.is_active === true,
    expires_at: expiresAt,
  };

  if (!await saveAdminConversationContext(conversationId, {
    ...context,
    admin_agent_active: true,
    sabi_pending_status_change: pending,
  })) {
    await sendTextMessage(phone, "⚠️ I couldn't save the confirmation. No change was made.");
    return;
  }

  const business = String(tenant.business_name || tenant.name || "Unnamed business")
    .replace(/[\r\n]/g, " ")
    .slice(0, 80);
  const action = targetActive ? "REACTIVATE" : "SUSPEND";
  const consequence = targetActive
    ? "restore merchant dashboard, WhatsApp storefront and merchant operations"
    : "block merchant dashboard, WhatsApp storefront, wallet and Paystack merchant operations";

  await sendTextMessage(phone, [
    "⚠️ *CONFIRM MERCHANT " + action + "*",
    "",
    "Business: *" + business + "*",
    "Merchant ID: " + tenant.id,
    "Current status: " + (tenant.is_active ? "ACTIVE" : "INACTIVE"),
    "New status: *" + (targetActive ? "ACTIVE" : "SUSPENDED") + "*",
    "",
    "This will " + consequence + ".",
    "Merchant records and financial history will be preserved.",
    "",
    "This confirmation expires in 5 minutes.",
    "Only confirm if this is the intended merchant.",
  ].join("\n"));

  await sendButtonMessage(phone, "Do you want to continue?", [
    makeButton("admin_sabi_status_confirm_" + token, targetActive ? "Confirm Reactivate" : "Confirm Suspend"),
    makeButton("admin_sabi_status_cancel", "Cancel"),
  ]);
}

async function confirmMerchantStatusChange(
  phone: string,
  isSystem: boolean,
  conversationId: string,
  token: string,
): Promise<void> {
  if (!hasSuperAdminAccess(phone, isSystem)) {
    console.warn("[Lizzy][Sabi] Unauthorized merchant status confirmation blocked.");
    return;
  }

  const context = await readAdminConversationContext(conversationId);
  const pending = context?.sabi_pending_status_change;

  if (!context || !pending || pending.token !== token) {
    await sendTextMessage(phone, "⚠️ This confirmation is invalid or has already been used. Start the request again.");
    return;
  }

  if (!pending.expires_at || new Date(pending.expires_at).getTime() <= Date.now()) {
    const { sabi_pending_status_change, ...rest } = context;
    await saveAdminConversationContext(conversationId, rest);
    await sendTextMessage(phone, "⌛ This confirmation has expired. Start the merchant status request again.");
    return;
  }

  const tenantId = String(pending.tenant_id || "");
  const targetActive = pending.target_active === true;
  const expectedActive = pending.expected_active === true;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(tenantId)) {
    await sendTextMessage(phone, "⚠️ The saved merchant reference is invalid. No change was made.");
    return;
  }

  const { data: tenant, error: readError } = await supabase
    .from("tenants")
    .select("id,name,business_name,is_active,is_system")
    .eq("id", tenantId)
    .eq("is_system", false)
    .maybeSingle();

  if (readError || !tenant || tenant.is_active !== expectedActive) {
    await sendTextMessage(phone, "⚠️ Merchant status changed since the request was prepared, or the merchant no longer exists. No change was made. Start again.");
    return;
  }

  const nextMetadata = { ...((tenant.metadata || {}) as Record<string, unknown>) };
  if (targetActive) {
    delete nextMetadata.sabi_admin_suspended;
  } else {
    nextMetadata.sabi_admin_suspended = true;
  }

  const { data: changed, error: updateError } = await supabase
    .from("tenants")
    .update({
      is_active: targetActive,
      metadata: nextMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tenantId)
    .eq("is_system", false)
    .eq("is_active", expectedActive)
    .select("id,is_active")
    .maybeSingle();

  if (updateError || !changed) {
    console.error("[Lizzy][Sabi] Merchant status update failed:", updateError?.message);
    await sendTextMessage(phone, "⚠️ The merchant status could not be changed. No update was confirmed.");
    return;
  }

  const action = targetActive ? "SABI_MERCHANT_REACTIVATED" : "SABI_MERCHANT_SUSPENDED";
  const { error: auditError } = await supabase.from("audit_logs").insert({
    admin_user: normalizePhone(phone),
    action,
    entity: "tenants",
    entity_id: tenantId,
    metadata: {
      source: "LIZZY_WHATSAPP_SUPER_ADMIN",
      previous_is_active: expectedActive,
      new_is_active: targetActive,
      confirmed_at: new Date().toISOString(),
    },
  });

  if (auditError) {
    console.error("[Lizzy][Sabi] Audit insert failed; attempting rollback:", auditError.message);
    const { error: rollbackError } = await supabase
      .from("tenants")
      .update({
        is_active: expectedActive,
        metadata: (tenant.metadata || {}) as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId)
      .eq("is_system", false)
      .eq("is_active", targetActive);
    if (rollbackError) {
      console.error("[Lizzy][Sabi] CRITICAL: status rollback failed:", rollbackError.message);
      await sendTextMessage(phone, "🚨 The status changed but audit logging failed, and automatic rollback also failed. Please inspect this merchant immediately.");
    } else {
      await sendTextMessage(phone, "⚠️ Audit logging failed. The status change was rolled back; the merchant's previous status has been restored.");
    }
    return;
  }

  const { sabi_pending_status_change, ...rest } = context;
  await saveAdminConversationContext(conversationId, rest);

  await sendTextMessage(phone, [
    "✅ *MERCHANT STATUS UPDATED*",
    "",
    "Business: " + String(tenant.business_name || tenant.name || "Merchant").slice(0, 80),
    "New status: *" + (targetActive ? "ACTIVE" : "SUSPENDED") + "*",
    "Audit record: saved",
    "",
    "Merchant products, orders, wallet and financial history were not deleted or modified.",
  ].join("\n"));
}

async function cancelMerchantStatusChange(
  phone: string,
  isSystem: boolean,
  conversationId: string,
): Promise<void> {
  if (!hasSuperAdminAccess(phone, isSystem)) return;
  const context = await readAdminConversationContext(conversationId);
  if (context) {
    const { sabi_pending_status_change, ...rest } = context;
    await saveAdminConversationContext(conversationId, rest);
  }
  await sendTextMessage(phone, "Merchant status request cancelled. No merchant data was changed.");
}


/* =========================================================
   LEARNING CENTRE PROGRESS
   ========================================================= */

async function getLearningCentreProgress(): Promise<string> {
  const courseId = "37dee46f-f551-45d5-9ada-ed65946fe148";
  const [courseResult, moduleResult, studentResult, enrollmentResult] = await Promise.all([
    supabase.from("courses").select("id, course_code, course_name, status").eq("id", courseId).maybeSingle(),
    supabase.from("course_modules").select("id, title, module_order").eq("course_id", courseId).order("module_order", { ascending: true }),
    supabase.from("students").select("id", { count: "exact", head: true }),
    supabase.from("student_courses").select("id", { count: "exact", head: true }).eq("course_id", courseId),
  ]);

  const course = courseResult.data;
  if (courseResult.error || !course) {
    safeErrorLog("getLearningCentreProgress.course", courseResult.error);
    return "⚠️ *LEARNING CENTRE STATUS UNAVAILABLE*\n\nCould not retrieve ELA401 course information. Check the course database query.";
  }

  const modules = moduleResult.data || [];
  const moduleIds = modules.map((module: any) => module.id);
  const lessonResult = moduleIds.length
    ? await supabase.from("module_slides")
        .select("id, is_draft, status", { count: "exact" })
        .in("module_id", moduleIds)
    : { data: [], count: 0, error: null };

  const lessons = lessonResult.data || [];
  const published = lessons.filter((lesson: any) =>
    lesson.is_draft === false &&
    ["ACTIVE", "PUBLISHED", "OPEN"].includes(String(lesson.status || "").toUpperCase())
  ).length;
  const drafts = (lessonResult.count ?? lessons.length) - published;
  const failures = [
    moduleResult.error ? "Modules" : "",
    lessonResult.error ? "Lessons" : "",
    studentResult.error ? "Students" : "",
    enrollmentResult.error ? "Enrollments" : "",
  ].filter(Boolean);

  return [
    "🎓 *ENGR. ERO LEARNING CENTRE*",
    "",
    `Course: *${course.course_code} — ${course.course_name}*`,
    `Course status: ${course.status || "Not reported"}`,
    `Modules: ${moduleResult.error ? "Unavailable" : modules.length}`,
    `Lessons total: ${lessonResult.count ?? lessons.length}`,
    `Published lessons: ${published}`,
    `Draft / not published: ${drafts}`,
    `Registered students (all courses): ${studentResult.count ?? "Unavailable"}`,
    `ELA401 enrolments: ${enrollmentResult.count ?? "Unavailable"}`,
    "",
    failures.length ? `Some figures unavailable: ${failures.join(", ")}` : "Database checks completed successfully.",
    "",
    "All lessons remain drafts until lecturer approval.",
  ].join("\n");
}

async function listLearningModules(phone: string, page = 0): Promise<void> {
  const courseId = "37dee46f-f551-45d5-9ada-ed65946fe148";
  const { data, error } = await supabase.from("course_modules")
    .select("id, title, module_order")
    .eq("course_id", courseId)
    .order("module_order", { ascending: true });

  if (error || !data) {
    safeErrorLog("listLearningModules", error);
    await sendTextMessage(phone, "⚠️ I could not load the ELA401 module list. Please try again.");
    return;
  }

  if (!data.length) {
    await sendTextMessage(phone, "No ELA401 modules were found.");
    return;
  }

  const pageSize = 6;
  const pageCount = Math.ceil(data.length / pageSize);
  const safePage = Math.max(0, Math.min(page, pageCount - 1));
  const visible = data.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const rows = visible.map((module: any) =>
    makeListRow(
      `admin_learning_module_${module.id}`,
      `Module ${module.module_order}: ${String(module.title || "Untitled").slice(0, 22)}`,
      "Open lessons • Draft review"
    )
  );

  if (safePage > 0) {
    rows.push(makeListRow(`admin_learning_page_${safePage - 1}`, "⬅ Previous modules", "Go to previous page"));
  }
  if (safePage < pageCount - 1) {
    rows.push(makeListRow(`admin_learning_page_${safePage + 1}`, "Next modules ➡", "View remaining modules"));
  }

  await sendListMessage(
    phone,
    `ELA401 — Time Measurement\n12-module course outline\nPage ${safePage + 1} of ${pageCount}\n\nChoose a module to inspect its lessons. Draft status is preserved.`,
    "Choose Module",
    [{ title: "ELA401 Modules", rows }],
    "Learning Centre",
    "Lecturer review required"
  );
}

async function showLearningModule(phone: string, moduleId: string): Promise<void> {
  const { data: module, error } = await supabase.from("course_modules")
    .select("id, title, description, objectives, module_order")
    .eq("id", moduleId)
    .maybeSingle();

  if (error || !module) {
    safeErrorLog("showLearningModule.module", error);
    await sendTextMessage(phone, "⚠️ Module not found. Return to the module list and try again.");
    return;
  }

  const { data: lessons, error: lessonError } = await supabase.from("module_slides")
    .select("id, title, lesson_number, status, is_draft, estimated_minutes, slide_order, order_index")
    .eq("module_id", moduleId)
    .order("order_index", { ascending: true })
    .order("slide_order", { ascending: true });

  if (lessonError) {
    safeErrorLog("showLearningModule.lessons", lessonError);
    await sendTextMessage(phone, "⚠️ I could not load this module's lessons.");
    return;
  }

  const rows = (lessons || []).slice(0, 8).map((lesson: any, index: number) =>
    makeListRow(
      `admin_learning_lesson_${lesson.id}`,
      String(lesson.title || `Lesson ${index + 1}`).slice(0, 24),
      `${lesson.is_draft ? "DRAFT" : lesson.status || "REVIEW"} • ${lesson.estimated_minutes || "—"} min`
    )
  );

  const body = [
    `🎓 *MODULE ${module.module_order}: ${module.title}*`,
    "",
    module.description || "",
    module.objectives ? `Objectives: ${module.objectives}` : "",
    "",
    `Lessons in module: ${(lessons || []).length}`,
    "Select a lesson to read the teaching material and practical instructions.",
    "",
    "🔒 Draft material — not visible to students yet.",
  ].filter(Boolean).join("\n");

  if (!rows.length) {
    await sendTextMessage(phone, body + "\n\nNo lessons are attached to this module yet.");
  } else {
    await sendListMessage(
      phone,
      body,
      "Open Lesson",
      [{ title: "Module Lessons", rows }],
      "ELA401 Lesson Browser",
      "Draft • Lecturer review"
    );
  }
  await sendButtonMessage(phone, "Module navigation:", [
    makeButton("admin_learning", "📚 All Modules"),
    makeButton("admin_agent_menu", "🏠 Lizzy Menu"),
  ]);
}

async function handleLearningDecision(
  phone: string,
  lessonIdInput: string,
  decision: "APPROVE" | "REJECT",
  confirm: boolean,
): Promise<void> {
  const lessonId = sanitizeId(lessonIdInput);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lessonId)) {
    await sendTextMessage(phone, "⚠️ Invalid lesson reference. Reopen the lesson from the ELA401 module list.");
    return;
  }

  const { data: lesson, error } = await supabase
    .from("module_slides")
    .select("id, module_id, title, status, is_draft")
    .eq("id", lessonId)
    .maybeSingle();

  if (error || !lesson) {
    safeErrorLog("handleLearningDecision.lesson", error);
    await sendTextMessage(phone, "⚠️ Lesson not found. Nothing was changed.");
    return;
  }

  const courseId = "37dee46f-f551-45d5-9ada-ed65946fe148";
  const { data: module, error: moduleError } = await supabase
    .from("course_modules")
    .select("id, course_id")
    .eq("id", lesson.module_id)
    .maybeSingle();

  if (moduleError || !module || module.course_id !== courseId) {
    safeErrorLog("handleLearningDecision.course", moduleError);
    await sendTextMessage(phone, "⛔ This action is restricted to ELA401 lessons. Nothing was changed.");
    return;
  }

  if (!confirm) {
    const isApprove = decision === "APPROVE";
    await sendTextMessage(
      phone,
      (isApprove ? "⚠️ *CONFIRM LESSON APPROVAL*" : "⚠️ *CONFIRM LESSON REJECTION*") +
      "\n\n" + `Lesson: *${lesson.title}*` +
      (isApprove
        ? "\n\nApproving will publish this individual lesson for enrolled students."
        : "\n\nRejecting keeps this lesson hidden from students and marks it REJECTED.") +
      "\n\nNo other lesson will be changed."
    );
    await sendButtonMessage(phone, "Please confirm this decision:", [
      makeButton(`admin_learning_${decision.toLowerCase()}_confirm_${lessonId}`, isApprove ? "✅ Confirm Publish" : "⛔ Confirm Reject"),
      makeButton(`admin_learning_lesson_${lessonId}`, "↩ Back to Lesson"),
      makeButton("admin_learning", "📚 All Modules"),
    ]);
    return;
  }

  if (decision === "APPROVE") {
    const { error: updateError } = await supabase.from("module_slides").update({
      status: "ACTIVE",
      is_draft: false,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", lessonId).eq("module_id", lesson.module_id);

    if (updateError) {
      safeErrorLog("handleLearningDecision.approve", updateError);
      await sendTextMessage(phone, "❌ Approval failed. The lesson remains unpublished. Please check Supabase logs.");
      return;
    }

    await sendTextMessage(
      phone,
      `✅ *LESSON APPROVED AND PUBLISHED*\n\n${lesson.title}\n\nThis lesson is now marked ACTIVE and available to enrolled ELA401 students.`
    );
  } else {
    const { error: updateError } = await supabase.from("module_slides").update({
      status: "REJECTED",
      is_draft: true,
      published_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", lessonId).eq("module_id", lesson.module_id);

    if (updateError) {
      safeErrorLog("handleLearningDecision.reject", updateError);
      await sendTextMessage(phone, "❌ Rejection update failed. No lesson status was changed.");
      return;
    }

    await sendTextMessage(
      phone,
      `⛔ *LESSON REJECTED*\n\n${lesson.title}\n\nIt remains hidden from students. Revise the lesson before submitting it for approval again.`
    );
  }

  await sendButtonMessage(phone, "Learning Centre:", [
    makeButton(`admin_learning_module_${lesson.module_id}`, "↩ Module Lessons"),
    makeButton("admin_learning", "📚 All Modules"),
    makeButton("admin_agent_menu", "🏠 Lizzy Menu"),
  ]);
}

async function showLearningLesson(phone: string, lessonId: string): Promise<void> {
  const { data: lesson, error } = await supabase.from("module_slides")
    .select("id, module_id, title, content, content_sections, objectives, estimated_minutes, status, is_draft")
    .eq("id", lessonId)
    .maybeSingle();

  if (error || !lesson) {
    safeErrorLog("showLearningLesson", error);
    await sendTextMessage(phone, "⚠️ Lesson not found. Please reopen it from its module.");
    return;
  }

  const sectionLines: string[] = [];
  if (Array.isArray(lesson.content_sections)) {
    for (const section of lesson.content_sections) {
      if (Array.isArray(section)) {
        const heading = String(section[0] || "").trim();
        const body = String(section[1] || "").trim();
        if (heading) sectionLines.push(`* ${heading}*`);
        if (body) sectionLines.push(body);
        sectionLines.push("");
      } else if (section && typeof section === "object") {
        const heading = String(section.title || section.heading || "").trim();
        const body = String(section.content || section.body || "").trim();
        if (heading) sectionLines.push(`* ${heading}*`);
        if (body) sectionLines.push(body);
        sectionLines.push("");
      }
    }
  }

  const mainContent = sectionLines.join("\n").trim() || String(lesson.content || "Lesson content is not available yet.").trim();
  const header = [
    "🎓 *ELA401 — LESSON PREVIEW*",
    `* ${lesson.title || "Untitled lesson"}*`,
    `Status: ${lesson.is_draft ? "DRAFT — NOT PUBLISHED" : lesson.status || "REVIEW"}`,
    `Estimated study time: ${lesson.estimated_minutes || "Not specified"} minutes`,
    "",
    "⚠️ This material is for lecturer review and is not released to students.",
    "",
  ].join("\n");
  const maxBody = 3300;
  const body = mainContent.length > maxBody
    ? mainContent.slice(0, maxBody) + "\n\n[Preview shortened. Full lesson remains in the course database.]"
    : mainContent;

  await sendTextMessage(phone, header + body);
  if (lesson.is_draft || String(lesson.status || "").toUpperCase() !== "ACTIVE") {
    await sendButtonMessage(phone, "Lecturer decision — choose one action:", [
      makeButton(`admin_learning_approve_${lesson.id}`, "✅ Approve"),
      makeButton(`admin_learning_reject_${lesson.id}`, "⛔ Reject"),
      makeButton(`admin_learning_module_${lesson.module_id}`, "↩ Module Lessons"),
    ]);
  } else {
    await sendButtonMessage(phone, "This lesson is already published.", [
      makeButton(`admin_learning_module_${lesson.module_id}`, "↩ Module Lessons"),
      makeButton("admin_learning", "📚 All Modules"),
      makeButton("admin_agent_menu", "🏠 Lizzy Menu"),
    ]);
  }
}



/* =========================================================
   ELA301 — QUESTION BANK REVIEW (ADMIN-NUMBER ONLY)
   This is separate from the existing ELA401 lesson workflow.
   Each question is reviewed individually with a two-step decision.
   Approved questions become ACTIVE, but the ELA301 course itself
   remains DRAFT until the lecturer separately publishes it.
   ========================================================= */

const ELA301_COURSE_ID = "05c112df-fe8e-47bd-8814-1d6f60f4314b";
const ELA301_REVIEW_PAGE_SIZE = 6;

/* =========================================================
   ELA301 — LESSON REVIEW (ADMIN-NUMBER ONLY)
   Kept separate from the existing ELA401 review workflow.
   Individual lesson approval never publishes the whole course.
   ========================================================= */

async function listELA301LessonModules(phone: string, page = 0): Promise<void> {
  const { data, error } = await supabase.from("course_modules")
    .select("id, title, module_order")
    .eq("course_id", ELA301_COURSE_ID)
    .order("module_order", { ascending: true });

  if (error || !data) {
    safeErrorLog("listELA301LessonModules", error);
    await sendTextMessage(phone, "⚠️ I could not load ELA301 modules. Please try again.");
    return;
  }
  if (!data.length) {
    await sendTextMessage(phone, "No ELA301 modules were found.");
    return;
  }

  const pageSize = 6;
  const pageCount = Math.ceil(data.length / pageSize);
  const safePage = Math.max(0, Math.min(page, pageCount - 1));
  const visible = data.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const rows = visible.map((module: any) => makeListRow(
    `admin_ela301_lesson_module_${module.id}`,
    `Module ${module.module_order}: ${String(module.title || "Untitled").slice(0, 22)}`,
    "Open lessons • Review status"
  ));
  if (safePage > 0) rows.push(makeListRow(`admin_ela301_lesson_page_${safePage - 1}`, "⬅ Previous modules", "Go to previous page"));
  if (safePage < pageCount - 1) rows.push(makeListRow(`admin_ela301_lesson_page_${safePage + 1}`, "Next modules ➡", "View remaining modules"));

  await sendListMessage(
    phone,
    `🎓 ELA301 — Automobile Engineering\n16-module teaching course\nPage ${safePage + 1} of ${pageCount}\n\nChoose a module to inspect its lessons. Approving a lesson does not publish the course.`,
    "Choose Module",
    [{ title: "ELA301 Modules", rows }],
    "ELA301 Lesson Review",
    "Admin-number access only"
  );
  await sendButtonMessage(phone, "Lesson review navigation:", [
    makeButton("admin_ela301_questions", "📝 CBT Questions"),
    makeButton("admin_agent_menu", "🏠 Lizzy Menu"),
  ]);
}

async function showELA301LessonModule(phone: string, moduleIdInput: string): Promise<void> {
  const moduleId = sanitizeId(moduleIdInput);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(moduleId)) {
    await sendTextMessage(phone, "⚠️ Invalid module reference. Reopen the ELA301 module list.");
    return;
  }
  const { data: module, error } = await supabase.from("course_modules")
    .select("id, course_id, title, description, objectives, module_order")
    .eq("id", moduleId)
    .eq("course_id", ELA301_COURSE_ID)
    .maybeSingle();
  if (error || !module) {
    safeErrorLog("showELA301LessonModule", error);
    await sendTextMessage(phone, "⚠️ ELA301 module not found. Nothing was changed.");
    return;
  }

  const { data: lessons, error: lessonError } = await supabase.from("module_slides")
    .select("id, title, lesson_number, status, is_draft, estimated_minutes, order_index, slide_order")
    .eq("module_id", moduleId)
    .order("order_index", { ascending: true })
    .order("slide_order", { ascending: true });
  if (lessonError) {
    safeErrorLog("showELA301LessonModule.lessons", lessonError);
    await sendTextMessage(phone, "⚠️ I could not load this module's lessons.");
    return;
  }

  const rows = (lessons || []).map((lesson: any, index: number) => makeListRow(
    `admin_ela301_lesson_item_${lesson.id}`,
    String(lesson.title || `Lesson ${lesson.lesson_number || index + 1}`).slice(0, 24),
    `${lesson.is_draft ? "DRAFT" : lesson.status || "REVIEW"} • ${lesson.estimated_minutes || "—"} min`
  ));
  const body = [
    `🎓 *ELA301 — MODULE ${module.module_order}: ${module.title}*`,
    "",
    module.description || "",
    module.objectives ? `Objectives: ${module.objectives}` : "",
    "",
    `Lessons in module: ${(lessons || []).length}`,
    "Select a lesson to inspect the lecture and practical teaching material.",
    "",
    "🔒 Lesson approval is separate from publishing the ELA301 course.",
  ].filter(Boolean).join("\n");

  if (!rows.length) {
    await sendTextMessage(phone, body + "\n\nNo lessons are attached to this module yet.");
  } else {
    await sendListMessage(phone, body, "Open Lesson", [{ title: "ELA301 Lessons", rows }], "Lesson Preview", "Draft • Lecturer review");
  }
  await sendButtonMessage(phone, "Module navigation:", [
    makeButton("admin_ela301_lessons", "📚 All ELA301 Modules"),
    makeButton("admin_agent_menu", "🏠 Lizzy Menu"),
  ]);
}

async function showELA301Lesson(phone: string, lessonIdInput: string): Promise<void> {
  const lessonId = sanitizeId(lessonIdInput);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lessonId)) {
    await sendTextMessage(phone, "⚠️ Invalid lesson reference. Reopen the lesson from ELA301 modules.");
    return;
  }
  const { data: lesson, error } = await supabase.from("module_slides")
    .select("id, module_id, title, content, content_sections, objectives, estimated_minutes, status, is_draft")
    .eq("id", lessonId)
    .maybeSingle();
  if (error || !lesson) {
    safeErrorLog("showELA301Lesson", error);
    await sendTextMessage(phone, "⚠️ Lesson not found. Nothing was changed.");
    return;
  }
  const { data: module, error: moduleError } = await supabase.from("course_modules")
    .select("id, course_id, module_order, title")
    .eq("id", lesson.module_id)
    .eq("course_id", ELA301_COURSE_ID)
    .maybeSingle();
  if (moduleError || !module) {
    safeErrorLog("showELA301Lesson.course", moduleError);
    await sendTextMessage(phone, "⛔ This lesson is not part of ELA301. Nothing was changed.");
    return;
  }

  const sectionLines: string[] = [];
  if (Array.isArray(lesson.content_sections)) {
    for (const section of lesson.content_sections) {
      if (Array.isArray(section)) {
        const heading = String(section[0] || "").trim();
        const body = String(section[1] || "").trim();
        if (heading) sectionLines.push(`* ${heading}*`);
        if (body) sectionLines.push(body);
        sectionLines.push("");
      } else if (section && typeof section === "object") {
        const heading = String(section.title || section.heading || "").trim();
        const body = String(section.content || section.body || "").trim();
        if (heading) sectionLines.push(`* ${heading}*`);
        if (body) sectionLines.push(body);
        sectionLines.push("");
      }
    }
  }
  const mainContent = sectionLines.join("\n").trim() || String(lesson.content || "Lesson content is not available yet.").trim();
  const header = [
    "🎓 *ELA301 — AUTOMOBILE ENGINEERING*",
    `Module ${module.module_order}: ${module.title}`,
    `* ${lesson.title || "Untitled lesson"}*`,
    `Status: ${lesson.is_draft ? "DRAFT — NOT PUBLISHED" : lesson.status || "REVIEW"}`,
    `Estimated study time: ${lesson.estimated_minutes || "Not specified"} minutes`,
    "",
    "This preview is for lecturer review.",
    "",
  ].join("\n");
  const maxBody = 3000;
  const body = mainContent.length > maxBody
    ? mainContent.slice(0, maxBody) + "\n\n[Preview shortened. Full lesson remains in the course database.]"
    : mainContent;
  await sendTextMessage(phone, header + body);

  if (lesson.is_draft || String(lesson.status || "").toUpperCase() !== "ACTIVE") {
    await sendButtonMessage(phone, "ELA301 lecturer decision:", [
      makeButton(`admin_ela301_lesson_approve_${lesson.id}`, "✅ Approve lesson"),
      makeButton(`admin_ela301_lesson_reject_${lesson.id}`, "⛔ Reject lesson"),
      makeButton(`admin_ela301_lesson_module_${module.id}`, "↩ Module lessons"),
    ]);
  } else {
    await sendButtonMessage(phone, "This lesson is already approved.", [
      makeButton(`admin_ela301_lesson_module_${module.id}`, "↩ Module lessons"),
      makeButton("admin_ela301_lessons", "📚 All ELA301 Modules"),
      makeButton("admin_agent_menu", "🏠 Lizzy Menu"),
    ]);
  }
}

async function decideELA301Lesson(
  phone: string,
  lessonIdInput: string,
  decision: "APPROVE" | "REJECT",
  confirm: boolean,
): Promise<void> {
  const lessonId = sanitizeId(lessonIdInput);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lessonId)) {
    await sendTextMessage(phone, "⚠️ Invalid lesson reference. Reopen the lesson from ELA301 modules.");
    return;
  }
  const { data: lesson, error } = await supabase.from("module_slides")
    .select("id, module_id, title, status, is_draft")
    .eq("id", lessonId)
    .maybeSingle();
  if (error || !lesson) {
    safeErrorLog("decideELA301Lesson.lesson", error);
    await sendTextMessage(phone, "⚠️ Lesson not found. Nothing was changed.");
    return;
  }
  const { data: module, error: moduleError } = await supabase.from("course_modules")
    .select("id, course_id, title")
    .eq("id", lesson.module_id)
    .eq("course_id", ELA301_COURSE_ID)
    .maybeSingle();
  if (moduleError || !module) {
    safeErrorLog("decideELA301Lesson.course", moduleError);
    await sendTextMessage(phone, "⛔ This action is restricted to ELA301 lessons. Nothing was changed.");
    return;
  }
  if (!lesson.is_draft || String(lesson.status || "").toUpperCase() !== "DRAFT") {
    await sendTextMessage(phone, "ℹ️ This lesson is no longer awaiting review. No status was changed.");
    return;
  }

  if (!confirm) {
    const approving = decision === "APPROVE";
    await sendTextMessage(
      phone,
      (approving ? "⚠️ *CONFIRM ELA301 LESSON APPROVAL*" : "⚠️ *CONFIRM ELA301 LESSON REJECTION*") +
      `\n\nModule: *${module.title}*\nLesson: *${lesson.title}*` +
      (approving
        ? "\n\nThis approves this individual lesson. The ELA301 course will remain DRAFT until you separately authorize course publication."
        : "\n\nThis marks only this lesson REJECTED and keeps it hidden from students.") +
      "\n\nNo other lesson or course will be changed."
    );
    await sendButtonMessage(phone, "Please confirm this decision:", [
      makeButton(`admin_ela301_lesson_${decision.toLowerCase()}_confirm_${lessonId}`, approving ? "✅ Confirm approval" : "⛔ Confirm rejection"),
      makeButton(`admin_ela301_lesson_item_${lessonId}`, "↩ Back to lesson"),
      makeButton("admin_ela301_lessons", "📚 All ELA301 Modules"),
    ]);
    return;
  }

  const now = new Date().toISOString();
  const update = decision === "APPROVE"
    ? { status: "ACTIVE", is_draft: false, published_at: now, updated_at: now }
    : { status: "REJECTED", is_draft: true, published_at: null, updated_at: now };
  const { error: updateError } = await supabase.from("module_slides").update(update)
    .eq("id", lessonId)
    .eq("module_id", lesson.module_id)
    .eq("status", "DRAFT")
    .eq("is_draft", true);
  if (updateError) {
    safeErrorLog("decideELA301Lesson.update", updateError);
    await sendTextMessage(phone, "❌ The lesson decision could not be saved. It remains unchanged.");
    return;
  }
  await sendTextMessage(
    phone,
    decision === "APPROVE"
      ? `✅ *ELA301 LESSON APPROVED*\n\n${lesson.title}\n\nThis lesson is ACTIVE. The ELA301 course itself remains DRAFT, so students still cannot access the course.`
      : `⛔ *ELA301 LESSON REJECTED*\n\n${lesson.title}\n\nIt remains hidden from students. Revise it before submitting it for approval again.`
  );
  await sendButtonMessage(phone, "ELA301 Lesson Review:", [
    makeButton(`admin_ela301_lesson_module_${module.id}`, "↩ Module lessons"),
    makeButton("admin_ela301_lessons", "📚 All ELA301 Modules"),
    makeButton("admin_agent_menu", "🏠 Lizzy Menu"),
  ]);
}


async function listELA301QuestionQueue(phone: string, page = 0): Promise<void> {
  const { count, error: countError } = await supabase
    .from("course_questions")
    .select("id", { count: "exact", head: true })
    .eq("course_id", ELA301_COURSE_ID)
    .eq("status", "DRAFT");

  if (countError) {
    safeErrorLog("listELA301QuestionQueue.count", countError);
    await sendTextMessage(phone, "⚠️ I could not count the ELA301 draft questions. No records were changed.");
    return;
  }

  const total = count || 0;
  const pageCount = Math.max(1, Math.ceil(total / ELA301_REVIEW_PAGE_SIZE));
  const safePage = Math.max(0, Math.min(Math.floor(Number(page) || 0), pageCount - 1));
  const from = safePage * ELA301_REVIEW_PAGE_SIZE;
  const { data: questions, error } = await supabase
    .from("course_questions")
    .select("id, question, question_order, module_id, difficulty")
    .eq("course_id", ELA301_COURSE_ID)
    .eq("status", "DRAFT")
    .order("question_order", { ascending: true })
    .range(from, from + ELA301_REVIEW_PAGE_SIZE - 1);

  if (error || !questions) {
    safeErrorLog("listELA301QuestionQueue.questions", error);
    await sendTextMessage(phone, "⚠️ The ELA301 question queue could not be loaded. No records were changed.");
    return;
  }

  if (!questions.length) {
    const [{ count: approved }, { count: rejected }] = await Promise.all([
      supabase.from("course_questions").select("id", { count: "exact", head: true }).eq("course_id", ELA301_COURSE_ID).eq("status", "ACTIVE"),
      supabase.from("course_questions").select("id", { count: "exact", head: true }).eq("course_id", ELA301_COURSE_ID).eq("status", "REJECTED"),
    ]);
    await sendTextMessage(phone, [
      "🎓 *ELA301 QUESTION REVIEW*",
      "",
      "There are no draft questions waiting for review.",
      "Approved: " + (approved ?? "Unavailable"),
      "Rejected: " + (rejected ?? "Unavailable"),
      "The ELA301 course remains DRAFT until separately authorized for publication.",
    ].join("\n"));
    await sendButtonMessage(phone, "Review navigation:", [
      makeButton("admin_ela301_questions", "🔄 Refresh Queue"),
      makeButton("admin_agent_menu", "🏠 Lizzy Menu"),
    ]);
    return;
  }

  const rows = questions.map((question: any) => makeListRow(
    "admin_ela301_q_" + question.id,
    "Q" + question.question_order + ": " + String(question.question || "Untitled question").slice(0, 22),
    String(question.difficulty || "Unspecified") + " • Awaiting review"
  ));
  if (safePage > 0) rows.push(makeListRow("admin_ela301_q_page_" + (safePage - 1), "⬅ Previous questions", "Go to previous page"));
  if (safePage < pageCount - 1) rows.push(makeListRow("admin_ela301_q_page_" + (safePage + 1), "Next questions ➡", "View next page"));

  await sendListMessage(
    phone,
    [
      "📝 *ELA301 — CBT QUESTION REVIEW*",
      "",
      "Draft questions awaiting Lizzy's review: " + total,
      "Page " + (safePage + 1) + " of " + pageCount,
      "",
      "Open each question to inspect all four options, the keyed answer and explanation. Approve or reject one question at a time.",
      "",
      "🔒 ELA301 remains DRAFT. Approval here does not publish the course.",
    ].join("\n"),
    "Choose Question",
    [{ title: "ELA301 Draft Questions", rows }],
    "Learning Centre",
    "Admin-number access only"
  );
}

async function showELA301Question(phone: string, questionIdInput: string): Promise<void> {
  const questionId = sanitizeId(questionIdInput);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(questionId)) {
    await sendTextMessage(phone, "⚠️ Invalid question reference. Reopen the question from the ELA301 review queue.");
    return;
  }

  const { data: question, error } = await supabase.from("course_questions")
    .select("id, course_id, module_id, question, option_a, option_b, option_c, option_d, correct_answer, explanation, question_order, status, difficulty, marks")
    .eq("id", questionId)
    .eq("course_id", ELA301_COURSE_ID)
    .maybeSingle();

  if (error || !question) {
    safeErrorLog("showELA301Question", error);
    await sendTextMessage(phone, "⚠️ ELA301 question not found. Nothing was changed.");
    return;
  }

  let moduleTitle = "General question bank";
  if (question.module_id) {
    const { data: module } = await supabase.from("course_modules")
      .select("title").eq("id", question.module_id).eq("course_id", ELA301_COURSE_ID).maybeSingle();
    if (module?.title) moduleTitle = String(module.title);
  }

  const status = String(question.status || "DRAFT").toUpperCase();
  const body = [
    "📝 *ELA301 — QUESTION " + question.question_order + "*",
    "Module: " + moduleTitle,
    "Status: " + status,
    "Difficulty: " + (question.difficulty || "Not specified"),
    "Marks: " + (question.marks ?? 1),
    "",
    "*" + String(question.question || "") + "*",
    "",
    "A) " + String(question.option_a || ""),
    "B) " + String(question.option_b || ""),
    "C) " + String(question.option_c || ""),
    "D) " + String(question.option_d || ""),
    "",
    "🔑 *Proposed correct answer:* " + String(question.correct_answer || "Not set"),
    "📖 *Explanation:* " + String(question.explanation || "No explanation supplied."),
    "",
    "Review the wording, technical accuracy, options, keyed answer and explanation before deciding.",
  ].join("\n");

  await sendTextMessage(phone, body.slice(0, 3800));
  if (status === "DRAFT") {
    await sendButtonMessage(phone, "Choose a decision for this question:", [
      makeButton("admin_ela301_q_approve_" + question.id, "✅ Approve Question"),
      makeButton("admin_ela301_q_reject_" + question.id, "⛔ Reject Question"),
      makeButton("admin_ela301_q_page_0", "↩ Review Queue"),
    ], "ELA301 Question Review");
  } else {
    await sendButtonMessage(phone, "This question has already been reviewed.", [
      makeButton("admin_ela301_questions", "📝 Review Queue"),
      makeButton("admin_agent_menu", "🏠 Lizzy Menu"),
    ]);
  }
}

async function decideELA301Question(
  phone: string,
  questionIdInput: string,
  decision: "APPROVE" | "REJECT",
  confirm: boolean,
): Promise<void> {
  const questionId = sanitizeId(questionIdInput);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(questionId)) {
    await sendTextMessage(phone, "⚠️ Invalid question reference. No records were changed.");
    return;
  }

  const { data: question, error } = await supabase.from("course_questions")
    .select("id, question, question_order, status, correct_answer, option_a, option_b, option_c, option_d")
    .eq("id", questionId)
    .eq("course_id", ELA301_COURSE_ID)
    .maybeSingle();

  if (error || !question) {
    safeErrorLog("decideELA301Question.lookup", error);
    await sendTextMessage(phone, "⚠️ Question not found in ELA301. No records were changed.");
    return;
  }
  if (String(question.status || "").toUpperCase() !== "DRAFT") {
    await sendTextMessage(phone, "ℹ️ This question is no longer awaiting review. Its current status is " + question.status + ".");
    await listELA301QuestionQueue(phone, 0);
    return;
  }

  const optionsValid = [question.option_a, question.option_b, question.option_c, question.option_d]
    .every((value: unknown) => typeof value === "string" && value.trim().length > 0);
  const answerValid = ["A", "B", "C", "D"].includes(String(question.correct_answer || "").toUpperCase());
  if (decision === "APPROVE" && (!optionsValid || !answerValid || !String(question.question || "").trim())) {
    await sendTextMessage(phone, "⛔ This question is incomplete. It needs a question, four non-empty options and a valid A/B/C/D answer before it can be approved.");
    return;
  }

  if (!confirm) {
    await sendTextMessage(phone, [
      decision === "APPROVE" ? "⚠️ *CONFIRM QUESTION APPROVAL*" : "⚠️ *CONFIRM QUESTION REJECTION*",
      "",
      "ELA301 Question: " + question.question_order,
      String(question.question || "").slice(0, 700),
      "",
      decision === "APPROVE"
        ? "Approving marks this question ACTIVE in the question bank. The course itself remains DRAFT."
        : "Rejecting marks only this question REJECTED. It remains unavailable to students.",
      "",
      "No other question will be changed.",
    ].join("\n"));
    await sendButtonMessage(phone, "Please confirm this individual decision:", [
      makeButton("admin_ela301_q_" + decision.toLowerCase() + "_confirm_" + questionId, decision === "APPROVE" ? "✅ Confirm Approval" : "⛔ Confirm Rejection"),
      makeButton("admin_ela301_q_" + questionId, "↩ Back to Question"),
      makeButton("admin_ela301_questions", "Cancel"),
    ]);
    return;
  }

  const nextStatus = decision === "APPROVE" ? "ACTIVE" : "REJECTED";
  const { data: updated, error: updateError } = await supabase.from("course_questions")
    .update({ status: nextStatus })
    .eq("id", questionId)
    .eq("course_id", ELA301_COURSE_ID)
    .eq("status", "DRAFT")
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    safeErrorLog("decideELA301Question.persist", updateError);
    await sendTextMessage(phone, "❌ The decision could not be saved. The question remains unchanged; please refresh the queue.");
    return;
  }

  await sendTextMessage(phone, decision === "APPROVE"
    ? "✅ *ELA301 QUESTION APPROVED*\n\nQuestion " + question.question_order + " is now ACTIVE in the question bank. The ELA301 course remains DRAFT and is not open to students."
    : "⛔ *ELA301 QUESTION REJECTED*\n\nQuestion " + question.question_order + " is marked REJECTED and remains unavailable to students.");

  await sendButtonMessage(phone, "Continue ELA301 review:", [
    makeButton("admin_ela301_questions", "📝 Next Draft Questions"),
    makeButton("admin_agent_menu", "🏠 Lizzy Menu"),
  ]);
}




/* =========================================================
   ELA301 COURSE-WIDE PUBLISH / PAUSE CONTROLS
   ========================================================= */

async function showELA301PublishControls(phone: string): Promise<void> {
  const [courseResult, moduleResult, lessonResult, questionResult, practiceResult] = await Promise.all([
    supabase.from("courses").select("course_code,course_name,status").eq("id", ELA301_COURSE_ID).maybeSingle(),
    supabase.from("course_modules").select("id", { count: "exact", head: true }).eq("course_id", ELA301_COURSE_ID),
    supabase.from("module_slides").select("id,status,is_draft", { count: "exact" })
      .in("module_id", (await supabase.from("course_modules").select("id").eq("course_id", ELA301_COURSE_ID)).data?.map((m:any)=>m.id) || []),
    supabase.from("course_questions").select("id,status", { count: "exact" }).eq("course_id", ELA301_COURSE_ID),
    supabase.from("lesson_practice_questions").select("id,status", { count: "exact" })
      .in("lesson_id", (await supabase.from("module_slides").select("id,module_id")
        .in("module_id", (await supabase.from("course_modules").select("id").eq("course_id", ELA301_COURSE_ID)).data?.map((m:any)=>m.id) || [])).data?.map((s:any)=>s.id) || []),
  ]);
  if (courseResult.error || !courseResult.data) {
    await sendTextMessage(phone, "⚠️ ELA301 course status could not be loaded. No changes were made.");
    return;
  }
  const course = courseResult.data;
  const countStatus = (rows:any[]|null, status:string) => (rows || []).filter((r:any)=>String(r.status||"").toUpperCase()===status).length;
  const modules = (await supabase.from("course_modules").select("id,status").eq("course_id", ELA301_COURSE_ID)).data || [];
  const moduleIds = modules.map((m:any)=>m.id);
  const lessons = (await supabase.from("module_slides").select("id,status,is_draft").in("module_id", moduleIds)).data || [];
  const questions = (await supabase.from("course_questions").select("id,status").eq("course_id", ELA301_COURSE_ID)).data || [];
  const practices = (await supabase.from("lesson_practice_questions").select("id,status").in("lesson_id", lessons.map((s:any)=>s.id))).data || [];
  await sendTextMessage(phone, [
    "🚦 *ELA301 — COURSE CONTROL CENTRE*",
    "",
    "*" + course.course_code + " — " + course.course_name + "*",
    "Level: 300 | Semester: First Semester",
    "Course status: *" + String(course.status).toUpperCase() + "*",
    "Modules: " + modules.length,
    "Teaching lessons: " + lessons.length + " (Draft: " + lessons.filter((x:any)=>x.is_draft===true || x.status==="DRAFT").length + ")",
    "CBT questions: " + questions.length + " (Active: " + countStatus(questions,"ACTIVE") + ", Draft: " + countStatus(questions,"DRAFT") + ", Inactive: " + countStatus(questions,"INACTIVE") + ")",
    "Lesson practice questions: " + practices.length,
    "",
    "Publish All activates the course, teaching lessons, modules and eligible CBT questions. Rejected questions are never published.",
    "Pause Course blocks access to the whole course. Pause Questions disables the CBT question bank without pausing lessons.",
    "",
    "⚠️ Every action requires a second confirmation. This screen does not change anything.",
  ].join("\n"));
  await sendButtonMessage(phone, "Choose an ELA301 control:", [
    makeButton("admin_ela301_action_publish", "🚀 Publish All"),
    makeButton("admin_ela301_action_pause_course", "⏸ Pause Course"),
    makeButton("admin_ela301_action_pause_questions", "⏸ Pause Questions"),
  ], "ELA301 Course Controls");
  await sendButtonMessage(phone, "More controls:", [
    makeButton("admin_ela301_action_resume_course", "▶ Resume Course"),
    makeButton("admin_ela301_action_resume_questions", "▶ Resume Questions"),
    makeButton("admin_agent_menu", "🏠 Lizzy Menu"),
  ]);
}

const ELA301_CONTROL_ACTIONS: Record<string, {title:string;description:string}> = {
  publish: { title: "PUBLISH ALL ELA301 CONTENT", description: "Activate the course, all teaching modules and lessons, and every valid non-rejected CBT question." },
  pause_course: { title: "PAUSE ELA301 COURSE", description: "Set the course to INACTIVE. Students will not be able to enter the course. Lessons and questions remain stored." },
  pause_questions: { title: "PAUSE ELA301 CBT QUESTIONS", description: "Set active CBT questions to INACTIVE. The course lessons remain available." },
  resume_course: { title: "RESUME ELA301 COURSE", description: "Set the course back to ACTIVE. This does not alter question-bank status." },
  resume_questions: { title: "RESUME ELA301 CBT QUESTIONS", description: "Reactivate the paused CBT questions. Rejected questions remain rejected." },
};

async function requestELA301CourseAction(phone:string, action:string):Promise<void> {
  const item = ELA301_CONTROL_ACTIONS[action];
  if (!item) return;
  await sendTextMessage(phone, [
    "⚠️ *CONFIRM " + item.title + "*",
    "",
    item.description,
    "",
    "This action affects ELA301 only. ELA401 and ELA302 will not be changed.",
    "Do you want to continue?",
  ].join("\n"));
  await sendButtonMessage(phone, "Please confirm this course-wide action:", [
    makeButton("admin_ela301_action_confirm_" + action, "✅ Confirm"),
    makeButton("admin_ela301_controls", "↩ Cancel"),
    makeButton("admin_agent_menu", "🏠 Menu"),
  ]);
}

async function applyELA301CourseAction(phone:string, action:string):Promise<void> {
  if (!ELA301_CONTROL_ACTIONS[action]) return;
  const now = new Date().toISOString();
  const modulesResult = await supabase.from("course_modules").select("id").eq("course_id", ELA301_COURSE_ID);
  if (modulesResult.error) {
    safeErrorLog("applyELA301CourseAction.modules", modulesResult.error);
    await sendTextMessage(phone, "❌ Could not load ELA301 modules. Nothing was changed.");
    return;
  }
  const moduleIds = (modulesResult.data || []).map((m:any)=>m.id);
  let errors:string[] = [];
  let counts:Record<string,number> = {};

  if (action === "publish") {
    const { count: invalidCount, error: validationError } = await supabase.from("course_questions")
      .select("id", { count:"exact", head:true }).eq("course_id", ELA301_COURSE_ID)
      .in("status", ["DRAFT","INACTIVE"])
      .or("question.is.null,option_a.is.null,option_b.is.null,option_c.is.null,option_d.is.null,correct_answer.is.null");
    if (validationError || (invalidCount || 0) > 0) {
      safeErrorLog("applyELA301CourseAction.validation", validationError);
      await sendTextMessage(phone, "⛔ Publication stopped. The CBT question validation could not be completed or incomplete questions were found. Review the question bank first. No course publication was attempted.");
      return;
    }
    const [lessonUpdate, moduleUpdate, questionUpdate] = await Promise.all([
      moduleIds.length ? supabase.from("module_slides").update({status:"ACTIVE",is_draft:false,published_at:now,updated_at:now})
        .in("module_id",moduleIds).in("status",["DRAFT","INACTIVE"]).select("id") : Promise.resolve({data:[],error:null}),
      moduleIds.length ? supabase.from("course_modules").update({status:"ACTIVE",updated_at:now})
        .eq("course_id",ELA301_COURSE_ID).in("status",["DRAFT","INACTIVE"]).select("id") : Promise.resolve({data:[],error:null}),
      supabase.from("course_questions").update({status:"ACTIVE"}).eq("course_id",ELA301_COURSE_ID)
        .in("status",["DRAFT","INACTIVE"]).select("id"),
    ]);
    if (lessonUpdate.error) errors.push("lessons: "+lessonUpdate.error.message);
    if (moduleUpdate.error) errors.push("modules: "+moduleUpdate.error.message);
    if (questionUpdate.error) errors.push("CBT questions: "+questionUpdate.error.message);
    counts = {lessons:lessonUpdate.data?.length||0,modules:moduleUpdate.data?.length||0,questions:questionUpdate.data?.length||0};
    if (!errors.length) {
      const courseUpdate = await supabase.from("courses").update({status:"ACTIVE",updated_at:now}).eq("id",ELA301_COURSE_ID).select("id").maybeSingle();
      if (courseUpdate.error || !courseUpdate.data) errors.push("course status: "+(courseUpdate.error?.message||"No course row updated"));
      else counts.course = 1;
    }
  } else if (action === "pause_course" || action === "resume_course") {
    const status = action === "pause_course" ? "INACTIVE" : "ACTIVE";
    const result = await supabase.from("courses").update({status,updated_at:now}).eq("id",ELA301_COURSE_ID).select("id").maybeSingle();
    if (result.error || !result.data) errors.push(result.error?.message || "Course row was not updated");
    else counts.course = 1;
  } else {
    const status = action === "pause_questions" ? "INACTIVE" : "ACTIVE";
    const from = action === "pause_questions" ? ["ACTIVE"] : ["INACTIVE"];
    const result = await supabase.from("course_questions").update({status}).eq("course_id",ELA301_COURSE_ID).in("status",from).select("id");
    if (result.error) errors.push(result.error.message);
    else counts.questions = result.data?.length || 0;
  }

  if (errors.length) {
    await sendTextMessage(phone, "⚠️ *ELA301 CONTROL PARTIALLY COMPLETED*

Some updates may have succeeded, but the operation reported an error:
"+errors.join("
")+"

Please reopen Course Controls and check the current status before retrying.");
    await showELA301PublishControls(phone);
    return;
  }
  const successLabel = action === "publish" ? "ELA301 course content and eligible CBT questions are now ACTIVE."
    : action === "pause_course" ? "ELA301 course is now INACTIVE. Its data remains intact."
    : action === "pause_questions" ? "ELA301 CBT questions are now INACTIVE. Lessons remain available."
    : action === "resume_course" ? "ELA301 course is ACTIVE again."
    : "ELA301 CBT questions are ACTIVE again. Rejected questions were not changed.";
  await sendTextMessage(phone, "✅ *ELA301 CONTROL UPDATED*

"+successLabel+"

Updated records: "+JSON.stringify(counts));
  await showELA301PublishControls(phone);
}

function pdfSafe(value: unknown): string {
  return String(value ?? "—").replace(/[^\x20-\x7E]/g, "?").replace(/[\r\t]/g, " ").slice(0, 180);
}

async function sendResultPdf(phone: string, filename: string, title: string, blocks: string[][]): Promise<void> {
  try {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([595.28, 841.89]);
    let y = 790;
    const margin = 48;
    const addPage = () => { page = pdf.addPage([595.28, 841.89]); y = 790; };
    const write = (line: string, isBold = false, size = 10) => {
      const safe = pdfSafe(line);
      const maxChars = size >= 14 ? 65 : 92;
      const chunks: string[] = [];
      for (let i = 0; i < safe.length; i += maxChars) chunks.push(safe.slice(i, i + maxChars));
      for (const chunk of (chunks.length ? chunks : [""])) {
        if (y < 58) addPage();
        page.drawText(chunk, { x: margin, y, size, font: isBold ? bold : font });
        y -= size + 6;
      }
    };
    write("ENGR. ERO LEARNING CENTRE", true, 16);
    write("ELA401 - TIME MEASUREMENT", true, 12);
    write(title, true, 13);
    write("Official academic record | Generated: " + new Date().toLocaleDateString("en-GB"));
    write("--------------------------------------------------------------------------");
    for (const block of blocks) {
      for (const line of block) write(line, line.startsWith("STUDENT:") || line.startsWith("ATTENDANCE") || line.startsWith("CBT") || line.startsWith("RESULT"));
      write(" ");
    }
    write("--------------------------------------------------------------------------");
    write("Lecturer: Engr. Ero Osarodion Odion");
    write("Signature: __________________________________  Date: __________________");
    write("Note: This report contains only attendance and CBT records stored in the academic database.");
    const bytes = await pdf.save();
    const path = "ela401/" + crypto.randomUUID() + "-" + filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const { error: uploadError } = await supabase.storage.from("student-result-sheets").upload(path, bytes, {
      contentType: "application/pdf", upsert: false, cacheControl: "3600",
    });
    if (uploadError) throw uploadError;
    const { data: signed, error: signError } = await supabase.storage.from("student-result-sheets").createSignedUrl(path, 86400, { download: filename });
    if (signError || !signed?.signedUrl) throw signError || new Error("Could not create a download link.");
    await sendDocumentMessage(phone, signed.signedUrl, filename, "Your ELA401 result sheet is ready. Download and print it for submission.");
  } catch (error) {
    safeErrorLog("sendResultPdf", error);
    await sendTextMessage(phone, "Could not generate the PDF result sheet. Please retry; no academic records were changed.");
  }
}

async function getStudentResultBlock(student: any): Promise<string[]> {
  const courseId = "37dee46f-f551-45d5-9ada-ed65946fe148";
  const [attendanceResult, attemptsResult] = await Promise.all([
    supabase.from("attendance").select("attendance_date, session_date, session_label, status")
      .eq("student_id", student.id).eq("course_id", courseId).order("session_date", { ascending: true }).limit(500),
    supabase.from("exam_attempts").select("score, total_marks, percentage, pass_status, submitted_at")
      .eq("student_id", student.id).eq("course_id", courseId).not("submitted_at", "is", null)
      .order("submitted_at", { ascending: true }).limit(100),
  ]);
  if (attendanceResult.error || attemptsResult.error) throw attendanceResult.error || attemptsResult.error;
  const attendance = attendanceResult.data || [];
  const attempts = attemptsResult.data || [];
  const lines = [
    "STUDENT: " + pdfSafe(student.name),
    "Department: " + pdfSafe(student.department) + " | Level: " + pdfSafe(student.level) + "L",
    "Class S/N: " + pdfSafe(student.serial_number) + " | Matric No: " + pdfSafe(student.matric_number),
    "ATTENDANCE (" + attendance.length + " recorded sessions)",
    ...(attendance.length ? attendance.map((a: any) => "  " + pdfSafe(a.session_date || a.attendance_date || "Date not recorded") + " | " + pdfSafe(a.session_label || "Class") + " | " + pdfSafe(a.status || "RECORDED")) : ["  No attendance dates recorded."]),
    "CBT RESULTS (score normalized to 0-100)",
    ...(attempts.length ? attempts.map((a: any, i: number) => {
      const pct = a.percentage !== null && a.percentage !== undefined ? Number(a.percentage) :
        (Number(a.total_marks) > 0 ? Number(a.score) / Number(a.total_marks) * 100 : 0);
      const score = Math.max(0, Math.min(100, pct));
      return "  Attempt " + (i + 1) + ": " + score.toFixed(1) + "/100 | " + pdfSafe(a.pass_status || "NOT GRADED") +
        " | " + (a.submitted_at ? new Date(a.submitted_at).toLocaleDateString("en-GB") : "Date not recorded");
    }) : ["  No completed CBT score recorded."]),
    "RESULT SUMMARY: " + attempts.length + " completed CBT attempt(s); " + attendance.length + " attendance record(s).",
  ];
  return lines;
}

async function downloadIndividualResult(phone: string, studentId: string): Promise<void> {
  const { data: student, error } = await supabase.from("students")
    .select("id, name, matric_number, serial_number, department, level, status")
    .eq("id", studentId).eq("status", "ACTIVE").maybeSingle();
  if (error || !student) {
    safeErrorLog("downloadIndividualResult.student", error);
    await sendTextMessage(phone, "Approved student record not found. No PDF was generated.");
    return;
  }
  const block = await getStudentResultBlock(student);
  const filename = "ELA401-" + pdfSafe(student.matric_number).replace(/[^a-zA-Z0-9_-]/g, "_") + "-Result.pdf";
  await sendResultPdf(phone, filename, "INDIVIDUAL STUDENT RESULT SHEET", [block]);
}

async function downloadDepartmentResults(phone: string, departmentInput: string): Promise<void> {
  let department = "";
  try { department = decodeURIComponent(departmentInput); } catch (_) { department = departmentInput; }
  const { data: students, error } = await supabase.from("students")
    .select("id, name, matric_number, serial_number, department, level")
    .eq("status", "ACTIVE").eq("department", department)
    .order("serial_number", { ascending: true }).order("matric_number", { ascending: true }).limit(200);
  if (error || !students?.length) {
    safeErrorLog("downloadDepartmentResults", error);
    await sendTextMessage(phone, "No approved students were found for this departmental result sheet.");
    return;
  }
  const blocks: string[][] = [];
  for (const student of students) blocks.push(await getStudentResultBlock(student));
  const filename = "ELA401-" + department.replace(/[^a-zA-Z0-9_-]/g, "_") + "-Department-Results.pdf";
  await sendResultPdf(phone, filename, "CONSOLIDATED DEPARTMENTAL RESULT SHEET - " + department, blocks);
}

async function listStudentDepartments(phone: string): Promise<void> {
  const { data, error } = await supabase.from("students")
    .select("department")
    .eq("status", "ACTIVE")
    .order("department", { ascending: true });
  if (error) {
    safeErrorLog("listStudentDepartments", error);
    await sendTextMessage(phone, "⚠️ Could not load student departments.");
    return;
  }
  const departments = [...new Set((data || []).map((s: any) => String(s.department || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (!departments.length) {
    await sendTextMessage(phone, "No approved student records are available yet.");
    return;
  }
  const rows = departments.slice(0, 10).map((department, index) =>
    makeListRow(`admin_roster_department_${encodeURIComponent(department)}`, department.slice(0, 24), "Open department student register")
  );
  await sendListMessage(phone,
    "📚 *STUDENT RECORDS & CLASS REGISTER*\n\nStudents are grouped by department. Open a department to view class S/N, matriculation number, attendance dates and CBT scores (0–100).",
    "Choose Department", [{ title: "Departments", rows }],
    "Lizzy • Student Register", "Approved students only"
  );
  await sendButtonMessage(phone, "Student register:", [
    makeButton("admin_students_pending", "⏳ Pending Verification"),
    makeButton("admin_agent_menu", "🏠 Lizzy Menu"),
  ]);
}

async function listDepartmentStudents(phone: string, departmentInput: string, page = 0): Promise<void> {
  let department = "";
  try { department = decodeURIComponent(departmentInput); } catch (_) { department = departmentInput; }
  if (!department || department.length > 120) {
    await sendTextMessage(phone, "⚠️ Invalid department selection. Please reopen Student Records.");
    return;
  }
  const safePage = Math.max(0, Math.floor(page));
  const from = safePage * 10;
  const { data, error, count } = await supabase.from("students")
    .select("id, name, matric_number, serial_number, department, level", { count: "exact" })
    .eq("status", "ACTIVE").eq("department", department)
    .order("serial_number", { ascending: true })
    .order("matric_number", { ascending: true });
  if (error) {
    safeErrorLog("listDepartmentStudents", error);
    await sendTextMessage(phone, "⚠️ Could not load this department's student register.");
    return;
  }
  if (!data?.length) {
    await sendTextMessage(phone, "No approved students found in this department.");
    return;
  }
  data.sort((a: any, b: any) => String(a.serial_number || "").localeCompare(String(b.serial_number || ""), undefined, { numeric: true, sensitivity: "base" }) || String(a.matric_number || "").localeCompare(String(b.matric_number || "")));
  const totalStudents = data.length;
  const pageStudents = data.slice(from, from + 10);
  const rows = pageStudents.map((s: any) => makeListRow(
    `admin_roster_student_${s.id}_${encodeURIComponent(department)}_${safePage}`,
    `S/N ${s.serial_number || "—"} • ${String(s.name || "Student").slice(0, 13)}`,
    `Mat: ${s.matric_number || "—"} • ${s.level || "—"}L`
  ));
  await sendListMessage(phone,
    `🏫 *${department.toUpperCase()}*\nApproved students: ${totalStudents}\nPage ${safePage + 1}\n\nSorted by class S/N, then matriculation number. Select a student for attendance dates and CBT results.`,
    "Student Register", [{ title: "Students • S/N order", rows }],
    "Lizzy • Department Register", "Student academic records"
  );
  const nav = [];
  if (safePage > 0) nav.push(makeButton(`admin_roster_page_${encodeURIComponent(department)}_${safePage - 1}`, "⬅ Previous"));
  if (totalStudents > from + pageStudents.length) nav.push(makeButton(`admin_roster_page_${encodeURIComponent(department)}_${safePage + 1}`, "Next ➡"));
  nav.push(makeButton("admin_student_records", "↩ Departments"));
  await sendButtonMessage(phone, "Department result sheet:", [
    makeButton("admin_roster_pdf_" + encodeURIComponent(department), "Download Dept PDF"),
    ...nav.slice(0, 2),
  ]);
}

async function showStudentAcademicRecord(phone: string, studentIdInput: string, departmentInput: string, pageInput: string): Promise<void> {
  const studentId = sanitizeId(studentIdInput);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId)) {
    await sendTextMessage(phone, "⚠️ Invalid student record reference.");
    return;
  }
  let department = "";
  try { department = decodeURIComponent(departmentInput); } catch (_) { department = departmentInput; }
  const page = Math.max(0, Number.parseInt(pageInput, 10) || 0);
  const { data: student, error } = await supabase.from("students")
    .select("id, name, matric_number, serial_number, department, level, phone, status")
    .eq("id", studentId).eq("status", "ACTIVE").maybeSingle();
  if (error || !student) {
    safeErrorLog("showStudentAcademicRecord.student", error);
    await sendTextMessage(phone, "⚠️ Approved student record not found.");
    return;
  }
  const courseId = "37dee46f-f551-45d5-9ada-ed65946fe148";
  const [attendanceResult, attemptsResult] = await Promise.all([
    supabase.from("attendance")
      .select("attendance_date, session_date, session_label, status")
      .eq("student_id", studentId).eq("course_id", courseId)
      .order("session_date", { ascending: false }).limit(30),
    supabase.from("exam_attempts")
      .select("score, total_marks, percentage, pass_status, submitted_at")
      .eq("student_id", studentId).eq("course_id", courseId)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false }).limit(5),
  ]);
  if (attendanceResult.error || attemptsResult.error) {
    safeErrorLog("showStudentAcademicRecord.related", attendanceResult.error || attemptsResult.error);
    await sendTextMessage(phone, "⚠️ Student identity loaded, but attendance or CBT history could not be retrieved. Please retry.");
    return;
  }
  const attendance = attendanceResult.data || [];
  const attempts = attemptsResult.data || [];
  const attendanceLines = attendance.length
    ? attendance.map((a: any) => {
        const day = a.session_date || a.attendance_date || "Date not recorded";
        return `• ${day}${a.session_label ? ` — ${a.session_label}` : ""} — ${String(a.status || "RECORDED").toUpperCase()}`;
      })
    : ["• No class attendance dates recorded."];
  const scoreLines = attempts.length
    ? attempts.map((a: any, i: number) => {
        const raw = a.percentage !== null && a.percentage !== undefined
          ? Number(a.percentage)
          : (Number(a.total_marks) > 0 ? (Number(a.score) / Number(a.total_marks)) * 100 : 0);
        const score = Math.max(0, Math.min(100, Math.round(raw * 100) / 100));
        return `• ${i === 0 ? "LATEST" : `Attempt ${i + 1}`}: *${score.toFixed(1)}/100*${a.pass_status ? ` — ${a.pass_status}` : ""} (${new Date(a.submitted_at).toLocaleDateString("en-GB")})`;
      })
    : ["• No completed CBT score recorded yet."];
  await sendTextMessage(phone,
    "🎓 *STUDENT ACADEMIC RECORD*\n\n" +
    `👤 Name: *${student.name || "—"}*\n` +
    `🏫 Department: *${student.department || "—"}*\n` +
    `🔢 Class S/N: *${student.serial_number || "—"}*\n` +
    `🪪 Matric No: *${student.matric_number || "—"}*\n` +
    `📚 Level: *${student.level || "—"}L*\n\n` +
    `📅 *CLASS ATTENDANCE DATES (${attendance.length})*\n${attendanceLines.join("\n")}\n\n` +
    `📝 *CBT SCORES — 0 TO 100*\n${scoreLines.join("\n")}\n\n` +
    "_Attendance is shown from recorded class sessions. CBT scores are normalized to a 0–100 scale._"
  );
  await sendButtonMessage(phone, "Download or navigate:", [
    makeButton(`admin_roster_pdf_student_${student.id}`, "Download Student PDF"),
    makeButton(`admin_roster_page_${encodeURIComponent(department || student.department || "")}_${page}`, "↩ Department Register"),
    makeButton("admin_student_records", "🏫 Departments"),
    makeButton("admin_agent_menu", "🏠 Lizzy Menu"),
  ]);
}

async function listPendingStudents(phone: string, page = 0): Promise<void> {
  const safePage = Math.max(0, Math.floor(page));
  const from = safePage * 10;
  const { data, error } = await supabase.from("students")
    .select("id, name, matric_number, serial_number, department, level, phone, created_at")
    .eq("status", "PENDING").order("created_at", { ascending: true })
    .range(from, from + 9);
  if (error) {
    safeErrorLog("listPendingStudents", error);
    await sendTextMessage(phone, "⚠️ Could not load pending student registrations.");
    return;
  }
  if (!data?.length && safePage === 0) {
    await sendTextMessage(phone, "✅ There are no students waiting for verification.");
    return;
  }
  if (!data?.length) {
    await sendTextMessage(phone, "No more pending students. Return to the previous page or Lizzy menu.");
    return;
  }
  const rows = data.map((s: any) => makeListRow(
    `admin_student_review_${s.id}`,
    String(s.name || "Unnamed student").slice(0, 24),
    `${s.matric_number || "No Mat No"} • S/N ${s.serial_number || "—"}`
  ));
  await sendListMessage(phone,
    `🎓 *PENDING STUDENT VERIFICATION*\n\nPage ${safePage + 1}. Select a student to inspect their details.`,
    "Review Student", [{ title: "Pending Students", rows }],
    "Lizzy • Student Verification", "Lecturer approval required"
  );
  const nav = [];
  if (safePage > 0) nav.push(makeButton(`admin_students_pending_page_${safePage - 1}`, "⬅ Previous"));
  if (data.length === 10) nav.push(makeButton(`admin_students_pending_page_${safePage + 1}`, "Next ➡"));
  nav.push(makeButton("admin_agent_menu", "🏠 Lizzy Menu"));
  await sendButtonMessage(phone, "Student verification pages:", nav);
}

async function reviewStudent(phone: string, studentIdInput: string): Promise<void> {
  const id = sanitizeId(studentIdInput);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    await sendTextMessage(phone, "⚠️ Invalid student reference."); return;
  }
  const { data: s, error } = await supabase.from("students")
    .select("id, name, matric_number, serial_number, department, level, phone, status")
    .eq("id", id).maybeSingle();
  if (error || !s) {
    safeErrorLog("reviewStudent", error);
    await sendTextMessage(phone, "⚠️ Student record not found."); return;
  }
  await sendTextMessage(phone,
    "🎓 *STUDENT IDENTITY REVIEW*\n\n" +
    `👤 Name: ${s.name || "—"}\n🎓 Matric No: ${s.matric_number || "—"}\n🔢 Class S/N: ${s.serial_number || "—"}\n🏫 Department: ${s.department || "—"}\n📚 Level: ${s.level || "—"}\n📱 WhatsApp: ${s.phone || "—"}\n\nStatus: *${s.status || "UNKNOWN"}*\n\nCompare these details with official class/student records before approval.`
  );
  if (String(s.status).toUpperCase() !== "PENDING") {
    await sendTextMessage(phone, "This student is not currently awaiting approval."); return;
  }
  await sendButtonMessage(phone, "Choose verification decision:", [
    makeButton(`admin_student_approve_${id}`, "✅ Approve Student"),
    makeButton(`admin_student_reject_${id}`, "⛔ Reject Student"),
    makeButton("admin_students_pending", "↩ Pending List"),
  ]);
}

async function decideStudent(phone: string, studentIdInput: string, decision: "APPROVE" | "REJECT", confirm: boolean): Promise<void> {
  const id = sanitizeId(studentIdInput);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    await sendTextMessage(phone, "⚠️ Invalid student reference."); return;
  }
  const { data: s, error } = await supabase.from("students")
    .select("id, name, matric_number, serial_number, department, level, phone, status")
    .eq("id", id).maybeSingle();
  if (error || !s || String(s.status).toUpperCase() !== "PENDING") {
    safeErrorLog("decideStudent.lookup", error);
    await sendTextMessage(phone, "⚠️ Student is not awaiting approval. No change was made."); return;
  }
  if (!confirm) {
    const approve = decision === "APPROVE";
    await sendTextMessage(phone,
      (approve ? "⚠️ *CONFIRM STUDENT APPROVAL*" : "⚠️ *CONFIRM STUDENT REJECTION*") +
      `\n\nStudent: *${s.name}*\nMatric No: *${s.matric_number}*\nClass S/N: *${s.serial_number}*\nDepartment: *${s.department}*\nLevel: *${s.level}L*\n\n` +
      (approve ? "Approval unlocks lectures and course materials." : "Rejection keeps this student locked out of lectures.")
    );
    await sendButtonMessage(phone, "Confirm verification decision:", [
      makeButton(`admin_student_${decision.toLowerCase()}_confirm_${id}`, approve ? "✅ Confirm Approval" : "⛔ Confirm Reject"),
      makeButton(`admin_student_review_${id}`, "↩ Back to Student"),
    ]);
    return;
  }
  const nextStatus = decision === "APPROVE" ? "ACTIVE" : "REJECTED";
  const { error: updateError } = await supabase.from("students")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "PENDING");
  if (updateError) {
    safeErrorLog("decideStudent.update", updateError);
    await sendTextMessage(phone, "❌ Verification update failed. Student remains pending."); return;
  }
  await sendTextMessage(phone, decision === "APPROVE"
    ? `✅ *STUDENT APPROVED*\n\n${s.name} (${s.matric_number}) may now enter lectures and course materials.`
    : `⛔ *STUDENT REJECTED*\n\n${s.name} (${s.matric_number}) remains locked out. Ask the student to contact the administrator.`);
  if (s.phone) await sendTextMessage(s.phone, decision === "APPROVE"
    ? "✅ *Your student identity has been verified.* Return to the Engr. Ero Learning Centre and enter your course code."
    : "⛔ *Your registration was not approved.* Please contact the Learning Centre administrator to correct your details.");
  await listPendingStudents(phone);
}

/* =========================================================
   SECURE ADMIN LEAD ASSISTANT HELPERS
   ========================================================= */

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9-]/g, "").trim();
}

/**
 * UUID-safe resolver for Leads (handles full UUIDs and short prefixes without crashing Postgres)
 */
async function findLeadByIdOrPrefix(leadId: string): Promise<any | null> {
  const clean = sanitizeId(leadId).toLowerCase();
  if (!clean) return null;

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);

  if (isUUID) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", clean)
      .maybeSingle();

    if (error) safeErrorLog("findLeadByIdOrPrefix.uuid", error);
    if (data) return data;
  }

  // Prefix lookup across recent leads
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) {
    if (error) safeErrorLog("findLeadByIdOrPrefix.prefix", error);
    return null;
  }

  const matched = data.find((l: any) => l.id.toLowerCase().startsWith(clean));
  return matched || null;
}

/**
 * UUID-safe resolver for Quotations
 */
async function findQuotationByIdOrPrefix(quoteId: string): Promise<any | null> {
  const clean = sanitizeId(quoteId).toLowerCase();
  if (!clean) return null;

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);

  if (isUUID) {
    const { data, error } = await supabase
      .from("quotations")
      .select("*, leads(business_name, service_type)")
      .eq("id", clean)
      .maybeSingle();

    if (error) safeErrorLog("findQuotationByIdOrPrefix.uuid", error);
    if (data) return data;
  }

  const { data, error } = await supabase
    .from("quotations")
    .select("*, leads(business_name, service_type)")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) {
    if (error) safeErrorLog("findQuotationByIdOrPrefix.prefix", error);
    return null;
  }

  const matched = data.find((q: any) => 
    q.id.toLowerCase().startsWith(clean) || 
    (q.quotation_number && q.quotation_number.toLowerCase().includes(clean))
  );
  return matched || null;
}

/**
 * Robust in-memory filtered leads listing that avoids PostgREST JSON arrow query bugs.
 */
async function listLeads(phone: string, filterType: "ALL" | "PENDING" | "APPROVED"): Promise<void> {
  const { data: allLeads, error } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(40);

  if (error || !allLeads) {
    safeErrorLog("listLeads", error);
    await sendTextMessage(phone, "⚠️ *Error retrieving lead records from Supabase.*");
    return;
  }

  if (allLeads.length === 0) {
    await sendTextMessage(phone, "ℹ️ *No leads found in database.*");
    await sendButtonMessage(
      phone,
      "What would you like to explore next?",
      [
        makeButton("admin_agent_menu", "🏠 Lizzy Menu"),
        makeButton("admin_stats", "📊 Bot Stats"),
      ]
    );
    return;
  }

  // Filter in memory for 100% reliable matching
  const qualifyingLeads = allLeads.filter((lead: any) => {
    const minPrice = Number(lead.estimated_min_price || 0);
    const isApproved = lead.requirements_json?.admin_approved === "true" || lead.requirements_json?.admin_approved === true;

    // Filter by approval state
    if (filterType === "PENDING" && isApproved) return false;
    if (filterType === "APPROVED" && !isApproved) return false;

    // Must meet the ₦100,000 threshold or be in active qualification
    return minPrice >= MIN_QUALIFYING_PRICE || minPrice === 0 || lead.status === "QUALIFYING" || lead.status === "QUOTED" || lead.status === "AGENT_REQUESTED";
  }).slice(0, 8);

  if (qualifyingLeads.length === 0) {
    await sendTextMessage(phone, `ℹ️ *No leads matching filter: ${filterType}* (Found ${allLeads.length} total lead records in database).`);
    await sendButtonMessage(
      phone,
      "Navigation:",
      [
        makeButton("admin_leads", "💼 All Leads"),
        makeButton("admin_agent_menu", "🏠 Lizzy Menu"),
      ]
    );
    return;
  }

  const listTitle = {
    ALL: "💼 *HIGH-VALUE BUSINESS ENQUIRIES*",
    PENDING: "⏳ *PENDING LEAD APPROVALS*",
    APPROVED: "✅ *APPROVED LEAD ARCHIVES*",
  }[filterType];

  const sections = [
    {
      title: "Select Lead to Inspect",
      rows: qualifyingLeads.map((lead: any) => {
        const isApproved = lead.requirements_json?.admin_approved === "true" || lead.requirements_json?.admin_approved === true;
        const approvalIcon = isApproved ? "🟢" : "⏳";
        const bizName = (lead.business_name || "Enquiry").substring(0, 18);
        const serviceLabel = (lead.service_type || "General").replace(/_/g, " ").substring(0, 12);
        const minPrice = Number(lead.estimated_min_price || 0);
        const priceLabel = minPrice > 0 ? formatNaira(minPrice) : "Estimate Pending";
        
        return makeListRow(
          `admin_inspect_${lead.id}`,
          `${approvalIcon} ${bizName}`,
          `${serviceLabel} • ${priceLabel}`
        );
      })
    }
  ];

  await sendListMessage(
    phone,
    `${listTitle}\n\nSelect a lead from the list below to assess detailed requirements and manage approval states securely.`,
    "Assess Lead",
    sections,
    "Lead Assistant Desk",
    `Threshold: >= ${formatNaira(MIN_QUALIFYING_PRICE)}`
  );
}

/**
 * Display secure details of a selected lead. Redacts customer PII before approval.
 */
async function showLeadDetails(phone: string, inputId: string): Promise<void> {
  const lead = await findLeadByIdOrPrefix(inputId);

  if (!lead) {
    await sendTextMessage(phone, `⚠️ Could not find a qualifying lead with ID matching: \`${inputId}\``);
    return;
  }

  const isApproved = lead.requirements_json?.admin_approved === "true" || lead.requirements_json?.admin_approved === true;
  const serviceLabel = (lead.service_type || "General Business").replace(/_/g, " ");
  const minPrice = Number(lead.estimated_min_price || 0);
  const maxPrice = Number(lead.estimated_max_price || 0);
  const estimateStr = minPrice > 0 ? `${formatNaira(minPrice)} - ${formatNaira(maxPrice)}` : "Estimate Pending Review";

  const details = [
    `💼 *LEAD FILE: \`${lead.id.substring(0, 8)}\`*`,
    `============================`,
    `*Business Name:* ${lead.business_name || "N/A"}`,
    `*Industry/Category:* ${lead.industry || "N/A"}`,
    `*Service Requested:* ${serviceLabel}`,
    `*Budget Range:* ${lead.budget_range || "N/A"}`,
    `*Verified Pricing Estimate:* ${estimateStr}`,
    `*Enquiry Date:* ${new Date(lead.created_at).toLocaleString()}`,
    `*Lead Status:* ${lead.status || "N/A"}`,
    `*System Approval Status:* ${isApproved ? "🟢 Approved" : "⏳ Pending Approval"}`,
    "",
    `*Captured Client Requirements:*`,
    `_${lead.requirements_json?.business_need || lead.requirements_json?.requirements || "Standard service requirements captured"}_`,
    "",
  ];

  if (isApproved) {
    let clientPhone = "N/A";
    let clientName = "Customer";

    if (lead.contact_id) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("*")
        .eq("id", lead.contact_id)
        .maybeSingle();

      if (contact) {
        clientName = contact.name || "Customer";
        clientPhone = contact.phone || "N/A";
      }
    }

    if (clientPhone === "N/A" && lead.requirements_json?.client_phone) {
      clientPhone = lead.requirements_json.client_phone;
    }

    details.push(
      `👤 *APPROVED CONTACT INFORMATION*`,
      `• *Client Name:* ${lead.requirements_json?.client_name || clientName}`,
      `• *Phone Number:* ${clientPhone}`,
      `• *Email Address:* ${lead.requirements_json?.client_email || "Not Provided"}`,
      "",
    );

    await sendTextMessage(phone, details.join("\n"));

    await sendButtonMessage(
      phone,
      "Select next step for this approved lead:",
      [
        makeButton(`admin_chat_link_${lead.id}`, "💬 Chat with Client"),
        makeButton("admin_leads", "💼 View Leads"),
        makeButton("admin_agent_menu", "🏠 Lizzy Menu"),
      ],
      "Lead Approved"
    );

    await logSalesEvent(phone, "CONTACT_DISCLOSURE_ACCESSED", lead.id, {
      admin_phone: phone,
      contact_id: lead.contact_id,
    });
  } else {
    details.push(
      "🔒 *CONTACT DETAILS REDACTED*",
      "Client PII is hidden until explicitly approved by the administrator.",
      "",
    );

    await sendTextMessage(phone, details.join("\n"));

    await sendButtonMessage(
      phone,
      "Select next step for this pending lead:",
      [
        makeButton(`admin_approve_prep_${lead.id}`, "✅ Approve Lead"),
        makeButton("admin_pending", "⏳ Pending List"),
        makeButton("admin_agent_menu", "🏠 Lizzy Menu"),
      ],
      "Lead Pending"
    );
  }
}

/**
 * Explicit two-step approval flow with interactive confirmation buttons.
 */
async function processLeadApproval(phone: string, inputId: string, isConfirm: boolean): Promise<void> {
  const lead = await findLeadByIdOrPrefix(inputId);

  if (!lead) {
    await sendTextMessage(phone, `⚠️ Lead lookup failed. Could not find lead matching: \`${inputId}\``);
    return;
  }

  const isApproved = lead.requirements_json?.admin_approved === "true" || lead.requirements_json?.admin_approved === true;
  if (isApproved) {
    await sendTextMessage(phone, `ℹ️ This lead is already approved.`);
    await showLeadDetails(phone, lead.id);
    return;
  }

  const minPrice = Number(lead.estimated_min_price || 0);

  if (!isConfirm) {
    // Stage 1: Confirmation prompt
    await sendTextMessage(phone, [
      `⏳ *CONFIRM LEAD APPROVAL*`,
      `----------------------------`,
      `You are requesting approval for lead ID: \`${lead.id.substring(0, 8)}\``,
      `*Business Name:* ${lead.business_name || "N/A"}`,
      `*Service:* ${lead.service_type || "N/A"}`,
      `*Estimate Range:* ${minPrice > 0 ? formatNaira(minPrice) : "Pending"}`,
      "",
      `⚠️ _Approving will reveal the client's phone number and email address, and log an audit trail._`,
    ].join("\n"));

    await sendButtonMessage(
      phone,
      "Do you want to confirm this approval?",
      [
        makeButton(`admin_approve_confirm_${lead.id}`, "✅ Confirm Approval"),
        makeButton("admin_agent_menu", "❌ Cancel"),
      ],
      "Explicit Confirmation"
    );
    return;
  }

  // Stage 2: Confirmed Approval Persisted to Database (Fail-Closed)
  try {
    const updatedRequirements = {
      ...(lead.requirements_json || {}),
      admin_approved: true,
      admin_approved_at: new Date().toISOString(),
      approved_by_admin: phone,
    };

    const { data: updatedLead, error: updateError } = await supabase
      .from("leads")
      .update({
        requirements_json: updatedRequirements,
        status: "AGENT_REQUESTED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id)
      .select("*")
      .single();

    if (updateError || !updatedLead) {
      if (updateError) safeErrorLog("processLeadApproval.persist", updateError);
      await sendTextMessage(phone, "❌ *Transaction Failed:* Could not save the approval record in the database. Contact details remain hidden.");
      return;
    }

    if (lead.contact_id) {
      await createAgentRequest(
        lead.contact_id,
        "QUOTATION",
        `Lead Approved by Admin Lizzy Interface`,
        "HIGH",
        lead.id,
        null,
        `Admin Phone: ${phone} approved Lead ID ${lead.id}.`
      );
    }

    await logSalesEvent(phone, "ADMIN_LEAD_APPROVED", lead.id, {
      admin_phone: phone,
      value_min: lead.estimated_min_price,
    });

    let clientPhone = "N/A";
    let clientName = "Customer";

    if (lead.contact_id) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("*")
        .eq("id", lead.contact_id)
        .maybeSingle();

      if (contact) {
        clientName = contact.name || "Customer";
        clientPhone = contact.phone || "N/A";
      }
    }

    if (clientPhone === "N/A" && lead.requirements_json?.client_phone) {
      clientPhone = lead.requirements_json.client_phone;
    }

    await sendTextMessage(phone, [
      `✅ *LEAD ID \`${lead.id.substring(0, 8)}\` APPROVED SUCCESSFULLY!*`,
      `----------------------------`,
      `*Client Name:* ${lead.requirements_json?.client_name || clientName}`,
      `*Phone Number:* ${clientPhone}`,
      `*Email Address:* ${lead.requirements_json?.client_email || "Not Provided"}`,
      "",
      `Audit records have been persisted successfully.`,
    ].join("\n"));

    await sendButtonMessage(
      phone,
      "What would you like to do next?",
      [
        makeButton(`admin_chat_link_${lead.id}`, "💬 Chat with Client"),
        makeButton("admin_leads", "💼 View Leads"),
        makeButton("admin_agent_menu", "🏠 Lizzy Menu"),
      ],
      "Lead Approved"
    );

  } catch (err) {
    safeErrorLog("processLeadApproval.catch", err);
    await sendTextMessage(phone, "❌ *Fatal Error:* An exception occurred during approval. Access to client PII denied.");
  }
}

/**
 * Chat with Client Link Generator.
 */
async function initializeClientChat(phone: string, inputId: string): Promise<void> {
  const lead = await findLeadByIdOrPrefix(inputId);

  if (!lead) {
    await sendTextMessage(phone, `⚠️ Could not find lead matching ID: \`${inputId}\``);
    return;
  }

  const isApproved = lead.requirements_json?.admin_approved === "true" || lead.requirements_json?.admin_approved === true;
  if (!isApproved) {
    await sendTextMessage(phone, `❌ *Access Denied:* You must approve this lead first before generating a client chat link.`);
    return;
  }

  let rawPhone = "";
  let clientName = "Customer";

  if (lead.contact_id) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", lead.contact_id)
      .maybeSingle();

    if (contact?.phone) {
      rawPhone = contact.phone;
      clientName = contact.name || "Customer";
    }
  }

  if (!rawPhone && lead.requirements_json?.client_phone) {
    rawPhone = lead.requirements_json.client_phone;
  }

  if (lead.requirements_json?.client_name) {
    clientName = lead.requirements_json.client_name;
  }

  const normalizedClientPhone = normalizePhone(rawPhone);
  if (!normalizedClientPhone || !/^\d{10,15}$/.test(normalizedClientPhone)) {
    await sendTextMessage(phone, `❌ *Error:* Client phone format is missing or invalid: "${rawPhone}"`);
    return;
  }

  const businessName = lead.business_name || "your business";
  const serviceLabel = (lead.service_type || "Services").replace(/_/g, " ").toLowerCase();

  const messageText = 
    `Hello ${clientName}, my name is Ero from Xtop Retail Technologies. ` +
    `Thank you for your enquiry about our ${serviceLabel} for *${businessName}*. ` +
    `I would like to understand your requirements better so that we can recommend the right solution ` +
    `and prepare an accurate quotation. Could you please confirm your key requirements and expected timeline?`;

  const encodedMessage = encodeURIComponent(messageText);
  const clickToChatUrl = `https://wa.me/${normalizedClientPhone}?text=${encodedMessage}`;

  await logSalesEvent(phone, "CHAT_LINK_GENERATED", lead.id, {
    admin_phone: phone,
    client_phone: normalizedClientPhone,
  });

  await sendTextMessage(phone, [
    `👤 *CHAT WITH CLIENT INITIALIZED*`,
    `----------------------------`,
    `*Client:* ${clientName}`,
    `*Business:* ${businessName}`,
    `*Number:* +${normalizedClientPhone}`,
    "",
    `🔗 *WhatsApp Direct Link:*`,
    clickToChatUrl,
    "",
    `⚠️ _Clicking the link will launch the WhatsApp chat on your device. Lizzy does not send this automatically. You can review and edit the text before sending._`,
  ].join("\n"));

  await sendButtonMessage(
    phone,
    "Navigation Actions:",
    [
      makeButton("admin_leads", "💼 View Leads"),
      makeButton("admin_agent_menu", "🏠 Lizzy Menu"),
    ]
  );
}

/* =========================================================
   QUOTATION MANAGEMENT MODULE
   ========================================================= */

async function listQuotations(phone: string): Promise<string> {
  const { data: quotes, error } = await supabase
    .from("quotations")
    .select("*, leads(business_name, service_type)")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error || !quotes) {
    if (error) safeErrorLog("listQuotations", error);
    return "⚠️ *Error retrieving quotation records from Supabase.*";
  }

  if (quotes.length === 0) {
    return "ℹ️ *No quotation records found in the database.*";
  }

  const lines = quotes.map((q: any) => {
    const biz = q.leads?.business_name || "N/A";
    const service = (q.leads?.service_type || "Project").replace(/_/g, " ");
    const quoteStatus = q.status || "DRAFT";
    const statusIcon = quoteStatus === "APPROVED" ? "🟢" : quoteStatus === "DRAFT" ? "⏳" : "🔵";

    return [
      `• *Ref:* \`${q.quotation_number}\``,
      `  *Business:* ${biz}`,
      `  *Project:* ${service}`,
      `  *Estimate:* ${formatNaira(q.min_price || 0)} - ${formatNaira(q.max_price || 0)}`,
      `  *Status:* ${statusIcon} ${quoteStatus}`,
      `  _To approve, send:_ \`quote_approve ${q.id}\``,
      "",
    ].join("\n");
  });

  return [
    "📋 *XTOP QUOTATION MANAGEMENT SYSTEM*",
    "--------------------------------------",
    ...lines,
  ].join("\n");
}

async function approveDraftQuotation(phone: string, inputId: string): Promise<string> {
  const quote = await findQuotationByIdOrPrefix(inputId);

  if (!quote) {
    return `⚠️ Quotation lookup failed. No quote matched: \`${inputId}\``;
  }

  if (quote.status === "APPROVED") {
    return `ℹ️ Quotation \`${quote.quotation_number}\` is already approved.`;
  }

  const { data: updatedQuote, error: updateError } = await supabase
    .from("quotations")
    .update({
      status: "APPROVED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", quote.id)
    .select("*")
    .single();

  if (updateError || !updatedQuote) {
    if (updateError) safeErrorLog("approveDraftQuotation.persist", updateError);
    return "❌ *Transaction Failed:* Could not write the quotation approval to the database.";
  }

  await logSalesEvent(phone, "ADMIN_QUOTATION_APPROVED", quote.lead_id, {
    admin_phone: phone,
    quotation_number: quote.quotation_number,
    quotation_id: quote.id,
  });

  return [
    `✅ *QUOTATION APPROVED SUCCESSFULLY*`,
    `----------------------------`,
    `*Ref Number:* \`${quote.quotation_number}\``,
    `*Business:* ${quote.leads?.business_name || "N/A"}`,
    `*Estimate Range:* ${formatNaira(quote.min_price || 0)} - ${formatNaira(quote.max_price || 0)}`,
    `*New Status:* 🟢 APPROVED`,
    "",
    "This quotation has been approved for dispatch to the client via the customer-facing interface.",
  ].join("\n");
}

/* =========================================================
   GITHUB READ-ONLY DIAGNOSTICS
   ========================================================= */

type GitHubRun = {
  id: number;
  name?: string | null;
  display_title?: string | null;
  run_number?: number;
  status?: string;
  conclusion?: string | null;
  html_url?: string;
  created_at?: string;
  updated_at?: string;
  head_branch?: string;
  event?: string;
};

type GitHubJob = {
  id: number;
  name?: string;
  conclusion?: string | null;
  status?: string;
  html_url?: string;
  steps?: Array<{
    name?: string;
    status?: string;
    conclusion?: string | null;
    number?: number;
  }>;
};

type GitHubResult<T> = {
  data?: T;
  error?: string;
};

function getGitHubConfig(): { token: string; owner: string; repo: string } | null {
  const token = (Deno.env.get("GITHUB_TOKEN") || "").trim();
  const owner = (Deno.env.get("GITHUB_OWNER") || "").trim();
  const repo = (Deno.env.get("GITHUB_REPO") || "").trim();

  if (!token || !owner || !repo) return null;

  return { token, owner, repo };
}

function githubHeaders(token: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };
}

function sanitizeGitHubMessage(value: unknown): string {
  if (typeof value !== "string") return "No readable message";
  return value.replace(/[\r\n\t]/g, " ").replace(/[^ -~]/g, "").slice(0, 160);
}

async function githubGet<T>(path: string): Promise<GitHubResult<T>> {
  const config = getGitHubConfig();

  if (!config) {
    console.error("[AdminAgent][GitHub] Missing configuration secret(s).");
    return {
      error: "Required GitHub secrets are missing. Check GITHUB_TOKEN, GITHUB_OWNER and GITHUB_REPO in Supabase.",
    };
  }

  if (!path.startsWith("/") || path.startsWith("//") || path.includes("://")) {
    console.error("[AdminAgent][GitHub] Rejected invalid API path.");
    return { error: "Invalid GitHub API path." };
  }

  const normalizedPath = path === "/" ? "" : path;
  const url = `${GITHUB_API}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}${normalizedPath}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: githubHeaders(config.token),
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      let githubMessage = "No readable error message";

      try {
        const body = await response.json();
        githubMessage = sanitizeGitHubMessage(body?.message);
      } catch {
        // Keep fallback
      }

      const requestId = response.headers.get("x-github-request-id") || "not provided";
      console.error("[AdminAgent][GitHub] Request failed", {
        status: response.status,
        owner: config.owner,
        repo: config.repo,
        path: normalizedPath || "/",
        githubMessage,
        requestId,
      });

      const diagnostic = `HTTP ${response.status} | path: ${normalizedPath || "/"} | GitHub: ${githubMessage} | request ID: ${requestId}`;

      if (response.status === 401) {
        return { error: `GitHub rejected the token. ${diagnostic}. Verify that GITHUB_TOKEN is the correct active token.` };
      }
      if (response.status === 403) {
        return { error: `GitHub denied access. ${diagnostic}. Check token permissions or rate limits.` };
      }
      if (response.status === 404) {
        return { error: `GitHub could not find repository. ${diagnostic}. Check GITHUB_OWNER and GITHUB_REPO.` };
      }
      if (response.status === 429) {
        return { error: `GitHub rate limit reached. ${diagnostic}. Try again later.` };
      }

      return { error: `GitHub API request failed. ${diagnostic}.` };
    }

    return { data: await response.json() as T };
  } catch (error) {
    const safeMessage = error instanceof Error ? sanitizeGitHubMessage(error.message) : "Unknown network error";
    console.error("[AdminAgent][GitHub] Network request failed", {
      owner: config.owner,
      repo: config.repo,
      path: normalizedPath || "/",
      message: safeMessage,
    });

    return { error: `Could not reach GitHub API. Path: ${normalizedPath || "/"}. Error: ${safeMessage}.` };
  }
}

async function checkGitHubConnection(): Promise<string> {
  const config = getGitHubConfig();

  if (!config) {
    return [
      "⚠️ *GITHUB NOT CONFIGURED*",
      "",
      "One or more GitHub secrets are missing.",
      "Required: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO.",
    ].join("\n");
  }

  const result = await githubGet<{
    full_name?: string;
    private?: boolean;
    default_branch?: string;
    html_url?: string;
  }>("/");

  if (result.error || !result.data) {
    return [
      "🔴 *GITHUB CONNECTION FAILED*",
      "",
      result.error || "GitHub returned no repository information.",
    ].join("\n");
  }

  return [
    "🟢 *GITHUB CONNECTION PASSED*",
    "",
    `Repository: ${result.data.full_name || `${config.owner}/${config.repo}`}`,
    `Default branch: ${result.data.default_branch || "Not reported"}`,
    `Visibility: ${result.data.private ? "Private" : "Public"}`,
    "",
    result.data.html_url || "",
  ].filter(Boolean).join("\n");
}

async function getRecentDeployments(): Promise<string> {
  const result = await githubGet<{
    total_count?: number;
    workflow_runs?: GitHubRun[];
  }>("/actions/runs?per_page=5");

  if (result.error || !result.data) {
    return [
      "⚠️ *COULD NOT READ GITHUB WORKFLOW RUNS*",
      "",
      result.error || "GitHub returned no data.",
    ].join("\n");
  }

  const runs = result.data.workflow_runs || [];

  if (!runs.length) {
    return ["ℹ️ *NO WORKFLOW RUNS RETURNED*"];
  }

  const lines = runs.map((run, index) => {
    const title = (run.name || run.display_title || "Workflow").replace(/[\r\n]/g, " ").slice(0, 90);
    const conclusion = run.conclusion || run.status || "unknown";
    const icon = conclusion === "success" ? "🟢" : conclusion === "failure" ? "🔴" : conclusion === "cancelled" ? "⚪" : "🟡";

    return [
      `${index + 1}. ${icon} *${title}*`,
      `   Run ID: ${run.id}`,
      `   Result: ${conclusion}`,
      `   Branch: ${run.head_branch || "unknown"}`,
      run.html_url ? `   ${run.html_url}` : "",
    ].filter(Boolean).join("\n");
  });

  return [
    "🚀 *RECENT GITHUB WORKFLOW RUNS*",
    "",
    ...lines,
  ].join("\n");
}

async function inspectWorkflowRun(runIdInput?: string): Promise<string> {
  if (runIdInput && (!/^\d+$/.test(runIdInput) || runIdInput.length > 20)) {
    return "Invalid run ID. Use `logs` or `logs RUN_ID` with a numeric GitHub Actions run ID.";
  }

  let runId = runIdInput ? Number(runIdInput) : 0;
  let selectedRun: GitHubRun | undefined;

  if (!runId) {
    const result = await githubGet<{ workflow_runs?: GitHubRun[] }>("/actions/runs?per_page=10");
    if (result.error || !result.data) return "⚠️ *Could not fetch latest runs.*";

    const runs = result.data.workflow_runs || [];
    selectedRun = runs.find((run) => run.conclusion === "failure" || run.conclusion === "cancelled") || runs[0];
    if (!selectedRun) return "No runs returned.";
    runId = selectedRun.id;
  }

  const jobsResult = await githubGet<{ jobs?: GitHubJob[] }>(`/actions/runs/${runId}/jobs?per_page=30`);
  if (jobsResult.error || !jobsResult.data) return "⚠️ *Could not fetch job info.*";

  const jobs = jobsResult.data.jobs || [];
  const lines: string[] = [];

  for (const job of jobs.slice(0, 10)) {
    const conclusion = job.conclusion || job.status || "unknown";
    const icon = conclusion === "success" ? "🟢" : conclusion === "failure" ? "🔴" : "🟡";

    lines.push(`${icon} *${(job.name || "Job").slice(0, 100)}*`);
    const failedSteps = (job.steps || []).filter((s) => s.conclusion === "failure");

    for (const step of failedSteps.slice(0, 5)) {
      lines.push(`   ❌ Failed: ${(step.name || "Step").slice(0, 120)}`);
    }
  }

  const config = getGitHubConfig();
  const runUrl = selectedRun?.html_url || (config ? `https://github.com/${config.owner}/${config.repo}/actions/runs/${runId}` : "");

  return [
    "🔎 *GITHUB ACTIONS DIAGNOSTIC*",
    "",
    `Run ID: ${runId}`,
    ...lines,
    "",
    runUrl,
  ].join("\n");
}

/* =========================================================
   AI ADVISER
   ========================================================= */

async function askAdminAI(phone: string, question: string): Promise<void> {
  if (!Deno.env.get("AI_API_KEY")) {
    await sendTextMessage(phone, "AI advice is not configured. Set the AI_API_KEY secret in Supabase.");
    return;
  }

  const systemPrompt = `
You are Lizzy, the private technical and business adviser for the administrator of Xtop Retail Technologies.
Be practical, concise, honest, and security-conscious.
You can advise on TypeScript, Deno, Supabase, WhatsApp API, GitHub, debugging, and business operations.
`;

  try {
    const answer = await callAI(systemPrompt, question, [], { temperature: 0.2, maxTokens: 500 });
    await sendTextMessage(phone, `🤖 *LIZZY — ADMIN ADVISER*\n\n${answer}`);
    await sendButtonMessage(phone, "What would you like to do next?", [
      makeButton("admin_agent_menu", "📋 Open Lizzy Menu"),
      makeButton("admin_agent_advice", "💬 Ask Another Question"),
      makeButton("admin_agent_exit", "🔒 Exit Lizzy"),
    ]);
  } catch (error) {
    console.error("[AdminAgent] AI error:", error);
    await sendTextMessage(phone, "I couldn't complete that advice request. Please try again later.");
  }
}

/* =========================================================
   COMMAND ROUTER (HYBRID: LISTS + BUTTONS + TEXT COMMANDS)
   ========================================================= */

export async function handleAdminAgent(
  phone: string,
  text: string,
  interactiveId: string,
  conversationId: string,
  isSystem: boolean,
): Promise<void> {
  const inputRaw = (interactiveId || text).trim();
  const command = inputRaw.toLowerCase();

  // Guard: Validate requester is authorized admin
  if (!hasSuperAdminAccess(phone, isSystem)) {
    console.warn(`[AdminAgent] Unauthorized access attempt blocked from: ${phone}`);
    return;
  }

  if (command.startsWith("admin_roster_pdf_student_")) {
    await downloadIndividualResult(phone, inputRaw.slice("admin_roster_pdf_student_".length)); return;
  }
  if (command.startsWith("admin_roster_pdf_")) {
    await downloadDepartmentResults(phone, inputRaw.slice("admin_roster_pdf_".length)); return;
  }

  if (command === "admin_student_records" || command === "student records" || command === "class register") {
    await listStudentDepartments(phone); return;
  }
  if (command.startsWith("admin_roster_department_")) {
    await listDepartmentStudents(phone, inputRaw.slice("admin_roster_department_".length), 0); return;
  }
  if (command.startsWith("admin_roster_page_")) {
    const payload = inputRaw.slice("admin_roster_page_".length);
    const splitAt = payload.lastIndexOf("_");
    const departmentPart = payload.slice(0, splitAt);
    const page = Number.parseInt(payload.slice(splitAt + 1), 10);
    await listDepartmentStudents(phone, departmentPart, Number.isFinite(page) ? page : 0); return;
  }
  if (command.startsWith("admin_roster_student_")) {
    const payload = inputRaw.slice("admin_roster_student_".length);
    const studentId = payload.slice(0, 36);
    const rest = payload.slice(37);
    const lastSep = rest.lastIndexOf("_");
    const department = lastSep >= 0 ? rest.slice(0, lastSep) : "";
    const page = lastSep >= 0 ? rest.slice(lastSep + 1) : "0";
    await showStudentAcademicRecord(phone, studentId, department, page); return;
  }

  if (command === "admin_students_pending" || command === "student verification") {
    await listPendingStudents(phone, 0); return;
  }
  if (command.startsWith("admin_students_pending_page_")) {
    const page = Number.parseInt(inputRaw.slice("admin_students_pending_page_".length), 10);
    await listPendingStudents(phone, Number.isFinite(page) ? page : 0); return;
  }
  if (command.startsWith("admin_student_review_")) {
    await reviewStudent(phone, inputRaw.slice("admin_student_review_".length)); return;
  }
  if (command.startsWith("admin_student_approve_confirm_")) {
    await decideStudent(phone, inputRaw.slice("admin_student_approve_confirm_".length), "APPROVE", true); return;
  }
  if (command.startsWith("admin_student_reject_confirm_")) {
    await decideStudent(phone, inputRaw.slice("admin_student_reject_confirm_".length), "REJECT", true); return;
  }
  if (command.startsWith("admin_student_approve_")) {
    await decideStudent(phone, inputRaw.slice("admin_student_approve_".length), "APPROVE", false); return;
  }
  if (command.startsWith("admin_student_reject_")) {
    await decideStudent(phone, inputRaw.slice("admin_student_reject_".length), "REJECT", false); return;
  }

  if (["exit", "quit", "close", "admin_agent_exit"].includes(command)) {
    await updateConversation(conversationId, {
      current_module: "MAIN_MENU",
      current_state: "IDLE",
      context_json: {},
    });

    await sendTextMessage(phone, "🔒 Private admin assistant closed.\n\nType *menu* to return to the public menu.");
    return;
  }

  if (command === "admin_agent_menu_page_0" || command === "admin_agent_menu_page_1" || command === "admin_agent_menu_page_2") {
    const page = Number.parseInt(command.slice("admin_agent_menu_page_".length), 10);
    await showAdminAgentMenu(phone, Number.isFinite(page) ? page : 0);
    return;
  }

  if (["menu", "help", "admin_agent_open", "admin_agent_menu", "0"].includes(command)) {
    await showAdminAgentMenu(phone, 0);
    return;
  }

  if (["admin_sabi_overview", "sabi", "sabi overview", "platform overview"].includes(command)) {
    await sendTextMessage(phone, "Reading Sabi by XTOP platform metrics...");
    await sendTextMessage(phone, await getSabiPlatformOverview(phone, isSystem));
    await sendButtonMessage(phone, "Sabi platform:", [
      makeButton("admin_sabi_merchants", "🏪 Merchants"),
      makeButton("admin_agent_menu", "🏠 Lizzy Menu"),
    ]);
    return;
  }

  if (command.startsWith("admin_sabi_merchants_page_")) {
    const page = Number.parseInt(inputRaw.slice("admin_sabi_merchants_page_".length), 10);
    await listSabiMerchants(phone, isSystem, Number.isFinite(page) ? page : 0);
    return;
  }

  if (["admin_sabi_merchants", "sabi merchants", "merchant directory"].includes(command)) {
    await listSabiMerchants(phone, isSystem);
    await sendButtonMessage(phone, "Sabi platform:", [
      makeButton("admin_sabi_overview", "📊 Overview"),
      makeButton("admin_agent_menu", "🏠 Lizzy Menu"),
    ]);
    return;
  }


  if (command === "admin_sabi_live_payout_help") {
    await sendTextMessage(phone, [
      "🔍 *LIVE PAYSTACK SUBACCOUNT CHECK*",
      "",
      "Send: verify payout <merchant UUID>",
      "",
      "Lizzy will query Paystack directly and report the current verification state. This is read-only; it cannot initiate a transfer or change bank details.",
    ].join("\n"));
    return;
  }

  if (command.startsWith("verify payout ")) {
    await checkLivePaystackSubaccount(phone, isSystem, inputRaw.slice("verify payout ".length).trim());
    return;
  }

  if (command === "admin_sabi_payout_reconciliation" || command === "sabi payouts" || command === "payout reconciliation") {
    await showSabiPayoutReconciliation(phone, isSystem);
    return;
  }

  if (command === "admin_sabi_audit_log" || command === "admin activity log" || command === "audit log") {
    await showSabiAdminActivityLog(phone, isSystem, 0);
    return;
  }

  if (command.startsWith("admin_sabi_audit_page_")) {
    const page = Number.parseInt(inputRaw.slice("admin_sabi_audit_page_".length), 10);
    await showSabiAdminActivityLog(phone, isSystem, Number.isFinite(page) ? page : 0);
    return;
  }

  if (command === "admin_sabi_orders_payments" || command === "sabi payments" || command === "sabi orders") {
    await showSabiOrdersAndPayments(phone, isSystem);
    return;
  }

  if (command === "admin_sabi_status_help") {
    await sendTextMessage(phone, [
      "🛡️ *MERCHANT STATUS CONTROLS*",
      "",
      "Suspend: suspend merchant <UUID>",
      "Reactivate: reactivate merchant <UUID>",
      "",
      "Lizzy will show the merchant and request confirmation. Confirmations expire after 5 minutes.",
      "Every completed change is audited. Merchant records are preserved.",
    ].join("\n"));
    return;
  }

  if (command.startsWith("admin_sabi_status_confirm_")) {
    await confirmMerchantStatusChange(
      phone, isSystem, conversationId,
      inputRaw.slice("admin_sabi_status_confirm_".length),
    );
    return;
  }

  if (command === "admin_sabi_status_cancel") {
    await cancelMerchantStatusChange(phone, isSystem, conversationId);
    return;
  }

  if (command.startsWith("suspend merchant ")) {
    await requestMerchantStatusChange(
      phone, isSystem, conversationId,
      inputRaw.slice("suspend merchant ".length).trim(), false,
    );
    return;
  }

  if (command.startsWith("reactivate merchant ")) {
    await requestMerchantStatusChange(
      phone, isSystem, conversationId,
      inputRaw.slice("reactivate merchant ".length).trim(), true,
    );
    return;
  }

  if (command === "admin_sabi_merchant_help") {
    await sendTextMessage(phone, "🔎 *MERCHANT PROFILE LOOKUP*\\n\\nSend: merchant Business Name\\nOr: merchant <merchant UUID>\\n\\nExample: merchant XTOP Retail");
    return;
  }

  if (command.startsWith("merchant ")) {
    await showSabiMerchantDetails(phone, isSystem, inputRaw.slice(9));
    return;
  }


  if (command === "admin_ela301_controls" || command === "ela301 controls" || command === "ela301 publish") {
    await showELA301PublishControls(phone); return;
  }
  if (command.startsWith("admin_ela301_action_confirm_")) {
    const action = inputRaw.slice("admin_ela301_action_confirm_".length);
    await applyELA301CourseAction(phone, action); return;
  }
  if (command.startsWith("admin_ela301_action_")) {
    const action = inputRaw.slice("admin_ela301_action_".length);
    await requestELA301CourseAction(phone, action); return;
  }

  if (command === "admin_ela301_lessons" || command === "ela301 lessons" || command === "ela301 lesson review") {
    await listELA301LessonModules(phone, 0);
    return;
  }
  if (command.startsWith("admin_ela301_lesson_page_")) {
    const page = Number.parseInt(inputRaw.slice("admin_ela301_lesson_page_".length), 10);
    await listELA301LessonModules(phone, Number.isFinite(page) ? page : 0);
    return;
  }
  if (command.startsWith("admin_ela301_lesson_approve_confirm_")) {
    await decideELA301Lesson(phone, inputRaw.slice("admin_ela301_lesson_approve_confirm_".length), "APPROVE", true);
    return;
  }
  if (command.startsWith("admin_ela301_lesson_reject_confirm_")) {
    await decideELA301Lesson(phone, inputRaw.slice("admin_ela301_lesson_reject_confirm_".length), "REJECT", true);
    return;
  }
  if (command.startsWith("admin_ela301_lesson_approve_")) {
    await decideELA301Lesson(phone, inputRaw.slice("admin_ela301_lesson_approve_".length), "APPROVE", false);
    return;
  }
  if (command.startsWith("admin_ela301_lesson_reject_")) {
    await decideELA301Lesson(phone, inputRaw.slice("admin_ela301_lesson_reject_".length), "REJECT", false);
    return;
  }
  if (command.startsWith("admin_ela301_lesson_module_")) {
    await showELA301LessonModule(phone, inputRaw.slice("admin_ela301_lesson_module_".length));
    return;
  }
  if (command.startsWith("admin_ela301_lesson_item_")) {
    await showELA301Lesson(phone, inputRaw.slice("admin_ela301_lesson_item_".length));
    return;
  }

  if (command === "admin_ela301_questions" || command === "ela301 questions" || command === "ela301 review") {
    await listELA301QuestionQueue(phone, 0);
    return;
  }
  if (command.startsWith("admin_ela301_q_page_")) {
    const page = Number.parseInt(inputRaw.slice("admin_ela301_q_page_".length), 10);
    await listELA301QuestionQueue(phone, Number.isFinite(page) ? page : 0);
    return;
  }
  if (command.startsWith("admin_ela301_q_approve_confirm_")) {
    await decideELA301Question(phone, inputRaw.slice("admin_ela301_q_approve_confirm_".length), "APPROVE", true);
    return;
  }
  if (command.startsWith("admin_ela301_q_reject_confirm_")) {
    await decideELA301Question(phone, inputRaw.slice("admin_ela301_q_reject_confirm_".length), "REJECT", true);
    return;
  }
  if (command.startsWith("admin_ela301_q_approve_")) {
    await decideELA301Question(phone, inputRaw.slice("admin_ela301_q_approve_".length), "APPROVE", false);
    return;
  }
  if (command.startsWith("admin_ela301_q_reject_")) {
    await decideELA301Question(phone, inputRaw.slice("admin_ela301_q_reject_".length), "REJECT", false);
    return;
  }
  if (command.startsWith("admin_ela301_q_")) {
    await showELA301Question(phone, inputRaw.slice("admin_ela301_q_".length));
    return;
  }

  if (command.startsWith("admin_learning_page_")) {
    const page = Number.parseInt(command.slice("admin_learning_page_".length), 10);
    await listLearningModules(phone, Number.isFinite(page) ? page : 0);
    return;
  }

  if (command.startsWith("admin_learning_module_")) {
    const moduleId = inputRaw.slice("admin_learning_module_".length).trim();
    await showLearningModule(phone, moduleId);
    return;
  }

  if (command.startsWith("admin_learning_approve_confirm_")) {
    await handleLearningDecision(phone, inputRaw.slice("admin_learning_approve_confirm_".length), "APPROVE", true);
    return;
  }

  if (command.startsWith("admin_learning_reject_confirm_")) {
    await handleLearningDecision(phone, inputRaw.slice("admin_learning_reject_confirm_".length), "REJECT", true);
    return;
  }

  if (command.startsWith("admin_learning_approve_")) {
    await handleLearningDecision(phone, inputRaw.slice("admin_learning_approve_".length), "APPROVE", false);
    return;
  }

  if (command.startsWith("admin_learning_reject_")) {
    await handleLearningDecision(phone, inputRaw.slice("admin_learning_reject_".length), "REJECT", false);
    return;
  }

  if (command.startsWith("admin_learning_lesson_")) {
    const lessonId = inputRaw.slice("admin_learning_lesson_".length).trim();
    await showLearningLesson(phone, lessonId);
    return;
  }

  if (["admin_learning", "learning", "learning progress", "course progress", "ela401"].includes(command)) {
    await sendTextMessage(phone, "Checking Engr. Ero Learning Centre records...");
    await sendTextMessage(phone, await getLearningCentreProgress());
    await listLearningModules(phone, 0);
    return;
  }

  // ── 1. DIAGNOSTICS & SYSTEM CHECKS ──
  if (["admin_status", "status", "health", "check status", "admin_agent_status"].includes(command)) {
    await sendTextMessage(phone, "Checking database connectivity...");
    await sendTextMessage(phone, await checkBotStatus());
    await sendButtonMessage(
      phone,
      "Diagnostics Navigation:",
      [
        makeButton("admin_stats", "📊 Stats"),
        makeButton("admin_agent_menu", "🏠 Menu"),
      ]
    );
    return;
  }

  if (["admin_stats", "stats", "statistics", "admin_agent_stats"].includes(command)) {
    await sendTextMessage(phone, "Reading available bot statistics...");
    await sendTextMessage(phone, await getBotStats());
    await sendButtonMessage(
      phone,
      "Diagnostics Navigation:",
      [
        makeButton("admin_leads", "💼 View Leads"),
        makeButton("admin_agent_menu", "🏠 Menu"),
      ]
    );
    return;
  }

  if (["admin_github", "github", "github status", "github check"].includes(command)) {
    await sendTextMessage(phone, "Checking GitHub read-only connection...");
    await sendTextMessage(phone, await checkGitHubConnection());
    return;
  }

  if (["admin_deployments", "deployments", "deployment", "runs", "workflow runs"].includes(command)) {
    await sendTextMessage(phone, "Reading recent GitHub Actions runs...");
    await sendTextMessage(phone, await getRecentDeployments());
    return;
  }

  if (command === "admin_logs" || command === "logs" || command.startsWith("logs ")) {
    const runId = command.startsWith("logs ") ? command.slice(5).trim() : undefined;
    await sendTextMessage(phone, "Inspecting jobs and failed steps...");
    await sendTextMessage(phone, await inspectWorkflowRun(runId));
    return;
  }

  // ── 2. SECURE LEAD ASSISTANT COMMANDS ──
  if (command === "admin_leads" || command === "leads") {
    await listLeads(phone, "ALL");
    return;
  }

  if (command === "admin_pending" || command === "pending") {
    await listLeads(phone, "PENDING");
    return;
  }

  if (command === "admin_approved" || command === "approved") {
    await listLeads(phone, "APPROVED");
    return;
  }

  // Handle dynamic list inspect clicks (from interactive list)
  if (command.startsWith("admin_inspect_")) {
    const leadId = inputRaw.substring("admin_inspect_".length).trim();
    await sendTextMessage(phone, "Retrieving lead details...");
    await showLeadDetails(phone, leadId);
    return;
  }

  if (command.startsWith("lead ")) {
    const leadId = inputRaw.slice(5).trim();
    await sendTextMessage(phone, "Retrieving lead details...");
    await showLeadDetails(phone, leadId);
    return;
  }

  // Dynamic interactive button triggers
  if (command.startsWith("admin_approve_prep_")) {
    const leadId = inputRaw.substring("admin_approve_prep_".length).trim();
    await sendTextMessage(phone, "Preparing lead approval...");
    await processLeadApproval(phone, leadId, false);
    return;
  }

  if (command.startsWith("admin_approve_confirm_")) {
    const leadId = inputRaw.substring("admin_approve_confirm_".length).trim();
    await sendTextMessage(phone, "Processing lead approval confirmation...");
    await processLeadApproval(phone, leadId, true);
    return;
  }

  if (command.startsWith("admin_chat_link_")) {
    const leadId = inputRaw.substring("admin_chat_link_".length).trim();
    await sendTextMessage(phone, "Initializing secure chat with client link...");
    await initializeClientChat(phone, leadId);
    return;
  }

  // Two-step text approval parsing
  if (command.startsWith("approve confirm ")) {
    const leadId = inputRaw.slice(16).trim();
    await sendTextMessage(phone, "Processing lead approval confirmation...");
    await processLeadApproval(phone, leadId, true);
    return;
  }

  if (command.startsWith("approve ")) {
    const leadId = inputRaw.slice(8).trim();
    await sendTextMessage(phone, "Preparing lead approval...");
    await processLeadApproval(phone, leadId, false);
    return;
  }

  if (command.startsWith("chat ")) {
    const leadId = inputRaw.slice(5).trim();
    await sendTextMessage(phone, "Initializing secure chat with client link...");
    await initializeClientChat(phone, leadId);
    return;
  }

  // ── 3. QUOTATION TRACKING COMMANDS ──
  if (command === "admin_quotes" || command === "quotes") {
    await sendTextMessage(phone, "Loading quotation management files...");
    await sendTextMessage(phone, await listQuotations(phone));
    return;
  }

  if (command.startsWith("quote_approve ")) {
    const quoteId = inputRaw.slice(14).trim();
    await sendTextMessage(phone, "Processing quotation approval...");
    await sendTextMessage(phone, await approveDraftQuotation(phone, quoteId));
    return;
  }

  if (command === "advice" || command === "admin_agent_advice") {
    await sendTextMessage(phone, "Type your question after advice.\n\nExample: `advice How to fix a timeout`");
    return;
  }

  if (command.startsWith("advice ")) {
    const question = inputRaw.slice(7).trim();
    if (!question) {
      await sendTextMessage(phone, "Please provide a question after advice.");
      return;
    }
    await askAdminAI(phone, question);
    return;
  }

  // Treat unrecognized text as generic advice requests
  await askAdminAI(phone, inputRaw);
}
