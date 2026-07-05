# MaaawKit 3.0 architecture

One TypeScript engine with content attached, exposed through three thin
transports. Every capability is a function in the engine; the CLI, the MCP
tools, and the hook shims are wrappers over the same core.

```
┌──────────────────────────────────────────────────────────────┐
│ DISTRIBUTION   npm (maaawkit) · marketplace (maaaw-kit,       │
│                maaaw-bridge) · shims committed for zero-install│
├──────────────────────────────────────────────────────────────┤
│ INTERFACES     CLI (maaaw …)   MCP (maaaw mcp serve)          │
│ (thin)         hook shims (zero-dep .mjs, embedded fallback)  │
├──────────────────────────────────────────────────────────────┤
│ ENGINE (src/)  bridge/   adapters, jobs, exec, worktrees      │
│                hooks/    guard rules+engine, stop-verify,     │
│                          post-edit, session-context, shim-gen │
│                memory/   store, lifecycle, retrieval/digest   │
│                rules/ + convert/  canonical model → 6 formats │
│                handoff/  HANDOFF.md + handoff.json            │
│                doctor/   env, config, state, hooks, memory,   │
│                          rules drift, adapters                │
├──────────────────────────────────────────────────────────────┤
│ FOUNDATION     schemas/ (zod → committed JSON Schemas)        │
│                config/  defaults < user < .agent/kit.json     │
│                         < MAAAW_* env < CLI flags             │
│                state/   .agent/ layout, atomic writes, locks  │
├──────────────────────────────────────────────────────────────┤
│ CONTENT        plugins/maaaw-kit (11 skills, 8 agents,        │
│                14 commands, 4 hook shims)                     │
│                plugins/maaaw-bridge (5 skills, 3 commands)    │
└──────────────────────────────────────────────────────────────┘
```

## Load-bearing decisions

- **One guard engine, three transports.** The destructive-command policy is a
  data table (`src/hooks/guard-rules.ts`). The hook engine evaluates it, the
  bridge screens every task and built command with it, MCP inherits it, and
  the zero-dep shim fallback is *generated* from it at build time with a
  drift-gate test — the fallback structurally cannot diverge.
- **Prepared-by-default.** Nothing the bridge builds executes without an
  explicit run flag. Broken vendor commands print instead of run.
- **Write isolation is mandatory.** Write-mode jobs always run in a git
  worktree on an `<agent>/<slug>` branch; changes return as patch + stat.
- **Markdown is the memory source of truth.** One frontmatter+body file per
  record; `index.json` and `digest.md` are generated artifacts. Humans can
  read, edit, and review memory in PRs.
- **Markers own machine text; humans own everything else.** All generated
  writes into human files go between `maaaw-kit:start/end` markers,
  idempotently, with a `.bak` on first touch.
- **`.agent/` is vendor-neutral.** Deliberately not `.claude/` — the state
  standard serves every agent equally (see `docs/MEMORY.md`, `docs/MCP.md`).
- **No backwards compatibility with 2.6** (owner decision): clean break, no
  stubs, no importers. See `docs/MIGRATION-3.0.md`.

## Testing model

Porting specs were written before/with each port (the 2.6 Python scripts were
the spec; known warts fixed in transit and documented in the tests). Bridge
and MCP are integration-tested against a fake agent CLI fixture; shims are
tested as subprocesses on both paths (engine present/absent) with latency
budgets; converters carry idempotency + marker-survival property tests.
Coverage gate ≥80% lines on the engine (`src/`, excluding transport wiring).

## Architecture decision records

See `docs/adr/` — including the recorded rejections (Python engine, pnpm
workspace, embeddings, transcript transfer).
