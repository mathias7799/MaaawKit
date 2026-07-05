/**
 * MCP transport entry — `maaaw mcp serve` speaks stdio; embedders can import
 * createMaaawServer and attach any transport.
 */

export { createMaaawServer, type McpServerOptions } from "./server.js";

export async function serveStdio(cwd: string): Promise<void> {
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { createMaaawServer } = await import("./server.js");
  const server = createMaaawServer({ cwd });
  await server.connect(new StdioServerTransport());
}
