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

const doctor = defineCommand({
  meta: {
    name: "doctor",
    description: "Diagnose environment, config, and .agent/ state",
  },
  args: {
    cwd: { type: "string", description: "Repo root", default: "." },
    json: { type: "boolean", description: "Machine-readable output", default: false },
  },
  async run({ args }) {
    const { runDoctor } = await import("../doctor/index.js");
    const { resolve } = await import("node:path");
    const report = await runDoctor(resolve(args.cwd));
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      for (const c of report.checks) {
        const badge =
          c.status === "ok"
            ? pc.green(" ok ")
            : c.status === "warn"
              ? pc.yellow("warn")
              : pc.red("FAIL");
        console.log(`[${badge}] ${c.name}: ${c.detail}`);
      }
      console.log(report.healthy ? pc.green("doctor: healthy") : pc.red("doctor: problems found"));
    }
    if (!report.healthy) process.exit(1);
  },
});

const init = defineCommand({
  meta: {
    name: "init",
    description: "Initialize the .agent/ state directory and a default kit.json",
  },
  args: {
    cwd: { type: "string", description: "Repo root", default: "." },
  },
  async run({ args }) {
    const { ensureStateDirs, writeJsonFile } = await import("../state/index.js");
    const { KitConfigSchema } = await import("../schemas/index.js");
    const { existsSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const paths = ensureStateDirs(resolve(args.cwd));
    if (existsSync(paths.kitConfig)) {
      console.log(`${paths.kitConfig} already exists — left untouched`);
    } else {
      writeJsonFile(paths.kitConfig, KitConfigSchema.parse({}));
      console.log(`created ${paths.kitConfig}`);
    }
    console.log(pc.green(".agent/ initialized"));
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
    doctor,
    init,
  },
});

runMain(main);
