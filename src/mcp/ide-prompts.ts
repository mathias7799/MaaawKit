import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getPromptAsset, summarizePromptAssets } from "../prompts/catalog.js";
import { type IdeMcpSurfaceOptions, jsonResource, text } from "./ide-shared.js";

export function registerIdePromptTools(server: McpServer, _opts: IdeMcpSurfaceOptions): void {
  server.registerResource(
    "prompt-catalog",
    "maaaw://prompts/catalog",
    {
      title: "MaaawKit prompt asset catalog",
      description:
        "Interchangeable command, agent, skill, and reference prompts for orchestration.",
      mimeType: "application/json",
    },
    async (uri) => jsonResource(uri.href, { assets: summarizePromptAssets() }),
  );

  server.registerTool(
    "prompt_catalog",
    {
      description:
        "List interchangeable MaaawKit prompt assets an orchestrator can use for bridge jobs, handoffs, and MCP prompts.",
      inputSchema: {
        kind: z.enum(["agent", "skill", "command", "reference"]).optional(),
        language: z.string().optional(),
        tag: z.string().optional(),
      },
    },
    async (args) => {
      let assets = summarizePromptAssets();
      if (args.kind) assets = assets.filter((asset) => asset.kind === args.kind);
      if (args.language)
        assets = assets.filter((asset) => asset.languages.includes(args.language ?? ""));
      if (args.tag) assets = assets.filter((asset) => asset.tags.includes(args.tag ?? ""));
      return text(JSON.stringify({ assets }, null, 2));
    },
  );

  server.registerTool(
    "prompt_read",
    {
      description:
        "Read one prompt asset by id, including the full prompt text and routing metadata.",
      inputSchema: { id: z.string().min(1) },
    },
    async (args) => {
      const asset = getPromptAsset(args.id);
      if (!asset) {
        return {
          content: [{ type: "text" as const, text: `Unknown prompt asset: ${args.id}` }],
          isError: true,
        };
      }
      return text(JSON.stringify(asset, null, 2));
    },
  );

  server.registerPrompt(
    "maaaw_orchestrate",
    {
      title: "MaaawKit orchestration prompt",
      description:
        "Compose an orchestrator-facing prompt from a selected MaaawKit agent/skill/command/reference asset.",
      argsSchema: {
        assetId: z.string().min(1),
        task: z.string().min(1),
        targetAgent: z.string().optional(),
      },
    },
    async (args) => {
      const asset = getPromptAsset(args.assetId);
      if (!asset) {
        return {
          description: "Unknown MaaawKit prompt asset",
          messages: [
            {
              role: "user" as const,
              content: { type: "text" as const, text: `Unknown prompt asset: ${args.assetId}` },
            },
          ],
        };
      }
      return {
        description: `${asset.id} orchestration prompt`,
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                "# MaaawKit Orchestration",
                "",
                `Selected asset: ${asset.id}`,
                `Asset path: ${asset.path}`,
                `Target agent: ${args.targetAgent ?? "(orchestrator decides)"}`,
                "",
                "## Task",
                args.task.trim(),
                "",
                "## Asset Contract",
                asset.content.trim(),
                "",
                "## Orchestration Requirements",
                "- Use the selected asset as the role/workflow/reference contract.",
                "- If delegating, pass this asset id as promptAssetId on bridge_run or handoff_write.",
                "- If the asset conflicts with the explicit task, follow the explicit task and record the conflict.",
                "- Preserve provenance: include asset id/path in handoff, bridge task, or final report.",
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}
