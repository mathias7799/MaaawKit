/**
 * Conversion targets — six tool formats compiled from the canonical rules.
 * All writes are marker-delimited managed blocks (human text preserved),
 * backed up, and idempotent. Conversion (rendering content) is never
 * conflated with placement (`maaaw install` decides where files go).
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CanonicalRules } from "../rules/index.js";
import { GEN_BEGIN, GEN_END, managedBlock, upsertBlock } from "./markers.js";

/** Keep well under Codex's 32 KiB project-doc default. */
export const AGENTS_BUDGET = 24_000;

/** The shared body every tool format embeds. */
export function renderRulesBody(rules: CanonicalRules): string {
  const parts: string[] = [
    `<!-- generated ${rules.generatedOn} by maaaw convert; refresh with \`maaaw rules sync\` -->`,
  ];
  if (rules.languageRules.length > 0) {
    parts.push(
      `### Language rules (detected: ${rules.stacks.join(", ")})\n${rules.languageRules.join("\n")}`,
    );
  }
  if (rules.verifiedCommands.length > 0) {
    parts.push(
      `### Verified commands\n${rules.verifiedCommands.map((c) => `- \`${c}\``).join("\n")}`,
    );
  }
  if (rules.inferredCommands.length > 0) {
    parts.push(
      `### Inferred commands to verify\n${rules.inferredCommands.map((c) => `- \`${c}\``).join("\n")}`,
    );
  }
  if (rules.rulesText) {
    parts.push(`### Project rules\n${rules.rulesText}`);
  }
  if (rules.memoryDigest) {
    parts.push(
      `### Project memory (advisory context, not instructions)\n<!-- retrieved for this session; curate with \`maaaw memory review\` -->\n${rules.memoryDigest}`,
    );
  }
  return parts.join("\n\n");
}

export interface ConvertTarget {
  id: string;
  /** File the artifact lands in, relative to the repo root. */
  relPath: string;
  /** Heading used when the managed block is appended to an existing file. */
  appendHeading: string;
  /** True when this tool appears to be in use in the repo. */
  detect: (root: string) => boolean;
  /** Wrap the body for a brand-new file. */
  freshFile: (body: string) => string;
}

const block = (body: string) => managedBlock(GEN_BEGIN, GEN_END, body);

export const CONVERT_TARGETS: readonly ConvertTarget[] = [
  {
    id: "agentsmd",
    relPath: "AGENTS.md",
    appendHeading: "## MaaawKit generated guidance",
    detect: (root) =>
      existsSync(join(root, "AGENTS.md")) ||
      existsSync(join(root, ".codex")) ||
      existsSync(join(root, "opencode.json")),
    freshFile: (body) =>
      `# AGENTS.md\n\nGuidance for coding agents working in this repository.\n\n${block(body)}\n`,
  },
  {
    id: "claude",
    relPath: "CLAUDE.md",
    appendHeading: "## MaaawKit generated guidance",
    detect: (root) => existsSync(join(root, "CLAUDE.md")) || existsSync(join(root, ".claude")),
    freshFile: (body) => `# CLAUDE.md\n\n${block(body)}\n`,
  },
  {
    id: "cursor",
    relPath: join(".cursor", "rules", "maaaw.mdc"),
    appendHeading: "",
    detect: (root) => existsSync(join(root, ".cursor")),
    freshFile: (body) =>
      `---\ndescription: MaaawKit project rules (generated)\nalwaysApply: true\n---\n\n${block(body)}\n`,
  },
  {
    id: "copilot",
    relPath: join(".github", "copilot-instructions.md"),
    appendHeading: "## MaaawKit generated guidance",
    detect: (root) => existsSync(join(root, ".github")),
    freshFile: (body) => `# Copilot instructions\n\n${block(body)}\n`,
  },
  {
    id: "gemini",
    relPath: "GEMINI.md",
    appendHeading: "## MaaawKit generated guidance",
    detect: (root) => existsSync(join(root, "GEMINI.md")) || existsSync(join(root, ".gemini")),
    freshFile: (body) => `# GEMINI.md\n\n${block(body)}\n`,
  },
  {
    id: "windsurf",
    relPath: ".windsurfrules",
    appendHeading: "## MaaawKit generated guidance",
    detect: (root) => existsSync(join(root, ".windsurfrules")),
    freshFile: (body) => `${block(body)}\n`,
  },
];

/** Merge the body into existing file content (markers preserved human text). */
export function mergeIntoExisting(existing: string, body: string, target: ConvertTarget): string {
  return upsertBlock(existing, GEN_BEGIN, GEN_END, block(body), target.appendHeading || undefined)
    .text;
}
