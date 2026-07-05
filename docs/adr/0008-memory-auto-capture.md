# ADR-0008: mechanical memory auto-capture, human-gated

**Proposed, 3.1** (see `docs/ROADMAP-3.1.md` Feature 1). Memory records may be
proposed automatically from execution signals, but never become active without
a human accepting them. A new `proposed` status is added to
`MemoryStatusSchema`; `proposed` records are inert (excluded from recall,
digest, promotion, and consolidate-merge) until `accept` flips them to `active`
or `reject` archives them.

Why: capture is 100% manual today, which is the weakest link in the
memory-as-a-lifecycle thesis — the system only remembers what a human writes
down. Mechanical proposal + a human gate keeps the signal without the risks of
autonomous memory.

Signals, phased by confidence (noisiest last): (1) an oracle loop resolving
green after a failure streak — rides the existing Stop hook, no new event; (2)
repeated post-edit lint/type failure on one file; (3) a conservative
user-correction heuristic via a new `UserPromptSubmit` hook; (4) explicit
decision capture.

Constraints:
- **Human-in-the-loop only** — no auto-accept, no auto-promote. Candidate
  bodies are model/hook-generated and inherit the "memory is untrusted input"
  stance (SECURITY.md).
- **Opt-in and bounded** — `memory.autoCapture` (default off in 3.1.0) and
  `memory.maxCandidatesPerSession`; signature dedupe prevents duplicates.
- **Engine-only** — the zero-dependency shims never propose; they stay pure
  guardrails.
- **Conflict detection is computed, not stored** — reuse `jaccard`/`tokenize`
  to flag candidates that contradict active records or promoted rules, at
  accept-time and in `doctor`; no schema churn.

Rejected alternatives: a separate `candidates/` directory (forks the retrieval
path for no gain — `proposed` status reuses the store/index/lifecycle
machinery); auto-promotion of high-agreement captures (removes the human gate
that makes untrusted auto-capture safe).

Relationship to ADR-0005: unchanged. This is about *capture*, not *retrieval* —
recall stays BM25-lite keyword scoring; embeddings still wait for that ADR's
trigger.
