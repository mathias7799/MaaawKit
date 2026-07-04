/**
 * Porting spec: tools/validate.py → src/validate — plus the pm-skills
 * upgrades (real frontmatter parsing, command→skill cross-references).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateRepo } from "../src/validate/index.js";

let dirs: string[] = [];

function scaffold(): string {
  const root = mkdtempSync(join(tmpdir(), "maaaw-validate-"));
  dirs.push(root);
  return root;
}

function write(root: string, rel: string, content: string): void {
  const p = join(root, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, content);
}

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

const goodSkill = `---
name: my-skill
description: does things
---
# My skill
body
`;

describe("validate: skills", () => {
  it("passes a well-formed skill", () => {
    const root = scaffold();
    write(root, "plugins/maaaw-kit/skills/my-skill/SKILL.md", goodSkill);
    expect(validateRepo({ root }).errors).toEqual([]);
  });

  it("flags missing frontmatter, missing fields, and name/dir mismatch", () => {
    const root = scaffold();
    write(root, "plugins/maaaw-kit/skills/a/SKILL.md", "# no frontmatter\n");
    write(root, "plugins/maaaw-kit/skills/b/SKILL.md", "---\nname: b\n---\nbody\n");
    write(
      root,
      "plugins/maaaw-kit/skills/c/SKILL.md",
      "---\nname: wrong\ndescription: d\n---\nx\n",
    );
    const { errors } = validateRepo({ root });
    expect(errors.some((e) => e.includes("missing frontmatter") && e.includes("skills/a"))).toBe(
      true,
    );
    expect(errors.some((e) => e.includes("name+description") && e.includes("skills/b"))).toBe(true);
    expect(
      errors.some((e) => e.includes("skill name != directory") && e.includes("skills/c")),
    ).toBe(true);
  });

  it("enforces the line budget when configured (Phase 6 rule)", () => {
    const root = scaffold();
    const longBody = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n");
    write(
      root,
      "plugins/maaaw-kit/skills/long-skill/SKILL.md",
      `---\nname: long-skill\ndescription: d\n---\n${longBody}\n`,
    );
    expect(validateRepo({ root }).errors).toEqual([]);
    const { errors } = validateRepo({ root, maxSkillLines: 80 });
    expect(errors.some((e) => e.includes("over budget"))).toBe(true);
  });
});

describe("validate: structure and hygiene", () => {
  it("flags invalid plugin JSON", () => {
    const root = scaffold();
    write(root, "plugins/maaaw-kit/.claude-plugin/plugin.json", "{not json");
    const { errors } = validateRepo({ root });
    expect(errors.some((e) => e.includes("invalid JSON"))).toBe(true);
  });

  it("flags unbalanced code fences", () => {
    const root = scaffold();
    write(root, "plugins/maaaw-kit/commands/x.md", "---\nname: x\n---\n```bash\nunclosed\n");
    const { errors } = validateRepo({ root });
    expect(errors.some((e) => e.includes("unbalanced code fences"))).toBe(true);
  });

  it("flags ${CLAUDE_PLUGIN_ROOT} in command markdown", () => {
    const root = scaffold();
    write(
      root,
      "plugins/maaaw-kit/commands/x.md",
      "---\nname: x\n---\nrun ${CLAUDE_PLUGIN_ROOT}/x\n",
    );
    const { errors } = validateRepo({ root });
    expect(errors.some((e) => e.includes("CLAUDE_PLUGIN_ROOT"))).toBe(true);
  });

  it("flags count drift between README claims and reality", () => {
    const root = scaffold();
    write(root, "plugins/maaaw-kit/skills/my-skill/SKILL.md", goodSkill);
    write(root, "README.md", "This kit has 12 skills and 3 agents.\n");
    const { errors } = validateRepo({ root });
    expect(errors.some((e) => e.includes("count drift") && e.includes("12 skills"))).toBe(true);
    expect(errors.some((e) => e.includes("count drift") && e.includes("3 agents"))).toBe(true);
  });

  it("accepts matching counts", () => {
    const root = scaffold();
    write(root, "plugins/maaaw-kit/skills/my-skill/SKILL.md", goodSkill);
    write(root, "README.md", "This kit has 1 skills.\n");
    expect(validateRepo({ root }).errors).toEqual([]);
  });
});

describe("validate: command→skill cross-references (pm-skills upgrade)", () => {
  it("flags a command referencing a nonexistent skill", () => {
    const root = scaffold();
    write(root, "plugins/maaaw-kit/skills/my-skill/SKILL.md", goodSkill);
    write(
      root,
      "plugins/maaaw-kit/commands/go.md",
      "---\nname: go\n---\nUse the missing-skill skill for depth.\n",
    );
    const { errors } = validateRepo({ root });
    expect(errors.some((e) => e.includes('unknown skill "missing-skill"'))).toBe(true);
  });

  it("accepts references to existing skills and ignores prose without hyphens", () => {
    const root = scaffold();
    write(root, "plugins/maaaw-kit/skills/my-skill/SKILL.md", goodSkill);
    write(
      root,
      "plugins/maaaw-kit/commands/go.md",
      "---\nname: go\n---\nUse the my-skill skill. This skill is good.\n",
    );
    expect(validateRepo({ root }).errors).toEqual([]);
  });
});

describe("validate: the MaaawKit repo itself", () => {
  it("is clean", () => {
    const { errors } = validateRepo({ root: join(import.meta.dirname, "..") });
    expect(errors).toEqual([]);
  });
});
