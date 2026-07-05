/**
 * Memory record store — one markdown file per record under
 * .agent/memory/records/ (frontmatter + body, git-diffable, human-editable).
 * index.json is a generated artifact rebuilt after every write.
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import {
  type MemoryRecord,
  type MemoryRecordFile,
  MemoryRecordFileSchema,
} from "../schemas/index.js";
import { agentPaths, ensureStateDirs, writeFileAtomic, writeJsonFile } from "../state/index.js";

export function newMemoryId(): string {
  return `mem_${randomBytes(3).toString("hex")}`;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function recordPath(cwd: string, id: string): string {
  return join(agentPaths(cwd).recordsDir, `${id}.md`);
}

export function serializeRecord(record: MemoryRecordFile): string {
  const { body, ...frontmatter } = record;
  return matter.stringify(`\n${body.trim()}\n`, frontmatter);
}

export function parseRecord(text: string): MemoryRecordFile | null {
  try {
    const parsed = matter(text);
    const candidate = { ...parsed.data, body: parsed.content.trim() };
    const result = MemoryRecordFileSchema.safeParse(candidate);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export interface CreateRecordInput {
  type: MemoryRecord["type"];
  title: string;
  body: string;
  tags?: string[];
  paths?: string[];
  confidence?: MemoryRecord["confidence"];
  source?: string;
}

export function createRecord(cwd: string, input: CreateRecordInput): MemoryRecordFile {
  ensureStateDirs(cwd);
  const record = MemoryRecordFileSchema.parse({
    id: newMemoryId(),
    type: input.type,
    title: input.title,
    tags: input.tags ?? [],
    paths: input.paths ?? [],
    confidence: input.confidence ?? "medium",
    status: "active",
    created: today(),
    lastConfirmed: today(),
    hits: 0,
    source: input.source ?? "session",
    body: input.body,
  });
  writeFileAtomic(recordPath(cwd, record.id), serializeRecord(record));
  rebuildIndex(cwd);
  return record;
}

export function readRecord(cwd: string, id: string): MemoryRecordFile | null {
  const p = recordPath(cwd, id);
  if (!existsSync(p)) return null;
  return parseRecord(readFileSync(p, "utf-8"));
}

export function saveRecord(cwd: string, record: MemoryRecordFile): void {
  writeFileAtomic(
    recordPath(cwd, record.id),
    serializeRecord(MemoryRecordFileSchema.parse(record)),
  );
  rebuildIndex(cwd);
}

export interface ListOptions {
  includeArchived?: boolean;
}

export function listRecords(cwd: string, opts: ListOptions = {}): MemoryRecordFile[] {
  const dir = agentPaths(cwd).recordsDir;
  if (!existsSync(dir)) return [];
  const records: MemoryRecordFile[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const record = parseRecord(readFileSync(join(dir, f), "utf-8"));
    if (!record) continue;
    if (!opts.includeArchived && record.status === "archived") continue;
    records.push(record);
  }
  return records.sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id));
}

/** Rebuild .agent/memory/index.json (generated, never hand-edited). */
export function rebuildIndex(cwd: string): void {
  const records = listRecords(cwd, { includeArchived: true }).map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    tags: r.tags,
    paths: r.paths,
    confidence: r.confidence,
    status: r.status,
    created: r.created,
    lastConfirmed: r.lastConfirmed,
    hits: r.hits,
  }));
  writeJsonFile(agentPaths(cwd).memoryIndex, { generated: true, records });
}
