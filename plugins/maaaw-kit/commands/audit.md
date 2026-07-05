---
description: Full evidence-based codebase audit (security, correctness, architecture, deps, tests) with prioritized report
argument-hint: '[path or blank for repo root] [focus: security|quality|all]'
---
Read the codebase-audit skill and run a full audit of: $ARGUMENTS (blank = current repo, focus all). Honor `dials.auditDepth`/`dials.paranoia` from `.agent/kit.json` unless my words override them.
Confirm the audit's purpose with me if not obvious, parallelize phases with subagents where the repo size justifies it (orchestration skill), and produce the report in the skill's exact format. Save it to AUDIT.md.
Next: /loop with the top finding as goal, /bridge for a second-model security pass, or /learn to capture durable findings into memory.
