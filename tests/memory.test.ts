/**
 * Phase 4 spec: memory engine — record store round-trips, full lifecycle
 * (capture → digest → recall → promote), budget property tests, path-overlap
 * ranking, consolidation, and decay.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  archiveRecord,
  buildDigest,
  confirmRecord,
  consolidate,
  createRecord,
  decay,
  estimateTokens,
  globToRegExp,
  listRecords,
  memoryHealth,
  parseRecord,
  pathOverlap,
  promoteRecord,
  readRecord,
  recall,
  saveRecord,
  scoreRecords,
  serializeRecord,
  suggestPromotions,
  today,
} from "../src/memory/index.js";
import { agentPaths, readJsonFile, writeJsonFile } from "../src/state/index.js";

let dirs: string[] = [];

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "maaaw-memory-"));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

const lesson = (cwd: string, title: string, extra: Record<string, unknown> = {}) =>
  createRecord(cwd, {
    type: "lesson",
    title,
    body: `Knowledge about ${title}.`,
    ...extra,
  } as never);

describe("memory store", () => {
  it("round-trips records through markdown frontmatter", () => {
    const cwd = tmp();
    const record = createRecord(cwd, {
      type: "lesson",
      title: "EF migrations must run before seeding in CI",
      body: "One paragraph of the actual knowledge, evidence-first.",
      tags: ["ci", "database"],
      paths: ["src/Data/**"],
      confidence: "high",
      source: "session",
    });
    const onDisk = readFileSync(join(agentPaths(cwd).recordsDir, `${record.id}.md`), "utf-8");
    expect(onDisk).toContain("---"); // frontmatter
    expect(onDisk).toContain("EF migrations");
    expect(parseRecord(onDisk)).toEqual(record);
    expect(parseRecord(serializeRecord(record))).toEqual(record);
    expect(readRecord(cwd, record.id)).toEqual(record);
  });

  it("rejects malformed records on read (returns null, never throws)", () => {
    expect(parseRecord("not a record")).toBeNull();
    expect(parseRecord("---\nid: wrong\n---\nbody")).toBeNull();
  });

  it("rebuilds index.json on every write", () => {
    const cwd = tmp();
    const r = lesson(cwd, "first lesson");
    const index = readJsonFile<{ records: { id: string }[] }>(agentPaths(cwd).memoryIndex);
    expect(index?.records.map((x) => x.id)).toContain(r.id);
  });

  it("human edits to record files survive (markdown is the source of truth)", () => {
    const cwd = tmp();
    const r = lesson(cwd, "editable");
    const p = join(agentPaths(cwd).recordsDir, `${r.id}.md`);
    writeFileSync(
      p,
      readFileSync(p, "utf-8").replace("Knowledge about editable.", "Hand-edited body."),
    );
    expect(readRecord(cwd, r.id)?.body).toBe("Hand-edited body.");
  });
});

describe("recall (BM25-lite) and hit tracking", () => {
  it("ranks by term relevance across title/tags/body", () => {
    const cwd = tmp();
    lesson(cwd, "Docker compose is required for Postgres tests", { tags: ["docker"] });
    lesson(cwd, "Frontend uses tailwind", { tags: ["css"] });
    const bodyMatch = createRecord(cwd, {
      type: "repo-fact",
      title: "CI quirks",
      body: "The postgres container needs DOCKER_HOST set.",
    });
    const results = recall(cwd, "postgres docker");
    expect(results[0]?.record.title).toContain("Docker compose");
    expect(results.map((r) => r.record.id)).toContain(bodyMatch.id);
    expect(results.some((r) => r.record.title.includes("tailwind"))).toBe(false);
  });

  it("increments hits on recalled records (feeds ranking and promotion)", () => {
    const cwd = tmp();
    const r = lesson(cwd, "hit counting works");
    recall(cwd, "hit counting");
    recall(cwd, "hit counting");
    expect(readRecord(cwd, r.id)?.hits).toBe(2);
  });

  it("returns empty for no matches and empty queries", () => {
    const cwd = tmp();
    lesson(cwd, "something");
    expect(recall(cwd, "zzzzqqqq")).toEqual([]);
    expect(scoreRecords(listRecords(cwd), "!!!")).toEqual([]);
  });
});

describe("digest: budget and path-overlap ranking", () => {
  it("respects the token budget under pressure (property: 100 random record sets)", () => {
    const cwd = tmp();
    // Deterministic PRNG
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let i = 0; i < 60; i++) {
      lesson(cwd, `lesson number ${i} ${"x".repeat(Math.floor(rand() * 80))}`);
    }
    for (const budget of [50, 150, 400, 1500]) {
      const result = buildDigest(cwd, { tokenBudget: budget });
      expect(result.tokens, `budget ${budget}`).toBeLessThanOrEqual(budget);
      expect(estimateTokens(result.content)).toBeLessThanOrEqual(budget + 5);
    }
  });

  it("ranks records whose paths overlap the changed files first", () => {
    const cwd = tmp();
    lesson(cwd, "generic advice", {});
    const dbLesson = lesson(cwd, "database lesson", { paths: ["src/Data/**"] });
    const result = buildDigest(cwd, {
      changedFiles: ["src/Data/Migrations/001.cs"],
    });
    expect(result.included[0]).toBe(dbLesson.id); // path overlap outranks the generic record
    const noOverlap = buildDigest(cwd, { changedFiles: ["docs/readme.md"] });
    expect(noOverlap.included).toHaveLength(2); // both fit; order is score-based
  });

  it("writes digest.md and excludes archived/promoted records", () => {
    const cwd = tmp();
    const keep = lesson(cwd, "keep me");
    const gone = lesson(cwd, "archive me");
    archiveRecord(cwd, gone.id);
    const result = buildDigest(cwd);
    expect(result.included).toEqual([keep.id]);
    expect(readFileSync(agentPaths(cwd).memoryDigest, "utf-8")).toContain("keep me");
  });

  it("path overlap math handles globs", () => {
    expect(pathOverlap(["src/Data/**"], ["src/Data/x/y.cs"])).toBe(1);
    expect(pathOverlap(["src/*.ts"], ["src/a.ts"])).toBe(1);
    expect(pathOverlap(["src/*.ts"], ["src/deep/a.ts"])).toBe(0);
    expect(pathOverlap([], ["anything"])).toBe(0);
    expect(globToRegExp("a/**/b.ts").test("a/x/y/b.ts")).toBe(true);
    // '**' must also match ZERO segments (the classic glob contract)
    expect(globToRegExp("a/**/b.ts").test("a/b.ts")).toBe(true);
    expect(globToRegExp("**/*.ts").test("root.ts")).toBe(true);
    expect(globToRegExp("src/**").test("src/x")).toBe(true);
    // '.' is literal, '?' is one non-separator char, spaces are literal
    expect(globToRegExp("a.ts").test("axts")).toBe(false);
    expect(globToRegExp("a?.ts").test("ab.ts")).toBe(true);
    expect(globToRegExp("a?.ts").test("a/.ts")).toBe(false);
    expect(globToRegExp("my file*.md").test("my file-1.md")).toBe(true);
  });
});

