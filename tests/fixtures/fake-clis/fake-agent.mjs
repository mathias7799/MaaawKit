#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
/**
 * Fake agent CLI for integration tests — the codex-plugin-cc pattern.
 * Mimics the exec surface of a vendor agent CLI enough for bridge tests:
 *
 *   fake-agent.mjs exec [--sandbox MODE] [-o OUTPUT] [--fail] [--sleep MS]
 *                       [--touch FILE] -
 *
 * Reads the prompt from stdin, then:
 *   --sleep MS   waits (lets tests cancel mid-run)
 *   --touch F    writes a file in cwd (proves/denies write isolation)
 *   --fail       exits 1 after writing output
 *   -o OUTPUT    writes a structured Worker Result markdown to OUTPUT
 *
 * Env knobs (set by tests): FAKE_AGENT_STATUS=success|partial|failed
 */
import { setTimeout as sleep } from "node:timers/promises";

const args = process.argv.slice(2);
if (args[0] !== "exec") {
  console.error(`fake-agent: unknown subcommand ${args[0] ?? "(none)"}`);
  process.exit(2);
}

function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

const output = argValue("-o");
const sandbox = argValue("--sandbox") ?? "read-only";
const sleepMs = Number(argValue("--sleep") ?? 0);
const touch = argValue("--touch");
const fail = args.includes("--fail");
const status = process.env.FAKE_AGENT_STATUS ?? "success";

let prompt = "";
try {
  prompt = readFileSync(0, "utf-8");
} catch {
  // no stdin — fine
}

if (sleepMs > 0) await sleep(sleepMs);

if (touch) {
  writeFileSync(touch, `touched by fake-agent (sandbox=${sandbox})\n`);
}

const result = `# Worker Result

## Status
${status}

## Summary
- Fake agent executed with sandbox=${sandbox}.
- Prompt length: ${prompt.length} chars.

## Assumptions
None

## Changed files
${touch ?? "None"}

## Verification run
not-run (fake agent)

## Findings or implementation notes
This is a fixture result for MaaawKit integration tests.

## Needs review
Nothing.
`;

if (output) writeFileSync(output, result);
else process.stdout.write(result);

process.exit(fail ? 1 : 0);
