# MaaawKit 3.0 — Implementation Status

Tracks progress against the 3.0 roadmap (TypeScript edition). Updated with every
phase commit on `claude/implementation-tracking-s9paph`. Statuses: ⬜ not started ·
🟨 in progress · ✅ done · ⏸️ deferred (with reason).

| Phase | Scope | Status | Notes |
|---|---|---|---|
| 0 | Foundations & porting specs (toolchain, CI, fake CLIs, porting-spec tests, `maaaw validate`) | ✅ | 98 tests, 90% coverage on src/ |
| 1 | Foundation layer (zod schemas, config resolver, `.agent/` state, doctor v1) | ✅ | 8 committed JSON Schemas + drift gate; `maaaw doctor`/`init` live |
| 2 | Hooks on the engine (ported hooks + zero-dep shims + embedded fallback) | ✅ | Python hooks deleted; plugin runs the node shims; `doctor --hooks` replaces selftest.py |
| 3 | Bridge engine (adapters, jobs, worktrees, guard-in-bridge, CLI verbs) | ✅ | Python scripts deleted (clean break, no stubs); /bridge + agent-bridge replace codex-worker; README rewritten for 3.0 |
| 4 | Memory engine (records, lifecycle, digest, recall, promote) | ✅ | migrate waived (no back-compat); promoted→AGENTS.md flow lands with Phase 5 convert |
| 5 | Rules, convert, install (canonical model, 6 converters, handoff.json) | ✅ | drift panel in doctor; promoted memory reaches AGENTS.md (closes the Phase 4 leftover) |
| 6 | Content refactor (skill merges, contracts, dials, kit-setup) | ✅ | 16 skills / 17 commands / 8 contract-bearing agents; validator enforces budgets + contracts |
| 7 | MCP server (stdio, bridge_/memory_/rules_/handoff_ tools) | ✅ | done before Phase 6 (phases 4–7 reorderable per roadmap); SECURITY.md rewritten; docs/MCP.md registration guide |
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
- [x] Porting specs pass on both shim paths (engine present via node_modules link / absent → embedded fallback)
- [x] Latency budget measured in CI (<80 ms fallback / <250 ms engine medians, ×3 headroom factor for shared runners via MAAAW_LATENCY_FACTOR)
- [x] Fallback provably generated from the same rule source as the engine (shim drift-gate test regenerates from src/hooks/guard-rules.ts and compares byte-for-byte)

### Phase 3
- [x] End-to-end lifecycle green (fake CLIs) incl. cancel-mid-run (tree-kill verified dead) and worktree cleanup
- [x] Guard test proves a destructive task is refused inside the bridge (`rm -rf /` task → PolicyRefusal before any worktree/file exists; ask-level needs --allow-risky)
- [x] Write-mode jobs demonstrably cannot touch the main tree (worktree modified, main tree byte-identical, change returned as patch+stat)
- [ ] Real `codex exec` smoke test — PENDING: needs a machine with the Codex CLI installed; `maaaw bridge detect` + the codex adapter spec are ready (verified `bridge detect` probes real CLIs — found claude in the dev container)

### Phase 4
- [x] Full lifecycle tested capture→digest→recall→promote (unit + CLI end-to-end smoke: capture → 3 recalls → review suggests → promote → rules.md block → digest excludes promoted → doctor panel)
- [x] Digest respects token budget under property tests (60 random records × 4 budgets)
- [~] Migration round-trips a 2.6 memory dir — WAIVED (owner directive: no backwards compatibility; no migrate command ships)
- [x] A promoted record appears in converted AGENTS.md (tested end-to-end in Phase 5: promote → rules.md → install → AGENTS.md with provenance id)

### Phase 5
- [x] Convert idempotent (double-run = zero diff across all six targets)
- [x] Markers survive outside-edits (property-tested: 20 rounds of random human edits around the managed block)
- [x] Install places correctly for multiple detected tools (detection-based; --tools/--all overrides; .bak on first touch)
- [x] Handoff round-trip carries the memory digest (Claude→Codex→Claude sample: handoff.json memoryRecords + AGENTS.md digest block; return handoff preserves records)

### Phase 6
- [x] `maaaw validate` green with new rules (80-line SKILL.md budget, 250-line reference budget, agent findings-contract presence, command→skill cross-refs) — enforced in CI
- [x] All 8 agents carry the findings contract mirroring schemas/findings-report.schema.json (live audit-swarm dry run not executed — no interactive Claude session in this environment; the contract + audit-swarm-spec schemas are aligned by construction)
- [x] kit-setup rewritten as an interview writing .agent/kit.json (oracle → /loop + Stop hook; guardLevel → guard hook; dials → /audit //grill), seeds rules.md + first memory record, verifies with doctor --hooks

Notes from the (older) content-structure spec, applied selectively per owner guidance: absorbed trigger phrases into merged skills' descriptions; /cross-review command added; declare-your-read added to deep-thinking + vibe-to-prd; explicit model decisions on all 8 agents (sonnet for breadth, deliberate inherit comments for bug-hunter/code-reviewer); reference-size budget in validator; chaining footers across the command spine. Deliberately NOT adopted (superseded): /codex-worker deprecation stub and memory migrate/compat pointers (no-backwards-compat directive), stop-verify cross-review gate (scope), per-skill license/compat frontmatter (noise), splitting content into maaaw-bridge plugin now (that is Phase 8).

### Phase 7
- [x] Tool-schema conformance tests (10 tools, schemas asserted over in-memory transport)
- [x] Cross-agent demo: memory_learn/recall round-trip, bridge_run end-to-end vs fake CLI, rules_sync + handoff round-trip from a second client — automated in tests/mcp.test.ts and documented in docs/MCP.md
- [x] Write-mode denied by default from MCP; per-client opt-in via kit.json mcp.writeModeClients (tested: opted-in client allowed, other client still denied); guard refusal identical through MCP

### Phase 8
- [ ] Plugin split (maaaw-kit + maaaw-bridge), one marketplace
- [ ] Migration guide 2.6→3.0
- [ ] ADRs recorded for every Part-I decision incl. rejections

## Decision log (session)

- Package manager: npm with committed `package-lock.json` (single package, no
  workspace — per roadmap §2).
- Node ≥ 20, ESM-only, TypeScript strict, tsup build, vitest tests, biome
  lint/format — per roadmap §2.
- **No backwards compatibility** (owner directive, 2026-07-05): 3.0 is a clean
  break from 2.6. Concretely: Python hooks/scripts deleted as soon as their TS
  replacement lands (hooks + validator at Phase 2 instead of Phase 3); the
  plugin's hooks.json runs the node shims directly; the loop file lives ONLY at
  `.agent/loop.json` (no `.claude/`/`.codex/` fallback); session context reads
  ONLY the 3.0 memory digest (no `.claude/memory/*.md` injection); no legacy
  power-kit marker migration; `maaaw memory migrate` and the 2.6 compat pointer
  are dropped from Phase 4 scope (acceptance bullet waived); no legacy-python CI
  job. The `/loop` command and content will be rewritten against `.agent/` in
  Phase 6.
