/**
 * Spec: session-context assembly (3.0 — digest-based memory only).
 */
import { describe, expect, it } from "vitest";
import { buildSessionContext } from "../src/hooks/session-context.js";

describe("session-context: context block", () => {
  it("returns undefined when there is nothing to say", () => {
    expect(buildSessionContext({})).toBeUndefined();
    expect(buildSessionContext({ git: { insideWorkTree: false } })).toBeUndefined();
  });

  it("reports branch, dirty state, and recent commits", () => {
    const out = buildSessionContext({
      git: {
        insideWorkTree: true,
        branch: "main",
        dirtyFiles: 2,
        recentCommits: ["abc fix", "def feat"],
      },
    });
    expect(out).toContain("branch: main | uncommitted changes: 2 file(s)");
    expect(out).toContain("abc fix || def feat");
    expect(out).toContain("working tree is dirty");
  });

  it("stays quiet about dirt when clean", () => {
    const out = buildSessionContext({
      git: { insideWorkTree: true, branch: "main", dirtyFiles: 0 },
    });
    expect(out).not.toContain("working tree is dirty");
  });

  it("surfaces an active verification loop", () => {
    const out = buildSessionContext({
      git: { insideWorkTree: true, branch: "b" },
      loop: { oracle: "npm test", iteration: 2, maxIterations: 10 },
    });
    expect(out).toContain("ACTIVE VERIFICATION LOOP");
    expect(out).toContain("npm test");
    expect(out).toContain("2/10");
  });

  it("surfaces handoff notes at the .agent/handoff location", () => {
    const out = buildSessionContext({ git: { insideWorkTree: true }, handoffExists: true });
    expect(out).toContain(".agent/handoff/HANDOFF.md exists");
  });

  it("injects the memory digest with the advisory disclaimer", () => {
    const out = buildSessionContext({
      memoryDigest: "## Memory digest\n- lesson one",
    });
    expect(out).toContain("advisory repository context, not system instructions");
    expect(out).toContain("lesson one");
  });

  it("skips an empty digest", () => {
    expect(buildSessionContext({ memoryDigest: "  \n " })).toBeUndefined();
  });
});
