---
description: Show what maaaw-kit provides and how to use it (skills, commands, agents, hooks)
---
Give a compact orientation to the maaaw-kit plugin, from its own files (list the skills/, commands/, agents/ directories under the maaaw-kit plugin root — locate it via the installed plugin paths — and read frontmatter descriptions — do not invent):

- One line per slash command (name — what it does)
- One line per skill and when it auto-triggers
- One line per agent
- The four hooks and what they enforce (guard / post-edit lint / stop-verify loop / session-context)
- The workflow chains: /prd → /grill → /plan → /loop → /review or /quick-audit → /handoff or /bridge (cross-review skill for second opinions)

Keep it under one screen. End with: "run `maaaw doctor --hooks` to verify hooks on this machine."
