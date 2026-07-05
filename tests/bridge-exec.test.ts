/**
 * Phase 3 spec: bridge engine end-to-end against the fake agent CLI —
 * prepare/run/background/cancel lifecycle, guard policy inside the bridge,
 * worktree isolation for write modes, structured results, and cleanup.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  BUILTIN_ADAPTERS,
  PolicyRefusal,
  cancelJob,
  cleanupWorktree,
  detectAdapter,
  loadAdapters,
  loadJob,
  prepareJob,
  reconcileJob,
  runJob,
} from "../src/bridge/index.js";
import { ensureStateDirs, writeJsonFile } from "../src/state/index.js";

const FAKE = join(import.meta.dirname, "fixtures", "fake-clis", "fake-agent.mjs");
let dirs: string[] = [];

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
}

/** A git repo with one tracked file and the fake adapter registered. */
function repo(extraAdapter: Record<string, unknown> = {}): string {
  const d = mkdtempSync(join(tmpdir(), "maaaw-bridge-"));
  dirs.push(d);
  git(d, "init", "-q");
  git(d, "config", "user.email", "t@example.com");
  git(d, "config", "user.name", "t");
  writeFileSync(join(d, "target.txt"), "original content\n");
  git(d, "add", ".");
  git(d, "commit", "-qm", "init");
  const paths = ensureStateDirs(d);
  writeJsonFile(paths.adaptersFile, {
    fake: {
      bin: process.execPath,
      baseArgs: [FAKE],
      promptVia: "stdin",
      outputVia: "file",
      readArgs: ["exec", "--sandbox", "read-only", "-o", "{outputFile}", "-"],
      writeArgs: ["exec", "--sandbox", "workspace-write", "-o", "{outputFile}", "-"],
      detectArgs: ["--version"],
      threadIdPattern: "sandbox=([a-z-]+)",
      verifiedAgainst: "fake fixture",
      ...extraAdapter,
    },
  });
  return d;
}

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

describe("adapter registry", () => {
  it("ships the six built-ins", () => {
    expect(Object.keys(BUILTIN_ADAPTERS).sort()).toEqual([
      "claude",
      "codex",
      "copilot",
      "cursor",
      "gemini",
      "opencode",
    ]);
  });

  it("merges adapters.json overrides over built-ins", () => {
    const d = repo();
    const adapters = loadAdapters(d);
    expect(adapters["fake"]?.bin).toBe(process.execPath);
    expect(adapters["codex"]).toBeDefined(); // built-ins still present
  });

  it("errors helpfully on unknown agents", async () => {
    const d = repo();
    await expect(
      prepareJob({ cwd: d, agent: "nope", mode: "review-only", task: "x" }),
    ).rejects.toThrow(/Unknown agent "nope".*fake/);
  });

  it("detects availability honestly", async () => {
    const d = repo();
    const adapters = loadAdapters(d);
    const fake = adapters["fake"];
    const codex = BUILTIN_ADAPTERS["codex"];
    if (!fake || !codex) throw new Error("fixture broken");
    const missing = { ...codex, bin: "definitely-not-installed-xyz" };
    // fake-agent has no --version, exits 2 → reported unavailable; a missing
    // binary is also unavailable. Use node itself for a positive probe.
    expect((await detectAdapter({ ...fake, baseArgs: [], bin: process.execPath })).available).toBe(
      true,
    );
    expect((await detectAdapter(missing)).available).toBe(false);
  });
});

describe("guard policy inside the bridge", () => {
  it("refuses a destructive task outright (rm -rf / never reaches an agent)", async () => {
    const d = repo();
    await expect(
      prepareJob({ cwd: d, agent: "fake", mode: "implementation-worktree", task: "rm -rf /" }),
    ).rejects.toThrow(PolicyRefusal);
    // and no worktree was created
    expect(git(d, "worktree", "list").split("\n")).toHaveLength(1);
  });

  it("flags ask-level commands unless --allow-risky", async () => {
    const d = repo({ readArgs: ["exec", "--fail", "&&", "git", "reset", "--hard"] });
    await expect(
      prepareJob({ cwd: d, agent: "fake", mode: "review-only", task: "harmless" }),
    ).rejects.toThrow(/flagged/);
    const ok = await prepareJob({
      cwd: d,
      agent: "fake",
      mode: "review-only",
      task: "harmless",
      allowAsk: true,
    });
    expect(ok.job.status).toBe("prepared");
  });
});

describe("prepared-by-default lifecycle", () => {
  it("prepare writes a schema-valid record and prints a launch command, runs nothing", async () => {
    const d = repo();
    const { job, launchCommand, promptPath } = await prepareJob({
      cwd: d,
      agent: "fake",
      mode: "review-only",
      task: "Review the diff",
    });
    expect(job.status).toBe("prepared");
    expect(job.id).toMatch(/^job_[a-z0-9]{8}$/);
    expect(launchCommand).toContain("fake-agent.mjs");
    expect(readFileSync(promptPath, "utf-8")).toContain("Review the diff");
    expect(existsSync(job.resultPath ?? "")).toBe(false); // nothing ran
    expect(loadJob(d, job.id)?.status).toBe("prepared");
  });

  it("foreground run completes, parses the structured result, and captures thread id", async () => {
    const d = repo();
    const { job } = await prepareJob({
      cwd: d,
      agent: "fake",
      mode: "review-only",
      task: "Review the code",
    });
    const done = await runJob(job.id, { cwd: d });
    expect(done.status).toBe("done");
    expect(done.exitCode).toBe(0);
    expect(done.result?.status).toBe("success");
    expect(done.result?.sections["summary"]).toContain("read-only");
    expect(done.threadId).toBe("read-only"); // via threadIdPattern fixture
    expect(readFileSync(done.resultPath ?? "", "utf-8")).toContain("# Worker Result");
  });

  it("failed agent runs are recorded as failed", async () => {
    const d = repo({ readArgs: ["exec", "--fail", "-o", "{outputFile}", "-"] });
    const { job } = await prepareJob({ cwd: d, agent: "fake", mode: "review-only", task: "t" });
    const done = await runJob(job.id, { cwd: d });
    expect(done.status).toBe("failed");
    expect(done.exitCode).toBe(1);
  });

  it("oracle verdict is recorded (pass and fail)", async () => {
    const d = repo();
    const pass = await prepareJob({
      cwd: d,
      agent: "fake",
      mode: "review-only",
      task: "t1",
      oracle: `${JSON.stringify(process.execPath)} -e "process.exit(0)"`,
    });
    expect((await runJob(pass.job.id, { cwd: d })).oraclePassed).toBe(true);
    const fail = await prepareJob({
      cwd: d,
      agent: "fake",
      mode: "review-only",
      task: "t2",
      oracle: `${JSON.stringify(process.execPath)} -e "process.exit(1)"`,
    });
    expect((await runJob(fail.job.id, { cwd: d })).oraclePassed).toBe(false);
  });
});

