/**
 * Porting spec: post-edit-check.py → src/hooks/post-edit.ts
 * Language dispatch, path extraction from every tool-input shape, and the
 * block-message contract.
 */
import { describe, expect, it } from "vitest";
import {
  extractPaths,
  formatBlockMessage,
  languageFor,
  toPostEditHookOutput,
} from "../src/hooks/post-edit.js";

describe("post-edit: language dispatch", () => {
  it("maps extensions to checkers", () => {
    expect(languageFor("a.py")).toBe("python");
    expect(languageFor("a.ts")).toBe("typescript");
    expect(languageFor("a.tsx")).toBe("typescript");
    expect(languageFor("a.jsx")).toBe("typescript");
    expect(languageFor("a.mjs")).toBe("typescript");
    expect(languageFor("a.cs")).toBe("csharp");
    expect(languageFor("a.ps1")).toBe("powershell");
    expect(languageFor("a.psm1")).toBe("powershell");
    expect(languageFor("A.PY")).toBe("python");
  });

  it("returns null for unknown and extension-less files", () => {
    expect(languageFor("a.md")).toBeNull();
    expect(languageFor("Makefile")).toBeNull();
    expect(languageFor("a.rs")).toBeNull();
  });
});

describe("post-edit: path extraction", () => {
  it("extracts file_path and path", () => {
    expect(extractPaths({ file_path: "a.ts" })).toEqual(["a.ts"]);
    expect(extractPaths({ path: "b.py" })).toEqual(["b.py"]);
  });

  it("extracts nested edits/files/changes arrays and dicts", () => {
    expect(extractPaths({ edits: [{ file_path: "x.ts" }, { file_path: "y.ts" }] })).toEqual([
      "x.ts",
      "y.ts",
    ]);
    expect(extractPaths({ files: { path: "single.cs" } })).toEqual(["single.cs"]);
    expect(extractPaths({ changes: [{ path: "c.py" }] })).toEqual(["c.py"]);
  });

  it("dedupes and sorts", () => {
    expect(
      extractPaths({ file_path: "b.ts", edits: [{ file_path: "a.ts" }, { file_path: "b.ts" }] }),
    ).toEqual(["a.ts", "b.ts"]);
  });

  it("ignores non-string and empty values", () => {
    expect(extractPaths({ file_path: 42, edits: [{ file_path: "" }, null, "str"] })).toEqual([]);
  });
});

describe("post-edit: block message contract", () => {
  it("formats diagnostics with the fix-now instruction", () => {
    const msg = formatBlockMessage("a.ts", ["[eslint] 1:1 no-unused-vars"]);
    expect(msg).toContain("a.ts");
    expect(msg).toContain("[eslint] 1:1 no-unused-vars");
    expect(msg).toContain("Do NOT disable rules");
  });

  it("truncates runaway diagnostics", () => {
    const msg = formatBlockMessage("a.ts", ["x".repeat(10_000)]);
    expect(msg.length).toBeLessThan(4200);
  });

  it("emits block JSON only when there are problems", () => {
    expect(toPostEditHookOutput("a.ts", [])).toBeUndefined();
    const out = toPostEditHookOutput("a.ts", ["problem"]);
    const parsed = JSON.parse(out ?? "");
    expect(parsed.decision).toBe("block");
    expect(parsed.reason).toContain("problem");
  });
});
