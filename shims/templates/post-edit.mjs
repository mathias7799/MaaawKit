#!/usr/bin/env node
// MaaawKit PostToolUse shim — zero dependencies, graceful enhancement.
// With the engine: formatter/linter feedback loop (ruff/eslint/dotnet/PSSA).
// Without it: silent no-op (the fallback contract is guard + minimal stop-verify).

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

const raw = await readStdin();

try {
  const { runHook } = await import("maaawkit/hooks");
  const { stdout } = await runHook("post-edit", raw);
  if (stdout) process.stdout.write(stdout);
} catch {
  // Engine not installed — post-edit checks are engine-only.
}
process.exit(0);
