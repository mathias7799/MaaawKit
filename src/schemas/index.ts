/**
 * Domain schemas — zod models are the source of truth; JSON Schemas are
 * exported to schemas/*.schema.json (committed) so every agent and MCP client
 * gets typed contracts without importing the engine.
 */

import { z } from "zod/v4";

// ---------- guard / config ----------

export const GuardLevelSchema = z.enum(["relaxed", "standard", "strict"]);

export const CustomGuardRuleSchema = z.object({
  pattern: z.string().min(1),
  flags: z.string().optional(),
  message: z.string().min(1),
  action: z.enum(["deny", "ask"]),
});

export const MemoryConfigSchema = z.object({
  /** Token budget for the session digest injected at session start. */
  digestTokenBudget: z.number().int().positive().default(1500),
  /** Days without confirmation before a record flips to stale. */
  decayDays: z.number().int().positive().default(45),
  /** Retrieval hits at which promotion to rules is suggested. */
  promoteHitThreshold: z.number().int().positive().default(3),
});

export const DialsSchema = z.object({
  auditDepth: z.enum(["quick", "standard", "deep"]).default("standard"),
  paranoia: z.enum(["low", "standard", "high"]).default("standard"),
});

export const McpConfigSchema = z.object({
  /** MCP clients allowed to run write-mode bridge jobs (deny-by-default). */
  writeModeClients: z.array(z.string()).default([]),
});

export const KitConfigSchema = z.object({
  $schema: z.string().optional(),
  stacks: z.array(z.enum(["dotnet", "node", "python", "powershell"])).default([]),
  oracle: z.string().optional(),
  guardLevel: GuardLevelSchema.default("standard"),
  guardCustomRules: z.array(CustomGuardRuleSchema).default([]),
  secondAgents: z.array(z.string()).default([]),
  issueTracker: z.string().optional(),
  docsDir: z.string().default("docs"),
  dials: DialsSchema.prefault({}),
  memory: MemoryConfigSchema.prefault({}),
  mcp: McpConfigSchema.prefault({}),
});

export type KitConfig = z.infer<typeof KitConfigSchema>;
export type GuardLevel = z.infer<typeof GuardLevelSchema>;

// ---------- bridge ----------

export const BridgeModeSchema = z.enum([
  "implementation-worktree",
  "test-fix",
  "backend-task",
  "review-only",
  "security-pass",
]);

export const JobStatusSchema = z.enum(["prepared", "running", "done", "failed", "cancelled"]);

export const WorkerResultSchema = z.object({
  status: z.enum(["success", "partial", "failed", "unknown"]),
  sections: z.record(z.string(), z.string()),
});

