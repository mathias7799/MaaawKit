/**
 * Hook runtime — the I/O layer the shims call into via `import("maaawkit/hooks")`.
 * One entry point, `runHook(kind, rawInput)`, covering all four hook events.
 * Contract: output (if any) goes to stdout as the hook JSON/text; exit code is
 * always 0 — hooks communicate decisions via JSON, never via exit codes, and
 * must never break the session.
 */

import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { execa } from "execa";
import { resolveConfig } from "../config/index.js";
import { agentPaths } from "../state/index.js";
import { writeJsonFile } from "../state/index.js";
import { evaluateToolUse, toGuardHookOutput } from "./guard.js";
import { runTrustedOracle } from "./oracle.js";
import {
  MAX_FEEDBACK_CHARS,
  POST_EDIT_TIMEOUT_MS,
  extractPaths,
  languageFor,
  toPostEditHookOutput,
} from "./post-edit.js";
import { type LoopContext, buildSessionContext } from "./session-context.js";
import {
  DEFAULT_TIMEOUT_SECONDS,
  type LoopState,
  type OracleResult,
  afterOracle,
  budgetExhausted,
  parseLoopState,
  trustRefusal,
} from "./stop-verify.js";

export type HookKind = "guard" | "post-edit" | "stop-verify" | "session-context";

export interface HookRunResult {
  stdout: string;
}

interface HookInput {
  cwd?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

function parseInput(rawInput: string): HookInput {
  try {
    const parsed: unknown = JSON.parse(rawInput);
    if (typeof parsed === "object" && parsed !== null) return parsed as HookInput;
  } catch {
    // malformed input never breaks the session
  }
  return {};
}

/** The one loop-file location (3.0 is a clean break — no 2.6 fallbacks). */
function findLoopFile(cwd: string): string | null {
  const p = join(cwd, ".agent", "loop.json");
  return existsSync(p) && statSync(p).isFile() ? p : null;
}

// ---------- guard ----------

async function runGuard(input: HookInput, cwd: string): Promise<string> {
  const toolName = input.tool_name ?? "";
  const toolInput = input.tool_input ?? {};
  const { config } = resolveConfig({ cwd });
  const decision = evaluateToolUse(
    { toolName, toolInput },
    { level: config.guardLevel, customBashRules: config.guardCustomRules },
  );
  return toGuardHookOutput(decision) ?? "";
}

// ---------- post-edit ----------

type Runner = (
  cmd: string[],
  cwd?: string,
) => Promise<{ exitCode: number; output: string; missing: boolean }>;

const defaultRunner: Runner = async (cmd, cwd) => {
  const [bin, ...args] = cmd;
  if (!bin) return { exitCode: 0, output: "", missing: true };
  try {
    const result = await execa(bin, args, {
      ...(cwd ? { cwd } : {}),
      timeout: POST_EDIT_TIMEOUT_MS,
      reject: false,
      all: true,
    });
    if (result.failed && (result as { code?: string }).code === "ENOENT") {
      return { exitCode: 0, output: "", missing: true };
    }
    if (result.timedOut) return { exitCode: 0, output: "", missing: false };
    return { exitCode: result.exitCode ?? 0, output: (result.all ?? "").trim(), missing: false };
  } catch {
    return { exitCode: 0, output: "", missing: true };
  }
};

function nearestDir(startDir: string, predicate: (dir: string) => boolean): string | null {
  let d = startDir;
  for (let i = 0; i < 15; i++) {
    if (predicate(d)) return d;
    const parent = dirname(d);
    if (parent === d) return null;
    d = parent;
  }
  return null;
}

function hasAny(dir: string, patterns: string[]): boolean {
  try {
    const files = readdirSync(dir);
    return patterns.some((p) =>
      p.includes("*")
        ? files.some((f) =>
            new RegExp(`^${p.replace(/[.]/g, "\\.").replace(/\*/g, ".*")}$`).test(f),
          )
        : files.includes(p),
    );
  } catch {
    return false;
  }
}

function packageJsonHasKey(dir: string, key: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8")) as Record<
      string,
      unknown
    >;
    return key in pkg;
  } catch {
    return false;
  }
}

async function checkPython(path: string, run: Runner): Promise<string[]> {
  const problems: string[] = [];
  await run(["ruff", "format", "--quiet", path]);
  const { exitCode, output } = await run(["ruff", "check", "--fix", path]);
  if (exitCode !== 0 && output) problems.push(`[ruff] ${output}`);
  return problems;
}

