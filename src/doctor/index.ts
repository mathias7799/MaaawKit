/**
 * maaaw doctor — environment, config, and state diagnosis. Each check returns
 * ok/warn/fail with an actionable detail line. Later phases append panels
 * (adapters in Phase 3, memory health in Phase 4, rules drift in Phase 5).
 */

import { constants, accessSync, existsSync, statSync } from "node:fs";
import { execa } from "execa";
import { resolveConfig } from "../config/index.js";
import { agentPaths } from "../state/index.js";

export type CheckStatus = "ok" | "warn" | "fail";

export interface DoctorCheck {
  name: string;
  status: CheckStatus;
  detail: string;
}

export interface DoctorReport {
  checks: DoctorCheck[];
  healthy: boolean;
}

const MIN_NODE_MAJOR = 20;

export async function runDoctor(
  cwd: string,
  env: Record<string, string | undefined> = process.env,
): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];

  // --- environment ---
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push(
    nodeMajor >= MIN_NODE_MAJOR
      ? { name: "node", status: "ok", detail: `v${process.versions.node}` }
      : {
          name: "node",
          status: "fail",
          detail: `v${process.versions.node} — MaaawKit needs Node >= ${MIN_NODE_MAJOR}`,
        },
  );

  try {
    const { stdout } = await execa("git", ["--version"], { timeout: 10_000 });
    checks.push({ name: "git", status: "ok", detail: stdout.trim() });
    try {
      await execa("git", ["rev-parse", "--is-inside-work-tree"], { cwd, timeout: 10_000 });
      checks.push({ name: "git repo", status: "ok", detail: "inside a work tree" });
    } catch {
      checks.push({
        name: "git repo",
        status: "warn",
        detail: "not a git repository — bridge write modes and stop-verify trust gating need git",
      });
    }
  } catch {
    checks.push({
      name: "git",
      status: "fail",
      detail: "git not found on PATH — required for bridge isolation and loop trust gating",
    });
  }

  // --- config ---
  const resolved = resolveConfig({ cwd, env });
  if (resolved.errors.length > 0) {
    for (const e of resolved.errors) {
      checks.push({
        name: `config (${e.layer})`,
        status: "fail",
        detail: `${e.path ?? ""} ${e.message}`.trim(),
      });
    }
  } else {
    checks.push({
      name: "config",
      status: "ok",
      detail: `layers: ${resolved.layers.join(" < ")}; guardLevel=${resolved.config.guardLevel}`,
    });
  }

  // --- state ---
  const paths = agentPaths(cwd);
  if (existsSync(paths.root)) {
    if (!statSync(paths.root).isDirectory()) {
      checks.push({
        name: ".agent/",
        status: "fail",
        detail: ".agent exists but is not a directory",
      });
    } else {
      try {
        accessSync(paths.root, constants.W_OK);
        checks.push({ name: ".agent/", status: "ok", detail: "present and writable" });
      } catch {
        checks.push({ name: ".agent/", status: "fail", detail: ".agent/ is not writable" });
      }
    }
    if (existsSync(paths.kitConfig)) {
      checks.push({ name: ".agent/kit.json", status: "ok", detail: "present" });
    } else {
      checks.push({
        name: ".agent/kit.json",
        status: "warn",
        detail: "no repo config — run `maaaw init` (or /kit-setup) to create one",
      });
    }
  } else {
    checks.push({
      name: ".agent/",
      status: "warn",
      detail: "not initialized — run `maaaw init` to create the state directory",
    });
  }

  // --- memory health ---
  if (existsSync(paths.recordsDir)) {
    try {
      const { buildDigest, memoryHealth } = await import("../memory/index.js");
      const digest = buildDigest(cwd);
      const health = memoryHealth(cwd, digest.tokens);
      const status = health.stalePercent > 50 ? "warn" : "ok";
      checks.push({
        name: "memory",
        status,
        detail:
          `${health.total} record(s): ${health.active} active, ${health.stale} stale (${health.stalePercent}%), ` +
          `${health.promoted} promoted, ${health.archived} archived; digest ~${health.digestTokens} tokens` +
          (health.promotionCandidates > 0
            ? `; ${health.promotionCandidates} promotion candidate(s) — run \`maaaw memory review\``
            : ""),
      });
    } catch {
      checks.push({ name: "memory", status: "warn", detail: "memory health check failed" });
    }
  }

  // --- adapters ---
  try {
    const { detectAdapters } = await import("../bridge/adapters.js");
    const found = (await detectAdapters(cwd)).filter((a) => a.available);
    checks.push({
      name: "bridge adapters",
      status: "ok",
      detail: found.length
        ? found
            .map((a) => `${a.id}${a.verifiedAgainst === "unverified" ? " (unverified spec)" : ""}`)
            .join(", ")
        : "none detected — install codex/gemini/etc. or add .agent/bridge/adapters.json overrides",
    });
  } catch {
    checks.push({ name: "bridge adapters", status: "warn", detail: "detection failed" });
  }

  const healthy = checks.every((c) => c.status !== "fail");
  return { checks, healthy };
}
