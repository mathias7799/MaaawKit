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
  },
});

runMain(main);
