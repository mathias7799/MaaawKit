# MaaawKit 3.1 — roadmap

Two features that deepen the moat instead of chasing breadth:

1. **Memory 3.1 — the self-feeding loop.** Turn memory from manual note-taking
   into mechanical auto-capture with human-in-the-loop confirmation, conflict/
   staleness intelligence, and an optional personal (cross-repo) layer.
2. **Bridge Swarm — vendor-diverse, adjudicated, safe.** Fan one task out to
   several agent CLIs in parallel, aggregate structured findings, and (optionally)
   adjudicate blind — with the guard + worktree safety no other kit has.

Status keys: ⬜ not started · 🟨 in progress · ✅ done · ⏸️ deferred (reason).
New ADRs: `docs/adr/0008-memory-auto-capture.md`, `docs/adr/0009-bridge-swarm.md`
(both **Proposed** until the first phase of each lands).

## Sequencing (read this first)

**Launch 3.0 before building 3.1.** Per ADR-0005 the trigger to evolve memory is
*measured* recall misses in a real repo — which requires real users. The launch
gate (unchanged from `ROADMAP-3.0-STATUS.md`): `npm publish` + `v3.0.0` tag, one
live `codex exec` smoke test, and a <5-minute quickstart demo. 3.1 work may be
prototyped on a branch in parallel, but does not ship before 3.0 is public.

Within 3.1, the two features are independent subsystems and can proceed
concurrently. Recommended order by value ÷ risk:

```
M0 → M1        (memory foundations + flagship oracle signal — high value, low risk)
S0 → S1 → S2   (swarm: structured output → fan-out → aggregation — the core)
M2 · S3        (conflict intel · blind judge — medium risk)
M3 · M4 · S4   (correction heuristics · personal memory · MCP surface)
S5             (codex app-server adapter — enabling, parallel, optional)
```

Cross-link: a swarm's confirmed findings (S2/S3) feed memory candidates (M0/M1)
with `source: auto:swarm`. `FindingsReport` (`src/schemas/index.ts:149`) is the
shared data model for both features.

---

# Feature 1 — Memory 3.1: the self-feeding loop

## Why

The differentiator is memory-as-a-lifecycle, but capture is 100% manual today
(`memory add` in `src/cli/main.ts`, `memory_learn` in `src/mcp/server.ts`). The
system only remembers what a human remembers to write down — the weakest link
in its own thesis. Make capture mechanical while keeping a human gate.

## Design decisions (→ ADR-0008)

- **New record status `proposed`** added to `MemoryStatusSchema`
  (`src/schemas/index.ts:188`). Candidates live in the same records dir (one
  git-diffable file each, `source: auto:<signal>`), reusing the store/index/
  lifecycle machinery. *Rejected alternative:* a separate `candidates/` dir —
  would fork the retrieval path for no gain.
- **`proposed` records are inert**: excluded from recall, digest, promotion, and
  consolidate-merge (but consolidate/dedupe still prevents duplicate proposals).
- **Human-in-the-loop only.** No auto-accept, no auto-promote. Candidate bodies
  are model/hook-generated text and inherit the "memory is untrusted input"
  stance from `SECURITY.md`. `accept` → `active`; `reject` → `archived`.
- **Opt-in + bounded.** New config `memory.autoCapture` (default `off` in
  3.1.0, flip to `on` after dogfooding) and `memory.maxCandidatesPerSession`
  (default 5) to control noise. Resolved via the existing layered config
  (`src/config/index.ts`).
- **Signals, in priority order:** (1) oracle fail→resolution, (2) repeated
  post-edit lint/type failure on the same file, (3) user-correction heuristic,
  (4) explicit decision capture. Phased M1→M3 by confidence, noisiest last.
- **Conflict detection is computed, not stored** — reuse `jaccard`/`tokenize`
  (`src/memory/lifecycle.ts`, `retrieval.ts`) to compare a candidate against
  active records + promoted rule ids at accept-time and in `doctor`; avoids
  schema churn.
