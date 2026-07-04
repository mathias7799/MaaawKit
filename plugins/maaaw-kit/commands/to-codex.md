---
description: Export a Codex-native setup — AGENTS.md, task brief, skills, optional config/hooks
argument-hint: '[goal] [--install-skills] [--install-hooks] [--write-config] [--dry-run]'
---
Read the codex-handoff skill and execute a Codex export. Arguments: $ARGUMENTS

1. If work is mid-flight: write HANDOFF.md per the session-handoff skill and make a WIP commit.
2. Locate the maaaw-kit plugin root (directory containing this command's `commands/` folder, e.g. under `~/.claude/plugins/`), then from the repo root run `python <plugin-root>/scripts/to-codex.py` with `--goal`/`--oracle` plus any flags I passed. Default to AGENTS.md + brief only; use `--dry-run` first if AGENTS.md has substantial hand-written content.
3. Review the generated AGENTS.md (diff vs .bak): verified commands are only the supplied oracle; inferred commands still need verification; size warning absent, no temporary task content leaked in (that belongs in .codex/brief.md).
4. Report exactly what changed and my next steps for the target shell (PowerShell on Windows). If --install-hooks was used, emphasize: open Codex, run /hooks, review and trust — never for repos I don't control.
