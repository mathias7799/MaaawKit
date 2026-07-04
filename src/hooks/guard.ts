/**
 * Guard engine: evaluates a tool invocation against the canonical rule table.
 * Pure — no I/O, no process. Used by the PreToolUse hook shim, the CLI, and
 * the bridge (every command/prompt the bridge builds passes through here).
 */

import {
  BASH_RULES,
  type GuardAction,
  PROTECTED_WRITE_RULES,
  TEXTISH_COMMAND,
} from "./guard-rules.js";

export type GuardLevel = "relaxed" | "standard" | "strict";

export interface GuardDecision {
  decision: GuardAction | "allow";
  reason?: string;
}

export interface GuardInput {
  toolName: string;
  toolInput: Record<string, unknown>;
}

export interface GuardOptions {
  /**
   * relaxed: "ask" rules are downgraded to allow (denies still deny).
   * standard: rules apply as written (2.6 behavior).
   * strict: "ask" rules are upgraded to deny.
   */
  level?: GuardLevel;
  /** Extra rules from .agent/kit.json, evaluated after the built-ins. */
  customBashRules?: readonly {
    pattern: string;
    flags?: string;
    message: string;
    action: GuardAction;
  }[];
}

const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);
const WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

function applyLevel(action: GuardAction, level: GuardLevel): GuardAction | "allow" {
  if (level === "relaxed" && action === "ask") return "allow";
  if (level === "strict" && action === "ask") return "deny";
  return action;
}

/** Evaluate a shell command string against the bash rule table. */
export function evaluateCommand(command: string, options: GuardOptions = {}): GuardDecision {
  const level = options.level ?? "standard";
  const textish = new RegExp(TEXTISH_COMMAND).test(command);
  const rules = [...BASH_RULES, ...(options.customBashRules ?? [])];
  for (const rule of rules) {
    if (textish && "category" in rule && rule.category === "sql") continue;
    if (new RegExp(rule.pattern, rule.flags ?? "").test(command)) {
      const effective = applyLevel(rule.action, level);
      if (effective === "allow") continue;
      return { decision: effective, reason: rule.message };
    }
  }
  return { decision: "allow" };
}

/** Evaluate a file path against the protected-write table. */
export function evaluateWritePath(filePath: string, options: GuardOptions = {}): GuardDecision {
  const level = options.level ?? "standard";
  for (const rule of PROTECTED_WRITE_RULES) {
    if (new RegExp(rule.pattern, rule.flags).test(filePath)) {
      // Protected writes are "ask" severity in 2.6; strict upgrades to deny.
      const effective = applyLevel("ask", level);
      if (effective === "allow") continue;
      return { decision: effective, reason: rule.message };
    }
  }
  return { decision: "allow" };
}

/** Full PreToolUse evaluation, matching the 2.6 hook contract. */
export function evaluateToolUse(input: GuardInput, options: GuardOptions = {}): GuardDecision {
  const { toolName, toolInput } = input;
  if (SHELL_TOOLS.has(toolName)) {
    const command = typeof toolInput["command"] === "string" ? toolInput["command"] : "";
    return evaluateCommand(command, options);
  }
  if (WRITE_TOOLS.has(toolName)) {
    const filePath =
      typeof toolInput["file_path"] === "string"
        ? toolInput["file_path"]
        : typeof toolInput["path"] === "string"
          ? toolInput["path"]
          : "";
    return evaluateWritePath(filePath, options);
  }
  return { decision: "allow" };
}

/** Serialize a decision to the Claude Code PreToolUse hook JSON contract. */
export function toGuardHookOutput(decision: GuardDecision): string | undefined {
  if (decision.decision === "allow") return undefined;
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision.decision,
      permissionDecisionReason: decision.reason,
    },
  });
}
