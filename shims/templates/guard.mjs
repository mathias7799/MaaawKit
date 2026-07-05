#!/usr/bin/env node
// MaaawKit PreToolUse guard shim — zero dependencies, graceful enhancement.
// With the maaawkit engine installed: config-aware guard (levels, custom rules).
// Without it: embedded fallback compiled from the same rule table (2.6 behavior).
// Contract: JSON decision on stdout, exit 0 always (never break the session).

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

const raw = await readStdin();

try {
  const { runHook } = await import("maaawkit/hooks");
  const { stdout } = await runHook("guard", raw);
  if (stdout) process.stdout.write(stdout);
  process.exit(0);
} catch {
  // Engine not installed — embedded fallback below.
}

/*__MAAAW_FALLBACK_DATA__*/

function emit(decision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

let data = {};
try {
  data = JSON.parse(raw) || {};
} catch {
  process.exit(0);
}
const tool = data.tool_name || "";
const toolInput = data.tool_input || {};

if (tool === "Bash" || tool === "PowerShell") {
  const cmd = typeof toolInput.command === "string" ? toolInput.command : "";
  const textish = new RegExp(FALLBACK.textish).test(cmd);
  for (const rule of FALLBACK.bashRules) {
    if (textish && rule.sql) continue;
    if (new RegExp(rule.pattern, rule.flags).test(cmd)) emit(rule.action, rule.message);
  }
} else if (tool === "Edit" || tool === "Write" || tool === "MultiEdit") {
  const path = toolInput.file_path || toolInput.path || "";
  for (const rule of FALLBACK.writeRules) {
    if (new RegExp(rule.pattern, rule.flags).test(path)) emit("ask", rule.message);
  }
}
process.exit(0);
