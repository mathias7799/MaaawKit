---
description: Review, consolidate, and promote the project memory (.agent/memory/ records)
argument-hint: '[blank = review | consolidate | promote | recall "<query>"]'
---
Read the memory-and-learning skill, then: $ARGUMENTS (blank = full review).

Review: run `maaaw memory review` and `maaaw memory list`, summarize the state (active/stale counts, digest cost from `maaaw doctor`), and walk me through the triage — for each stale record propose confirm or archive; apply what I approve.
Consolidate: run `maaaw memory consolidate` and report what merged.
Promote: run `maaaw memory review`, show the promotion candidates, and `maaaw memory promote <id>` the ones I confirm — they land in `.agent/rules.md` and flow to other agents on the next `maaaw convert`.
Recall: run `maaaw memory recall "<query>"` and use what comes back.
