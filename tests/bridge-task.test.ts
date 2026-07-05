/**
 * Porting spec: codex-worker.py task primitives → src/bridge/task.ts
 * Slugs, mode taxonomy, worktree/branch naming, worker prompt contract, and
 * structured result parsing.
 */
import { describe, expect, it } from "vitest";
import {
  ALL_MODES,
  buildWorkerPrompt,
  isWriteMode,
  parseWorkerResult,
  slugify,
  workerBranch,
  worktreeName,
} from "../src/bridge/task.js";

describe("bridge: slugify", () => {
  it("produces filesystem/branch-safe slugs", () => {
    expect(slugify("Fix the login bug!")).toBe("fix-the-login-bug");
    expect(slugify("  __Weird--Input__  ")).toBe("weird-input");
    expect(slugify("ÜNICODE tásk ñame")).toBe("nicode-t-sk-ame");
  });

  it("caps length without trailing hyphens", () => {
    const slug = slugify(`${"a".repeat(30)} ${"b".repeat(30)}`);
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("falls back to 'task' for empty input", () => {
    expect(slugify("!!!")).toBe("task");
    expect(slugify("")).toBe("task");
  });
});

describe("bridge: modes and naming", () => {
  it("classifies write vs read modes", () => {
    expect(isWriteMode("implementation-worktree")).toBe(true);
    expect(isWriteMode("test-fix")).toBe(true);
    expect(isWriteMode("backend-task")).toBe(true);
    expect(isWriteMode("review-only")).toBe(false);
    expect(isWriteMode("security-pass")).toBe(false);
    expect(ALL_MODES).toHaveLength(5);
  });

  it("names worktrees and branches per agent", () => {
    expect(worktreeName("MyRepo", "codex", "fix-login")).toBe("MyRepo-codex-fix-login");
    expect(workerBranch("gemini", "fix-login")).toBe("gemini/fix-login");
  });
});

describe("bridge: worker prompt contract", () => {
  const common = { task: "Fix the flaky test", agent: "codex", resultName: "r.md" };

  it("write modes permit edits and demand verification", () => {
    const p = buildWorkerPrompt({ ...common, mode: "implementation-worktree" });
    expect(p).toContain("You may edit files in this isolated worktree.");
    expect(p).toContain("smallest relevant verification command");
    expect(p).not.toContain("Treat the repository as read-only");
  });

  it("read modes forbid edits", () => {
    const p = buildWorkerPrompt({ ...common, mode: "review-only" });
    expect(p).toContain("Do not edit files.");
    expect(p).toContain("Treat the repository as read-only");
    expect(p).not.toContain("You may edit files");
  });

  it("always includes the safety rails", () => {
    for (const mode of ALL_MODES) {
      const p = buildWorkerPrompt({ ...common, mode });
      expect(p).toContain("Do not commit, push, publish");
      expect(p).toContain("Do not edit secrets");
      expect(p).toContain("Do not weaken tests");
    }
  });

  it("includes the oracle when given", () => {
    const p = buildWorkerPrompt({ ...common, mode: "test-fix", oracle: "npm test" });
    expect(p).toContain("## Verification oracle");
    expect(p).toContain("`npm test`");
  });

  it("embeds orchestrator-selected prompt asset with provenance", () => {
    const p = buildWorkerPrompt({
      ...common,
      mode: "review-only",
      promptAsset: {
        id: "maaaw-kit.agent.code-reviewer",
        path: "plugins/maaaw-kit/agents/code-reviewer.md",
        content: "# Reviewer contract\nReport findings only.",
      },
    });
    expect(p).toContain("## Orchestrator-selected prompt asset");
    expect(p).toContain("Asset: maaaw-kit.agent.code-reviewer");
    expect(p).toContain("Report findings only.");
  });

  it("pins the required result format and result path", () => {
    const p = buildWorkerPrompt({ ...common, mode: "review-only" });
    for (const section of [
      "## Status",
      "## Summary",
      "## Assumptions",
      "## Changed files",
      "## Verification run",
      "## Findings or implementation notes",
      "## Needs review",
    ]) {
      expect(p).toContain(section);
    }
    expect(p).toContain(".agent/bridge/results/r.md");
  });
});

describe("bridge: worker result parsing", () => {
  const result = `# Worker Result

## Status
success

## Summary
- Did the thing.

## Assumptions
None

## Changed files
src/a.ts

## Verification run
npm test — pass

## Findings or implementation notes
Notes here.

## Needs review
Nothing.
`;

  it("parses status and sections", () => {
    const parsed = parseWorkerResult(result);
    expect(parsed.status).toBe("success");
    expect(parsed.sections["summary"]).toContain("Did the thing.");
    expect(parsed.sections["changed files"]).toBe("src/a.ts");
  });

  it("handles partial/failed/unknown statuses", () => {
    expect(parseWorkerResult(result.replace("success", "partial")).status).toBe("partial");
    expect(parseWorkerResult(result.replace("success", "failed")).status).toBe("failed");
    expect(parseWorkerResult("no sections at all").status).toBe("unknown");
  });
});
