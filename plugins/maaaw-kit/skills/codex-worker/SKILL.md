---
name: codex-worker
description: Delegate a bounded review or implementation task from a Claude Code session to Codex CLI using a safe worker pattern. Use when the user asks Claude to hand off a backend task, get a second-model review, run Codex in-session, let Codex make changes, or orchestrate Claude + Codex together.
---

# Codex Worker Delegation

MaaawKit treats Codex as a **worker**, not as an invisible co-owner of the current session. Claude remains the orchestrator: it defines the task, prepares context, launches or gives the launch command, then reviews Codex's result and diff before accepting anything.

## When to use

Use this skill when the user wants:

- Claude to delegate a bounded backend/frontend/test/security task to Codex.
- A second independent review while Claude keeps the main session.
- Codex to attempt an implementation in parallel.
- Codex to summarize, audit, or propose patches from the same repository.
- A safe Claude ⇄ Codex bridge during one session.

## Core rule

**Never let Claude and Codex edit the same working tree at the same time.**

Use:

- `review-only` for answer-only tasks in the current repo with Codex's read-only sandbox.
- `implementation-worktree`, `backend-task`, or `test-fix` for write-capable tasks in a new git worktree.

## Recommended command

From the repo root, run the MaaawKit worker script:

```bash
python <plugin-root>/scripts/codex-worker.py \
  --task "Audit the backend retry/idempotency flow" \
  --mode review-only \
  --run
```

For implementation:

```bash
python <plugin-root>/scripts/codex-worker.py \
  --task "Fix the webhook retry idempotency bug and run tests" \
  --mode backend-task \
  --oracle "npm test" \
  --run
```

The script writes:

```text
.codex/tasks/<timestamp>-<slug>.md
.codex/results/<timestamp>-<slug>.md
.codex/results/<timestamp>-<slug>.patch        # write-capable worktree modes
.codex/results/<timestamp>-<slug>.stat.txt     # write-capable worktree modes
```

Write-capable modes create a worker branch/worktree:

```text
../<repo>-codex-<task-slug>/
branch: codex/<task-slug>
```

## Delegation process

1. Clarify the task boundary in one sentence.
2. Pick the mode:
   - `review-only`: answer/findings only, no edits.
   - `security-pass`: read-only security review.
   - `implementation-worktree`: generic implementation attempt.
   - `backend-task`: implementation task biased toward backend changes.
   - `test-fix`: reproduce/fix failing tests.
3. Choose an oracle if the task has a testable done-state.
4. Run the worker script with `--run` if the user wants Codex invoked now. Without `--run`, it prepares the prompt/result files and prints the exact launch command.
5. Read the result file and, for write-capable modes, inspect the patch/stat.
6. Verify before accepting:
   - run the oracle in the worker worktree if Codex did not,
   - inspect changed files,
   - cherry-pick/merge/apply only after review.
7. Report what Claude accepted, rejected, or needs to iterate.

## Safety expectations

- Codex should not commit, push, publish, or open PRs from this flow.
- Codex must not edit secrets, `.env`, auth tokens, or private keys.
- Codex must not weaken tests or disable lint/type rules.
- Claude must not claim Codex's result is correct until Claude has inspected it.
- If hooks are exported to Codex, the user must review/trust them in Codex with `/hooks`.

## Result review checklist

After Codex returns, Claude should check:

- Does the result have `Status`, `Summary`, `Changed files`, `Verification run`, and `Needs Claude review`?
- Did Codex stay within scope?
- Are changed files minimal and relevant?
- Did Codex run the oracle? If not, run it.
- Does the patch contain secrets, generated noise, test weakening, or unrelated refactors?
- Is the result worth applying, or should Claude ask Codex to retry with a narrower brief?

## Good use cases

- "Let Codex take a backend pass while we keep the architecture in Claude."
- "Get a second review of this auth change."
- "Ask Codex to fix the failing test in a worktree."
- "Have Codex audit the queue processing code and return findings only."

## Bad use cases

- Unbounded “fix the whole app” tasks.
- Running Codex with write access in the same dirty tree Claude is editing.
- Automatic recursive Claude → Codex → Claude loops without a hard budget.
- Letting Codex merge or push without human/Claude review.
