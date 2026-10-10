
 // supabase/functions/whatsapp-webhook/modules/admin-agent.ts

import {
  getSupabaseClient,
  updateConversation,
} from "../database.ts";

import { sendTextMessage } from "../whatsapp.ts";
import { callAI } from "../ai.ts";

const supabase = getSupabaseClient();

const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";

function normalizePhone(raw: string): string {
  let phone = (raw || "").replace(/\D/g, "");

  if (phone.startsWith("0") && phone.length === 11) {
    phone = "234" + phone.slice(1);
  }

  return phone;
}

/**
 * Private access is controlled by the configured admin phone.
 */
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
  return (
    text.trim().toLowerCase() === "lizzy" ||
    interactiveId === "admin_agent_open"
  );
}

export async function showAdminAgentMenu(phone: string): Promise<void> {
  const message = [
    "🔐 *XTOP PRIVATE ADMIN AGENT*",
    "",
    "Welcome, Admin.",
    "",
    "*Database*",
    "1️⃣ `status` — check database connectivity",
    "2️⃣ `stats` — view bot statistics",
    "",
    "*GitHub diagnostics*",
    "3️⃣ `github` — test GitHub connection",
    "4️⃣ `deployments` — inspect recent workflow runs",
    "5️⃣ `logs` — inspect failed jobs and steps",
    "   `logs RUN_ID` — inspect a particular run",
    "",
    "*AI adviser*",
    "`advice your question`",
    "",
    "`menu` — show this menu",
    "`exit` — close Lizzy",
    "",
    "🔒 GitHub diagnostics are read-only.",
  ].join("\n");

  await sendTextMessage(phone, message);
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
        `Details: ${error.message.slice(0, 250)}`,
        "",
        "This does not necessarily mean the entire Supabase project is down.",
      ].join("\n");
    }

    return [
      "🟢 *DATABASE CONNECTION CHECK PASSED*",
      "",
      "Supabase responded successfully to the contacts query.",
      `Contact records: ${count ?? "Not reported"}`,
      `Checked: ${new Date().toISOString()}`,
      "",
      "This checks database access only, not every webhook or WhatsApp request.",
    ].join("\n");
  } catch (error) {
    console.error("[AdminAgent] Status exception:", error);

    return [
      "🔴 *STATUS CHECK ERROR*",
      "",
      "The diagnostic could not complete.",
      "Check the Supabase Edge Function logs for details.",
    ].join("\n");
  }
}

