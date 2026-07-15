"use strict";

// src/index.ts
var import_node_fs2 = require("fs");

// src/comment.ts
var MARKER = "<!-- proofglass:pr-comment -->";
var STATUS_EMOJI = {
  passed: "\u2705",
  failed: "\u274C",
  error: "\u{1F7E0}",
  cancelled: "\u26AA",
  timed_out: "\u23F1\uFE0F"
};
var MAX_FAILURES = 20;
var MAX_ERR = 1200;
var DEFAULT_BOT_LOGIN = "github-actions[bot]";
function oneLine(msg) {
  return (msg || "see report").split("\n")[0].replace(/\|/g, "\\|").slice(0, MAX_ERR);
}
function renderComment(edgeUrl, jobId, status, job) {
  const emoji = STATUS_EMOJI[status] ?? "\u2022";
  const out = [MARKER, `## Proof Glass \u2014 \`${status}\` ${emoji}`, ""];
  if (job?.result?.summary) out.push(job.result.summary, "");
  const failures = job?.result?.failures ?? [];
  if (failures.length) {
    const groups = [
      [
        "\u{1F5BC}\uFE0F Visual regressions",
        "_Pixels changed vs the committed baseline \u2014 approve the new actual as the baseline in the console if the change is intended._",
        failures.filter((f) => f.kind === "visual")
      ],
      [
        "\u{1F9EA} Behavioral failures",
        "_Assertions failed (not a screenshot diff) \u2014 nothing to approve; fix the test or the app._",
        failures.filter((f) => f.kind === "behavioral")
      ]
    ];
    let shown = 0;
    for (const [heading, note, group] of groups) {
      if (!group.length) continue;
      out.push(`### ${heading} (${group.length})`, note, "");
      for (const f of group) {
        if (shown >= MAX_FAILURES) break;
        out.push(`- **${f.test}** (\`${f.file}\`) \u2014 \`${oneLine(f.message)}\``);
        shown++;
      }
      out.push("");
    }
    if (failures.length > shown) out.push(`_\u2026and ${failures.length - shown} more \u2014 see the report._`, "");
  }
  const links = [`[Console](${edgeUrl}/ui/jobs/${jobId}/screenshots)`];
  if (job?.result?.report_url) links.push(`[Playwright report](${edgeUrl}${job.result.report_url})`);
  out.push(links.join(" \xB7 "));
  return out.join("\n");
}
function shouldComment(opts) {
  const { wantComment, prNumber, token, status, commentOnPass } = opts;
  if (!wantComment || prNumber === void 0 || !token) return false;
  return status !== "passed" || commentOnPass;
}
function ghHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "proofglass-action",
    "content-type": "application/json"
  };
}
function expectedAuthor(commentAuthor) {
  return (commentAuthor ?? "").trim() || DEFAULT_BOT_LOGIN;
}
function nextLink(link) {
  if (!link) return null;
  for (const part of link.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}
async function postSticky(opts, fetchImpl = fetch) {
  const { repo, prNumber, token, body, commentAuthor } = opts;
  const h = ghHeaders(token);
  const author = expectedAuthor(commentAuthor);
  let existing;
  let next = `https://api.github.com/repos/${repo}/issues/${prNumber}/comments?per_page=100`;
  const seen = /* @__PURE__ */ new Set();
  while (next && !existing && !seen.has(next)) {
    seen.add(next);
    const listRes = await fetchImpl(next, { headers: h });
    if (!listRes.ok) throw new Error(`list comments ${listRes.status}`);
    const comments = await listRes.json();
    existing = comments.find((c) => (c.body ?? "").includes(MARKER) && c.user?.login === author);
    next = nextLink(listRes.headers.get("link"));
  }
  if (existing) {
    const patchRes = await fetchImpl(`https://api.github.com/repos/${repo}/issues/comments/${existing.id}`, {
      method: "PATCH",
      headers: h,
      body: JSON.stringify({ body })
    });
    if (!patchRes.ok) throw new Error(`update comment ${patchRes.status}`);
    return { updated: true };
  }
  const postRes = await fetchImpl(`https://api.github.com/repos/${repo}/issues/${prNumber}/comments`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ body })
  });
  if (!postRes.ok) throw new Error(`create comment ${postRes.status}`);
  return { updated: false };
}

