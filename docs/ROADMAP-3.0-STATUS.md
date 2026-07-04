# MaaawKit 3.0 — Implementation Status

Tracks progress against the 3.0 roadmap (TypeScript edition). Updated with every
phase commit on `claude/implementation-tracking-s9paph`. Statuses: ⬜ not started ·
🟨 in progress · ✅ done · ⏸️ deferred (with reason).

| Phase | Scope | Status | Notes |
|---|---|---|---|
| 0 | Foundations & porting specs (toolchain, CI, fake CLIs, porting-spec tests, `maaaw validate`) | ✅ | 98 tests, 90% coverage on src/ |
| 1 | Foundation layer (zod schemas, config resolver, `.agent/` state, doctor v1) | ✅ | 8 committed JSON Schemas + drift gate; `maaaw doctor`/`init` live |
| 2 | Hooks on the engine (ported hooks + zero-dep shims + embedded fallback) | ⬜ | |
| 3 | Bridge engine (adapters, jobs, worktrees, guard-in-bridge, CLI verbs) | ⬜ | |
| 4 | Memory engine (records, lifecycle, digest, recall, promote, migrate) | ⬜ | |
| 5 | Rules, convert, install (canonical model, 6 converters, handoff.json) | ⬜ | |
| 6 | Content refactor (skill merges, contracts, dials, kit-setup) | ⬜ | |
| 7 | MCP server (stdio, bridge_/memory_/rules_/handoff_ tools) | ⬜ | |
| 8 | Split, distribution, launch (plugin split, npm, migration guide, ADRs) | ⬜ | |

## Acceptance-criteria ledger

Filled in as each phase lands. Every phase's accept bullet from the roadmap is
listed and checked off (or consciously waived, in writing) before the phase is
marked ✅.

### Phase 0
- [x] CI matrix configured (ubuntu/windows/macos × Node 20/22); all steps green locally on linux/node22 — remote cells verify on first PR/main push
- [x] Porting-spec suite exists for all five scripts (guard, post-edit, stop-verify, to-codex markers, codex-worker) — 98 tests
- [x] `npx . validate` passes on the repo (and the stricter YAML parsing found + fixed 5 latent frontmatter bugs in 2.6 command files)

### Phase 1
- [x] Schema round-trips tested (KitConfig, JobRecord, MemoryRecord, Finding, HandoffDoc, AdapterSpec, LoopFile) + committed JSON Schema exports with a CI drift gate
- [x] Config precedence tested across all five layers (defaults < user < repo < env < CLI), incl. deep-merge and broken-layer fallback
- [x] Doctor clean on fresh repo, actionable on broken one (bad kit.json → named layer+path; uninitialized → points at `maaaw init`; legacy memory → points at `maaaw memory migrate`)

### Phase 2
- [ ] Porting specs pass on both shim paths (engine present/absent)
- [ ] Latency budget measured in CI (<80 ms fallback / <250 ms engine)
- [ ] Fallback provably generated from the same rule source as the engine

### Phase 3
- [ ] End-to-end lifecycle green (fake CLIs) incl. cancel-mid-run and worktree cleanup
- [ ] Guard test proves a destructive task is refused inside the bridge
- [ ] Write-mode jobs demonstrably cannot touch the main tree
- [ ] Real `codex exec` smoke test documented (requires a machine with Codex)

### Phase 4
- [ ] Full lifecycle tested capture→digest→recall→promote
- [ ] Digest respects token budget under property tests
- [ ] Migration round-trips a 2.6 memory dir
- [ ] A promoted record appears in converted AGENTS.md

### Phase 5
- [ ] Convert idempotent (double-run = zero diff)
- [ ] Markers survive outside-edits (property-tested)
- [ ] Install places correctly for multiple detected tools
- [ ] Handoff round-trip carries the memory digest

### Phase 6
- [ ] `maaaw validate` green with new rules (80-line limit, contract presence)
- [ ] Agent outputs parse against finding.schema.json
- [ ] kit-setup writes a kit.json consumed by guard + loop

### Phase 7
- [ ] Tool-schema conformance tests
- [ ] Cross-agent demo documented (bridge_run + memory_recall via MCP)
- [ ] Write-mode denied by default from MCP

### Phase 8
- [ ] Plugin split (maaaw-kit + maaaw-bridge), one marketplace
- [ ] Migration guide 2.6→3.0
- [ ] ADRs recorded for every Part-I decision incl. rejections

## Decision log (session)

- Package manager: npm with committed `package-lock.json` (single package, no
  workspace — per roadmap §2).
- Node ≥ 20, ESM-only, TypeScript strict, tsup build, vitest tests, biome
  lint/format — per roadmap §2.
