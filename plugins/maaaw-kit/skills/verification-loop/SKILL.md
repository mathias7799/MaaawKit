---
name: verification-loop
description: Iterative verify-fix loops for driving work to actually-done. Use when running long autonomous tasks, fixing test suites, achieving "all tests green", satisfying a spec checklist, or whenever the user says "keep going until it works", "loop", "don't stop until", or asks for autonomous/agentic completion of a defined goal.
---

# Verification Loop

The failure mode this skill kills: declaring victory based on reading code instead of running it, and stopping one iteration too early.

## The loop contract

Every loop needs, BEFORE iteration 1:
1. **An oracle** — a single command whose exit code defines done (`dotnet test`, `npm run build && npm test`, `uv run pytest`). If the goal has no oracle, build one first (write the failing test / the checklist script). No oracle = no loop; you'd just be spinning.
2. **A budget** — max iterations (default 10) and what to do on exhaustion (report best state + remaining failures; never claim success).
3. **A no-regression rule** — the oracle at iteration N must never pass fewer checks than at N-1. If it does, revert the last change immediately (`git checkout -- <files>` or `git stash`), don't "fix forward" from a regressed state.

## Iteration shape

```
run oracle → read FULL output → pick ONE failure (the first/most-upstream one)
→ diagnose (use debugging skill if non-obvious) → smallest fix
→ run oracle again → compare counts → commit if improved
```

- **One failure per iteration.** Fixing the first error often clears cascades; fixing five at once makes regressions undiagnosable.
- **Commit each green improvement** (`git commit`) so any regression is one `git revert` away. Small commits are your undo stack.
- **Fix causes, not oracles.** Deleting a test, loosening an assertion, adding `skip`, `// @ts-ignore`, `#pragma warning disable`, or widening a timeout are FORBIDDEN moves unless the user explicitly approves — they satisfy the letter of the loop while betraying it.

## Stall detection (be honest with yourself)

You are stalled when: the same failure survives 3 iterations, OR you're alternating between two states, OR your "fixes" are getting bigger instead of smaller. When stalled:
1. Stop patching. Re-read the failure from scratch — full output, not the summary line.
2. Question the layer: maybe the test is wrong, the spec is ambiguous, or the approach (not the code) is broken. Escalate to the deep-thinking skill's step 3.
3. If still stalled after re-planning: STOP and report to the user with: current pass count, the stuck failure, two hypotheses, and what you'd try with more budget. A precise stuck-report is a good outcome; a fake "done" is the worst outcome.

## Exit criteria (all three, in order)

1. Oracle fully passes — you saw it pass in THIS session's final state, not from memory.
2. A clean-state check: `git status` shows only intended changes; no debug prints, no commented-out code, no stray files.
3. One final full run AFTER cleanup (cleanup breaks things more often than you'd think).

Only then report done — and report it with evidence: paste the oracle's passing summary line.

## Hook-driven autonomous loops

This kit's Stop hook (`hooks/stop-verify.py`) can enforce the loop mechanically: create `.claude/loop.json` (via the `/loop` command) with `{"trusted": true, "oracle": "<command>", "max_iterations": N}` and the hook will block session exit while the oracle fails, feeding the failure output back. Same rules apply: the hook enforces the oracle; YOU enforce no-cheating.