async function getBotStats(): Promise<string> {
  const checks = await Promise.all([
    supabase.from("contacts").select("id", {
      count: "exact",
      head: true,
    }),
    supabase.from("messages").select("id", {
      count: "exact",
      head: true,
    }),
    supabase.from("bot_orders").select("id", {
      count: "exact",
      head: true,
    }),
    supabase.from("agent_requests").select("id", {
      count: "exact",
      head: true,
    }).eq("status", "NEW"),
  ]);

  const labels = [
    "Contacts",
    "Messages",
    "Bot orders",
    "New agent requests",
  ];

  const lines = checks.map((result, index) => {
    if (result.error) {
      console.error(
        `[AdminAgent] Stats error (${labels[index]}):`,
        result.error.message,
      );

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
    "These figures come from the connected database. They are not a financial report.",
  ].join("\n");
}

/* =========================================================
   GITHUB READ-ONLY DIAGNOSTICS
   Required Supabase secrets:
   GITHUB_TOKEN
   GITHUB_OWNER
   GITHUB_REPO
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

function getGitHubConfig():
  | { token: string; owner: string; repo: string }
  | null {
  const token = Deno.env.get("GITHUB_TOKEN") || "";
  const owner = Deno.env.get("GITHUB_OWNER") || "";
  const repo = Deno.env.get("GITHUB_REPO") || "";

  if (!token || !owner || !repo) {
    return null;
  }

  return { token, owner, repo };
}

function githubHeaders(token: string): HeadersInit {
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${token}`,
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };
}

/**
 * All requests made here are GET requests.
 * Never log or return the GitHub token.
 */
async function githubGet<T>(
  path: string,
): Promise<{ data?: T; error?: string }> {
  const config = getGitHubConfig();

  if (!config) {
    return {
      error:
        "GitHub secrets are missing. Check GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO in Supabase.",
    };
  }

  try {
    const response = await fetch(
      `${GITHUB_API}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}${path}`,
      {
        method: "GET",
        headers: githubHeaders(config.token),
        signal: AbortSignal.timeout(12000),
      },
    );

    if (!response.ok) {
      // Do not return raw response bodies because they are not needed
      // for diagnosis and could contain unnecessary information.
      if (response.status === 401) {
        return {
          error:
            "GitHub rejected the token. Check that GITHUB_TOKEN is correct and has not expired or been revoked.",
        };
      }

      if (response.status === 403) {
        return {
          error:
            "GitHub denied access. Check the token's repository selection and read-only Actions permission. Rate limits may also apply.",
        };
      }

      if (response.status === 404) {
        return {
          error:
            "GitHub could not find this repository or the token cannot access it. Check GITHUB_OWNER and GITHUB_REPO.",
        };
      }

      if (response.status === 429) {
        return {
          error: "GitHub rate limit reached. Try again later.",
        };
      }

      return {
        error: `GitHub API returned HTTP ${response.status}.`,
      };
    }

    return { data: await response.json() as T };
  } catch (error) {
    console.error(
      "[AdminAgent] GitHub request failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return {
      error:
        "Could not reach GitHub. Check network access and try again.",
    };
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
      "Add them in the Supabase project used by this bot.",
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
      "",
      "No changes were made to GitHub.",
    ].join("\n");
  }

  return [
    "🟢 *GITHUB CONNECTION PASSED*",
    "",
    `Repository: ${result.data.full_name || `${config.owner}/${config.repo}`}`,
    `Default branch: ${result.data.default_branch || "Not reported"}`,
    `Visibility: ${result.data.private ? "Private" : "Public"}`,
    "",
    "Lizzy can read repository metadata using the configured token.",
    "This test does not by itself confirm that Actions runs and job details are accessible.",
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
      result.error || "GitHub returned no workflow data.",
      "",
      "Check the GitHub token's Actions: Read-only permission.",
    ].join("\n");
  }

  const runs = result.data.workflow_runs || [];

  if (runs.length === 0) {
    return [
      "ℹ️ *NO WORKFLOW RUNS RETURNED*",
      "",
      "GitHub returned no recent Actions runs for this repository.",
      "Confirm that the repository has workflows and that the token can read Actions.",
    ].join("\n");
  }

  const lines = runs.map((run, index) => {
    const title = (run.name || run.display_title || "Workflow")
      .replace(/[\r\n]/g, " ")
      .slice(0, 90);

    const conclusion = run.conclusion || run.status || "unknown";
    const icon = conclusion === "success"
      ? "🟢"
      : conclusion === "failure"
      ? "🔴"
      : conclusion === "cancelled"
      ? "⚪"
      : "🟡";

    return [
      `${index + 1}. ${icon} *${title}*`,
      `   Run ID: ${run.id}`,
      `   Result: ${conclusion}`,
      `   Branch: ${run.head_branch || "unknown"}`,
      `   Updated: ${run.updated_at || run.created_at || "unknown"}`,
      run.html_url ? `   ${run.html_url}` : "",
    ].filter(Boolean).join("\n");
  });

  return [
    "🚀 *RECENT GITHUB WORKFLOW RUNS*",
    "",
    `Runs returned: ${runs.length}`,
    "",
    ...lines,
    "",
    "Use `logs` to inspect the latest run's jobs and failed steps.",
    "These are GitHub Actions workflow results, not a live health check of the WhatsApp bot.",
  ].join("\n");
}

