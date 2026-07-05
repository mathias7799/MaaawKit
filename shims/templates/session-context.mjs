#!/usr/bin/env node
// MaaawKit SessionStart shim — zero dependencies, graceful enhancement.
// With the engine: git state, loop status, handoff pointer, memory digest.
// Without it: a minimal git one-liner so sessions never start fully blind.

import { spawnSync } from "node:child_process";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

const raw = await readStdin();

try {
  const { runHook } = await import("maaawkit/hooks");
  const { stdout } = await runHook("session-context", raw);
  if (stdout) process.stdout.write(stdout);
  process.exit(0);
} catch {
  // Engine not installed — minimal fallback below.
}

let data = {};
try {
  data = JSON.parse(raw) || {};
} catch {}
const cwd = data.cwd || process.cwd();

function git(args) {
  try {
    const r = spawnSync("git", args, { cwd, timeout: 10000, encoding: "utf-8" });
    return r.status === 0 ? (r.stdout || "").trim() : "";
  } catch {
    return "";
  }
}

if (git(["rev-parse", "--is-inside-work-tree"]) === "true") {
  const branch = git(["branch", "--show-current"]) || "(detached)";
  const dirty = git(["status", "--porcelain"]).split("\n").filter(Boolean).length;
  process.stdout.write(
    `[session-context]\nbranch: ${branch} | uncommitted changes: ${dirty} file(s)\n(install the maaawkit engine for memory digest, loop status, and handoff context)`,
  );
}
process.exit(0);
