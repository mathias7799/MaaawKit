/**
 * Phase 1 spec: .agent/ state manager — layout, atomic writes, and the
 * cross-process write lock.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  agentPaths,
  ensureStateDirs,
  readJsonFile,
  stateInitialized,
  updateJsonFile,
  withLock,
  writeFileAtomic,
  writeJsonFile,
} from "../src/state/index.js";

let dirs: string[] = [];

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "maaaw-state-"));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

describe("state: layout", () => {
  it("creates the roadmap §5 tree idempotently", () => {
    const cwd = tmp();
    expect(stateInitialized(cwd)).toBe(false);
    const paths = ensureStateDirs(cwd);
    ensureStateDirs(cwd); // second run must not throw
    expect(stateInitialized(cwd)).toBe(true);
    for (const dir of [
      paths.jobsDir,
      paths.logsDir,
      paths.resultsDir,
      paths.recordsDir,
      paths.handoffDir,
    ]) {
      expect(existsSync(dir)).toBe(true);
    }
    expect(paths.kitConfig).toBe(join(cwd, ".agent", "kit.json"));
    expect(paths.rulesFile).toBe(join(cwd, ".agent", "rules.md"));
    expect(paths.memoryDigest).toBe(join(cwd, ".agent", "memory", "digest.md"));
  });

  it("agentPaths is pure and does not touch the disk", () => {
    const cwd = tmp();
    agentPaths(cwd);
    expect(existsSync(join(cwd, ".agent"))).toBe(false);
  });
});

describe("state: atomic JSON I/O", () => {
  it("writes and reads JSON round-trip", () => {
    const cwd = tmp();
    const p = join(cwd, "x.json");
    writeJsonFile(p, { a: 1, nested: { b: [1, 2] } });
    expect(readJsonFile(p)).toEqual({ a: 1, nested: { b: [1, 2] } });
    expect(readFileSync(p, "utf-8").endsWith("\n")).toBe(true);
  });

  it("returns null for missing or corrupt files", () => {
    const cwd = tmp();
    expect(readJsonFile(join(cwd, "missing.json"))).toBeNull();
    writeFileAtomic(join(cwd, "bad.json"), "{nope");
    expect(readJsonFile(join(cwd, "bad.json"))).toBeNull();
  });

  it("creates parent directories on demand", () => {
    const cwd = tmp();
    const deep = join(cwd, "a", "b", "c.json");
    writeJsonFile(deep, { ok: true });
    expect(readJsonFile(deep)).toEqual({ ok: true });
  });

  it("leaves no temp files behind", () => {
    const cwd = tmp();
    writeJsonFile(join(cwd, "y.json"), { a: 1 });
    expect(readdirSync(cwd).filter((f) => f.includes(".tmp-"))).toEqual([]);
  });
});

describe("state: write locking", () => {
  it("serializes concurrent read-modify-write cycles (no lost updates)", async () => {
    const cwd = tmp();
    const p = join(cwd, "counter.json");
    writeJsonFile(p, { n: 0 });
    await Promise.all(
      Array.from({ length: 20 }, () =>
        updateJsonFile<{ n: number }>(p, (cur) => ({ n: (cur?.n ?? 0) + 1 })),
      ),
    );
    expect(readJsonFile<{ n: number }>(p)?.n).toBe(20);
  });

  it("releases the lock after errors", async () => {
    const cwd = tmp();
    const p = join(cwd, "z.json");
    await expect(
      withLock(p, () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    // Lock must be free again:
    const result = await withLock(p, () => "second acquisition works");
    expect(result).toBe("second acquisition works");
    expect(existsSync(`${p}.lock`)).toBe(false);
  });

  it("returns the callback's value", async () => {
    const cwd = tmp();
    expect(await withLock(join(cwd, "v.json"), () => 42)).toBe(42);
  });
});
