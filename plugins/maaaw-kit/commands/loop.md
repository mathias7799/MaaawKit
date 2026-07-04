---
description: Start an oracle-driven verification loop (Claude cannot stop until the oracle passes or budget runs out)
argument-hint: '"<goal>" --oracle "<command>" [--max <n>] [--timeout <seconds>]'
---
Read the verification-loop skill, then start a hook-enforced loop for: $ARGUMENTS

1. Parse: goal, `--oracle` (exit code 0 == done), `--max` budget (default 10), `--timeout` per oracle run in seconds (default 600; raise for slow suites).
2. If no oracle given, determine it from the repo (e.g. `dotnet test`, `npm run build && npm test`, `uv run pytest -q`, `Invoke-Pester -CI`) and state your choice.
3. Run the oracle once for the baseline. Already passing → nothing to loop on; stop.
4. Write `.claude/loop.json` — the `trusted` flag is REQUIRED (the Stop hook refuses untrusted or git-tracked loop files as a security gate):
```json
{"trusted": true, "oracle": "<command>", "max_iterations": <n>, "timeout_seconds": <t>, "iteration": 0, "goal": "<goal>"}
```
5. Ensure `.claude/loop.json` is NOT committed (add to .gitignore if needed — a tracked loop file gets refused by design).
6. Work per the verification-loop skill: one failure per iteration, commit each improvement, never weaken tests. The hook feeds failures back on every stop attempt and flags 3-in-a-row identical failures as a stall (then re-plan, don't patch).

Cancel anytime: delete `.claude/loop.json`.
