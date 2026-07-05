/**
 * Memory lifecycle: consolidate (dedupe/merge), review/decay (stale flips),
 * promote (memory → canonical rules — the nursery-to-constitution move),
 * archive (nothing is deleted).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolveConfig } from "../config/index.js";
import { MEMORY_BEGIN, MEMORY_END, managedBlock, upsertBlock } from "../convert/markers.js";
import type { MemoryRecordFile } from "../schemas/index.js";
import { agentPaths, writeFileAtomic } from "../state/index.js";
import { tokenize } from "./retrieval.js";
import { listRecords, readRecord, saveRecord, today } from "./store.js";

// ---------- consolidate ----------

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

const CONFIDENCE_ORDER = ["low", "medium", "high"] as const;

function bumpConfidence(c: MemoryRecordFile["confidence"]): MemoryRecordFile["confidence"] {
  const i = CONFIDENCE_ORDER.indexOf(c);
  return CONFIDENCE_ORDER[Math.min(i + 1, 2)] ?? "high";
}

export interface ConsolidateResult {
  merged: { kept: string; archived: string[] }[];
}

/**
 * Merge near-identical records (title+tag token similarity ≥ threshold).
 * The newest record survives with union tags/paths, summed hits, and bumped
 * confidence; the duplicates are archived, never deleted.
 */
export function consolidate(cwd: string, threshold = 0.6): ConsolidateResult {
  const records = listRecords(cwd).filter((r) => r.status === "active" || r.status === "stale");
  const sigs = records.map((r) => new Set([...tokenize(r.title), ...r.tags.flatMap(tokenize)]));
  const absorbed = new Set<string>();
  const merged: ConsolidateResult["merged"] = [];

  for (let i = 0; i < records.length; i++) {
    const a = records[i];
    const sigA = sigs[i];
    if (!a || !sigA || absorbed.has(a.id)) continue;
    const group: MemoryRecordFile[] = [a];
    for (let j = i + 1; j < records.length; j++) {
      const b = records[j];
      const sigB = sigs[j];
      if (!b || !sigB || absorbed.has(b.id)) continue;
      if (a.type === b.type && jaccard(sigA, sigB) >= threshold) {
        group.push(b);
        absorbed.add(b.id);
      }
    }
    if (group.length < 2) continue;

    // Keep the most recently confirmed record.
    const sorted = [...group].sort((x, y) => y.lastConfirmed.localeCompare(x.lastConfirmed));
    const keeper = sorted[0];
    if (!keeper) continue;
    const rest = sorted.slice(1);
    saveRecord(cwd, {
      ...keeper,
      tags: [...new Set(group.flatMap((r) => r.tags))],
      paths: [...new Set(group.flatMap((r) => r.paths))],
      hits: group.reduce((sum, r) => sum + r.hits, 0),
      confidence: bumpConfidence(keeper.confidence),
      status: "active",
      lastConfirmed: today(),
    });
    for (const dup of rest) {
      saveRecord(cwd, { ...dup, status: "archived" });
    }
    merged.push({ kept: keeper.id, archived: rest.map((r) => r.id) });
  }
  return { merged };
}

// ---------- review / decay ----------

export interface DecayResult {
  staled: string[];
}

/** Flip active records unconfirmed for `decayDays` to stale. */
export function decay(cwd: string, now = today()): DecayResult {
  const { config } = resolveConfig({ cwd });
  const cutoff = new Date(now).getTime() - config.memory.decayDays * 86_400_000;
  const staled: string[] = [];
  for (const record of listRecords(cwd)) {
    if (record.status !== "active") continue;
    if (new Date(record.lastConfirmed).getTime() < cutoff) {
      saveRecord(cwd, { ...record, status: "stale" });
      staled.push(record.id);
    }
  }
  return { staled };
}

/** Confirm a record is still true: refresh lastConfirmed, reactivate if stale. */
export function confirmRecord(cwd: string, id: string): MemoryRecordFile {
  const record = readRecord(cwd, id);
  if (!record) throw new Error(`Memory record not found: ${id}`);
  const updated: MemoryRecordFile = { ...record, lastConfirmed: today(), status: "active" };
  saveRecord(cwd, updated);
  return updated;
}

export function archiveRecord(cwd: string, id: string): MemoryRecordFile {
  const record = readRecord(cwd, id);
  if (!record) throw new Error(`Memory record not found: ${id}`);
  const updated: MemoryRecordFile = { ...record, status: "archived" };
  saveRecord(cwd, updated);
  return updated;
}

// ---------- promote ----------

/** Records that have earned promotion: high confidence, repeatedly hit, active. */
export function suggestPromotions(cwd: string): MemoryRecordFile[] {
  const { config } = resolveConfig({ cwd });
  return listRecords(cwd).filter(
    (r) =>
      r.status === "active" &&
      r.confidence === "high" &&
      r.hits >= config.memory.promoteHitThreshold,
  );
}

/**
 * Promote a record into the canonical rules (.agent/rules.md). The promoted
 * lines live in a marker-delimited block so human rule text is preserved;
 * the record flips to status=promoted and leaves the digest.
 */
export function promoteRecord(cwd: string, id: string): MemoryRecordFile {
  const record = readRecord(cwd, id);
  if (!record) throw new Error(`Memory record not found: ${id}`);
  if (record.status === "promoted") return record;

  const paths = agentPaths(cwd);
  const existing = existsSync(paths.rulesFile)
    ? readFileSync(paths.rulesFile, "utf-8")
    : "# Rules\n";

  // Collect all promoted records (including this one) into the managed block.
  const promoted = [
    ...listRecords(cwd, { includeArchived: true }).filter(
      (r) => r.status === "promoted" && r.id !== id,
    ),
    record,
  ];
  const body = promoted
    .map((r) => `- ${r.title} — ${r.body.split("\n")[0] ?? ""} <!-- ${r.id} -->`)
    .join("\n");
  const block = managedBlock(
    MEMORY_BEGIN,
    MEMORY_END,
    `<!-- promoted from memory by maaaw; edit freely, the ids keep provenance -->\n${body}`,
  );
  const { text } = upsertBlock(
    existing,
    MEMORY_BEGIN,
    MEMORY_END,
    block,
    "## Promoted from memory",
  );
  writeFileAtomic(paths.rulesFile, text);

  const updated: MemoryRecordFile = { ...record, status: "promoted", lastConfirmed: today() };
  saveRecord(cwd, updated);
  return updated;
}

// ---------- health (doctor panel) ----------

export interface MemoryHealth {
  total: number;
  active: number;
  stale: number;
  promoted: number;
  archived: number;
  stalePercent: number;
  digestTokens: number;
  promotionCandidates: number;
}

export function memoryHealth(cwd: string, digestTokens: number): MemoryHealth {
  const all = listRecords(cwd, { includeArchived: true });
  const by = (s: MemoryRecordFile["status"]) => all.filter((r) => r.status === s).length;
  const active = by("active");
  const stale = by("stale");
  return {
    total: all.length,
    active,
    stale,
    promoted: by("promoted"),
    archived: by("archived"),
    stalePercent: active + stale === 0 ? 0 : Math.round((100 * stale) / (active + stale)),
    digestTokens,
    promotionCandidates: suggestPromotions(cwd).length,
  };
}
