#!/usr/bin/env node
// MaaawKit background job runner — zero dependencies.
// Detaches from the CLI, runs the agent command, tees output to the log file,
// and records the exit code so `maaaw bridge status` can reconcile later.
//
// Config via env (paths are absolute):
//   MAAAW_PROMPT_FILE  prompt piped to child stdin when MAAAW_STDIN=1
//   MAAAW_LOG_FILE     combined stdout+stderr log
//   MAAAW_EXIT_FILE    written with the numeric exit code on child exit
//   MAAAW_STDIN        "1" to pipe the prompt file to stdin
// argv: <bin> <args...>

import { spawn } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const [bin, ...args] = process.argv.slice(2);
const promptFile = process.env.MAAAW_PROMPT_FILE;
const logFile = process.env.MAAAW_LOG_FILE;
const exitFile = process.env.MAAAW_EXIT_FILE;
const useStdin = process.env.MAAAW_STDIN === "1";

if (!bin || !logFile || !exitFile) {
  process.stderr.write("job-runner: missing bin/MAAAW_LOG_FILE/MAAAW_EXIT_FILE\n");
  process.exit(2);
}

writeFileSync(logFile, "");
const child = spawn(bin, args, {
  cwd: process.cwd(),
  stdio: [useStdin ? "pipe" : "ignore", "pipe", "pipe"],
});

if (useStdin && child.stdin) {
  try {
    child.stdin.write(promptFile ? readFileSync(promptFile) : "");
  } catch {}
  child.stdin.end();
}

for (const stream of [child.stdout, child.stderr]) {
  if (!stream) continue;
  stream.on("data", (chunk) => {
    try {
      appendFileSync(logFile, chunk);
    } catch {}
  });
}

child.on("error", (err) => {
  try {
    appendFileSync(logFile, `\njob-runner: spawn error: ${err.message}\n`);
    writeFileSync(exitFile, "127");
  } catch {}
  process.exit(127);
});

child.on("exit", (code, signal) => {
  const exit = code ?? (signal ? 128 : 1);
  try {
    writeFileSync(exitFile, String(exit));
  } catch {}
  process.exit(exit);
});
