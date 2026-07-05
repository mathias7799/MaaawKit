# MaaawKit universal MCP integration

`maaaw mcp serve` is the primary integration surface for any AI Development
Environment (ADE) or IDE that speaks the Model Context Protocol. Every MCP tool
wraps the same engine as the CLI and host hooks, so guard policy, worktree
isolation, memory, rules, and handoff semantics stay identical no matter which
client asked.

Use MCP when your host supports it; use generated rules files, CLI preflight,
and host-native hook adapters as complementary surfaces when the host does not.

## Current tools

| Tool | What it does |
|---|---|
| `maaaw_capabilities` | Describe server version, surfaces, client write permission, host support, and bridge adapters |
| `maaaw_project` | Summarize cwd, git state, `.agent/` paths, config layers, and MCP client permissions |
| `maaaw_doctor` | Run `maaaw doctor` and return structured health checks |
| `bridge_run` | Delegate a bounded task to another agent CLI (prepared by default; `execute: true` to run) |
| `bridge_status` | One job (reconciled) or all jobs |
| `bridge_result` | Structured result document of a job |
| `bridge_cancel` | Kill a running job's process tree |
| `rules_read` | Read the canonical rules model before it is rendered into host artifacts |
| `rules_validate` | Check installed host artifacts for drift against canonical rules |
| `rules_sync` | Re-render canonical rules into every installed tool artifact |
| `memory_digest` | Build the budgeted memory digest for IDE/ADE context injection |
| `memory_learn` | Capture a schema-valid memory record (provenance: `mcp:<client>`) |
| `memory_recall` | Keyword search over project memory (increments hit counts) |
| `memory_promote` | Promote a record into `.agent/rules.md` |
| `handoff_read` / `handoff_write` | Cross-agent handoff with relevant memory attached |
| `guard_evaluate` | Preflight a shell command or write path against the canonical guard policy |
| `guard_explain` | Return the guard decision plus IDE-friendly next-step guidance |
| `guard_rules` | List active built-in and repo-configured guard rules |

## Current resources

| Resource | What it provides |
|---|---|
| `maaaw://project/status` | Read-only project/config/client summary for IDE panels |
| `maaaw://memory/digest` | Budgeted markdown memory digest for context injection |
| `maaaw://rules/current` | Canonical rules model before host-specific rendering |

Security posture (see SECURITY.md): write-mode bridge jobs are **denied by
default**; allow-list client names in `.agent/kit.json`:

```json
{ "mcp": { "writeModeClients": ["cursor", "codex-cli"] } }
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

## ADE/IDE capability matrix

| Environment | MCP | Rules artifacts | Memory | Safety events | Bridge | Notes |
|---|---:|---:|---:|---:|---:|---|
| Claude Code | ✅ | ✅ | ✅ | ✅ native hook shims | ✅ | Also has native slash-command/plugin packaging. |
| Codex CLI | ✅ | ✅ | ✅ | via MCP/CLI preflight | ✅ | Use MCP for memory/rules/handoff; bridge can delegate back to Codex. |
| Cursor | ✅ | ✅ | ✅ | via MCP/CLI preflight | ✅ | Use repo-local `.cursor/mcp.json` when sharing team setup. |
| VS Code / Copilot | ✅ | ✅ | ✅ | via MCP/CLI preflight | ✅ | Use `.vscode/mcp.json` where supported. |
| Gemini CLI | ✅ | ✅ | ✅ | via MCP/CLI preflight | ✅ | Uses the same stdio server command. |
| opencode | planned/CLI | ✅ | ✅ | via CLI preflight | ✅ | Bridge adapter exists; MCP registration should be verified per host version. |
| Other ADEs/IDEs | stdio MCP if supported | generated | `.agent/` | host adapter or preflight | adapter-based | Treat MCP as baseline and rules files as fallback. |

## Integration model

MaaawKit should be installed in layers, from most portable to most host-native:

1. **MCP server** — universal control plane for bridge, memory, rules, and handoff.
2. **`.agent/` state** — vendor-neutral project memory, rules, loops, and jobs.
3. **Generated host artifacts** — AGENTS.md, Claude/Cursor/Codex/Gemini rules, or other managed files.
4. **Host hooks/adapters** — real-time guardrails where the host exposes events.
5. **Bridge adapters** — bounded work delegated to other agent CLIs, with write modes isolated in git worktrees.

## The bidirectional demo

Orchestration stops being one-way once the server is registered in a second
agent. From a Codex session connected to `maaaw`:

1. `memory_recall("database migrations")` — Codex starts with the project's shared lessons.
2. `bridge_run({ agent: "claude", mode: "review-only", task: "Review my diff for authz bugs", execute: true })`
   — Codex drives Claude as a bounded worker.
3. `handoff_write({ goal: ..., status: ..., toAgent: "claude" })` — the return
   handoff carries the top path-relevant memory ids.

The same flow is covered by automated tests against an in-memory transport
(`tests/mcp.test.ts`), including the write-mode denial and per-client opt-in.

## Planned MCP upgrades

MaaawKit's next MCP milestone is to make ADE/IDE integration feel native rather
than merely callable. Planned additions:

| Area | Planned tools/resources |
|---|---|
| Capability discovery | richer host feature flags and config placement hints |
| Memory | `memory_search`, `memory_update`, `memory_archive`, subscriptions/updates for digest resources |
| Rules | `rules_diff`, `rules_install_preview`, richer artifact placement metadata |
| Verification loops | `loop_start`, `loop_status`, `loop_run_once`, `loop_stop` |
| Safety | host hook adapters, preflight UX helpers, and policy resources |
| Workflows | `workflow_list`, `workflow_start`, `workflow_status` |

These should return structured data suitable for IDE panels, command palettes,
and agent planning loops.
