---
description: Rigorous review of uncommitted changes (or a given ref) using the code-reviewer agent
argument-hint: [git ref or blank for working tree]
---
Use the code-reviewer agent to review: $ARGUMENTS (if blank: all uncommitted changes — `git diff HEAD` plus untracked files).

Give the agent full context and require its structured report. Then triage its findings for me: must-fix vs nice-to-have, and fix the must-fix items unless they need a product decision.

Next: /cross-review for a second model's blind pass on the same diff, or /handoff.
