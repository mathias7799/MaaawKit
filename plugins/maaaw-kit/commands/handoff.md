---
description: Write a structured cross-agent handoff (.agent/handoff/) capturing state + relevant memory so the next session — of any agent — resumes in 2 minutes
argument-hint: '[blank, or extra notes] [--to codex|gemini|...]'
---
Read the session-handoff skill and write the handoff for the current task. Extra notes to include: $ARGUMENTS

1. Distill: goal + oracle, DONE-with-evidence, the precise IN PROGRESS next action (file:line), decisions made (do not re-litigate), landmines, hypotheses-already-tried if mid-debug.
2. Write it via `maaaw handoff write --goal "<goal>" --status "<status incl. next action>" --decisions "a;b" --next "x;y" [--verification "<oracle>"] [--to <agent>]` — the engine attaches the top path-relevant memory records automatically and mirrors to handoff.json.
3. If handing to another agent, also run `maaaw rules sync` so their AGENTS.md/GEMINI.md guidance is current.
4. Make a WIP commit referencing the handoff. Keep the whole thing under a page.
