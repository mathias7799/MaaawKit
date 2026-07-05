/**
 * Fixture sanity: the fake agent CLI must faithfully mimic a vendor exec
 * surface — stdin prompt, -o output file, exit codes, sleep, touch. Every
 * later bridge test builds on this contract.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const FAKE = join(import.meta.dirname, "fixtures", "fake-clis", "fake-agent.mjs");
let dirs: string[] = [];

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "maaaw-fake-"));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function runFake(
  args: string[],
  opts: { cwd?: string; input?: string; env?: Record<string, string> } = {},
) {
  return execFileSync(process.execPath, [FAKE, ...args], {
    cwd: opts.cwd,
    input: opts.input ?? "",
    env: { ...process.env, ...opts.env },
    encoding: "utf-8",
  });
}

describe("fake agent CLI fixture", () => {
  it("writes a structured result to -o and reports prompt length", () => {
    const d = tmp();
    const out = join(d, "result.md");
    runFake(["exec", "--sandbox", "read-only", "-o", out, "-"], { input: "hello prompt" });
    const result = readFileSync(out, "utf-8");
    expect(result).toContain("# Worker Result");
    expect(result).toContain("success");
    expect(result).toContain("Prompt length: 12 chars");
    expect(result).toContain("sandbox=read-only");
  });

  it("exits non-zero with --fail but still writes output", () => {
    const d = tmp();
    const out = join(d, "result.md");
    expect(() => runFake(["exec", "-o", out, "--fail", "-"])).toThrow();
    expect(existsSync(out)).toBe(true);
  });

  it("touches files in cwd (isolation-proof instrument)", () => {
    const d = tmp();
    runFake(["exec", "--touch", "marker.txt", "-"], { cwd: d });
    expect(existsSync(join(d, "marker.txt"))).toBe(true);
  });

  it("honors FAKE_AGENT_STATUS", () => {
    const d = tmp();
    const out = join(d, "r.md");
    runFake(["exec", "-o", out, "-"], { env: { FAKE_AGENT_STATUS: "partial" } });
    expect(readFileSync(out, "utf-8")).toContain("partial");
  });

  it("rejects unknown subcommands like a real CLI", () => {
    expect(() => runFake(["chat"])).toThrow();
  });
});
