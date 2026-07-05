/**
 * Hook self-test — the selftest.py replacement, run via `maaaw doctor --hooks`.
 * Exercises the hook runtime with synthetic payloads on THIS machine.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHook } from "../hooks/runtime.js";
import type { DoctorCheck } from "./index.js";

function decisionOf(stdout: string): string {
  if (!stdout) return "ALLOW";
  try {
    const d = JSON.parse(stdout) as {
      hookSpecificOutput?: { permissionDecision?: string };
      decision?: string;
    };
    if (d.hookSpecificOutput?.permissionDecision) {
      return d.hookSpecificOutput.permissionDecision.toUpperCase();
    }
    if (d.decision === "block") return "BLOCK";
  } catch {
    // non-JSON output (session-context) counts as ALLOW
  }
  return "ALLOW";
}

function bash(command: string): string {
  return JSON.stringify({ tool_name: "Bash", tool_input: { command } });
}

export async function runHooksSelftest(): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const isolated = mkdtempSync(join(tmpdir(), "maaaw-selftest-"));

  const guardCases: [string, string][] = [
    [bash("rm -rf /"), "DENY"],
    [bash("git push -f origin main"), "DENY"],
    [bash("git push --force-with-lease origin feat"), "ALLOW"],
    [bash("git reset --hard HEAD~1"), "ASK"],
    [bash("psql -c 'DROP TABLE users'"), "ASK"],
    [bash("terraform destroy -auto-approve"), "ASK"],
    [bash("git branch -d merged-branch"), "ALLOW"],
    [JSON.stringify({ tool_name: "Write", tool_input: { file_path: ".env" } }), "ASK"],
    [
      JSON.stringify({
        tool_name: "PowerShell",
        tool_input: { command: "Remove-Item -Path C:\\ -Recurse -Force" },
      }),
      "DENY",
    ],
    [
      JSON.stringify({
        tool_name: "PowerShell",
        tool_input: { command: "Get-ChildItem -Recurse" },
      }),
      "ALLOW",
    ],
  ];

  try {
    for (const [payload, expect] of guardCases) {
      // Run in an isolated cwd so this repo's kit.json can't change levels.
      const { stdout } = await runHook("guard", payload, { cwd: isolated });
      const got = decisionOf(stdout);
      const parsed = JSON.parse(payload) as { tool_input: Record<string, string> };
      const label = parsed.tool_input["command"] ?? parsed.tool_input["file_path"] ?? "";
      checks.push({
        name: `guard: ${expect} <- ${label}`,
        status: got === expect ? "ok" : "fail",
        detail: got === expect ? "" : `got ${got}`,
      });
    }

    // stop-verify: refuses untrusted loop files without running the oracle
    const agentDir = join(isolated, ".agent");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, "loop.json"),
      JSON.stringify({ oracle: "exit 1", max_iterations: 3, iteration: 0 }),
    );
    const refusal = await runHook("stop-verify", JSON.stringify({ cwd: isolated }));
    checks.push({
      name: "stop-verify: refuses untrusted loop file",
      status:
        refusal.stdout.includes("refused") && !refusal.stdout.includes('"decision"')
          ? "ok"
          : "fail",
      detail: refusal.stdout.slice(0, 120),
    });

    rmSync(join(agentDir, "loop.json"), { force: true });
    const noop = await runHook("stop-verify", JSON.stringify({ cwd: isolated }));
    checks.push({
      name: "stop-verify: no-op without state file",
      status: noop.stdout === "" ? "ok" : "fail",
      detail: noop.stdout.slice(0, 120),
    });

    // post-edit: unknown file types are ignored
    const postEdit = await runHook(
      "post-edit",
      JSON.stringify({ tool_name: "Write", tool_input: { file_path: "nope.xyz" } }),
    );
    checks.push({
      name: "post-edit: ignores unknown file types",
      status: postEdit.stdout === "" ? "ok" : "fail",
      detail: postEdit.stdout.slice(0, 120),
    });

    // session-context: runs without error
    const ctx = await runHook("session-context", JSON.stringify({ cwd: process.cwd() }));
    checks.push({
      name: "session-context: runs without error",
      status: "ok",
      detail: ctx.stdout ? `${ctx.stdout.split("\n").length} line(s)` : "quiet",
    });
  } finally {
    rmSync(isolated, { recursive: true, force: true });
  }

  return checks;
}
