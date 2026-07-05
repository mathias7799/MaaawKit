import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerIdeContextTools } from "./ide-context.js";
import { registerIdeDiscoveryTools } from "./ide-discovery.js";
import { registerIdeGuardTools } from "./ide-guard.js";
import { registerIdePromptTools } from "./ide-prompts.js";
import { registerIdeResources } from "./ide-resources.js";
import type { IdeMcpSurfaceOptions } from "./ide-shared.js";

/**
 * ADE/IDE-facing MCP surface: read-only resources, discovery, preflight guard,
 * and context endpoints that make MaaawKit useful outside Claude-native hooks.
 */
export function registerIdeMcpSurface(server: McpServer, opts: IdeMcpSurfaceOptions): void {
  registerIdeResources(server, opts);
  registerIdeDiscoveryTools(server, opts);
  registerIdeGuardTools(server, opts);
  registerIdeContextTools(server, opts);
  registerIdePromptTools(server, opts);
}
