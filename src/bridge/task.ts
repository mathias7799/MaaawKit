/**
 * Bridge task primitives: mode taxonomy, slugs, worktree naming, and the
 * worker prompt contract. Pure — execution lives in src/bridge/exec.ts.
 * Ported from codex-worker.py, generalized from Codex-only to any adapter.
 */

export const WRITE_MODES = ["implementation-worktree", "test-fix", "backend-task"] as const;
export const READ_MODES = ["review-only", "security-pass"] as const;
export type BridgeMode = (typeof WRITE_MODES)[number] | (typeof READ_MODES)[number];
export const ALL_MODES: readonly BridgeMode[] = [...WRITE_MODES, ...READ_MODES].sort();

export function isWriteMode(mode: BridgeMode): boolean {
  return (WRITE_MODES as readonly string[]).includes(mode);
}

/** Filesystem/branch-safe slug from a task description. */
export function slugify(text: string, maxLen = 48): string {
  const s = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s.slice(0, maxLen).replace(/^-|-$/g, "") || "task";
}

/** Worker worktree directory name: <repo>-<agent>-<slug>. */
export function worktreeName(repoName: string, agent: string, taskSlug: string): string {
  return `${repoName}-${agent}-${taskSlug}`;
}

/** Worker branch name: <agent>/<slug>. */
export function workerBranch(agent: string, taskSlug: string): string {
  return `${agent}/${taskSlug}`;
}

export interface WorkerPromptOptions {
  task: string;
  mode: BridgeMode;
  agent: string;
  oracle?: string | undefined;
  resultName: string;
  promptAsset?: { id: string; path: string; content: string } | undefined;
}

/**
 * The bounded-worker prompt. Structure is the 2.6 contract (status/summary/
 * assumptions/changed files/verification/findings/needs-review) so results
 * stay parseable, with the agent name generalized.
 */
export function buildWorkerPrompt(opts: WorkerPromptOptions): string {
  const { task, mode, agent, oracle, resultName, promptAsset } = opts;
  const writeAllowed = isWriteMode(mode);
  const lines = [
    "# MaaawKit Worker Task",
    "",
    `You are running as a bounded ${agent} worker delegated by an orchestrating agent through MaaawKit.`,
    "The orchestrator reviews your output. Keep the task narrow and return a reviewable result.",
    "",
    `## Mode\n${mode}`,
    "",
    "## Task",
    task.trim(),
    "",
    "## Operating rules",
    "- Read AGENTS.md and .agent/handoff/HANDOFF.md first if present.",
    "- Keep changes minimal and local to the task.",
    "- Do not refactor unrelated code.",
    "- Do not commit, push, publish, or open pull requests.",
    "- Do not edit secrets, credentials, .env files, auth tokens, or private keys.",
    "- Do not weaken tests, disable rules, or hide failures.",
    "- If information is missing, make the best safe assumption and record it under Assumptions.",
  ];
  if (promptAsset) {
    lines.push(
      "",
      "## Orchestrator-selected prompt asset",
      `Asset: ${promptAsset.id}`,
      `Source: ${promptAsset.path}`,
      "",
      "Use this asset as the role/workflow/reference contract for this task. If it conflicts with the explicit task or operating rules above, follow the explicit task and record the conflict under Assumptions.",
      "",
      "```markdown",
      promptAsset.content.trim(),
      "```",
    );
  }
  if (writeAllowed) {
    lines.push(
      "- You may edit files in this isolated worktree.",
      "- After editing, run the smallest relevant verification command.",
    );
  } else {
    lines.push(
      "- Do not edit files. Return findings, suggested patches, and exact file paths only.",
      "- Treat the repository as read-only even if the sandbox would allow writes.",
    );
  }
  if (oracle) {
    lines.push(
      "",
      "## Verification oracle",
      `Run this if the mode permits command execution: \`${oracle}\``,
    );
  }
  lines.push(
    "",
    "## Required final response format",
    "Return Markdown with exactly these sections:",
    "",
    "# Worker Result",
    "",
    "## Status",
    "success | partial | failed",
    "",
    "## Summary",
    "What you did or found, in 3-7 bullets.",
    "",
    "## Assumptions",
    "Any assumptions made. Use 'None' if none.",
    "",
    "## Changed files",
    "List changed files, or 'None' for review-only mode.",
    "",
    "## Verification run",
    "Commands run and exact pass/fail/not-run status.",
    "",
    "## Findings or implementation notes",
    "Evidence with file paths and line references where possible.",
    "",
    "## Needs review",
    "Anything the orchestrator should verify before accepting the result.",
    "",
    `Result file expected by MaaawKit: \`.agent/bridge/results/${resultName}\``,
  );
  return `${lines.join("\n")}\n`;
}

export interface ParsedWorkerResult {
  status: "success" | "partial" | "failed" | "unknown";
  sections: Record<string, string>;
}

/** Parse the structured tail of a worker result document. */
export function parseWorkerResult(markdown: string): ParsedWorkerResult {
  const sections: Record<string, string> = {};
  const re = /^##\s+(.+?)\s*$/gm;
  const headers: { title: string; start: number; end: number }[] = [];
  for (let m = re.exec(markdown); m !== null; m = re.exec(markdown)) {
    headers.push({ title: (m[1] ?? "").toLowerCase(), start: m.index, end: m.index + m[0].length });
  }
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (!h) continue;
    const next = headers[i + 1];
    sections[h.title] = markdown.slice(h.end, next ? next.start : undefined).trim();
  }
  const statusText = (sections["status"] ?? "").toLowerCase();
  const status = statusText.includes("success")
    ? "success"
    : statusText.includes("partial")
      ? "partial"
      : statusText.includes("failed")
        ? "failed"
        : "unknown";
  return { status, sections };
}
