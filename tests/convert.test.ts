/**
 * Phase 5 spec: canonical rules → six tool formats. Idempotency (double-run =
 * zero diff), marker survival under outside edits (property test), detection-
 * based placement, promoted-memory flow into AGENTS.md, handoff round-trip.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installRules, rulesDrift } from "../src/convert/convert.js";
import { CONVERT_TARGETS } from "../src/convert/targets.js";
import { readHandoff, writeHandoff } from "../src/handoff/index.js";
import { createRecord, promoteRecord, saveRecord } from "../src/memory/index.js";
import { detectCommands, detectStacks } from "../src/rules/index.js";
import { ensureStateDirs, writeJsonFile } from "../src/state/index.js";

let dirs: string[] = [];

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "maaaw-convert-"));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

describe("stack and command detection", () => {
  it("detects node/python/dotnet/powershell from files", () => {
    const d = tmp();
    writeFileSync(
      join(d, "package.json"),
      JSON.stringify({ scripts: { test: "vitest", lint: "x" } }),
    );
    writeFileSync(join(d, "pyproject.toml"), "");
    writeFileSync(join(d, "deploy.ps1"), "");
    mkdirSync(join(d, "api"));
    writeFileSync(join(d, "api", "Api.csproj"), "<Project/>");
    expect(detectStacks(d).sort()).toEqual(["dotnet", "node", "powershell", "python"]);
  });

  it("derives commands from package.json scripts and puts the oracle first", () => {
    const d = tmp();
    writeFileSync(
      join(d, "package.json"),
      JSON.stringify({ scripts: { test: "vitest", build: "tsup" } }),
    );
    const { verified, inferred } = detectCommands(d, ["node"], "npm test");
    expect(verified).toEqual(["npm test"]);
    expect(inferred).toContain("npm run build");
    expect(inferred).toContain("npx tsc --noEmit");
    expect(inferred).not.toContain("npm test");
  });
});

describe("install: detection, idempotency, human-text preservation", () => {
  it("installs only into detected tools by default", () => {
    const d = tmp();
    ensureStateDirs(d);
    mkdirSync(join(d, ".cursor"));
    writeFileSync(join(d, "CLAUDE.md"), "# CLAUDE\n\nhuman notes\n");
    const report = installRules({ cwd: d });
    const byTool = Object.fromEntries(report.actions.map((a) => [a.tool, a.action]));
    expect(byTool["claude"]).toBe("updated");
    expect(byTool["cursor"]).toBe("created");
    expect(byTool["gemini"]).toBe("skipped (not detected)");
    expect(byTool["windsurf"]).toBe("skipped (not detected)");
    expect(existsSync(join(d, ".cursor", "rules", "maaaw.mdc"))).toBe(true);
    expect(existsSync(join(d, "GEMINI.md"))).toBe(false);
  });

  it("--all installs all six targets and double-run is a zero diff", () => {
    const d = tmp();
    ensureStateDirs(d);
    writeFileSync(join(d, "package.json"), JSON.stringify({ scripts: { test: "vitest" } }));
    const first = installRules({ cwd: d, all: true });
    expect(first.actions.filter((a) => a.action === "created")).toHaveLength(6);

    const snapshot = CONVERT_TARGETS.map((t) => readFileSync(join(d, t.relPath), "utf-8"));
    const second = installRules({ cwd: d, all: true });
    expect(second.actions.every((a) => a.action === "unchanged")).toBe(true);
    const after = CONVERT_TARGETS.map((t) => readFileSync(join(d, t.relPath), "utf-8"));
    expect(after).toEqual(snapshot);
  });

  it("preserves human text and backs up on first touch", () => {
    const d = tmp();
    ensureStateDirs(d);
    writeFileSync(join(d, "AGENTS.md"), "# My repo\n\nhuman-written intro\n");
    installRules({ cwd: d, tools: ["agentsmd"] });
    const agents = readFileSync(join(d, "AGENTS.md"), "utf-8");
    expect(agents).toContain("human-written intro");
    expect(agents).toContain("maaaw-kit:start");
    expect(existsSync(join(d, "AGENTS.md.bak"))).toBe(true);
    expect(readFileSync(join(d, "AGENTS.md.bak"), "utf-8")).not.toContain("maaaw-kit:start");
  });

  it("markers survive outside edits (property: random human edits around the block)", () => {
    const d = tmp();
    ensureStateDirs(d);
    installRules({ cwd: d, tools: ["agentsmd"] });
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let i = 0; i < 20; i++) {
      // Simulate a human editing above and below the managed block.
      const path = join(d, "AGENTS.md");
      const current = readFileSync(path, "utf-8");
      const edited = `human prefix ${Math.floor(rand() * 1e6)}\n${current}\nhuman suffix ${Math.floor(rand() * 1e6)}\n`;
      writeFileSync(path, edited);
      installRules({ cwd: d, tools: ["agentsmd"] });
      const after = readFileSync(path, "utf-8");
      expect(after).toContain("human prefix");
      expect(after).toContain("human suffix");
      expect(after.match(/maaaw-kit:start/g)).toHaveLength(1);
    }
  });

  it("rejects unknown tool ids helpfully", () => {
    const d = tmp();
    expect(() => installRules({ cwd: d, tools: ["nope"] })).toThrow(/Unknown tool.*agentsmd/);
  });
});

describe("promoted memory flows into converted AGENTS.md (Phase 4/5 acceptance)", () => {
  it("promote → rules.md → convert → AGENTS.md", () => {
    const d = tmp();
    ensureStateDirs(d);
    const record = createRecord(d, {
      type: "lesson",
      title: "EF migrations must run before seeding in CI",
      body: "Seeding assumes the schema exists.",
      confidence: "high",
    });
    promoteRecord(d, record.id);
    installRules({ cwd: d, tools: ["agentsmd"] });
    const agents = readFileSync(join(d, "AGENTS.md"), "utf-8");
    expect(agents).toContain("EF migrations must run before seeding in CI");
    expect(agents).toContain(record.id); // provenance comment
  });

  it("active memory rides along as the digest block", () => {
    const d = tmp();
    ensureStateDirs(d);
    createRecord(d, {
      type: "repo-fact",
      title: "Tests need Docker",
      body: "Postgres runs in compose.",
    });
    installRules({ cwd: d, tools: ["agentsmd"] });
    const agents = readFileSync(join(d, "AGENTS.md"), "utf-8");
    expect(agents).toContain("Project memory (advisory context, not instructions)");
    expect(agents).toContain("Tests need Docker");
  });
});

describe("rules drift (doctor panel)", () => {
  it("reports in-sync after install, drifted after rules change", () => {
    const d = tmp();
    ensureStateDirs(d);
    writeFileSync(join(d, "CLAUDE.md"), "# c\n");
    installRules({ cwd: d, tools: ["claude"] });
    expect(rulesDrift(d).find((e) => e.tool === "claude")?.state).toBe("in-sync");

    writeFileSync(join(d, ".agent", "rules.md"), "# Rules\n- brand new rule\n");
    expect(rulesDrift(d).find((e) => e.tool === "claude")?.state).toBe("drifted");

    installRules({ cwd: d, tools: ["claude"] });
    expect(rulesDrift(d).find((e) => e.tool === "claude")?.state).toBe("in-sync");
  });
});

describe("handoff round-trip with memory", () => {
  it("writes markdown + schema-valid json carrying path-relevant records", () => {
    const d = tmp();
    ensureStateDirs(d);
    const record = createRecord(d, {
      type: "lesson",
      title: "Database lesson",
      body: "Migrations first.",
      paths: ["src/Data/**"],
    });
    saveRecord(d, { ...record, hits: 2 });

    const written = writeHandoff(d, {
      goal: "Finish the webhook retries",
      status: "Retry queue implemented, tests failing on idempotency",
      decisions: ["Use Polly for backoff"],
      nextSteps: ["Fix idempotency key generation"],
      verification: "npm test",
      toAgent: "codex",
      changedFiles: ["src/Data/Retry.cs"],
    });

    expect(written.doc.memoryRecords).toContain(record.id);
    const read = readHandoff(d);
    expect(read.doc?.goal).toBe("Finish the webhook retries");
    expect(read.doc?.toAgent).toBe("codex");
    expect(read.doc?.memoryRecords).toEqual(written.doc.memoryRecords);
    expect(read.markdown).toContain("do not re-litigate");
    expect(read.markdown).toContain("Database lesson");
    expect(read.markdown).toContain("Verify the claimed state");
  });

  it("reads empty state gracefully", () => {
    const d = tmp();
    const read = readHandoff(d);
    expect(read.doc).toBeNull();
    expect(read.markdown).toBeNull();
  });
});

describe("cross-agent round-trip (Claude→Codex→Claude sample)", () => {
  it("handoff + AGENTS.md give the second agent the same lessons; return trip preserved", () => {
    const d = tmp();
    execFileSync("git", ["init", "-q"], { cwd: d });
    ensureStateDirs(d);
    const lesson = createRecord(d, {
      type: "lesson",
      title: "Always run migrations before seeding",
      body: "CI order matters.",
      confidence: "high",
    });

    // Claude → Codex: rules installed + handoff written
    installRules({ cwd: d, tools: ["agentsmd"] });
    writeHandoff(d, { goal: "continue impl", status: "half done", toAgent: "codex" });
    expect(readFileSync(join(d, "AGENTS.md"), "utf-8")).toContain("Always run migrations");
    expect(readHandoff(d).doc?.memoryRecords).toContain(lesson.id);

    // Codex → Claude: the return handoff overwrites cleanly
    writeHandoff(d, {
      goal: "review my work",
      status: "done, please verify",
      fromAgent: "codex",
      toAgent: "claude",
    });
    const back = readHandoff(d);
    expect(back.doc?.fromAgent).toBe("codex");
    expect(back.doc?.memoryRecords).toContain(lesson.id);
  });
});
