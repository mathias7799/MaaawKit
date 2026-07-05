/**
 * Convert & install: render the canonical rules into every tool format and
 * place artifacts where each detected tool reads them. Backups on first
 * touch, marker-managed regions only, double-run = zero diff.
 */

import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildCanonicalRules } from "../rules/index.js";
import { writeFileAtomic } from "../state/index.js";
import { GEN_BEGIN, GEN_END, extractBetween } from "./markers.js";
import {
  CONVERT_TARGETS,
  type ConvertTarget,
  mergeIntoExisting,
  renderRulesBody,
} from "./targets.js";

export interface InstallOptions {
  cwd: string;
  /** Install only these target ids. */
  tools?: string[] | undefined;
  /** Install every target regardless of detection. */
  all?: boolean;
  /** Render/report but do not write. */
  dryRun?: boolean;
}

export interface InstallAction {
  tool: string;
  relPath: string;
  action: "created" | "updated" | "unchanged" | "skipped (not detected)";
}

export interface InstallReport {
  actions: InstallAction[];
  warnings: string[];
  body: string;
}

function selectTargets(opts: InstallOptions): readonly ConvertTarget[] {
  if (opts.tools && opts.tools.length > 0) {
    const unknown = opts.tools.filter((t) => !CONVERT_TARGETS.some((c) => c.id === t));
    if (unknown.length > 0) {
      throw new Error(
        `Unknown tool(s): ${unknown.join(", ")}. Known: ${CONVERT_TARGETS.map((c) => c.id).join(", ")}`,
      );
    }
    return CONVERT_TARGETS.filter((c) => opts.tools?.includes(c.id));
  }
  return CONVERT_TARGETS;
}

/** Render + place artifacts into detected (or selected) tool locations. */
export function installRules(opts: InstallOptions): InstallReport {
  const { cwd } = opts;
  const rules = buildCanonicalRules(cwd);
  const body = renderRulesBody(rules);
  const warnings: string[] = [];
  const actions: InstallAction[] = [];

  for (const target of selectTargets(opts)) {
    const detected = opts.all || (opts.tools?.length ?? 0) > 0 || target.detect(cwd);
    if (!detected) {
      actions.push({ tool: target.id, relPath: target.relPath, action: "skipped (not detected)" });
      continue;
    }
    const path = join(cwd, target.relPath);
    const existing = existsSync(path) ? readFileSync(path, "utf-8") : null;
    const next =
      existing === null ? target.freshFile(body) : mergeIntoExisting(existing, body, target);

    if (target.id === "agentsmd" && Buffer.byteLength(next, "utf-8") > AGENTS_BUDGET_BYTES) {
      warnings.push(
        `AGENTS.md is ${Buffer.byteLength(next, "utf-8")}B (budget ${AGENTS_BUDGET_BYTES}B; Codex default project-doc cap is 32KiB) — trim rules.md or curate memory`,
      );
    }

    if (existing !== null && next === existing) {
      actions.push({ tool: target.id, relPath: target.relPath, action: "unchanged" });
      continue;
    }
    if (!opts.dryRun) {
      if (existing !== null && !existsSync(`${path}.bak`)) {
        copyFileSync(path, `${path}.bak`);
      }
      writeFileAtomic(path, next);
    }
    actions.push({
      tool: target.id,
      relPath: target.relPath,
      action: existing === null ? "created" : "updated",
    });
  }
  return { actions, warnings, body };
}

const AGENTS_BUDGET_BYTES = 24_000;

export interface DriftEntry {
  tool: string;
  relPath: string;
  state: "in-sync" | "drifted" | "missing-markers" | "absent";
}

/** Compare installed managed blocks against the current canonical render. */
export function rulesDrift(cwd: string): DriftEntry[] {
  const body = renderRulesBody(buildCanonicalRules(cwd));
  const entries: DriftEntry[] = [];
  for (const target of CONVERT_TARGETS) {
    if (!target.detect(cwd)) continue;
    const path = join(cwd, target.relPath);
    if (!existsSync(path)) {
      entries.push({ tool: target.id, relPath: target.relPath, state: "absent" });
      continue;
    }
    const installed = extractBetween(readFileSync(path, "utf-8"), GEN_BEGIN, GEN_END);
    if (installed === null) {
      entries.push({ tool: target.id, relPath: target.relPath, state: "missing-markers" });
    } else {
      entries.push({
        tool: target.id,
        relPath: target.relPath,
        state: installed.trim() === body.trim() ? "in-sync" : "drifted",
      });
    }
  }
  return entries;
}

export function targetDir(cwd: string, relPath: string): string {
  return dirname(join(cwd, relPath));
}