- **Personal memory** = a second record root at `~/.config/maaaw/memory/`
  (honoring `MAAAW_HOME`), merged read-only into recall/digest with
  `scope: personal` provenance; project records win ties. The local-first answer
  to shared-endpoint memory layers; never written into a repo's `.agent/`.

## Data-model & surface changes

| Area | Change | File |
|---|---|---|
| Schema | add `proposed` status; export + drift-gate regen | `src/schemas/index.ts`, `schemas/memory-record.schema.json` |
| Store | `createCandidate`, `acceptCandidate`, `rejectCandidate`; recall/digest filters exclude `proposed` | `src/memory/store.ts`, `retrieval.ts` |
| Lifecycle | `detectConflicts(record)`; extend `memoryHealth` with candidate + conflict counts | `src/memory/lifecycle.ts` |
| Config | `memory.autoCapture`, `memory.maxCandidatesPerSession`, `memory.conflictThreshold` | `src/config/index.ts`, `KitConfigSchema` |
| Hook | oracle-resolution capture in `afterOracle`; new `user-prompt` HookKind (M3) | `src/hooks/stop-verify.ts`, `runtime.ts`, shim + template |
| CLI | `memory candidates`, `memory accept <id>`, `memory reject <id>`, `--global` | `src/cli/main.ts` |
| MCP | `memory_candidates`, `memory_accept`, `memory_reject` | `src/mcp/server.ts` |
| Doctor | candidates panel + conflict/staleness surfacing | `src/doctor/index.ts` |

## Phases & acceptance criteria

### M0 — Foundations & candidate lifecycle ⬜
Scope: `proposed` status, candidate store verbs, CLI + MCP surface, config flags.
- [ ] Schema round-trips with `proposed`; JSON Schema export regenerated; drift gate green.
- [ ] A `proposed` record never appears in `recall`, `buildDigest`, or `suggestPromotions` (unit + property test).
- [ ] `accept` → `active` (with confidence set); `reject` → `archived`; both idempotent.
- [ ] `memory candidates` (CLI) and `memory_candidates` (MCP) list only `proposed`, newest first.

### M1 — Oracle-driven capture (flagship signal) ⬜
Scope: when a `/loop` resolves green after `failure_streak ≥ N`, write ONE
`proposed` failure-pattern candidate summarizing the failing signature + the
changed files in the loop window. Rides the existing Stop hook — **no new hook
event.** Opt-in via `memory.autoCapture`.
- [ ] A simulated loop (fail ×3 → pass) produces exactly one candidate carrying the failure signature and changed paths.
- [ ] `autoCapture: off` → zero candidates; per-session cap respected.
- [ ] Re-running the same resolved loop produces no duplicate (signature dedupe against existing `proposed`/`active`).
- [ ] Fallback-shim path (engine absent) never proposes — capture is engine-only, and the shim stays a pure guardrail.

### M2 — Conflict & staleness intelligence ⬜
Scope: `detectConflicts` + `doctor` panel + accept-time warning; surface
stale-but-recently-hit records for re-confirmation.
- [ ] A candidate whose signature matches an active record/promoted rule but whose body materially differs is flagged `conflictsWith:[ids]` at list/accept time.
- [ ] A non-conflicting candidate is not flagged (false-positive fixture).
- [ ] `doctor` lists stale records with `hits > 0` as re-confirm suggestions.

### M3 — Post-edit & correction signals (opt-in, noisier) ⬜
Scope: (a) repeated lint/type failure on the same file across edits → candidate;
(b) new `user-prompt` HookKind (Claude Code `UserPromptSubmit`) with a
conservative correction-language heuristic → candidate quoting the correction.
- [ ] Correction heuristic precision fixtures: labeled true/false positives; documented precision target ≥ 0.8 on the fixture set (tunable, off by default).
- [ ] Repeated same-file failure yields one candidate; a single failure does not.
- [ ] New hook shim added, generated from template, drift gate green; latency within the existing budget.

