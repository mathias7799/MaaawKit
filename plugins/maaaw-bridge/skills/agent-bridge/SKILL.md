---
name: agent-bridge
description: Delegate bounded tasks to other agent CLIs (Codex, Gemini, Copilot, Cursor, opencode) through the MaaawKit bridge engine — prepared-by-default jobs, isolated worktrees for write modes, structured results, guard policy enforced on every command.
---

# Agent Bridge

You are the orchestrator. Workers are bounded: narrow task in, reviewable result
out. Never treat worker output as done until you review it.

## When to delegate

- Parallelizable side-tasks while you keep the main thread moving.
- Contained implementation, test fixing, or second review tasks with clear scope.
- Second opinions from a different model family for security/review-only work.
- Do not delegate tasks needing broad conversation context, architectural
  judgment you cannot specify, or anything with unclear success criteria.

## How

1. Check availability: `maaaw bridge detect`.
2. Pick a prompt contract when useful: `prompt_catalog` /
   `maaaw://prompts/catalog` in MCP, or inspect plugin files directly. Prefer a
   concrete asset id (`maaaw-kit.agent.code-reviewer`,
   `maaaw-kit.skill.codebase-audit`, etc.) over inventing a fresh role prompt.
3. Prepare the job:
   `maaaw bridge run --agent codex --mode review-only --task "<narrow task>" [--oracle "<verify cmd>"] [--prompt-asset <asset-id>]`
4. Execute only when intended: add `--run` or `--background`.
5. Collect with `maaaw bridge result <id>` and review Status / Summary /
   Assumptions / Changed files / Verification run / Findings / Needs review.

## Modes

- `review-only`, `security-pass` — read modes, run in place, no edits allowed.
- `implementation-worktree`, `test-fix`, `backend-task` — write modes, always in
  an isolated git worktree on `<agent>/<slug>`; changes come back as patch +
  stat and the main tree is untouched.

## Reviewing write-mode result

1. Read the result document; check Status and Needs review.
2. Read the patch path from the result output.
3. Verify the oracle verdict yourself when it matters.
4. Integrate intentionally; worker output is input to your decision, not truth.

## Rules

- Guard policy screens task text and built command before anything runs.
- Workers must not commit, push, publish, or touch secrets.
- Prepared-by-default: broken vendor commands print instead of run.
- `--resume <job-id>` continues vendor threads where the adapter supports it.
- If you select a prompt asset, the engine embeds it in the worker prompt and
  records `promptAssetId` / `promptAssetPath` on the job. Switch assets
  deliberately between jobs; do not hide role changes in prose.
