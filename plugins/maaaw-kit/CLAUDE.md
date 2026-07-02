# CLAUDE.md — project instructions (template: edit the marked sections per repo)

## Ground rules
- Plan before non-trivial work (3+ files / new feature / migration): use the deep-thinking skill. Small fixes: just do them.
- Never claim something works without running the verification command and seeing it pass in this session.
- Match this repo's existing patterns over your own preferences. Read neighboring code before writing new code.
- Small, reviewable diffs. Commit at every green state during longer tasks.
- If a linter/type-checker/test blocks you, fix the cause. Never disable rules, skip tests, or loosen assertions without asking me first.
- When stuck after 3 attempts on the same failure: stop, summarize what you tried, and re-plan instead of continuing to patch.
- Ask me before: destructive git operations, schema migrations, deleting files, adding new dependencies.

## Verification commands  <!-- EDIT PER REPO -->
- Build: `dotnet build -warnaserror`            <!-- or: npm run build / uv run mypy src -->
- Test:  `dotnet test`                          <!-- or: npm test / uv run pytest -q / Invoke-Pester -->
- Lint:  `dotnet format --verify-no-changes`    <!-- or: npm run lint / ruff check . / Invoke-ScriptAnalyzer -Path . -Recurse -->

Definition of done: build + test + lint all pass, diff contains only intended changes, new behavior has a test.

## Project context  <!-- EDIT PER REPO -->
- What this is: <one line>
- Stack: <.NET 8 API / Next.js 15 app / PowerShell module / Python service>
- Entry points: <paths>
- Where tests live: <path>
- Things that look wrong but are intentional: <list, saves you from "helpful" refactors>

## Memory
- Project memory lives in `.claude/memory/` (lessons/decisions/repo-map) and is injected each session.
- Capture lessons proactively per the memory-and-learning skill; treat NEVER/RULE entries as binding.
- Promoted rules land here in CLAUDE.md — this file is law, memory is precedent.

## Language notes
- Read the coding-standards skill reference for whichever language you're writing before writing it.
- PowerShell: PS 7+, `Set-StrictMode -Version Latest`, `$ErrorActionPreference='Stop'` in every script.
- C#: nullable enabled, warnings are errors.
- TS: strict, no `any`, no `as`-casts to silence errors.
- Python: typed public signatures, ruff clean.
