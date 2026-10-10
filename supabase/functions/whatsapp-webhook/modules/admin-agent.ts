
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

/* =========================================================
   PHONE / ADMIN ACCESS
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
    supabase.from("contacts").select("id", {
      count: "exact", head: true,
    }),
    supabase.from("messages").select("id", {
      count: "exact", head: true,
    }),
    supabase.from("bot_orders").select("id", {
      count: "exact", head: true,
    }),
    supabase.from("agent_requests").select("id", {
      count: "exact", head: true,
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
    "These are database counts, not a financial report.",
  ].join("\n");
}

/* =========================================================
   GITHUB READ-ONLY DIAGNOSTICS

   Required Supabase secrets:
   GITHUB_TOKEN
   GITHUB_OWNER
   GITHUB_REPO

   Never log or return the token.
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

function getGitHubConfig():
  | { token: string; owner: string; repo: string }
  | null {
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

/**
 * Sanitizes GitHub error text before returning it to the administrator.
 * Never includes request headers or credentials.
 */
function sanitizeGitHubMessage(value: unknown): string {
  if (typeof value !== "string") return "No readable message";

  return value
    .replace(/[\r\n\t]/g, " ")
    .replace(/[^ -~]/g, "")
    .slice(0, 160);
}

async function githubGet<T>(
  path: string,
): Promise<GitHubResult<T>> {
  const config = getGitHubConfig();

  if (!config) {
    console.error("[AdminAgent][GitHub] Missing configuration secret(s).");

    return {
      error:
        "Required GitHub secrets are missing. Check GITHUB_TOKEN, GITHUB_OWNER and GITHUB_REPO in Supabase.",
    };
  }

  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("://")
  ) {
    console.error("[AdminAgent][GitHub] Rejected invalid API path.");

    return { error: "Invalid GitHub API path." };
  }

  const url =
    `${GITHUB_API}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}${path}`;

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
        // Keep the safe fallback.
      }

      const requestId =
        response.headers.get("x-github-request-id") || "not provided";

      console.error("[AdminAgent][GitHub] Request failed", {
        status: response.status,
        owner: config.owner,
        repo: config.repo,
        path,
        githubMessage,
        requestId,
      });

      // IMPORTANT:
      // Return the useful diagnostic to the administrator through
      // WhatsApp so the dashboard logs are not the only source.
      const diagnostic =
        `HTTP ${response.status} | path: ${path} | GitHub: ${githubMessage} | request ID: ${requestId}`;

      if (response.status === 401) {
        return {
          error:
            `GitHub rejected the token. ${diagnostic}. Verify that GITHUB_TOKEN is the correct active token.`,
        };
      }

      if (response.status === 403) {
        return {
          error:
            `GitHub denied access. ${diagnostic}. Check token permissions or rate limits.`,
        };
      }

      if (response.status === 404) {
        return {
          error:
            `GitHub could not find the repository or API resource, or the token cannot access it. ${diagnostic}. Check GITHUB_OWNER, GITHUB_REPO and token access.`,
        };
      }

      if (response.status === 429) {
        return {
          error: `GitHub rate limit reached. ${diagnostic}. Try again later.`,
        };
      }

      return {
        error: `GitHub API request failed. ${diagnostic}.`,
      };
    }

    return {
      data: await response.json() as T,
    };
  } catch (error) {
    const safeMessage = error instanceof Error
      ? sanitizeGitHubMessage(error.message)
      : "Unknown network error";

    console.error("[AdminAgent][GitHub] Network request failed", {
      owner: config.owner,
      repo: config.repo,
      path,
      message: safeMessage,
    });

    return {
      error:
        `Could not reach GitHub API. Path: ${path}. Error: ${safeMessage}. Check network access and try again.`,
    };
  }
}

/* =========================================================
   GITHUB CONNECTION CHECK
   ========================================================= */

async function checkGitHubConnection(): Promise<string> {
  const config = getGitHubConfig();

  if (!config) {
    return [
      "⚠️ *GITHUB NOT CONFIGURED*",
      "",
      "One or more GitHub secrets are missing.",
      "Required: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO.",
      "",
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
      `Configured owner: ${config.owner}`,
      `Configured repository: ${config.repo}`,
      "",
      "No changes were made to GitHub.",
      "Send this diagnostic back for help if needed.",
    ].join("\n");
  }

  return [
    "🟢 *GITHUB CONNECTION PASSED*",
    "",
    `Repository: ${result.data.full_name || `${config.owner}/${config.repo}`}`,
    `Default branch: ${result.data.default_branch || "Not reported"}`,
    `Visibility: ${result.data.private ? "Private" : "Public"}`,
    "",
    "Repository metadata is accessible.",
    "This test does not by itself confirm Actions run or job access.",
    result.data.html_url || "",
  ].filter(Boolean).join("\n");
}

