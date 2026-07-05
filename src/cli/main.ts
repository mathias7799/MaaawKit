#!/usr/bin/env node
/**
 * maaaw — the MaaawKit CLI. Thin wrappers over engine functions; every verb
 * here has an MCP or hook counterpart calling the same core.
 */

import { defineCommand, runMain } from "citty";
import pc from "picocolors";
import { VERSION } from "../version.js";

const validate = defineCommand({
  meta: {
    name: "validate",
    description: "Validate repo structure: plugin JSON, frontmatter, fences, count drift",
  },
  args: {
    root: { type: "string", description: "Repo root", default: "." },
    "max-skill-lines": {
      type: "string",
      description: "Enforce SKILL.md body line budget (Phase 6 rule)",
    },
  },
  async run({ args }) {
    const { validateRepo } = await import("../validate/index.js");
    const { resolve } = await import("node:path");
    const maxSkillLines = args["max-skill-lines"] ? Number(args["max-skill-lines"]) : undefined;
    const result = validateRepo({ root: resolve(args.root), maxSkillLines });
    for (const e of result.errors) console.log(`${pc.red("FAIL:")} ${e}`);
    console.log(
      result.errors.length
        ? pc.red(`${result.errors.length} problem(s)`)
        : pc.green("validation clean"),
    );
    if (result.errors.length > 0) process.exit(1);
  },
});

const doctor = defineCommand({
  meta: {
    name: "doctor",
    description: "Diagnose environment, config, and .agent/ state",
  },
  args: {
    cwd: { type: "string", description: "Repo root", default: "." },
    json: { type: "boolean", description: "Machine-readable output", default: false },
    hooks: { type: "boolean", description: "Also run the hook self-test suite", default: false },
  },
  async run({ args }) {
    const { runDoctor } = await import("../doctor/index.js");
    const { resolve } = await import("node:path");
    const report = await runDoctor(resolve(args.cwd));
    if (args.hooks) {
      const { runHooksSelftest } = await import("../doctor/hooks-selftest.js");
      const hookChecks = await runHooksSelftest();
      report.checks.push(...hookChecks);
      report.healthy = report.checks.every((c) => c.status !== "fail");
    }
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      for (const c of report.checks) {
        const badge =
          c.status === "ok"
            ? pc.green(" ok ")
            : c.status === "warn"
              ? pc.yellow("warn")
              : pc.red("FAIL");
        console.log(`[${badge}] ${c.name}: ${c.detail}`);
      }
      console.log(report.healthy ? pc.green("doctor: healthy") : pc.red("doctor: problems found"));
    }
    if (!report.healthy) process.exit(1);
  },
});

