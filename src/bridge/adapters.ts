/**
 * Adapter registry — six built-in vendor CLI specs plus user overrides from
 * .agent/bridge/adapters.json (vendor flags drift faster than releases, so
 * config outlives us being right). `verifiedAgainst` is honest metadata:
 * "unverified" specs are best-effort and surfaced as such by doctor.
 */

import { spawnSync } from "node:child_process";
import { relative } from "node:path";
import { execa } from "execa";
import { evaluateCommand } from "../hooks/guard.js";
import { type AdapterSpec, AdapterSpecSchema } from "../schemas/index.js";
import { agentPaths, readJsonFileDetailed } from "../state/index.js";

/**
 * Trust gate for repo-local executable config — same threat model as the
 * stop-verify loop file: a file committed into a cloned repo is exactly the
 * attack vector; locally created ones are untracked.
 */
export function isGitTracked(path: string, cwd: string): boolean {
  try {
    const rel = relative(cwd, path);
    const r = spawnSync("git", ["ls-files", "--error-unmatch", "--", rel], {
      cwd,
      timeout: 10_000,
      stdio: "ignore",
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

export const BUILTIN_ADAPTERS: Record<string, AdapterSpec> = {
  codex: AdapterSpecSchema.parse({
    id: "codex",
    bin: "codex",
    promptVia: "stdin",
    outputVia: "file",
    readArgs: ["exec", "--sandbox", "read-only", "--output-last-message", "{outputFile}", "-"],
    writeArgs: [
      "exec",
      "--sandbox",
      "workspace-write",
      "--output-last-message",
      "{outputFile}",
      "-",
    ],
    resumeArgs: ["exec", "resume", "{threadId}", "-"],
    verifiedAgainst:
      "cross-checked vs openai/codex-plugin-cc (sandbox mode names confirmed; that plugin uses the app-server RPC, so exec flags still need a live smoke test)",
    notes:
      "Sandbox names read-only/workspace-write confirmed against the reference plugin. " +
      "The reference integrates via `codex app-server` JSON-RPC (streaming, outputSchema, turn/interrupt) — a future adapter mode.",
  }),
  claude: AdapterSpecSchema.parse({
    id: "claude",
    bin: "claude",
    promptVia: "stdin",
    outputVia: "stdout",
    readArgs: ["-p"],
    writeArgs: ["-p", "--permission-mode", "acceptEdits"],
    resumeArgs: ["-p", "--resume", "{threadId}"],
    verifiedAgainst: "unverified",
  }),
  copilot: AdapterSpecSchema.parse({
    id: "copilot",
    bin: "copilot",
    promptVia: "arg",
    outputVia: "stdout",
    readArgs: ["-p", "{prompt}"],
    writeArgs: ["-p", "{prompt}", "--allow-all-tools"],
    verifiedAgainst: "unverified",
  }),
  cursor: AdapterSpecSchema.parse({
    id: "cursor",
    bin: "cursor-agent",
    promptVia: "arg",
    outputVia: "stdout",
    readArgs: ["-p", "{prompt}"],
    writeArgs: ["-p", "{prompt}", "--force"],
    verifiedAgainst: "unverified",
  }),
  gemini: AdapterSpecSchema.parse({
    id: "gemini",
    bin: "gemini",
    promptVia: "arg",
    outputVia: "stdout",
    readArgs: ["-p", "{prompt}"],
    writeArgs: ["-p", "{prompt}", "--yolo"],
    verifiedAgainst: "unverified",
  }),
  opencode: AdapterSpecSchema.parse({
    id: "opencode",
    bin: "opencode",
    promptVia: "arg",
    outputVia: "stdout",
    readArgs: ["run", "{prompt}"],
    writeArgs: ["run", "{prompt}"],
    verifiedAgainst: "unverified",
  }),
};

/** True when adapter overrides were present but refused (doctor surfaces it). */
export function adapterOverridesRefused(cwd: string): boolean {
  const file = agentPaths(cwd).adaptersFile;
  return readJsonFileDetailed(file).ok && isGitTracked(file, cwd);
}

export function adapterOverridesError(cwd: string): string | null {
  const file = agentPaths(cwd).adaptersFile;
  const result = readJsonFileDetailed(file);
  return result.ok || result.reason === "missing" ? null : result.message;
}

/**
 * Built-ins merged with .agent/bridge/adapters.json overrides. Overrides are
 * REFUSED when the file is tracked in git (cloned-repo attack vector — the
 * same gate the loop file gets); create it locally and keep it untracked.
 */
export function loadAdapters(cwd: string): Record<string, AdapterSpec> {
  const adapters: Record<string, AdapterSpec> = { ...BUILTIN_ADAPTERS };
  const adaptersFile = agentPaths(cwd).adaptersFile;
  const read = readJsonFileDetailed<Record<string, unknown>>(adaptersFile);
  const overrides = read.ok ? read.value : null;
  if (overrides && isGitTracked(adaptersFile, cwd)) {
    return adapters; // refused — builtin specs only
  }
  if (overrides && typeof overrides === "object") {
    for (const [id, raw] of Object.entries(overrides)) {
      const parsed = AdapterSpecSchema.safeParse({
        ...(BUILTIN_ADAPTERS[id] ?? {}),
        ...(typeof raw === "object" && raw !== null ? raw : {}),
        id,
      });
      if (parsed.success) adapters[id] = parsed.data;
    }
  }
  return adapters;
}

export function getAdapter(cwd: string, id: string): AdapterSpec {
  const adapter = loadAdapters(cwd)[id];
  if (!adapter) {
    const known = Object.keys(loadAdapters(cwd)).sort().join(", ");
    throw new Error(`Unknown agent "${id}". Known adapters: ${known}`);
  }
  return adapter;
}

export interface AdapterAvailability {
  id: string;
  bin: string;
  available: boolean;
  version?: string;
  verifiedAgainst: string;
}

/** Probe one adapter's CLI (used by `maaaw bridge detect` and doctor). */
export async function detectAdapter(spec: AdapterSpec): Promise<AdapterAvailability> {
  // Guard-screen the probe argv before executing anything — adapter specs are
  // config, and config never gets to run deny-level commands.
  const probe = [spec.bin, ...spec.baseArgs, ...spec.detectArgs].join(" ");
  if (evaluateCommand(probe).decision === "deny") {
    return { id: spec.id, bin: spec.bin, available: false, verifiedAgainst: spec.verifiedAgainst };
  }
  try {
    const result = await execa(spec.bin, [...spec.baseArgs, ...spec.detectArgs], {
      timeout: 10_000,
      reject: false,
    });
    const available = result.exitCode === 0;
    const version = (result.stdout || result.stderr || "").split("\n")[0]?.trim();
    return {
      id: spec.id,
      bin: spec.bin,
      available,
      ...(available && version ? { version } : {}),
      verifiedAgainst: spec.verifiedAgainst,
    };
  } catch {
    return { id: spec.id, bin: spec.bin, available: false, verifiedAgainst: spec.verifiedAgainst };
  }
}

export async function detectAdapters(cwd: string): Promise<AdapterAvailability[]> {
  const adapters = loadAdapters(cwd);
  return Promise.all(Object.values(adapters).map(detectAdapter));
}

/** Substitute {prompt}/{outputFile}/{threadId} placeholders in an args template. */
export function substituteArgs(
  args: readonly string[],
  values: { prompt?: string; outputFile?: string; threadId?: string },
): string[] {
  return args.map((a) =>
    a
      .replaceAll("{prompt}", values.prompt ?? "")
      .replaceAll("{outputFile}", values.outputFile ?? "")
      .replaceAll("{threadId}", values.threadId ?? ""),
  );
}
