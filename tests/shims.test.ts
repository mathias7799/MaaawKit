/**
 * Phase 2 spec: the four zero-dependency hook shims.
 * - Fallback path (no engine installed): 2.6 guard behavior + minimal stop-verify.
 * - Engine path (maaawkit resolvable): full runtime behavior.
 * - Drift gate: committed shims must equal template + current rule table.
 * - Latency budgets: <80 ms fallback, <250 ms engine (roadmap §4), with a CI
 *   headroom factor for slow shared runners.
 *
 * Engine-path tests need the built package (dist/); CI builds before testing.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateShim } from "../src/hooks/shim-gen.js";

const REPO = join(import.meta.dirname, "..");
const SHIMS = ["guard.mjs", "post-edit.mjs", "stop-verify.mjs", "session-context.mjs"];
const HEADROOM = Number(process.env["MAAAW_LATENCY_FACTOR"] ?? "3");

let fallbackDir: string; // shims only, engine unresolvable
let engineDir: string; // node_modules/maaawkit -> repo (dist must exist)
const cleanup: string[] = [];

function tmp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  cleanup.push(d);
  return d;
}

function installShims(dir: string): void {
  for (const shim of SHIMS) {
    writeFileSync(join(dir, shim), readFileSync(join(REPO, "shims", shim)));
  }
}

beforeAll(() => {
  fallbackDir = tmp("maaaw-shim-fallback-");
  installShims(fallbackDir);

  engineDir = tmp("maaaw-shim-engine-");
  installShims(engineDir);
  mkdirSync(join(engineDir, "node_modules"));
  symlinkSync(REPO, join(engineDir, "node_modules", "maaawkit"), "junction");
});

afterAll(() => {
  for (const d of cleanup) rmSync(d, { recursive: true, force: true });
});

interface ShimRun {
  stdout: string;
  ms: number;
}

function runShim(dir: string, shim: string, input: unknown, cwd = dir): ShimRun {
  const started = performance.now();
  const stdout = execFileSync(process.execPath, [join(dir, shim)], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    cwd,
    encoding: "utf-8",
    timeout: 30_000,
  });
  return { stdout, ms: performance.now() - started };
}

function guardDecision(stdout: string): string {
  if (!stdout.trim()) return "allow";
  return (
    (JSON.parse(stdout) as { hookSpecificOutput?: { permissionDecision?: string } })
      .hookSpecificOutput?.permissionDecision ?? "allow"
  );
}

const bash = (command: string) => ({ tool_name: "Bash", tool_input: { command } });

describe.each([
  ["fallback", () => fallbackDir],
  ["engine", () => engineDir],
])("guard shim (%s path)", (_label, dir) => {
  it("denies rm -rf / and force pushes", () => {
    expect(guardDecision(runShim(dir(), "guard.mjs", bash("rm -rf /")).stdout)).toBe("deny");
    expect(guardDecision(runShim(dir(), "guard.mjs", bash("git push -f origin main")).stdout)).toBe(
      "deny",
    );
  });

  it("asks on git reset --hard and protected writes", () => {
    expect(guardDecision(runShim(dir(), "guard.mjs", bash("git reset --hard")).stdout)).toBe("ask");
    expect(
      guardDecision(
        runShim(dir(), "guard.mjs", { tool_name: "Write", tool_input: { file_path: ".env" } })
          .stdout,
      ),
    ).toBe("ask");
  });

  it("allows normal commands and survives malformed input", () => {
    expect(guardDecision(runShim(dir(), "guard.mjs", bash("git status")).stdout)).toBe("allow");
    expect(runShim(dir(), "guard.mjs", "not json{{{").stdout).toBe("");
  });

  it("applies the textish SQL exemption", () => {
    expect(
      guardDecision(runShim(dir(), "guard.mjs", bash('git commit -m "drop table support"')).stdout),
    ).toBe("allow");
  });
});

describe("guard shim (engine-only behavior)", () => {
  it("honors guardLevel from .agent/kit.json (strict upgrades ask to deny)", () => {
    const work = tmp("maaaw-shim-strict-");
    mkdirSync(join(work, ".agent"));
    writeFileSync(join(work, ".agent", "kit.json"), JSON.stringify({ guardLevel: "strict" }));
    const { stdout } = runShim(
      engineDir,
      "guard.mjs",
      { cwd: work, ...bash("git reset --hard") },
      work,
    );
    expect(guardDecision(stdout)).toBe("deny");
  });

  it("fallback shim ignores config (documented limitation — standard level only)", () => {
    const work = tmp("maaaw-shim-fb-cfg-");
    mkdirSync(join(work, ".agent"));
    writeFileSync(join(work, ".agent", "kit.json"), JSON.stringify({ guardLevel: "strict" }));
    const { stdout } = runShim(
      fallbackDir,
      "guard.mjs",
      { cwd: work, ...bash("git reset --hard") },
      work,
    );
    expect(guardDecision(stdout)).toBe("ask");
  });

  it("refuses instead of silently falling back when a present engine fails to load", () => {
    const broken = tmp("maaaw-shim-broken-engine-");
    installShims(broken);
    mkdirSync(join(broken, "node_modules", "maaawkit"), { recursive: true });
    writeFileSync(
      join(broken, "node_modules", "maaawkit", "package.json"),
      JSON.stringify({ name: "maaawkit", type: "module", exports: { "./hooks": "./missing.js" } }),
    );

    const { stdout } = runShim(broken, "guard.mjs", bash("git reset --hard"));
    expect(guardDecision(stdout)).toBe("deny");
    expect(stdout).toContain("engine guard failed");
  });
});

describe.each([
  ["fallback", () => fallbackDir],
  ["engine", () => engineDir],
])("stop-verify shim (%s path)", (_label, dir) => {
  it("is a no-op without a loop file", () => {
    expect(runShim(dir(), "stop-verify.mjs", { cwd: dir() }).stdout).toBe("");
  });

  it("refuses an untrusted loop file without running the oracle", () => {
    const work = tmp("maaaw-shim-loop-");
    mkdirSync(join(work, ".agent"));
    const marker = join(work, "oracle-ran.txt");
    writeFileSync(
      join(work, ".agent", "loop.json"),
      JSON.stringify({
        oracle: `node -e "require('fs').writeFileSync('${marker.replaceAll("\\", "/")}','x')"`,
        max_iterations: 3,
      }),
    );
    const { stdout } = runShim(dir(), "stop-verify.mjs", { cwd: work });
    expect(stdout).toContain("refused");
    expect(stdout).not.toContain('"decision"');
    expect(existsSync(marker)).toBe(false); // the oracle must NOT have run
  });

  it("runs a trusted loop: blocks on failure with output tail, allows on pass", () => {
    const work = tmp("maaaw-shim-loop2-");
    mkdirSync(join(work, ".agent"));
    const loopPath = join(work, ".agent", "loop.json");
    const fail = `${JSON.stringify(process.execPath)} -e "console.log('fail-detail'); process.exit(1)"`;
    writeFileSync(
      loopPath,
      JSON.stringify({ trusted: true, oracle: fail, max_iterations: 3, iteration: 0 }),
    );
    const blocked = runShim(dir(), "stop-verify.mjs", { cwd: work });
    const parsed = JSON.parse(blocked.stdout) as { decision: string; reason: string };
    expect(parsed.decision).toBe("block");
    expect(parsed.reason).toContain("fail-detail");
    expect(parsed.reason).toContain("iteration 1/3");
    const updated = JSON.parse(readFileSync(loopPath, "utf-8")) as { iteration: number };
    expect(updated.iteration).toBe(1);

    const pass = `${JSON.stringify(process.execPath)} -e "process.exit(0)"`;
    writeFileSync(
      loopPath,
      JSON.stringify({ trusted: true, oracle: pass, max_iterations: 3, iteration: 1 }),
    );
    const allowed = runShim(dir(), "stop-verify.mjs", { cwd: work });
    expect(allowed.stdout).toContain("Loop complete");
    expect(existsSync(loopPath)).toBe(false); // loop file removed on success
  });

  it("stops with an honest message when the budget is exhausted", () => {
    const work = tmp("maaaw-shim-loop3-");
    mkdirSync(join(work, ".agent"));
    writeFileSync(
      join(work, ".agent", "loop.json"),
      JSON.stringify({ trusted: true, oracle: "whatever", max_iterations: 2, iteration: 2 }),
    );
    const { stdout } = runShim(dir(), "stop-verify.mjs", { cwd: work });
    expect(stdout).toContain("budget exhausted");
    expect(stdout).toContain("do not claim success");
  });
});

describe("post-edit and session-context shims", () => {
  it("post-edit is silent on unknown file types (both paths)", () => {
    const payload = { tool_name: "Write", tool_input: { file_path: "x.unknownext" } };
    expect(runShim(fallbackDir, "post-edit.mjs", payload).stdout).toBe("");
    expect(runShim(engineDir, "post-edit.mjs", payload).stdout).toBe("");
  });

  it("session-context reports branch and dirt (engine path, real repo)", () => {
    const { stdout } = runShim(engineDir, "session-context.mjs", { cwd: REPO }, REPO);
    expect(stdout).toContain("[session-context]");
    expect(stdout).toContain("branch:");
  });

  it("session-context fallback emits the minimal git one-liner", () => {
    const { stdout } = runShim(fallbackDir, "session-context.mjs", { cwd: REPO }, REPO);
    expect(stdout).toContain("branch:");
    expect(stdout).toContain("install the maaawkit engine");
  });
});

describe("shim drift gate", () => {
  for (const shim of SHIMS) {
    it(`shims/${shim} equals template + current rule table`, () => {
      const template = readFileSync(join(REPO, "shims", "templates", shim), "utf-8");
      const committed = readFileSync(join(REPO, "shims", shim), "utf-8");
      expect(committed, `run \`npm run shims\` to regenerate ${shim}`).toBe(generateShim(template));
    });
  }
});

describe("latency budgets (roadmap §4: <80 ms fallback, <250 ms engine)", () => {
  function median(runs: number[]): number {
    const sorted = [...runs].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
  }

  it("fallback guard decides within budget", () => {
    const runs = Array.from(
      { length: 5 },
      () => runShim(fallbackDir, "guard.mjs", bash("git status")).ms,
    );
    expect(median(runs)).toBeLessThan(80 * HEADROOM);
  });

  it("engine guard decides within budget", () => {
    const runs = Array.from(
      { length: 5 },
      () => runShim(engineDir, "guard.mjs", bash("git status")).ms,
    );
    expect(median(runs)).toBeLessThan(250 * HEADROOM);
  });
});
