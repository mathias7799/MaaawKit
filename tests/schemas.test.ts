/**
 * Phase 1 spec: zod domain schemas — round-trips, defaults, rejection of
 * malformed records, and JSON Schema export.
 */
import { describe, expect, it } from "vitest";
import {
  AdapterSpecSchema,
  EXPORTED_SCHEMAS,
  FindingSchema,
  HandoffDocSchema,
  JobRecordSchema,
  KitConfigSchema,
  LoopFileSchema,
  MemoryRecordFileSchema,
  toJsonSchema,
} from "../src/schemas/index.js";

describe("KitConfig", () => {
  it("parses empty input into full defaults", () => {
    const cfg = KitConfigSchema.parse({});
    expect(cfg.guardLevel).toBe("standard");
    expect(cfg.docsDir).toBe("docs");
    expect(cfg.memory.digestTokenBudget).toBe(1500);
    expect(cfg.memory.decayDays).toBe(45);
    expect(cfg.dials.auditDepth).toBe("standard");
    expect(cfg.mcp.writeModeClients).toEqual([]);
  });

  it("round-trips through JSON", () => {
    const cfg = KitConfigSchema.parse({
      stacks: ["node", "dotnet"],
      oracle: "npm test",
      guardLevel: "strict",
      memory: { digestTokenBudget: 900 },
    });
    const again = KitConfigSchema.parse(JSON.parse(JSON.stringify(cfg)));
    expect(again).toEqual(cfg);
    expect(again.memory.digestTokenBudget).toBe(900);
    expect(again.memory.decayDays).toBe(45); // sibling default preserved
  });

  it("rejects invalid values with named paths", () => {
    const r = KitConfigSchema.safeParse({ guardLevel: "yolo" });
    expect(r.success).toBe(false);
    const r2 = KitConfigSchema.safeParse({ stacks: ["cobol"] });
    expect(r2.success).toBe(false);
  });
});

describe("JobRecord", () => {
  const job = {
    id: "job_a1b2c3d4",
    agent: "codex",
    mode: "review-only",
    task: "review the diff",
    cwd: "/repo",
    cmd: ["codex", "exec", "-"],
    status: "prepared",
    createdAt: "2026-07-04T12:00:00Z",
  };

  it("round-trips", () => {
    const parsed = JobRecordSchema.parse(job);
    expect(JobRecordSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it("rejects bad ids, statuses, and empty commands", () => {
    expect(JobRecordSchema.safeParse({ ...job, id: "nope" }).success).toBe(false);
    expect(JobRecordSchema.safeParse({ ...job, status: "zombie" }).success).toBe(false);
    expect(JobRecordSchema.safeParse({ ...job, cmd: [] }).success).toBe(false);
    expect(JobRecordSchema.safeParse({ ...job, createdAt: "yesterday" }).success).toBe(false);
  });
});

describe("MemoryRecord", () => {
  const record = {
    id: "mem_7f3a",
    type: "lesson",
    title: "EF migrations must run before seeding in CI",
    tags: ["ci", "database"],
    paths: ["src/Data/**"],
    confidence: "high",
    status: "active",
    created: "2026-07-05",
    lastConfirmed: "2026-07-05",
    hits: 3,
    source: "session",
    body: "One paragraph of the actual knowledge.",
  };

  it("round-trips with body", () => {
    const parsed = MemoryRecordFileSchema.parse(record);
    expect(MemoryRecordFileSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it("applies defaults for optional lifecycle fields", () => {
    const minimal = MemoryRecordFileSchema.parse({
      id: "mem_ab12",
      type: "decision",
      title: "t",
      created: "2026-07-04",
      lastConfirmed: "2026-07-04",
      body: "b",
    });
    expect(minimal.status).toBe("active");
    expect(minimal.confidence).toBe("medium");
    expect(minimal.hits).toBe(0);
  });

  it("rejects malformed ids, dates, and types", () => {
    expect(MemoryRecordFileSchema.safeParse({ ...record, id: "memory-1" }).success).toBe(false);
    expect(MemoryRecordFileSchema.safeParse({ ...record, created: "05/07/2026" }).success).toBe(
      false,
    );
    expect(MemoryRecordFileSchema.safeParse({ ...record, type: "vibe" }).success).toBe(false);
    expect(MemoryRecordFileSchema.safeParse({ ...record, body: "" }).success).toBe(false);
  });
});

describe("Finding / Handoff / AdapterSpec / LoopFile", () => {
  it("finding round-trips and defaults confidence", () => {
    const f = FindingSchema.parse({
      severity: "high",
      title: "SQL injection in search",
      evidence: "raw string concat at src/db.ts:42",
    });
    expect(f.confidence).toBe("medium");
    expect(FindingSchema.safeParse({ severity: "mega", title: "x", evidence: "e" }).success).toBe(
      false,
    );
  });

  it("handoff requires goal/status and defaults arrays", () => {
    const h = HandoffDocSchema.parse({
      goal: "finish the parser",
      status: "half done",
      createdAt: "2026-07-04T12:00:00Z",
    });
    expect(h.decisions).toEqual([]);
    expect(h.fromAgent).toBe("claude");
    expect(HandoffDocSchema.safeParse({ goal: "", status: "s", createdAt: "x" }).success).toBe(
      false,
    );
  });

  it("adapter spec defaults detect args and verifiedAgainst", () => {
    const a = AdapterSpecSchema.parse({
      id: "codex",
      bin: "codex",
      readArgs: ["exec", "--sandbox", "read-only", "-"],
      writeArgs: ["exec", "--sandbox", "workspace-write", "-"],
    });
    expect(a.detectArgs).toEqual(["--version"]);
    expect(a.verifiedAgainst).toBe("unverified");
  });

  it("loop file demands literal trusted:true (the security gate is in the type)", () => {
    expect(
      LoopFileSchema.safeParse({ trusted: true, oracle: "npm test", max_iterations: 5 }).success,
    ).toBe(true);
    expect(
      LoopFileSchema.safeParse({ trusted: "true", oracle: "npm test", max_iterations: 5 }).success,
    ).toBe(false);
    expect(LoopFileSchema.safeParse({ oracle: "npm test", max_iterations: 5 }).success).toBe(false);
  });
});

describe("JSON Schema export", () => {
  it("exports a valid draft 2020-12 schema for every model", () => {
    for (const name of Object.keys(EXPORTED_SCHEMAS) as (keyof typeof EXPORTED_SCHEMAS)[]) {
      const schema = toJsonSchema(name);
      expect(schema["$schema"]).toContain("2020-12");
      expect(schema["type"]).toBe("object");
      expect(schema["properties"]).toBeDefined();
    }
  });
});
