# Memory: design and lifecycle

2.6 memory was prose files a skill promised to maintain — no schema, no
lifecycle, no retrieval, no budget, Claude-only. 3.0 treats memory as **data
with a lifecycle** while keeping every record human-readable and git-diffable.

## Record format

One markdown file per record in `.agent/memory/records/<id>.md`:

```markdown
---
id: mem_7f3a2c
type: lesson            # lesson | decision | repo-fact | preference | failure-pattern
title: EF migrations must run before seeding in CI
tags: [ci, database]
paths: ["src/Data/**", ".github/workflows/ci.yml"]
confidence: high        # low | medium | high
status: active          # active | stale | promoted | archived
created: 2026-07-05
lastConfirmed: 2026-07-05
hits: 3                 # times retrieved; feeds ranking and promotion
source: session         # session | user | bridge-job:<id> | mcp:<client>
---

One paragraph of the actual knowledge, evidence-first.
```

`index.json` and `digest.md` are generated artifacts — rebuilt by the engine,
never hand-edited. Hand-editing a record file is fine and expected.

## Lifecycle (`maaaw memory <verb>`)

- **add** — `/learn` and auto-capture triggers (user corrections, root causes,
  failed approaches, always/never preferences, verified repo facts).
- **consolidate** — near-duplicates (title+tag Jaccard ≥ 0.6, same type) merge
  into the most recently confirmed record: union tags/paths, summed hits,
  bumped confidence; duplicates are archived, never deleted.
- **review / decay** — active records unconfirmed for `memory.decayDays`
  (default 45) flip to stale; `review` lists the triage plus promotion
  candidates. `confirm` refreshes; `archive` retires.
- **promote** — a high-confidence record with ≥ `memory.promoteHitThreshold`
  hits (default 3) graduates into `.agent/rules.md` (marker-delimited block,
  provenance ids kept). Memory is the nursery; rules are the constitution.
- Nothing is ever deleted; archived records leave the index but stay in git.

## Retrieval

Two paths:

1. **Session start** — the SessionStart hook rebuilds `digest.md` live: a
   budgeted selection (default ≤1500 tokens, `memory.digestTokenBudget`)
   scored by `recency × confidence × (1 + hits/10) × (1 + 2·pathOverlap)`,
   where pathOverlap matches the record's `paths` globs against
   `git diff --name-only HEAD`. A session touching `src/Data` surfaces
   database lessons first. Stale records are penalized ×0.4.
2. **On demand** — `maaaw memory recall "<query>"`: BM25-lite keyword scoring
   (title ×3, tags ×2, body ×1, idf-weighted, confidence/hit boosts). Recall
   increments hits, closing the loop into ranking and promotion.

Embeddings are a deliberate non-goal until record counts justify them
(ADR-0005; trigger: >300 active records or measured recall misses).

## Cross-agent memory

The digest is a convertible block: `maaaw rules sync` embeds it
(marker-delimited, labeled advisory-not-instructions) into AGENTS.md,
GEMINI.md, and peers; `handoff.json` carries the top path-relevant record ids;
`memory_recall`/`memory_learn` are MCP tools any connected agent can call.
Memory stops being a Claude-only advantage and becomes the kit's shared brain.

## Security posture

Injected memory is labeled advisory context, never instructions. Records in
cloned/unfamiliar repos are untrusted input. MCP-created records carry
`source: mcp:<client>` provenance. Commit `.agent/memory/` only after team
review — it is prompt context.
