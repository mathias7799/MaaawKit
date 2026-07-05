# MaaawKit MCP server

`maaaw mcp serve` exposes the engine over the Model Context Protocol (stdio).
Every tool wraps the same core as the CLI and hooks, so guard policy and
worktree isolation are identical no matter which transport asked.

## Tools

| Tool | What it does |
|---|---|
| `bridge_run` | Delegate a bounded task to another agent CLI (prepared by default; `execute: true` to run) |
| `bridge_status` | One job (reconciled) or all jobs |
| `bridge_result` | Structured result document of a job |
| `bridge_cancel` | Kill a running job's process tree |
| `rules_sync` | Re-render canonical rules into every installed tool artifact |
| `memory_learn` | Capture a schema-valid memory record (provenance: `mcp:<client>`) |
| `memory_recall` | Keyword search over project memory (increments hit counts) |
| `memory_promote` | Promote a record into `.agent/rules.md` |
| `handoff_read` / `handoff_write` | Cross-agent handoff with relevant memory attached |

Security posture (see SECURITY.md): write-mode bridge jobs are **denied by
default**; allow-list client names in `.agent/kit.json`:

```json
{ "mcp": { "writeModeClients": ["claude-code"] } }
```

## Registration

The server command is the same everywhere: `npx -y maaawkit mcp serve` (or
`maaaw mcp serve` when installed globally), run from the repo root.

**Claude Code**

```bash
claude mcp add maaaw -- npx -y maaawkit mcp serve
```

**Codex CLI** (`~/.codex/config.toml`)

```toml
[mcp_servers.maaaw]
command = "npx"
args = ["-y", "maaawkit", "mcp", "serve"]
```

**Cursor** (`.cursor/mcp.json`)

```json
{ "mcpServers": { "maaaw": { "command": "npx", "args": ["-y", "maaawkit", "mcp", "serve"] } } }
```

**Copilot / VS Code** (`.vscode/mcp.json`)

```json
{ "servers": { "maaaw": { "command": "npx", "args": ["-y", "maaawkit", "mcp", "serve"] } } }
```

**Gemini CLI** (`~/.gemini/settings.json`)

```json
{ "mcpServers": { "maaaw": { "command": "npx", "args": ["-y", "maaawkit", "mcp", "serve"] } } }
```

## The bidirectional demo

Orchestration stops being one-way once the server is registered in a second
agent. From a Codex session connected to `maaaw`:

1. `memory_recall("database migrations")` — Codex starts with Claude's lessons.
2. `bridge_run({ agent: "claude", mode: "review-only", task: "Review my diff for authz bugs", execute: true })`
   — Codex drives Claude as a bounded worker.
3. `handoff_write({ goal: ..., status: ..., toAgent: "claude" })` — the return
   handoff carries the top path-relevant memory ids.

The same flow is covered by automated tests against an in-memory transport
(`tests/mcp.test.ts`), including the write-mode denial and per-client opt-in.
