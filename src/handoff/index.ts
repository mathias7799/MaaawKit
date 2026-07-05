/**
 * Universal handoff — HANDOFF.md for humans/agents plus a schema-validated
 * handoff.json mirror carrying the top path-relevant memory records, so the
 * next agent (any vendor) starts with the same lessons.
 */

import { existsSync, readFileSync } from "node:fs";
import { buildDigest } from "../memory/retrieval.js";
import { getPromptAsset } from "../prompts/catalog.js";
import { type HandoffDoc, HandoffDocSchema } from "../schemas/index.js";
import {
  agentPaths,
  ensureStateDirs,
  readJsonFile,
  writeFileAtomic,
  writeJsonFile,
} from "../state/index.js";

export interface WriteHandoffInput {
  goal: string;
  status: string;
  decisions?: string[];
  nextSteps?: string[];
  verification?: string | undefined;
  fromAgent?: string;
  toAgent?: string | undefined;
  promptAssetId?: string | undefined;
  /** Changed files used to select path-relevant memory. */
  changedFiles?: string[];
}

export interface WrittenHandoff {
  doc: HandoffDoc;
  markdownPath: string;
  jsonPath: string;
}

export function writeHandoff(cwd: string, input: WriteHandoffInput): WrittenHandoff {
  const paths = ensureStateDirs(cwd);

  // Top path-relevant records ride along (ids in JSON, titles in markdown).
  const digest = existsSync(paths.recordsDir)
    ? buildDigest(cwd, { changedFiles: input.changedFiles ?? [] })
    : { included: [] as string[], content: "" };
  const promptAsset = input.promptAssetId ? getPromptAsset(input.promptAssetId) : null;
  if (input.promptAssetId && !promptAsset) {
    throw new Error(
      `Unknown prompt asset "${input.promptAssetId}". Use prompt_catalog to inspect ids.`,
    );
  }

  const doc = HandoffDocSchema.parse({
    goal: input.goal,
    status: input.status,
    decisions: input.decisions ?? [],
    nextSteps: input.nextSteps ?? [],
    ...(input.verification ? { verification: input.verification } : {}),
    fromAgent: input.fromAgent ?? "claude",
    ...(input.toAgent ? { toAgent: input.toAgent } : {}),
    ...(promptAsset
      ? {
          promptAssetId: promptAsset.id,
          promptAssetPath: promptAsset.path,
        }
      : {}),
    createdAt: new Date().toISOString(),
    memoryRecords: digest.included,
  });

  const md = [
    "# HANDOFF",
    "",
    `- From: ${doc.fromAgent}${doc.toAgent ? ` → ${doc.toAgent}` : ""}`,
    `- Written: ${doc.createdAt}`,
    ...(doc.promptAssetId ? [`- Prompt asset: ${doc.promptAssetId}`] : []),
    "",
    "## Goal",
    doc.goal,
    "",
    "## Current status",
    doc.status,
    "",
    "## Decisions made (do not re-litigate)",
    doc.decisions.length > 0 ? doc.decisions.map((d) => `- ${d}`).join("\n") : "- (none recorded)",
    "",
    "## Next steps",
    doc.nextSteps.length > 0 ? doc.nextSteps.map((s) => `- ${s}`).join("\n") : "- (none recorded)",
    "",
    "## Verification",
    doc.verification ?? "(see verified commands in AGENTS.md / kit.json oracle)",
    "",
    ...(digest.content ? ["## Relevant project memory", digest.content, ""] : []),
    "Verify the claimed state before building on it.",
    "",
  ].join("\n");

  writeFileAtomic(paths.handoffMd, md);
  writeJsonFile(paths.handoffJson, doc);
  return { doc, markdownPath: paths.handoffMd, jsonPath: paths.handoffJson };
}

export interface ReadHandoff {
  doc: HandoffDoc | null;
  markdown: string | null;
}

export function readHandoff(cwd: string): ReadHandoff {
  const paths = agentPaths(cwd);
  const raw = readJsonFile(paths.handoffJson);
  const parsed = raw ? HandoffDocSchema.safeParse(raw) : null;
  return {
    doc: parsed?.success ? parsed.data : null,
    markdown: existsSync(paths.handoffMd) ? readFileSync(paths.handoffMd, "utf-8") : null,
  };
}
