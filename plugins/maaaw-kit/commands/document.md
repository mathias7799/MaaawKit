---
description: Generate or refresh docs for this repo (README, ARCHITECTURE.md, CLAUDE.md, module docs) from actual code
argument-hint: [readme|architecture|claude-md|all|<module path>]
---
Read the codebase-documenter skill and document: $ARGUMENTS (blank = README + ARCHITECTURE.md + CLAUDE.md).
Learn the repo first (run the build/test commands to verify them), trace the core flow by reading real code, fan out to subagents for large repos. Every command in the docs must be one you actually ran. Docs-only diffs.