### M4 — Personal (cross-repo) memory layer ⬜
Scope: global record root; recall/digest merge with provenance; `--global`.
- [ ] A `--global` record is recalled in a *different* repo with no `.agent/memory`.
- [ ] On a score tie, a project record outranks a global one; provenance shown.
- [ ] Global records are never written into a repo's `.agent/`; `doctor` shows the global store path + count.

## Risks & mitigations
- **Noise / candidate spam** → default off, per-session cap, signature dedupe, human-gate, `doctor` visibility.
- **Prompt-injection via auto-captured bodies** → candidates are untrusted, never auto-promoted, reviewed like code before commit (extends `SECURITY.md`).
- **Determinism** (roadmap forbids `Date.now`-style nondeterminism in tests) → signals derived from recorded loop/oracle state, not wall-clock.

---

# Feature 2 — Bridge Swarm: vendor-diverse, adjudicated, safe

## Why

The bridge today runs one adapter, one job (`prepareJob`/`runJob` in
`src/bridge/exec.ts`). `/audit-swarm` fans out *Claude subagents*. Nobody does a
**cross-vendor**, guard-screened, worktree-isolated, adjudicated swarm — codex +
gemini + claude each review the same diff, results clustered by agreement, judged
blind. That is a wedge neither marketplaces nor meta-harnesses hold.

## Design decisions (→ ADR-0009)

- **Swarm = fan ONE task to N adapters**, each an independent bridge job (reuse
  `prepareJob`/`runJob`). Read modes first (`review-only`/`security-pass`);
  write-mode swarm later (each job already gets its own worktree/branch — N
  worktrees is supported but gated).
- **Structured worker output.** Extend `buildWorkerPrompt`
  (`src/bridge/task.ts:50`) with a swarm/review contract requiring a fenced
  `FindingsReport` JSON matching `schemas/findings-report.schema.json` (reuse
  `FindingsReportSchema`). Extractor: fenced-json → `safeParse`, fallback to the
  existing markdown-section parse (`parseWorkerResult`).
- **Deterministic aggregation, no LLM required (Phase S2).** Cluster findings by
  normalized (file, line-proximity, title similarity); agreement count (M-of-N)
  boosts confidence; disagreements are preserved, never dropped.
- **Blind adjudication is opt-in (S3).** `--judge <agent>` runs one adjudication
  job over the clusters with **vendor identity stripped** (the cross-review
  ethos, `plugins/maaaw-bridge/skills/cross-review`), producing per-cluster
  verdict/priority. Default = deterministic clustering only; a judge crash
  degrades to the deterministic report, never blocks.
- **Safety.** Prepared-by-default (prints the N commands; explicit `--run`
  required); guard screens *each* job (existing `checkBridgePolicy`); `maxAgents`
  cap; cost/latency notice (N vendor invocations); bounded concurrency via the
  existing background runner; cancel = tree-kill every child job. MCP
  `bridge_swarm` is read-only by default and inherits write-mode
  deny-by-default (`mcp.writeModeClients`).
- **Absent adapters are reported, not silently dropped** (the "no silent caps"
  rule): `detectAdapters` gates membership; skipped agents are listed in the
  manifest.
- **Result artifact:** `.agent/bridge/swarm/<swarmId>/` with a manifest, each
  agent's job result, `aggregated.json` (clusters), and `report.md`.

## Surface changes

| Area | Change | File |
|---|---|---|
| Task | swarm/review worker-prompt variant; `FindingsReport` extractor | `src/bridge/task.ts` |
| Exec | `runSwarm(cwd, opts)`: prepare N, run bounded-concurrent, collect; `cancelSwarm` | `src/bridge/exec.ts` |
| Aggregate | new `src/bridge/swarm.ts`: cluster + agreement + report render | `src/bridge/swarm.ts` |
| CLI | `bridge swarm --agents … --mode … [--judge …] [--max-agents N] [--run]` | `src/cli/main.ts` |
| MCP | `bridge_swarm` tool (read-only default; write behind allow-list) | `src/mcp/server.ts` |
| Content | `cross-vendor-swarm` skill; optional `/audit-swarm --cross-vendor` | `plugins/maaaw-bridge/…`, `plugins/maaaw-kit/commands/audit-swarm.md` |
| Docs | `docs/MCP.md` swarm section; `SECURITY.md` swarm cost/authz note | `docs/…`, `SECURITY.md` |

