/**
 * Repo validation for CI and pre-commit — the tools/validate.py port with
 * pm-skills upgrades: real frontmatter parsing (gray-matter) and
 * command→skill cross-reference checks.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import matter from "gray-matter";

export interface ValidateOptions {
  root: string;
  /** Phase 6 turns this on: SKILL.md bodies must be ≤ this many lines. */
  maxSkillLines?: number | undefined;
}

export interface ValidateResult {
  errors: string[];
  counts: { skills: number; agents: number; commands: number };
}

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  "bin",
  "obj",
  ".venv",
  "venv",
  "__pycache__",
]);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function read(path: string): string {
  return readFileSync(path, "utf-8");
}

function rel(root: string, p: string): string {
  return relative(root, p).replaceAll("\\", "/");
}

export function validateRepo(options: ValidateOptions): ValidateResult {
  const { root } = options;
  const errors: string[] = [];
  const files = walk(root);
  const relFiles = files.map((f) => ({ abs: f, rel: rel(root, f) }));

  const jsonFiles = relFiles.filter(
    (f) =>
      f.rel.endsWith(".json") &&
      (f.rel.startsWith(".claude-plugin/") || f.rel.startsWith("plugins/")),
  );
  for (const f of jsonFiles) {
    try {
      JSON.parse(read(f.abs));
    } catch (e) {
      errors.push(`invalid JSON: ${f.rel}: ${(e as Error).message}`);
    }
  }

  const skillMd = relFiles.filter((f) => /^plugins\/[^/]+\/skills\/[^/]+\/SKILL\.md$/.test(f.rel));
  const refMd = relFiles.filter((f) =>
    /^plugins\/[^/]+\/skills\/[^/]+\/references\/[^/]+\.md$/.test(f.rel),
  );
  const commandMd = relFiles.filter((f) => /^plugins\/[^/]+\/commands\/[^/]+\.md$/.test(f.rel));
  const agentMd = relFiles.filter((f) => /^plugins\/[^/]+\/agents\/[^/]+\.md$/.test(f.rel));
  const rootMd = relFiles.filter((f) => /^[^/]+\.md$/.test(f.rel));

  // balanced code fences
  for (const f of [...skillMd, ...refMd, ...commandMd, ...agentMd, ...rootMd]) {
    const text = read(f.abs);
    const fences = (text.match(/```/g) ?? []).length;
    if (fences % 2 === 1) errors.push(`unbalanced code fences: ${f.rel}`);
  }

  // skill frontmatter: name+description, name matches directory, optional line budget
  const skillNames = new Set<string>();
  for (const f of skillMd) {
    const text = read(f.abs);
    let fm: Record<string, unknown>;
    try {
      const parsed = matter(text);
      if (Object.keys(parsed.data).length === 0 && !text.startsWith("---")) {
        errors.push(`missing frontmatter: ${f.rel}`);
        continue;
      }
      fm = parsed.data as Record<string, unknown>;
    } catch (e) {
      errors.push(`invalid frontmatter: ${f.rel}: ${(e as Error).message}`);
      continue;
    }
    const name = typeof fm["name"] === "string" ? fm["name"] : "";
    const description = typeof fm["description"] === "string" ? fm["description"] : "";
    if (!name || !description) {
      errors.push(`frontmatter needs name+description: ${f.rel}`);
    } else {
      skillNames.add(name);
      if (name !== basename(dirname(f.abs))) {
        errors.push(`skill name != directory: ${f.rel}`);
      }
    }
    if (options.maxSkillLines) {
      const body = matter(text).content;
      const lines = body.split("\n").filter((l) => l.trim().length > 0).length;
      if (lines > options.maxSkillLines) {
        errors.push(
          `SKILL.md over budget: ${f.rel} has ${lines} non-empty body lines ` +
            `(max ${options.maxSkillLines}; move detail to references/)`,
        );
      }
    }
  }

  // command/agent frontmatter + no ${CLAUDE_PLUGIN_ROOT} in command markdown
  for (const f of [...commandMd, ...agentMd]) {
    const text = read(f.abs);
    if (!/^---\n[\s\S]*?\n---\n/.test(text)) errors.push(`missing frontmatter: ${f.rel}`);
    else {
      try {
        matter(text);
      } catch (e) {
        errors.push(`invalid frontmatter YAML: ${f.rel}: ${(e as Error).message.split("\n")[0]}`);
      }
    }
    if (f.rel.includes("commands/") && text.includes("${CLAUDE_PLUGIN_ROOT}")) {
      errors.push(
        `\${CLAUDE_PLUGIN_ROOT} in command markdown (only expands in hooks/mcp config): ${f.rel}`,
      );
    }
  }

  // command→skill cross-references: hyphenated "<name> skill" mentions must exist
  for (const f of commandMd) {
    let text: string;
    try {
      text = matter(read(f.abs)).content;
    } catch {
      continue; // already reported above
    }
    const mentions = text.matchAll(/\b([a-z][a-z0-9]*(?:-[a-z0-9]+)+)\s+skill\b/g);
    for (const m of mentions) {
      const candidate = m[1] ?? "";
      if (!skillNames.has(candidate)) {
        errors.push(`command references unknown skill "${candidate}": ${f.rel}`);
      }
    }
  }

  // docs count drift: README/marketplace claims must match reality
  const counts = {
    skills: skillMd.filter((f) => f.rel.startsWith("plugins/maaaw-kit/")).length,
    agents: agentMd.filter((f) => f.rel.startsWith("plugins/maaaw-kit/")).length,
    commands: commandMd.filter((f) => f.rel.startsWith("plugins/maaaw-kit/")).length,
  };
  for (const doc of ["README.md", ".claude-plugin/marketplace.json"]) {
    const f = relFiles.find((x) => x.rel === doc);
    if (!f) continue;
    const txt = read(f.abs);
    for (const [n, label] of [
      [counts.skills, "skills"],
      [counts.agents, "agents"],
      [counts.commands, "commands"],
    ] as const) {
      const claims = txt.matchAll(
        new RegExp(String.raw`(\d+)\s+(?:engineering |specialist |slash )?${label}`, "g"),
      );
      for (const c of claims) {
        if (Number(c[1]) !== n) {
          errors.push(`count drift in ${doc}: claims ${c[1]} ${label}, actual ${n}`);
        }
      }
    }
  }

  // release hygiene: no placeholder repository metadata
  for (const f of relFiles) {
    if (/\.(png|jpg|jpeg|gif|ico|lock|woff2?)$/.test(f.rel) || f.rel === "package-lock.json")
      continue;
    let txt: string;
    try {
      txt = read(f.abs);
    } catch {
      continue;
    }
    if (txt.includes(`github.com/${"OWNER"}/`) || txt.includes(`<${"you"}>/`)) {
      errors.push(`placeholder repository metadata remains: ${f.rel}`);
    }
  }

  // Codex hooks template must use current event-keyed shape
  const codexHooks = relFiles.find(
    (f) => f.rel === "plugins/maaaw-kit/templates/codex/hooks.json.template",
  );
  if (codexHooks) {
    try {
      const data = JSON.parse(read(codexHooks.abs)) as { hooks?: unknown };
      const hooks = data.hooks;
      if (typeof hooks !== "object" || hooks === null || Array.isArray(hooks)) {
        errors.push("Codex hooks template must have object hooks keyed by event name");
      } else {
        for (const event of ["SessionStart", "PreToolUse", "PostToolUse", "Stop"]) {
          if (!(event in hooks)) errors.push(`Codex hooks template missing ${event}`);
        }
      }
    } catch (e) {
      errors.push(`invalid Codex hooks template: ${(e as Error).message}`);
    }
  }

  return { errors, counts };
}
