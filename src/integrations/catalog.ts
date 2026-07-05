export type IntegrationStatus = "supported" | "partial" | "planned";

export interface IntegrationCapability {
  id: string;
  label: string;
  status: IntegrationStatus;
  mcp: boolean;
  nativeHooks: boolean;
  rulesArtifacts: boolean;
  memory: boolean;
  bridge: boolean;
  setup: "mcp" | "mcp+plugin" | "cli" | "planned";
  notes: string;
}

/** Single source for the host matrix shown through MCP and documentation. */
export const INTEGRATIONS: readonly IntegrationCapability[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    status: "supported",
    mcp: true,
    nativeHooks: true,
    rulesArtifacts: true,
    memory: true,
    bridge: true,
    setup: "mcp+plugin",
    notes: "Universal MCP plus native plugin packaging for hooks, slash commands, and agents.",
  },
  {
    id: "codex-cli",
    label: "Codex CLI",
    status: "supported",
    mcp: true,
    nativeHooks: false,
    rulesArtifacts: true,
    memory: true,
    bridge: true,
    setup: "mcp",
    notes: "Use MCP for memory/rules/handoff; bridge can delegate back to Codex.",
  },
  {
    id: "cursor",
    label: "Cursor",
    status: "supported",
    mcp: true,
    nativeHooks: false,
    rulesArtifacts: true,
    memory: true,
    bridge: true,
    setup: "mcp",
    notes: "Use repo-local .cursor/mcp.json when sharing team setup.",
  },
  {
    id: "vscode-copilot",
    label: "VS Code / Copilot",
    status: "supported",
    mcp: true,
    nativeHooks: false,
    rulesArtifacts: true,
    memory: true,
    bridge: true,
    setup: "mcp",
    notes: "Use .vscode/mcp.json where supported.",
  },
  {
    id: "gemini-cli",
    label: "Gemini CLI",
    status: "supported",
    mcp: true,
    nativeHooks: false,
    rulesArtifacts: true,
    memory: true,
    bridge: true,
    setup: "mcp",
    notes: "Uses the same stdio MCP server command.",
  },
  {
    id: "opencode",
    label: "opencode",
    status: "partial",
    mcp: false,
    nativeHooks: false,
    rulesArtifacts: true,
    memory: true,
    bridge: true,
    setup: "cli",
    notes: "Bridge adapter exists; MCP registration should be verified per host version.",
  },
  {
    id: "other-ade-ide",
    label: "Other ADEs/IDEs",
    status: "planned",
    mcp: true,
    nativeHooks: false,
    rulesArtifacts: true,
    memory: true,
    bridge: true,
    setup: "planned",
    notes: "Treat stdio MCP as the baseline and generated rules files as fallback.",
  },
];
