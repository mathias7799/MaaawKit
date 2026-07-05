/**
 * Canonical rules model — one source assembled from `.agent/rules.md`
 * (human rules + promoted memory), detected repo facts (stacks, verification
 * commands), and the memory digest. Converters compile this into every tool's
 * native format; nothing is authored per-tool.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig } from "../config/index.js";
import { buildDigest } from "../memory/retrieval.js";
import { agentPaths } from "../state/index.js";
import { VERSION } from "../version.js";

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "bin",
  "obj",
  ".venv",
  "venv",
  "__pycache__",
  ".next",
  "dist",
  "build",
  ".agent",
  ".agents",
  ".codex",
  "coverage",
]);

export type Stack = "dotnet" | "node" | "python" | "powershell";

export function detectStacks(root: string): Stack[] {
  const names = new Set<string>();
  const walk = (dir: string, depth: number): void => {
    if (depth > 6 || names.size > 5000) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue;
      const p = join(dir, name);
      try {
        if (statSync(p).isDirectory()) walk(p, depth + 1);
        else names.add(name);
      } catch {
        // unreadable entry
      }
    }
  };
  walk(root, 0);

  const stacks: Stack[] = [];
  const any = (pred: (n: string) => boolean) => [...names].some(pred);
  if (any((n) => n.endsWith(".csproj") || n.endsWith(".sln") || n.endsWith(".slnx")))
    stacks.push("dotnet");
  if (names.has("package.json")) stacks.push("node");
  if (names.has("pyproject.toml") || any((n) => n.endsWith(".py"))) stacks.push("python");
  if (any((n) => n.endsWith(".ps1") || n.endsWith(".psm1"))) stacks.push("powershell");
  return stacks;
}

export const LANG_RULES: Record<Stack, string> = {
  dotnet:
    "- C#: nullable enabled; warnings as errors; async all the way (no .Result/.Wait()); " +
    "cancellation tokens on long ops; AsNoTracking on read-only EF queries.",
  node:
    "- TypeScript: strict; no `any`, no `as`-casts to silence errors; validate I/O boundaries; " +
    "React: server components by default, derive state over effect-syncing.",
  python:
    "- Python: typed public signatures; ruff clean; pathlib; specific exceptions with " +
    "`raise ... from`; no mutable default args.",
  powershell:
    "- PowerShell 7+: Set-StrictMode Latest + $ErrorActionPreference='Stop' in every script; " +
    "[CmdletBinding()]; ShouldProcess on destructive functions; check $LASTEXITCODE.",
};

export interface DetectedCommands {
  verified: string[];
  inferred: string[];
}

export function detectCommands(
  root: string,
  stacks: Stack[],
  oracle: string | undefined,
): DetectedCommands {
  const cmds: string[] = [];
  if (stacks.includes("dotnet")) cmds.push("dotnet build -warnaserror", "dotnet test");
  if (stacks.includes("node")) {
    let scripts: Record<string, unknown> = {};
    try {
      scripts = (
        JSON.parse(readFileSync(join(root, "package.json"), "utf-8")) as Record<string, unknown>
      )["scripts"] as Record<string, unknown>;
    } catch {
      // no readable package.json
    }
    scripts = scripts ?? {};
    for (const s of ["lint", "test", "build", "typecheck"]) {
      if (s in scripts) cmds.push(`npm run ${s}`);
    }
    if (!("typecheck" in scripts)) cmds.push("npx tsc --noEmit");
  }
  if (stacks.includes("python")) cmds.push("ruff check .", "pytest -q");
  if (stacks.includes("powershell")) {
    cmds.push(
      'pwsh -NoProfile -c "Invoke-ScriptAnalyzer -Path . -Recurse -Severity Warning,Error; ' +
        'if (Test-Path ./tests) { Invoke-Pester -CI }"',
    );
  }
  const verified: string[] = [];
  if (oracle) {
    verified.push(oracle);
    if (!cmds.includes(oracle)) cmds.unshift(oracle);
  }
  return { verified, inferred: cmds.filter((c) => !verified.includes(c)) };
}

export interface CanonicalRules {
  stacks: Stack[];
  languageRules: string[];
  verifiedCommands: string[];
  inferredCommands: string[];
  /** Full .agent/rules.md content (human rules + promoted memory block). */
  rulesText: string;
  /** Budgeted memory digest content ("" when no memory). */
  memoryDigest: string;
  /** Engine version stamp — stable across days so double-run = zero diff. */
  generatedOn: string;
}

/** Assemble the canonical model. Pure inputs come from disk + config. */
export function buildCanonicalRules(cwd: string): CanonicalRules {
  const { config } = resolveConfig({ cwd });
  const paths = agentPaths(cwd);
  const stacks = config.stacks.length > 0 ? config.stacks : detectStacks(cwd);
  const commands = detectCommands(cwd, stacks, config.oracle);
  const rulesText = existsSync(paths.rulesFile)
    ? readFileSync(paths.rulesFile, "utf-8").trim()
    : "";
  const memoryDigest = existsSync(paths.recordsDir) ? buildDigest(cwd).content.trim() : "";
  return {
    stacks,
    languageRules: stacks.map((s) => LANG_RULES[s]),
    verifiedCommands: commands.verified,
    inferredCommands: commands.inferred,
    rulesText,
    memoryDigest,
    generatedOn: VERSION,
  };
}
