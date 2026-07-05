---
name: cross-review
description: Get a second model's independent review of work this session produced (or review another agent's work here) — blind, structured, and adjudicated rather than averaged. Use when the user wants "a second opinion", "have codex review this", cross-model review before merge, or when stakes justify two independent reviewers.
---

# Cross-review — a second brain, not an echo

Same-model review inherits the same blind spots. A different model family
reviewing the same diff catches a *different* error distribution — but only
if the review is blind and structured.

## Protocol

1. **Blind the reviewer.** Delegate via the bridge in a read mode; give the
   diff/paths and the *requirements*, never your reasoning or self-assessment:
   `maaaw bridge run --agent codex --mode review-only --task "Review <scope> against <requirements>. Report findings with file:line evidence, severity, and a fix sketch." --run`
   (cross-model-prompting skill applies to the task text.)
2. **Structured findings only.** The worker-result contract already forces
   Status/Findings sections; findings should mirror `schemas/finding.schema.json`
   (severity, title, file, line, evidence, recommendation, confidence).
3. **Adjudicate, don't average.** For each finding: verify against the actual
   code, then rule confirmed / refuted-with-evidence / needs-user. Two models
   disagreeing is signal — investigate, never split the difference.
4. **Close the loop.** Confirmed findings become fixes (smallest real fix,
   /loop if there's an oracle); durable ones become memory (`/learn`, e.g.
   failure-pattern records). Refuted findings with a lesson about WHY also go
   to memory — they save the next review.

## When to use which reviewer
- **This kit's `code-reviewer` agent**: cheap, fast, same-model — default for
  routine diffs.
- **Cross-model via bridge**: security-sensitive changes, gnarly concurrency,
  architecture calls, anything about to ship broadly, or when the user asks.
- **Both in parallel** (orchestration skill): highest stakes; adjudicate the
  union of findings.

## Rules
- The reviewer reviews the code, not you. Never send your justifications.
- A review without file:line evidence is an opinion; ask once for evidence,
  then discard unevidenced findings.
- You own the final verdict — cross-review informs, the orchestrator decides.
