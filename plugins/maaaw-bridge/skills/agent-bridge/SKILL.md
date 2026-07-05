---
name: agent-bridge
description: Delegate bounded tasks to other agent CLIs (Codex, Gemini, Copilot, Cursor, opencode) through the MaaawKit bridge engine — prepared-by-default jobs, isolated worktrees for write modes, structured results, guard policy enforced on every command.
---

# Agent bridge — delegate bounded work to a second agent

You are the orchestrator. Workers are bounded: narrow task in, reviewable
result out. Never treat a worker's output as done until you have reviewed it.

## When to delegate
- Parallelizable side-tasks (test fixing, a contained backend change, a second
  review) while you keep working the main thread.
- A second opinion from a different model (security pass, review-only).
- NOT for: tasks needing repo-wide context, architectural judgement, or
  anything you couldn't specify precisely.

## How
1. Check availability: `maaaw bridge detect` (adapters: codex, claude, copilot,
   cursor, gemini, opencode; overrides in `.agent/bridge/adapters.json`).
2. Prepare the job (nothing executes yet — the launch command is printed):
   `maaaw bridge run --agent codex --mode review-only --task "<narrow task>" [--oracle "<verify cmd>"]`
3. Execute: add `--run` (foreground) or `--background` (poll with
   `maaaw bridge status <id>`; cancel with `maaaw bridge cancel <id>`).
4. Collect: `maaaw bridge result <id>` — structured markdown (Status / Summary /
   Assumptions / Changed files / Verification run / Findings / Needs review).

## Modes
- `review-only`, `security-pass` — read modes, run in place, no edits allowed.
- `implementation-worktree`, `test-fix`, `backend-task` — write modes, ALWAYS
  in an isolated git worktree on a `<agent>/<slug>` branch. Changes come back
  as a patch + stat; the main tree is never touched.

## Reviewing a write-mode result
1. Read the result document; check Status and Needs review.
2. Read the patch (`patch:` path in the result output). Verify the oracle
   verdict (`oraclePassed`) yourself if it matters.
3. Apply by merging the worker branch or `git apply` the patch — your call,
   your responsibility. Then `maaaw bridge cleanup <id>` to drop the worktree.

## Safety rails (enforced by the engine, not by convention)
- Guard policy screens the task text and the built command before anything is
  created or run; destructive tasks are refused, risky ones need
  `--allow-risky`.
- Workers are instructed to never commit/push/publish or touch secrets.
- Prepared-by-default: broken vendor commands print instead of run.
- `--resume <job-id>` continues a vendor thread where supported (Codex first).
