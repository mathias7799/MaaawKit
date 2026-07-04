---
description: Delegate a bounded task to Codex CLI from the current Claude Code session
argument-hint: '"<task>" [--mode review-only|backend-task|implementation-worktree|test-fix|security-pass] [--oracle "<cmd>"] [--run]'
---
Read the codex-worker skill and delegate this bounded task to Codex: $ARGUMENTS

1. Parse the task, mode, optional oracle, and whether `--run` was explicitly requested. Default mode is `review-only`; use a worktree mode for any write-capable task.
2. Locate the MaaawKit plugin root (directory containing this command's `commands/` folder), then from the repo root run:
   ```bash
   python <plugin-root>/scripts/codex-worker.py --task "<task>" --mode <mode> [--oracle "<cmd>"] [--run]
   ```
3. If `--run` is not present, prepare the worker files only and show the exact Codex launch command. If `--run` is present and Codex is available, launch `codex exec`.
4. For `backend-task`, `implementation-worktree`, and `test-fix`, make sure the script uses an isolated git worktree. Never let Codex and Claude edit the same working tree simultaneously.
5. Read `.codex/results/<timestamp>-<slug>.md`; for write-capable modes also inspect the mirrored `.patch` and `.stat.txt`.
6. Verify before accepting any Codex changes. Report: result status, changed files, verification run, whether Claude recommends applying/iterating/rejecting.
