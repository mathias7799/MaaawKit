/**
 * Adapter registry — six built-in vendor CLI specs plus user overrides from
 * .agent/bridge/adapters.json (vendor flags drift faster than releases, so
 * config outlives us being right). `verifiedAgainst` is honest metadata:
 * "unverified" specs are best-effort and surfaced as such by doctor.
 */

import { execa } from "execa";
import { type AdapterSpec, AdapterSpecSchema } from "../schemas/index.js";
import { agentPaths, readJsonFile } from "../state/index.js";

export const BUILTIN_ADAPTERS: Record<string, AdapterSpec> = {
  codex: AdapterSpecSchema.parse({
    id: "codex",
    bin: "codex",
    promptVia: "stdin",
    outputVia: "file",
    readArgs: ["exec", "--sandbox", "read-only", "-o", "{outputFile}", "-"],
    writeArgs: ["exec", "--sandbox", "workspace-write", "-o", "{outputFile}", "-"],
    resumeArgs: ["exec", "resume", "{threadId}", "-"],
    verifiedAgainst: "codex-cli exec surface, 2.6-era flags",
    notes: "The only adapter with a real-world smoke test on record (2.6 codex-worker).",
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

/** Built-ins merged with .agent/bridge/adapters.json overrides. */
export function loadAdapters(cwd: string): Record<string, AdapterSpec> {
  const adapters: Record<string, AdapterSpec> = { ...BUILTIN_ADAPTERS };
  const overrides = readJsonFile<Record<string, unknown>>(agentPaths(cwd).adaptersFile);
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
