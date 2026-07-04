#!/usr/bin/env node
/**
 * maaaw — the MaaawKit CLI. Thin wrappers over engine functions; every verb
 * here has an MCP or hook counterpart calling the same core.
 */

import { defineCommand, runMain } from "citty";
import pc from "picocolors";
import { VERSION } from "../version.js";

const validate = defineCommand({
  meta: {
    name: "validate",
    description: "Validate repo structure: plugin JSON, frontmatter, fences, count drift",
  },
  args: {
    root: { type: "string", description: "Repo root", default: "." },
    "max-skill-lines": {
      type: "string",
      description: "Enforce SKILL.md body line budget (Phase 6 rule)",
    },
  },
  async run({ args }) {
    const { validateRepo } = await import("../validate/index.js");
    const { resolve } = await import("node:path");
    const maxSkillLines = args["max-skill-lines"] ? Number(args["max-skill-lines"]) : undefined;
    const result = validateRepo({ root: resolve(args.root), maxSkillLines });
    for (const e of result.errors) console.log(`${pc.red("FAIL:")} ${e}`);
    console.log(
      result.errors.length
        ? pc.red(`${result.errors.length} problem(s)`)
        : pc.green("validation clean"),
    );
    if (result.errors.length > 0) process.exit(1);
  },
});

const main = defineCommand({
  meta: {
    name: "maaaw",
    version: VERSION,
    description:
      "MaaawKit engine: cross-agent bridge, project memory, canonical rules, safety hooks",
  },
  subCommands: {
    validate,
  },
});

runMain(main);