async function inspectWorkflowRun(runIdInput?: string): Promise<string> {
  if (
    runIdInput &&
    (!/^\d+$/.test(runIdInput) || runIdInput.length > 20)
  ) {
    return "Invalid run ID. Use `logs` or `logs RUN_ID` with a numeric GitHub Actions run ID.";
  }

  let runId = runIdInput ? Number(runIdInput) : 0;
  let selectedRun: GitHubRun | undefined;

  if (!runId) {
    const result = await githubGet<{
      workflow_runs?: GitHubRun[];
    }>("/actions/runs?per_page=10");

    if (result.error || !result.data) {
      return [
        "⚠️ *COULD NOT FIND A WORKFLOW RUN*",
        "",
        result.error || "GitHub returned no workflow data.",
      ].join("\n");
    }

    const runs = result.data.workflow_runs || [];

    selectedRun = runs.find((run) =>
      run.conclusion === "failure" || run.conclusion === "cancelled"
    ) || runs[0];

    if (!selectedRun) {
      return "No recent GitHub Actions runs were returned.";
    }

    runId = selectedRun.id;
  }

  const jobsResult = await githubGet<{
    jobs?: GitHubJob[];
  }>(`/actions/runs/${runId}/jobs?per_page=30`);

  if (jobsResult.error || !jobsResult.data) {
    return [
      "⚠️ *COULD NOT READ WORKFLOW JOBS*",
      "",
      jobsResult.error || "GitHub returned no job information.",
      "",
      "Confirm Actions read permission and verify the run ID.",
    ].join("\n");
  }

  const jobs = jobsResult.data.jobs || [];
  const failedJobs = jobs.filter((job) =>
    job.conclusion === "failure" ||
    (job.steps || []).some((step) => step.conclusion === "failure")
  );

  const cancelledJobs = jobs.filter((job) =>
    job.conclusion === "cancelled"
  );

  const lines: string[] = [];

  for (const job of jobs.slice(0, 10)) {
    const jobConclusion = job.conclusion || job.status || "unknown";
    const icon = jobConclusion === "success"
      ? "🟢"
      : jobConclusion === "failure"
      ? "🔴"
      : jobConclusion === "cancelled"
      ? "⚪"
      : "🟡";

    lines.push(`${icon} *${(job.name || "Unnamed job").slice(0, 100)}*`);
    lines.push(`   Result: ${jobConclusion}`);

    const failedSteps = (job.steps || []).filter((step) =>
      step.conclusion === "failure"
    );

    for (const step of failedSteps.slice(0, 5)) {
      lines.push(
        `   ❌ Failed step: ${(step.name || "Unnamed step").slice(0, 120)}`,
      );
    }

    if (
      jobConclusion === "failure" &&
      failedSteps.length === 0
    ) {
      lines.push(
        "   GitHub reports job failure but did not identify a failed step in the returned summary.",
      );
    }
  }

  const config = getGitHubConfig();
  const runUrl = selectedRun?.html_url ||
    (config
      ? `https://github.com/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/actions/runs/${runId}`
      : "");

  return [
    "🔎 *GITHUB WORKFLOW DIAGNOSTIC*",
    "",
    `Run ID: ${runId}`,
    `Jobs returned: ${jobs.length}`,
    `Failed jobs: ${failedJobs.length}`,
    `Cancelled jobs: ${cancelledJobs.length}`,
    "",
    ...(lines.length ? lines : ["No job details were returned."]),
    "",
    "This is a job and step summary, not the full raw log output.",
    "Open the workflow run link below to view complete logs and error messages.",
    runUrl,
    "",
    "Lizzy has not changed or rerun anything.",
  ].join("\n");
}

/* =========================================================
   AI ADVISER
   ========================================================= */

