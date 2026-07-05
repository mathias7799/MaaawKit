/**
 * Oracle runner: the shell-executed verification command used by the Stop hook
 * and the bridge's post-job verdict. Trust-sensitive, so its pass/fail/timeout
 * branches are pinned here.
 */
import { describe, expect, it } from "vitest";
import { runTrustedOracle } from "../src/hooks/oracle.js";

describe("runTrustedOracle", () => {
  it("passes on a zero exit and captures output", async () => {
    const run = await runTrustedOracle('node -e "console.log(42)"', process.cwd(), 30_000);
    expect(run.passed).toBe(true);
    expect(run.exitCode).toBe(0);
    expect(run.output).toContain("42");
    expect(run.startedAt).toMatch(/^\d\d:\d\d:\d\d$/);
    expect(run.endedAt).toMatch(/^\d\d:\d\d:\d\d$/);
  });

  it("fails on a non-zero exit", async () => {
    const run = await runTrustedOracle('node -e "process.exit(3)"', process.cwd(), 30_000);
    expect(run.passed).toBe(false);
    expect(run.exitCode).toBe(3);
  });

  it("reports a timeout instead of hanging", async () => {
    const run = await runTrustedOracle('node -e "setTimeout(()=>{}, 5000)"', process.cwd(), 200);
    expect(run.passed).toBe(false);
    expect(run.exitCode).toBeNull();
    expect(run.output).toContain("timed out");
  });
});
