import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

export type PromptAssetKind = "agent" | "skill" | "command" | "reference";

export interface PromptAsset {
  id: string;
  kind: PromptAssetKind;
  plugin: string;
  name: string;
  path: string;
  title: string;
  description: string;
  tags: string[];
  languages: string[];
  content: string;
}

const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);
const LANGUAGE_HINTS = ["dotnet", "csharp", "typescript", "powershell", "python", "mcp"];

function packageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function pluginsRoot(): string {
  return join(packageRoot(), "plugins");
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

function assetKind(relPath: string): PromptAssetKind | null {
  if (/\/agents\/[^/]+\.md$/.test(relPath)) return "agent";
  if (/\/commands\/[^/]+\.md$/.test(relPath)) return "command";
  if (/\/skills\/[^/]+\/SKILL\.md$/.test(relPath)) return "skill";
  if (/\/skills\/[^/]+\/references\/[^/]+\.md$/.test(relPath)) return "reference";
  return null;
}

function pluginName(relPath: string): string {
  return relPath.split("/")[0] ?? "unknown";
}

function baseName(relPath: string, kind: PromptAssetKind): string {
  const parts = relPath.split("/");
  if (kind === "skill") return parts.at(-2) ?? "unknown";
  return (parts.at(-1) ?? "unknown").replace(/\.md$/, "");
}

function assetId(plugin: string, kind: PromptAssetKind, name: string): string {
  return `${plugin}.${kind}.${name}`.replaceAll("/", ".");
}

function inferTags(text: string, relPath: string, fm: Record<string, unknown>): string[] {
  const raw = `${relPath}\n${String(fm["description"] ?? "")}\n${text}`.toLowerCase();
  const tags = new Set<string>();
  for (const hint of [
    "audit",
    "review",
    "bridge",
    "handoff",
    "memory",
    "rules",
    "testing",
    "security",
    "architecture",
    "performance",
    "orchestration",
    "mcp",
    "template",
    "nuget",
    "cpm",
  ]) {
    if (raw.includes(hint)) tags.add(hint);
  }
  return [...tags].sort();
}

function inferLanguages(text: string, relPath: string): string[] {
  const raw = `${relPath}\n${text}`.toLowerCase();
  return LANGUAGE_HINTS.filter((hint) => raw.includes(hint));
}

export function listPromptAssets(): PromptAsset[] {
  const root = pluginsRoot();
  return walk(root)
    .map((path) => {
      const relPath = relative(root, path).replaceAll("\\", "/");
      const kind = assetKind(relPath);
      if (!kind) return null;
      const raw = readFileSync(path, "utf-8");
      const parsed = matter(raw);
      const fm = parsed.data as Record<string, unknown>;
      const plugin = pluginName(relPath);
      const name = typeof fm["name"] === "string" ? fm["name"] : baseName(relPath, kind);
      const description =
        typeof fm["description"] === "string" ? fm["description"] : `${kind} prompt asset`;
      return {
        id: assetId(plugin, kind, name),
        kind,
        plugin,
        name,
        path: `plugins/${relPath}`,
        title: name,
        description,
        tags: inferTags(raw, relPath, fm),
        languages: inferLanguages(raw, relPath),
        content: raw,
      };
    })
    .filter((asset): asset is PromptAsset => asset !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function getPromptAsset(id: string): PromptAsset | null {
  return listPromptAssets().find((asset) => asset.id === id) ?? null;
}

export function summarizePromptAssets() {
  return listPromptAssets().map(({ content: _content, ...asset }) => asset);
}