export const JobRecordSchema = z.object({
  id: z.string().regex(/^job_[a-z0-9]{8}$/),
  agent: z.string().min(1),
  mode: BridgeModeSchema,
  task: z.string().min(1),
  cwd: z.string(),
  worktree: z.string().optional(),
  branch: z.string().optional(),
  cmd: z.array(z.string()).min(1),
  status: JobStatusSchema,
  pid: z.number().int().positive().optional(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().optional(),
  endedAt: z.iso.datetime().optional(),
  exitCode: z.number().int().optional(),
  logPath: z.string().optional(),
  resultPath: z.string().optional(),
  result: WorkerResultSchema.optional(),
  oracle: z.string().optional(),
  oraclePassed: z.boolean().optional(),
  promptAssetId: z.string().optional(),
  promptAssetPath: z.string().optional(),
  /** Vendor thread id for --resume, when the adapter supports it. */
  threadId: z.string().optional(),
  /** Path to the patch produced by a write-mode job (git diff of the worktree). */
  patchPath: z.string().optional(),
});

export type JobRecord = z.infer<typeof JobRecordSchema>;
export type JobStatus = z.infer<typeof JobStatusSchema>;
export type BridgeMode = z.infer<typeof BridgeModeSchema>;

export const AdapterSpecSchema = z.object({
  id: z.string().min(1),
  /** Executable name or absolute path. */
  bin: z.string().min(1),
  /**
   * Extra argv prepended before mode args (lets overrides run e.g.
   * `node /path/to/cli.js …` by setting bin: "node").
   */
  baseArgs: z.array(z.string()).default([]),
  /** How the task prompt reaches the CLI: piped to stdin or via {prompt} arg. */
  promptVia: z.enum(["stdin", "arg"]).default("stdin"),
  /** Where the result document comes from: {outputFile} arg or captured stdout. */
  outputVia: z.enum(["file", "stdout"]).default("stdout"),
  /** Args for read-mode execution; placeholders: {prompt}, {outputFile}. */
  readArgs: z.array(z.string()),
  /** Args for write-mode execution (always run inside an isolated worktree). */
  writeArgs: z.array(z.string()),
  /** Args to probe availability, e.g. ["--version"]. */
  detectArgs: z.array(z.string()).default(["--version"]),
  /** Args template for resuming a vendor thread ({threadId}), when supported. */
  resumeArgs: z.array(z.string()).optional(),
  /** Regex (first capture group) extracting a resumable thread id from output. */
  threadIdPattern: z.string().optional(),
  env: z.record(z.string(), z.string()).default({}),
  /** Vendor CLI version this spec was last verified against (doctor surfaces it). */
  verifiedAgainst: z.string().default("unverified"),
  notes: z.string().optional(),
});

export type AdapterSpec = z.infer<typeof AdapterSpecSchema>;

// ---------- findings (agent contracts) ----------

export const FindingSchema = z.object({
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  title: z.string().min(1),
  file: z.string().optional(),
  line: z.number().int().positive().optional(),
  evidence: z.string().min(1),
  recommendation: z.string().optional(),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
  lane: z.string().optional(),
});

export const FindingsReportSchema = z.object({
  agent: z.string(),
  scope: z.string(),
  findings: z.array(FindingSchema),
  notCovered: z.array(z.string()).default([]),
});

export type Finding = z.infer<typeof FindingSchema>;
export type FindingsReport = z.infer<typeof FindingsReportSchema>;

// ---------- handoff ----------

export const HandoffDocSchema = z.object({
  goal: z.string().min(1),
  status: z.string().min(1),
  decisions: z.array(z.string()).default([]),
  nextSteps: z.array(z.string()).default([]),
  verification: z.string().optional(),
  fromAgent: z.string().default("claude"),
  toAgent: z.string().optional(),
  promptAssetId: z.string().optional(),
  promptAssetPath: z.string().optional(),
  createdAt: z.iso.datetime(),
  /** Top path-relevant memory record ids carried across agents. */
  memoryRecords: z.array(z.string()).default([]),
});

export type HandoffDoc = z.infer<typeof HandoffDocSchema>;

// ---------- memory ----------

export const MemoryTypeSchema = z.enum([
  "lesson",
  "decision",
  "repo-fact",
  "preference",
  "failure-pattern",
]);

export const MemoryStatusSchema = z.enum(["active", "stale", "promoted", "archived"]);
export const ConfidenceSchema = z.enum(["low", "medium", "high"]);

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const MemoryRecordSchema = z.object({
  id: z.string().regex(/^mem_[a-z0-9]{4,12}$/),
  type: MemoryTypeSchema,
  title: z.string().min(1).max(200),
  tags: z.array(z.string()).default([]),
  paths: z.array(z.string()).default([]),
  confidence: ConfidenceSchema.default("medium"),
  status: MemoryStatusSchema.default("active"),
  created: IsoDate,
  lastConfirmed: IsoDate,
  hits: z.number().int().nonnegative().default(0),
  source: z.string().default("session"),
});

/** Frontmatter + body — the full record as stored on disk. */
export const MemoryRecordFileSchema = MemoryRecordSchema.extend({
  body: z.string().min(1),
});

export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;
export type MemoryRecordFile = z.infer<typeof MemoryRecordFileSchema>;

// ---------- loop file (stop-verify) ----------

export const LoopFileSchema = z.object({
  trusted: z.literal(true),
  created_by: z.string().optional(),
  oracle: z.string().min(1),
  max_iterations: z.number().int().positive(),
  timeout_seconds: z.number().int().positive().optional(),
  max_output: z.number().int().positive().optional(),
  goal: z.string().optional(),
  iteration: z.number().int().nonnegative().optional(),
  last_failure_sig: z.string().optional(),
  failure_streak: z.number().int().nonnegative().optional(),
});

export type LoopFile = z.infer<typeof LoopFileSchema>;

/** Every exported JSON Schema, keyed by its committed filename. */
export const EXPORTED_SCHEMAS = {
  "kit-config": KitConfigSchema,
  "job-record": JobRecordSchema,
  "adapter-spec": AdapterSpecSchema,
  finding: FindingSchema,
  "findings-report": FindingsReportSchema,
  handoff: HandoffDocSchema,
  "memory-record": MemoryRecordSchema,
  "loop-file": LoopFileSchema,
} as const;

export function toJsonSchema(name: keyof typeof EXPORTED_SCHEMAS): Record<string, unknown> {
  return z.toJSONSchema(EXPORTED_SCHEMAS[name], { io: "input" }) as Record<string, unknown>;
}
