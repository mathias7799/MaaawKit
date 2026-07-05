/**
 * Bridge execution: prepare (default, prints the command — the 2.6 dry-run
 * safety posture), run (foreground), background (detached via the job runner,
 * tree-kill on cancel). Guard policy is applied to every task and every built
 * command BEFORE anything executes — the precondition for safe MCP exposure.
 */

import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import treeKill from "tree-kill";
import { resolveConfig } from "../config/index.js";
import { evaluateCommand } from "../hooks/guard.js";
import { runTrustedOracle } from "../hooks/oracle.js";
import { getPromptAsset } from "../prompts/catalog.js";
import type { AdapterSpec, JobRecord } from "../schemas/index.js";
import { agentPaths, ensureStateDirs, withLock, writeFileAtomic } from "../state/index.js";
import { getAdapter, isGitTracked, substituteArgs } from "./adapters.js";
import { jobPath, loadJob, newJobId, saveJob, updateJob } from "./jobs.js";
import {
  type BridgeMode,
  buildWorkerPrompt,
  isWriteMode,
  parseWorkerResult,
  slugify,
  workerBranch,
  worktreeName,
} from "./task.js";

export class PolicyRefusal extends Error {
  readonly decision: "deny" | "ask";
  constructor(decision: "deny" | "ask", reason: string) {
    super(`Bridge policy ${decision === "deny" ? "refused" : "flagged"} this job: ${reason}`);
    this.decision = decision;
  }
}

export interface PrepareOptions {
  cwd: string;
  agent: string;
  mode: BridgeMode;
  task: string;
  oracle?: string | undefined;
  branch?: string | undefined;
  worktreeRoot?: string | undefined;
  /** Accept ask-level guard findings (deny-level are never overridable). */
  allowAsk?: boolean;
  /** Resume a vendor thread from a previous job. */
  resumeFrom?: string | undefined;
  promptAssetId?: string | undefined;
}

export interface PreparedJob {
  job: JobRecord;
  launchCommand: string;
  promptPath: string;
}

/**
 * Guard policy inside the bridge. The task prose is screened against
 * deny-level rules only (prose legitimately mentions scary words); the built
 * command is screened against the full table at the configured level.
 */
export function checkBridgePolicy(
  cwd: string,
  task: string,
  argv: readonly string[],
  allowAsk: boolean,
): void {
  const { config } = resolveConfig({ cwd });
  const options = { level: config.guardLevel, customBashRules: config.guardCustomRules };

  const taskDecision = evaluateCommand(task, options);
  if (taskDecision.decision === "deny") {
    throw new PolicyRefusal("deny", `task text: ${taskDecision.reason ?? ""}`);
  }

  const cmdDecision = evaluateCommand(argv.join(" "), options);
  if (cmdDecision.decision === "deny") {
    throw new PolicyRefusal("deny", `built command: ${cmdDecision.reason ?? ""}`);
  }
  if (cmdDecision.decision === "ask" && !allowAsk) {
    throw new PolicyRefusal("ask", `built command: ${cmdDecision.reason ?? ""}`);
  }
}

async function createWorktree(
  cwd: string,
  agent: string,
  taskSlug: string,
  branchOverride?: string,
  worktreeRoot?: string,
): Promise<{ worktree: string; branch: string }> {
  const top = await execa("git", ["rev-parse", "--show-toplevel"], { cwd, timeout: 10_000 });
  const root = top.stdout.trim();
  const repoName = root.split(/[/\\]/).pop() ?? "repo";
  const branch = branchOverride ?? workerBranch(agent, taskSlug);
  const parent = worktreeRoot ? resolve(worktreeRoot) : dirname(root);
  const worktree = join(parent, worktreeName(repoName, agent, taskSlug));
  if (existsSync(worktree)) {
    throw new Error(`Worktree path already exists: ${worktree} — pass --branch for a fresh one.`);
  }
  await execa("git", ["worktree", "add", "-b", branch, worktree, "HEAD"], {
    cwd: root,
    timeout: 120_000,
  });
  return { worktree, branch };
}

