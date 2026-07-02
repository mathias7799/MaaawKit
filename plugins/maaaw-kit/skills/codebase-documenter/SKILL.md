---
name: codebase-documenter
description: Generate or refresh documentation for an existing codebase — README, architecture overview, CLAUDE.md, onboarding guide, module docs, ADRs. Use when the user asks to document a repo, write/update a README, explain the architecture, create onboarding docs, "make this understandable", or when inheriting an undocumented codebase.
---

# Codebase Documenter

Documentation derived from reading real code, verified by running real commands. Docs written from assumption are worse than no docs — they're confidently wrong. The second law: document for a reader, not for completeness; every doc has ONE audience and answers THEIR questions.

## Step 0 — Pick the deliverable (ask if ambiguous)
| Audience | Deliverable |
|---|---|
| New dev, day one | README + getting-started |
| Team, ongoing | ARCHITECTURE.md + module docs |
| Claude/agents | CLAUDE.md (use the kit's template) |
| Future-you re: decisions | ADRs |
Default for "document this repo": README + ARCHITECTURE.md + CLAUDE.md.

## Step 1 — Learn the repo (evidence pass)
- Map: entry points, build/test/run commands (from csproj/package.json/pyproject/scripts — then RUN them to confirm they work; a README with broken commands is the classic failure).
- Trace the ONE core flow end-to-end (request → handler → service → data → response) by reading, not guessing. This becomes the architecture doc's centerpiece.
- Collect tribal knowledge signals: weird-looking code that's load-bearing (git blame the strangest parts), env vars actually read (`git grep -h "env\." | sort -u` style per language), external services touched.
- For big repos: fan out module-mapping to subagents (orchestration skill), one module each, fixed report format.

## README.md structure (top-level, keep under ~120 lines)
```
# Name — one-line what & why
## What it does (3–6 lines, honest, no marketing)
## Quickstart (verified commands: prereqs → clone → configure → run → see it work)
## Configuration (table: var, required?, default, what it does)
## Development (test / lint / build commands, how to run one test)
## Project layout (annotated top-level tree, one line per dir, only dirs that matter)
## Deployment (or link)
```

## ARCHITECTURE.md structure
```
## System context — what talks to this and what it talks to (Mermaid diagram)
## The core flow — the traced end-to-end walkthrough with file references
## Modules — per module: responsibility (1 line), key types/files, depends-on
## Data — main entities + where stored + lifecycle
## Cross-cutting — auth, error handling, logging, config: how each actually works HERE
## Decisions & constraints — the "why is it like this" list (mined from git history + code smell-with-a-reason)
## Known debt — honest list; docs that hide the mess get distrusted entirely
```

## Code-level documentation (when asked to document code itself)
- Doc comments (XML docs / JSDoc / docstrings / comment-based help) on PUBLIC surface only: what it does, params that aren't obvious, exceptions/error returns, one example for non-trivial APIs.
- Never narrate the obvious (`// increments i`). Comments explain WHY and non-obvious constraints; the code explains what.
- Don't reformat or "improve" code while documenting — docs diffs must be docs-only.

## Rules
- **Verify every command you write down by running it.** Mark anything unverifiable: "(untested — no access to X)".
- **State uncertainty explicitly**: "appears to be dead code (no callers found via grep)" not silent omission or invented purpose.
- Freshness beats coverage: 5 accurate docs > 20 stale ones. Prefer generating from the source of truth (schema from migrations, env table from actual reads) so refresh is mechanical.
- Every doc gets a header: `<!-- Last verified: <date> against <commit short-sha> -->`.
- Mermaid for diagrams (renders on GitHub); one diagram per concept, max ~15 nodes — a diagram you can't read is decoration.
