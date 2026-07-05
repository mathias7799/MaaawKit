import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveConfig } from "../config/index.js";
import { INTEGRATIONS } from "../integrations/catalog.js";
import { VERSION } from "../version.js";
import { type IdeMcpSurfaceOptions, jsonText } from "./ide-shared.js";

export function registerIdeDiscoveryTools(server: McpServer, opts: IdeMcpSurfaceOptions): void {
  const { cwd, clientName, writeModeAllowed } = opts;

  server.registerTool(
    "maaaw_capabilities",
    {
      description:
        "Describe this MaaawKit server, host-facing capabilities, client write-mode permission, and supported ADE/IDE surfaces.",
      inputSchema: {},
    },
    async () => {
      const { config } = resolveConfig({ cwd });
      const { detectAdapters } = await import("../bridge/adapters.js");
      const adapters = (await detectAdapters(cwd)).map((a) => ({
        id: a.id,
        available: a.available,
        verifiedAgainst: a.verifiedAgainst,
      }));
      return jsonText({
        name: "maaawkit",
        version: VERSION,
        cwd,
        client: {
          name: clientName(),
          writeModeAllowed: writeModeAllowed(),
        },
        guard: {
          level: config.guardLevel,
          customRules: config.guardCustomRules.length,
        },
        surfaces: {
          mcp: true,
          cli: true,
          hooks: ["guard", "post-edit", "stop-verify", "session-context"],
          bridge: true,
          memory: true,
          rules: true,
          handoff: true,
        },
        environments: INTEGRATIONS,
        adapters,
      });
    },
  );

  server.registerTool(
    "maaaw_project",
    {
      description:
        "Summarize the current project state for ADE/IDE panels: git, .agent paths, config layers, and MCP client permissions.",
      inputSchema: {},
    },
    async () => {
      const { existsSync } = await import("node:fs");
      const { execa } = await import("execa");
      const { agentPaths } = await import("../state/index.js");
      const paths = agentPaths(cwd);
      const resolved = resolveConfig({ cwd });
      const git: { insideWorkTree: boolean; branch?: string; dirty?: boolean; error?: string } = {
        insideWorkTree: false,
      };
      try {
        await execa("git", ["rev-parse", "--is-inside-work-tree"], { cwd, timeout: 10_000 });
        git.insideWorkTree = true;
        git.branch = (
          await execa("git", ["branch", "--show-current"], { cwd, timeout: 10_000 })
        ).stdout.trim();
        git.dirty =
          (await execa("git", ["status", "--porcelain"], { cwd, timeout: 10_000 })).stdout.trim()
            .length > 0;
      } catch (e) {
        git.error = (e as Error).message;
      }
      return jsonText({
        cwd,
        git,
        state: {
          initialized: existsSync(paths.root),
          root: paths.root,
          kitConfig: paths.kitConfig,
          rulesFile: paths.rulesFile,
          memoryDir: paths.memoryDir,
          handoffDir: paths.handoffDir,
          bridgeDir: paths.bridgeDir,
        },
        config: {
          layers: resolved.layers,
          errors: resolved.errors,
          guardLevel: resolved.config.guardLevel,
          oracle: resolved.config.oracle,
          mcpWriteModeClients: resolved.config.mcp.writeModeClients,
        },
        client: {
          name: clientName(),
          writeModeAllowed: writeModeAllowed(),
        },
      });
    },
  );

  server.registerTool(
    "maaaw_doctor",
    {
      description: "Run maaaw doctor and return structured health checks for ADE/IDE surfaces.",
      inputSchema: {},
    },
    async () => {
      const { runDoctor } = await import("../doctor/index.js");
      return jsonText(await runDoctor(cwd));
    },
  );
}