// src/context.ts
var import_node_fs = require("fs");
function readEvent(env) {
  const path = env.GITHUB_EVENT_PATH;
  if (!path) return null;
  try {
    return JSON.parse((0, import_node_fs.readFileSync)(path, "utf8"));
  } catch {
    return null;
  }
}
function readPrContext(env, prInput) {
  const event = readEvent(env);
  const ctx = {};
  const explicit = (prInput ?? "").trim();
  if (explicit) {
    if (!/^[1-9][0-9]*$/.test(explicit)) {
      throw new Error(`invalid "pr" input ${JSON.stringify(prInput)} \u2014 expected a positive integer`);
    }
    ctx.pr_number = Number.parseInt(explicit, 10);
  } else if (typeof event?.pull_request?.number === "number" && event.pull_request.number > 0) {
    ctx.pr_number = event.pull_request.number;
  } else {
    const m = /^refs\/pull\/([1-9][0-9]*)\//.exec(env.GITHUB_REF ?? "");
    if (m) ctx.pr_number = Number.parseInt(m[1], 10);
  }
  const branch = event?.pull_request?.head?.ref || env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME;
  if (branch) ctx.branch = branch;
  return ctx;
}

// src/index.ts
var TERMINAL = ["passed", "failed", "error", "cancelled"];
function getInput(name, opts = {}) {
  const value = (process.env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`] ?? "").trim();
  if (!value && opts.required) {
    throw new Error(`required input "${name}" is missing`);
  }
  return value;
}
function setOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (file) (0, import_node_fs2.appendFileSync)(file, `${name}=${value}
`);
}
function writeSummary(markdown) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) (0, import_node_fs2.appendFileSync)(file, markdown + "\n");
}
var splitList = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
var notice = (msg) => console.log(`::notice::${msg}`);
var warning = (msg) => console.log(`::warning::${msg}`);
var errorCmd = (msg) => console.log(`::error::${msg}`);
var STATUS_EMOJI2 = {
  passed: "\u2705",
  failed: "\u274C",
  error: "\u{1F7E0}",
  cancelled: "\u26AA",
  timed_out: "\u23F1\uFE0F"
};
function renderSummary(edgeUrl, jobId, status, job) {
  const emoji = STATUS_EMOJI2[status] ?? "\u2022";
  const lines = [
    "## Proof Glass \u2014 visual regression",
    "",
    `**Status:** ${emoji} \`${status}\``,
    "",
    "| | |",
    "|---|---|",
    `| Job | \`${jobId}\` |`
  ];
  if (job) {
    lines.push(`| Repo | \`${job.repo}\` |`);
    lines.push(`| Commit | \`${job.sha}\` |`);
    lines.push(`| Suite | \`${job.suite}\` |`);
    if (job.assigned_runner_id) lines.push(`| Runner | \`${job.assigned_runner_id}\` |`);
    if (job.result?.summary) lines.push(`| Summary | ${job.result.summary} |`);
    const links = [];
    if (job.result?.report_url) links.push(`[Report](${edgeUrl}${job.result.report_url})`);
    if (job.result?.manifest_url) links.push(`[Manifest](${edgeUrl}${job.result.manifest_url})`);
    if (links.length) lines.push(`| Artifacts | ${links.join(" \xB7 ")} |`);
  }
  return lines.join("\n");
}
async function main() {
  const edgeUrl = getInput("edge-url", { required: true }).replace(/\/+$/, "");
  const edgeToken = getInput("edge-token", { required: true });
  const repo = getInput("repo", { required: true });
  const sha = getInput("sha", { required: true });
  const ref = getInput("ref", { required: true });
  const suite = getInput("suite") || "visual";
  const requiredCapabilities = splitList(
    getInput("required-capabilities") || "node,make,playwright,chromium"
  );
  const requiredLabels = splitList(getInput("required-labels") || "local,trusted");
  const timeoutSeconds = Number.parseInt(getInput("timeout-seconds") || "1800", 10);
  const pollSeconds = Math.max(1, Number.parseInt(getInput("poll-seconds") || "10", 10));
  const { pr_number, branch } = readPrContext(process.env, getInput("pr"));
  const auth = { authorization: `Bearer ${edgeToken}`, "content-type": "application/json" };
  const body = {
    repo,
    sha,
    ref,
    suite,
    required_capabilities: requiredCapabilities,
    required_labels: requiredLabels,
    ...pr_number !== void 0 ? { pr_number } : {},
    ...branch ? { branch } : {},
    created_by: {
      source: "github_action",
      actor: process.env.GITHUB_ACTOR,
      workflow_run_id: process.env.GITHUB_RUN_ID
    }
  };
  if (pr_number !== void 0) notice(`Proof Glass associating job with PR #${pr_number}`);
  const createRes = await fetch(`${edgeUrl}/api/jobs`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify(body)
  });
  if (!createRes.ok) {
    throw new Error(`enqueue failed: ${createRes.status} ${await createRes.text()}`);
  }
  const { id: jobId } = await createRes.json();
  setOutput("job-id", jobId);
  notice(`Proof Glass job ${jobId} queued for ${repo}@${sha} (suite=${suite})`);
  const deadline = Date.now() + timeoutSeconds * 1e3;
  let job;
  let status = "timed_out";
  while (Date.now() < deadline) {
    const res = await fetch(`${edgeUrl}/api/jobs/${encodeURIComponent(jobId)}`, { headers: auth });
    if (!res.ok) {
      throw new Error(`poll failed: ${res.status} ${await res.text()}`);
    }
    job = await res.json();
    if (TERMINAL.includes(job.status)) {
      status = job.status;
      break;
    }
    console.log(`job ${jobId} is ${job.status}\u2026`);
    await sleep(pollSeconds * 1e3);
  }
  setOutput("status", status);
  writeSummary(renderSummary(edgeUrl, jobId, status, job));
  const githubToken = getInput("github-token");
  if (
    // pr_number !== undefined first so TS narrows it to `number` for postSticky
    // (shouldComment re-checks it, but that isn't a type guard).
    pr_number !== void 0 && shouldComment({
      wantComment: getInput("comment") === "true",
      prNumber: pr_number,
      token: githubToken,
      status,
      commentOnPass: getInput("comment-on-pass") === "true"
    })
  ) {
    try {
      const { updated } = await postSticky({
        repo,
        prNumber: pr_number,
        token: githubToken,
        body: renderComment(edgeUrl, jobId, status, job),
        // Only set when overriding github-token with a non-default credential, so
        // the sticky comment can recognize its own prior comment (defaults to the
        // built-in github-actions[bot] identity otherwise).
        commentAuthor: getInput("comment-author") || void 0
      });
      notice(`Proof Glass ${updated ? "updated" : "posted"} the PR comment on #${pr_number}`);
    } catch (e) {
      warning(`Proof Glass PR comment failed (result unaffected): ${e instanceof Error ? e.message : e}`);
    }
  }
  if (status === "passed") {
    notice(`Proof Glass job ${jobId} passed`);
    return;
  }
  if (status === "timed_out") {
    errorCmd(`Proof Glass job ${jobId} did not finish within ${timeoutSeconds}s`);
  } else {
    errorCmd(`Proof Glass job ${jobId} finished with status ${status}`);
  }
  process.exitCode = 1;
}
main().catch((err) => {
  errorCmd(String(err instanceof Error ? err.message : err));
  process.exitCode = 1;
});