const init = defineCommand({
  meta: {
    name: "init",
    description: "Initialize the .agent/ state directory and a default kit.json",
  },
  args: {
    cwd: { type: "string", description: "Repo root", default: "." },
  },
  async run({ args }) {
    const { ensureStateDirs, writeJsonFile } = await import("../state/index.js");
    const { KitConfigSchema } = await import("../schemas/index.js");
    const { existsSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const paths = ensureStateDirs(resolve(args.cwd));
    if (existsSync(paths.kitConfig)) {
      console.log(`${paths.kitConfig} already exists — left untouched`);
    } else {
      writeJsonFile(paths.kitConfig, KitConfigSchema.parse({}));
      console.log(`created ${paths.kitConfig}`);
    }
    console.log(pc.green(".agent/ initialized"));
  },
});

const bridgeRun = defineCommand({
  meta: {
    name: "run",
    description: "Prepare (default) or execute a bounded worker job on another agent",
  },
  args: {
    task: { type: "string", required: true, description: "Task for the worker" },
    agent: { type: "string", default: "codex", description: "Adapter id (see bridge detect)" },
    mode: {
      type: "string",
      default: "review-only",
      description: "review-only|security-pass|implementation-worktree|test-fix|backend-task",
    },
    oracle: { type: "string", description: "Verification command run after the job" },
    run: { type: "boolean", default: false, description: "Execute now (foreground)" },
    background: {
      type: "boolean",
      default: false,
      description: "Execute detached; poll with bridge status",
    },
    branch: { type: "string", description: "Worker branch name (write modes)" },
    "worktree-root": { type: "string", description: "Parent dir for worker worktrees" },
    "allow-risky": {
      type: "boolean",
      default: false,
      description: "Accept ask-level guard findings",
    },
    resume: { type: "string", description: "Resume the vendor thread of a previous job id" },
    cwd: { type: "string", default: "." },
  },
  async run({ args }) {
    const { prepareJob, runJob, ALL_MODES } = await import("../bridge/index.js");
    const mode = args.mode as (typeof ALL_MODES)[number];
    if (!ALL_MODES.includes(mode)) {
      console.error(pc.red(`invalid --mode ${args.mode}; one of: ${ALL_MODES.join(", ")}`));
      process.exit(2);
    }
    const prepared = await prepareJob({
      cwd: args.cwd,
      agent: args.agent,
      mode,
      task: args.task,
      oracle: args.oracle,
      branch: args.branch,
      worktreeRoot: args["worktree-root"],
      allowAsk: args["allow-risky"],
      resumeFrom: args.resume,
    });
    console.log(`job: ${prepared.job.id} (${prepared.job.agent}, ${prepared.job.mode})`);
    if (prepared.job.worktree)
      console.log(`worktree: ${prepared.job.worktree} [${prepared.job.branch}]`);
    if (args.run || args.background) {
      const job = await runJob(prepared.job.id, { cwd: args.cwd, background: args.background });
      console.log(
        args.background
          ? `running in background (pid ${job.pid}) — poll with: maaaw bridge status ${job.id}`
          : `${job.status} (exit ${job.exitCode}); result: maaaw bridge result ${job.id}`,
      );
      if (!args.background && job.status === "failed") process.exit(1);
    } else {
      console.log(pc.yellow("prepared, not run (2.6 dry-run posture). Launch with:"));
      console.log(`  ${prepared.launchCommand}`);
      console.log(`or: maaaw bridge start ${prepared.job.id} [--background]`);
    }
  },
});

const bridgeStart = defineCommand({
  meta: { name: "start", description: "Execute a previously prepared job" },
  args: {
    id: { type: "positional", required: true },
    background: { type: "boolean", default: false },
    cwd: { type: "string", default: "." },
  },
  async run({ args }) {
    const { runJob } = await import("../bridge/index.js");
    const job = await runJob(args.id, { cwd: args.cwd, background: args.background });
    console.log(
      args.background
        ? `running in background (pid ${job.pid})`
        : `${job.status} (exit ${job.exitCode})`,
    );
  },
});

const bridgeStatus = defineCommand({
  meta: { name: "status", description: "Show one job or list all jobs" },
  args: {
    id: { type: "positional", required: false },
    cwd: { type: "string", default: "." },
  },
  async run({ args }) {
    const { listJobs, reconcileJob } = await import("../bridge/index.js");
    if (args.id) {
      const job = await reconcileJob(args.cwd, args.id);
      if (!job) {
        console.error(pc.red(`job not found: ${args.id}`));
        process.exit(1);
      }
      console.log(JSON.stringify(job, null, 2));
    } else {
      for (const job of listJobs(args.cwd)) {
        const reconciled = (await reconcileJob(args.cwd, job.id)) ?? job;
        console.log(
          `${reconciled.id}  ${reconciled.status.padEnd(9)} ${reconciled.agent.padEnd(8)} ${reconciled.mode.padEnd(23)} ${reconciled.task.slice(0, 60)}`,
        );
      }
    }
  },
});

const bridgeResult = defineCommand({
  meta: { name: "result", description: "Print a job's result document (and patch path)" },
  args: {
    id: { type: "positional", required: true },
    cwd: { type: "string", default: "." },
  },
  async run({ args }) {
    const { reconcileJob } = await import("../bridge/index.js");
    const { existsSync, readFileSync } = await import("node:fs");
    const job = await reconcileJob(args.cwd, args.id);
    if (!job) {
      console.error(pc.red(`job not found: ${args.id}`));
      process.exit(1);
    }
    console.log(
      `# ${job.id} — ${job.status}${job.oraclePassed !== undefined ? ` (oracle ${job.oraclePassed ? "passed" : "FAILED"})` : ""}`,
    );
    if (job.resultPath && existsSync(job.resultPath)) {
      console.log(readFileSync(job.resultPath, "utf-8"));
    } else {
      console.log("(no result document yet)");
    }
    if (job.patchPath) console.log(`patch: ${job.patchPath}`);
    if (job.worktree) console.log(`worktree: ${job.worktree} [${job.branch}]`);
  },
});

const bridgeCancel = defineCommand({
  meta: { name: "cancel", description: "Cancel a running job (kills the process tree)" },
  args: {
    id: { type: "positional", required: true },
    cwd: { type: "string", default: "." },
  },
  async run({ args }) {
    const { cancelJob } = await import("../bridge/index.js");
    const job = await cancelJob(args.cwd, args.id);
    console.log(`${job.id} cancelled`);
  },
});

const bridgeDetect = defineCommand({
  meta: { name: "detect", description: "Probe which agent CLIs are installed" },
  args: { cwd: { type: "string", default: "." } },
  async run({ args }) {
    const { detectAdapters } = await import("../bridge/index.js");
    for (const a of await detectAdapters(args.cwd)) {
      const badge = a.available ? pc.green("found") : pc.dim("absent");
      console.log(
        `[${badge}] ${a.id.padEnd(9)} bin=${a.bin.padEnd(13)} ${a.version ?? ""} (verified against: ${a.verifiedAgainst})`,
      );
    }
  },
});

const bridgeCleanup = defineCommand({
  meta: { name: "cleanup", description: "Remove a write-mode job's worktree" },
  args: {
    id: { type: "positional", required: true },
    cwd: { type: "string", default: "." },
  },
  async run({ args }) {
    const { cleanupWorktree } = await import("../bridge/index.js");
    await cleanupWorktree(args.cwd, args.id);
    console.log("worktree removed (branch kept)");
  },
});

const bridge = defineCommand({
  meta: {
    name: "bridge",
    description: "Delegate bounded tasks to other agent CLIs (codex, gemini, …)",
  },
  subCommands: {
    run: bridgeRun,
    start: bridgeStart,
    status: bridgeStatus,
    result: bridgeResult,
    cancel: bridgeCancel,
    detect: bridgeDetect,
    cleanup: bridgeCleanup,
  },
});

const memoryAdd = defineCommand({
  meta: { name: "add", description: "Capture a memory record" },
  args: {
    title: { type: "positional", required: true },
    body: { type: "string", required: true, description: "The knowledge, evidence-first" },
    type: {
      type: "string",
      default: "lesson",
      description: "lesson|decision|repo-fact|preference|failure-pattern",
    },
    tags: { type: "string", description: "Comma-separated tags" },
    paths: { type: "string", description: "Comma-separated path globs this applies to" },
    confidence: { type: "string", default: "medium", description: "low|medium|high" },
    source: { type: "string", default: "session" },
    cwd: { type: "string", default: "." },
  },
  async run({ args }) {
    const { createRecord } = await import("../memory/index.js");
    const record = createRecord(args.cwd, {
      type: args.type as never,
      title: args.title,
      body: args.body,
      tags: args.tags ? args.tags.split(",").map((t) => t.trim()) : [],
      paths: args.paths ? args.paths.split(",").map((p) => p.trim()) : [],
      confidence: args.confidence as never,
      source: args.source,
    });
    console.log(`captured ${record.id}: ${record.title}`);
  },
});

const memoryList = defineCommand({
  meta: { name: "list", description: "List memory records" },
  args: {
    all: { type: "boolean", default: false, description: "Include archived" },
    cwd: { type: "string", default: "." },
  },
  async run({ args }) {
    const { listRecords } = await import("../memory/index.js");
    for (const r of listRecords(args.cwd, { includeArchived: args.all })) {
      console.log(
        `${r.id}  ${r.status.padEnd(8)} ${r.confidence.padEnd(6)} hits=${String(r.hits).padEnd(3)} [${r.type}] ${r.title}`,
      );
    }
  },
});

const memoryRecall = defineCommand({
  meta: { name: "recall", description: "Keyword search over memory (records hit counts)" },
  args: {
    query: { type: "positional", required: true },
    limit: { type: "string", default: "5" },
    cwd: { type: "string", default: "." },
  },
  async run({ args }) {
    const { recall } = await import("../memory/index.js");
    const results = recall(args.cwd, args.query, Number(args.limit));
    if (results.length === 0) {
      console.log("no matching records");
      return;
    }
    for (const { record, score } of results) {
      console.log(
        `(${score.toFixed(2)}) ${record.id} [${record.type}] ${record.title}\n    ${record.body.split("\n")[0]}`,
      );
    }
  },
});

const memoryReview = defineCommand({
  meta: { name: "review", description: "Triage: decay stale records, list candidates" },
  args: { cwd: { type: "string", default: "." } },
  async run({ args }) {
    const { decay, listRecords, suggestPromotions } = await import("../memory/index.js");
    const { staled } = decay(args.cwd);
    if (staled.length > 0) console.log(`decayed to stale: ${staled.join(", ")}`);
    const stale = listRecords(args.cwd).filter((r) => r.status === "stale");
    if (stale.length > 0) {
      console.log("\nstale records — confirm (maaaw memory confirm <id>) or archive:");
      for (const r of stale) console.log(`  ${r.id}  last ${r.lastConfirmed}  ${r.title}`);
    }
    const promotable = suggestPromotions(args.cwd);
    if (promotable.length > 0) {
      console.log("\npromotion candidates (maaaw memory promote <id>):");
      for (const r of promotable) console.log(`  ${r.id}  hits=${r.hits}  ${r.title}`);
    }
    if (stale.length === 0 && promotable.length === 0)
      console.log("memory is healthy — nothing to triage");
  },
});

const memoryConfirm = defineCommand({
  meta: { name: "confirm", description: "Confirm a record is still true" },
  args: { id: { type: "positional", required: true }, cwd: { type: "string", default: "." } },
  async run({ args }) {
    const { confirmRecord } = await import("../memory/index.js");
    const r = confirmRecord(args.cwd, args.id);
    console.log(`confirmed ${r.id} (${r.title})`);
  },
});

const memoryArchive = defineCommand({
  meta: { name: "archive", description: "Archive a record (nothing is deleted)" },
  args: { id: { type: "positional", required: true }, cwd: { type: "string", default: "." } },
  async run({ args }) {
    const { archiveRecord } = await import("../memory/index.js");
    const r = archiveRecord(args.cwd, args.id);
    console.log(`archived ${r.id}`);
  },
});

const memoryConsolidate = defineCommand({
  meta: { name: "consolidate", description: "Merge near-duplicate records" },
  args: { cwd: { type: "string", default: "." } },
  async run({ args }) {
    const { consolidate } = await import("../memory/index.js");
    const { merged } = consolidate(args.cwd);
    if (merged.length === 0) console.log("no duplicates found");
    for (const m of merged) console.log(`kept ${m.kept}, archived ${m.archived.join(", ")}`);
  },
});

const memoryPromote = defineCommand({
  meta: { name: "promote", description: "Promote a record into .agent/rules.md" },
  args: { id: { type: "positional", required: true }, cwd: { type: "string", default: "." } },
  async run({ args }) {
    const { promoteRecord } = await import("../memory/index.js");
    const r = promoteRecord(args.cwd, args.id);
    console.log(
      `promoted ${r.id} into .agent/rules.md — memory is the nursery, rules are the constitution`,
    );
  },
});

const memoryDigest = defineCommand({
  meta: { name: "digest", description: "Rebuild the budgeted session digest" },
  args: {
    budget: { type: "string", description: "Token budget override" },
    cwd: { type: "string", default: "." },
  },
  async run({ args }) {
    const { buildDigest } = await import("../memory/index.js");
    const { execa } = await import("execa");
    let changedFiles: string[] = [];
    try {
      const r = await execa("git", ["diff", "--name-only", "HEAD"], {
        cwd: args.cwd,
        timeout: 10_000,
      });
      changedFiles = r.stdout.split("\n").filter(Boolean);
    } catch {}
    const result = buildDigest(args.cwd, {
      changedFiles,
      ...(args.budget ? { tokenBudget: Number(args.budget) } : {}),
    });
    console.log(
      `digest: ${result.included.length} record(s), ~${result.tokens} tokens${result.excluded ? `, ${result.excluded} over budget` : ""}`,
    );
    if (result.content) console.log(`\n${result.content}`);
  },
});

const memory = defineCommand({
  meta: { name: "memory", description: "First-class project memory: capture, recall, lifecycle" },
  subCommands: {
    add: memoryAdd,
    list: memoryList,
    recall: memoryRecall,
    review: memoryReview,
    confirm: memoryConfirm,
    archive: memoryArchive,
    consolidate: memoryConsolidate,
    promote: memoryPromote,
    digest: memoryDigest,
  },
});

const convert = defineCommand({
  meta: {
    name: "convert",
    description: "Render canonical rules and preview per-tool artifacts (no placement)",
  },
  args: { cwd: { type: "string", default: "." } },
  async run({ args }) {
    const { installRules } = await import("../convert/convert.js");
    const report = installRules({ cwd: args.cwd, all: true, dryRun: true });
    console.log(report.body);
    console.log("\n--- would touch ---");
    for (const a of report.actions) console.log(`${a.tool.padEnd(9)} ${a.relPath}`);
    for (const w of report.warnings) console.log(pc.yellow(`warning: ${w}`));
  },
});

const install = defineCommand({
  meta: {
    name: "install",
    description: "Place rules artifacts into detected tools (AGENTS.md, CLAUDE.md, cursor, …)",
  },
  args: {
    tools: { type: "string", description: "Comma-separated target ids (default: detected)" },
    all: { type: "boolean", default: false, description: "Install every target" },
    "dry-run": { type: "boolean", default: false },
    cwd: { type: "string", default: "." },
  },
  async run({ args }) {
    const { installRules } = await import("../convert/convert.js");
    const report = installRules({
      cwd: args.cwd,
      tools: args.tools ? args.tools.split(",").map((t) => t.trim()) : undefined,
      all: args.all,
      dryRun: args["dry-run"],
    });
    for (const a of report.actions) {
      const badge = a.action === "skipped (not detected)" ? pc.dim(a.action) : pc.green(a.action);
      console.log(`${a.tool.padEnd(9)} ${a.relPath.padEnd(38)} ${badge}`);
    }
    for (const w of report.warnings) console.log(pc.yellow(`warning: ${w}`));
  },
});

const rulesSync = defineCommand({
  meta: { name: "sync", description: "Re-render rules and refresh all installed artifacts" },
  args: { cwd: { type: "string", default: "." } },
  async run({ args }) {
    const { installRules, rulesDrift } = await import("../convert/convert.js");
    const report = installRules({ cwd: args.cwd });
    for (const a of report.actions)
      console.log(`${a.tool.padEnd(9)} ${a.relPath.padEnd(38)} ${a.action}`);
    const drift = rulesDrift(args.cwd).filter((d) => d.state !== "in-sync");
    if (drift.length === 0) console.log(pc.green("all installed artifacts in sync"));
  },
});

const rules = defineCommand({
  meta: { name: "rules", description: "Canonical rules: sync to every tool format" },
  subCommands: { sync: rulesSync },
});

const handoffWrite = defineCommand({
  meta: { name: "write", description: "Write HANDOFF.md + handoff.json with relevant memory" },
  args: {
    goal: { type: "string", required: true },
    status: { type: "string", required: true },
    decisions: { type: "string", description: "Semicolon-separated decisions" },
    next: { type: "string", description: "Semicolon-separated next steps" },
    verification: { type: "string" },
    from: { type: "string", default: "claude" },
    to: { type: "string", description: "Target agent (codex, gemini, …)" },
    cwd: { type: "string", default: "." },
  },
  async run({ args }) {
    const { writeHandoff } = await import("../handoff/index.js");
    const { execa } = await import("execa");
    let changedFiles: string[] = [];
    try {
      const r = await execa("git", ["diff", "--name-only", "HEAD"], {
        cwd: args.cwd,
        timeout: 10_000,
      });
      changedFiles = r.stdout.split("\n").filter(Boolean);
    } catch {}
    const split = (s?: string) =>
      s
        ? s
            .split(";")
            .map((x) => x.trim())
            .filter(Boolean)
        : [];
    const written = writeHandoff(args.cwd, {
      goal: args.goal,
      status: args.status,
      decisions: split(args.decisions),
      nextSteps: split(args.next),
      verification: args.verification,
      fromAgent: args.from,
      toAgent: args.to,
      changedFiles,
    });
    console.log(`wrote ${written.markdownPath}`);
    console.log(
      `wrote ${written.jsonPath} (${written.doc.memoryRecords.length} memory record(s) attached)`,
    );
  },
});

const handoffRead = defineCommand({
  meta: { name: "read", description: "Print the current handoff" },
  args: { cwd: { type: "string", default: "." } },
  async run({ args }) {
    const { readHandoff } = await import("../handoff/index.js");
    const h = readHandoff(args.cwd);
    if (!h.markdown) {
      console.log("no handoff found (.agent/handoff/HANDOFF.md)");
      return;
    }
    console.log(h.markdown);
  },
});

const handoff = defineCommand({
  meta: { name: "handoff", description: "Cross-agent handoff (HANDOFF.md + handoff.json)" },
  subCommands: { write: handoffWrite, read: handoffRead },
});

const main = defineCommand({
  meta: {
    name: "maaaw",
    version: VERSION,
    description:
      "MaaawKit engine: cross-agent bridge, project memory, canonical rules, safety hooks",
  },
  subCommands: {
    validate,
    doctor,
    init,
    bridge,
    memory,
    convert,
    install,
    rules,
    handoff,
  },
});

runMain(main);
