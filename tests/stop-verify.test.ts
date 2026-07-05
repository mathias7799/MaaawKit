/**
 * Porting spec: stop-verify.py → src/hooks/stop-verify.ts
 * Trust gating, iteration budget, stall detection, and the block/allow contract.
 */
import { describe, expect, it } from "vitest";
import {
  type LoopState,
  type OracleResult,
  afterOracle,
  budgetExhausted,
  failureSignature,
  parseLoopState,
  trustRefusal,
} from "../src/hooks/stop-verify.js";

const base: LoopState = {
  trusted: true,
  oracle: "npm test",
  max_iterations: 5,
};

function oracle(passed: boolean, output = "out"): OracleResult {
  return { passed, output, startedAt: "10:00:00", endedAt: "10:00:05" };
}

describe("stop-verify: loop file parsing", () => {
  it("accepts a valid loop file", () => {
    expect(parseLoopState({ oracle: "npm test", max_iterations: 3 })).not.toBeNull();
  });

  it("rejects garbage", () => {
    expect(parseLoopState(null)).toBeNull();
    expect(parseLoopState("string")).toBeNull();
    expect(parseLoopState({ max_iterations: 3 })).toBeNull();
    expect(parseLoopState({ oracle: "", max_iterations: 3 })).toBeNull();
    expect(parseLoopState({ oracle: "x", max_iterations: "many" })).toBeNull();
  });
});

describe("stop-verify: trust gate (security-critical)", () => {
  it("refuses when trusted flag is missing or not exactly true", () => {
    expect(trustRefusal({ ...base, trusted: undefined }, false, ".claude/loop.json")).toContain(
      'missing "trusted": true',
    );
    expect(trustRefusal({ ...base, trusted: "true" }, false, "x")).not.toBeNull();
    expect(trustRefusal({ ...base, trusted: 1 }, false, "x")).not.toBeNull();
  });

  it("refuses git-tracked loop files even when trusted (cloned-repo attack vector)", () => {
    const msg = trustRefusal(base, true, ".claude/loop.json");
    expect(msg).toContain("tracked in git");
    expect(msg).toContain("NOT run");
  });

  it("passes an untracked trusted loop file", () => {
    expect(trustRefusal(base, false, ".claude/loop.json")).toBeNull();
  });
});

describe("stop-verify: iteration budget", () => {
  it("stops at budget exhaustion with an honest message", () => {
    const msg = budgetExhausted({ ...base, iteration: 5 });
    expect(msg).toContain("5/5");
    expect(msg).toContain("do not claim success");
  });

  it("stops on non-positive budget", () => {
    expect(budgetExhausted({ ...base, max_iterations: 0 })).not.toBeNull();
  });

  it("continues under budget", () => {
    expect(budgetExhausted({ ...base, iteration: 4 })).toBeNull();
    expect(budgetExhausted(base)).toBeNull();
  });
});

describe("stop-verify: after the oracle runs", () => {
  it("allows stop with success message and deletes the loop file when passing", async () => {
    const d = await afterOracle({ ...base, iteration: 2 }, oracle(true, "all green"));
    expect(d.kind).toBe("allow-stop-with-message");
    if (d.kind === "allow-stop-with-message") {
      expect(d.deleteLoopFile).toBe(true);
      expect(d.message).toContain("2 fix iteration(s)");
      expect(d.message).toContain("all green");
    }
  });

  it("blocks with oracle tail and increments iteration when failing", async () => {
    const d = await afterOracle({ ...base, iteration: 1 }, oracle(false, "FAIL: expected 2 got 3"));
    expect(d.kind).toBe("block");
    if (d.kind === "block") {
      expect(d.newState.iteration).toBe(2);
      expect(d.reason).toContain("iteration 2/5");
      expect(d.reason).toContain("FAIL: expected 2 got 3");
      expect(d.reason).not.toContain("STALLED");
    }
  });

  it("includes the goal when present", async () => {
    const d = await afterOracle({ ...base, goal: "make tests pass" }, oracle(false));
    if (d.kind === "block") expect(d.reason).toContain("GOAL: make tests pass");
  });

  it("detects a stall after three identical failures", async () => {
    let state: LoopState = { ...base, iteration: 0 };
    for (let i = 0; i < 2; i++) {
      const d = await afterOracle(state, oracle(false, "same failure"));
      expect(d.kind).toBe("block");
      if (d.kind === "block") {
        expect(d.reason).not.toContain("STALLED");
        state = d.newState;
      }
    }
    const third = await afterOracle(state, oracle(false, "same failure"));
    if (third.kind === "block") {
      expect(third.newState.failure_streak).toBe(3);
      expect(third.reason).toContain("STALLED");
    }
  });

  it("resets the streak when the failure changes", async () => {
    const first = await afterOracle(base, oracle(false, "failure A"));
    expect(first.kind).toBe("block");
    if (first.kind !== "block") return;
    const second = await afterOracle(first.newState, oracle(false, "failure B"));
    if (second.kind === "block") expect(second.newState.failure_streak).toBe(1);
  });

  it("truncates oracle output to max_output", async () => {
    const long = "x".repeat(10_000);
    const d = await afterOracle({ ...base, max_output: 100 }, oracle(false, long));
    if (d.kind === "block") {
      expect(d.reason.length).toBeLessThan(1500);
    }
  });
});

describe("stop-verify: failure signatures", () => {
  it("is stable for identical output and differs for different output", async () => {
    const a1 = await failureSignature("failure A");
    const a2 = await failureSignature("failure A");
    const b = await failureSignature("failure B");
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
    expect(a1).toMatch(/^[0-9a-f]{12}$/);
  });

  it("only considers the output tail (noise-resistant)", async () => {
    const tail = "the real failure".padStart(2000, "y");
    expect(await failureSignature(`prefix1${tail}`)).toBe(await failureSignature(`prefix2${tail}`));
  });
});
