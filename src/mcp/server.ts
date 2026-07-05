/**
 * MCP server — the third transport. Every tool is a thin wrapper over the
 * same engine core the CLI and hooks use, so guard policy is provably
 * identical across paths. Write-mode bridge jobs are DENY-BY-DEFAULT for MCP
 * clients: a client must be allow-listed in .agent/kit.json
 * (mcp.writeModeClients) to run them — any connected client inherits spawn
 * ability, so the bridge's policy gate is the precondition, not a nicety.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type BridgeMode, isWriteMode } from "../bridge/task.js";
import { resolveConfig } from "../config/index.js";
import { VERSION } from "../version.js";
import { errorText, jsonText, text } from "./ide-shared.js";
import { registerIdeMcpSurface } from "./ide.js";

export interface McpServerOptions {
  cwd: string;
}

export function createMaaawServer(opts: McpServerOptions): McpServer {
  const cwd = opts.cwd;
  const server = new McpServer({ name: "maaawkit", version: VERSION });

  const clientName = (): string => server.server.getClientVersion()?.name ?? "(unknown-client)";

  const writeModeAllowed = (): boolean => {
    const { config } = resolveConfig({ cwd });
    return config.mcp.writeModeClients.includes(clientName());
  };

  registerIdeMcpSurface(server, { cwd, clientName, writeModeAllowed });

  // ---------- bridge ----------

  server.registerTool(
    "bridge_run",
    {
      description:
        "Delegate a bounded task to another agent CLI. Prepared by default; " +
        "pass execute=true to run. Write modes require this MCP client to be " +
        "allow-listed in .agent/kit.json mcp.writeModeClients.",
      inputSchema: {
        task: z.string().min(1).describe("Narrow task for the worker"),
        agent: z.string().default("codex").describe("Adapter id (bridge detect lists them)"),
        mode: z
          .enum([
            "review-only",
            "security-pass",
            "implementation-worktree",
            "test-fix",
            "backend-task",
          ])
          .default("review-only"),
        oracle: z.string().optional().describe("Verification command run after the job"),
        promptAssetId: z.string().optional().describe("Prompt asset id from prompt_catalog"),
        execute: z.boolean().default(false).describe("Run now instead of just preparing"),
        background: z.boolean().default(false).describe("Detach; poll with bridge_status"),
      },
    },
    async (args) => {
      const mode = args.mode as BridgeMode;
      if (isWriteMode(mode) && !writeModeAllowed()) {
        return errorText(
          `Write-mode bridge jobs are denied by default for MCP clients. Add "${clientName()}" to mcp.writeModeClients in .agent/kit.json to opt in.`,
        );
      }
      const { prepareJob, runJob } = await import("../bridge/exec.js");
      try {
        const prepared = await prepareJob({
          cwd,
          agent: args.agent,
          mode,
          task: args.task,
          oracle: args.oracle,
          promptAssetId: args.promptAssetId,
        });
        if (!args.execute && !args.background) {
          return jsonText({
            job: prepared.job,
            launchCommand: prepared.launchCommand,
            note: "prepared, not run",
          });
        }
        const job = await runJob(prepared.job.id, { cwd, background: args.background });
        return jsonText(job);
      } catch (e) {
        return errorText(`bridge_run refused/failed: ${(e as Error).message}`);
      }
    },
  );

  server.registerTool(
    "bridge_status",
    {
      description: "Status of one bridge job (reconciled) or all jobs.",
      inputSchema: { id: z.string().optional() },
    },
    async (args) => {
      const { listJobs } = await import("../bridge/jobs.js");
      const { reconcileJob } = await import("../bridge/exec.js");
      if (args.id) {
        const job = await reconcileJob(cwd, args.id);
        return job ? jsonText(job) : errorText(`job not found: ${args.id}`);
      }
      return jsonText(listJobs(cwd));
    },
  );

  server.registerTool(
    "bridge_result",
    {
      description: "Fetch a completed job's structured result document.",
      inputSchema: { id: z.string() },
    },
    async (args) => {
      const { reconcileJob } = await import("../bridge/exec.js");
      const { existsSync, readFileSync } = await import("node:fs");
      const job = await reconcileJob(cwd, args.id);
      if (!job) return errorText(`job not found: ${args.id}`);
      const result =
        job.resultPath && existsSync(job.resultPath)
          ? readFileSync(job.resultPath, "utf-8")
          : "(no result document yet)";
      return jsonText({ job, result });
    },
  );

  server.registerTool(
    "bridge_cancel",
    {
      description: "Cancel a running bridge job (kills the process tree).",
      inputSchema: { id: z.string() },
    },
    async (args) => {
      const { cancelJob } = await import("../bridge/exec.js");
      try {
        return jsonText(await cancelJob(cwd, args.id));
      } catch (e) {
        return errorText((e as Error).message);
      }
    },
  );

  // ---------- rules ----------

  server.registerTool(
    "rules_sync",
    {
      description:
        "Re-render canonical rules (rules.md + repo facts + promoted memory) and refresh every installed tool artifact.",
      inputSchema: {},
    },
    async () => {
      const { installRules } = await import("../convert/convert.js");
      const report = installRules({ cwd });
      return jsonText({ actions: report.actions, warnings: report.warnings });
    },
  );

  // ---------- memory ----------

  server.registerTool(
    "memory_learn",
    {
      description: "Capture a durable project lesson/decision/fact as a memory record.",
      inputSchema: {
        title: z.string().min(1).max(200),
        body: z.string().min(1).describe("One paragraph, evidence-first"),
        type: z
          .enum(["lesson", "decision", "repo-fact", "preference", "failure-pattern"])
          .default("lesson"),
        tags: z.array(z.string()).default([]),
        paths: z.array(z.string()).default([]).describe("Path globs this applies to"),
        confidence: z.enum(["low", "medium", "high"]).default("medium"),
      },
    },
    async (args) => {
      const { createRecord } = await import("../memory/store.js");
      const record = createRecord(cwd, {
        type: args.type,
        title: args.title,
        body: args.body,
        tags: args.tags,
        paths: args.paths,
        confidence: args.confidence,
        source: `mcp:${clientName()}`,
      });
      return jsonText(record);
    },
  );

  server.registerTool(
    "memory_recall",
    {
      description:
        "Keyword search over project memory (title/tags/body). Increments hit counts, which feed ranking and promotion.",
      inputSchema: {
        query: z.string().min(1),
        limit: z.number().int().positive().max(20).default(5),
      },
    },
    async (args) => {
      const { recall } = await import("../memory/retrieval.js");
      const results = recall(cwd, args.query, args.limit).map(({ record, score }) => ({
        id: record.id,
        type: record.type,
        title: record.title,
        body: record.body,
        confidence: record.confidence,
        score: Number(score.toFixed(3)),
      }));
      return jsonText(results);
    },
  );

  server.registerTool(
    "memory_promote",
    {
      description: "Promote a memory record into the canonical rules (.agent/rules.md).",
      inputSchema: { id: z.string().regex(/^mem_[a-z0-9]{4,12}$/) },
    },
    async (args) => {
      const { promoteRecord } = await import("../memory/lifecycle.js");
      try {
        return jsonText(promoteRecord(cwd, args.id));
      } catch (e) {
        return errorText((e as Error).message);
      }
    },
  );

  // ---------- handoff ----------

  server.registerTool(
    "handoff_read",
    {
      description: "Read the current cross-agent handoff (doc + markdown).",
      inputSchema: {},
    },
    async () => {
      const { readHandoff } = await import("../handoff/index.js");
      return jsonText(readHandoff(cwd));
    },
  );

  server.registerTool(
    "handoff_write",
    {
      description:
        "Write the cross-agent handoff (HANDOFF.md + handoff.json). Top path-relevant memory records ride along automatically.",
      inputSchema: {
        goal: z.string().min(1),
        status: z.string().min(1),
        decisions: z.array(z.string()).default([]),
        nextSteps: z.array(z.string()).default([]),
        verification: z.string().optional(),
        toAgent: z.string().optional(),
        promptAssetId: z.string().optional().describe("Prompt asset id from prompt_catalog"),
      },
    },
    async (args) => {
      const { writeHandoff } = await import("../handoff/index.js");
      const written = writeHandoff(cwd, {
        goal: args.goal,
        status: args.status,
        decisions: args.decisions,
        nextSteps: args.nextSteps,
        verification: args.verification,
        fromAgent: `mcp:${clientName()}`,
        toAgent: args.toAgent,
        promptAssetId: args.promptAssetId,
      });
      return jsonText(written.doc);
    },
  );

  return server;
}