function renderLaunchCommand(spec: AdapterSpec, argv: string[], promptPath: string): string {
  const quoted = [spec.bin, ...argv]
    .map((a) => (/[\s"']/.test(a) ? JSON.stringify(a) : a))
    .join(" ");
  return spec.promptVia === "stdin" ? `cat ${JSON.stringify(promptPath)} | ${quoted}` : quoted;
}

export async function prepareJob(opts: PrepareOptions): Promise<PreparedJob> {
  const cwd = resolve(opts.cwd);
  const spec = getAdapter(cwd, opts.agent);
  const paths = ensureStateDirs(cwd);
  const id = newJobId();
  const taskSlug = slugify(opts.task);
  const resultName = `${id}-${taskSlug}.md`;
  const resultPath = join(paths.resultsDir, resultName);
  const promptPath = join(paths.resultsDir, `${id}-${taskSlug}.prompt.md`);
  const logPath = join(paths.logsDir, `${id}.log`);

  let resumeThreadId: string | undefined;
  if (opts.resumeFrom) {
    const prior = loadJob(cwd, opts.resumeFrom);
    if (!prior?.threadId) {
      throw new Error(
        `Cannot resume: job ${opts.resumeFrom} has no recorded thread id` +
          `${prior ? ` (agent "${prior.agent}" may not support resume)` : " (job not found)"}.`,
      );
    }
    if (!spec.resumeArgs) {
      throw new Error(`Adapter "${spec.id}" does not support --resume.`);
    }
    resumeThreadId = prior.threadId;
  }

  const promptAsset = opts.promptAssetId ? getPromptAsset(opts.promptAssetId) : null;
  if (opts.promptAssetId && !promptAsset) {
    throw new Error(
      `Unknown prompt asset "${opts.promptAssetId}". Use prompt_catalog to inspect ids.`,
    );
  }

  const prompt = buildWorkerPrompt({
    task: opts.task,
    mode: opts.mode,
    agent: spec.id,
    oracle: opts.oracle,
    resultName,
    ...(promptAsset
      ? {
          promptAsset: { id: promptAsset.id, path: promptAsset.path, content: promptAsset.content },
        }
      : {}),
  });

  const template = resumeThreadId
    ? (spec.resumeArgs ?? [])
    : isWriteMode(opts.mode)
      ? spec.writeArgs
      : spec.readArgs;
  const argv = [
    ...spec.baseArgs,
    ...substituteArgs(template, {
      prompt,
      outputFile: resultPath,
      ...(resumeThreadId ? { threadId: resumeThreadId } : {}),
    }),
  ];

  // Policy gate — before any worktree or file is created.
  checkBridgePolicy(cwd, opts.task, [spec.bin, ...argv], opts.allowAsk ?? false);

  let worktree: string | undefined;
  let branch: string | undefined;
  if (isWriteMode(opts.mode)) {
    const created = await createWorktree(cwd, spec.id, taskSlug, opts.branch, opts.worktreeRoot);
    worktree = created.worktree;
    branch = created.branch;
  }

  writeFileAtomic(promptPath, prompt);

  const job: JobRecord = {
    id,
    agent: spec.id,
    mode: opts.mode,
    task: opts.task,
    cwd: worktree ?? cwd,
    ...(worktree ? { worktree, branch } : {}),
    cmd: [spec.bin, ...argv],
    status: "prepared",
    createdAt: new Date().toISOString(),
    logPath,
    resultPath,
    ...(opts.oracle ? { oracle: opts.oracle } : {}),
    ...(promptAsset ? { promptAssetId: promptAsset.id, promptAssetPath: promptAsset.path } : {}),
  };
  saveJob(cwd, job);

  return { job, launchCommand: renderLaunchCommand(spec, argv, promptPath), promptPath };
}

function findRunner(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, "shims", "job-runner.mjs");
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  throw new Error("job-runner.mjs not found (package layout broken)");
}

function promptPathFor(job: JobRecord): string {
  return (job.resultPath ?? "").replace(/\.md$/, ".prompt.md");
}

function exitFilePath(cwd: string, job: JobRecord): string {
  return jobPath(cwd, job.id).replace(/\.json$/, ".exit");
}

async function extractThreadId(spec: AdapterSpec, combined: string): Promise<string | undefined> {
  if (!spec.threadIdPattern) return undefined;
  try {
    const m = new RegExp(spec.threadIdPattern).exec(combined);
    return m?.[1];
  } catch {
    return undefined;
  }
}

async function finalizeJob(cwd: string, job: JobRecord, exitCode: number): Promise<JobRecord> {
  const spec = getAdapter(cwd, job.agent);
  const log = job.logPath && existsSync(job.logPath) ? readFileSync(job.logPath, "utf-8") : "";

  // stdout-output adapters: the log IS the result document.
  let resultText = "";
  if (job.resultPath && existsSync(job.resultPath)) {
    resultText = readFileSync(job.resultPath, "utf-8");
  } else if (spec.outputVia === "stdout" && job.resultPath) {
    resultText = log;
    if (resultText) writeFileAtomic(job.resultPath, resultText);
  }

  const patch: Partial<JobRecord> = {
    status: exitCode === 0 ? "done" : "failed",
    exitCode,
    endedAt: new Date().toISOString(),
  };

  if (resultText) patch.result = parseWorkerResult(resultText);
  const threadId = await extractThreadId(spec, `${resultText}\n${log}`);
  if (threadId) patch.threadId = threadId;

  // Write-mode jobs: capture the worktree diff as patch + stat.
  if (job.worktree && existsSync(job.worktree)) {
    try {
      const diff = await execa("git", ["diff", "--binary", "HEAD"], {
        cwd: job.worktree,
        timeout: 120_000,
      });
      const stat = await execa("git", ["diff", "--stat", "HEAD"], {
        cwd: job.worktree,
        timeout: 120_000,
      });
      const patchPath = (job.resultPath ?? "").replace(/\.md$/, ".patch");
      writeFileAtomic(patchPath, diff.stdout);
      writeFileAtomic(patchPath.replace(/\.patch$/, ".stat.txt"), stat.stdout);
      patch.patchPath = patchPath;
    } catch {
      // diff capture is best-effort
    }
  }

  // Oracle verification (runs in the job's cwd — the worktree for write modes).
  // Job records are repo-local state: refuse the shell-executed oracle when the
  // record file is git-tracked (cloned-repo attack) or the guard denies it.
  const jobFile = jobPath(cwd, job.id);
  const oracleTrusted =
    job.oracle !== undefined &&
    !isGitTracked(jobFile, cwd) &&
    evaluateCommand(job.oracle).decision !== "deny";
  if (job.oracle && exitCode === 0 && oracleTrusted) {
    const oracle = await runTrustedOracle(job.oracle, job.cwd, 600_000);
    patch.oraclePassed = oracle.passed;
  }

  return updateJob(cwd, job.id, patch);
}

export interface RunOptions {
  cwd: string;
  background?: boolean;
}

/** Execute a prepared job. Foreground awaits completion; background detaches. */
export async function runJob(id: string, opts: RunOptions): Promise<JobRecord> {
  const cwd = resolve(opts.cwd);
  const job = loadJob(cwd, id);
  if (!job) throw new Error(`Job not found: ${id}`);
  if (job.status !== "prepared") throw new Error(`Job ${id} is ${job.status}, not prepared`);
  const spec = getAdapter(cwd, job.agent);
  const [bin, ...args] = job.cmd;
  if (!bin) throw new Error(`Job ${id} has an empty command`);
  const promptPath = promptPathFor(job);
  const startedAt = new Date().toISOString();

  if (opts.background) {
    const runner = findRunner();
    const child = execa(process.execPath, [runner, bin, ...args], {
      cwd: job.cwd,
      detached: true,
      cleanup: false,
      stdio: "ignore",
      env: {
        ...spec.env,
        MAAAW_PROMPT_FILE: promptPath,
        MAAAW_LOG_FILE: job.logPath ?? "",
        MAAAW_EXIT_FILE: exitFilePath(cwd, job),
        MAAAW_STDIN: spec.promptVia === "stdin" ? "1" : "0",
      },
    });
    const pid = child.pid;
    // The detached child is tracked via the exit file, not this promise —
    // swallow its rejection (e.g. SIGTERM on cancel) to avoid unhandled errors.
    child.catch(() => {});
    child.unref();
    return updateJob(cwd, id, { status: "running", ...(pid ? { pid } : {}), startedAt });
  }

  await updateJob(cwd, id, { status: "running", startedAt });
  const prompt = existsSync(promptPath) ? readFileSync(promptPath, "utf-8") : "";
  const result = await execa(bin, args, {
    cwd: job.cwd,
    ...(spec.promptVia === "stdin" ? { input: prompt } : {}),
    env: { ...process.env, ...spec.env },
    timeout: 3_600_000,
    reject: false,
    all: true,
  });
  if (job.logPath) writeFileAtomic(job.logPath, result.all ?? "");
  const running = loadJob(cwd, id);
  if (running?.status === "cancelled") return running;
  return finalizeJob(cwd, { ...job, startedAt }, result.exitCode ?? 1);
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Reconcile a background job's state (exit file / liveness), then return it. */
export async function reconcileJob(cwd: string, id: string): Promise<JobRecord | null> {
  // Serialized per job: concurrent reconciles (status list + result) must not
  // both consume the exit file and double-finalize (double oracle run).
  return withLock(`${jobPath(cwd, id)}.reconcile`, async () => {
    const job = loadJob(cwd, id);
    if (!job || job.status !== "running") return job;

    const exitFile = exitFilePath(cwd, job);
    if (existsSync(exitFile)) {
      const exitCode = Number(readFileSync(exitFile, "utf-8").trim());
      rmSync(exitFile, { force: true });
      return finalizeJob(cwd, job, Number.isFinite(exitCode) ? exitCode : 1);
    }
    if (job.pid && !pidAlive(job.pid)) {
      // Crashed without writing an exit code.
      return finalizeJob(cwd, job, 1);
    }
    return job;
  });
}

/** Cancel a running job: kill the whole process tree, mark cancelled. */
export async function cancelJob(cwd: string, id: string): Promise<JobRecord> {
  const job = loadJob(resolve(cwd), id);
  if (!job) throw new Error(`Job not found: ${id}`);
  if (job.status !== "running" && job.status !== "prepared") {
    throw new Error(`Job ${id} is ${job.status}; nothing to cancel`);
  }
  if (job.pid) {
    await new Promise<void>((resolvePromise) => {
      treeKill(job.pid as number, "SIGTERM", () => resolvePromise());
    });
  }
  return updateJob(resolve(cwd), id, { status: "cancelled", endedAt: new Date().toISOString() });
}

/** Remove a write-mode job's worktree (kept by default for inspection). */
export async function cleanupWorktree(cwd: string, id: string): Promise<void> {
  const job = loadJob(resolve(cwd), id);
  if (!job?.worktree) return;
  if (existsSync(job.worktree)) {
    try {
      await execa("git", ["worktree", "remove", "--force", job.worktree], {
        cwd: resolve(cwd),
        timeout: 60_000,
      });
    } catch {
      rmSync(job.worktree, { recursive: true, force: true });
      await execa("git", ["worktree", "prune"], { cwd: resolve(cwd), timeout: 60_000 }).catch(
        () => {},
      );
    }
  }
}
