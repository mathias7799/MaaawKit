/**
 * Phase 1 spec: maaaw doctor — clean on a fresh repo, actionable on a broken one.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runDoctor } from "../src/doctor/index.js";
import { ensureStateDirs, writeJsonFile } from "../src/state/index.js";

let dirs: string[] = [];

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "maaaw-doctor-"));
  dirs.push(d);
  return d;
}

function gitInit(cwd: string): void {
  execFileSync("git", ["init", "-q"], { cwd });
}

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function check(report: Awaited<ReturnType<typeof runDoctor>>, name: string) {
  return report.checks.find((c) => c.name === name);
}

describe("doctor", () => {
  it("is healthy on a fresh initialized git repo", async () => {
    const cwd = tmp();
    gitInit(cwd);
    ensureStateDirs(cwd);
    writeJsonFile(join(cwd, ".agent", "kit.json"), {});
    const report = await runDoctor(cwd, {});
    expect(report.healthy).toBe(true);
    expect(check(report, "node")?.status).toBe("ok");
    expect(check(report, "git repo")?.status).toBe("ok");
    expect(check(report, "config")?.status).toBe("ok");
    expect(check(report, ".agent/")?.status).toBe("ok");
  });

  it("warns (not fails) on an uninitialized repo, with the fix named", async () => {
    const cwd = tmp();
    gitInit(cwd);
    const report = await runDoctor(cwd, {});
    expect(report.healthy).toBe(true);
    const agent = check(report, ".agent/");
    expect(agent?.status).toBe("warn");
    expect(agent?.detail).toContain("maaaw init");
  });

  it("warns outside a git work tree", async () => {
    const cwd = tmp();
    const report = await runDoctor(cwd, {});
    expect(check(report, "git repo")?.status).toBe("warn");
  });

  it("fails actionably on broken repo config", async () => {
    const cwd = tmp();
    gitInit(cwd);
    mkdirSync(join(cwd, ".agent"), { recursive: true });
    writeFileSync(join(cwd, ".agent", "kit.json"), "{broken");
    const report = await runDoctor(cwd, {});
    expect(report.healthy).toBe(false);
    const bad = report.checks.find((c) => c.name.startsWith("config (repo)"));
    expect(bad?.status).toBe("fail");
    expect(bad?.detail).toContain("kit.json");
  });

  it("fails actionably on invalid bridge adapter overrides", async () => {
    const cwd = tmp();
    gitInit(cwd);
    const paths = ensureStateDirs(cwd);
    writeJsonFile(paths.kitConfig, {});
    writeFileSync(paths.adaptersFile, "{broken");
    const report = await runDoctor(cwd, {});
    const bad = check(report, "bridge adapters config");
    expect(report.healthy).toBe(false);
    expect(bad?.status).toBe("fail");
    expect(bad?.detail).toContain("adapters.json");
  });
});
