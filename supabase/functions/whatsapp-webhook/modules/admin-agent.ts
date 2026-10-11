// supabase/functions/whatsapp-webhook/modules/admin-agent.ts
// Private technical, diagnostic, and secure Lead Assistant (Lizzy)
// Enforces strict verification checks, ₦100k minimum qualifying threshold,
// redacted customer PII, explicit two-step approvals, and robust auditing.
// Fully button, list-menu, and text-command driven for mobile efficiency.

import {
  getSupabaseClient,
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
 * Exactly 10 rows total, fitting WhatsApp Cloud API constraints perfectly.
 */
export async function showAdminAgentMenu(phone: string): Promise<void> {
  const body =
    "🔐 *XTOP PRIVATE ADMIN ASSISTANT (LIZZY)*\n\n" +
    "Welcome, Authorized Admin.\n\n" +
    "Use the interactive menu below to assess high-value leads, approve client details, " +
    "track quotations, check system health, or consult the AI advisory engine.";

  const sections = [
    {
      title: "💼 Lead & Quote Desk",
      rows: [
        makeListRow("admin_leads", "💼 List Leads", "Qualifying enquiries (>= ₦100k)"),
        makeListRow("admin_pending", "⏳ Pending Approvals", "Leads awaiting admin approval"),
        makeListRow("admin_approved", "✅ Approved Archives", "Explicitly approved leads list"),
        makeListRow("admin_quotes", "📋 Quotations", "Manage, prepare, and track quotes"),
      ],
    },
    {
      title: "⚙️ System Diagnostics",
      rows: [
        makeListRow("admin_status", "🟢 DB Connectivity", "Test connection to Supabase database"),
        makeListRow("admin_stats", "📊 Bot Statistics", "View messaging and contacts metrics"),
        makeListRow("admin_github", "🚗 GitHub Actions API", "Verify Actions integration connectivity"),
        makeListRow("admin_deployments", "🚀 Recent Runs", "Inspect workflow execution logs"),
        makeListRow("admin_logs", "🔎 Workflow Failures", "Inspect recent failing job steps"),
      ],
    },
    {
      title: "🔒 Security Actions",
      rows: [
        makeListRow("admin_agent_exit", "🔒 Close Lizzy", "Close private agent session"),
      ],
    },
  ];

  await sendListMessage(
    phone,
    body,
    "Select Action",
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
    supabase.from("leads").select("id", { count: "exact", head: true }).gte("estimated_min_price", MIN_QUALIFYING_PRICE),
  ]);

  const labels = [
    "Contacts",
    "Messages",
    "Bot orders",
    "Pending agent requests",
    "High-value Leads",
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
    return data;
  }

  // Prefix lookup (in-memory match to avoid illegal SQL uuid ilike errors)
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
    return data;
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
 * Filter and format leads into an interactive WhatsApp list.
 */
async function listLeads(phone: string, filterType: "ALL" | "PENDING" | "APPROVED"): Promise<void> {
  let query = supabase.from("leads").select("*");

  if (filterType === "PENDING") {
    query = query.or("requirements_json->admin_approved.eq.false,requirements_json->admin_approved.is.null");
  } else if (filterType === "APPROVED") {
    query = query.eq("requirements_json->admin_approved", "true");
  }

  const { data: leads, error } = await query
    .gte("estimated_min_price", MIN_QUALIFYING_PRICE)
    .order("created_at", { ascending: false })
    .limit(8);

  if (error || !leads) {
    safeErrorLog("listLeads", error);
    await sendTextMessage(phone, "⚠️ *Error retrieving lead records from Supabase.*");
    return;
  }

  if (leads.length === 0) {
    await sendTextMessage(phone, `ℹ️ *No qualifying leads found matching filter: ${filterType}*`);
    await sendButtonMessage(
      phone,
      "What would you like to explore next?",
      [
        makeButton("admin_agent_menu", "🏠 Lizzy Menu"),
        makeButton("admin_leads", "💼 All Leads"),
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
      rows: leads.map((lead) => {
        const isApproved = lead.requirements_json?.admin_approved === "true" || lead.requirements_json?.admin_approved === true;
        const approvalIcon = isApproved ? "🟢" : "⏳";
        const serviceLabel = (lead.service_type || "General").replace(/_/g, " ").substring(0, 12);
        
        return makeListRow(
          `admin_inspect_${lead.id}`,
          `${approvalIcon} ${lead.business_name?.substring(0, 18) || "No Name"}`,
          `${serviceLabel} • ${formatNaira(lead.estimated_min_price || 0)}`
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
 * Dynamically renders action buttons depending on approval state.
 */
async function showLeadDetails(phone: string, inputId: string): Promise<void> {
  const lead = await findLeadByIdOrPrefix(inputId);

  if (!lead) {
    await sendTextMessage(phone, `⚠️ Could not find a qualifying lead with ID matching: \`${inputId}\``);
    return;
  }

  const isApproved = lead.requirements_json?.admin_approved === "true" || lead.requirements_json?.admin_approved === true;
  const serviceLabel = (lead.service_type || "General Business").replace(/_/g, " ");

  const details = [
    `💼 *LEAD FILE: \`${lead.id.substring(0, 8)}\`*`,
    `============================`,
    `*Business Name:* ${lead.business_name || "N/A"}`,
    `*Industry/Category:* ${lead.industry || "N/A"}`,
    `*Service Requested:* ${serviceLabel}`,
    `*Budget Range:* ${lead.budget_range || "N/A"}`,
    `*Verified Pricing Estimate:* ${formatNaira(lead.estimated_min_price || 0)} - ${formatNaira(lead.estimated_max_price || 0)}`,
    `*Enquiry Date:* ${new Date(lead.created_at).toLocaleString()}`,
    `*Lead Status:* ${lead.status || "N/A"}`,
    `*System Approval Status:* ${isApproved ? "🟢 Approved" : "⏳ Pending Approval"}`,
    "",
    `*Captured Client Requirements:*`,
    `_${lead.requirements_json?.business_need || lead.requirements_json?.requirements || "No custom requirements summary available"}_`,
    "",
  ];

  if (isApproved) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", lead.contact_id)
      .maybeSingle();

    details.push(
      `👤 *APPROVED CONTACT INFORMATION*`,
      `• *Client Name:* ${contact?.name || "Customer"}`,
      `• *Phone Number:* ${contact?.phone || "N/A"}`,
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

  const minPrice = lead.estimated_min_price || 0;
  if (minPrice < MIN_QUALIFYING_PRICE) {
    await sendTextMessage(
      phone,
      `❌ *Lead Not Eligible for Private Assistant.* \n\n` +
      `The verified estimate is ${formatNaira(minPrice)}, which is below the minimum qualifying threshold of ${formatNaira(MIN_QUALIFYING_PRICE)}.`
    );
    return;
  }

  const isApproved = lead.requirements_json?.admin_approved === "true" || lead.requirements_json?.admin_approved === true;
  if (isApproved) {
    await sendTextMessage(phone, `ℹ️ This lead is already approved.`);
    await showLeadDetails(phone, lead.id);
    return;
  }

  if (!isConfirm) {
    // Stage 1: Explicit Confirmation Step with Buttons
    await sendTextMessage(phone, [
      `⏳ *CONFIRM LEAD APPROVAL*`,
      `----------------------------`,
      `You are requesting approval for lead ID: \`${lead.id.substring(0, 8)}\``,
      `*Business Name:* ${lead.business_name || "N/A"}`,
      `*Service:* ${lead.service_type || "N/A"}`,
      `*Estimate Range:* ${formatNaira(lead.estimated_min_price || 0)} - ${formatNaira(lead.estimated_max_price || 0)}`,
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

    await createAgentRequest(
      lead.contact_id,
      "QUOTATION",
      `Lead Approved by Admin Lizzy Interface`,
      "HIGH",
      lead.id,
      null,
      `Admin Phone: ${phone} approved Lead ID ${lead.id}. Value: ${formatNaira(lead.estimated_min_price || 0)}`
    );

    await logSalesEvent(phone, "ADMIN_LEAD_APPROVED", lead.id, {
      admin_phone: phone,
      value_min: lead.estimated_min_price,
    });

    const { data: contact } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", lead.contact_id)
      .maybeSingle();

    await sendTextMessage(phone, [
      `✅ *LEAD ID \`${lead.id.substring(0, 8)}\` APPROVED SUCCESSFULLY!*`,
      `----------------------------`,
      `*Client Name:* ${contact?.name || "Customer"}`,
      `*Phone Number:* ${contact?.phone || "N/A"}`,
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

  const { data: contact } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", lead.contact_id)
    .maybeSingle();

  if (!contact || !contact.phone) {
    await sendTextMessage(phone, "❌ *Error:* Could not find a valid contact phone number associated with this lead.");
    return;
  }

  const normalizedClientPhone = normalizePhone(contact.phone);
  if (!/^\d{10,15}$/.test(normalizedClientPhone)) {
    await sendTextMessage(phone, `❌ *Error:* Client phone format is invalid or malformed: "${contact.phone}"`);
    return;
  }

  const clientName = contact.name || "Customer";
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
): Promise<void> {
  const inputRaw = (interactiveId || text).trim();
  const command = inputRaw.toLowerCase();

  // Guard: Validate requester is authorized admin
  if (!isAdminPhone(phone)) {
    console.warn(`[AdminAgent] Unauthorized access attempt blocked from: ${phone}`);
    return;
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

  if (["menu", "help", "admin_agent_open", "admin_agent_menu", "0"].includes(command)) {
    await showAdminAgentMenu(phone);
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
