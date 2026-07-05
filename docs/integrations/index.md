# MaaawKit ADE/IDE integrations

MaaawKit is designed as a portable agent operating layer, not a single-host
plugin. Start with the MCP server everywhere, then add host-native rules,
commands, hooks, or bridge adapters where the host supports them.

## Integration layers

1. **MCP** — `npx -y maaawkit mcp serve` exposes memory, rules, bridge, and
   handoff through one universal protocol.
2. **`.agent/` state** — repo-local memory, rules, loop state, handoff files,
   and bridge jobs shared by every agent.
3. **Generated rules artifacts** — MaaawKit renders canonical rules into the
   files each tool can read.
4. **Host events/hooks** — safety hooks run natively where a host exposes tool
   events; otherwise use MCP/CLI preflight.
5. **Bridge adapters** — external agent CLIs can run bounded review or
   implementation jobs, with write modes isolated in git worktrees.

## Host support

| Host | Recommended setup | Native extras | Current status |
|---|---|---|---|
| Claude Code | MCP + Claude plugin | hooks, slash commands, agents | supported |
| Codex CLI | MCP + generated rules | bridge adapter | supported; real CLI smoke still release-gated |
| Cursor | MCP + generated rules | IDE MCP panel/commands | supported via MCP config |
| VS Code / Copilot | MCP + generated rules | IDE MCP config | supported via MCP config |
| Gemini CLI | MCP + generated rules | bridge adapter | supported via MCP config |
| opencode | CLI/generated rules | bridge adapter | partial; MCP registration needs host verification |
| Other ADEs/IDEs | MCP if available, otherwise CLI/rules | host-specific adapters | planned |

## Universal server command

Run from the repository root:

```bash
npx -y maaawkit mcp serve
```

For global installs:

```bash
maaaw mcp serve
```

## Project initialization

```bash
npx -y maaawkit init
npx -y maaawkit doctor
```

`init` creates the vendor-neutral `.agent/` state tree. `doctor` validates the
state, config, generated rules, memory, hooks when present, and bridge adapter
availability.

## Safety posture

MaaawKit is deny-by-default for dangerous MCP write modes. Add trusted client
names explicitly in `.agent/kit.json` only after deciding which IDE/ADE should
be able to launch write-mode bridge jobs:

```json
{ "mcp": { "writeModeClients": ["cursor", "codex-cli"] } }
```

Read-only review, memory recall, rules inspection, and handoff flows remain
available without granting write-mode bridge access.
