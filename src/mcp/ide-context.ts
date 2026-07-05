import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type IdeMcpSurfaceOptions, jsonText } from "./ide-shared.js";

export function registerIdeContextTools(server: McpServer, opts: IdeMcpSurfaceOptions): void {
  const { cwd } = opts;

  server.registerTool(
    "rules_read",
    {
      description:
        "Read the canonical rules model that MaaawKit renders into host-native instruction artifacts.",
      inputSchema: {},
    },
    async () => {
      const { buildCanonicalRules } = await import("../rules/index.js");
      return jsonText(buildCanonicalRules(cwd));
    },
  );

  server.registerTool(
    "rules_validate",
    {
      description:
        "Check generated host instruction artifacts for drift against the current canonical rules render.",
      inputSchema: {},
    },
    async () => {
      const { rulesDrift } = await import("../convert/convert.js");
      const drift = rulesDrift(cwd);
      const stale = drift.filter((d) => d.state !== "in-sync");
      return jsonText({
        ok: stale.length === 0,
        drift,
        stale,
      });
    },
  );

  server.registerTool(
    "memory_digest",
    {
      description:
        "Build and return the budgeted project memory digest that IDEs/ADEs can inject into agent context.",
      inputSchema: {
        tokenBudget: z.number().int().positive().max(20_000).optional(),
        changedFiles: z.array(z.string()).default([]),
      },
    },
    async (args) => {
      const { buildDigest } = await import("../memory/retrieval.js");
      const digest = buildDigest(cwd, {
        changedFiles: args.changedFiles,
        ...(args.tokenBudget === undefined ? {} : { tokenBudget: args.tokenBudget }),
      });
      return jsonText(digest);
    },
  );
}
