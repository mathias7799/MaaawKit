---
description: Send the current diff to a second model via the bridge for an independent blind review, then adjudicate the findings
argument-hint: '[git ref or blank for working tree] [--agent codex|gemini|...]'
---
Read the cross-review skill, then get a second model's review of: $ARGUMENTS (blank = working tree diff).

1. Pick the reviewer (`maaaw bridge detect`; prefer a different model family than this session).
2. Delegate blind per the skill: `maaaw bridge run --agent <a> --mode review-only --task "<diff scope + requirements, no self-assessment>" --run`.
3. Adjudicate each finding against the actual code: confirmed / refuted-with-evidence / needs-user. Never average disagreements — investigate them.
4. Report the verdict table, apply confirmed fixes I approve, and /learn any durable failure-pattern.
Next: /loop if fixes need an oracle, /handoff when done.