## Phases & acceptance criteria

### S0 — Structured findings from workers ⬜
- [ ] A single review-mode job returns a schema-valid `FindingsReport`, parsed by the engine (fake-CLI fixture emitting the JSON block).
- [ ] Malformed JSON falls back to markdown-section parse without throwing.

### S1 — Fan-out engine (read modes) ⬜
- [ ] End-to-end swarm across ≥2 fake adapters returns all results.
- [ ] An absent adapter is listed in the manifest as `not-run`, others still complete (no silent drop).
- [ ] Swarm is prepared-by-default; `--run` required; cancel-mid-swarm leaves no orphan processes or worktrees (tree-kill verified).
- [ ] `maxAgents` cap enforced.

### S2 — Deterministic aggregation & agreement clustering ⬜
- [ ] Given 3 reports with 1 shared + 2 unique findings, aggregation yields 1 high-agreement cluster + 2 singletons — deterministically (stable ordering, no wall-clock).
- [ ] Agreement count raises merged confidence; disagreements preserved in `report.md`.

### S3 — Blind adjudication (opt-in judge) ⬜
- [ ] The judge's input carries no vendor names (anonymized clusters).
- [ ] A judge crash still yields the deterministic report (graceful degrade).
- [ ] Judge verdict/priority merged into `report.md`.

### S4 — MCP + safety surface ⬜
- [ ] `bridge_swarm` write-swarm denied by default for MCP clients; read-swarm allowed; guard refusal identical to single-job path.
- [ ] Cost/latency notice surfaced; `maxAgents` enforced through MCP.
- [ ] `cross-vendor-swarm` skill + docs land; validator counts stay correct.

### S5 — codex app-server adapter mode ⬜ (enabling, parallel, optional)
Scope: JSON-RPC (`codex app-server`) adapter mode — streaming, structured
output, turn/interrupt — noted as future in `src/bridge/adapters.ts`. Improves
swarm fidelity; does not block S0–S4 (shell-exec adapters already work).
- [ ] codex app-server adapter behind a capability flag; falls back to `exec` when unavailable.
- [ ] Live smoke test recorded (closes the 3.0 codex-smoke debt too).

## Risks & mitigations
- **Cost/latency blow-up** (N vendor CLIs) → prepared-by-default, `maxAgents`, explicit notice, bounded concurrency.
- **Adapter drift** (unverified specs) → swarm honors `verifiedAgainst`; `doctor` surfaces unverified members before a run.
- **Vendor output variance** → `FindingsReport` contract + markdown fallback; clustering tolerant of partial/failed members.
- **Multiplied attack surface** → each job passes the existing guard + trust gates; MCP write-swarm deny-by-default.

---

## Definition of done (both features)
- Strict TS clean; biome clean; `maaaw validate` clean.
- Coverage gate held (≥80 lines; engine ~91 today).
- New shims (if any) generated from templates with the drift gate green.
- ADR-0008 / ADR-0009 moved from **Proposed** to **Accepted** with the first
  phase landed; `SECURITY.md` updated for candidate-trust and swarm authz/cost.
- CHANGELOG entry; `README` feature table + counts updated.

## Decision log (to record as work lands)
- Candidate storage: same records dir + `proposed` status (not a separate dir).
- Auto-capture: opt-in, human-gated, engine-only (shims never propose).
- Swarm findings: `FindingsReport` as the cross-vendor lingua franca.
- Adjudication: deterministic first; blind LLM judge opt-in and non-blocking.
