import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveConfig } from "../config/index.js";
import { type IdeMcpSurfaceOptions, jsonText } from "./ide-shared.js";

const TOOL_SCHEMA = z
  .enum(["Bash", "PowerShell", "Write", "Edit", "MultiEdit", "NotebookEdit"])
  .default("Bash");

type GuardToolName = z.infer<typeof TOOL_SCHEMA>;
type GuardToolArgs = {
  toolName: GuardToolName;
  command?: string | undefined;
  path?: string | undefined;
};

function guardToolInput(args: GuardToolArgs): { command: string } | { file_path: string } {
  return args.toolName === "Bash" || args.toolName === "PowerShell"
    ? { command: args.command ?? "" }
    : { file_path: args.path ?? "" };
}

export function registerIdeGuardTools(server: McpServer, opts: IdeMcpSurfaceOptions): void {
  const { cwd } = opts;

  server.registerTool(
    "guard_evaluate",
    {
      description:
        "Evaluate a proposed shell command or file write against the same guard policy used by hooks, CLI, bridge, and MCP.",
      inputSchema: {
        toolName: TOOL_SCHEMA,
        command: z.string().optional().describe("Shell command for Bash/PowerShell evaluations"),
        path: z.string().optional().describe("File path for Write/Edit/MultiEdit/NotebookEdit"),
      },
    },
    async (args) => {
      const { evaluateToolUse } = await import("../hooks/guard.js");
      const { config } = resolveConfig({ cwd });
      const toolInput = guardToolInput(args);
      const decision = evaluateToolUse(
        { toolName: args.toolName, toolInput },
        { level: config.guardLevel, customBashRules: config.guardCustomRules },
      );
      return jsonText({
        decision: decision.decision,
        reason: decision.reason,
        guardLevel: config.guardLevel,
        toolName: args.toolName,
        toolInput,
      });
    },
  );

  server.registerTool(
    "guard_explain",
    {
      description:
        "Explain a guard decision for an ADE/IDE preflight prompt, including the configured guard level and suggested next step.",
      inputSchema: {
        toolName: TOOL_SCHEMA,
        command: z.string().optional(),
        path: z.string().optional(),
      },
    },
    async (args) => {
      const { evaluateToolUse } = await import("../hooks/guard.js");
      const { config } = resolveConfig({ cwd });
      const toolInput = guardToolInput(args);
      const decision = evaluateToolUse(
        { toolName: args.toolName, toolInput },
        { level: config.guardLevel, customBashRules: config.guardCustomRules },
      );
      const guidance =
        decision.decision === "allow"
          ? "Allowed by current guard policy."
          : decision.decision === "ask"
            ? "Ask the user for explicit approval before proceeding, or choose a safer command/path."
            : "Do not proceed. Change the command/path or use a safer workflow.";
      return jsonText({
        ...decision,
        guardLevel: config.guardLevel,
        guidance,
        toolName: args.toolName,
        toolInput,
      });
    },
  );

  server.registerTool(
    "guard_rules",
    {
      description:
        "List the active built-in and repo-configured guard rules so an ADE/IDE can explain MaaawKit safety policy.",
      inputSchema: {},
    },
    async () => {
      const { BASH_RULES, PROTECTED_WRITE_RULES } = await import("../hooks/guard-rules.js");
      const { config } = resolveConfig({ cwd });
      return jsonText({
        guardLevel: config.guardLevel,
        bashRules: BASH_RULES,
        protectedWriteRules: PROTECTED_WRITE_RULES,
        customBashRules: config.guardCustomRules,
      });
    },
  );
}
