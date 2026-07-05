# MaaawKit — market positioning

Where MaaawKit sits in the 2026 AI-coding-agent tooling landscape, what makes
it defensible, who it is for, and — honestly — where it does not yet compete.

## The category

"Agent operating layers" for coding agents are a real and crowded category.
The neighbours fall into three overlapping shapes:

| Project | Shape | Overlap with MaaawKit |
|---|---|---|
| `wshobson/agents` | Multi-harness plugin marketplace (agents/commands across Claude Code, Codex, Cursor, opencode, Copilot, Gemini) | Content breadth, multi-harness |
| Ruflo (`ruvnet`) | Agent *meta-harness* — swarms, adaptive memory, hundreds of MCP tools | Orchestration, memory |
| Memorix | Cross-agent **memory** layer over MCP (many IDEs) | Shared project memory |
| ECC ("Everything Claude Code") | Self-described agent **OS** — structure, memory, skills, rules, hooks, security | Positioning is nearly identical |
| Emdash | Agent-first dev *environment*, ~22 CLI providers | Provider breadth |
| `awesome-claude-code-*` lists | Curated catalogs | Discovery, not a product |

The honest read: **breadth and "operating system for agents" positioning is not
unique.** Several projects claim it, and some have far more adoption.

## What is actually differentiated

MaaawKit's moat is **mechanical discipline, not feature count** — verifiable
engineering the neighbours mostly assert rather than prove:

1. **One guard engine with a drift-gated, generated fallback.** The
   destructive-command policy is a single data table (`src/hooks/guard-rules.ts`).
   The hook, the CLI, the bridge, and MCP all evaluate it, and the
   zero-dependency shim fallback is *generated* from that table with a
   byte-for-byte CI drift test — the safety layer *structurally cannot diverge*
   across transports. I have not found another kit that does this.
2. **Prepared-by-default bridge with mandatory worktree isolation.** Delegated
   jobs never execute without an explicit run flag; every task and built command
   is guard-screened *before* anything is created; write modes are confined to a
   throwaway git worktree returned as patch + stat. This is a materially more
   disciplined delegation model than "shell out to the other CLI."
3. **Committed `.agent/` state is treated as untrusted.** A cloned repo cannot
   relax the guard, redirect a bridge read, or auto-run an oracle — the trust
   gate is applied consistently across loop files, `kit.json`, adapters, job
   records, and the oracle (see `SECURITY.md`).
4. **Memory as a lifecycle that earns permanence.** Records are captured,
   recalled (with hit tracking), ride along in handoffs, and are *promoted into
   canonical rules* when they prove durable — deeper than store-and-recall
   memory layers.
5. **Vendor-neutral by construction.** One canonical rules model compiles into
   six tool formats; state lives in `.agent/`, not `.claude/`.

Supporting quality signals: zero `any`/suppression comments in `src/`, ~91%
line coverage with behavioral tests, ADRs that record *rejected* alternatives,
and a deterministic CI gate.

## Who it is for

- **Primary:** teams/individuals who already use one or more coding agents and
  want a **safety-and-memory substrate to bolt underneath** — mechanical
  guardrails, portable project memory, and safe cross-agent delegation — without
  adopting a heavyweight meta-harness.
- **Secondary:** multi-agent shops that need the *same* rules, memory, and guard
  policy to apply identically whether work runs in Claude Code, Codex, Cursor,
  or Gemini.
- **Not for:** users who want a large pre-built agent catalog (use a
  marketplace), a swarm orchestration platform (use a meta-harness), or a
  managed UI/IDE (use an environment product).

## Honest weaknesses / where it does not yet compete

- **Adoption.** Pre-1.0 alpha, effectively no install base yet. The neighbours'
  real moat is community and downloads; that is unlicensed until MaaawKit ships.
- **Adapter verification.** Only the `claude` CLI is confirmed present in-repo
  (detected at runtime); `codex` flags are cross-checked against a reference but
  await a live smoke test, and `copilot`/`cursor`/`gemini`/`opencode` specs are
  marked `unverified` and surfaced as such by `doctor`.
- **Single maintainer, no external contributors yet.**
- **Guard is a blocklist.** Honest speed bump, not a sandbox (see `SECURITY.md`).

## The wedge, stated plainly

> The safety-and-memory substrate you bolt under whatever agent you already
> use — provably consistent guardrails, portable project memory, and prepared-
> by-default delegation, in one tested engine.

## What would move "placement" next (owner actions)

1. **Publish.** `npm publish` (needs `NPM_TOKEN` + a `v3.0.0` tag) and the
   marketplace tag — the package is `npm pack`-clean today.
2. **Verify adapters** with a live `codex exec` smoke test and record verdicts.
3. **Seed adoption:** a short demo, a comparison in the awesome-* lists, and a
   quickstart that proves the guard/bridge/memory loop in under five minutes.
