/**
 * Layered config resolution — one resolver used identically by CLI, MCP, and
 * hooks. Precedence (lowest to highest):
 *
 *   package defaults < user config < repo .agent/kit.json < MAAAW_* env < CLI flags
 *
 * User config lives at $XDG_CONFIG_HOME/maaaw/config.json (or the platform
 * equivalent). Every layer is a partial; the merged result is validated by
 * KitConfigSchema so a broken layer fails loudly with its origin named.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { type GuardLevel, type KitConfig, KitConfigSchema } from "../schemas/index.js";

export interface ConfigLayerError {
  layer: string;
  path?: string;
  message: string;
}

export interface ResolvedConfig {
  config: KitConfig;
  /** Which layers contributed (for doctor). */
  layers: string[];
  errors: ConfigLayerError[];
}

export interface ResolveOptions {
  cwd: string;
  env?: Record<string, string | undefined>;
  cliOverrides?: Partial<KitConfig> | undefined;
  /** Override the user-config path (tests). */
  userConfigPath?: string | undefined;
}

export function userConfigPath(env: Record<string, string | undefined>): string {
  const xdg = env["XDG_CONFIG_HOME"];
  if (xdg) return join(xdg, "maaaw", "config.json");
  if (process.platform === "win32" && env["APPDATA"]) {
    return join(env["APPDATA"], "maaaw", "config.json");
  }
  return join(homedir(), ".config", "maaaw", "config.json");
}

export function repoConfigPath(cwd: string): string {
  return join(cwd, ".agent", "kit.json");
}

function readJsonLayer(
  path: string,
  layer: string,
  errors: ConfigLayerError[],
): Record<string, unknown> | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    return null; // absent layer is fine
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      errors.push({ layer, path, message: "config must be a JSON object" });
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    errors.push({ layer, path, message: `invalid JSON: ${(e as Error).message}` });
    return null;
  }
}

/** MAAAW_* environment overrides for scalar settings. */
export function envLayer(env: Record<string, string | undefined>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (env["MAAAW_GUARD_LEVEL"]) out["guardLevel"] = env["MAAAW_GUARD_LEVEL"] as GuardLevel;
  if (env["MAAAW_ORACLE"]) out["oracle"] = env["MAAAW_ORACLE"];
  if (env["MAAAW_DOCS_DIR"]) out["docsDir"] = env["MAAAW_DOCS_DIR"];
  if (env["MAAAW_MEMORY_BUDGET"]) {
    const n = Number(env["MAAAW_MEMORY_BUDGET"]);
    if (Number.isFinite(n) && n > 0) out["memory"] = { digestTokenBudget: n };
  }
  return out;
}

/** Deep-merge plain objects; arrays and scalars replace. */
export function mergeLayers(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (value === undefined) continue;
    const existing = out[key];
    if (
      typeof existing === "object" &&
      existing !== null &&
      !Array.isArray(existing) &&
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      out[key] = mergeLayers(existing as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function resolveConfig(options: ResolveOptions): ResolvedConfig {
  const env = options.env ?? process.env;
  const errors: ConfigLayerError[] = [];
  const layers: string[] = ["defaults"];

  let merged: Record<string, unknown> = {};

  const userPath = options.userConfigPath ?? userConfigPath(env);
  const user = readJsonLayer(userPath, "user", errors);
  if (user) {
    merged = mergeLayers(merged, user);
    layers.push(`user (${userPath})`);
  }

  const repoPath = repoConfigPath(options.cwd);
  const repo = readJsonLayer(repoPath, "repo", errors);
  if (repo) {
    merged = mergeLayers(merged, repo);
    layers.push(`repo (${repoPath})`);
  }

  const fromEnv = envLayer(env);
  if (Object.keys(fromEnv).length > 0) {
    merged = mergeLayers(merged, fromEnv);
    layers.push("env (MAAAW_*)");
  }

  if (options.cliOverrides && Object.keys(options.cliOverrides).length > 0) {
    merged = mergeLayers(merged, options.cliOverrides as Record<string, unknown>);
    layers.push("cli");
  }

  const parsed = KitConfigSchema.safeParse(merged);
  if (parsed.success) {
    return { config: parsed.data, layers, errors };
  }
  errors.push({
    layer: "merged",
    message: parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; "),
  });
  // Fall back to pure defaults so hooks never break the session on bad config.
  return {
    config: KitConfigSchema.parse({}),
    layers: ["defaults (fallback: invalid config)"],
    errors,
  };
}
