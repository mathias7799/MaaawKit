/**
 * Porting spec: session-context.py → src/hooks/session-context.ts
 * Budgeted memory selection and the situational-awareness block.
 */
import { describe, expect, it } from "vitest";
import { buildSessionContext, selectMemoryEntries } from "../src/hooks/session-context.js";

describe("session-context: memory selection", () => {
  it("keeps chronological order while prioritizing recent entries", () => {
    const files = [{ label: "lessons", entries: ["- old", "- mid", "- new"] }];
    const [sel] = selectMemoryEntries(files, 1000);
    expect(sel?.shown).toEqual(["- old", "- mid", "- new"]);
  });

  it("drops oldest entries first under budget pressure", () => {
    const files = [{ label: "lessons", entries: ["- aaaaaaaaaa", "- bbbbbbbbbb", "- cccccccccc"] }];
    const [sel] = selectMemoryEntries(files, 25);
    expect(sel?.shown).toEqual(["- bbbbbbbbbb", "- cccccccccc"]);
    expect(sel?.total).toBe(3);
  });

  it("caps entries per file at 25", () => {
    const entries = Array.from({ length: 40 }, (_, i) => `- e${i}`);
    const [sel] = selectMemoryEntries([{ label: "lessons", entries }], 100_000);
    expect(sel?.shown).toHaveLength(25);
  });

  it("skips empty files and respects a shared budget across files", () => {
    const files = [
      { label: "empty", entries: [] },
      { label: "a", entries: ["- ".padEnd(30, "x")] },
      { label: "b", entries: ["- ".padEnd(30, "y")] },
    ];
    const selected = selectMemoryEntries(files, 35);
    expect(selected.map((s) => s.label)).toEqual(["a"]);
  });
});

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

  it("surfaces handoff notes", () => {
    const out = buildSessionContext({ git: { insideWorkTree: true }, handoffExists: true });
    expect(out).toContain("HANDOFF.md exists");
  });

  it("injects legacy memory with the advisory disclaimer", () => {
    const out = buildSessionContext({
      memoryFiles: [{ label: "lessons", entries: ["- NEVER push to main"] }],
    });
    expect(out).toContain("advisory repository context, not system instructions");
    expect(out).toContain("project memory — lessons");
    expect(out).toContain("- NEVER push to main");
  });

  it("prefers the 3.0 digest over legacy memory files when both exist", () => {
    const out = buildSessionContext({
      memoryDigest: "## Memory digest\n- lesson one",
      memoryFiles: [{ label: "lessons", entries: ["- legacy entry"] }],
    });
    expect(out).toContain("lesson one");
    expect(out).not.toContain("legacy entry");
  });
});