async function checkTypescript(path: string, run: Runner): Promise<string[]> {
  const problems: string[] = [];
  const proj = nearestDir(dirname(path), (d) => existsSync(join(d, "package.json")));
  if (!proj) return problems;
  // Only run tools the repo opted into — config-less globals would fight repo style.
  if (hasAny(proj, [".prettierrc*", "prettier.config.*"]) || packageJsonHasKey(proj, "prettier")) {
    await run(["prettier", "--write", "--log-level", "silent", path]);
  }
  if (hasAny(proj, ["eslint.config.*", ".eslintrc*"]) || packageJsonHasKey(proj, "eslintConfig")) {
    const { exitCode, output } = await run(["eslint", "--fix", path], proj);
    if (exitCode !== 0 && output) problems.push(`[eslint] ${output}`);
  }
  // Full tsc is too slow per-edit; the Stop-hook oracle covers type errors.
  return problems;
}

async function checkCsharp(path: string, run: Runner): Promise<string[]> {
  const problems: string[] = [];
  const proj = nearestDir(dirname(path), (d) => hasAny(d, ["*.csproj", "*.sln", "*.slnx"]));
  if (!proj) return problems;
  const verify = [
    "dotnet",
    "format",
    "--include",
    path,
    "--verify-no-changes",
    "--verbosity",
    "quiet",
  ];
  const first = await run(verify, proj);
  if (first.missing || first.exitCode === 0) return problems;
  await run(["dotnet", "format", "--include", path, "--verbosity", "quiet"], proj);
  const second = await run(verify, proj);
  if (second.exitCode !== 0 && (second.output || first.output)) {
    problems.push(`[dotnet format] ${second.output || first.output}`);
  }
  return problems;
}

async function checkPowershell(path: string, run: Runner): Promise<string[]> {
  const problems: string[] = [];
  // PowerShell escapes ' inside single-quoted strings by doubling it.
  const psPath = path.replaceAll("'", "''");
  const script = `if (Get-Module -ListAvailable PSScriptAnalyzer) { Invoke-ScriptAnalyzer -Path '${psPath}' -Severity Warning,Error | ForEach-Object { "$($_.Severity) $($_.RuleName) L$($_.Line): $($_.Message)" } }`;
  for (const shell of ["pwsh", "powershell"]) {
    const { output, missing } = await run([
      shell,
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      script,
    ]);
    if (missing) continue;
    if (output) problems.push(`[PSScriptAnalyzer] ${output}`);
    break;
  }
  return problems;
}

const CHECKERS: Record<string, (path: string, run: Runner) => Promise<string[]>> = {
  python: checkPython,
  typescript: checkTypescript,
  csharp: checkCsharp,
  powershell: checkPowershell,
};

export async function runPostEdit(
  input: HookInput,
  runner: Runner = defaultRunner,
): Promise<string> {
  const paths = extractPaths(input.tool_input ?? {});
  const problems: string[] = [];
  let lastFile = "";
  for (const path of paths) {
    const language = languageFor(path);
    if (!language || !existsSync(path) || !statSync(path).isFile()) continue;
    const checker = CHECKERS[language];
    if (!checker) continue;
    lastFile = basename(path);
    problems.push(...(await checker(path, runner)));
  }
  if (problems.length === 0) return "";
  return toPostEditHookOutput(lastFile, [problems.join("\n").slice(0, MAX_FEEDBACK_CHARS)]) ?? "";
}

// ---------- stop-verify ----------

async function gitTracked(path: string, cwd: string): Promise<boolean> {
  try {
    const rel = path.startsWith(cwd) ? path.slice(cwd.length + 1) : path;
    const result = await execa("git", ["ls-files", "--error-unmatch", "--", rel], {
      cwd,
      timeout: 10_000,
      reject: false,
    });
    return result.exitCode === 0;
  } catch {
    return false; // no git / error -> treat as untracked
  }
}

async function runOracle(
  oracle: string,
  cwd: string,
  timeoutSeconds: number,
): Promise<OracleResult> {
  const result = await runTrustedOracle(oracle, cwd, timeoutSeconds * 1000);
  return {
    passed: result.passed,
    output: result.output,
    startedAt: result.startedAt,
    endedAt: result.endedAt,
  };
}

