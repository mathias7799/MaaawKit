# MaaawKit 2.6 → 3.0: breaking changes

3.0 is a **clean break** — there is no compatibility layer. This page lists
every 2.6 surface and its 3.0 replacement. One-time manual migration is
expected to take under 15 minutes per repo.

## The shape

2.6 was a content plugin with five disconnected Python scripts. 3.0 is one
TypeScript engine (`maaawkit` on npm, `maaaw` CLI) with two content plugins
(`maaaw-kit` core, `maaaw-bridge` orchestration) on one marketplace.

## Removed → replaced

| 2.6 | 3.0 | Notes |
|---|---|---|
| `hooks/*.py` (guard, post-edit-check, stop-verify, session-context) | `hooks/*.mjs` zero-dep shims | Work with zero installs; full behavior when `maaawkit` is installed. Python is gone. |
| `hooks/selftest.py` | `maaaw doctor --hooks` | Same checks, engine-run |
| `scripts/codex-worker.py`, `/codex-worker` | `maaaw bridge run …`, `/bridge` | Any adapter, not just Codex; same prepared-by-default posture |
| `scripts/to-codex.py`, `/to-codex` | `maaaw rules sync` / `maaaw install`, `/rules-sync` | Six tool formats from one canonical source |
| `tools/validate.py` | `maaaw validate` | Stricter: real YAML parsing, cross-refs, budgets, contracts |
| skill `codex-worker` | skill `agent-bridge` (maaaw-bridge plugin) | |
| skill `codex-handoff` | skill `agent-handoff` (maaaw-bridge plugin) | |
| skill `quick-audit` | `codebase-audit` depth=quick (`references/quick-pass.md`) | `/quick-audit` command remains |
| skill `workflow-orchestration` | merged into `orchestration` | |
| `.claude/loop.json` / `.codex/loop.json` | `.agent/loop.json` (only location) | Same trust gate: `trusted: true` AND untracked |
| `.claude/memory/*.md` prose files | `.agent/memory/records/*.md` schema-valid records | **No importer ships.** Re-capture the entries that still matter via `/learn` or `maaaw memory add` — treat it as the curation pass your memory needed anyway |
| `HANDOFF.md` at repo root | `.agent/handoff/HANDOFF.md` + `handoff.json` | Written by `maaaw handoff write` |
| `.codex/` state (tasks/results) | `.agent/bridge/` (jobs/logs/results) | |
| power-kit legacy markers | not recognized | Only `maaaw-kit:start/end` markers are managed |

## Upgrade steps

1. Update the marketplace and install both plugins (`maaaw-kit`, and
   `maaaw-bridge` if you delegate to other agents).
2. `npm install -g maaawkit` (or rely on `npx -y maaawkit`), then `maaaw init` in
   each repo and run `/kit-setup` — the interview writes `.agent/kit.json`
   (oracle, guard level, dials).
3. Re-capture the memory entries worth keeping: `maaaw memory add …`.
4. Delete leftover 2.6 state when convenient: `.claude/memory/`,
   `.claude/loop.json`, `.codex/`, root `HANDOFF.md`, `AGENTS.md.bak`.
5. `maaaw doctor --hooks` must report healthy.

## New in 3.0 (no 2.6 equivalent)

Bridge job control (background, cancel, resume) · guard levels + custom rules
· memory lifecycle (consolidate/decay/promote) with budgeted digest ·
six-format rules sync · `handoff.json` with attached memory · MCP server
(`maaaw mcp serve`) with deny-by-default write modes · committed JSON Schemas.
