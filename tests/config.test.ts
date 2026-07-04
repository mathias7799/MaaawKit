/**
 * Phase 1 spec: layered config resolution — precedence across all five layers,
 * deep merging, and loud-but-safe failure on broken layers.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { envLayer, mergeLayers, resolveConfig } from "../src/config/index.js";

let dirs: string[] = [];

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "maaaw-config-"));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function writeUserConfig(dir: string, value: unknown): string {
  const p = join(dir, "config.json");
  writeFileSync(p, JSON.stringify(value));
  return p;
}

function writeRepoConfig(cwd: string, value: unknown): void {
  mkdirSync(join(cwd, ".agent"), { recursive: true });
  writeFileSync(join(cwd, ".agent", "kit.json"), JSON.stringify(value));
}

describe("config: precedence across all five layers", () => {
  it("layer 1 — defaults apply with nothing else present", () => {
    const cwd = tmp();
    const { config, layers } = resolveConfig({ cwd, env: {} });
    expect(config.guardLevel).toBe("standard");
    expect(layers).toEqual(["defaults"]);
  });

  it("layer 2 — user config overrides defaults", () => {
    const cwd = tmp();
    const userPath = writeUserConfig(tmp(), { guardLevel: "relaxed", docsDir: "documentation" });
    const { config } = resolveConfig({ cwd, env: {}, userConfigPath: userPath });
    expect(config.guardLevel).toBe("relaxed");
    expect(config.docsDir).toBe("documentation");
  });

  it("layer 3 — repo kit.json overrides user config", () => {
    const cwd = tmp();
    const userPath = writeUserConfig(tmp(), { guardLevel: "relaxed", oracle: "user-oracle" });
    writeRepoConfig(cwd, { guardLevel: "strict" });
    const { config } = resolveConfig({ cwd, env: {}, userConfigPath: userPath });
    expect(config.guardLevel).toBe("strict"); // repo wins
    expect(config.oracle).toBe("user-oracle"); // user survives where repo is silent
  });

  it("layer 4 — MAAAW_* env overrides repo config", () => {
    const cwd = tmp();
    writeRepoConfig(cwd, { guardLevel: "strict", oracle: "repo-oracle" });
    const { config } = resolveConfig({
      cwd,
      env: { MAAAW_GUARD_LEVEL: "relaxed", MAAAW_ORACLE: "env-oracle" },
    });
    expect(config.guardLevel).toBe("relaxed");
    expect(config.oracle).toBe("env-oracle");
  });

  it("layer 5 — CLI flags override everything", () => {
    const cwd = tmp();
    const userPath = writeUserConfig(tmp(), { guardLevel: "relaxed" });
    writeRepoConfig(cwd, { guardLevel: "standard" });
    const { config, layers } = resolveConfig({
      cwd,
      env: { MAAAW_GUARD_LEVEL: "strict" },
      userConfigPath: userPath,
      cliOverrides: { guardLevel: "relaxed", oracle: "cli-oracle" },
    });
    expect(config.guardLevel).toBe("relaxed");
    expect(config.oracle).toBe("cli-oracle");
    expect(layers).toEqual([
      "defaults",
      `user (${userPath})`,
      `repo (${join(cwd, ".agent", "kit.json")})`,
      "env (MAAAW_*)",
      "cli",
    ]);
  });

  it("deep-merges nested sections instead of replacing them", () => {
    const cwd = tmp();
    const userPath = writeUserConfig(tmp(), { memory: { decayDays: 90 } });
    writeRepoConfig(cwd, { memory: { digestTokenBudget: 800 } });
    const { config } = resolveConfig({ cwd, env: {}, userConfigPath: userPath });
    expect(config.memory.decayDays).toBe(90); // from user
    expect(config.memory.digestTokenBudget).toBe(800); // from repo
    expect(config.memory.promoteHitThreshold).toBe(3); // default
  });
});

describe("config: env layer mapping", () => {
  it("maps MAAAW_MEMORY_BUDGET into the nested memory section", () => {
    const layer = envLayer({ MAAAW_MEMORY_BUDGET: "700" });
    expect(layer).toEqual({ memory: { digestTokenBudget: 700 } });
  });

  it("ignores unset and malformed values", () => {
    expect(envLayer({})).toEqual({});
    expect(envLayer({ MAAAW_MEMORY_BUDGET: "not-a-number" })).toEqual({});
  });
});

describe("config: failure behavior", () => {
  it("reports invalid JSON with the offending layer and path, and keeps working", () => {
    const cwd = tmp();
    mkdirSync(join(cwd, ".agent"), { recursive: true });
    writeFileSync(join(cwd, ".agent", "kit.json"), "{broken");
    const { config, errors } = resolveConfig({ cwd, env: {} });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.layer).toBe("repo");
    expect(errors[0]?.message).toContain("invalid JSON");
    expect(config.guardLevel).toBe("standard"); // still usable
  });

  it("falls back to defaults when the merged config is schema-invalid", () => {
    const cwd = tmp();
    writeRepoConfig(cwd, { guardLevel: "yolo" });
    const { config, errors, layers } = resolveConfig({ cwd, env: {} });
    expect(config.guardLevel).toBe("standard");
    expect(errors.some((e) => e.layer === "merged" && e.message.includes("guardLevel"))).toBe(true);
    expect(layers[0]).toContain("fallback");
  });
});

describe("config: mergeLayers", () => {
  it("replaces arrays and scalars, merges objects, skips undefined", () => {
    const merged = mergeLayers(
      { a: [1, 2], b: { x: 1, y: 2 }, c: "keep" },
      { a: [3], b: { y: 9 }, c: undefined },
    );
    expect(merged).toEqual({ a: [3], b: { x: 1, y: 9 }, c: "keep" });
  });
});