async function askAdminAI(
  phone: string,
  question: string,
): Promise<void> {
  if (!Deno.env.get("AI_API_KEY")) {
    await sendTextMessage(
      phone,
      "AI advice is not configured yet. Set the AI_API_KEY secret in Supabase. Status, stats, and GitHub diagnostics do not require an AI key.",
    );
    return;
  }

  const systemPrompt = `
You are Lizzy, the private technical and business adviser
for the administrator of Xtop Retail Technologies.

Be practical, concise, honest, and security-conscious.

You may advise on TypeScript, Deno, Supabase, WhatsApp Cloud API,
GitHub, debugging, and business operations.

Available verified tools in this module:
- Database status query
- Database statistics queries
- GitHub repository connection test
- Recent GitHub Actions workflow run listing
- GitHub workflow job and failed-step summaries

IMPORTANT LIMITATIONS:
- You can only report results returned by the tools that were actually called.
- An AI advice request alone does not execute diagnostics.
- Do not claim you read raw workflow logs; this module currently returns job and failed-step summaries.
- Never claim to have run tests, changed files, or deployed code unless that action actually happened.
- Never invent credentials, configuration values, or test results.
- Prefer small changes that preserve existing bot features.
- Never ask the administrator to share secret API keys in chat.
- Require explicit human approval before production or destructive changes.
- GitHub actions available in this version are read-only.
`.trim();

  try {
    const answer = await callAI(
      systemPrompt,
      question,
      [],
      { temperature: 0.2, maxTokens: 500 },
    );

    await sendTextMessage(
      phone,
      `🤖 *LIZZY — ADMIN ADVISER*\n\n${answer}`,
    );
  } catch (error) {
    console.error("[AdminAgent] AI error:", error);

    await sendTextMessage(
      phone,
      "I couldn't complete that advice request. Please try again later.",
    );
  }
}

/* =========================================================
   COMMAND ROUTER
   ========================================================= */

export async function handleAdminAgent(
  phone: string,
  text: string,
  interactiveId: string,
  conversationId: string,
): Promise<void> {
  const command = (interactiveId || text).trim().toLowerCase();

  // Close the private assistant.
  if (
    ["4", "exit", "quit", "close", "admin_agent_exit"].includes(command)
  ) {
    await updateConversation(conversationId, {
      current_module: "MAIN_MENU",
      current_state: "IDLE",
      context_json: {},
    });

    await sendTextMessage(
      phone,
      "🔒 Private admin assistant closed.\n\nType *menu* to return to the public Xtop menu.",
    );

    return;
  }

  // Show menu.
  if (
    ["menu", "help", "admin_agent_open", "0"].includes(command)
  ) {
    await showAdminAgentMenu(phone);
    return;
  }

  // Database status.
  if (
    ["1", "status", "health", "check status", "admin_agent_status"].includes(command)
  ) {
    await sendTextMessage(phone, "Checking database connectivity...");
    await sendTextMessage(phone, await checkBotStatus());
    return;
  }

  // Database statistics.
  if (
    ["2", "stats", "statistics", "admin_agent_stats"].includes(command)
  ) {
    await sendTextMessage(phone, "Reading available bot statistics...");
    await sendTextMessage(phone, await getBotStats());
    return;
  }

  // GitHub connection.
  if (
    ["3", "github", "github status", "github check"].includes(command)
  ) {
    await sendTextMessage(phone, "Checking the GitHub read-only connection...");
    await sendTextMessage(phone, await checkGitHubConnection());
    return;
  }

  // Recent workflow runs.
  if (
    ["4", "deployments", "deployment", "runs", "workflow runs"].includes(command)
  ) {
    await sendTextMessage(phone, "Reading recent GitHub Actions workflow runs...");
    await sendTextMessage(phone, await getRecentDeployments());
    return;
  }

  // Failed jobs and steps for a specific or recent workflow run.
  if (
    command === "5" ||
    command === "logs" ||
    command.startsWith("logs ")
  ) {
    const runId = command.startsWith("logs ")
      ? command.slice(5).trim()
      : undefined;

    await sendTextMessage(
      phone,
      "Inspecting GitHub workflow jobs and failed steps...",
    );

    await sendTextMessage(
      phone,
      await inspectWorkflowRun(runId),
    );

    return;
  }

  // AI adviser prompt.
  if (
    ["advice", "admin_agent_advice"].includes(command)
  ) {
    await sendTextMessage(
      phone,
      "Type your question after the word advice.\n\nExample: advice Explain how to diagnose a failing webhook.",
    );
    return;
  }

  if (command.startsWith("advice ")) {
    const question = (interactiveId ? text : text.slice(7)).trim();

    if (!question) {
      await sendTextMessage(
        phone,
        "Please include a question after `advice`.",
      );
      return;
    }

    await askAdminAI(phone, question);
    return;
  }

  // Unknown text is treated as a request for AI advice.
  await askAdminAI(phone, text);
}