/* =========================================================
   RECENT GITHUB ACTIONS WORKFLOW RUNS
   ========================================================= */

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
      "Check the token's Actions read permission.",
    ].join("\n");
  }

  const runs = result.data.workflow_runs || [];

  if (!runs.length) {
    return [
      "ℹ️ *NO WORKFLOW RUNS RETURNED*",
      "",
      "GitHub returned no recent Actions runs.",
      "Confirm that this repository has workflows.",
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
    "These are workflow results, not a live bot health check.",
  ].join("\n");
}

/* =========================================================
   WORKFLOW JOB / FAILED-STEP DIAGNOSTICS
   ========================================================= */

async function inspectWorkflowRun(
  runIdInput?: string,
): Promise<string> {
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
      run.conclusion === "failure" ||
      run.conclusion === "cancelled"
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
    const conclusion = job.conclusion || job.status || "unknown";

    const icon = conclusion === "success"
      ? "🟢"
      : conclusion === "failure"
      ? "🔴"
      : conclusion === "cancelled"
      ? "⚪"
      : "🟡";

    lines.push(
      `${icon} *${(job.name || "Unnamed job").slice(0, 100)}*`,
    );
    lines.push(`   Result: ${conclusion}`);

    const failedSteps = (job.steps || []).filter((step) =>
      step.conclusion === "failure"
    );

    for (const step of failedSteps.slice(0, 5)) {
      lines.push(
        `   ❌ Failed step: ${(step.name || "Unnamed step").slice(0, 120)}`,
      );
    }

    if (conclusion === "failure" && failedSteps.length === 0) {
      lines.push(
        "   Job failed; no failed step was identified in the summary.",
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
    "This is a job and step summary, not the full raw log.",
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
      "AI advice is not configured. Set the AI_API_KEY secret in Supabase. Database and GitHub diagnostics do not require an AI key.",
    );
    return;
  }

  const systemPrompt = `
You are Lizzy, the private technical and business adviser
for the administrator of Xtop Retail Technologies.

Be practical, concise, honest, and security-conscious.

You may advise on TypeScript, Deno, Supabase, WhatsApp Cloud API,
GitHub, debugging, and business operations.

Available tools in this module:
- Database status query
- Database statistics queries
- GitHub repository connection test
- Recent GitHub Actions workflow run listing
- GitHub workflow job and failed-step summaries

IMPORTANT:
- Only report results from tools that were actually called.
- An advice request does not execute diagnostics.
- This module does not retrieve full raw workflow logs.
- Never claim to have run tests, changed files, or deployed code unless that happened.
- Never invent credentials, configuration values, or test results.
- Prefer small changes that preserve existing bot features.
- Never ask the administrator to share API keys in chat.
- Require human approval before production or destructive changes.
- GitHub actions in this version are read-only.
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
    console.error(
      "[AdminAgent] AI error:",
      error instanceof Error ? error.message : "Unknown error",
    );

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

  if (
    ["exit", "quit", "close", "admin_agent_exit"].includes(command)
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

  if (
    ["menu", "help", "admin_agent_open", "0"].includes(command)
  ) {
    await showAdminAgentMenu(phone);
    return;
  }

  if (
    ["1", "status", "health", "check status", "admin_agent_status"].includes(command)
  ) {
    await sendTextMessage(phone, "Checking database connectivity...");
    await sendTextMessage(phone, await checkBotStatus());
    return;
  }

  if (
    ["2", "stats", "statistics", "admin_agent_stats"].includes(command)
  ) {
    await sendTextMessage(phone, "Reading available bot statistics...");
    await sendTextMessage(phone, await getBotStats());
    return;
  }

  if (
    ["3", "github", "github status", "github check"].includes(command)
  ) {
    await sendTextMessage(
      phone,
      "Checking GitHub read-only connection...",
    );
    await sendTextMessage(phone, await checkGitHubConnection());
    return;
  }

  if (
    ["4", "deployments", "deployment", "runs", "workflow runs"].includes(command)
  ) {
    await sendTextMessage(
      phone,
      "Reading recent GitHub Actions workflow runs...",
    );
    await sendTextMessage(phone, await getRecentDeployments());
    return;
  }

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
      "Inspecting workflow jobs and failed steps...",
    );

    await sendTextMessage(
      phone,
      await inspectWorkflowRun(runId),
    );
    return;
  }

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
    const question = text.slice(7).trim();

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
