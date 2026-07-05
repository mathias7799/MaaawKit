import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveConfig } from "../config/index.js";
import { type IdeMcpSurfaceOptions, jsonResource } from "./ide-shared.js";

export function registerIdeResources(server: McpServer, opts: IdeMcpSurfaceOptions): void {
  const { cwd, clientName, writeModeAllowed } = opts;

  server.registerResource(
    "project-status",
    "maaaw://project/status",
    {
      title: "MaaawKit project status",
      description: "Read-only project, config, and client permission summary for IDE panels.",
      mimeType: "application/json",
    },
    async (uri) => {
      const { existsSync } = await import("node:fs");
      const { agentPaths } = await import("../state/index.js");
      const paths = agentPaths(cwd);
      const resolved = resolveConfig({ cwd });
      return jsonResource(uri.href, {
        cwd,
        client: { name: clientName(), writeModeAllowed: writeModeAllowed() },
        state: { initialized: existsSync(paths.root), root: paths.root },
        config: {
          layers: resolved.layers,
          errors: resolved.errors,
          guardLevel: resolved.config.guardLevel,
          mcpWriteModeClients: resolved.config.mcp.writeModeClients,
        },
      });
    },
  );

  server.registerResource(
    "memory-digest",
    "maaaw://memory/digest",
    {
      title: "MaaawKit memory digest",
      description: "Budgeted project memory digest for agent context injection.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      const { buildDigest } = await import("../memory/retrieval.js");
      const digest = buildDigest(cwd);
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: digest.content }] };
    },
  );

  server.registerResource(
    "rules-current",
    "maaaw://rules/current",
    {
      title: "MaaawKit canonical rules",
      description: "Canonical rules model rendered into host-native instruction artifacts.",
      mimeType: "application/json",
    },
    async (uri) => {
      const { buildCanonicalRules } = await import("../rules/index.js");
      return jsonResource(uri.href, buildCanonicalRules(cwd));
    },
  );
}
