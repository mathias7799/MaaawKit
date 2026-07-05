/**
 * Phase 2/3 spec: the hook runtime (in-process) — the same entry point the
 * shims call, plus the doctor --hooks selftest suite.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runHooksSelftest } from "../src/doctor/hooks-selftest.js";
import { runHook, runPostEdit } from "../src/hooks/runtime.js";

let dirs: string[] = [];

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "maaaw-runtime-"));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

const nodeOracle = (code: number, msg = "") =>
  `${JSON.stringify(process.execPath)} -e "console.log('${msg}'); process.exit(${code})"`;

describe("runHook: guard", () => {
  it("denies via the full engine path with config", async () => {
    const cwd = tmp();
    mkdirSync(join(cwd, ".agent"));
    writeFileSync(join(cwd, ".agent", "kit.json"), JSON.stringify({ guardLevel: "strict" }));
    const { stdout } = await runHook(
      "guard",
      JSON.stringify({ cwd, tool_name: "Bash", tool_input: { command: "git reset --hard" } }),
    );
    expect(JSON.parse(stdout).hookSpecificOutput.permissionDecision).toBe("deny"); // strict
  });

  it("stays quiet on allow and malformed input", async () => {
    const cwd = tmp();
    expect(
      (
        await runHook(
          "guard",
          JSON.stringify({ cwd, tool_name: "Bash", tool_input: { command: "ls" } }),
        )
      ).stdout,
    ).toBe("");
    expect((await runHook("guard", "garbage{{{", { cwd })).stdout).toBe("");
  });

  it("applies custom rules from kit.json", async () => {
    const cwd = tmp();
    mkdirSync(join(cwd, ".agent"));
    writeFileSync(
      join(cwd, ".agent", "kit.json"),
      JSON.stringify({
        guardCustomRules: [
          { pattern: "\\bflyctl\\s+apps\\s+destroy\\b", message: "nope", action: "deny" },
        ],
      }),
    );
    const { stdout } = await runHook(
      "guard",
      JSON.stringify({ cwd, tool_name: "Bash", tool_input: { command: "flyctl apps destroy p" } }),
    );
    expect(JSON.parse(stdout).hookSpecificOutput.permissionDecisionReason).toBe("nope");
  });
});

describe("runHook: stop-verify", () => {
  function loop(cwd: string, state: unknown): string {
    mkdirSync(join(cwd, ".agent"), { recursive: true });
    const p = join(cwd, ".agent", "loop.json");
    writeFileSync(p, JSON.stringify(state));
    return p;
  }

  it("no-ops without a loop file", async () => {
    const cwd = tmp();
    expect((await runHook("stop-verify", JSON.stringify({ cwd }))).stdout).toBe("");
  });

  it("deletes invalid loop files and allows stop", async () => {
    const cwd = tmp();
    const p = loop(cwd, { nonsense: true });
    expect((await runHook("stop-verify", JSON.stringify({ cwd }))).stdout).toBe("");
    expect(existsSync(p)).toBe(false);
  });

  it("refuses untrusted loop files", async () => {
    const cwd = tmp();
    loop(cwd, { oracle: nodeOracle(0), max_iterations: 3 });
    const { stdout } = await runHook("stop-verify", JSON.stringify({ cwd }));
    expect(stdout).toContain("refused");
  });

  it("refuses git-tracked loop files even when trusted", async () => {
    const cwd = tmp();
    const p = loop(cwd, { trusted: true, oracle: nodeOracle(0), max_iterations: 3 });
    execFileSync("git", ["init", "-q"], { cwd });
    execFileSync("git", ["add", "-f", p], { cwd });
    const { stdout } = await runHook("stop-verify", JSON.stringify({ cwd }));
    expect(stdout).toContain("tracked in git");
  });

  it("runs the full fail→pass loop with state updates", async () => {
    const cwd = tmp();
    const p = loop(cwd, {
      trusted: true,
      oracle: nodeOracle(1, "boom"),
      max_iterations: 3,
      goal: "make it pass",
    });
    const blocked = JSON.parse((await runHook("stop-verify", JSON.stringify({ cwd }))).stdout);
    expect(blocked.decision).toBe("block");
    expect(blocked.reason).toContain("boom");
    expect(blocked.reason).toContain("GOAL: make it pass");
    expect(JSON.parse(readFileSync(p, "utf-8")).iteration).toBe(1);

    loop(cwd, { trusted: true, oracle: nodeOracle(0, "green"), max_iterations: 3, iteration: 1 });
    const passed = JSON.parse((await runHook("stop-verify", JSON.stringify({ cwd }))).stdout);
    expect(passed.systemMessage).toContain("Loop complete");
    expect(existsSync(p)).toBe(false);
  });

  it("exhausts the budget honestly", async () => {
    const cwd = tmp();
    loop(cwd, { trusted: true, oracle: nodeOracle(1), max_iterations: 2, iteration: 2 });
    const { stdout } = await runHook("stop-verify", JSON.stringify({ cwd }));
    expect(stdout).toContain("budget exhausted");
  });
});

describe("runHook: session-context", () => {
  it("assembles git + loop + handoff + digest", async () => {
    const cwd = tmp();
    execFileSync("git", ["init", "-q"], { cwd });
    execFileSync("git", ["config", "user.email", "t@t"], { cwd });
    execFileSync("git", ["config", "user.name", "t"], { cwd });
    writeFileSync(join(cwd, "a.txt"), "x");
    execFileSync("git", ["add", "."], { cwd });
    execFileSync("git", ["commit", "-qm", "first"], { cwd });
    writeFileSync(join(cwd, "dirty.txt"), "y");
    mkdirSync(join(cwd, ".agent", "handoff"), { recursive: true });
    mkdirSync(join(cwd, ".agent", "memory"), { recursive: true });
    writeFileSync(join(cwd, ".agent", "loop.json"), JSON.stringify({ oracle: "npm test", max_iterations: 5, iteration: 2 }));
    writeFileSync(join(cwd, ".agent", "handoff", "HANDOFF.md"), "# handoff");
    writeFileSync(join(cwd, ".agent", "memory", "digest.md"), "- remembered lesson");

    const { stdout } = await runHook("session-context", JSON.stringify({ cwd }));
    expect(stdout).toContain("[session-context]");
    expect(stdout).toContain("uncommitted changes: 2 file(s)"); // dirty.txt + .agent/
    expect(stdout).toContain("first");
    expect(stdout).toContain("ACTIVE VERIFICATION LOOP");
    expect(stdout).toContain("HANDOFF.md exists");
    expect(stdout).toContain("remembered lesson");
  });

  it("is quiet outside git with no state", async () => {
    const cwd = tmp();
    expect((await runHook("session-context", JSON.stringify({ cwd }))).stdout).toBe("");
  });
});

describe("runPostEdit with injected runner", () => {
  it("blocks with linter output and truncates", async () => {
    const cwd = tmp();
    const file = join(cwd, "x.py");
    writeFileSync(file, "print(1)\n");
    const calls: string[][] = [];
    const out = await runPostEdit(
      { tool_input: { file_path: file } },
      async (cmd) => {
        calls.push(cmd);
        // ruff format ok; ruff check fails with findings
        if (cmd.includes("check")) return { exitCode: 1, output: "E501 line too long", missing: false };
        return { exitCode: 0, output: "", missing: false };
      },
    );
    expect(calls.some((c) => c[0] === "ruff" && c.includes("format"))).toBe(true);
    const parsed = JSON.parse(out);
    expect(parsed.decision).toBe("block");
    expect(parsed.reason).toContain("[ruff] E501 line too long");
  });

  it("stays silent when tools are missing or clean", async () => {
    const cwd = tmp();
    const file = join(cwd, "y.py");
    writeFileSync(file, "print(1)\n");
    expect(
      await runPostEdit({ tool_input: { file_path: file } }, async () => ({
        exitCode: 0,
        output: "",
        missing: true,
      })),
    ).toBe("");
  });

  it("runs eslint only when the project opted in", async () => {
    const cwd = tmp();
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "x" }));
    const file = join(cwd, "a.ts");
    writeFileSync(file, "const a = 1;\n");
    const calls: string[][] = [];
    await runPostEdit({ tool_input: { file_path: file } }, async (cmd) => {
      calls.push(cmd);
      return { exitCode: 0, output: "", missing: false };
    });
    expect(calls).toEqual([]); // no eslint/prettier config → nothing runs

    writeFileSync(join(cwd, ".eslintrc.json"), "{}");
    await runPostEdit({ tool_input: { file_path: file } }, async (cmd) => {
      calls.push(cmd);
      return { exitCode: 0, output: "", missing: false };
    });
    expect(calls.some((c) => c[0] === "eslint")).toBe(true);
  });
});

describe("doctor --hooks selftest", () => {
  it("passes every check on this machine", async () => {
    const checks = await runHooksSelftest();
    const failures = checks.filter((c) => c.status === "fail");
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
    expect(checks.length).toBeGreaterThanOrEqual(14);
  });
});