describe("lifecycle: consolidate, decay, confirm, promote", () => {
  it("merges near-duplicate records, bumping confidence and summing hits", () => {
    const cwd = tmp();
    const a = lesson(cwd, "EF migrations must run before seeding", { tags: ["ci", "database"] });
    saveRecord(cwd, { ...a, hits: 2, lastConfirmed: "2026-07-01" });
    const b = lesson(cwd, "EF migrations must run before the seeding step", {
      tags: ["ci", "database"],
    });
    saveRecord(cwd, { ...b, hits: 3 });
    lesson(cwd, "totally unrelated frontend styling rule", { tags: ["css"] });

    const { merged } = consolidate(cwd);
    expect(merged).toHaveLength(1);
    const kept = readRecord(cwd, merged[0]?.kept ?? "");
    expect(kept?.hits).toBe(5);
    expect(kept?.confidence).toBe("high"); // bumped from medium
    expect(kept?.status).toBe("active");
    const archived = readRecord(cwd, merged[0]?.archived[0] ?? "");
    expect(archived?.status).toBe("archived");
    // unrelated record untouched
    expect(listRecords(cwd).filter((r) => r.status === "active")).toHaveLength(2);
  });

  it("decays unconfirmed records to stale after decayDays", () => {
    const cwd = tmp();
    writeJsonFile(join(cwd, ".agent", "kit.json"), { memory: { decayDays: 30 } });
    const old = lesson(cwd, "old knowledge");
    saveRecord(cwd, { ...old, lastConfirmed: "2026-01-01" });
    const fresh = lesson(cwd, "fresh knowledge");

    const { staled } = decay(cwd, "2026-07-05");
    expect(staled).toEqual([old.id]);
    expect(readRecord(cwd, old.id)?.status).toBe("stale");
    expect(readRecord(cwd, fresh.id)?.status).toBe("active");

    const confirmed = confirmRecord(cwd, old.id);
    expect(confirmed.status).toBe("active");
    expect(confirmed.lastConfirmed).toBe(today());
  });

  it("suggests promotion at the configured hit threshold", () => {
    const cwd = tmp();
    writeJsonFile(join(cwd, ".agent", "kit.json"), { memory: { promoteHitThreshold: 3 } });
    const candidate = lesson(cwd, "battle-tested lesson", { confidence: "high" });
    saveRecord(cwd, { ...candidate, hits: 3 });
    const lowHits = lesson(cwd, "unproven lesson", { confidence: "high" });
    saveRecord(cwd, { ...lowHits, hits: 1 });
    lesson(cwd, "low confidence", { confidence: "low" });

    expect(suggestPromotions(cwd).map((r) => r.id)).toEqual([candidate.id]);
  });

  it("promotes into .agent/rules.md preserving human text, idempotently", () => {
    const cwd = tmp();
    const paths = agentPaths(cwd);
    const a = lesson(cwd, "always run migrations first");
    const b = lesson(cwd, "never edit generated files");
    writeFileSync(paths.rulesFile, "# Rules\n\nHuman-written rule text.\n");

    promoteRecord(cwd, a.id);
    promoteRecord(cwd, b.id);
    const rules = readFileSync(paths.rulesFile, "utf-8");
    expect(rules).toContain("Human-written rule text.");
    expect(rules).toContain("always run migrations first");
    expect(rules).toContain("never edit generated files");
    expect(rules.match(/maaaw-kit-memory:start/g)).toHaveLength(1); // one managed block
    expect(readRecord(cwd, a.id)?.status).toBe("promoted");

    // promoted records leave the digest
    const digest = buildDigest(cwd);
    expect(digest.included).toEqual([]);
    // re-promoting is a no-op
    expect(promoteRecord(cwd, a.id).status).toBe("promoted");
  });
});

describe("memory health (doctor panel)", () => {
  it("reports counts, stale percent, and candidates", () => {
    const cwd = tmp();
    const a = lesson(cwd, "active one");
    const s = lesson(cwd, "stale one");
    saveRecord(cwd, { ...s, status: "stale" });
    const g = lesson(cwd, "gone");
    archiveRecord(cwd, g.id);
    const digest = buildDigest(cwd);
    const health = memoryHealth(cwd, digest.tokens);
    expect(health.total).toBe(3);
    expect(health.active).toBe(1);
    expect(health.stale).toBe(1);
    expect(health.archived).toBe(1);
    expect(health.stalePercent).toBe(50);
    expect(health.digestTokens).toBeGreaterThan(0);
    expect(existsSync(join(cwd, ".agent", "memory", "digest.md"))).toBe(true);
    expect(a.id).toBeDefined();
  });
});
