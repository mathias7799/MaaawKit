---
name: rules-sync
description: Keep every agent's instruction file (AGENTS.md, CLAUDE.md, .cursor/rules, copilot-instructions, GEMINI.md, .windsurfrules) compiled from ONE canonical source — .agent/rules.md + detected repo facts + promoted memory. Use when the user asks to sync/update agent files, set up a repo for multiple agents, or when doctor reports rules drift.
---

# Rules sync — one constitution, many dialects

Hand-maintaining six instruction files guarantees drift. The canonical model
lives in `.agent/rules.md` (human rules + memory promotions) plus detected
repo facts; converters compile it into every tool's native format.

## The flow

```
.agent/rules.md  ──┐
detected stacks &  ├─→ canonical model ─→ AGENTS.md · CLAUDE.md · .cursor/rules/maaaw.mdc
verified commands ─┤                      .github/copilot-instructions.md · GEMINI.md · .windsurfrules
memory (digest +  ─┘
 promoted records)
```

- `maaaw rules sync` — re-render and refresh everything already installed.
- `maaaw install [--tools a,b | --all]` — place artifacts into (detected)
  tools; `maaaw convert` previews without writing.
- `maaaw doctor` — reports per-tool drift (in-sync / drifted / missing-markers).

## What's managed vs yours

Only the marker-delimited block (`maaaw-kit:start…end`) is rewritten; text
outside it is preserved byte-for-byte, and the first touch of any file leaves
a `.bak`. Write repo-specific law in `.agent/rules.md` — it flows everywhere.
Never hand-edit inside the markers; the next sync overwrites it.

## When to run
- After editing `.agent/rules.md` or promoting memory (`maaaw memory promote`).
- Before any handoff or bridge delegation to a non-Claude agent.
- When doctor warns about drift.
- After `/kit-setup` detects new stacks or a changed oracle.

## Rules
- The canonical source is `.agent/rules.md` — treat edits to generated files
  as bugs; move the content upstream instead.
- Keep AGENTS.md under its 24KB budget (the engine warns): promote less,
  curate memory, keep rules terse.
- Generated guidance is repo-truth, not policy: coding standards live in the
  coding-standards skill; rules.md is for THIS repo's law.