async function runStopVerify(cwd: string): Promise<string> {
  const statePath = findLoopFile(cwd);
  if (!statePath) return "";

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(statePath, "utf-8"));
  } catch {
    raw = null;
  }
  const state = raw === null ? null : parseLoopState(raw);
  if (!state) {
    rmSync(statePath, { force: true });
    process.stderr.write("loop file invalid; loop cancelled.\n");
    return "";
  }

  const relPath = statePath.startsWith(cwd) ? statePath.slice(cwd.length + 1) : statePath;
  const refusal = trustRefusal(state, await gitTracked(statePath, cwd), relPath);
  if (refusal) return JSON.stringify({ systemMessage: refusal });

  const exhausted = budgetExhausted(state);
  if (exhausted) {
    rmSync(statePath, { force: true });
    return JSON.stringify({ systemMessage: exhausted });
  }

  const timeout = state.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS;
  const result = await runOracle(state.oracle, cwd, timeout);
  const decision = await afterOracle(state, result);

  if (decision.kind === "allow-stop-with-message") {
    if (decision.deleteLoopFile) rmSync(statePath, { force: true });
    return JSON.stringify({ systemMessage: decision.message });
  }
  if (decision.kind === "block") {
    writeJsonFile(statePath, decision.newState);
    return JSON.stringify({ decision: "block", reason: decision.reason });
  }
  return "";
}

// ---------- session-context ----------

async function git(args: string[], cwd: string): Promise<string> {
  try {
    const result = await execa("git", args, { cwd, timeout: 10_000, reject: false });
    return result.exitCode === 0 ? (result.stdout ?? "").trim() : "";
  } catch {
    return "";
  }
}

async function runSessionContext(cwd: string): Promise<string> {
  const insideWorkTree = (await git(["rev-parse", "--is-inside-work-tree"], cwd)) === "true";
  const gitCtx = insideWorkTree
    ? {
        insideWorkTree,
        branch: await git(["branch", "--show-current"], cwd),
        dirtyFiles: (await git(["status", "--porcelain"], cwd)).split("\n").filter(Boolean).length,
        recentCommits: (await git(["log", "--oneline", "-3"], cwd)).split("\n").filter(Boolean),
      }
    : { insideWorkTree: false };

  let loop: LoopContext | undefined;
  const loopPath = findLoopFile(cwd);
  if (loopPath) {
    try {
      const st = JSON.parse(readFileSync(loopPath, "utf-8")) as Record<string, unknown>;
      loop = {
        oracle: String(st["oracle"] ?? ""),
        iteration: Number(st["iteration"] ?? 0),
        maxIterations: Number(st["max_iterations"] ?? 0),
      };
    } catch {
      // unreadable loop file — ignore
    }
  }

  const paths = agentPaths(cwd);
  const handoffExists = existsSync(paths.handoffMd);

  // Rebuild the digest live so path-overlap ranking reflects current work;
  // fall back to the last written digest.md if the rebuild fails.
  let memoryDigest: string | undefined;
  try {
    if (!existsSync(paths.recordsDir)) throw new Error("no memory records");
    const { gitChangedFiles } = await import("../git.js");
    const { buildDigest } = await import("../memory/retrieval.js");
    const changedFiles = await gitChangedFiles(cwd);
    memoryDigest = buildDigest(cwd, { changedFiles }).content;
  } catch {
    if (existsSync(paths.memoryDigest)) {
      try {
        memoryDigest = readFileSync(paths.memoryDigest, "utf-8");
      } catch {
        // ignore
      }
    }
  }

  const context = buildSessionContext({ git: gitCtx, loop, handoffExists, memoryDigest });
  return context ?? "";
}

// ---------- entry point ----------

export async function runHook(
  kind: HookKind,
  rawInput: string,
  opts: { cwd?: string } = {},
): Promise<HookRunResult> {
  const input = parseInput(rawInput);
  const cwd = input.cwd ?? opts.cwd ?? process.cwd();
  try {
    switch (kind) {
      case "guard":
        return { stdout: await runGuard(input, cwd) };
      case "post-edit":
        return { stdout: await runPostEdit(input) };
      case "stop-verify":
        return { stdout: await runStopVerify(cwd) };
      case "session-context":
        return { stdout: await runSessionContext(cwd) };
    }
  } catch {
    if (kind === "guard") {
      return { stdout: runGuardFallback(input) };
    }
    // Hooks must never break the session; fail open (allow).
    return { stdout: "" };
  }
}

function runGuardFallback(input: HookInput): string {
  const toolName = input.tool_name ?? "";
  const toolInput = input.tool_input ?? {};
  const decision = evaluateToolUse({ toolName, toolInput });
  return toGuardHookOutput(decision) ?? "";
}
