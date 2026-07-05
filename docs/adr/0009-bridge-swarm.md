# ADR-0009: cross-vendor bridge swarm with blind adjudication

**Proposed, 3.1** (see `docs/ROADMAP-3.1.md` Feature 2). The bridge gains a
swarm mode: one task fanned out to N agent CLIs in parallel, each as an
independent bridge job, with results aggregated into agreement clusters and
(optionally) adjudicated blind.

Why: the bridge runs one adapter per job today, and `/audit-swarm` fans out
Claude subagents. A cross-vendor, guard-screened, worktree-isolated,
adjudicated swarm (codex + gemini + claude reviewing the same diff, clustered
by agreement, judged with vendor identity stripped) is a capability neither
plugin marketplaces nor meta-harnesses offer — it is the bridge's wedge.

Design:
- **Reuse the single-job engine** (`prepareJob`/`runJob`, per-job worktree
  isolation, `detectAdapters`). Read modes first; write-mode swarm gated.
- **`FindingsReport` is the cross-vendor lingua franca** — the swarm worker
  prompt requires a fenced JSON block matching
  `schemas/findings-report.schema.json`, with a markdown-section fallback.
- **Deterministic aggregation first, LLM judge second.** Clustering by (file,
  line-proximity, title similarity) with M-of-N agreement needs no model. A
  `--judge <agent>` adjudication pass is opt-in, receives anonymized clusters
  (cross-review ethos), and degrades to the deterministic report if it fails —
  it never blocks.

Safety (this multiplies the bridge's execution surface):
- Prepared-by-default; explicit `--run`; `maxAgents` cap; cost/latency notice.
- The existing guard screens *every* built command; each job keeps its trust
  gates and worktree isolation.
- Cancel tree-kills every child job; absent adapters are reported, not silently
  dropped (the "no silent caps" rule).
- MCP `bridge_swarm` is read-only by default and inherits write-mode
  deny-by-default (ADR-0007).

Rejected/deferred: an LLM-only aggregation with no deterministic layer (fragile,
non-reproducible); write-mode swarm as the default (N parallel worktrees is a
large action — gated behind explicit opt-in). The codex app-server (JSON-RPC)
adapter mode is an enabling enhancement tracked separately (roadmap S5), not a
prerequisite — shell-exec adapters already work.
