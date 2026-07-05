---
description: Compile .agent/rules.md + repo facts + promoted memory into every agent's instruction file (AGENTS.md, CLAUDE.md, cursor, copilot, GEMINI, windsurf)
argument-hint: '[blank = sync installed | --all | --tools agentsmd,claude,...]'
---
Read the rules-sync skill, then: $ARGUMENTS (blank = `maaaw rules sync`).

1. If `.agent/rules.md` doesn't exist yet, propose its initial content from CLAUDE.md/verified commands and write it after I approve.
2. Run the sync (`maaaw rules sync`, or `maaaw install --all`/`--tools ...` if I asked for placement into new tools) and show me what changed per tool.
3. Check `maaaw doctor` for remaining drift and surface any AGENTS.md budget warning.
Next: /handoff if another agent takes over, or /memory promote to move earned lessons into the rules first.
