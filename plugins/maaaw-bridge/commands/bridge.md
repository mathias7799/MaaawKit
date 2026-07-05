---
description: Delegate a bounded task to another agent CLI (Codex, Gemini, …) via the MaaawKit bridge — isolated worktrees for write modes, structured results, guard-checked
argument-hint: '"<task>" [--agent codex] [--mode review-only|security-pass|implementation-worktree|test-fix|backend-task] [--oracle "<cmd>"] [--run|--background]'
---
Read the agent-bridge skill, then delegate this task through the bridge engine: $ARGUMENTS

1. If no agent was specified, run `maaaw bridge detect` and pick the best available one (prefer codex for code tasks).
2. Prepare the job with `maaaw bridge run` (add `--oracle` when a verification command exists — check `.agent/kit.json`).
3. Show me the prepared command and job id. Execute only if I asked for `--run`/`--background` or clearly want immediate execution.
4. When the job completes, fetch `maaaw bridge result <id>`, review the output critically (worker results are input, not truth), and summarize: status, what changed, oracle verdict, and what needs my decision.