describe("worktree isolation (write modes)", () => {
  it("write-mode jobs run in a worktree and CANNOT touch the main tree", async () => {
    const d = repo({
      writeArgs: ["exec", "--touch", "target.txt", "-o", "{outputFile}", "-"],
    });
    const { job } = await prepareJob({
      cwd: d,
      agent: "fake",
      mode: "implementation-worktree",
      task: "Change target file",
    });
    expect(job.worktree).toBeDefined();
    expect(job.branch).toBe("fake/change-target-file");
    dirs.push(job.worktree ?? "");

    const done = await runJob(job.id, { cwd: d });
    expect(done.status).toBe("done");
    // The worktree copy changed; the orchestrator's tree did NOT.
    expect(readFileSync(join(job.worktree ?? "", "target.txt"), "utf-8")).toContain("fake-agent");
    expect(readFileSync(join(d, "target.txt"), "utf-8")).toBe("original content\n");
    // The change came back as a patch + stat.
    expect(done.patchPath).toBeDefined();
    const patch = readFileSync(done.patchPath ?? "", "utf-8");
    expect(patch).toContain("target.txt");
    expect(patch).toContain("-original content");
  });

  it("read modes run in place without a worktree", async () => {
    const d = repo();
    const { job } = await prepareJob({ cwd: d, agent: "fake", mode: "security-pass", task: "t" });
    expect(job.worktree).toBeUndefined();
    expect(job.cwd).toBe(d);
  });

  it("cleanup removes the worktree", async () => {
    const d = repo();
    const { job } = await prepareJob({
      cwd: d,
      agent: "fake",
      mode: "test-fix",
      task: "fix tests",
    });
    dirs.push(job.worktree ?? "");
    expect(existsSync(job.worktree ?? "")).toBe(true);
    await cleanupWorktree(d, job.id);
    expect(existsSync(job.worktree ?? "")).toBe(false);
  });
});

describe("background execution and cancel", () => {
  it("background run records a pid, then reconciles to done", async () => {
    const d = repo({ readArgs: ["exec", "--sleep", "300", "-o", "{outputFile}", "-"] });
    const { job } = await prepareJob({ cwd: d, agent: "fake", mode: "review-only", task: "bg" });
    const running = await runJob(job.id, { cwd: d, background: true });
    expect(running.status).toBe("running");
    expect(running.pid).toBeGreaterThan(0);

    let final = running;
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      final = (await reconcileJob(d, job.id)) ?? final;
      if (final.status !== "running") break;
    }
    expect(final.status).toBe("done");
    expect(final.exitCode).toBe(0);
    expect(final.result?.status).toBe("success");
  }, 20_000);

  it("cancel mid-run kills the process tree and marks cancelled", async () => {
    const d = repo({ readArgs: ["exec", "--sleep", "30000", "-o", "{outputFile}", "-"] });
    const { job } = await prepareJob({ cwd: d, agent: "fake", mode: "review-only", task: "slow" });
    const running = await runJob(job.id, { cwd: d, background: true });
    expect(running.status).toBe("running");
    await sleep(500);

    const cancelled = await cancelJob(d, job.id);
    expect(cancelled.status).toBe("cancelled");

    // The process tree must actually be dead (give SIGTERM a moment).
    await sleep(500);
    const alive = (() => {
      try {
        process.kill(running.pid ?? 0, 0);
        return true;
      } catch {
        return false;
      }
    })();
    expect(alive).toBe(false);
    // Status stays cancelled on later reconciliation.
    expect(((await reconcileJob(d, job.id)) ?? cancelled).status).toBe("cancelled");
  }, 20_000);
});

describe("resume plumbing", () => {
  it("builds a resume command from a prior job's thread id", async () => {
    const d = repo({ resumeArgs: ["exec", "resume", "{threadId}", "-o", "{outputFile}", "-"] });
    const first = await prepareJob({ cwd: d, agent: "fake", mode: "review-only", task: "first" });
    await runJob(first.job.id, { cwd: d });
    const resumed = await prepareJob({
      cwd: d,
      agent: "fake",
      mode: "review-only",
      task: "continue",
      resumeFrom: first.job.id,
    });
    expect(resumed.job.cmd.join(" ")).toContain("resume read-only");
  });

  it("refuses resume when the prior job has no thread id or adapter lacks support", async () => {
    const d = repo();
    await expect(
      prepareJob({
        cwd: d,
        agent: "fake",
        mode: "review-only",
        task: "x",
        resumeFrom: "job_zzzzzzzz",
      }),
    ).rejects.toThrow(/no recorded thread id/);
  });
});
